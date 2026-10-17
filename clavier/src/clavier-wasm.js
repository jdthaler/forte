// clavier-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/clavier): ClavierWasmEngine, with the engine contract, and the model's
// functions for the views. The page runs it when it can and falls back to the JavaScript
// (clavier-engine.js).

import { GROUPS } from './clavier-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'clavier', name: 'ClavierWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/clavier.wasm', import.meta.url).href };
const PICKUPS = GROUPS.flatMap((g) => g.params).find((p) => p.id === 'pickup').options.map(([v]) => v);

// The C++ engine's messages (clavier-engine.h, msg) back into the JavaScript engine's.
function messages(m) {
  return m.type === 1 ? { type: 'error', key: m.key, message: 'numerical instability' } : null;
}

const Base = wasmEngine(BUILD, { messages });

// A string's design and modes, as the C++ writes them (clavier-web.cpp).
const DESIGN = ['key', 'f0', 'L', 'Ln', 'wound', 'd', 'D', 'mu', 'A', 'EA', 'EI', 'T', 'T0', 'dTnom', 'dLnom', 'gap', 'B', 'stress', 'c', 'mag', 'pull', 'fRelease'];
const design = (a) => { const S = Object.fromEntries(DESIGN.map((k, i) => [k, a[i]])); S.wound = S.wound > 0; return S; };
const MODE = ['n', 'f', 'sigma', 'a1', 'a2', 'b', 'kn'], YARN = ['m', 'km', 'f', 'sigma', 'a1', 'a2', 'b'];
const rows = (a, keys, n) => Array.from({ length: n }, (_, i) => Object.fromEntries(keys.map((k, j) => [k, a[keys.length * i + j]])));

// One of the engine's voices, as the test suite and the page's slow motion reach into the
// JavaScript engine's: its state read from, and written to, the C++; its arrays as views of the
// engine's memory (q and q1 as they stand now: the C++ swaps them every sample, as the JavaScript does).
const FIELDS = ['key', 'N', 'M', 's', 's1', 'eta', 'eta1', 'C1', 'C0', 'um', 'Q', 'Flp', 'Fr', 'Fa', 'force', 'Pl', 'Pu', 'ul', 'uu', 'kcGain', 'Kr', 'wrapK',
  'mass', 'Cb', 'Cy', 'ms', 'pressure', 'fade', 'peak', 'Fpeak', 'quiet', 'down', 'thrown', 'dead', 'killing', 'version', 'xl', 'xu', 'gl',
  'gu', 'lam', 'xm', 'Pb', 'Pg'];
const FLAGS = new Set(['down', 'thrown', 'dead', 'killing']);
const ARRAYS = ['q', 'q1', 'r', 'r1', 'c', 'w', 'A1', 'A2', 'eps', 'beta', 'phi', 'gam', 'Wl', 'Wu', 'B1', 'B2', 'by'];
const OF_YARN = new Set(['r', 'r1', 'B1', 'B2', 'by']);
class WasmVoice {
  constructor(ptr) { this.p = ptr; }
  get mdl() { // (fixed for the voice's life)
    if (!this._mdl) {
      const x = Base.exports, s = scratch(x), n = x.clavier_voice_modes(this.p, s.at);
      this._mdl = { modes: rows(s.f64(7 * n), MODE, n) };
    }
    return this._mdl;
  }
  get S() {
    if (!this._S) { const x = Base.exports, s = scratch(x); x.clavier_voice_design(this.p, s.at); this._S = design(s.f64(DESIGN.length)); }
    return this._S;
  }
}
FIELDS.forEach((f, i) => Object.defineProperty(WasmVoice.prototype, f, {
  get() { const v = Base.exports.clavier_voice_get(this.p, i); return FLAGS.has(f) ? v > 0 : v; },
  set(v) { Base.exports.clavier_voice_set(this.p, i, v); },
}));
ARRAYS.forEach((f, i) => Object.defineProperty(WasmVoice.prototype, f, {
  get() { const x = Base.exports; return new Float64Array(x.memory.buffer, x.clavier_voice_array(this.p, i), OF_YARN.has(f) ? this.M : this.N); },
}));

// The engine, with the JavaScript engine's hooks: e.voices and e.byKey (WasmVoices), e.muteLevel.
export class ClavierWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get voices() {
    const x = Base.exports;
    return Array.from({ length: x.clavier_voices(this.e) }, (_, i) => new WasmVoice(x.clavier_voice(this.e, i)));
  }
  get byKey() {
    const x = Base.exports, map = new Map();
    for (const v of this.voices) if (x.clavier_by_key(this.e, v.key) === v.p) map.set(v.key, v);
    return map;
  }
  get muteLevel() { return Base.exports.clavier_mute_level(this.e); }
  set muteLevel(v) { Base.exports.clavier_set_mute_level(this.e, v); }
}
export const ready = () => ClavierWasmEngine.ready();

// The model's functions the views call (clavier-model.js's stringDesign, keyModel, releasedFreqs,
// pickupX, pickupMix, pickupWeight, pressureCents, toneResponse), computed by the WebAssembly, and
// the engine the page's slow motion runs.
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD), OUT = 256;
  const setP = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; };
  const out = (n) => s.f64(n, OUT);
  const model = {
    Engine: ClavierWasmEngine,
    stringDesign(key, P) { x.clavier_string_design(key, setP(P), s.at + OUT); return design(out(DESIGN.length)); },
    keyModel(key, P, fs) {
      const S = model.stringDesign(key, P), n = x.clavier_key_model(key, setP(P), fs, s.at + OUT);
      const head = out(3), m = head[2], a = out(3 + 7 * (n + m)).slice(3);
      return { S, modes: rows(a, MODE, n), yarn: rows(a.subarray(7 * n), YARN, m), X: { lower: head[0], upper: head[1] } };
    },
    releasedFreqs(key, P, count = 6) {
      const n = x.clavier_released_freqs(key, setP(P), count, s.at + OUT);
      if (!n && count > 0) throw new Error('releasedFreqs: the eigenproblem failed');
      return Array.from(out(n));
    },
    pickupX(key, P) { x.clavier_pickup_x(key, setP(P), s.at + OUT); const [lower, upper] = out(2); return { lower, upper }; },
    pickupMix(sel) { x.clavier_pickup_mix(PICKUPS.indexOf(sel), s.at + OUT); return Array.from(out(2)); }, // (−1: both, as the JavaScript's default)
    pickupWeight: (n, X, L) => x.clavier_pickup_weight(n, X, L),
    pressureCents: (key, F, P) => x.clavier_pressure_cents(key, F, setP(P)),
    toneResponse: (f, P) => x.clavier_tone_response(f, setP(P)),
  };
  return model;
}

globalThis.ClavierWasmEngine = ClavierWasmEngine;
