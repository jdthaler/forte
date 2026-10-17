// pipes-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/pipes): PipeWasmEngine, with the engine contract, and the model's functions
// for the views. The page runs it when it can and falls back to the JavaScript (pipes-engine.js).

import { GROUPS } from './pipes-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'pipes', name: 'PipeWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/pipes.wasm', import.meta.url).href };

const TRACE = 256;
const TRACES = ['v', 'dp', 'eta', 'qin'];
const HEAD = ['Pc', 'Pr', 'Pset', 'Q', 'pipes', 'trem'];
const FOCUS = ['rank', 'f', 'W', 'b', 'h', 'H', 'D', 'A', 'y0', 'Uj', 'foot', 'theta', 'tau', 'n', 'dt'];

// The C++ engine's messages (pipes-engine.h, msg) back into the JavaScript engine's 'pipe': the
// focused pipe's traces come in pieces first, the state last. One object, kept, as the JavaScript
// keeps it.
function views(m, e) {
  const s = (e.view ??= { type: 'pipe', key: 0, rank: 0, fs: e.fs, n: 0, dt: 0, ...Object.fromEntries(TRACES.map((k) => [k, new Float64Array(TRACE)])) });
  const v = m.values;
  if (m.type >= 2 && m.type <= 5) { s[TRACES[m.type - 2]].set(v.subarray(1), v[0]); return null; }
  if (m.type !== 1) return null;
  HEAD.forEach((k, i) => { s[k] = v[i]; });
  s.key = m.key;
  if (!m.key) s.n = 0;
  else FOCUS.forEach((k, i) => { s[k] = v[6 + i]; });
  return s;
}

const Base = wasmEngine(BUILD, { messages: views });

// A key's six pipes as the JavaScript model builds them (pipeModel), packed as pipes-engine.h's
// packKeyModels has them.
export function packModels(key, models, P = {}) {
  const out = [key, P.cutup ?? 1, P.gain ?? 1, P.offset ?? 0.4];
  for (const R of models) {
    const g = R.geo;
    out.push(R.f, R.stopped ? 1 : 0, R.M, R.A, g.W, g.b, g.H, g.y0, g.h, g.dd, g.Sm, g.D, R.modes.length);
    for (const m of R.modes) out.push(m.om, m.sigma);
  }
  return Float64Array.from(out);
}

// The engine's state as the JavaScript engine's fields (the tests read and write some of them),
// over the C++ engine's memory.
const VOICE = { key: 0, fading: 1, dead: 2, down: 3, a: 4, aTarget: 5, kPal: 6, age: 7, env: 8, fade: 9, pg: 10 };
const FLAGS = new Set(['fading', 'dead', 'down']);
const PIPE = { foot: 1, vm: 2, qin: 3, bH: 4, y0: 5, ib: 6, asleep: 7, Uj: 8, eta: 9, dp: 10, nx: 11, os: 12, rank: 13, lp: 14, Q: 15 };
const WIND = { Pset: 0, Pr: 1, Pc: 2, Qt: 3, Qdraw: 4, Qtrem: 5 };
function fields(proto, map, get, set, flags = new Set()) {
  for (const [k, i] of Object.entries(map)) {
    Object.defineProperty(proto, k, {
      get() { const v = get(this.p, i); return flags.has(k) ? v > 0 : v; },
      set(v) { set(this.p, i, +v); },
    });
  }
}
class PipeState {
  constructor(p) { this.p = p; }
  freq() { return Base.exports.pipes_pipe_get(this.p, 0); }
  get v() { const x = Base.exports; return new Float64Array(x.memory.buffer, x.pipes_pipe_v(this.p), x.pipes_pipe_modes(this.p)); }
  get x() { const x = Base.exports; return new Float64Array(x.memory.buffer, x.pipes_pipe_x(this.p), x.pipes_pipe_modes(this.p)); }
}
class VoiceState {
  constructor(p) { this.p = p; this.pipes = Array.from({ length: 6 }, (_, r) => new PipeState(Base.exports.pipes_voice_pipe(p, r))); }
}
let hooked = false;
function hook() { // once loaded: the fields go through the exports
  if (hooked) return;
  hooked = true;
  const x = Base.exports;
  fields(PipeState.prototype, PIPE, (p, i) => x.pipes_pipe_get(p, i), (p, i, v) => x.pipes_pipe_set(p, i, v), new Set(['asleep']));
  fields(VoiceState.prototype, VOICE, (p, i) => x.pipes_voice_get(p, i), (p, i, v) => x.pipes_voice_set(p, i, v), FLAGS);
  fields(PipeWasmEngine.prototype, WIND, (p, i) => x.pipes_wind(p, i), (p, i, v) => x.pipes_set_wind(p, i, v));
}

