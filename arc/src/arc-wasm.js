// arc-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/arc): ArcWasmEngine, with the engine contract, and the model's functions for
// the views. The page runs it when it can and falls back to the JavaScript (arc-engine.js).

import { GROUPS } from './arc-params.js';
import { KEY_LO, KEY_HI, tuneKey } from './arc-model.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'arc', name: 'ArcWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/arc.wasm', import.meta.url).href };
const NK = KEY_HI - KEY_LO + 1, MAXA = 6, TRAIL = 256;
const MODES = ['mono', 'poly', 'talk'], VOWELS = 'aeiou';

// The C++ engine's messages (arc-engine.h, msg) gathered back into the JavaScript engine's 'arc'
// message: each arc's summary, the focused arc's state, its (i, u) trail in pieces, then the whole.
function views(m, e) {
  const s = (e.views ??= {
    arcs: Array.from({ length: MAXA }, () => ({ P: 0, Iac: 0, out: 0, umax: 0, I: 0, u: 0, keys: [] })),
    msg: { type: 'arc', arcs: [], focus: 0, mode: 'mono', trail: new Float32Array(2 * TRAIL), ti: 0, X: 0, I0: 0, u0: 0, Xm: 0, Ur: 0, hiss: 0, Ih: 0, vowel: null },
    n: 1,
  });
  const v = m.values;
  switch (m.type) {
    case 1: { // an arc: P, Iac, out, umax, I, u, the number of keys, the keys
      const a = s.arcs[m.key];
      [a.P, a.Iac, a.out, a.umax, a.I, a.u] = v;
      a.keys = Array.from(v.subarray(7, 7 + v[6]));
      return null;
    }
    case 2: { // focus, mode, arcs, ti, X, I0, u0, Xm, Ur, hiss, Ih, vowel
      const g = s.msg;
      g.focus = v[0]; g.mode = MODES[v[1]] ?? 'mono'; s.n = v[2]; g.ti = v[3];
      [g.X, g.I0, g.u0, g.Xm, g.Ur, g.hiss, g.Ih] = v.subarray(4, 11);
      g.vowel = v[11] >= 0 ? VOWELS[v[11]] : null;
      return null;
    }
    case 3: s.msg.trail.set(v.subarray(1), v[0]); return null; // the trail, in pieces
    case 4: s.msg.arcs = s.arcs.slice(0, s.n); return s.msg;
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// One arc lamp's state, read back (the JavaScript engine's e.arcs[k]: P, stUmax, nM, nT, has, holds).
const STATE = ['P', 'stUmax', 'nM', 'nT', 'active', 'X', 'u', 'ia', 'is', 'ic', 'Imean', 'uDC', 'CB'];
class ArcView {
  constructor(e, k) { this.e = e; this.k = k; }
  state() { const x = Base.exports, s = scratch(x); x.arc_state(this.e, this.k, s.at); return s.f64(STATE.length); }
  has(key) { return Base.exports.arc_has(this.e, this.k, key) > 0; }
  holds(key) { return Base.exports.arc_holds(this.e, this.k, key) > 0; }
}
STATE.forEach((name, i) => Object.defineProperty(ArcView.prototype, name, { get() { return this.state()[i]; } }));

// The engine, with the JavaScript engine's hooks: new ArcWasmEngine(fs, seed, { quiet, os }),
// kick(amps, k), e.arcs, and P.table (the page's capacitor bank, in setParams). A note may bring
// the bank (the page's noteData: [1 if it is cut for the parameters now, else 0, then a
// capacitor per key from C3]), cut by the page's WebAssembly model, so the audio thread needn't.
export class ArcWasmEngine extends Base {
  constructor(fs, seed, opts = {}) {
    super(fs);
    const x = Base.exports;
    this.e = x.forte_engine(this.h);
    if (seed !== undefined || opts.quiet || opts.os) x.arc_configure(this.e, seed ?? 1, opts.quiet ? 1 : 0, opts.os ?? 0);
    this.arcs = Array.from({ length: MAXA }, (_, k) => new ArcView(this.e, k));
    this.table = null;
  }
  setParams(P) {
    super.setParams(P);
    if (P.table) this.table = P.table;
    if (this.table) this.offer(this.table.caps, this.table.key === tuneKey(P)); // a stale table plays until replaced
  }
  offer(caps, current) {
    if (!caps || caps.length < NK) return;
    const x = Base.exports, s = scratch(x);
    s.f64(NK).set(caps.subarray ? caps.subarray(0, NK) : caps.slice(0, NK));
    x.arc_set_table(this.e, s.at, current ? 1 : 0);
  }
  noteOn(key, velocity, data) {
    if (data instanceof Float64Array && data.length === NK + 1) this.offer(data.subarray(1), data[0] > 0);
    super.noteOn(key, velocity);
  }
  kick(amps, k = 0) { Base.exports.arc_kick(this.e, amps, k); }
}
export const ready = () => ArcWasmEngine.ready();

// The model's functions the views call (arc-model.js's arcOp, staticV, circuit, linearAnalysis,
// thresholdR, thresholdCurrent, upperLimit, startCap, capFor, steadyNote, hissCurrent), computed by
// the WebAssembly.
const OP = ['I0', 'l', 'A', 'B', 'tau', 'V0', 'Ur', 'Xm', 'delta', 'G0', 'u0', 'R0', 'w', 'K', 'Rd', 'kappa', 'Larc', 'Rb'];
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD), at = 8 * params.length;
  const setP = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; };
  const model = {
    arcOp(P) {
      x.arc_op(setP(P), s.at + at);
      const a = s.f64(OP.length, at);
      return Object.fromEntries(OP.map((k, i) => [k, a[i]]));
    },
    staticV: (I, op) => x.arc_static_v(I, op.A, op.B, op.Xm, op.delta),
    circuit: (P, C) => ({ P, C }),
    linearAnalysis({ P, C }) {
      x.arc_linear(setP(P), C, s.at + at);
      const a = s.f64(5, at);
      return { sigma: a[0], f: a[1], fLC: a[2], s: [a[3], a[4]] };
    },
    thresholdR: (P, C) => x.arc_threshold_r(setP(P), C),
    thresholdCurrent: (P, C) => x.arc_threshold_current(setP(P), C),
    upperLimit: (P) => x.arc_upper_limit(setP(P)),
    startCap: (key, P) => x.arc_start_cap(key, setP(P)),
    capFor: (key, P) => x.arc_cap_for(key, setP(P)),
    steadyNote(P, C) {
      x.arc_steady(setP(P), C, s.at + at);
      const a = s.f64(5, at);
      return { f: a[0], iaMin: a[1], iaMax: a[2], uMax: a[3], Iac: a[4] };
    },
    hissCurrent: (l) => x.arc_hiss_current(l),
  };
  return model;
}

globalThis.ArcWasmEngine = ArcWasmEngine;
