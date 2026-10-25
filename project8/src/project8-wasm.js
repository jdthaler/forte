// project8-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/project8): Project8WasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './project8-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'project8', name: 'Project8WasmEngine', groups: GROUPS, binary: () => new URL('../wasm/project8.wasm', import.meta.url).href };

const REASONS = ['radiated out', 'knocked out', 'released', 'replaced'];
// The C++ engine's messages (project8-engine.h) into the page's: 'birth', an electron in a key's
// trap; 'frame', every trapped electron now (its frequency above the reference in MHz, as the
// receiver sees it, its carrier's amplitude, how far it bounces as a share of the walls, its bounce
// phase and frequency in the note's scale); 'collision'; 'end'.
function views(m) {
  const v = m.values;
  if (m.type === 0) {
    return { type: 'birth', key: m.key, K: v[0], cos: v[1], fGHz: v[2], cosMax: v[3], fa: v[4], faReal: v[5], h: v[6], Kref: v[7], velocity: v[8] };
  }
  if (m.type === 1) {
    const voices = [];
    for (let i = 0; i + 5 < v.length; i += 6) voices.push({ key: v[i], dfMHz: v[i + 1], amp: v[i + 2], depth: v[i + 3], psi: v[i + 4], fa: v[i + 5] });
    return { type: 'frame', voices };
  }
  if (m.type === 2) return { type: 'collision', key: m.key, elastic: v[0] > 0, loss: v[1], angle: v[2], cos: v[3], out: v[4] > 0, K: v[5], age: v[6] };
  if (m.type === 3) return { type: 'end', key: m.key, reason: REASONS[v[0]] ?? 'ended', age: v[1], K: v[2], cos: v[3] };
  return null;
}

export const Project8WasmEngine = wasmEngine(BUILD, { messages: views });
export const ready = () => Project8WasmEngine.ready();

// The model (project8-model.cpp), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at + 8 * params.length; };
  const C = (i) => x.project8_constant(i);
  const out = () => s.at + 8 * params.length; // results go past the parameters
  const read = (at, n) => Array.from(new Float64Array(x.memory.buffer, at, n));
  return {
    constants: { C: C(0), QE: C(1), ME_KG: C(2), ME_EV: C(3), EPS0: C(4), KB: C(5), HBARC_EV_NM: C(6), A0_NM: C(7), ALPHA: C(8), KR_K: C(9),
      T2_ENDPOINT: C(10), T_Z: C(11), SIGMA_INEL: C(12), SIGMA_REF_EV: C(13), ELASTIC_SHARE: C(14), GAS_T: C(15), LOSS_EXC: C(16),
      LOSS_ION: C(17), INEL_ANGLE: C(18), TF_SCREEN: C(19), GUIDE_A: C(20), TE11: C(21) },
    gyro: () => x.project8_gyro(),
    cyclotron: (B, K) => x.project8_cyclotron(B, K),
    coolingTime: (B) => x.project8_cooling_time(B),
    power: (B, K, c) => x.project8_power(B, K, c),
    // an electron cooled for t s: { K, cos, gpar, uPerp }
    cool(K, c, B, t, steps = 1) { const at = out(); x.project8_cool(K, c, B, t, steps, at); const a = read(at, 4); return { K: a[0], cos: a[1], gpar: a[2], uPerp: a[3] }; },
    // the trap for P, with an electron of energy K: { delta, cosMax, zWall, fa, f, hWall }
    trap(P, K) { const at = put(P); x.project8_trap(s.at, K, at); const a = read(at, 6); return { delta: a[0], cosMax: a[1], zWall: a[2], fa: a[3], f: a[4], hWall: a[5] }; },
    axial: (K, c, L) => x.project8_axial(K, c, L),
    guideCutoff: () => x.project8_guide_cutoff(),
    guideIndex: (f, L, cot) => x.project8_guide_index(f, L, cot),
    besselJ: (n, v) => x.project8_bessel(n, v),
    besselJd: (n, v) => x.project8_bessel_d(n, v),
    sideOn: (n, b) => x.project8_side_on(n, b),
    harmonicPower: (n, b) => x.project8_harmonic_power(n, b),
    betaSpectrum: (K) => x.project8_beta_spectrum(K),
    betaMean: () => x.project8_beta_mean(),
    collisionRate: (p, K) => x.project8_collision_rate(p, K),
    screeningAngle: (K) => x.project8_screening_angle(K),
    drawTritium(n) {
      const all = [];
      for (let i = 0; i < n; i += 4000) { const m = Math.min(4000, n - i), at = out(); x.project8_draw_tritium(m, at); all.push(...read(at, m)); }
      return all;
    },
    collide(n, K, c) {
      const all = [];
      for (let i = 0; i < n; i += 1000) {
        const m = Math.min(1000, n - i), at = out(); x.project8_collide(m, K, c, at);
        const a = read(at, 4 * m);
        for (let j = 0; j < m; j++) all.push({ elastic: a[4 * j] > 0, loss: a[4 * j + 1], angle: a[4 * j + 2], cos: a[4 * j + 3] });
      }
      return all;
    },
  };
}

globalThis.Project8WasmEngine = Project8WasmEngine;
