// dunes-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/dunes): DunesWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './dunes-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'dunes', name: 'DunesWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/dunes.wasm', import.meta.url).href };

// The C++ engine's message (dunes-engine.h, msg::state): the focused key's grains, for the views.
function messages(m) {
  if (m.type !== 1) return null;
  const v = m.values, n = v[4];
  return { type: 'state', key: m.key, R: v[0], drive: v[1], U: v[2], onset: v[3], phases: Array.from(v.subarray(5, 5 + n)) };
}

const Base = wasmEngine(BUILD, { messages });

const VOICE = ['on', 'layer', 'U', 'drive', 'R', 'patches', 'modes', 'f0'];
// The engine, with the tests' hook: voice(key), that key's avalanche ({ on, layer, U, drive, R, patches, modes, f0 }).
export class DunesWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  voice(key) {
    const x = Base.exports, s = scratch(x);
    x.dunes_voice(this.e, key, s.at);
    const a = s.f64(VOICE.length);
    return Object.fromEntries(VOICE.map((k, i) => [k, i === 0 ? a[i] > 0 : a[i]]));
  }
}
export const ready = () => DunesWasmEngine.ready();

// The model (dunes-model.h), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  x.dunes_constants(s.at);
  const c = Array.from(s.f64(18));
  const [G, SHEAR, U_ONSET, SORTING_REF, NOISE, CAVITY_Q, WATER_E, C1, C2, MAX_GRAINS, LAYER_MODES] = c;
  return {
    G, SHEAR, U_ONSET, SORTING_REF, NOISE, CAVITY_Q, WATER_E, C1, C2, MAX_GRAINS, LAYER_MODES,
    WENTWORTH: c.slice(11, 18),
    grainDiameter: (f) => x.dunes_grain_diameter(f),
    shearFreq: (d) => x.dunes_shear_freq(d),
    wentworth: (d) => x.dunes_wentworth(d),
    layerDepth: (f) => x.dunes_layer_depth(f),
    layerMode: (n, H) => x.dunes_layer_mode(n, H),
    freqSpread: (phi) => x.dunes_freq_spread(phi),
    criticalCoupling: (sp, D) => x.dunes_critical_coupling(sp, D),
    coupling: (U, water) => x.dunes_coupling(U, water),
    onsetSpeed: (phi, water) => x.dunes_onset_speed(phi, water),
    pulseHarmonic: (n, contact) => x.dunes_pulse_harmonic(n, contact),
    invNormal: (p) => x.dunes_inv_normal(p),
    simulateR: (n, sp, K, D, f0, seconds, fs = 48000, seed = 1) => x.dunes_simulate_r(n, sp, K, D, f0, seconds, fs, seed),
  };
}

globalThis.DunesWasmEngine = DunesWasmEngine;
