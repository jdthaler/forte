// clavicylinder-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/clavicylinder): ClavicylinderWasmEngine, with the engine contract, and the
// model's functions for the views and the tests.

import { GROUPS } from './clavicylinder-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'clavicylinder', name: 'ClavicylinderWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/clavicylinder.wasm', import.meta.url).href };

export const MODES = 8;
export const TRACE = 1024; // samples of contact history for the view (clavicylinder-engine.h)

// The C++ engine's messages (clavicylinder-engine.h, msg) into the views' 'state': the focused
// bar's modes and its contact trace come first, the state last.
function views(m, e) {
  const s = (e.views ??= { type: 'state', key: -1, theta: 0, rev: 0, N: 0, V: 0, touch: false, nm: 0, stick: 0,
    q: new Float64Array(2 * MODES), trS: new Float32Array(TRACE), trF: new Float32Array(TRACE) });
  const v = m.values;
  switch (m.type) {
    case 2: s.q.fill(0); s.q.set(v.subarray(0, v.length / 2), 0); s.q.set(v.subarray(v.length / 2), MODES); return null; // q, then dq/dt
    case 3: s.trS.set(v.subarray(1), v[0]); return null;
    case 4: s.trF.set(v.subarray(1), v[0]); return null;
    case 1: // key; theta, rev/s, N, V, touch, nm, stick fraction
      Object.assign(s, { key: m.key, theta: v[0], rev: v[1], N: v[2], V: v[3], touch: v[4] > 0, nm: v[5], stick: v[6] });
      return s;
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// a bar from its flat form (clavicylinder-web.cpp, putBar)
const BAR = ['key', 'f1', 'fbar', 'L', 'h', 'm', 'post', 'xc', 'arm', 'flever', 'tx', 'ty', 'xs', 'meff', 'reg', 'balance'];
const MODE = ['f', 'sigma', 'c', 'cn', 'e'];
const BAR_SIZE = BAR.length + 1 + MODE.length * MODES;
function barOf(a) {
  const b = {};
  BAR.forEach((k, j) => { b[k] = a[j]; });
  b.post = b.post > 0;
  b.modes = [];
  for (let i = 0; i < a[BAR.length]; i++) { const m = {}; MODE.forEach((k, j) => { m[k] = a[BAR.length + 1 + MODE.length * i + j]; }); b.modes.push(m); }
  return b;
}

// The engine, with the tests' hooks: e.voices (each voice's key, load on the glass, contact and
// modal state, and its bar), the cylinder (e.cylinder) and the focused bar's contact trace
// (e.trS, e.trF, e.tw).
export class ClavicylinderWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get voices() {
    const x = Base.exports, e = this.e;
    return Array.from({ length: x.clavicylinder_voice_count(e) }, (_, i) => {
      const s = scratch(x), st = () => { x.clavicylinder_voice_state(e, i, s.at); return s.f64(8); };
      const a = st(), N = a[3], q = (which) => new Float64Array(x.memory.buffer, x.clavicylinder_voice_q(e, i, which), N);
      return {
        key: a[0], touch: a[2] > 0, N,
        get Nn() { return st()[1]; },
        get stick() { return st()[4] > 0; },
        get slip() { return st()[5]; },
        get F() { return st()[6]; },
        get sticks() { return st()[7]; },
        q: q(0), q1: q(1),
        get b() { x.clavicylinder_voice_bar(e, i, s.at); return barOf(s.f64(BAR_SIZE)); },
      };
    });
  }
  get cylinder() { const x = Base.exports, s = scratch(x); x.clavicylinder_cylinder(this.e, s.at); const a = s.f64(3); return { W: a[0], theta: a[1], load: a[2] }; }
  get trS() { const x = Base.exports; return new Float32Array(x.memory.buffer, x.clavicylinder_trace(this.e, 0), TRACE); }
  get trF() { const x = Base.exports; return new Float32Array(x.memory.buffer, x.clavicylinder_trace(this.e, 1), TRACE); }
  get tw() { return Base.exports.clavicylinder_trace_pos(this.e); }
}
export const ready = () => ClavicylinderWasmEngine.ready();

// The model (clavicylinder-model.h), computed by the WebAssembly: bar(key, P), a key's bar for the
// parameters P (its note in P's tuning); modeShape and modeSlope; friction(wet, grip, L);
// pad(wet, layers, L); rubbedMass(key, build, h); the geometry's constants.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const c = s.f64(8);
  x.clavicylinder_constants(s.at);
  const [NODE, POST, POST_AT, ARM, SPLIT, CYL_R, WIDTH, H0] = c;
  return {
    NODE, POST, POST_AT, ARM, SPLIT, CYL_R, WIDTH, H0, MODES,
    BETA_L: Array.from({ length: x.clavicylinder_mode_count() }, (_, n) => x.clavicylinder_beta_l(n)),
    modeShape: (n, v) => x.clavicylinder_mode_shape(n, v),
    modeSlope: (n, v) => x.clavicylinder_mode_slope(n, v),
    bar(key, P, fs = 48000) {
      s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); // a choice as its index, as the engine gets it
      const out = s.at + 8 * params.length;
      x.clavicylinder_bar(key, s.at, fs, out);
      return barOf(new Float64Array(x.memory.buffer, out, BAR_SIZE));
    },
    friction(wet, grip, L) { x.clavicylinder_friction(wet, grip, L, s.at); const a = s.f64(5); return { mud: a[0], dmu: a[1], v0: a[2], beta: a[3], noise: a[4] }; },
    pad(wet, layers, L) { x.clavicylinder_pad(wet, layers, L, s.at); const a = s.f64(3); return { m: a[0], k: a[1], zeta: a[2] }; },
    rubbedMass: (key, build, h) => x.clavicylinder_rubbed_mass(key, build, h),
  };
}

globalThis.ClavicylinderWasmEngine = ClavicylinderWasmEngine;
