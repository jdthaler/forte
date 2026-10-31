// hurdygurdy-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/hurdygurdy): HurdyGurdyWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './hurdygurdy-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'hurdygurdy', name: 'HurdyGurdyWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/hurdygurdy.wasm', import.meta.url).href };

export const TRACE = 1024;
export const STRINGS = ['ch1', 'ch2', 'trompette', 'mouche', 'petit', 'gros'];

// The C++ engine's messages (hurdygurdy-engine.h, msg) as the page's 'state': the chien's lift and
// the trompette's pull come first, the state last.
function views(m, e) {
  const s = (e.views ??= { type: 'state', key: 67, lift: new Float32Array(TRACE), pull: new Float32Array(TRACE) });
  const v = m.values;
  switch (m.type) {
    case 2: s.lift.set(v.subarray(1), v[0]); return null;
    case 3: s.pull.set(v.subarray(1), v[0]); return null;
    case 1:
      Object.assign(s, { key: m.key, rate: v[0], phase: v[1], vB: v[2], threshold: v[3], Ls: v[4], beta: v[5], hits: v[6], tirant: v[7],
        running: v[8] > 0, on: v[9], sounding: v[10], liftMax: v[11], surge: v[12] });
      return s;
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the tests' hooks: e.string(id) (on the wheel, its force, os, f0, length, β,
// slips, steps, Z₀) and e.crank (turns/s, phase, v_B, the hand's drive, surge, running, the
// melody's key, the chien's lift, landings and contact force).
export class HurdyGurdyWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  string(id) {
    const x = Base.exports, s = scratch(x);
    x.hurdygurdy_string_state(this.e, id, s.at);
    const a = s.f64(10);
    return { active: a[0] > 0, FN: a[1], FT: a[2], os: a[3], f0: a[4], Ls: a[5], beta: a[6], slips: a[7], steps: a[8], Z: a[9] };
  }
  get crank() {
    const x = Base.exports, s = scratch(x);
    x.hurdygurdy_crank(this.e, s.at);
    const a = s.f64(10);
    return { rate: a[0], phase: a[1], vB: a[2], drive: a[3], surge: a[4], running: a[5] > 0, melody: a[6], lift: a[7], hits: a[8], Fc: a[9] };
  }
}
export const ready = () => HurdyGurdyWasmEngine.ready();

// The model (hurdygurdy-model.h), computed by the WebAssembly: each string's design and loop,
// Schelleng's bounds, where a tangent stops the chanterelles, the voiced wheel forces, the chien's
// buzz threshold and the chien alone, the coups' shape, and the board.
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD);
  const setP = (P, at = s.at) => { new Float64Array(x.memory.buffer, at, params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return at; };
  const PAT = () => s.at + 8 * 256; // the parameters after the outputs
  const stringDesign = (id, P) => {
    x.hurdygurdy_string_design(id, setP(P, PAT()), s.at);
    const a = s.f64(8);
    return { id, f: a[0], L: a[1], mu: a[2], T: a[3], c: a[4], Z0: a[5], wound: a[6] > 0, key: a[7] };
  };
  const loop = (id, P, { Ls = 0, fs = 48000, vB } = {}) => {
    x.hurdygurdy_loop(id, Ls, setP(P, PAT()), fs, vB ?? Math.PI * x.hurdygurdy_wheel_d() * P.crank, s.at);
    const a = s.f64(9);
    return { f0: a[0], Ls: a[1], beta: a[2], N0: a[3], Db: a[4], Dn: a[5], sigma1: a[6], Fmax: a[7], Fmin: a[8] };
  };
  const B = 2048; // doubles per array in the scratch area
  return {
    WHEEL_D: x.hurdygurdy_wheel_d(), CHIEN_K: x.hurdygurdy_chien_k(), STRINGS,
    stringDesign, loop,
    stopLength: (key, P) => x.hurdygurdy_stop_length(key, setP(P, PAT())),
    voiced: (id) => x.hurdygurdy_voiced(id),
    // the tuning corrections in cents (hurdygurdy-tuning.h): tangent i (0: the open string), or drone
    // 100 + j (the trompette in D4, in C4, the mouche, the petit and the gros bourdon); set them
    // to try a correction in every engine made after
    tune: (i) => x.hurdygurdy_tune(i),
    setTune: (i, cents) => x.hurdygurdy_set_tune(i, cents),
    threshold: (P) => x.hurdygurdy_threshold(setP(P, PAT())),
    oversample: (id, fs) => x.hurdygurdy_oversample(id, fs),
    coupShape: (u, N, r) => x.hurdygurdy_coup_shape(u, N, r),
    contactZeta: (e) => x.hurdygurdy_contact_zeta(e),
    yinf: () => x.hurdygurdy_yinf(),
    boardModes(fMax) {
      const n = x.hurdygurdy_board_modes(fMax, Math.floor(s.size / 24), s.at), a = s.f64(3 * n);
      return Array.from({ length: n }, (_, i) => ({ m: a[3 * i], n: a[3 * i + 1], f: a[3 * i + 2] }));
    },
    // The chien alone: pulled by force(t) (N, a function of the time, or a number) for sec seconds
    // in steps of dt, against the tirant Ft, of mass m and restitution e, from lift y0 at speed v0.
    chien({ force, Ft, m, e, dt = 1 / 192000, sec, y0 = 0, v0 = 0 }) {
      const n = Math.round(sec / dt), y = new Float64Array(n), c = new Float64Array(n), F = typeof force === 'function' ? force : () => force;
      const st = s.f64(4, 24 * B);
      st.set([y0, v0, y0 > 1e-6 ? 1 : 0, 0]);
      for (let i0 = 0; i0 < n; i0 += B) {
        const k = Math.min(B, n - i0), f = s.f64(k);
        for (let i = 0; i < k; i++) f[i] = F((i0 + i) * dt);
        x.hurdygurdy_chien_run(k, s.at, Ft, m, e, dt, s.at + 24 * B, s.at + 8 * B, s.at + 16 * B);
        y.set(s.f64(k, 8 * B), i0); c.set(s.f64(k, 16 * B), i0);
      }
      return { y, c, hits: s.f64(4, 24 * B)[3] };
    },
  };
}

globalThis.HurdyGurdyWasmEngine = HurdyGurdyWasmEngine;
