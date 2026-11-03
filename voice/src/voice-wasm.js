// voice-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/voice): VoiceWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './voice-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'voice', name: 'VoiceWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/voice.wasm', import.meta.url).href };

// The C++ engine's messages (voice-engine.h, msg) as the page's: 'state', the newest singer's
// pitch measured and aimed for (Hz), tension Q, lung pressure (cm H₂O), the glottis's two areas
// (mm²), the flow (cm³/s), the vowel, how many sing, and the jaw's opening; 'cycle', that singer's
// last whole cycle, ten samples each of the two masses' displacements (mm) and the flow (cm³/s).
function messages(m) {
  const v = m.values;
  if (m.type === 1) return { type: 'state', key: m.key, f: v[0], fT: v[1], Q: v[2], Ps: v[3], a1: v[4], a2: v[5], U: v[6], vowel: v[7], voices: v[8], jaw: v[9] };
  if (m.type === 2) return { type: 'cycle', key: m.key, x1: Array.from(v.slice(0, 10)), x2: Array.from(v.slice(10, 20)), U: Array.from(v.slice(20, 30)) };
  return null;
}

const Base = wasmEngine(BUILD, { messages });

// The engine, with the tests' hooks: e.voices (each singing voice's key, tension, aim, measured
// pitch, lung pressure, sections, vowel and jaw), e.rate (the rate the physics runs at) and
// e.learned(key) (the tension a key last ended on, over its nominal one).
export class VoiceWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get voices() {
    const x = Base.exports, s = scratch(x), out = [];
    for (let i = 0; i < x.voice_pool(); i++) {
      x.voice_voice(this.e, i, s.at);
      const a = s.f64(11);
      if (!a[0]) continue;
      out.push({ slot: i, held: a[1] > 0, key: a[2], Q: a[3], fT: a[4], f: a[5], Ps: a[6], N: a[7], vowel: a[8], stolen: a[9] > 0, jaw: a[10] });
    }
    return out;
  }
  get rate() { return Base.exports.voice_rate(this.e); }
  learned(key) { return Base.exports.voice_learned(this.e, key); }
}
export const ready = () => VoiceWasmEngine.ready();

// The model (voice-model.h), computed by the WebAssembly: the constants; the vowel table (each
// vowel's target and fitted formants, and its area function in cm²); areas(v, larynx, N, J), a
// tract's area function in m²; formants(areas, length, count), transfer(areas, length, f),
// inputReactance(areas, length, f) and jawFor(v, larynx, f, length); and folds(...), the folds
// alone into an endless tube, step by step.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  x.voice_constants(s.at);
  const [RHO, C, NU, CMH2O, M1, M2, K1, K2, KC, D1, D2, LG, SECTIONS, LARYNX, LENGTH] = s.f64(15);
  const VOWELS = Array.from({ length: x.voice_vowel_count() }, (_, i) => {
    x.voice_vowel(i, s.at);
    const a = s.f64(6 + SECTIONS);
    return { F: Array.from(a.slice(0, 3)), fitted: Array.from(a.slice(3, 6)), area: Array.from(a.slice(6)) };
  });
  const put = (areas) => { s.f64(areas.length).set(areas); return s.at; };
  const out = () => s.at + 8 * 512;
  return {
    RHO, C, NU, CMH2O, M1, M2, K1, K2, KC, D1, D2, LG, SECTIONS, LARYNX, LENGTH, VOWELS,
    areas(v, larynx, N, J = 0) {
      x.voice_areas(v, larynx, N, out(), J);
      return Array.from(new Float64Array(x.memory.buffer, out(), N));
    },
    formants(areas, length, count = 3) {
      const n = x.voice_formants(put(areas), areas.length, length, out(), count);
      return Array.from(new Float64Array(x.memory.buffer, out(), n));
    },
    transfer: (areas, length, f) => x.voice_transfer(put(areas), areas.length, length, f),
    inputReactance: (areas, length, f) => x.voice_input_reactance(put(areas), areas.length, length, f),
    jawFor: (v, larynx, f, length) => x.voice_jaw_for(v, larynx, f, length),
    radiationR: (A) => x.voice_radiation_r(A),
    radiationL: (A) => x.voice_radiation_l(A),
    folds(Q, thick, gap, Ps, Z1, dt, steps) {
      const at = out();
      x.voice_folds(Q, thick, gap, Ps, Z1, dt, steps, at);
      const a = new Float64Array(x.memory.buffer, at, 3 * steps);
      return { x1: Array.from({ length: steps }, (_, i) => a[3 * i]), x2: Array.from({ length: steps }, (_, i) => a[3 * i + 1]), U: Array.from({ length: steps }, (_, i) => a[3 * i + 2]) };
    },
  };
}

globalThis.VoiceWasmEngine = VoiceWasmEngine;
