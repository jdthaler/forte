// kalimba-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/kalimba): KalimbaWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './kalimba-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'kalimba', name: 'KalimbaWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/kalimba.wasm', import.meta.url).href };
export const KalimbaWasmEngine = wasmEngine(BUILD);
export const ready = () => KalimbaWasmEngine.ready();

// The model, computed by the WebAssembly (kalimba-model.cpp):
//   beam(r): the clamped–supported–free tine with back/front ratio r: { beta: [βL…], shape(n, ξ), area(n) }
//     (ξ in units of the front length: −r the clamp, 0 the bridge, 1 the tip);
//   tine(key, P): { f1, L, a, t, mu, EI, force, depth } (SI units; the thumb's force and push at velocity 1);
//   keyModes(key, P): [{ f, sigma, amp, q }] (amp: force on the supports, N; q: the shape's weight, m);
//   staticDeflection(key, P, ξ), releaseSpectrum(f, tau), bridgeX(key);
//   box(P, cover): { fH, fp, fpSealed, fLo, fHi, open, V, plate: [f…] }; boxResponse(P, cover, key, f);
//   boxImpulse(P, cover, key, fs, n): the engine's box, struck with 1 N·s.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const putP = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; };
  const out = () => s.at + 8 * params.length;
  const read = (n) => new Float64Array(x.memory.buffer, out(), n);
  return {
    beam(r) {
      const n = x.kalimba_mode_count(r);
      return {
        beta: Array.from({ length: n }, (_, i) => x.kalimba_beta(r, i)),
        shape: (i, xi) => x.kalimba_mode_shape(r, i, xi),
        area: (i) => x.kalimba_mode_area(r, i),
      };
    },
    tine(key, P) {
      x.kalimba_tine(key, putP(P), out());
      const [f1, L, a, t, mu, EI, force, depth] = read(8);
      return { f1, L, a, t, mu, EI, force, depth };
    },
    keyModes(key, P) {
      const n = x.kalimba_key_modes(key, putP(P), out()), m = read(4 * n);
      return Array.from({ length: n }, (_, i) => ({ f: m[4 * i], sigma: m[4 * i + 1], amp: m[4 * i + 2], q: m[4 * i + 3] }));
    },
    staticDeflection: (key, P, xi) => x.kalimba_static_deflection(key, putP(P), xi),
    releaseSpectrum: (f, tau) => x.kalimba_release_spectrum(f, tau),
    bridgeX: (key) => x.kalimba_bridge_x(key),
    box(P, cover = P.cover) {
      const n = x.kalimba_box(putP(P), cover, out()), v = read(n);
      return { fH: v[0], fp: v[1], fpSealed: v[2], fLo: v[3], fHi: v[4], open: v[5] > 0, V: v[6], plate: Array.from(v.subarray(7)) };
    },
    boxResponse: (P, cover, key, f) => x.kalimba_box_response(putP(P), cover, key, f),
    boxImpulse(P, cover, key, fs, n) {
      const at = x.kalimba_box_impulse(putP(P), cover, key, fs, n);
      return Float64Array.from(new Float64Array(x.memory.buffer, at, n));
    },
  };
}

globalThis.KalimbaWasmEngine = KalimbaWasmEngine;
