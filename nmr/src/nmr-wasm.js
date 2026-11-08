// nmr-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/nmr): NmrWasmEngine, with the engine contract, and the model's functions for
// the views and the tests.

import { GROUPS } from './nmr-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'nmr', name: 'NmrWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/nmr.wasm', import.meta.url).href };

// The C++ engine's messages (nmr-engine.h) into the page's: 'strike', a key's pulse (its magnet's
// Larmor frequency in MHz and field in T, the tip angle, the magnetisation before and after, the
// signal's start as a share of a full note, the lines it plays); 'frame', every sounding sample now
// (the phase S its spins gathered from the field's spread, what an echo could bring back, what is
// heard of it now, the note's age, the magnetisation along the field); 'pulse', a π pulse and the
// samples it turned over; 'end'.
function views(m) {
  const v = m.values;
  if (m.type === 0) return { type: 'strike', key: m.key, f0MHz: v[0], B0: v[1], theta: v[2], mzBefore: v[3], mzAfter: v[4], amp: v[5], lines: v[6] };
  if (m.type === 1) {
    const voices = [];
    for (let i = 0; i + 5 < v.length; i += 6) voices.push({ key: v[i], S: v[i + 1], bound: v[i + 2], heard: v[i + 3], age: v[i + 4], mz: v[i + 5] });
    return { type: 'frame', voices };
  }
  if (m.type === 2) {
    const keys = [];
    for (let i = 0; i + 1 < v.length; i += 2) keys.push({ key: v[i], mz: v[i + 1] });
    return { type: 'pulse', keys };
  }
  if (m.type === 3) return { type: 'end', key: m.key, age: v[0] };
  return null;
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the tests' hooks: pulses (π pulses fired), pulsedAt (when the last one fired, s),
// mz(key) (a key's magnetisation along the field now) and lines(key) (the lines its sounding voice
// plays).
export class NmrWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get pulses() { return Base.exports.nmr_engine_pulses(this.e); }
  get pulsedAt() { return Base.exports.nmr_engine_pulsed_at(this.e); }
  mz(key) { return Base.exports.nmr_engine_mz(this.e, key); }
  lines(key) { return Base.exports.nmr_engine_lines(this.e, key); }
}
export const ready = () => NmrWasmEngine.ready();

const PROFILES = { lorentz: 0, gauss: 1, gradient: 2 };

// The model (nmr-model.h), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at + 8 * params.length; };
  const read = (at, n) => Array.from(new Float64Array(x.memory.buffer, at, n));
  x.nmr_constants(s.at);
  const [GAMMA_MHZ_T, STRONGEST_T, COIL_M, SAMPLES] = Array.from(s.f64(4));
  const samples = GROUPS.flatMap((g) => g.params).find((p) => p.id === 'sample').options.map(([id]) => id);
  const sampleIndex = (v) => (typeof v === 'number' ? v : Math.max(0, samples.indexOf(v)));
  const system = (at, n) => {
    const a = read(at, 5 + 2 * n);
    const lines = [];
    for (let i = 0; i < n; i++) lines.push({ f: a[5 + 2 * i], intensity: a[6 + 2 * i] });
    return { f0: a[0], B0: a[1], anchor: a[2], fAnchor: a[3], ok: a[4] > 0, lines };
  };
  // a spin system written out: [{ n, ppm }], [{ a, b, J }] → the scratch, and where the results go
  const custom = (groups, couplings) => {
    const g = s.at, c = g + 8 * 2 * groups.length;
    new Float64Array(x.memory.buffer, g, 2 * groups.length).set(groups.flatMap((q) => [q.n, q.ppm]));
    new Float64Array(x.memory.buffer, c, 3 * couplings.length).set(couplings.flatMap((q) => [q.a, q.b, q.J]));
    return [g, c, c + 8 * 3 * couplings.length];
  };
  return {
    GAMMA_MHZ_T, STRONGEST_T, COIL_M, SAMPLES, samples,
    // a sample's groups [{ n, ppm }], couplings [{ a, b, J }] and diffusion coefficient D (m²/s)
    sample(v) {
      const n = x.nmr_sample(sampleIndex(v), s.at), a = read(s.at, n);
      let i = 0;
      const groups = [], couplings = [];
      for (let g = a[i++]; g > 0; g--) { groups.push({ n: a[i], ppm: a[i + 1] }); i += 2; }
      for (let c = a[i++]; c > 0; c--) { couplings.push({ a: a[i], b: a[i + 1], J: a[i + 2] }); i += 3; }
      return { groups, couplings, D: a[i] };
    },
    larmor: (key, P) => { put(P); return x.nmr_key_larmor(key, s.at); },
    // a key's spins: { f0 (Hz), B0 (T), anchor (ppm), fAnchor (Hz), ok, lines [{ f (Hz), intensity }] }
    keySystem(key, P) { const out = put(P); return system(out, x.nmr_key_system(key, s.at, out)); },
    customSystem(groups, couplings, f0) { const [g, c, out] = custom(groups, couplings); return system(out, x.nmr_custom_system(groups.length, g, couplings.length, c, f0, out)); },
    // the coherences' signal { re, im } at t after π pulses at the times in `at`, with no spread or relaxation
    keySignal(key, P, at, t) {
      const pa = put(P), out = pa + 8 * at.length;
      new Float64Array(x.memory.buffer, pa, at.length).set(at);
      x.nmr_key_signal(key, s.at, at.length, pa, t, out);
      const [re, im] = read(out, 2);
      return { re, im };
    },
    customSignal(groups, couplings, f0, at, t) {
      const [g, c, pa] = custom(groups, couplings), out = pa + 8 * at.length;
      new Float64Array(x.memory.buffer, pa, at.length).set(at);
      x.nmr_custom_signal(groups.length, g, couplings.length, c, f0, at.length, pa, t, out);
      const [re, im] = read(out, 2);
      return { re, im };
    },
    // what is left of the signal after its spins gathered the phase S from the field's spread
    dephasing: (profile, S) => x.nmr_dephasing(typeof profile === 'number' ? profile : PROFILES[profile] ?? 0, S),
  };
}

globalThis.NmrWasmEngine = NmrWasmEngine;
