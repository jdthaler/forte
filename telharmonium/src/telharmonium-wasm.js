// telharmonium-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/telharmonium): TelharmoniumWasmEngine, with the engine contract, and the
// model's functions for the views and the tests.

import { GROUPS } from './telharmonium-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'telharmonium', name: 'TelharmoniumWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/telharmonium.wasm', import.meta.url).href };

// The C++ engine's messages (telharmonium-engine.h, msg): 'state', the shafts' speed in cents, the
// load and every bus's current (Manual I's eight, then Manual II's); 'note', a key's relay closing
// (its shaft, teeth, manual and root key) or opening.
function messages(m) {
  const v = m.values;
  if (m.type === 1) return { type: 'state', cents: v[0], load: v[1], bus: Array.from(v.subarray(2, 18)) };
  if (m.type === 2) return v[0] ? { type: 'relay', key: m.key, on: true, shaft: v[1], teeth: v[2], manual: v[3], root: v[4] } : { type: 'relay', key: m.key, on: false };
  return null;
}

const Base = wasmEngine(BUILD, { messages });

// The engine, with the tests' hooks: tap (0 the output; 1 the buses' mixed currents, Manual I left
// and II right; 2 after the lines; 3 the diaphragms' velocity), cents and load (the motor), busCount(b),
// lineTaps (the line's impulse response), and keys (each sounding key's shaft, teeth, manual, root and harmonics).
export class TelharmoniumWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  set tap(v) { Base.exports.telharmonium_set_tap(this.e, v); }
  get cents() { return Base.exports.telharmonium_cents(this.e); }
  get load() { return Base.exports.telharmonium_load(this.e); }
  busCount(b) { return Base.exports.telharmonium_bus_count(this.e, b); }
  get lineTaps() { return Base.exports.telharmonium_line_taps(this.e); }
  get keys() {
    const x = Base.exports, s = scratch(x), n = x.telharmonium_keys(this.e, s.at), a = s.f64(6 * n);
    return Array.from({ length: n }, (_, i) => ({ key: a[6 * i], shaft: a[6 * i + 1], teeth: a[6 * i + 2], manual: a[6 * i + 3], root: a[6 * i + 4], harmonics: a[6 * i + 5] }));
  }
}
export const ready = () => TelharmoniumWasmEngine.ready();

// The model (telharmonium-model.h), computed by the WebAssembly. Complex responses come as { re, im, abs }.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  x.telharmonium_constants(s.at);
  const c = Array.from(s.f64(13));
  const [HARMONICS, MANUALS, TAP_HZ, PLATE_L2, F0_THIN, F0_ARTHUR, DIAPHRAGM_A, DIAPHRAGM_H, C_AIR, MOUTH, HORN_THROAT, LINE_DELAY, LOAD_REF] = c;
  const cx = () => { const [re, im] = s.f64(2); return { re, im, abs: Math.hypot(re, im) }; };
  const kind = (k) => (k === 'open' || k === 1 ? 1 : 0);
  return {
    HARMONICS, MANUALS, TAP_HZ, PLATE_L2, F0_THIN, F0_ARTHUR, DIAPHRAGM_A, DIAPHRAGM_H, C_AIR, MOUTH, HORN_THROAT, LINE_DELAY, LOAD_REF,
    assign(key, root = -1) { x.telharmonium_assign(key, root, s.at); const [shaft, teeth] = s.f64(2); return { shaft, teeth }; },
    built: (pc) => !!x.telharmonium_built(pc),
    cShaft435: (teeth) => x.telharmonium_c_shaft_435(teeth),
    stopLevel: (k) => x.telharmonium_stop_level(k),
    busGain: (N, level, rho) => x.telharmonium_bus_gain(N, level, rho),
    plateF01: (a, h) => x.telharmonium_plate_f01(a, h),
    voicing: (f, v) => x.telharmonium_voicing(f, v),
    circuit(f, tau) { x.telharmonium_circuit(f, tau, s.at); return cx(); },
    lineExact(f, k, km) { x.telharmonium_line_exact(f, kind(k), km, s.at); return cx(); },
    receiver(f, r) { x.telharmonium_receiver(f, r === 'arthur' || r === 1 ? 1 : 0, s.at); return cx(); },
    horn(f, L) { x.telharmonium_horn(f, L, s.at); return cx(); },
  };
}

globalThis.TelharmoniumWasmEngine = TelharmoniumWasmEngine;
