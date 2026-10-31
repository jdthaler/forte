// clavichord-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/clavichord): ClavichordWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './clavichord-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'clavichord', name: 'ClavichordWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/clavichord.wasm', import.meta.url).href };

export const PHASES = ['idle', 'held', 'lifting', 'open'];

// The C++ engine's messages (clavichord-engine.h, msg) into the views' 'state': the focused course's
// shape first, the state last.
function views(m, e) {
  const s = (e.views ??= { type: 'state', key: -1, course: -1, phase: 'idle', z: 0, zv: 0, F: 0, cents: 0, L: 0, a: 0, l: 0, Tr: 1, strings: 0, peak: 0,
    q: new Float64Array(10), qd: new Float64Array(10), p: new Float64Array(4), pd: new Float64Array(4), len: 0, shapePhase: 'idle', shaped: false });
  const v = m.values;
  switch (m.type) {
    case 1:
      s.q.set(v.subarray(0, 10)); s.qd.set(v.subarray(10, 20)); s.p.set(v.subarray(20, 24)); s.pd.set(v.subarray(24, 28));
      s.len = v[28]; s.shapePhase = PHASES[v[29]] ?? 'idle'; s.shaped = true;
      return null;
    case 2:
      Object.assign(s, { phase: PHASES[v[0]] ?? 'idle', z: v[1], zv: v[2], F: v[3], cents: v[4], L: v[5], a: v[6], l: v[7], Tr: v[8], strings: v[9], peak: v[10], course: v[11], key: v[12] });
      if (s.phase === 'idle') s.shaped = false;
      return s;
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the tests' hooks: e.voices (each course's phase, tangent and tensions).
const VOICE = ['course', 'phase', 'key', 'z', 'zv', 'F', 'strings', 'N', 'M', 'J', 'T', 'T1', 'T0', 'Tref', 'peak', 'L', 'a', 'fade'];
export class ClavichordWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get voices() {
    const x = Base.exports, s = scratch(x);
    return Array.from({ length: x.clavichord_voice_count(this.e) }, (_, i) => {
      x.clavichord_voice_state(this.e, i, s.at);
      const a = s.f64(VOICE.length), o = {};
      VOICE.forEach((k, j) => { o[k] = a[j]; });
      o.phase = PHASES[o.phase];
      // string c's speaking partials: amplitudes now, a sample ago, frequencies
      o.q = (c = 0, which = 0) => new Float64Array(x.memory.buffer, x.clavichord_voice_q(this.e, i, c, which), o.N).slice();
      return o;
    });
  }
}
export const ready = () => ClavichordWasmEngine.ready();

// The model (clavichord-model.h), computed by the WebAssembly.
const COURSE = ['course', 'strings', 'keys', 'key0', 'key1', 'L', 'a', 'l', 'z', 'cents', 'centsNominal', 'listingWidth'];
const STRING = ['choir', 'brass', 'd', 'mu', 'EA', 'T0', 'Tnom', 'hnom', 'f0', 'stress', 'B', 'Z'];
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at + 8 * params.length; };
  const c = s.f64(8);
  x.clavichord_constants(s.at);
  const [KEY_LO, KEY_HI, OCTAVE_TOP, PRESS_NOM, BED, N_MAX, M_AFTER, J_OPEN] = c;
  return {
    KEY_LO, KEY_HI, OCTAVE_TOP, PRESS_NOM, BED, N_MAX, M_AFTER, J_OPEN,
    // course(key, P): the key's strings and its tangent at the touch P gives
    course(key, P) {
      const out = put(P);
      x.clavichord_course(key, s.at, out);
      const a = new Float64Array(x.memory.buffer, out, COURSE.length + 3 * STRING.length), o = {};
      COURSE.forEach((k, j) => { o[k] = a[j]; });
      o.strings = Array.from({ length: a[1] }, (_, i) => {
        const t = {};
        STRING.forEach((k, j) => { t[k] = a[COURSE.length + STRING.length * i + j]; });
        t.brass = t.brass > 0;
        return t;
      });
      return o;
    },
    cents(key, P, F) { put(P); return x.clavichord_cents(key, s.at, F); },
    restHeight(key, P, F) { put(P); return x.clavichord_rest_height(key, s.at, F); },
    // partials(key, choir, P, which): 'speaking', 'after' or 'open'; [{ f, sigma, sigB }]
    partials(key, choir, P, which = 'speaking', fs = 48000) {
      const out = put(P), n = x.clavichord_partials(key, choir, s.at, fs, ['speaking', 'after', 'open'].indexOf(which), out);
      const m = new Float64Array(x.memory.buffer, out, 3 * n);
      return Array.from({ length: n }, (_, i) => ({ f: m[3 * i], sigma: m[3 * i + 1], sigB: m[3 * i + 2] }));
    },
    courseOf: (key, fretted) => x.clavichord_course_of(key, fretted ? 1 : 0),
    tangentPoint(key, P) { put(P); return x.clavichord_tangent_point(key, s.at); },
    scaleLength: (key) => x.clavichord_scale_length(key),
    afterLength: (key) => x.clavichord_after_length(key),
    listingSigma: (beta, w, listing) => x.clavichord_listing_sigma(beta, w, listing),
    sinSin: (a, phi, b, psi, x0, x1) => x.clavichord_sin_sin(a, phi, b, psi, x0, x1),
    linSin: (p, r, b, psi, x0, x1) => x.clavichord_lin_sin(p, r, b, psi, x0, x1),
    boardModes() { const n = x.clavichord_board_modes(s.at), m = s.f64(2 * n); return Array.from({ length: n }, (_, i) => ({ f: m[2 * i], sigma: m[2 * i + 1] })); },
    admittance(key, f) { x.clavichord_admittance(key, f, s.at); const a = s.f64(2); return { re: a[0], im: a[1] }; },
  };
}

globalThis.ClavichordWasmEngine = ClavichordWasmEngine;
