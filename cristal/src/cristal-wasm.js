// cristal-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/cristal): CristalWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './cristal-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';
import { tuningRatio } from '../../shared/tuning.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'cristal', name: 'CristalWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/cristal.wasm', import.meta.url).href };

export const TRACE = 1024; // samples of the rod's motion for the view (cristal-engine.h)
const MODES = 6;

// The C++ engine's messages (cristal-engine.h, msg) into the views' 'state': the focused rod's
// trace comes first, the state last.
function views(m, e) {
  const s = (e.views ??= { type: 'state', key: -1, pos: 0, uf: 0, N: 0, touch: false, stick: false, amp: 0, f0: 0, len: 0, height: 0.5, weight: 0, phase: 0,
    trV: new Float32Array(TRACE), trU: new Float32Array(TRACE) });
  const v = m.values;
  switch (m.type) {
    case 2: s.trV.set(v.subarray(1), v[0]); return null;
    case 3: s.trU.set(v.subarray(1), v[0]); return null;
    case 1: // key; pos, uf, N, touch, stick, amp, f0, len, height, weight, phase
      Object.assign(s, { key: m.key, pos: v[0], uf: v[1], N: v[2], touch: v[3] > 0, stick: v[4] > 0, amp: v[5], f0: v[6], len: v[7], height: v[8], weight: v[9], phase: v[10] });
      return s;
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// a stem from its flat form (cristal-web.cpp, putStem)
function stemOf(key, a) {
  const modes = [];
  for (let i = 0; i < a[4]; i++) modes.push({ f: a[6 + 4 * i], zeta: a[7 + 4 * i], tip: a[8 + 4 * i], col: a[9 + 4 * i] });
  return { key, f0: a[0], len: a[1], weight: a[2], height: a[3], main: a[5], modes };
}
const STEM_SIZE = 6 + 4 * MODES;
const STATE = ['key', 'Nreg', 'Nn', 'touch', 'N', 'uf', 'v', 'F', 'stick', 'phase', 'pos', 'peak'];

// The engine, with the tests' hooks: e.voices (each voice's state and stem), the focused rod's
// trace (e.trV, e.trU, e.tw) and the collector's velocity (e.collector, e.whiskers).
export class CristalWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get voices() {
    const x = Base.exports, e = this.e, s = scratch(x);
    return Array.from({ length: x.cristal_voice_count(e) }, (_, i) => {
      x.cristal_voice_state(e, i, s.at);
      const a = s.f64(STATE.length), o = Object.fromEntries(STATE.map((k, j) => [k, a[j]]));
      o.touch = o.touch > 0; o.stick = o.stick > 0;
      x.cristal_voice_stem(e, i, s.at);
      o.stem = stemOf(o.key, s.f64(STEM_SIZE));
      return o;
    });
  }
  ready(key) { return Base.exports.cristal_ready(this.e, key); }
  get trV() { const x = Base.exports; return new Float32Array(x.memory.buffer, x.cristal_trace(this.e, 0), TRACE); }
  get trU() { const x = Base.exports; return new Float32Array(x.memory.buffer, x.cristal_trace(this.e, 1), TRACE); }
  get tw() { return Base.exports.cristal_trace_pos(this.e); }
  get collector() { return Base.exports.cristal_collector(this.e, 0); }
  get whiskers() { return Base.exports.cristal_collector(this.e, 1); }
}
export const ready = () => CristalWasmEngine.ready();

// The model's functions (cristal-model.h), computed by the WebAssembly. A stem is cut to its key's
// tuning (shared/tuning.js tuningRatio, from P's pitch and temperament).
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  x.cristal_constants(s.at);
  const [KEY_LO, KEY_HI, , ROD_L, ROD_D, ROD_M, STEM_D, STROKE, COLLECTOR_M, COLLECTOR_F, U_REF, WHISKERS] = Array.from(s.f64(13));
  const stemAt = (key, P) => { x.cristal_stem(key, P.height ?? 0.5, P.loss ?? 9e-4, tuningRatio(P, key), s.at); return stemOf(key, s.f64(STEM_SIZE)); };
  const cache = new Map(); // the views ask for the same stem every frame
  return {
    KEY_LO, KEY_HI, ROD_L, ROD_D, ROD_M, STEM_D, STROKE, COLLECTOR_M, COLLECTOR_F, U_REF, WHISKERS,
    stem(key, P) {
      const id = `${key}|${P.height}|${P.loss}|${tuningRatio(P, key)}`;
      if (!cache.has(id)) { if (cache.size > 200) cache.clear(); cache.set(id, stemAt(key, P)); }
      return cache.get(id);
    },
    stemModes(len, h, w, zeta) {
      const n = x.cristal_stem_modes(len, h, w, zeta, s.at), a = s.f64(4 * n);
      return Array.from({ length: n }, (_, i) => ({ f: a[4 * i], zeta: a[4 * i + 1], tip: a[4 * i + 2], col: a[4 * i + 3] }));
    },
    friction(wet) { x.cristal_friction(wet, s.at); const a = s.f64(4); return { mus: a[0], mud: a[1], v0: a[2], noise: a[3] }; },
    mu: (u, wet) => x.cristal_mu(u, wet),
    threshold: (m, uf, wet) => x.cristal_threshold(m.f, m.zeta, m.tip, uf, wet),
    maxForce: (m, uf, wet) => x.cristal_max_force(m.f, m.zeta, m.tip, uf, wet),
    regulation: (key) => x.cristal_regulation(key),
    tuningWeight: (key) => x.cristal_tuning_weight(key),
    cut: (key) => x.cristal_cut(key),
    whiskerLength: (i) => x.cristal_whisker_length(i),
    whiskerStretch: (i, n) => x.cristal_whisker_stretch(i, n),
    whiskerSway: (i) => x.cristal_whisker_sway(i),
  };
}

globalThis.CristalWasmEngine = CristalWasmEngine;
