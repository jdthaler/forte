// regal-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/regal): RegalWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './regal-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'regal', name: 'RegalWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/regal.wasm', import.meta.url).href };

// The C++ engine's messages (regal-engine.h, msg): the focused reed's traces, gathered into the
// page's 'reed' message with its header, and the wind's 'wind' message.
const TRACE = 128;
const REED = ['rank', 'f0', 'fNat', 'L', 'b', 'h', 'h0', 'Ls', 'bs', 'dt', 'n', 'qAmp', 'fSound', 'shape'];
const WIND = ['P0', 'Pbellows', 'Pchest', 'fill0', 'fill1', 'active', 'draw', 'hand', 'trem'];
function views(m, e) {
  const s = (e.view ??= {
    type: 'reed', key: 0, q: new Float64Array(TRACE), U: new Float64Array(TRACE), pd: new Float64Array(TRACE), Pb: new Float64Array(TRACE),
    ...Object.fromEntries(REED.map((k) => [k, 0])),
  });
  const v = m.values;
  switch (m.type) {
    case 1: [s.q, s.U, s.pd, s.Pb][m.key].set(v.subarray(1), v[0]); return null; // a piece of a trace
    case 2: s.key = m.key; REED.forEach((k, i) => { s[k] = v[i] ?? 0; }); return s;
    case 3: return { type: 'wind', fs: e.fs, ...Object.fromEntries(WIND.map((k, i) => [k, v[i]])) };
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the tests' hooks: new RegalWasmEngine(fs, { seed, fOS }), e.wind (the bellows,
// the chest, the fills, the draw), e.awake() and e.awake(true) (reeds awake, and those at 2×).
export class RegalWasmEngine extends Base {
  constructor(fs, { seed, fOS } = {}) {
    super(fs);
    const x = Base.exports;
    this.e = x.forte_engine(this.h);
    if (seed !== undefined || fOS !== undefined) x.regal_configure(this.e, (seed ?? 1) >>> 0, fOS ?? 250);
  }
  get wind() {
    const x = Base.exports, s = scratch(x), o = s.f64(6);
    x.regal_wind(this.e, s.at);
    return { Pbellows: o[0], Pchest: o[1], fill: [o[2], o[3]], active: o[4], draw: o[5] };
  }
  awake(twice = false) { return Base.exports.regal_awake(this.e, twice ? 1 : 0); }
}
export const ready = () => RegalWasmEngine.ready();

// The model (regal-model.cpp), computed by the WebAssembly: reed(key, rank, P), the reed a key's rank
// sounds with ({ f0, fNat, L, b, h, M, m, k, S, c, h0, bs, Ls, Ks, zc, Vb, ds, tube: [{ len, area }] });
// impedance(key, rank, P, f, lossless), its tube's input impedance { mag, phase }; firstPeak(key, rank,
// P, lo, hi); cylinder(len, area, f, lossless) and cylinderPeak(len, area, lo, hi); endCorrection(area);
// contact(q, h0) { I, dI }; gapArea(q, h0, bs, Ls); cantilever(L, h, b, M); tuneRatio(f0, shape);
// bellowsPressure(P0, fill); measure(key, rank, P, fs, P0, t0, t1), the pitch a reed sounds alone;
// tune(f0, shape, fs, P0, off), the tuning tool's ratio { tune, err }; tuneOffset(f0, shape).
const HEAD = ['f0', 'fNat', 'L', 'b', 'h', 'M', 'm', 'k', 'S', 'c', 'h0', 'bs', 'Ls', 'Ks', 'zc', 'Vb', 'ds'];
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD), at = 8 * params.length;
  const setP = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; };
  const nSeg = x.regal_max_seg();
  return {
    reed(key, rank, P) {
      const pp = setP(P);
      x.regal_reed(key, rank, pp, s.at + at);
      const o = new Float64Array(x.memory.buffer, s.at + at, x.regal_flat_size());
      const R = Object.fromEntries(HEAD.map((k, i) => [k, o[i]]));
      const n = o[HEAD.length];
      R.tube = Array.from({ length: n }, (_, i) => ({ len: o[HEAD.length + 1 + i], area: o[HEAD.length + 1 + nSeg + i] }));
      return R;
    },
    impedance(key, rank, P, f, lossless = false) {
      const pp = setP(P);
      x.regal_impedance(key, rank, pp, f, lossless ? 1 : 0, s.at + at);
      const o = new Float64Array(x.memory.buffer, s.at + at, 2);
      return { mag: o[0], phase: o[1] };
    },
    firstPeak: (key, rank, P, lo, hi) => x.regal_first_peak(key, rank, setP(P), lo, hi),
    cylinder(len, area, f, lossless = false) {
      x.regal_cylinder_impedance(len, area, f, lossless ? 1 : 0, s.at);
      const o = s.f64(2);
      return { mag: o[0], phase: o[1] };
    },
    cylinderPeak: (len, area, lo, hi) => x.regal_cylinder_peak(len, area, lo, hi),
    endCorrection: (area) => x.regal_end_correction(area),
    contact(q, h0) { x.regal_contact(q, h0, s.at); const o = s.f64(2); return { I: o[0], dI: o[1] }; },
    gapArea: (q, h0, bs, Ls) => x.regal_gap_area(q, h0, bs, Ls),
    cantilever: (L, h, b, M) => x.regal_cantilever(L, h, b, M),
    tuneRatio: (f0, shape) => x.regal_tune_ratio(f0, shape),
    bellowsPressure: (P0, fill) => x.regal_bellows_pressure(P0, fill),
    measure: (key, rank, P, fs, P0, t0 = 0.4, t1 = 1.0) => x.regal_measure(key, rank, setP(P), fs, P0, t0, t1),
    tune(f0, shape, fs, P0, off = -0.25) { const t = x.regal_tune(f0, shape, fs, P0, off, s.at); return { tune: t, err: s.f64(1)[0] }; },
    tuneOffset: (f0, shape) => x.regal_tune_offset(f0, shape),
  };
}

globalThis.RegalWasmEngine = RegalWasmEngine;
