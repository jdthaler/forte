// cimbalom-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/cimbalom): CimbalomWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './cimbalom-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'cimbalom', name: 'CimbalomWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/cimbalom.wasm', import.meta.url).href };

// The C++ engine's messages (cimbalom-engine.h, msg) into the views' 'state': the focused course's
// string and hammer, the last stroke's force against time (three pieces), the level last.
function views(m, e) {
  const s = (e.views ??= { type: 'state', key: -1, L: 0, Lfar: 0, xh: 0, gap: -1, F: 0, side: 0, strings: 0, damped: false, f0: 0, ffar: 0,
    a: new Float64Array(12), b: new Float64Array(8), level: -200, peak: 0, voices: 0, peakF: 0, onTime: 0, contacts: 0, sym: 0,
    force: new Float64Array(84), forceDt: 0, forceN: 0, forceKey: -1, forceSeq: 0, shaped: false });
  const v = m.values;
  switch (m.type) {
    case 1:
      Object.assign(s, { L: v[0], Lfar: v[1], xh: v[2], gap: v[3], F: v[4], side: v[5], strings: v[26], damped: v[27] > 0, f0: v[28], ffar: v[29], shaped: true });
      s.a.set(v.subarray(6, 18)); s.b.set(v.subarray(18, 26));
      return null;
    case 2:
      s.force.set(v.subarray(2, 30), 28 * m.key);
      if (m.key === 2) { s.forceDt = v[0]; s.forceN = v[1]; s.forceSeq++; }
      return null;
    case 3:
      Object.assign(s, { key: m.key, level: v[0], peak: v[1], voices: v[2], peakF: v[3], onTime: v[4], contacts: v[5], sym: v[6] });
      if (m.key < 0) s.shaped = false;
      return s;
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the tests' hooks: e.voices (each course's strings and hammer), the sympathetic
// strings, the last stroke's force.
const VOICE = ['key', 'strings', 'nStruck', 'nFar', 'damped', 'down', 'peak', 'level', 'fade', 'strokes', 'xh', 'active', 'gap', 'hv', 'F', 'peakF', 'onTime', 'contacts', 'S', 'vs', 'mHead', 'mStick'];
export class CimbalomWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get voices() {
    const x = Base.exports, s = scratch(x);
    return Array.from({ length: x.cimbalom_voice_count(this.e) }, (_, i) => {
      x.cimbalom_voice_state(this.e, i, s.at);
      const a = s.f64(VOICE.length), o = {};
      VOICE.forEach((k, j) => { o[k] = a[j]; });
      o.damped = o.damped > 0; o.down = o.down > 0; o.active = o.active > 0;
      const n = x.cimbalom_voice_osc(this.e, i);
      // its oscillators (string after string: struck partials, then the far side's): q now, a sample ago, β
      o.q = (which = 0) => new Float64Array(x.memory.buffer, x.cimbalom_voice_q(this.e, i, which), n).slice();
      return o;
    });
  }
  get symRunning() { return Base.exports.cimbalom_sym_running(this.e); }
  symEnergy(key) { return Base.exports.cimbalom_sym_energy(this.e, key); }
  symSize(key) { return Base.exports.cimbalom_sym_size(this.e, key); }
  get history() {
    const x = Base.exports, s = scratch(x), n = x.cimbalom_history(this.e, s.at);
    return s.f64(n).slice();
  }
}
export const ready = () => CimbalomWasmEngine.ready();

// The model (cimbalom-model.h), computed by the WebAssembly.
const COURSE = ['strings', 'wound', 'side', 'L', 'Lfar', 'f0', 'ffar', 'd', 'mu', 'T', 'EI', 'B', 'Bfar', 'Z', 'stress', 'place', 'G'];
export const SIDES = ['whole', 'right', 'left'];
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at + 8 * params.length; };
  x.cimbalom_constants(s.at);
  const [KEY_MIN, KEY_MAX, N_MAX, N_FAR, STR_MAX, SYM_MODES, CIMBALOM_LO, CIMBALOM_HI, DULCIMER_LO, DULCIMER_HI, DULCIMER_TREBLE, DULCIMER_LEFT] = s.f64(12);
  return {
    KEY_MIN, KEY_MAX, N_MAX, N_FAR, STR_MAX, SYM_MODES, CIMBALOM_LO, CIMBALOM_HI, DULCIMER_LO, DULCIMER_HI, DULCIMER_TREBLE, DULCIMER_LEFT,
    SIGMA_DAMPER: x.cimbalom_sigma_damper(),
    // course(key, P): the key's strings as built and tuned
    course(key, P) {
      const out = put(P);
      x.cimbalom_course(key, s.at, out);
      const a = new Float64Array(x.memory.buffer, out, COURSE.length), o = {};
      COURSE.forEach((k, j) => { o[k] = a[j]; });
      o.wound = o.wound > 0; o.side = SIDES[o.side];
      return o;
    },
    // partials(key, P, { str, far, strike, nmax, fmax }): [{ f, k, sigma, sigB, psi, beta }]
    partials(key, P, { str = 0, far = false, strike = P.strike, nmax = 48, fmax = 20000 } = {}) {
      const out = put(P), n = x.cimbalom_partials(key, str, far ? 1 : 0, s.at, strike, nmax, fmax, out);
      const m = new Float64Array(x.memory.buffer, out, 6 * n);
      return Array.from({ length: n }, (_, i) => ({ f: m[6 * i], k: m[6 * i + 1], sigma: m[6 * i + 2], sigB: m[6 * i + 3], psi: m[6 * i + 4], beta: m[6 * i + 5] }));
    },
    detuneCents(key, str, P) { put(P); return x.cimbalom_detune_cents(key, str, s.at); },
    face(head) { x.cimbalom_face(['cotton', 'leather', 'wood'].indexOf(head), s.at); const a = s.f64(3); return { K: a[0], p: a[1], alpha: a[2] }; },
    hammerSpeed: (vel) => x.cimbalom_hammer_speed(vel),
    boardModes(build) { const n = x.cimbalom_board_modes(build === 'dulcimer' ? 1 : 0, s.at), m = s.f64(2 * n); return Array.from({ length: n }, (_, i) => ({ f: m[2 * i], sigma: m[2 * i + 1] })); },
    admittance(build, place, f) { x.cimbalom_admittance(build === 'dulcimer' ? 1 : 0, place, f, s.at); const a = s.f64(2); return { re: a[0], im: a[1] }; },
  };
}

globalThis.CimbalomWasmEngine = CimbalomWasmEngine;
