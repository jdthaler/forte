// pyrophone-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/pyrophone): PyrophoneWasmEngine, with the engine contract, and the model's
// functions for the page and its views. The page runs it when it can and falls back to the
// JavaScript (pyrophone-engine.js).

import { GROUPS } from './pyrophone-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'pyrophone', name: 'PyrophoneWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/pyrophone.wasm', import.meta.url).href };

const N = 10, H = 12, NX = 2 * H + 1, TRAIL = 512;

// The C++ engine's messages (pyrophone-engine.h, msg) back into the JavaScript engine's 'tubes':
// every tube's operating point, and the focused tube's strobed snapshot and mode-1 trail (a ring
// kept here, which the engine sends as it fills).
function views(m, e) {
  const s = (e.views ??= { pts: [], trail: new Float32Array(TRAIL), focus: null });
  const v = m.values;
  switch (m.type) {
    case 1: s.pts.push([m.key, v[0], v[1], v[2], v[3], v[4]]); return null; // a tube
    case 2: { // the trail
      const at = v[0];
      for (let i = 1; i < v.length; i++) s.trail[(at + i - 1) % TRAIL] = v[i];
      return null;
    }
    case 3: // the focused tube
      s.focus = {
        key: m.key, W: v[0], beta: v[1], amp: v[2], theta: v[3], T: v[4], cents: v[5], period: v[6],
        trail: s.trail, ti: v[7], snap: v[8] > 0 ? v.slice(9, 9 + 2 * N) : null,
      };
      return null;
    case 4: { // the report's end
      const msg = { type: 'tubes', pts: s.pts };
      if (s.focus) msg.focus = s.focus;
      s.pts = []; s.focus = null;
      return msg;
    }
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the JavaScript engine's test hooks: e.voices, each tube's state read live from
// the engine (as a test holding a JavaScript voice sees it change), its one-step matrices and modes
// as views. It takes the page's tuning table with the parameters (P.tune, as the JavaScript engine
// does) or ahead of them, computed by the page's WebAssembly model, so that the audio thread needn't.
const VOICE = ['key', 'amp', 'amp2', 'W', 'h', 'beta', 'betaT', 'theta', 'keyDown', 'song', 'fade', 'peak', 'since', 'age', 'rel'];
const ARRAYS = ['m11', 'm12', 'm21', 'm22', 'b1', 'eta', 'vel'];
function tubeView(x, p) {
  const v = {}, read = (j) => { const s = scratch(x); x.pyrophone_voice_state(p, s.at); return s.f64(VOICE.length)[j]; };
  VOICE.forEach((k, j) => Object.defineProperty(v, k, { enumerable: true, get: k === 'keyDown' ? () => read(j) > 0 : () => read(j) }));
  ARRAYS.forEach((k, j) => Object.defineProperty(v, k, { enumerable: true, get: () => new Float64Array(x.memory.buffer, x.pyrophone_voice_array(p, j), N) }));
  return v;
}
export class PyrophoneWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  setParams(P) {
    if (P.tune) this.offer(P.tune);
    super.setParams(P);
  }
  // { type: 'tune', tune }: the page's table, sent ahead of the parameters it is for (the worklet
  // gives a WebAssembly engine the parameters without it)
  handle(m) { if (m.type === 'tune') this.offer(m.tune); else super.handle(m); }
  offer(t) {
    if (t === this.offered) return;
    this.offered = t;
    const x = Base.exports, s = scratch(x), a = packTune(t);
    if (!a) return;
    s.f64(a.length).set(a);
    x.pyrophone_offer(this.e, s.at, a.length);
  }
  get voices() {
    const x = Base.exports;
    return Array.from({ length: x.pyrophone_voices(this.e) }, (_, i) => tubeView(x, x.pyrophone_voice(this.e, i)));
  }
}
export const ready = () => PyrophoneWasmEngine.ready();

// A tuning table packed for the engine (PyrophoneEngine::offer): the tube (bore, damping, x_f,
// lag), β_H, β_max, mode, fold, b0, db, W. A table carries its tube as P.
function packTune(t) {
  if (!t || !t.P || !t.Ws) return null;
  return [t.P.bore, t.P.damp, t.P.xf, t.P.lag, t.betaH, t.betaMax, t.mode, t.fold ?? NaN, t.b0, t.db, ...t.Ws];
}

// The model's functions the page and its views call (pyrophone-model.js's tube, bifurcation,
// tuning, root, orbitAt, orbitSpectrum, steadyY, heat, and the views' orbitState), computed by the
// WebAssembly. tubeTuning(P) is the descriptor's: { bif, tune } for the tube's parameters, kept
// for the last tube.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const tubeArgs = (P) => [P.bore, P.damp ?? 1, P.xf, P.lag];
  const point = (a, k) => {
    const p = { A: a[k], beta: a[k + 1], W: a[k + 2], U0: a[k + 3], y: a[k + 4], stable: a[k + 5] > 0 };
    p.x = Array.from(a.subarray(k + 6, k + 6 + NX));
    p.Hq = Array.from({ length: H + 1 }, (_, h) => [a[k + 6 + NX + 2 * h], a[k + 7 + NX + 2 * h]]);
    return p;
  };
  const PT = 6 + NX + 2 * (H + 1);
  function tube(P) {
    const n = x.pyrophone_tube(...tubeArgs(P), s.at), a = s.f64(n).slice(), take = (i) => Array.from(a.subarray(1 + i * N, 1 + (i + 1) * N));
    return { N: a[0], w: take(0), zeta: take(1), cf: take(2), g: take(3), tau: a[1 + 4 * N], xf: a[2 + 4 * N], c1: a[3 + 4 * N], c2: a[4 + 4 * N], P: { bore: P.bore, damp: P.damp ?? 1, xf: P.xf, lag: P.lag } };
  }
  const key = (P) => `${P.bore}|${P.damp ?? 1}|${P.xf}|${P.lag}`;
  let last = null;
  const withHq = (pt) => { const a = s.f64(2 * (H + 1)); pt.Hq.forEach(([re, im], h) => { a[2 * h] = re; a[2 * h + 1] = im; }); return s.at; };
  const model = {
    tube,
    tubeKey: key,
    // { bif: { sys, key, fam: [mode 1, mode 2] }, tune } as bifurcation(P) and tuning(P) give them
    tubeTuning(P) {
      const k = key(P);
      if (last && last.key === k) return last;
      const n = x.pyrophone_bifurcation(...tubeArgs(P), s.at), a = s.f64(n).slice();
      const sys = tube(P);
      const tune = { key: k, P: sys.P, betaH: a[0], betaMax: a[1], mode: a[2], fold: Number.isNaN(a[3]) ? null : a[3], b0: a[4], db: a[5], Ws: Array.from(a.subarray(6, 6 + 41)) };
      let i = 6 + 41;
      const fam = [0, 1].map(() => {
        const [found, mode, hb, hW, foldFound, fb, fA, fy, np] = a.subarray(i, i + 9);
        i += 9;
        const pts = [];
        for (let j = 0; j < np; j++, i += PT) pts.push(point(a, i));
        if (!found) return null;
        return { mode, hopf: { mode, beta: hb, W: hW }, pts, H, fold: foldFound ? { beta: fb, A: fA, y: fy } : null };
      });
      last = { key: k, bif: { sys, key: k, fam }, tune };
      return last;
    },
    root(sys, m, beta) { x.pyrophone_root(...tubeArgs(sys.P), m, beta, s.at); return Array.from(s.f64(2)); },
    orbitAt(sys, fam, beta) {
      const n = x.pyrophone_orbit_at(...tubeArgs(sys.P), fam.mode - 1, beta, s.at), a = s.f64(n).slice();
      return a[0] ? { ...point(a, 1), stable: true } : null;
    },
    orbitSpectrum(sys, pt, listen) {
      const at = 8 * 2 * (H + 1);
      x.pyrophone_orbit_spectrum(...tubeArgs(sys.P), pt.W, pt.beta, withHq(pt), listen, s.at + at);
      return Array.from(s.f64(H, at));
    },
    orbitState(sys, pt, theta, eta, vel) {
      const at = 8 * 2 * (H + 1);
      x.pyrophone_orbit_state(...tubeArgs(sys.P), pt.W, pt.beta, withHq(pt), theta, s.at + at);
      const a = s.f64(2 * N, at);
      eta.set(a.subarray(0, N)); vel.set(a.subarray(N));
    },
    steadyY: (bif, beta) => x.pyrophone_steady_y(...tubeArgs(bif.sys.P), beta),
    heat: (u) => x.pyrophone_heat(u),
  };
  return model;
}

globalThis.PyrophoneWasmEngine = PyrophoneWasmEngine;
