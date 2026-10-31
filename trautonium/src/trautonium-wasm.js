// trautonium-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/trautonium): TrautoniumWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './trautonium-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'trautonium', name: 'TrautoniumWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/trautonium.wasm', import.meta.url).href };

// The C++ engine's message (trautonium-engine.h, msg) as the page's 'state': the newest voice's
// key, master frequency, pressure and first circuit's tuning, the master's measured frequency, and
// for each divider the master pulse it last fired on (0: on its own) and its measured frequency.
function state(m) {
  if (m.type !== 1) return null;
  const v = m.values;
  return { type: 'state', key: m.key, f: v[0], p: v[1], f1: v[2], fMaster: v[3], counts: Array.from(v.subarray(4, 8)), fDiv: Array.from(v.subarray(8, 12)) };
}

const Base = wasmEngine(BUILD, { messages: state });

// The engine, with the tests' hook: e.voices, each sounding voice's key, pressure, frequency, first
// circuit and its lamps (master first: firings nf, the pulse it fired on last, the samples between
// its last two firings).
export class TrautoniumWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get voices() {
    const x = Base.exports, s = scratch(x), out = [];
    for (let i = 0; i < x.trautonium_pool(); i++) {
      x.trautonium_voice(this.e, i, s.at);
      const a = s.f64(21);
      if (!a[0]) continue;
      out.push({ slot: i, held: a[1] > 0, key: a[2], p: a[3], f: a[4], f1: a[5],
        lamps: Array.from({ length: 5 }, (_, j) => ({ nf: a[6 + 3 * j], count: a[7 + 3 * j], interval: a[8 + 3 * j] })) });
    }
    return out;
  }
}
export const ready = () => TrautoniumWasmEngine.ready();

// The model (trautonium-model.h), computed by the WebAssembly: the lamp's constants, periods(S)
// (a period in time constants), wireR(f, S), window(sync, S) (the dividers' capture window δ),
// lockCount(n, slack, δ) (the master pulse a ÷n divider fires on; 0: it slips) and response(f, P)
// (the circuits' response).
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  x.trautonium_constants(s.at);
  const [V_STRIKE, V_EXT, CAP, DIVIDERS, FORMANTS] = s.f64(5);
  const setP = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; }; // a choice as its index
  return {
    V_STRIKE, V_EXT, CAP, DIVIDERS, FORMANTS,
    periods: (S) => x.trautonium_periods(S),
    wireR: (f, S) => x.trautonium_wire_r(f, S),
    window: (sync, S) => x.trautonium_window(sync, S),
    lockCount: (n, slack, delta) => x.trautonium_lock_count(n, slack, delta),
    response(fs, P) { const at = setP(P); return fs.map((f) => x.trautonium_response(f, at)); },
  };
}

globalThis.TrautoniumWasmEngine = TrautoniumWasmEngine;
