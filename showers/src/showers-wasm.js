// showers-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/showers): ColliderShowersWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './showers-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'showers', name: 'ColliderShowersWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/showers.wasm', import.meta.url).href };

export const PARTICLES = ['electron', 'photon', 'pion'];
const VIEW_LONG = 14, FLEX = 8;

// The C++ engine's messages (showers-engine.h) into the page's: 'shower', a deposit's profile along
// a crystal (24 bins, per X0, as a share of the particle's energy) and what it left there; 'modes',
// a crystal's modes' amplitudes as it rings; 'hit', a pile-up photon landing.
function views(m) {
  const v = m.values;
  if (m.type === 0) {
    return { type: 'shower', key: m.key, profile: Array.from(v.subarray(0, 24)), energy: v[24], xbar: v[25], depth: v[26], start: v[27],
      particle: PARTICLES[v[28]] ?? 'electron', gev: v[29] };
  }
  if (m.type === 1) {
    return { type: 'modes', key: m.key, long: Array.from(v.subarray(0, v[22])), flex: Array.from(v.subarray(VIEW_LONG, VIEW_LONG + v[23])),
      held: v[24] > 0, damped: v[25] > 0 };
  }
  if (m.type === 2) return { type: 'hit', key: m.key, x: v[0], energy: v[1], start: v[2], depth: v[3] };
  return null;
}

export const ColliderShowersWasmEngine = wasmEngine(BUILD, { messages: views });
export const ready = () => ColliderShowersWasmEngine.ready();

// The model (showers-model.cpp), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD), NZ = x.showers_nz(), ML = x.showers_max_long(), MF = x.showers_max_flex();
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at + 8 * params.length; };
  const C = (i) => x.showers_constant(i);
  return {
    NZ, MAX_LONG: ML, MAX_FLEX: MF, FLEX,
    constants: { EC_MEV: C(0), LAMBDA_PI: C(1), LAMBDA_I: C(2), MIP_MEV: C(3), POISSON: C(4), B_EM: C(5), C_E: C(6), C_G: C(7), BH: C(8),
      R_LAT: C(9), FEM_E0: C(10), FEM_M: C(11), HAD_A0: C(12), HAD_A1: C(13), HAD_D: C(14), INVISIBLE: C(15), FEM_SPREAD: C(16) },
    BETA_L: Array.from({ length: MF }, (_, m) => x.showers_beta_l(m)),
    // a key's crystal: [{ flex, n, f, sigma, hear }], stretching modes first
    modes(key, P, fmax = 21600) {
      const out = put(P), n = x.showers_modes(key, s.at, fmax, out);
      const a = new Float64Array(x.memory.buffer, out, 5 * n);
      return Array.from({ length: n }, (_, j) => ({ flex: a[5 * j] > 0, n: a[5 * j + 1], f: a[5 * j + 2], sigma: a[5 * j + 3], hear: a[5 * j + 4] }));
    },
    // a shower: { total, start, q (per unit ζ, NZ slices), kicks: { a, b } } (seed ≥ 0 reseeds the model's generator)
    shower(particle, E, depth, { seed = -1, slender } = {}) {
      const total = x.showers_shower(PARTICLES.indexOf(particle), E, depth, seed, s.at);
      const start = s.f64(1)[0];
      const q = Float64Array.from({ length: NZ }, (_, i) => x.showers_deposit_at(i));
      let kicks = null;
      if (slender) { x.showers_kicks(slender, s.at); const k = s.f64(ML + MF); kicks = { a: Array.from(k.subarray(0, ML)), b: Array.from(k.subarray(ML)) }; }
      return { total, start, q, kicks };
    },
    // the kicks of a deposit of one's own, q per unit ζ in NZ slices
    kicksOf(q, slender) {
      for (let i = 0; i < NZ; i++) x.showers_set_deposit(i, q[i]);
      x.showers_kicks(slender, s.at); const k = s.f64(ML + MF);
      return { a: Array.from(k.subarray(0, ML)), b: Array.from(k.subarray(ML)) };
    },
    emProfile: (t, tmax) => x.showers_em_profile(t, tmax),
    emTmax: (E, photonLike = false) => x.showers_em_tmax(E, photonLike ? 1 : 0),
    gammaShare: (a, b, t) => x.showers_gamma_share(a, b, t),
    meanFem: (E) => x.showers_mean_fem(E),
    share(x0, width, j) { x.showers_share(x0, width, j, s.at); const [e, xbar] = s.f64(2); return { e, xbar }; },
    containment: (r) => x.showers_containment(r),
    flexShape: (m, z) => x.showers_flex_shape(m, z),
    flexCurvature: (m, z) => x.showers_flex_curvature(m, z),
    slenderness: (depth, width) => x.showers_slenderness(depth, width),
    longRatio: (n, slender) => x.showers_long_ratio(n, slender),
    flexRatio: (m, slender) => x.showers_flex_ratio(m, slender),
    loveModes: (slender) => x.showers_love_modes(slender),
  };
}

globalThis.ColliderShowersWasmEngine = ColliderShowersWasmEngine;
