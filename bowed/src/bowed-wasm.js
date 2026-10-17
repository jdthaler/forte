// bowed-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/bowed): OrganistaWasmEngine, with the engine contract, and the model's
// functions for the views. The page runs it when it can and falls back to the JavaScript
// (bowed-engine.js).

import { GROUPS } from './bowed-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'bowed', name: 'OrganistaWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/bowed.wasm', import.meta.url).href };

const RANGE = [36, 84], SHAPE_N = 96, TRACE = 2048, FS = 48000;
const KIND = ['none', 'helmholtz', 'multiple', 'raucous'];

// The C++ engine's messages (bowed-engine.h, msg) back into the JavaScript engine's 'state' and
// 'error': the focused string's shape and its bow-point trace come first, the state last.
function views(m, e) {
  const s = (e.views ??= { type: 'state', key: -1, FN: 0, FT: 0, vB: 0, beta: 0, down: false, active: false, kind: 'none', spp: 0,
    shape: new Float32Array(SHAPE_N), trace: new Float32Array(TRACE), period: 0, f: 0 });
  const v = m.values;
  switch (m.type) {
    case 2: s.shape.set(v.subarray(1), v[0]); return null;
    case 3: s.trace.set(v.subarray(1), v[0]); return null;
    case 1: // key; FN, FT, vB, beta, down, active, kind, spp, period, f
      Object.assign(s, { key: m.key, FN: v[0], FT: v[1], vB: v[2], beta: v[3], down: v[4] > 0, active: v[5] > 0, kind: KIND[v[6]] ?? 'none', spp: v[7], period: v[8], f: v[9] });
      return s;
    case 4: return { type: 'error', message: 'A string went numerically unstable at these settings and was stopped.' };
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the JavaScript engine's test hooks: e.S[key] (a key's force, whether it is down
// and sounding, its loop's v_B, its motion, its rings as Float64Arrays, initHelmholtz; FN can be
// written), e.nAct and e.vB.
export class OrganistaWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get nAct() { return Base.exports.bowed_act_count(this.e); }
  get vB() { return Base.exports.bowed_vb(this.e); }
  get S() {
    const x = Base.exports, e = this.e, S = [];
    for (let k = RANGE[0]; k <= RANGE[1]; k++) {
      const s = scratch(x), st = () => { x.bowed_key_state(e, k, s.at); return s.f64(8); };
      const ring = (which) => new Float64Array(x.memory.buffer, x.bowed_key_ring(e, k, which), st()[5]);
      S[k] = {
        key: k,
        get FN() { return st()[0]; },
        set FN(v) { x.bowed_key_set_fn(e, k, v); },
        get FT() { return st()[1]; },
        get down() { return st()[2] > 0; },
        get active() { return st()[3] > 0; },
        get os() { return st()[6]; },
        get L() { const a = st(); return { vB: a[4], f0: a[7] }; },
        motion(win = 24) { x.bowed_key_motion(e, k, win, s.at); const a = s.f64(2); return { spp: a[0], kind: KIND[a[1]] }; },
        initHelmholtz(vB) { x.bowed_key_init_helmholtz(e, k, vB); },
        get fb() { return ring(0); }, get nl() { return ring(1); }, get hb() { return ring(2); }, get tb() { return ring(3); }, get tn() { return ring(4); },
      };
    }
    return S;
  }
}
export const ready = () => OrganistaWasmEngine.ready();

// loopDesign's fields, in the order bowed_loop_design writes them
const LOOP = ['fKey', 'f0', 'L', 'T', 'c', 'mu', 'Z0', 'd', 'B', 'stress', 'wound', 'G', 'Zall', 'N0', 'beta',
  'wheel', 'vB', 'Db', 'Dn', 'gb', 'pb', 'gn', 'pn', 'rB', 'sigma1', 'Zt', 'ft', 'Dtb', 'Dtn', 'rtb', 'rtn'];

// The model's functions the views call (bowed-model.js's loopDesign, schelleng, VOICED, keyForce,
// riseTime, helmholtz, helmholtzEnvelope, wheelOf, and settleTime on the key's string), computed by
// the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const VOICED = new Float64Array(RANGE[1] + 1);
  for (let k = RANGE[0]; k <= RANGE[1]; k++) VOICED[k] = x.bowed_voiced(k);
  const loopDesign = (key, P, fs) => {
    x.bowed_loop_design(key, fs, P.speed, P.beta, P.losses, P.mobility, P.torsionQ, s.at);
    const a = s.f64(LOOP.length), L = { key };
    LOOP.forEach((k, i) => { L[k] = a[i]; });
    L.wound = L.wound > 0;
    return L;
  };
  const schelleng = (L, P, beta = L.beta, vB = L.vB ?? P.speed) => {
    x.bowed_schelleng(L.Z0, L.f0, L.sigma1, P.mus, P.mud, P.v0, beta, vB, s.at);
    const a = s.f64(3);
    return { R: a[0], Fmax: a[1], Fmin: a[2] };
  };
  const touch = (vel) => 0.75 + 0.36 * vel;
  return {
    loopDesign, schelleng, VOICED,
    keyForce: (key, vel, force, after = 0) => VOICED[key] * force * touch(vel) * (1 + 1.5 * after),
    riseTime: (vel, attackMs) => attackMs / 1000 / (0.15 + 0.85 * vel),
    helmholtz: (beta, vB) => ({ stick: 1 - beta, vSlip: (-vB * (1 - beta)) / beta, Fpp: (2 * vB) / beta }),
    helmholtzEnvelope: (xx, L, beta, vB, f0) => (vB * xx * (L - xx)) / (f0 * beta * L * L),
    wheelOf: (key) => (key >= 75 ? 3 : key >= 60 ? 2 : key >= 48 ? 1 : 0),
    // the attack map: the key's loop at its string's (oversampled) rate, and Guettler's settling time
    attackLoop: (key, P) => loopDesign(key, P, FS * x.bowed_oversample(key, FS)),
    settleTime: (key, P, vB, FN, rise, sec) => x.bowed_settle_time(key, FS, P.speed, P.beta, P.losses, P.mobility, P.torsionQ, P.mus, P.mud, P.v0, P.memory, P.grain, vB, FN, rise, sec),
  };
}

globalThis.OrganistaWasmEngine = OrganistaWasmEngine;
