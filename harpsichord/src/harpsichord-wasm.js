// harpsichord-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/harpsichord): HarpsichordWasmEngine, with the engine contract, and the model's
// functions for the views. The page runs it when it can and falls back to the JavaScript
// (harpsichord-engine.js).

import { GROUPS } from './harpsichord-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'harpsichord', name: 'HarpsichordWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/harpsichord.wasm', import.meta.url).href };
const CHOIRS = ['front', 'back', 'four'], ROWS = ['front', 'back', 'four', 'lute'], PHASES = ['off', 'under', 'above'];

// The C++ engine's messages (harpsichord-engine.h, msg) back into the JavaScript engine's: 'pluck'
// (a plectrum letting go; one object, reused, as the JavaScript reuses it) and 'error'.
function views(m, e) {
  const v = m.values;
  if (m.type === 2) return { type: 'error', key: m.key, message: 'numerical instability' };
  if (m.type !== 1) return null;
  const p = (e.pluckMsg ??= { type: 'pluck', key: 0, choir: '', lute: false, F: 0, u: 0, w: 0, s: 0, theta: 0, x: 0 });
  p.key = m.key; p.choir = CHOIRS[v[0]]; p.lute = v[1] > 0;
  p.F = v[2]; p.u = v[3]; p.w = v[4]; p.s = v[5]; p.theta = v[6]; p.x = v[7];
  e.lastPluck = p;
  return p;
}

// (messages are read here rather than by wasm.js, so that the tests' listeners hear them too)
const Base = wasmEngine(BUILD);

// The engine, with the JavaScript engine's test hooks: e.listeners (functions called with each
// message), e.voices (each key's voice: key, killing, dead, sounded, keyDown, pending, vDown, lift,
// peak and its strings' plectra) and e.byKey, read back.
const VOICE = ['key', 'killing', 'dead', 'sounded', 'keyDown', 'pending', 'vDown', 'lift', 'peak', 'own'];
const FLAGS = new Set(['killing', 'dead', 'sounded', 'keyDown', 'pending', 'own']);
export class HarpsichordWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
    this.listeners = [];
    this.lastPluck = null;
  }
  process(L, R, n) {
    super.process(L, R, n);
    const x = Base.exports;
    for (let p; (p = x.forte_message(this.h));) {
      const v = new DataView(x.memory.buffer, p, 128);
      const count = v.getUint16(4, true), values = new Float32Array(x.memory.buffer, p + 8, count).slice();
      const m = views({ type: v.getUint16(0, true), key: v.getInt16(2, true), values }, this);
      if (!m) continue;
      if (this.post) this.post(m);
      for (const f of this.listeners) f(m);
    }
  }
  get voices() {
    const x = Base.exports, s = scratch(x), out = s.f64(VOICE.length + 9);
    return Array.from({ length: x.harpsichord_voices(this.e) }, (_, i) => {
      x.harpsichord_voice(this.e, i, s.at);
      const v = Object.fromEntries(VOICE.map((k, j) => [k, FLAGS.has(k) ? out[j] > 0 : out[j]]));
      v.strings = Object.fromEntries(CHOIRS.map((c, j) => {
        const a = VOICE.length + 3 * j;
        return [c, out[a] > 0 ? { phase: [PHASES[out[a + 1]], PHASES[out[a + 2]]] } : null];
      }));
      return v;
    });
  }
  get byKey() { return new Map(this.voices.filter((v) => v.own).map((v) => [v.key, v])); }
}
export const ready = () => HarpsichordWasmEngine.ready();

// The model's functions the views call (harpsichord-model.js's registration, stringDesign,
// stringLength, isBrass, pluckPoint, stringPartials and simulatePluck; plectrum.js's beamC and
// beamG), computed by the WebAssembly.
const DESIGN = ['L', 'd', 'A', 'mu', 'EI', 'T', 'B', 'f0', 'stress', 'c', 'Z'];
const MATERIAL = ['delrin', 'quill'];
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD), at = 8 * params.length;
  const setP = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; };
  const choir = (c) => CHOIRS.indexOf(c), row = (r) => ROWS.indexOf(r);
  const beam = (pl, sAt) => { x.harpsichord_beam(pl.tau, pl.EI0, pl.len, pl.fore, sAt, s.at + at); return s.f64(3, at); };
  const model = {
    registration(P) {
      x.harpsichord_registration(setP(P), s.at + at);
      const a = s.f64(7, at);
      return { rows: ['back', 'front', 'four', 'lute'].filter((r) => a[row(r)] > 0), lift: { front: a[4] > 0, back: a[5] > 0, four: a[6] > 0 } };
    },
    stringDesign(m, c, P) {
      x.harpsichord_string_design(setP(P), m, choir(c), s.at + at);
      const a = s.f64(12, at), S = { key: m, choir: c };
      DESIGN.forEach((k, i) => { S[k] = a[i]; });
      S.mat = { name: a[11] > 0 ? 'brass' : 'iron' };
      return S;
    },
    stringLength: (m, c) => x.harpsichord_string_length(m, choir(c)),
    isBrass: (m, c) => x.harpsichord_is_brass(m, choir(c)) > 0,
    pluckPoint: (m, r, P) => x.harpsichord_pluck_point(setP(P), m, row(r)),
    stringPartials(S, P, fs = 48000) {
      const n = x.harpsichord_partials(setP(P), S.key, choir(S.choir), fs, s.at + at), a = s.f64(7 * n, at);
      const partials = Array.from({ length: n }, (_, i) => ({ n: a[7 * i], f: a[7 * i + 1], k: a[7 * i + 2], b: a[7 * i + 3], sigS: a[7 * i + 4], sigB: a[7 * i + 5], sigma: a[7 * i + 6] }));
      return { nrm: Math.sqrt(2 / (S.mu * S.L)), partials };
    },
    // the slow-motion pluck: its trace, the release, the plectrum and the string, as simulatePluck returns them
    simulatePluck(m, r, P, { V = 0.08 * 10 ** Math.min(Math.max(P.velocity ?? 0.7, 0), 1), fs = 48000, sec = 0.06, every = 1, until = null } = {}) {
      const n = x.harpsichord_simulate(setP(P), m, row(r), V, fs, sec, every, until ?? -1, s.at + at), o = s.f64(24, at).slice();
      const t = new Float64Array(x.memory.buffer, x.harpsichord_trace(), 8 * n);
      const col = (c) => Array.from(t.subarray(c * n, (c + 1) * n));
      const trace = { t: col(0), y: col(1), u: col(2), F: col(3), s: col(4), z: col(5), w: col(6), fb: col(7) };
      const pl = { len: o[7], overlap: o[8], s0: o[9], kTip: o[10], EI0: o[11], tau: o[12], mu: o[13], fore: o[14], material: MATERIAL[o[15]] };
      const released = o[0] >= 0 ? o[0] : null, energy = o[20];
      return {
        st: { energy: () => energy, work: o[21] }, pl, x: o[18], gap: o[19], S: { d: o[16], mat: { name: o[17] > 0 ? 'brass' : 'iron' } }, trace, released,
        rel: released === null ? null : { F: o[1], y: o[2], u: o[3], w: o[4], s: o[5], theta: o[6] },
      };
    },
    beamC: (pl, sAt) => beam(pl, sAt)[0],
    beamG: (pl, sAt) => beam(pl, sAt)[1],
  };
  return model;
}

globalThis.HarpsichordWasmEngine = HarpsichordWasmEngine;
