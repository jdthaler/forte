// template-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/template): TemplateWasmEngine, with the engine contract, and the model's
// functions for the views. The page runs it when it can and falls back to the JavaScript
// (template-engine.js).

import { GROUPS } from './template-params.js';
import { wasmEngine, nativeParams, scratch } from '../../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'template', name: 'TemplateWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/template.wasm', import.meta.url).href };
export const TemplateWasmEngine = wasmEngine(BUILD);
export const ready = () => TemplateWasmEngine.ready();

// The model (template-model.js's keyModes, modeShape, BETA_L), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const BETA_L = Array.from({ length: x.template_mode_count() }, (_, n) => x.template_beta_l(n));
  return {
    BETA_L,
    modeShape: (n, v) => x.template_mode_shape(n, v),
    keyModes(key, P) {
      s.f64(params.length).set(params.map((p) => P[p.id]));
      const out = s.at + 8 * params.length, n = x.template_key_modes(key, s.at, out);
      const m = new Float64Array(x.memory.buffer, out, 3 * n);
      return Array.from({ length: n }, (_, i) => ({ f: m[3 * i], sigma: m[3 * i + 1], amp: m[3 * i + 2] }));
    },
  };
}

globalThis.TemplateWasmEngine = TemplateWasmEngine;
