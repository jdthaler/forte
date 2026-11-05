// saw-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/saw): SawWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './saw-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'saw', name: 'SawWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/saw.wasm', import.meta.url).href };
const NMODE = 5;

// The C++ engine's message (saw-engine.h, msg::state): the newest voice, for the views.
function messages(m) {
  if (m.type !== 1) return null;
  const v = m.values;
  if (m.count < 14) return { type: 'state', key: -1 };
  return {
    type: 'state', key: m.key, f: v[0], s: v[1], lambda: v[2], W: v[3], eps: v[4], ell: v[5], N: v[6], Nth: v[7], sticks: v[8],
    mallet: v[9] > 0, leak: v[10], sigma: v[11], voices: v[12], held: v[13] > 0,
    amps: Array.from({ length: NMODE }, (_, j) => v[14 + 2 * j]), freqs: Array.from({ length: NMODE }, (_, j) => v[15 + 2 * j]),
  };
}

const Base = wasmEngine(BUILD, { messages });

const VOICE = ['alive', 'held', 'f', 'N', 'Nth', 'sticks', 'M', 'sigma', 's', 'lambda', 'mallet'];
// The engine, with the tests' hook: voice(key), the saw on that key
// ({ alive, held, f, N, Nth, sticks, M, sigma, s, lambda, mallet, amps }).
export class SawWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  voice(key) {
    const x = Base.exports, s = scratch(x);
    x.saw_voice(this.e, key, s.at);
    const a = Array.from(s.f64(VOICE.length + NMODE));
    const o = Object.fromEntries(VOICE.map((k, i) => [k, a[i]]));
    o.alive = o.alive > 0; o.held = o.held > 0; o.mallet = o.mallet > 0;
    o.amps = a.slice(VOICE.length);
    return o;
  }
}
export const ready = () => SawWasmEngine.ready();

const PLAN = ['f', 's', 'lambda', 'W', 'h', 'bend', 'b0', 'a', 'q2', 'q3', 'eps2', 'eps3'];

// The model (saw-model.h), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; }; // a choice as its index
  const out = () => s.at + 8 * params.length;
  x.saw_constants(s.at);
  const [YOUNG, RHO, NU, C, LEN, W_HEEL, W_TOE, S_LO, S_HI, GRIP_HEEL, GRIP_TIP, X_S, BETA2, BETA3, Q_J, HAND_T60] = Array.from(s.f64(16));
  x.saw_modes(s.at);
  const mm = Array.from(s.f64(2 * NMODE + 3));
  const MODES = Array.from({ length: NMODE }, (_, j) => ({ m: mm[2 * j], n: mm[2 * j + 1] }));
  return {
    YOUNG, RHO, NU, C, LEN, W_HEEL, W_TOE, S_LO, S_HI, GRIP_HEEL, GRIP_TIP, X_S, BETA: [BETA2, BETA3], Q_J, HAND_T60,
    MODES, NMODES_Q: mm.slice(2 * NMODE),
    trapped(eps, n) { x.saw_trapped(eps, n, s.at); const a = s.f64(2); return { Omega: a[0], rms: a[1] }; },
    hermite: (n, xi) => x.saw_hermite(n, xi),
    cross: (m, u) => x.saw_cross(m, u),
    plateA: (h) => x.saw_plate_a(h),
    widthAt: (z) => W_HEEL + (W_TOE - W_HEEL) * z,
    noteAt: (P, z) => x.saw_note_at(put(P), z),
    plan(f, P) {
      const o = out(), n = x.saw_plan(f, put(P), o), a = Array.from(new Float64Array(x.memory.buffer, o, n));
      const p = Object.fromEntries(PLAN.map((k, i) => [k, a[i]]));
      const at = (i) => a.slice(PLAN.length + i * NMODE, PLAN.length + (i + 1) * NMODE);
      Object.assign(p, { fm: at(0), ell: at(1), mass: at(2), sigma: at(3), leak: at(4) });
      const r = PLAN.length + 5 * NMODE;
      p.massS = a[r]; p.sigmaS = a[r + 1]; p.threshold = a[r + 2];
      return p;
    },
    bandEdge: (f, P, m, xx) => x.saw_band_edge(f, put(P), m, xx),
    transmission: (f, P, m, omega, side) => x.saw_transmission(f, put(P), m, omega, side),
  };
}

globalThis.SawWasmEngine = SawWasmEngine;
