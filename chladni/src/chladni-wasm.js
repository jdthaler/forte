// chladni-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/chladni): ChladniPlateWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './chladni-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'chladni', name: 'ChladniPlateWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/chladni.wasm', import.meta.url).href };

export const MAXMODES = 64;

// The C++ engine's messages (chladni-engine.h, msg) into the views' 'state': the focused plate's
// modal amplitudes come first, the state last.
function views(m, e) {
  const s = (e.views ??= { type: 'state', key: -1, plate: 0, mode: 0, bow: 0, fingers: [[0, 0], [0, 0]], threshold: 0, finger: true, side: 0, f0: 0, modes: 0, stick: 0, N: 0, touch: false, count: 0, amps: new Float64Array(MAXMODES) });
  const v = m.values;
  switch (m.type) {
    case 2: s.amps.set(v.subarray(1), v[0]); return null;
    case 1:
      Object.assign(s, { key: m.key, plate: v[0], mode: v[1], bow: v[2], fingers: [[v[3], v[4]], [v[13], v[14]]], finger: v[5] > 0.5, side: v[6], f0: v[7], modes: v[8], stick: v[9], N: v[10], touch: v[11] > 0, count: v[12], threshold: v[15] });
      if (s.modes < MAXMODES) s.amps.fill(0, s.modes);
      return s;
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the tests' hooks: e.voices, each voice's key, bow, modes and state.
export class ChladniPlateWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get voices() {
    const x = Base.exports, e = this.e;
    return Array.from({ length: x.chladni_voice_count(e) }, (_, i) => {
      const s = scratch(x);
      x.chladni_voice_state(e, i, s.at);
      const a = Array.from(s.f64(9)), M = a[4];
      return {
        key: a[0], touch: a[1] > 0, N: a[2], sticks: a[3], M, target: a[5], s: a[6], side: a[7], mass: a[8],
        q: Array.from(new Float64Array(x.memory.buffer, x.chladni_voice_q(e, i, 0), M)),
        q1: Array.from(new Float64Array(x.memory.buffer, x.chladni_voice_q(e, i, 1), M)),
      };
    });
  }
}
export const ready = () => ChladniPlateWasmEngine.ready();

// The model (chladni-model.h), computed by the WebAssembly. A plate is named by its id,
// 2·material + (clamped ? 1 : 0), as plateId(P) gives it.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const native = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; }; // a choice as its index, as the engine gets it
  const plateId = (P) => 2 * Number(P.material) + (Number(P.hold) === 0 ? 1 : 0);
  const grids = new Map();
  return {
    MAXMODES, FINGER: x.chladni_finger(), CLAMP: x.chladni_clamp(), KAPPA: x.chladni_kappa(),
    plateId,
    // a plate's modes: [{ lambda, block }]
    modes(id) { return Array.from({ length: x.chladni_mode_count(id) }, (_, n) => ({ lambda: x.chladni_lambda(id, n), block: x.chladni_block(id, n) })); },
    shape: (id, n, X, Y) => x.chladni_shape(id, n, X, Y),
    // mode n's shape on a g × g grid (row by row from y = −1), kept
    grid(id, n, g) {
      const k = `${id}/${n}/${g}`;
      if (!grids.has(k)) { x.chladni_grid(id, n, g, s.at); grids.set(k, Float32Array.from(new Float32Array(x.memory.buffer, s.at, g * g))); }
      return grids.get(k);
    },
    spots(id, figure) { x.chladni_spots(id, figure, s.at); const a = s.f64(6); return { mode: a[0], bow: a[1], fingers: [[a[2], a[3]], [a[4], a[5]]] }; },
    pathPoint(sp) { x.chladni_path_point(sp, s.at); const a = s.f64(2); return [a[0], a[1]]; },
    pathShift: (sp, d) => x.chladni_path_shift(sp, d),
    // a key's plate for P: side (m), mass (kg), f0, η, the figure's mode, and its modes' f and σ
    keyPlate(key, P) {
      const at = native(P), out = at + 8 * params.length;
      const n = x.chladni_key_plate(key, at, out), a = new Float64Array(x.memory.buffer, out, 6 + 2 * n);
      return { side: a[0], mass: a[1], f0: a[2], eta: a[3], target: a[4], threshold: a[5], count: n,
        f: Array.from({ length: n }, (_, i) => a[6 + 2 * i]), sigma: Array.from({ length: n }, (_, i) => a[7 + 2 * i]) };
    },
    // the tests: a plate solved at any Poisson ratio, clamped or not, clamp stiffness kappa
    solve(nu, clamped, kappa = x.chladni_kappa()) {
      const n = x.chladni_solve(nu, clamped ? 1 : 0, kappa);
      return { count: n, lambda: (i) => x.chladni_solved_lambda(i), block: (i) => x.chladni_solved_block(i), shape: (i, X, Y) => x.chladni_solved_shape(i, X, Y) };
    },
  };
}

globalThis.ChladniPlateWasmEngine = ChladniPlateWasmEngine;
