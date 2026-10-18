// bowed-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/bowed): OrganistaWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './bowed-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'bowed', name: 'OrganistaWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/bowed.wasm', import.meta.url).href };

const RANGE = [36, 84], SHAPE_N = 96, TRACE = 2048, FS = 48000;
const KIND = ['none', 'helmholtz', 'multiple', 'raucous'];

// The C++ engine's messages (bowed-engine.h, msg) as the page's 'state' and 'error': the focused
// string's shape and its bow-point trace come first, the state last.
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

// The engine, with the tests' hooks: e.S[key] (a key's force, whether it is down
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

const CHUNK = 1024; // samples per call when a string is bowed alone (five arrays of them in the scratch area)

// The model's functions the views and the tests call (loopDesign, schelleng, VOICED, keyForce,
// riseTime, helmholtz, helmholtzEnvelope, wheelOf, oversample, and settleTime on the key's string),
// the physics the tests check (friction, frictionForce, lossFilter, the board: BOARD, plateYinf,
// plateDensity, plateFreq, plateShape, stringLoad, wallace, boardModes), and a string bowed alone
// (bowedString), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD);
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
  const b = (x.bowed_board(s.at), s.f64(7));
  const BOARD = { a: b[0], b: b[1], rhoH: b[2], Dx: b[3], Dy: b[4] }, Yinf = b[5], density = b[6];
  const friction = (P) => {
    x.bowed_friction(P.mus, P.mud, P.v0, P.memory ?? 0, P.grain ?? 0, s.at);
    const a = s.f64(5);
    return { mus: a[0], mud: a[1], v0: a[2], tau: a[3], grain: a[4] };
  };
  // One string bowed alone, its bridge held still: the key's string at fs × oversample(key, fs),
  // with the friction of P. bow(sec, force, vB) runs it for sec seconds, force (N) and vB (m/s)
  // each a number or a function of the time since the call (and of the sample's index), and
  // returns per output sample its bow-point velocity v, its force on the bridge fbr and the slips
  // counted so far (all null with keep false). free() when done.
  const bowedString = (key, P, fs = FS) => {
    s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id])));
    const h = x.bowed_string_new(key, fs, s.at), os = x.bowed_oversample(key, fs);
    const st = () => { x.bowed_string_state(h, s.at); return s.f64(5); };
    return {
      key, os, fs: fs * os, fsBase: fs, L: loopDesign(key, P, fs * os), Fr: friction(P),
      get t() { return st()[2]; }, get nSlip() { return st()[3]; }, get T0() { return st()[4]; },
      initHelmholtz(vB) { x.bowed_string_init_helmholtz(h, vB); return this; },
      setDamper(on, sigma) { x.bowed_string_set_damper(h, on ? 1 : 0, sigma); return this; },
      motion(win = 24) { x.bowed_string_motion(h, win, s.at); const a = s.f64(2); return { spp: a[0], kind: KIND[a[1]] }; },
      bow(sec, force, vB, { keep = true } = {}) {
        const n = Math.round(sec * fs), F = typeof force === 'function' ? force : () => force, V = typeof vB === 'function' ? vB : () => vB;
        const v = keep ? new Float32Array(n) : null, fbr = keep ? new Float32Array(n) : null, slips = keep ? new Float64Array(n) : null;
        const B = 8 * CHUNK, out = keep ? s.at + 2 * B : 0, fn = new Float64Array(CHUNK), vb = new Float64Array(CHUNK);
        for (let i0 = 0; i0 < n; i0 += CHUNK) {
          const m = Math.min(CHUNK, n - i0);
          for (let i = 0; i < m; i++) { fn[i] = F((i0 + i) / fs, i0 + i); vb[i] = V((i0 + i) / fs, i0 + i); } // (these may use the scratch area)
          s.f64(m).set(fn.subarray(0, m)); s.f64(m, B).set(vb.subarray(0, m));
          x.bowed_string_bow(h, m, s.at, s.at + B, out, keep ? out + B : 0, keep ? out + 2 * B : 0);
          if (keep) { v.set(s.f64(m, 2 * B), i0); fbr.set(s.f64(m, 3 * B), i0); slips.set(s.f64(m, 4 * B), i0); }
        }
        return { v, fbr, slips };
      },
      free() { x.bowed_string_free(h); },
    };
  };
  return {
    loopDesign, schelleng, VOICED,
    keyForce: (key, vel, force, after = 0) => VOICED[key] * force * touch(vel) * (1 + 1.5 * after),
    riseTime: (vel, attackMs) => attackMs / 1000 / (0.15 + 0.85 * vel),
    helmholtz: (beta, vB) => ({ stick: 1 - beta, vSlip: (-vB * (1 - beta)) / beta, Fpp: (2 * vB) / beta }),
    helmholtzEnvelope: (xx, L, beta, vB, f0) => (vB * xx * (L - xx)) / (f0 * beta * L * L),
    wheelOf: (key) => (key >= 75 ? 3 : key >= 60 ? 2 : key >= 48 ? 1 : 0),
    oversample: (key, fs) => x.bowed_oversample(key, fs), // each string's rate is fs × this
    // the attack map: the key's loop at its string's (oversampled) rate, and Guettler's settling time
    attackLoop: (key, P) => loopDesign(key, P, FS * x.bowed_oversample(key, FS)),
    settleTime: (key, P, vB, FN, rise, sec) => x.bowed_settle_time(key, FS, P.speed, P.beta, P.losses, P.mobility, P.torsionQ, P.mus, P.mud, P.v0, P.memory, P.grain, vB, FN, rise, sec),
    torsionEcho: (key) => x.bowed_torsion_echo(key),
    bowedString, friction,
    // the friction junction: state.s (0 sticking, ±1 slipping) is read and updated
    frictionForce(vh, vB, FN, Y, F, state) {
      const a = s.f64(1);
      a[0] = state.s;
      const f = x.bowed_friction_force(vh, vB, FN, Y, F.mus, F.mud, F.v0, s.at);
      state.s = s.f64(1)[0];
      return f;
    },
    lossFilter(f0, s0, fh, sh, fs, dur) { x.bowed_loss_filter(f0, s0, fh, sh, fs, dur, s.at); const a = s.f64(3); return { g: a[0], p: a[1], tau: a[2] }; },
    BOARD, plateYinf: () => Yinf, plateDensity: () => density,
    plateFreq: (m, n) => x.bowed_plate_freq(m, n),
    plateShape: (m, n, xx, y) => x.bowed_plate_shape(m, n, xx, y),
    stringLoad: (m, n) => x.bowed_board_load(m, n),
    wallace(m, n, f, theta, phi) { x.bowed_wallace(m, n, f, theta, phi, s.at); const a = s.f64(2); return [a[0], a[1]]; },
    boardModes(fMax, eta) {
      const max = Math.floor(s.size / 48), N = x.bowed_board_modes(fMax, eta, max, s.at), a = s.f64(6 * Math.min(N, max));
      if (N > max) throw new Error(`boardModes: ${N} modes below ${fMax} Hz, more than the scratch area holds (${max})`);
      return Array.from({ length: N }, (_, i) => ({ m: a[6 * i], n: a[6 * i + 1], f: a[6 * i + 2], sigma: a[6 * i + 3], M: a[6 * i + 4], load: a[6 * i + 5] }));
    },
  };
}

globalThis.OrganistaWasmEngine = OrganistaWasmEngine;