// The tests make many engines and drop them: free each one's memory when it is collected.
const freed = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry((h) => Base.exports.forte_destroy(h)) : null;

// The engine, with the JavaScript engine's constructor (fs, seed, { track }) and test hooks:
// e.Pset, e.Pr, e.Pc (read and written), e.noise (the turbulence table, in place), e.voices and
// e.byKey (each voice's pallet and pipes, some fields writable) and e.modelsFor (set it to play
// the JavaScript model's pipes instead). A note may bring its key's pipes, packed by the page's
// WebAssembly model (wasmModel().keyModels), so the audio thread needn't voice them.
export class PipeWasmEngine extends Base {
  constructor(fs, seed, { track } = {}) {
    super(fs);
    hook();
    this.e = Base.exports.forte_engine(this.h);
    this.p = this.e;
    if ((seed !== undefined && seed !== 1) || track) Base.exports.pipes_configure(this.e, (seed ?? 1) >>> 0, track ? 1 : 0);
    freed?.register(this, this.h, this);
  }
  destroy() { freed?.unregister(this); super.destroy(); }
  noteOn(key, velocity = 0.7, data) {
    const x = Base.exports;
    const packed = this.modelsFor ? packModels(key, this.modelsFor(key), this.P) : data instanceof Float64Array ? data : null;
    if (packed) {
      const s = scratch(x);
      if (packed.length * 8 <= s.size) { s.f64(packed.length).set(packed); (this.modelsFor ? x.pipes_use_models : x.pipes_offer)(this.e, s.at, packed.length); }
    }
    super.noteOn(key, velocity);
  }
  setParams(P) { this.P = P; super.setParams(P); }
  get noise() { const x = Base.exports; return new Float64Array(x.memory.buffer, x.pipes_noise(this.e), 16384); }
  get voices() {
    const x = Base.exports;
    return Array.from({ length: x.pipes_voices(this.e) }, (_, i) => new VoiceState(x.pipes_voice(this.e, i)));
  }
  get byKey() {
    const x = Base.exports, e = this.e;
    return { get: (key) => { const p = x.pipes_by_key(e, key); return p ? new VoiceState(p) : undefined; }, has: (key) => x.pipes_by_key(e, key) !== 0 };
  }
}
export const ready = () => PipeWasmEngine.ready();

// The model's functions the views call (pipes-model.js's pipeModel and pipeFreq, tuning-table.js's
// lookup), computed by the WebAssembly, and keyModels: a key's six pipes packed for the
// WebAssembly engine (the page sends them with the note).
const PIPE_MODEL = ['f', 'stopped', 'theta', 'D', 'a', 'Sp', 'H', 'h', 'dLt', 'W', 'b', 'y0', 'dd', 'Sm', 'Kj', 'dLm', 'A', 'M', 'Le', 'L', 'fRes', 'Q1', 'gain', 'nModes'];
const GEO = new Set(['D', 'a', 'Sp', 'H', 'h', 'dLt', 'W', 'b', 'y0', 'dd', 'Sm', 'Kj', 'dLm']);
const MODE = ['n', 'f', 'om', 'sigma', 'Q', 'harm'];
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  return {
    pipeModel(f, stopped, P = {}, opts = {}) {
      const n = x.pipes_pipe_model(f, stopped ? 1 : 0, P.cutup ?? 1, P.gain ?? 1, P.offset ?? 0.4, opts.tune ?? 0, s.at), a = s.f64(n);
      const R = { geo: { stopped: !!stopped }, modes: [] };
      PIPE_MODEL.forEach((k, i) => { if (GEO.has(k)) R.geo[k] = a[i]; else R[k] = a[i]; });
      R.stopped = R.stopped > 0; R.Kj = R.geo.Kj;
      for (let j = 0; j < R.nModes; j++) R.modes.push(Object.fromEntries(MODE.map((k, i) => [k, a[PIPE_MODEL.length + MODE.length * j + i]])));
      delete R.nModes;
      return R;
    },
    pipeFreq: (key, r) => x.pipes_pipe_freq(key, r),
    tuning: (f, stopped) => x.pipes_tuning(f, stopped ? 1 : 0),
    keyModels(key, P) {
      const n = x.pipes_key_models(key, P.cutup, P.gain, P.offset, s.at);
      return s.f64(n).slice();
    },
  };
}

globalThis.PipeWasmEngine = PipeWasmEngine;
