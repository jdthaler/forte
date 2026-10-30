// hydrogen-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/hydrogen): HydrogenWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './hydrogen-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'hydrogen', name: 'HydrogenWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/hydrogen.wasm', import.meta.url).href };

// The C++ engine's reports (hydrogen-engine.cpp report) into the page's: 'lines', the lines heard
// now as { line, power } (power summed over the keys, in the sound's units), in two parts;
// 'levels', the populations of every nl with n ≤ 7 (index n(n − 1)/2 + l), summed over the keys.
let pending = [];
function views(m) {
  const v = m.values;
  if (m.type === 0) {
    if (m.key === 0) pending = [];
    for (let i = 0; i + 1 < v.length; i += 2) pending.push({ line: v[i], power: v[i + 1] });
    return m.key === 1 ? { type: 'lines', lines: pending } : null;
  }
  if (m.type === 1) return { type: 'levels', lit: m.key === 1, pops: Array.from(v) };
  return null;
}

export const HydrogenWasmEngine = wasmEngine(BUILD, { messages: views });
export const ready = () => HydrogenWasmEngine.ready();

// The model (hydrogen-model.cpp), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; };
  const out = () => s.at + 8 * params.length; // results go past the parameters
  const read = (at, n) => Array.from(new Float64Array(x.memory.buffer, at, n));
  const NMAX = x.hydrogen_nmax();
  const lineOf = (n, m) => ((n - 1) * (n - 2)) / 2 + (m - 1);
  const levels = (line) => { let n = 2; while (lineOf(n + 1, 1) <= line) n++; return { n, m: line - lineOf(n, 1) + 1 }; };
  return {
    NMAX,
    LINES: (NMAX * (NMAX - 1)) / 2,
    lineOf,
    levels,
    stateOf: (n, l) => (n * (n - 1)) / 2 + l,
    ratio: (n, m) => (1 / (m * m) - 1 / (n * n)) / (5 / 36),
    lineHz: (n, m) => x.hydrogen_line_hz(n, m),
    wavelength: (n, m) => x.hydrogen_wavelength(n, m),
    radial: (n, l, m, k) => x.hydrogen_radial(n, l, m, k),
    einsteinA: (n, l, m, k) => x.hydrogen_einstein_a(n, l, m, k),
    gamma: (n, l, caseB = false) => x.hydrogen_gamma(n, l, caseB ? 1 : 0),
    oscillator1s: (n) => x.hydrogen_oscillator_1s(n),
    recombination: (n, l, T) => x.hydrogen_recombination(n, l, T),
    sixj: (a, b, c, d, e, f) => x.hydrogen_sixj(a, b, c, d, e, f),
    diracShift: (n, j, scale = 1) => x.hydrogen_dirac_shift(n, j, scale),
    starkWidth: (n, m, N) => x.hydrogen_stark_width(n, m, N),
    dopplerWidth: (T) => x.hydrogen_doppler_width(T),
    // every line's steady power for P, indexed by lineOf(n, m)
    steadyLines(P) { const p = put(P), at = out(); const k = x.hydrogen_steady_lines(p, at); return read(at, k); },
    // every state's steady population for P, indexed by stateOf(n, l)
    steadyPopulations(P) { const p = put(P), at = out(); const k = x.hydrogen_steady_populations(p, at); return read(at, k); },
    // line (n, m)'s power at times ts (s, the atom's time) after the lamp is lit: { values, steady }
    step(P, n, m, ts) {
      const p = put(P), tAt = out(), at = tAt + 8 * ts.length;
      new Float64Array(x.memory.buffer, tAt, ts.length).set(ts);
      const steady = x.hydrogen_step(p, n, m, tAt, ts.length, at);
      return { values: read(at, ts.length), steady };
    },
    glowEnd(P) { return x.hydrogen_glow_end(put(P)); },
    naturalWidth(P, n, m) { return x.hydrogen_natural_width(put(P), n, m); },
    // line (n, m)'s fine-structure components for P at α × scale: [{ tj, tk, ratio, weight }]
    components(P, n, m, scale = 1) {
      const p = put(P), at = out(), k = x.hydrogen_components(p, n, m, scale, at), a = read(at, 4 * k);
      return Array.from({ length: k }, (_, i) => ({ tj: a[4 * i], tk: a[4 * i + 1], ratio: a[4 * i + 2], weight: a[4 * i + 3] }));
    },
  };
}

globalThis.HydrogenWasmEngine = HydrogenWasmEngine;
