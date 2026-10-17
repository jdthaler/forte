// bubbles-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/bubbles): BubbleWasmEngine, with the engine contract, and the model's
// functions for the views. The page runs it when it can and falls back to the JavaScript
// (bubbles-engine.js).

import { GROUPS } from './bubbles-params.js';
import { GASES, LIQUIDS, KEY_LO, KEY_HI, gasOf, liquidOf } from './bubbles-model.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'bubbles', name: 'BubbleWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/bubbles.wasm', import.meta.url).href };

// The C++ engine's messages (bubbles-engine.h, msg) back into the JavaScript engine's: 'bubbles'
// (the releases since the last one, and how many bubbles ring) and 'wave' (the latest bubble's
// waveform, as it fills).
const EVF = 8, EV_MAX = 48, WAVE_N = 1024, HI = 16777216;
const WAVE_META = ['dt', 'R', 'fd', 'b', 'delta', 'dth', 'drad', 'dvis', 'kappa', 'd0', 'frameHi', 'frameLo', 'p0', 'chi', 'm', 'vel', 'U'];
function views(m, e) {
  const s = (e.views ??= {
    ev: new Float64Array(EV_MAX * EVF), n: 0,
    msg: { type: 'bubbles', frame: 0, fs: e.fs, n: 0, ev: null, active: 0 },
    wave: { type: 'wave', key: 0, buf: new Float32Array(WAVE_N), count: 0, frame: 0, done: false },
  });
  const v = m.values;
  switch (m.type) {
    case 1: { // a release: key; offset in the block, R, fd, b, U, d0, vel
      if (s.n >= EV_MAX) return null;
      const k = s.n++ * EVF;
      s.ev[k] = m.key;
      for (let i = 0; i < 7; i++) s.ev[k + 1 + i] = v[i];
      return null;
    }
    case 2: { // the block's end: frame, the block's length, bubbles ringing
      const frame = v[0] * HI + v[1], start = frame - v[2];
      for (let i = 0; i < s.n; i++) s.ev[i * EVF + 1] += start;
      Object.assign(s.msg, { frame, n: s.n, ev: s.ev, active: v[3] });
      s.n = 0;
      return s.msg;
    }
    case 3: { // a new waveform
      const w = s.wave;
      WAVE_META.forEach((k, i) => { w[k] = v[i]; });
      w.key = m.key; w.frame = w.frameHi * HI + w.frameLo; w.count = 0; w.done = false;
      return null;
    }
    case 4: s.wave.buf.set(v.subarray(1), v[0]); return null; // its samples
    case 5: s.wave.count = v[0]; s.wave.done = v[1] > 0; return s.wave; // shown
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the JavaScript engine's test hooks: new BubbleWasmEngine(fs, seed, { pool, soft }),
// e.log (set it to [] to record each release), e.pool and e.nozzles (their state, read back).
export class BubbleWasmEngine extends Base {
  constructor(fs, seed, { pool, soft } = {}) {
    super(fs);
    const x = Base.exports;
    this.e = x.forte_engine(this.h);
    if (seed !== undefined || pool !== undefined || soft !== undefined) {
      x.bubbles_configure(this.e, (seed ?? 0x5eed) >>> 0, pool ?? 192, Math.min(soft ?? 160, 0x7fffffff));
    }
  }
  set log(on) { this.logging = !!on; Base.exports.bubbles_log(this.e, on ? 1 : 0); }
  get log() {
    if (!this.logging) return null;
    const x = Base.exports, s = scratch(x), out = s.f64(5);
    return Array.from({ length: x.bubbles_log_count(this.e) }, (_, i) => {
      x.bubbles_log_entry(this.e, i, s.at);
      return { key: out[0], frame: out[1], R: out[2], vel: out[3], first: out[4] > 0 };
    });
  }
  get pool() {
    const x = Base.exports, s = scratch(x), out = s.f64(4);
    return Array.from({ length: x.bubbles_pool_size(this.e) }, (_, i) => {
      x.bubbles_pool_bubble(this.e, i, s.at);
      return { on: out[0] > 0, fadeStep: out[1], age: out[2], fade: out[3] };
    });
  }
  get nozzles() {
    const x = Base.exports;
    return Array.from({ length: KEY_HI - KEY_LO + 1 }, (_, i) => ({ key: KEY_LO + i, held: x.bubbles_nozzle_held(this.e, i) > 0 }));
  }
}
export const ready = () => BubbleWasmEngine.ready();

// The model's functions the views call (bubbles-model.js's nozzleEnv, keyRadius, acoustics,
// ambient, riseDistance, peakPressure, snapGain), computed by the WebAssembly.
const ACOUSTICS = ['omega0', 'b', 'omegaD', 'f0', 'fd', 'delta', 'dvis', 'dth', 'drad', 'kappa', 'phiRe', 'phiIm', 'chi', 'D', 'pb', 'm', 'radFactor', 'R'];
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD), at = 8 * params.length;
  const gas = (g) => Math.max(0, Object.values(GASES).indexOf(g)), liquid = (l) => Math.max(0, Object.values(LIQUIDS).indexOf(l));
  const setP = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; };
  let radiiFor = '', radii = null; // every key's radius, for the conditions they were computed for
  const model = {
    ambient: (P) => x.bubbles_ambient(setP(P)),
    nozzleEnv(P, env = {}) {
      env.liq = liquidOf(P); env.gas = gasOf(P); env.d = P.depth; env.p0 = model.ambient(P); env.phiFixed = null;
      return env;
    },
    acoustics(R, env, out = {}) {
      x.bubbles_acoustics(R, env.p0, env.d, liquid(env.liq), gas(env.gas), s.at);
      const a = s.f64(ACOUSTICS.length);
      ACOUSTICS.forEach((k, i) => { out[k] = a[i]; });
      return out;
    },
    keyRadius(key, P) {
      const id = [P.depth, P.pressure, P.gas, P.liquid, !!P.keepInTune].join();
      if (id !== radiiFor) {
        x.bubbles_key_radii(setP(P), s.at + at);
        radii = s.f64(KEY_HI - KEY_LO + 1, at).slice(); radiiFor = id;
      }
      return radii[Math.min(KEY_HI, Math.max(KEY_LO, key)) - KEY_LO];
    },
    riseDistance: (t, U) => x.bubbles_rise_distance(t, U),
    peakPressure: (liq, velocity) => x.bubbles_peak_pressure(liquid(liq), velocity),
    snapGain: (f, tau) => x.bubbles_snap_gain(f, tau),
  };
  return model;
}

globalThis.BubbleWasmEngine = BubbleWasmEngine;
