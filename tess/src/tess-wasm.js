// tess-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/tess): TessWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './tess-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'tess', name: 'TessWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/tess.wasm', import.meta.url).href };
export const TessWasmEngine = wasmEngine(BUILD);
export const ready = () => TessWasmEngine.ready();

// The model (tess-model.cpp), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; };
  const out = () => s.at + 8 * params.length; // results go past the parameters
  const read = (at, n) => Array.from(new Float64Array(x.memory.buffer, at, n));
  return {
    // a key's planet: { freq (Hz), period (s), speedup, aR, k, b, cosi, phiT, depth, u1, u2 }
    orbit(key, P) {
      const p = put(P), at = out(); x.tess_orbit(key, p, at);
      const a = read(at, 11);
      return { freq: a[0], period: a[1], speedup: a[2], aR: a[3], k: a[4], b: a[5], cosi: a[6], phiT: a[7], depth: a[8], u1: a[9], u2: a[10] };
    },
    // the share of light the key's planet blocks at each phase (0: mid-transit)
    dips(key, P, phases) { const p = put(P); return phases.map((f) => x.tess_dip(key, p, f)); },
    // the light curve's Fourier coefficients c_0..c_H
    harmonics(key, P, H) { const p = put(P), at = out(); x.tess_harmonics(key, p, H, at); return read(at, H + 1); },
    blocked: (z, k, u1, u2) => x.tess_blocked(z, k, u1, u2),
    limbDarkening: (teff) => ({ u1: x.tess_u1(teff), u2: x.tess_u2(teff) }),
    photons: (T) => x.tess_photons(T),
    noise: (T, dt) => x.tess_noise(T, dt),
  };
}

globalThis.TessWasmEngine = TessWasmEngine;
