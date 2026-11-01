// cellulophone-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/cellulophone): CellulophoneWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './cellulophone-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'cellulophone', name: 'CellulophoneWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/cellulophone.wasm', import.meta.url).href };
const Base = wasmEngine(BUILD);

const noteOf = (a) => ({ slots: a[0], octave: a[1], pc: a[2], turns: a[3], f: a[4], ideal: a[5], cents: a[6] });

// The engine, with the tests' hooks: tap (0 the output; 1 the cells' current, before the coupling
// capacitor), cents (the motor's speed now) and note(key) (the slots and pitch the engine plays).
export class CellulophoneWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  set tap(v) { Base.exports.cellulophone_set_tap(this.e, v); }
  get cents() { return Base.exports.cellulophone_cents(this.e); }
  note(key) { const x = Base.exports, s = scratch(x); x.cellulophone_engine_note(this.e, key, s.at); return noteOf(Array.from(s.f64(7))); }
}
export const ready = () => CellulophoneWasmEngine.ready();

// The model (cellulophone-model.h), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  x.cellulophone_constants(s.at);
  const [RINGS, OCTAVES, SCREENS, H_MAX, SLIT_POWER, c54, c216, c864, SELENIUM_GAMMA, SELENIUM_FAST, SELENIUM_SLOW, SELENIUM_SLOW_SHARE] = Array.from(s.f64(12));
  const screens = GROUPS.flatMap((g) => g.params).find((p) => p.id === 'screen').options.map(([id]) => id);
  const screenIndex = (v) => (typeof v === 'number' ? v : Math.max(0, screens.indexOf(v)));
  return {
    RINGS, OCTAVES, SCREENS, H_MAX, SLIT_POWER, DISC_C: [c54, c216, c864], SELENIUM_GAMMA, SELENIUM_FAST, SELENIUM_SLOW, SELENIUM_SLOW_SHARE,
    screens,
    // a key's note on a disc whose C ring has c0 slots, in the tuning of P: { slots, octave, pc, turns, f, ideal, cents }
    keyNote(key, c0, P) {
      s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id])));
      const out = s.at + 8 * params.length;
      x.cellulophone_key_note(key, c0, s.at, out);
      return noteOf(Array.from(new Float64Array(x.memory.buffer, out, 7)));
    },
    recipe(screen) { x.cellulophone_recipe(screenIndex(screen), s.at); return Array.from(s.f64(16)); },
    octaveScreen: (o) => screens[x.cellulophone_octave_screen(o)],
    // the screen's transmission as Fourier coefficients: { re, im }, n = 0..H_MAX
    screenSpectrum(screen, slit = false) {
      x.cellulophone_screen_spectrum(screenIndex(screen), slit ? 1 : 0, s.at);
      const a = Array.from(s.f64(2 * (H_MAX + 1)));
      return { re: a.slice(0, H_MAX + 1), im: a.slice(H_MAX + 1) };
    },
    slotGain: (n, a) => x.cellulophone_slot_gain(n, a),
    light: (screen, p, a, at) => x.cellulophone_light(screenIndex(screen), p, a, at),
    lightPeriod(screen, p, a, n = 256) { x.cellulophone_light_period(screenIndex(screen), p, a, n, s.at); return Array.from(s.f64(n)); },
    flicker: (hz) => x.cellulophone_flicker(hz),
    slotNoise: (o, ring, slot, which) => x.cellulophone_slot_noise(o, ring, slot, which),
  };
}

globalThis.CellulophoneWasmEngine = CellulophoneWasmEngine;
