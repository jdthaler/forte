// organ-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/organ): OrganWasmEngine, with the engine contract, and the model's functions
// for the views and the tests.

import { GROUPS, DEFAULTS, CONSOLE } from './organ-params.js';
import { DRAWBARS } from './tonewheels.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'organ', name: 'OrganWasmEngine', groups: GROUPS, console: CONSOLE, binary: () => new URL('../wasm/organ.wasm', import.meta.url).href };

// The C++ engine's messages (organ-engine.h, msg) for the page: its state for the views, every
// 768 samples, and the reset after a blow-up.
const STATE = ['shaft', 'hornAng', 'hornHz', 'drumAng', 'drumHz', 'scanPos', 'lcN', 'percEnv'];
function messages(m) {
  if (m.type === 1) return { type: 'state', ...Object.fromEntries(STATE.map((k, i) => [k, m.values[i]])) };
  if (m.type === 2) return { type: 'error', message: 'numerical instability — signal path reset' };
  return null;
}

const Base = wasmEngine(BUILD, { messages });

// The engine, with the fields the tests read: p (the parameters it was given, over its
// defaults), hornHz and drumHz (which a test may set), percEnv, peak, keys and keyArr.
const HOOK = ['hornHz', 'drumHz', 'percEnv', 'peak', 'keyArr', 'keys', 'speed', 'hornAng', 'drumAng', 'scanPos'];
export class OrganWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
    this.p = { ...DEFAULTS, drawbars: [...DEFAULTS.drawbars] };
  }
  setParams(P) {
    Object.assign(this.p, P);
    if (P.drawbars) this.p.drawbars = [...P.drawbars];
    super.setParams(P);
  }
  // velocity 0..1 (the computer keys play 100)
  noteOn(key, velocity = 100 / 127) { super.noteOn(key, velocity); }
  state() {
    const x = Base.exports, s = scratch(x);
    x.organ_state(this.e, s.at);
    return s.f64(HOOK.length);
  }
  get hornHz() { return this.state()[0]; }
  set hornHz(v) { Base.exports.organ_set_rotors(this.e, v, this.drumHz); }
  get drumHz() { return this.state()[1]; }
  set drumHz(v) { Base.exports.organ_set_rotors(this.e, this.hornHz, v); }
  get percEnv() { return this.state()[2]; }
  get peak() { return this.state()[3]; }
  get keyArr() { return { length: this.state()[4] }; }
  get keys() { return { size: this.state()[5] }; }
  get speed() { return this.state()[6]; }
}
export const ready = () => OrganWasmEngine.ready();

// The model (organ-model.h), computed by the WebAssembly: gearFreq(w), etFreq(w) and centsOff(w), a
// wheel's frequency on its gears, in equal temperament and between them; wheelSpec(w) { pc, octave,
// teeth, gear }; keyWheel(key, d) and percWheel(key, third), the wheel a drawbar or the percussion
// taps; drawbarGain(n); keyAnalysis(key, P), the nine tones a key sounds against the harmonic
// series; leslieGeometry(p) { wall, micDist }, the cabinet's rear wall and the microphones' distance.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const TUNING = { gears: 0, et: 1, harmonic: 2 };
  return {
    gearFreq: (w) => x.organ_gear_freq(w),
    etFreq: (w) => x.organ_et_freq(w),
    centsOff: (w) => x.organ_cents_off(w),
    keyWheel: (key, d) => x.organ_key_wheel(key, d),
    percWheel: (key, third) => x.organ_perc_wheel(key, third ? 1 : 0),
    drawbarGain: (n) => x.organ_drawbar_gain(n),
    wheelSpec(w) {
      x.organ_wheel_spec(w, s.at);
      const [pc, octave, teeth, driving, driven] = s.f64(5);
      return { w, pc, octave, teeth, gear: [driving, driven] };
    },
    keyAnalysis(key, P) {
      x.organ_key_analysis(key, TUNING[P.tuning] ?? 0, P.mains, s.at);
      const a = s.f64(45);
      return DRAWBARS.map(({ name }, d) => ({ d, name, w: a[5 * d], actual: a[5 * d + 1], ideal: a[5 * d + 2], cents: a[5 * d + 3], folded: a[5 * d + 4] > 0 }));
    },
    leslieGeometry(p) {
      x.organ_leslie_geometry(p.hornRadius, p.micDist, s.at);
      const [wall, micDist] = s.f64(2);
      return { wall, micDist };
    },
  };
}

globalThis.OrganWasmEngine = OrganWasmEngine;
