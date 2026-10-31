// ondes-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/ondes): OndesWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './ondes-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'ondes', name: 'OndesWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/ondes.wasm', import.meta.url).href };

// The C++ engine's message (ondes-engine.h, msg) as the page's 'state': the newest voice's key,
// note (Hz), the oscillators' free-running difference Δ (Hz), the pull K (Hz), the intensity key's
// force (N) and gain, and the drift (Hz).
function state(m) {
  if (m.type !== 1) return null;
  const v = m.values;
  return { type: 'state', key: m.key, f: v[0], delta: v[1], K: v[2], F: v[3], gain: v[4], drift: v[5] };
}

const Base = wasmEngine(BUILD, { messages: state });

// The engine, with the tests' hooks: e.voices (each sounding voice's key, force, gain, note and
// difference), e.bank(which) (the springs' modes, 0, or the tam-tam's, 1: { f, sigma }) and e.drift.
export class OndesWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get voices() {
    const x = Base.exports, s = scratch(x), out = [];
    for (let i = 0; i < x.ondes_pool(); i++) {
      x.ondes_voice(this.e, i, s.at);
      const a = s.f64(7);
      if (!a[0]) continue;
      out.push({ slot: i, held: a[1] > 0, key: a[2], F: a[3], gain: a[4], f: a[5], delta: a[6] });
    }
    return out;
  }
  bank(which) {
    const x = Base.exports, s = scratch(x), n = x.ondes_bank_size(this.e, which);
    return Array.from({ length: n }, (_, k) => { x.ondes_bank_mode(this.e, which, k, s.at); const a = s.f64(2); return { f: a[0], sigma: a[1] }; });
  }
  get drift() { return Base.exports.ondes_drift(this.e); }
}
export const ready = () => OndesWasmEngine.ready();

// The model (ondes-model.h), computed by the WebAssembly: the heterodyne (beat, trim, ratio), the
// intensity key (levelDb, keyGain, keyForce), the tam-tam (plateEquation, plateModes, plateHz) and
// the springs (springOmega, springFc), with their constants.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  x.ondes_constants(s.at);
  const [F_SOFT, F_HARD, F_MAX, F_OPEN, SPRING_R, SPRING_r, BRASS_E, BRASS_RHO, GONG_H, BRONZE_E, BRONZE_RHO, BRONZE_NU, GONG_COIL, SPRINGS, PALME] = s.f64(15);
  let plate = null;
  return {
    F_SOFT, F_HARD, F_MAX, F_OPEN, SPRING_R, SPRING_r, BRASS_E, BRASS_RHO, GONG_H, BRONZE_E, BRONZE_RHO, BRONZE_NU, GONG_COIL, SPRINGS, PALME,
    springLengths: Array.from({ length: SPRINGS }, (_, j) => x.ondes_spring_length(j)),
    beat: (delta, K) => x.ondes_beat(delta, K),
    trim: (f, K) => x.ondes_trim(f, K),
    ratio: (delta, K) => x.ondes_ratio(delta, K),
    levelDb: (F) => x.ondes_level_db(F),
    keyGain: (F) => x.ondes_key_gain(F),
    keyForce: (v, after = 0) => x.ondes_key_force(v, after),
    plateEquation: (m, lam, nu = BRONZE_NU) => x.ondes_plate_equation(m, lam, nu),
    plateModes() {
      if (!plate) plate = Array.from({ length: x.ondes_plate_count() }, (_, i) => { x.ondes_plate_mode(i, s.at); const a = s.f64(3); return { m: a[0], lam: a[1], w: a[2] }; });
      return plate;
    },
    plateHz: (diameter) => x.ondes_plate_hz(diameter),
    springOmega: (k) => x.ondes_spring_omega(k),
    springFc: () => x.ondes_spring_fc(),
  };
}

globalThis.OndesWasmEngine = OndesWasmEngine;
