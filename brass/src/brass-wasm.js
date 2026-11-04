// brass-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/brass): BrassWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './brass-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'brass', name: 'BrassWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/brass.wasm', import.meta.url).href };

// The C++ engine's messages (brass-engine.h, msg), gathered into the page's: 'state' (the focused
// player: horn, partial, slide, breath, pitch), 'bore' (its waves along the bore, with the radius,
// every other state) and 'trace' (cup pressure, lip opening, the wave into the flare and the sound,
// about three periods).
export const SNAP = 84, TRACE = 96;
const STATE = ['horn', 'octave', 'partial', 'position', 'valves', 'f', 'fm', 'pm', 'swing', 'slide', 'Le', 'length', 'trim', 'lipTrim', 'xNl', 'dt', 'plunger', 'scale'];
function views(m, e) {
  const s = (e.view ??= {
    state: { type: 'state', key: 0, ...Object.fromEntries(STATE.map((k) => [k, 0])) },
    bore: { type: 'bore', key: 0, length: 0, r: new Float64Array(SNAP), pf: new Float64Array(SNAP), pb: new Float64Array(SNAP) },
    trace: { type: 'trace', key: 0, pc: new Float64Array(TRACE), h: new Float64Array(TRACE), pin: new Float64Array(TRACE), rad: new Float64Array(TRACE), dt: 0 },
  });
  const v = m.values;
  switch (m.type) {
    case 1: s.state.key = m.key; STATE.forEach((k, i) => { s.state[k] = v[i] ?? 0; }); s.trace.dt = s.state.dt; return s.state;
    case 2: { // radii: the last piece of a snapshot
      s.bore.key = m.key; s.bore.length = v[0];
      s.bore.r.set(v.subarray(2, v.length), v[1]);
      return v[1] + v.length - 2 >= SNAP ? s.bore : null;
    }
    case 3: (v[0] ? s.bore.pb : s.bore.pf).set(v.subarray(2, v.length), v[1]); return null;
    case 4: {
      const arr = [s.trace.pc, s.trace.h, s.trace.pin, s.trace.rad][v[0]];
      arr.set(v.subarray(2, v.length), v[1]);
      s.trace.key = m.key;
      return v[0] === 3 && v[1] + v.length - 2 >= TRACE ? s.trace : null;
    }
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the tests' hooks: e.voices() ([{ key, down, partial, octave, f, fm, trim,
// lipTrim, pm, swing, env, os, position }]), e.iterations() (the nonlinear reads' steps) and
// e.setEar(on) (the player's ear trimming the slide and lips, or not).
export class BrassWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  voices() {
    const x = Base.exports, s = scratch(x), out = [];
    for (let i = 0; x.brass_voice(this.e, i, s.at); i++) {
      const o = s.f64(13);
      out.push({ key: o[0], down: !!o[1], partial: o[2], octave: o[3], f: o[4], fm: o[5], trim: o[6], lipTrim: o[7], pm: o[8], swing: o[9], env: o[10], os: o[11], position: o[12] });
    }
    return out;
  }
  iterations() { return Base.exports.brass_iterations(this.e); }
  setEar(on) { Base.exports.brass_ear(this.e, on ? 1 : 0); }
}
export const ready = () => BrassWasmEngine.ready();

// The model (brass-model.cpp), computed by the WebAssembly: plan(key, P, fs), what the player
// does for a key ({ horn, octave, partial, f, scale, ext, Le, position, valves, fPeak, os, gain });
// bore(key, P, fs), its bore as the engine builds it ([{ len, r }], with cyl0 and cyl1);
// impedance(key, P, fs, lo, hi, n, plunger), |Z_in| and its phase at n log-spaced frequencies;
// peak(key, P, fs, f, span), its impedance peak near f; tube(len, r, pieces, f, fs, lossless),
// a straight tube's |Z_in| as the engine runs it; profile(horn, bellSize, x) and hornLength(horn);
// shockDistance(p, f); mouthPressure(vel, f, breath); propagate(L, pieces, p, f, fs, iters, nh),
// the harmonics of a loud plane wave after a straight tube; lossFilter(lambda, fs, scale) { g, p }.
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD), at = 8 * params.length;
  const setP = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; };
  const N = x.brass_max_seg();
  const PLAN = ['horn', 'octave', 'partial', 'f', 'scale', 'ext', 'Le', 'position', 'valves', 'fPeak', 'os', 'gain'];
  const out = (n) => new Float64Array(x.memory.buffer, s.at + at, n);
  return {
    plan(key, P, fs = 48000) {
      x.brass_plan(key, setP(P), fs, s.at + at);
      const o = out(12);
      return Object.fromEntries(PLAN.map((k, i) => [k, o[i]]));
    },
    bore(key, P, fs = 48000) {
      const n = x.brass_bore(key, setP(P), fs, s.at + at), o = out(2 * N + 2);
      const segs = Array.from({ length: n }, (_, i) => ({ len: o[i], r: o[N + i] }));
      return Object.assign(segs, { cyl0: o[2 * N], cyl1: o[2 * N + 1] });
    },
    impedance(key, P, fs, lo, hi, n, plunger = 0) {
      x.brass_impedance(key, setP(P), fs, plunger, lo, hi, n, s.at + at);
      const o = out(2 * n);
      return { mag: Array.from(o.subarray(0, n)), phase: Array.from(o.subarray(n)) };
    },
    peak: (key, P, fs, f, span = 0.06) => x.brass_peak(key, setP(P), fs, f, span),
    tube: (len, r, pieces, f, fs, lossless = false) => x.brass_tube_impedance(len, r, pieces, f, fs, lossless ? 1 : 0),
    profile: (horn, bellSize, xm) => x.brass_profile(horn, bellSize, xm),
    hornLength: (horn) => x.brass_horn_length(horn),
    shockDistance: (p, f) => x.brass_shock_distance(p, f),
    mouthPressure: (vel, f, breath) => x.brass_mouth_pressure(vel, f, breath),
    propagate(L, pieces, p, f, fs, iters, nh) {
      x.brass_propagate(L, pieces, p, f, fs, iters, nh, s.at);
      return Array.from(s.f64(nh));
    },
    lossFilter(lambda, fs, scale = 1) { x.brass_loss_filter(lambda, fs, scale, s.at); const o = s.f64(2); return { g: o[0], p: o[1] }; },
  };
}

globalThis.BrassWasmEngine = BrassWasmEngine;
