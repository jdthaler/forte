// ring-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/ring): StorageRingWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './ring-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'ring', name: 'StorageRingWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/ring.wasm', import.meta.url).href };
export const StorageRingWasmEngine = wasmEngine(BUILD);
export const ready = () => StorageRingWasmEngine.ready();

// The model (ring-model.cpp), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at + 8 * params.length; };
  return {
    ringOf(key, P, pressure = 0) {
      const out = put(P);
      x.ring_ring_of(key, s.at, pressure, out);
      const [frev, fsyn, Qs, sigma, sigmaDelta, chroma, D, mu] = new Float64Array(x.memory.buffer, out, 8);
      return { frev, fsyn, Qs, sigma, sigmaDelta, chroma, D, mu };
    },
    detuning(theta, Z) {
      x.ring_detuning(theta, Z, s.at);
      const [amp, phase] = new Float64Array(x.memory.buffer, s.at, 2);
      return { amp, phase };
    },
    chromatic: (D, phiS) => x.ring_chromatic(D, phiS),
    formFactor: (n, sigma) => x.ring_form_factor(n, sigma),
    // the centroid N turns after a kick of Z σ, for key's ring under P (constant parameters)
    centroid(N, key, P, Z) {
      const out = put(P);
      x.ring_centroid(N, key, s.at, Z, out);
      const [env, xx] = new Float64Array(x.memory.buffer, out, 2);
      return { env, x: xx };
    },
  };
}

globalThis.StorageRingWasmEngine = StorageRingWasmEngine;
