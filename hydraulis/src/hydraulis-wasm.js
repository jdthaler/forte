// hydraulis-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/hydraulis): HydraulisWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './hydraulis-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'hydraulis', name: 'HydraulisWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/hydraulis.wasm', import.meta.url).href };

const STATE = ['pc', 'dV', 'Vrim', 'Qw', 'Qpump', 'Qdraw', 'Qesc', 'piston1', 'piston2', 'effort', 'pRim', 'fBounce', 'pipes', 'bubbles', 'pumps', 'open', 'strokes'];

// The C++ engine's messages (hydraulis-engine.h, msg) into the page's 'wind': the keys sounding
// come first, the state after. One object, kept.
function views(m, e) {
  const s = (e.view ??= { type: 'wind', key: 0, fs: e.fs, keys: [] });
  const v = m.values;
  if (m.type === 2) { s.keys = Array.from({ length: v.length / 2 }, (_, i) => ({ key: v[2 * i], open: v[2 * i + 1] })); return null; }
  if (m.type !== 1) return null;
  STATE.forEach((k, i) => { s[k] = v[i]; });
  s.key = m.key;
  return s;
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine's state (the tests read some of it), over the C++ engine's memory.
const WIND = { pc: 0, dV: 1, Qw: 2, Qdraw: 3, Qpump: 4, Qesc: 5, effort: 6, strokes: 7, bubbles: 8, cycling: 9 };
const VOICE = { key: 0, down: 1, fading: 2, s: 3, open: 4, env: 5, fade: 6 };
const PIPE = { freq: 0, foot: 1, Uj: 2, asleep: 3, os: 4, modes: 5, f: 6 };

const freed = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry((h) => Base.exports.forte_destroy(h)) : null;

// The engine, with the constructor (fs, seed, { track, still }) and test hooks: e.wind() (the
// pressure, the water and the flows), e.setWind(field, value), e.voices() (each voice's slide and
// its pipes) and e.ready(key). A note may bring its key's pipes, packed by the page's WebAssembly
// model (wasmModel().keyModels), so the audio thread needn't voice them.
export class HydraulisWasmEngine extends Base {
  constructor(fs, seed, { track, still } = {}) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
    if ((seed !== undefined && seed !== 1) || track || still) Base.exports.hydraulis_configure(this.e, (seed ?? 1) >>> 0, track ? 1 : 0, still ? 1 : 0);
    freed?.register(this, this.h, this);
  }
  destroy() { freed?.unregister(this); super.destroy(); }
  noteOn(key, velocity = 0.7, data) {
    const x = Base.exports;
    const packed = this.modelsFor ? this.modelsFor(key) : data instanceof Float64Array ? data : null;
    if (packed) {
      const s = scratch(x);
      if (packed.length * 8 <= s.size) { s.f64(packed.length).set(packed); (this.modelsFor ? x.hydraulis_use_models : x.hydraulis_offer)(this.e, s.at, packed.length); }
    }
    super.noteOn(key, velocity);
  }
  ready(key) { return Base.exports.hydraulis_ready(this.e, key) !== 0; }
  wind() { const x = Base.exports; return Object.fromEntries(Object.entries(WIND).map(([k, i]) => [k, x.hydraulis_wind(this.e, i)])); }
  setWind(k, v) { Base.exports.hydraulis_set_wind(this.e, WIND[k], v); }
  voices() {
    const x = Base.exports;
    return Array.from({ length: x.hydraulis_voices(this.e) }, (_, i) => {
      const p = x.hydraulis_voice(this.e, i);
      const v = Object.fromEntries(Object.entries(VOICE).map(([k, j]) => [k, x.hydraulis_voice_get(p, j)]));
      v.pipes = Array.from({ length: 4 }, (_, r) => Object.fromEntries(Object.entries(PIPE).map(([k, j]) => [k, x.hydraulis_pipe_get(p, r, j)])));
      return v;
    });
  }
}
export const ready = () => HydraulisWasmEngine.ready();

