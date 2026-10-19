// cavity-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/cavity): CavityBellsWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './cavity-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'cavity', name: 'CavityBellsWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/cavity.wasm', import.meta.url).href };

// The C++ engine's messages (cavity-engine.h) into the page's: 'cells', the accelerating
// passband's field in each cell (complex, in a full bunch's field), its peak, the detuning in
// cents and whether it is quenched; 'modes', the accelerating passband's modes' amplitudes and
// each higher passband's.
function views(m) {
  const v = m.values;
  if (m.type === 0) {
    const N = v[27];
    return { type: 'cells', key: m.key, re: Array.from({ length: N }, (_, n) => v[2 * n]), im: Array.from({ length: N }, (_, n) => v[2 * n + 1]),
      peak: v[24], detune: v[25], quenched: v[26] > 0 };
  }
  if (m.type === 1) {
    const N = v[18];
    return { type: 'modes', key: m.key, modes: Array.from(v.subarray(0, N)), bands: [0, ...Array.from(v.subarray(12, 18))] };
  }
  return null;
}

export const CavityBellsWasmEngine = wasmEngine(BUILD, { messages: views });
export const ready = () => CavityBellsWasmEngine.ready();

export const BAND_NAMES = ['TM010', 'TM011', 'TM110', 'TM111', 'TM012', 'TM020', 'TM120'];

// The model (cavity-model.cpp), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD), NV = x.cavity_mode_values();
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at + 8 * params.length; };
  const bands = Array.from({ length: x.cavity_band_count() }, (_, b) => ({ name: BAND_NAMES[b], m: x.cavity_band_m(b), j: x.cavity_band_j(b), p: x.cavity_band_p(b) }));
  return {
    bands,
    QSCALE: x.cavity_qscale(), TRAIN: x.cavity_train(), TC: x.cavity_tc(),
    // a key's modes: { band, mode, f, phase, kick: [re, im], x1, xN, invQ0, invQn, wIn, wHom, sigma }
    modes(key, P, { released = false, quenched = false } = {}) {
      const out = put(P), n = x.cavity_modes(key, s.at, released ? 1 : 0, quenched ? 1 : 0, out);
      const a = new Float64Array(x.memory.buffer, out, NV * n);
      return Array.from({ length: n }, (_, j) => {
        const r = a.subarray(NV * j, NV * j + NV);
        return { band: r[0], mode: r[1], f: r[2], phase: r[3], kick: [r[4], r[5]], x1: r[6], xN: r[7], invQ0: r[8], invQn: r[9], wIn: r[10], wHom: r[11], sigma: r[12] };
      });
    },
    modeShape: (tuned, N, mode, n) => x.cavity_mode_shape(tuned ? 1 : 0, N, mode, n),
    phaseAdvance: (tuned, N, mode) => x.cavity_phase_advance(tuned ? 1 : 0, N, mode),
    transit(p, theta) { x.cavity_transit(p, theta, s.at); const [re, im] = s.f64(2); return { re, im }; },
    surfaceResistance: (f, T) => x.cavity_surface_resistance(f, T),
    physicalFrequency: (f, fpi) => x.cavity_physical_frequency(f, fpi),
    bandRatio: (b, betag, k) => x.cavity_band_ratio(b, betag, k),
    bessel: (n, v) => x.cavity_bessel(n, v),
  };
}

globalThis.CavityBellsWasmEngine = CavityBellsWasmEngine;
