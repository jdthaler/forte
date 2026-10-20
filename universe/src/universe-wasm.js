// universe-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/universe): EarlyUniverseWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './universe-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'universe', name: 'EarlyUniverseWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/universe.wasm', import.meta.url).href };

// The C++ engine's messages (universe-engine.h) into the page's: 'state', where the struck key's
// universe is in its history (u: conformal time over recombination's; x1: the fundamental's
// free-streaming phase once the light is free).
function views(m) {
  const v = m.values;
  if (m.type === 0) return { type: 'state', key: m.key, u: v[0], x1: v[1], streaming: v[2] > 0, released: v[3] > 0, held: v[4] > 0, velocity: v[5] };
  return null;
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine. A note may bring the universe the page built with its own WebAssembly model
// (wasmModel().offer), so the audio thread needn't build it: { cos: [ω_b, ω_c, N_eff, Y_p, τ*,
// r_s*, k₁], table: Float32Array }.
export class EarlyUniverseWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  noteOn(key, velocity, data) {
    if (data?.table instanceof Float32Array && data.cos?.length === 7) {
      const x = Base.exports, s = scratch(x), buf = new Float32Array(x.memory.buffer, x.universe_offer_buffer(), data.table.length);
      buf.set(data.table);
      s.f64(7).set(data.cos);
      x.universe_offer(this.e, s.at);
    }
    super.noteOn(key, velocity);
  }
}
export const ready = () => EarlyUniverseWasmEngine.ready();

const BG = ['zEq', 'tauEq', 'zStar', 'tauStar', 'rsStar', 'kdStar', 'ageStar', 'RStar', 'og', 'onu', 'om', 'nH0', 'fHe', 'A', 'B'];
const OUT = ['sky', 'doppler', 'plasma', 'phi', 'psi', 'dg', 'theta', 'dc'];
const cosmology = (P) => [P.baryons, P.darkMatter, P.neutrinos, P.helium];

// The model (universe-model.cpp), computed by the WebAssembly. The background functions answer for
// the cosmology the last background(P) was for.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const H = x.universe_harmonics(), NT = x.universe_nt();
  let cache = null;
  return {
    HARMONICS: H, NT,
    // the background's numbers for P's cosmology
    background(P) {
      x.universe_background(...cosmology(P), s.at);
      const a = s.f64(BG.length);
      return Object.fromEntries(BG.map((k, i) => [k, a[i]]));
    },
    a: (tau) => x.universe_a(tau),
    tauOf: (a) => x.universe_tau_of(a),
    hubble: (tau) => x.universe_hubble(tau),
    R: (tau) => x.universe_r(tau),
    xe: (z) => x.universe_xe(z),
    opacity: (tau) => x.universe_opacity(tau),
    visibility: (tau) => x.universe_visibility(tau),
    rs: (tau) => x.universe_rs(tau),
    damping: (tau) => x.universe_damping(tau),
    dampingRate: (tau) => x.universe_damping_rate(tau),
    // a wave k (Mpc⁻¹) at the conformal times ts (Mpc), in the last background: [{ sky, doppler, plasma, phi, psi, dg, theta, dc }]
    evolve(k, ts, { damp = true } = {}) {
      const n = ts.length, at = s.at + 8 * n;
      if (72 * n > s.size) throw new Error('too many times');
      s.f64(n).set(ts);
      x.universe_evolve(k, s.at, n, at, damp ? 1 : 0);
      const a = new Float64Array(x.memory.buffer, at, 8 * n);
      return Array.from({ length: n }, (_, i) => Object.fromEntries(OUT.map((key, j) => [key, a[8 * i + j]])));
    },
    // the universe the engine plays for P: each harmonic's sky, Doppler and plasma at NT times from
    // the beginning to recombination; what a note offers the engine (offer); cached per cosmology
    universe(P) {
      const c = cosmology(P), id = c.join();
      if (cache?.id === id) return cache;
      const ptr = x.universe_build(...c, s.at), [tauStar, rsStar, k1] = s.f64(3);
      const table = new Float32Array(x.memory.buffer, ptr, 3 * H * NT).slice();
      const part = (i) => Array.from({ length: H }, (_, m) => table.subarray((i * H + m) * NT, (i * H + m + 1) * NT));
      cache = { id, tauStar, rsStar, k1, table, sky: part(0), doppler: part(1), plasma: part(2), offer: { cos: [...c, tauStar, rsStar, k1], table } };
      return cache;
    },
  };
}

globalThis.EarlyUniverseWasmEngine = EarlyUniverseWasmEngine;