// The model's functions (hydraulis-model.h), computed by the WebAssembly.
const PIPE_MODEL = ['f', 'stopped', 'theta', 'D', 'H', 'h', 'W', 'A', 'M', 'Le', 'L', 'fRes', 'Q1', 'gain', 'nModes'];
const CISTERN = ['Ain', 'Aout', 'Mw', 'Ch', 'Ca', 'Rw', 'xRim', 'Vrim', 'pRim', 'fb'];
const CONSTANTS = ['HOLE_FLUE', 'MARGIN', 'CD_HOLE', 'STROKE_V', 'PISTON_A', 'DELIVER', 'D_REF', 'RHO_W', 'G', 'P0', 'KEY_LO', 'KEY_HI', 'R_VALVE'];
export async function wasmModel() {
  const x = await ready(), s = scratch(x), OUT = 8 * 256, params = nativeParams(BUILD);
  const setP = (P) => { s.f64(params.length, OUT).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at + OUT; };
  x.hydraulis_constants(s.at);
  const C = Object.fromEntries(CONSTANTS.map((k, i) => [k, s.f64(CONSTANTS.length)[i]]));
  return {
    ...C,
    pipeModel(f, stopped, P = {}, tune = 0) {
      const n = x.hydraulis_pipe_model(f, stopped ? 1 : 0, P.bore ?? 0.21, P.cutup ?? 1, P.gain ?? 1, P.offset ?? 0.4, tune, s.at), a = s.f64(n);
      const R = Object.fromEntries(PIPE_MODEL.map((k, i) => [k, a[i]]));
      R.stopped = R.stopped > 0;
      R.modes = Array.from({ length: R.nModes }, (_, j) => ({ f: a[PIPE_MODEL.length + 3 * j], sigma: a[PIPE_MODEL.length + 3 * j + 1], Q: a[PIPE_MODEL.length + 3 * j + 2] }));
      delete R.nModes;
      return R;
    },
    // mode n's root at foot pressure p, { re, im } (Re s > 0: it grows), or null
    linearRoot(f, stopped, P = {}, p = 700, n = 0, tune = 0) {
      return x.hydraulis_linear_root(f, stopped ? 1 : 0, P.bore ?? 0.21, P.cutup ?? 1, P.gain ?? 1, P.offset ?? 0.4, tune, p, n, s.at) ? (([re, im]) => ({ re, im }))(s.f64(2)) : null;
    },
    pipeFreq: (key, r, ratio = 1) => x.hydraulis_pipe_freq(key, r, ratio), // ratio: the keyboard's tuning for the key
    tuning: (f, stopped) => x.hydraulis_tuning(f, stopped ? 1 : 0),
    boreD: (f, bore, stopped = false) => x.hydraulis_bore(f, bore, stopped ? 1 : 0),
    lensArea: (r, d) => x.hydraulis_lens(r, d),
    slideOpen: (sIn) => x.hydraulis_slide_open(sIn),
    pushTime: (v, push) => x.hydraulis_push_time(v, push),
    springOmega: (ms) => x.hydraulis_spring_omega(ms),
    strokeTime: (e) => x.hydraulis_stroke_time(e),
    pistonFlow: (push, p, t, share, T) => x.hydraulis_piston_flow(push, p, t, share, T),
    pushPressure: (effort, pRim) => x.hydraulis_push_pressure(effort, pRim),
    minnaert: (R) => x.hydraulis_minnaert(R),
    rowPan: (key) => x.hydraulis_row_pan(key),
    cistern(size, pRim) { x.hydraulis_cistern(size, pRim, s.at); const a = s.f64(CISTERN.length); return Object.fromEntries(CISTERN.map((k, i) => [k, a[i]])); },
    pipePacked(f, stopped, P = {}, tune = 0) { // one pipe in every rank of a key, packed (for the engine's modelsFor)
      const n = x.hydraulis_pipe_packed(f, stopped ? 1 : 0, P.bore ?? 0.21, P.cutup ?? 1, P.gain ?? 1, P.offset ?? 0.4, tune, s.at);
      return s.f64(n).slice();
    },
    keyModels(key, P) { const n = x.hydraulis_key_models(key, setP(P), s.at); return s.f64(n).slice(); }, // (cut for the keyboard's tuning, P's)
  };
}

globalThis.HydraulisWasmEngine = HydraulisWasmEngine;
