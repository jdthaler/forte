// steelpan-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/steelpan): SteelPanWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './steelpan-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'steelpan', name: 'SteelPanWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/steelpan.wasm', import.meta.url).href };

// The C++ engine's messages (steelpan-engine.h, Msg) as the page's 'pan' message: the last struck
// note's tuned modes and age, then every sounding note's amplitude.
function views(m, e) {
  const s = (e.views ??= { type: 'pan', focus: -1, modes: [0, 0, 0], age: 0, notes: [] });
  if (m.type === 1) { s.focus = m.key; s.modes = Array.from(m.values.subarray(0, 3)); s.age = m.values[3]; return null; }
  if (m.type !== 2) return null;
  s.notes = Array.from({ length: m.key }, (_, i) => [m.values[2 * i], m.values[2 * i + 1]]);
  const out = { ...s };
  s.focus = -1; // until the note's next message: it may have gone quiet
  return out;
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the tests' hooks on its notes: active(key), amplitude(key, p) (mode p's, in
// thicknesses), displacement(key, p) and modes(key) (how many it integrates, 0 asleep).
export class SteelPanWasmEngine extends Base {
  constructor(fs) { super(fs); this.e = Base.exports.forte_engine(this.h); }
  active(key) { return Base.exports.steelpan_active(this.e, key) > 0; }
  amplitude(key, p) { return Base.exports.steelpan_amplitude(this.e, key, p); }
  displacement(key, p) { return Base.exports.steelpan_displacement(this.e, key, p); }
  modes(key) { return Base.exports.steelpan_modes(this.e, key); }
}
export const ready = () => SteelPanWasmEngine.ready();

// The model, computed by the WebAssembly (steelpan-model.cpp): noteModes(key, P), a key's modes
// [{ f, sigma, shape, rad, i, j }], the tuned three first; strike(key, P, v), a stroke's impulse
// on each; shape(i, j, x, y); plateRatio(i, j, r); pulse(f, tau); contact(tau0, f1, v);
// skirt(key, scale); radiation(f, L); ringTime(key, t60); neighbours(key, layout) [{ key, weight }];
// and the constants kAmp, kRise, kHarden, kWindow.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at + 8 * params.length; };
  const LAYOUTS = params.find((p) => p.id === 'layout').options.map(([v]) => v);
  return {
    kAmp: x.steelpan_constant(0), kRise: x.steelpan_constant(1), kHarden: x.steelpan_constant(2), kWindow: x.steelpan_constant(3),
    noteModes(key, P, fmax = 18000) {
      const out = put(P), n = x.steelpan_note_modes(key, s.at, fmax, out), m = new Float64Array(x.memory.buffer, out, 6 * n);
      return Array.from({ length: n }, (_, i) => ({ f: m[6 * i], sigma: m[6 * i + 1], shape: m[6 * i + 2], rad: m[6 * i + 3], i: m[6 * i + 4], j: m[6 * i + 5] }));
    },
    strike(key, P, v) {
      const out = put(P), n = x.steelpan_strike(key, s.at, v, out);
      return Array.from(new Float64Array(x.memory.buffer, out, n));
    },
    shape: (i, j, u, v) => x.steelpan_shape(i, j, u, v),
    plateRatio: (i, j, r) => x.steelpan_plate_ratio(i, j, r),
    pulse: (f, tau) => x.steelpan_pulse(f, tau),
    contact: (tau0, f1, v) => x.steelpan_contact(tau0, f1, v),
    skirt: (key, scale) => x.steelpan_skirt(key, scale),
    radiation: (f, L) => x.steelpan_radiation(f, L),
    ringTime: (key, t60) => x.steelpan_ring_time(key, t60),
    neighbours(key, layout) {
      const n = x.steelpan_neighbours(key, typeof layout === 'string' ? LAYOUTS.indexOf(layout) : layout, s.at), m = s.f64(2 * n);
      return Array.from({ length: n }, (_, i) => ({ key: m[2 * i], weight: m[2 * i + 1] }));
    },
  };
}

globalThis.SteelPanWasmEngine = SteelPanWasmEngine;
