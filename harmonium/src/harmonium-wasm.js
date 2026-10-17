// harmonium-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/harmonium): HarmoniumWasmEngine, with the engine contract, and the model's
// functions for the views. The page runs it when it can and falls back to the JavaScript
// (harmonium-engine.js).

import { GROUPS } from './harmonium-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'harmonium', name: 'HarmoniumWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/harmonium.wasm', import.meta.url).href };

// The C++ engine's messages (harmonium-engine.h, msg) back into the JavaScript engine's 'reed'
// message: the focused reed's traces and envelope, then its header.
const TRACE = 256, ENV = 64, NR = 5;
function views(m, e) {
  const s = (e.view ??= {
    type: 'reed', key: 0, rank: 1, P: 0, Ptarget: 0, Uair: 0, reeds: 0, fs: e.fs,
    y: new Float64Array(TRACE), U: new Float64Array(TRACE), A: new Float64Array(TRACE), dp: new Float64Array(TRACE), n: 0, dtTrace: 0,
    f: new Float64Array(NR), amp: new Float64Array(NR), env: new Float64Array(ENV), nEnv: 0, dtEnv: 0,
    geo: { L: 0, b: 0, h: 0, e: 0, delta: 0, y0: 0, lam: 0 }, fSound: 0, fNat: 0, xm: 0,
  });
  const v = m.values;
  switch (m.type) {
    case 1: [s.y, s.U, s.A, s.dp][m.key].set(v.subarray(1), v[0]); return null; // a piece of a trace
    case 2: s.env.set(v); s.nEnv = v.length; return null; // the envelope since the last post
    case 3: { // the header: rank, P, Ptarget, Uair, reeds, fSound, fNat, xm, n, dtTrace, –, dtEnv, geometry, f, amp
      s.P = v[1]; s.Ptarget = v[2]; s.Uair = v[3]; s.reeds = v[4]; s.dtEnv = v[11];
      s.key = m.key;
      if (!m.key) { s.n = 0; return s; }
      s.rank = v[0]; s.fSound = v[5]; s.fNat = v[6]; s.xm = v[7]; s.n = v[8]; s.dtTrace = v[9];
      const g = s.geo;
      g.L = v[12]; g.b = v[13]; g.h = v[14]; g.e = v[15]; g.delta = v[16]; g.y0 = v[17]; g.lam = v[18];
      for (let k = 0; k < NR; k++) { s.f[k] = v[19 + k]; s.amp[k] = v[24 + k]; }
      return s;
    }
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// A reed's model from the numbers harmonium-web.cpp writes (flatten): the JavaScript model's fields.
const HEAD = ['fNat', 'fSound', 'tune', 'L', 'b', 'h', 'e', 'delta', 'lam1', 'lam2', 'mu', 'y0',
  'perim', 'Ma', 'C', 'V', 'Ain', 'K', 'lj', 'drag', 'fCell', 'm0', 'M', 'sag', 'Anom', 'Rj', 'eps', 'uOpt', 'throatLA'];
const MODE = ['n', 'lam', 'f', 'om', 'm', 'k', 'S', 'I1', 'I2', 'I3', 'zeta'];
const MODE_AT = HEAD.length, TABLE_AT = MODE_AT + 2 * MODE.length;
function reedOf(a) {
  const R = { flat: Float64Array.from(a) }, o = {};
  HEAD.forEach((k, i) => { o[k] = a[i]; });
  for (const k of ['fNat', 'fSound', 'tune', 'perim', 'Ma', 'C', 'V', 'Ain', 'K', 'lj', 'drag', 'fCell', 'm0', 'M', 'sag', 'Anom', 'Rj', 'eps', 'uOpt', 'throatLA']) R[k] = o[k];
  R.modes = [0, 1].map((n) => Object.fromEntries(MODE.map((k, i) => [k, a[MODE_AT + MODE.length * n + i]])));
  R.geo = { L: o.L, b: o.b, h: o.h, e: o.e, delta: o.delta, lam: [o.lam1, o.lam2], mu: o.mu, y0: o.y0 };
  const n = a[TABLE_AT + 2];
  R.table = { lo: a[TABLE_AT], dy: a[TABLE_AT + 1], n, A: Float64Array.from(a.subarray(TABLE_AT + 3, TABLE_AT + 3 + n)) };
  return R;
}

// The test hooks on a reed: its state in place (the JavaScript Reed's getters and setters), its
// model, its pitch, and setting it at a steady state.
const S = { q1: 0, v1: 1, q2: 2, v2: 3, Uin: 4, pc: 6, x: 8, dp: 10, Ug: 11, W: 12, A: 13, ym: 15, lastX: 18, nx: 20, ampEnv: 21 };
class ReedHook {
  constructor(p) { this.p = p; }
  get st() { const x = Base.exports; return new Float64Array(x.memory.buffer, x.harmonium_reed_state(this.p), 24); }
  info() { const x = Base.exports, s = scratch(x); x.harmonium_reed_info(this.p, s.at); return s.f64(10); }
  get y() { const st = this.st; return st[0] + st[2]; }
  get R() { const x = Base.exports, s = scratch(x); return x.harmonium_reed_model_of(this.p, s.at) ? reedOf(s.f64(x.harmonium_flat_size())) : null; }
  get h() { return this.info()[0]; }
  get os() { return this.info()[1]; }
  get two() { return this.info()[2] > 0; }
  get asleep() { return this.info()[3] > 0; }
  get m1() { return this.info()[4]; }
  get m2() { return this.info()[5]; }
  get track() { return this.info()[8] > 0; }
  freq() { return Base.exports.harmonium_reed_freq(this.p); }
  energy() { return Base.exports.harmonium_reed_energy(this.p); }
  setSteady(e) { Base.exports.harmonium_reed_set_steady(this.p, e.y, e.x, e.U, e.dp, e.pc, e.A, e.dA); }
}
for (const [k, i] of Object.entries(S)) {
  Object.defineProperty(ReedHook.prototype, k, { get() { return this.st[i]; }, set(v) { this.st[i] = v; } });
}
// … and on a voice: its key and state, its pallet, its reeds.
class VoiceHook {
  constructor(p) { this.p = p; this.reeds = Array.from({ length: NR }, (_, r) => new ReedHook(Base.exports.harmonium_reed(p, r))); }
  state() { const x = Base.exports, s = scratch(x); x.harmonium_voice_state(this.p, s.at); return s.f64(9); }
  get key() { return this.state()[0]; }
  get fading() { return this.state()[1] > 0; }
  get dead() { return this.state()[2] > 0; }
  get down() { return this.state()[3] > 0; }
  get a() { return this.state()[4]; }
  set a(v) { Base.exports.harmonium_voice_set_a(this.p, v, this.aTarget); }
  get aTarget() { return this.state()[5]; }
  set aTarget(v) { Base.exports.harmonium_voice_set_a(this.p, this.a, v); }
  get age() { return this.state()[6]; }
  get env() { return this.state()[7]; }
}

// The engine, with the JavaScript engine's test hooks: new HarmoniumWasmEngine(fs, seed, { fOS, track }),
// e.voices (each with its reeds), e.noise (the turbulence table, writable in place), e.Pres and e.Utot.
export class HarmoniumWasmEngine extends Base {
  constructor(fs, seed, opts = {}) {
    super(fs);
    const x = Base.exports;
    this.e = x.forte_engine(this.h);
    this.hooks = new Map();
    if (seed !== undefined || opts.fOS !== undefined || opts.track !== undefined) {
      x.harmonium_configure(this.e, (seed ?? 1) >>> 0, opts.fOS ?? 440, opts.track ? 1 : 0);
    }
  }
  get voices() {
    const x = Base.exports, n = x.harmonium_voices(this.e), out = [];
    for (let i = 0; i < n; i++) {
      const p = x.harmonium_voice(this.e, i);
      if (!this.hooks.has(p)) this.hooks.set(p, new VoiceHook(p));
      out.push(this.hooks.get(p));
    }
    return out;
  }
  get noise() { const x = Base.exports; return new Float64Array(x.memory.buffer, x.harmonium_noise(this.e), 8192); }
  get Pres() { return Base.exports.harmonium_pres(this.e); }
  get Utot() { return Base.exports.harmonium_utot(this.e); }
}
export const ready = () => HarmoniumWasmEngine.ready();

// The model's functions the views call (harmonium-model.js's reedModel, threshold, rankFreq and
// modeShape), computed by the WebAssembly. A reed comes back with the JavaScript model's fields,
// its slot's area table among them (areaAt reads it as it reads the JavaScript's).
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD), flat = x.harmonium_flat_size(), out = 8 * flat;
  const setP = (P) => { s.f64(params.length, out).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at + out; };
  return {
    reedModel(fSound, P, tuned = true) {
      const pp = setP(P);
      x.harmonium_reed_model(fSound, pp, tuned ? 1 : 0, s.at);
      return reedOf(s.f64(flat));
    },
    threshold(R, pMax = 2e4, cass = null) {
      s.f64(flat).set(R.flat);
      return x.harmonium_threshold(s.at, pMax, cass ? cass.f : 0, s.at + out) ? (([P, f]) => ({ P, f }))(s.f64(2, out)) : null;
    },
    rankFreq: (m, r, P) => x.harmonium_rank_freq(m, r, setP(P)),
    modeShape: (lam, u) => x.harmonium_mode_shape(lam, u),
  };
}

globalThis.HarmoniumWasmEngine = HarmoniumWasmEngine;
