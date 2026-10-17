// windharp-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/windharp): WindHarpWasmEngine, with the engine contract, and the model's
// functions for the views. The page runs it when it can and falls back to the JavaScript
// (windharp-engine.js).

import { GROUPS } from './windharp-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'windharp', name: 'WindHarpWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/windharp.wasm', import.meta.url).href };

const N_MAX = 16, MAX_VOICES = 12, ARRAYS = ['a', 'v', 'w', 'q', 'qv', 'e'];

// The C++ engine's messages (windharp-engine.h, msg) back into the JavaScript engine's 'harp': the
// focused string's arrays and the sounding keys come first, the summary last.
function views(m, e) {
  const s = (e.views ??= {
    type: 'harp', U: 0, Uw: 0, key: -1, N: 0, J: 0, a: new Float64Array(N_MAX), v: new Float64Array(N_MAX), w: new Float64Array(N_MAX),
    q: new Float64Array(N_MAX), qv: new Float64Array(N_MAX), e: new Float64Array(N_MAX), Om: 0, D: 0, L: 0, lock: 0, home: 0, amp: 0, voices: 0, x: 0, Uv: 0, Re: 0, course: 1,
    keys: new Float64Array(MAX_VOICES * 3 + 6), nk: 0,
  });
  const v = m.values;
  switch (m.type) {
    case 2: if (ARRAYS[m.key]) s[ARRAYS[m.key]].set(v); return null;
    case 3: s.keys.set(v.subarray(1), 3 * v[0]); return null;
    case 1: {
      const [U, Uw, voices, N, J, Om, D, L, lock, amp, home, x, Uv, Re, course, nk] = v;
      Object.assign(s, { U, Uw, voices, key: m.key, nk });
      if (m.key >= 0) Object.assign(s, { N, J, Om, D, L, lock, amp, home, x, Uv, Re, course });
      return s;
    }
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// a string's design from its flat form (windharp-web.cpp, putDesign), as windharp-model.js's
// stringDesign() has it
const DESIGN = ['key', 'D', 'L', 'T', 'm', 'ms', 'mf', 'mu', 'B', 'f0', 'N', 'n0', 'zeta', 'Re0', 'stress', 'unison', 'St0', 'fNote', 'target', 'lc', 'cents', 'gauge', 'idx', 'course'];
const DESIGN_SIZE = DESIGN.length + N_MAX;
function designOf(a) {
  const S = {};
  DESIGN.forEach((k, i) => { S[k] = a[i]; });
  S.unison = S.unison > 0;
  S.f = Float64Array.from(a.subarray(DESIGN.length, DESIGN.length + S.N));
  return S;
}

// a voice's and a string's fields (windharp-web.cpp: windharp_voice_get, windharp_string_get)
const VOICE = { key: 0, x: 1, target: 2, fading: 3, dead: 4, held: 5, pedal: 6, age: 7, env: 8, fade: 10, press: 11 };
const FLAGS = ['fading', 'dead', 'held', 'pedal'];
const STRING = { x: 2, target: 3, Om: 4, Re: 5, r: 6, Ucur: 7, home: 8 };

// One string of a voice, its state in place in the engine's memory (written as the JavaScript's).
function stringView(x, e, slot, si, owner) {
  const get = (f) => x.windharp_string_get(e, slot, si, f), N = get(0), J = get(1);
  const arr = (which, n) => new Float64Array(x.memory.buffer, x.windharp_string_array(e, slot, si, which), n);
  const st = { N, J, a: arr(0, N), v: arr(1, N), w: arr(2, N), q: arr(3, J), qv: arr(4, J), e: arr(5, J) };
  Object.defineProperty(st, 'engine', { value: owner }); // kept alive while its views are (its memory is in place)
  for (const [k, f] of Object.entries(STRING)) Object.defineProperty(st, k, { get: () => get(f), set: (val) => x.windharp_string_set(e, slot, si, f, val), enumerable: true });
  let S = null;
  Object.defineProperty(st, 'S', { get() { if (!S) { const s = scratch(x); x.windharp_string_design_of(e, slot, si, s.at); S = designOf(s.f64(DESIGN_SIZE)); } return S; }, enumerable: true });
  return st;
}
function voiceView(x, e, slot, owner) {
  const get = (f) => x.windharp_voice_get(e, slot, f);
  const strings = Array.from({ length: get(9) }, (_, si) => stringView(x, e, slot, si, owner));
  const v = { slot, strings };
  Object.defineProperty(v, 'engine', { value: owner });
  for (const [k, f] of Object.entries(VOICE)) {
    const flag = FLAGS.includes(k);
    Object.defineProperty(v, k, { get: () => (flag ? get(f) > 0 : get(f)), set: (val) => x.windharp_voice_set(e, slot, f, val), enumerable: true });
  }
  Object.defineProperty(v, 'S', { get: () => strings[0].S, enumerable: true });
  return v;
}

// Engines the tests make and drop give their memory back.
const dropped = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry((h) => Base.exports?.forte_destroy(h)) : null;

// The engine, with the JavaScript engine's test hooks: new WindHarpWasmEngine(fs, seed, { eps, noise,
// rigid }); e.voices and e.byKey (each voice's shutter and strings, their modes and wake stations in
// place, written as the JavaScript's), e.dominant(v), e.P, e.Uw, e.U and e.wind(n).
export class WindHarpWasmEngine extends Base {
  constructor(fs, seed, opts = {}) {
    super(fs);
    const x = Base.exports;
    this.e = x.forte_engine(this.h);
    this.dom = { n: 1, amp: 0 };
    if (seed !== undefined || opts.eps !== undefined || opts.noise !== undefined || opts.rigid) {
      x.windharp_configure(this.e, seed ?? 1, opts.eps ?? 0.3, opts.noise ?? 1, opts.rigid ? 1 : 0);
    }
    dropped?.register(this, this.h, this);
  }
  destroy() { dropped?.unregister(this); super.destroy(); }
  setParams(P) { this.params = P; super.setParams(P); }
  // A block longer than 128 samples in one piece (up to 512), as the JavaScript engine plays it: its
  // wind is worked out once a block, so a block's length is part of what it plays.
  process(L, R, n) {
    if (n <= 128) { super.process(L, R, n); return; }
    const x = Base.exports;
    for (let at = 0; at < n; at += 512) {
      const m = Math.min(512, n - at);
      x.windharp_process(this.e, m);
      L.set(new Float32Array(x.memory.buffer, x.windharp_left(), m), at);
      R.set(new Float32Array(x.memory.buffer, x.windharp_right(), m), at);
    }
    super.process(L, R, 0); // the messages
  }
  get P() { return this.params ?? null; }
  set P(P) { this.setParams(P); }
  get Uw() { return Base.exports.windharp_get_uw(this.e); }
  set Uw(U) { Base.exports.windharp_set_uw(this.e, U); }
  get U() { return Base.exports.windharp_get_u(this.e); }
  wind(n) { return Base.exports.windharp_wind(this.e, n); }
  get voices() {
    const x = Base.exports, e = this.e;
    return Array.from({ length: x.windharp_voices(e) }, (_, i) => voiceView(x, e, x.windharp_voice_slot(e, i), this));
  }
  get byKey() {
    const x = Base.exports, e = this.e;
    return { get: (key) => { const s = x.windharp_by_key(e, key); return s < 0 ? undefined : voiceView(x, e, s, this); } };
  }
  // the dominant mode of a string (a voice's first, if given a voice) and its amplitude
  dominant(v, out = this.dom) {
    if (v.strings) v = v.strings[0];
    let best = 0, be = -1;
    for (let m = 0; m < v.N; m++) { const e = v.v[m] * v.v[m] + v.w[m] * v.w[m] * v.a[m] * v.a[m]; if (e > be) { be = e; best = m; } }
    out.n = best + 1; out.amp = Math.sqrt(Math.max(0, be)) / v.w[best];
    return out;
  }
}
export const ready = () => WindHarpWasmEngine.ready();

// The model's functions the views call (windharp-model.js's stringDesign, courseOffsets, shedding,
// homeHarmonic, lockBand, lockedRange, lockedAmplitude, massDamping), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x), IN = 8 * DESIGN_SIZE;
  const put = (S) => { s.f64(10, IN).set(S.in); return s.at + IN; };
  const BAND = ['n', 'lo', 'hi', 'mid', 'growth', 'AM', 'sheds'];
  const band = (a) => { const b = {}; BAND.forEach((k, i) => { b[k] = a[i]; }); b.sheds = b.sheds > 0; return b; };
  const ranges = new Map();
  return {
    stringDesign(key, P, { cents = 0, gauge = 1, idx = 0, course = 1 } = {}) {
      const tuning = P.tuning === 'unison' ? 1 : 0, inp = [key, P.n0, tuning, P.unison, P.mass ?? 1, P.q ?? 500, cents, gauge, idx, course];
      s.f64(10, IN).set(inp);
      x.windharp_string_design(s.at + IN, s.at);
      const S = designOf(s.f64(DESIGN_SIZE));
      S.in = inp; // what it was made from, for the model's other functions
      return S;
    },
    courseOffsets(key) {
      const n = x.windharp_course_offsets(key, s.at), a = s.f64(4 * n);
      return Array.from({ length: n }, (_, i) => ({ idx: a[4 * i], course: a[4 * i + 1], cents: a[4 * i + 2], gauge: a[4 * i + 3] }));
    },
    shedding(U, D) {
      x.windharp_shedding(U, D, s.at);
      const a = s.f64(6);
      return { Re: a[0], St: a[1], r: a[2], fs: a[3], Om: a[4], sheds: a[5] > 0 };
    },
    homeHarmonic: (S) => x.windharp_home_harmonic(put(S)),
    lockBand: (S, n) => (x.windharp_lock_band(put(S), n, s.at) ? band(s.f64(7)) : null),
    lockedRange(S, n) {
      const id = `${S.in.join('|')}|${n}`;
      if (ranges.has(id)) return ranges.get(id);
      let out = null;
      if (x.windharp_locked_range(put(S), n, s.at)) {
        const a = s.f64(12);
        out = { ...band(a), upTo: a[7], downTo: a[8], Ymid: a[9], Yup: a[10], Ydown: a[11] };
      }
      if (ranges.size > 2000) ranges.clear();
      ranges.set(id, out);
      return out;
    },
    lockedAmplitude: (S, n, U) => x.windharp_locked_amplitude(put(S), n, U),
    massDamping: (S) => S.mu * S.zeta,
  };
}

globalThis.WindHarpWasmEngine = WindHarpWasmEngine;
