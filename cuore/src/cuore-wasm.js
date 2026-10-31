// cuore-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/cuore): CuoreWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './cuore-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// The C++ engine's messages (cuore-engine.h) into the page's: 'frame', every sounding crystal's
// state (its key, the thermistor's voltage, and the electrons', crystal's and holders' temperatures).
function views(m) {
  const v = m.values, crystals = [];
  for (let i = 0; i + 4 < v.length; i += 5) crystals.push({ key: v[i], V: v[i + 1], Te: v[i + 2], Tc: v[i + 3], Tt: v[i + 4] });
  return { type: 'frame', crystals };
}

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'cuore', name: 'CuoreWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/cuore.wasm', import.meta.url).href };
export const CuoreWasmEngine = wasmEngine(BUILD, { messages: views });
export const ready = () => CuoreWasmEngine.ready();

// The model (cuore-model.cpp), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; };
  const out = () => s.at + 8 * params.length; // results go past the parameters
  const read = (at, n) => Array.from(new Float64Array(x.memory.buffer, at, n));
  const C = (i) => x.cuore_constant(i);
  return {
    constants: { R0: C(0), RL: C(1), GAMMA_E: C(2), G_EP: C(3), A_EP: C(4), C_PTFE: C(5), THETA_D: C(6), RHO: C(7), MOLAR: C(8), ADC_FULL: C(9), Q_BB: C(10), MEV: C(11) },
    // the crystal at rest: { V, Te, Tc, Tt, R, joule (W), Cc (J/K), mass (g) }
    rest(P) {
      const p = put(P), at = out(); x.cuore_rest(p, at);
      const a = read(at, 8);
      return { V: a[0], Te: a[1], Tc: a[2], Tt: a[3], R: a[4], joule: a[5], Cc: a[6], mass: a[7] };
    },
    // pulses of E MeV every `period` s (0: one) from rest, in steps of dt s: n points (at most
    // 2000), one every `stride` steps, as { V, Te, Tc, Tt } arrays
    train(P, E, period, dt, n, { sub = 4, stride = 1 } = {}) {
      const p = put(P), at = out();
      x.cuore_train(p, E, period, dt, n * stride, sub, stride, at);
      const a = new Float64Array(x.memory.buffer, at, 4 * n), r = { V: new Float64Array(n), Te: new Float64Array(n), Tc: new Float64Array(n), Tt: new Float64Array(n) };
      for (let i = 0; i < n; i++) { r.V[i] = a[4 * i]; r.Te[i] = a[4 * i + 1]; r.Tc[i] = a[4 * i + 2]; r.Tt[i] = a[4 * i + 3]; }
      return r;
    },
    capacity: (side, T) => x.cuore_capacity(side, T),
    mass: (side) => x.cuore_mass(side),
    resistance: (t0, T) => x.cuore_resistance(t0, T),
  };
}

globalThis.CuoreWasmEngine = CuoreWasmEngine;
