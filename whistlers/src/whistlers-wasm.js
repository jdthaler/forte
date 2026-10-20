// whistlers-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/whistlers): WhistlersWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './whistlers-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'whistlers', name: 'WhistlersWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/whistlers.wasm', import.meta.url).href };

// The C++ engine's messages (whistlers-engine.h) into the page's: 'stroke', a lightning stroke heard
// on a key's field line (the line, its nose, and where the engine's clock starts); 'chorus', a
// chorus element starting.
function views(m) {
  const v = m.values;
  if (m.type === 0) {
    return { type: 'stroke', key: m.key, L: v[0], fce: v[1], fn: v[2], tn: v[3], clock: v[4], travel: v[5] > 0, neq: v[6], alpha: v[7],
      ducts: v[8], hop: v[9], velocity: v[10], echo: v[11] };
  }
  if (m.type === 1) return { type: 'chorus', key: m.key, f0: v[0], f1: v[1], dur: v[2] };
  return null;
}

export const WhistlersWasmEngine = wasmEngine(BUILD, { messages: views });
export const ready = () => WhistlersWasmEngine.ready();

// The model (whistlers-model.cpp), computed by the WebAssembly. Lines are named by L (Earth radii).
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at + 8 * params.length; };
  const C = (i) => x.whistlers_constant(i);
  const NT = C(17);
  return {
    constants: { F_CE1: C(0), FPE_K: C(1), C_KM: C(2), RE_KM: C(3), TOP_KM: C(4), CA_A: C(5), CA_B: C(6), CA_DL: C(7), CA_TROUGH: C(8),
      ALPHA_PS: C(9), ALPHA_TROUGH: C(10), DUCT_CUTOFF: C(11), DUCT_EDGE: C(12), STROKE_T1: C(13), STROKE_T2: C(14), BOUNCE_R: C(15),
      NLO: C(16), NT, LOW_SPAN: C(18), B0_NT: C(19), GYRO_HZ_PER_NT: C(20) },
    // the field line whose nose is f Hz
    lineFor(f, P) { put(P); return x.whistlers_line_for(f, s.at); },
    // the line at L: { L, fce, neq, alpha, lam0, nose: { f, tau, tau2 } }
    line(L, P) {
      const out = put(P); x.whistlers_line(L, s.at, out);
      const a = new Float64Array(x.memory.buffer, out, 7);
      return { L, fce: a[0], neq: a[1], alpha: a[2], lam0: a[3], nose: { f: a[4], tau: a[5], tau2: a[6] } };
    },
    delay(L, P, f) { put(P); return x.whistlers_delay(L, s.at, f); },
    delayTo(L, P, f, lam) { put(P); return x.whistlers_delay_to(L, s.at, f, lam); },
    // the engine's track at L: { f, tau, amp, cap, ta } (the lower branch, nose last, then the upper)
    track(L, P) {
      const out = put(P); x.whistlers_track(L, s.at, out);
      const a = new Float64Array(x.memory.buffer, out, 3 * NT + 2);
      return { f: Array.from(a.subarray(0, NT)), tau: Array.from(a.subarray(NT, 2 * NT)), amp: Array.from(a.subarray(2 * NT, 3 * NT)), cap: a[3 * NT], ta: a[3 * NT + 1] };
    },
    density: (L, lpp, scale = 1) => x.whistlers_density(L, lpp, scale),
    alpha: (L, lpp) => x.whistlers_alpha(L, lpp),
    fce: (L) => x.whistlers_fce(L),
    groupIndex: (fpe, fce, f) => x.whistlers_group_index(fpe, fce, f),
    stroke: (f) => x.whistlers_stroke(f),
    tweekCutoff: (m, h) => x.whistlers_tweek_cutoff(m, h),
    tweekFreq: (m, h, d, t) => x.whistlers_tweek_freq(m, h, d, t),
    tweekStart: (m, h, d, ftop) => x.whistlers_tweek_start(m, h, d, ftop),
    tweekAmp: (m, h, d, f) => x.whistlers_tweek_amp(m, h, d, f),
  };
}

globalThis.WhistlersWasmEngine = WhistlersWasmEngine;
