// tines-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/tines): TinesWasmEngine, with the engine contract, and the model's functions
// for the views. The page runs it when it can and falls back to the JavaScript (rhodes-engine.js,
// tine.js).

import { GROUPS, ALL_PARAMS } from './rhodes-params.js';
import { noteName } from './tine.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'tines', name: 'TinesWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/tines.wasm', import.meta.url).href };

// The C++ engine's messages (tines-engine.h, msg) back into the JavaScript engine's.
function messages(m) {
  if (m.type === 1) return { type: 'hammer', key: m.key, contactMs: m.values[0], Fmax: m.values[1] };
  if (m.type === 2) return { type: 'error', key: m.key, message: 'numerical instability' };
  return null;
}

const Base = wasmEngine(BUILD, { messages });

// Voice data as the C++ takes it (tines-model.h, packVoiceData): version, key, n, the hammer's
// mass, K, p, alpha, the pickup's gap, wid, yoff, gain, hasDamper, 0, then freq, sigma, dampW, w,
// pk. A JavaScript voice data's version (tines-instrument.js, modelVersion) becomes a number.
const HEAD = 13, ARRAYS = ['freq', 'sigma', 'dampW', 'w', 'pk'];
const versions = new Map();
const versionId = (v) => { if (!versions.has(v)) versions.set(v, versions.size + 1); return versions.get(v); };
export function packVoiceData(d) {
  const n = d.n, out = new Float64Array(HEAD + ARRAYS.length * n), pu = d.pickup;
  out.set([versionId(d.version), d.key, n, d.hammer.mass, d.hammer.K, d.hammer.p, d.hammer.alpha, pu.gap ?? 0, pu.wid, pu.yoff, pu.gain, d.hasDamper ? 1 : 0, 0]);
  ARRAYS.forEach((k, i) => out.set(d[k], HEAD + i * n));
  return out;
}
export function unpackVoiceData(a) {
  const n = a[2], at = (i) => a.subarray(HEAD + i * n, HEAD + (i + 1) * n).slice();
  return {
    version: a[0], key: a[1], n, freq: at(0), sigma: at(1), dampW: at(2), w: at(3), pk: at(4),
    hammer: { mass: a[3], K: a[4], p: a[5], alpha: a[6] }, pickup: { wid: a[8], yoff: a[9], gain: a[10] }, hasDamper: a[11] > 0,
  };
}

// A voice of the C++ engine, read back as the JavaScript engine's Voice: what the tests and the
// slow-motion view read (q is a view into the engine's memory, valid until it next runs).
const VOICE = ['key', 'N', 'hammerOn', 'contactSamples', 'Fmax', 'killing', 'dead', 'eta', 'etaPrev', 'keyDown', 'damped', 'peak', 'age', 'own',
  'wid', 'yoff', 'gain', 'yMin', 'yMax'];
const FLAGS = new Set(['hammerOn', 'killing', 'dead', 'keyDown', 'damped', 'own']);
class WasmVoice {
  constructor(engine, ptr) { this.engine = engine; this.ptr = ptr; }
  get state() {
    const x = Base.exports, s = scratch(x);
    x.tines_voice(this.engine.e, this.ptr, s.at);
    const a = s.f64(VOICE.length);
    return Object.fromEntries(VOICE.map((k, i) => [k, FLAGS.has(k) ? a[i] > 0 : a[i]]));
  }
  get q() { const x = Base.exports; return new Float64Array(x.memory.buffer, x.tines_voice_q(this.ptr), this.N); }
  snapshot(out) { out.set(this.q); return out; }
}
for (const k of VOICE) Object.defineProperty(WasmVoice.prototype, k, { get() { return this.state[k]; } });

// The engine, with the JavaScript engine's hooks: noteOn returns the voice it struck; voices,
// byKey, p.maxVoices. A note may bring its key's voice data (the page's noteData): packed by the
// page's WebAssembly model, or a JavaScript voice data object (the tests), which is packed here.
export class TinesWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
    this.fs2 = 2 * fs;
    this.p = { maxVoices: Base.exports.tines_max_voices() };
  }
  noteOn(key, velocity, data) {
    if (data) {
      const packed = data instanceof Float64Array ? data : packVoiceData(data), x = Base.exports;
      new Float64Array(x.memory.buffer, x.tines_offer_buffer(this.e), packed.length).set(packed);
      x.tines_offer(this.e, packed.length);
    }
    super.noteOn(key, velocity);
    const v = Base.exports.tines_last(this.e);
    return v ? new WasmVoice(this, v) : undefined;
  }
  get voices() {
    const x = Base.exports;
    return Array.from({ length: x.tines_voices(this.e) }, (_, i) => new WasmVoice(this, x.tines_voice_at(this.e, i)));
  }
  get byKey() { return new Map(this.voices.filter((v) => v.own).map((v) => [v.key, v])); }
}
export const ready = () => TinesWasmEngine.ready();

// The model's functions the views call, computed by the WebAssembly: keyModel(key, P, fs) gives
// the key's model as tine.js's computeKey has it (info, the tine with its shape(j, x), the kept
// modes, the voice data, the coupled shapes), its pickup set from P as tines-instrument.js sets
// it, plus `packed`, the voice data for the WebAssembly engine. Cached per key for the latest
// version asked for, as tines-instrument.js caches the JavaScript's.
const MODEL = ALL_PARAMS.filter((p) => p.kind === 'model').map((p) => p.id);
const MODE = ['col', 'f', 'sigma', 'w', 'pk', 'dampW', 'tineFrac', 'barFrac', 'blockFrac'];
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD);
  const setP = (P) => { const a = s.f64(params.length); params.forEach((p, i) => { a[i] = nativeValue(p, P[p.id]); }); };
  const OUT = 8 * params.length; // where results go in the scratch area, after the parameters
  const cache = new Map();
  function keyModel(key, P, fs) {
    const version = JSON.stringify([fs, ...MODEL.map((id) => P[id])]);
    let c = cache.get(key);
    setP(P);
    if (!c || c.version !== version) {
      if (!x.tines_key(key, fs)) throw new Error(`key ${key}: the tine model failed`);
      const h = s.f64(x.tines_model(key, s.at + OUT), OUT).slice();
      const [, k, , f0, L, d, mt, ms, sAt, xh, f1tine, Mb, M0, fBar, nq, n, iu, ip, nk] = h;
      let at = 19;
      const tineRatios = Array.from(h.subarray(at, at + nq)); at += nq;
      const modes = [];
      for (let j = 0; j < nk; j++, at += MODE.length) modes.push(Object.fromEntries(MODE.map((m, i) => [m, h[at + i]])));
      const X = h.slice(at, at + n * n);
      const packed = new Float64Array(x.memory.buffer, x.tines_packed(key), x.tines_packed_count(key)).slice();
      const model = {
        key: k, nq, modes, xh,
        info: { key: k, name: noteName(k), f0, L, d, mt, ms, s: sAt, xh, tineRatios, f1tine, Mb, M0, fBar, gap: 0, wid: 0 },
        tine: { L, d, mt, ms, s: sAt, nModes: nq, shape: (j, xx) => x.tines_shape(k, j, xx) },
        voice: unpackVoiceData(packed),
        shapes: { X, n, nq, iu, ip },
        packed,
      };
      c = { version, model };
      cache.set(key, c);
    }
    // the pickups move live: set from P, not recomputed with the modes
    const m = c.model, o = s.at + OUT;
    x.tines_pickup(key, o);
    const [gap, wid, yoff, gain] = s.f64(4, OUT);
    m.info.gap = gap; m.info.wid = wid; m.voice.pickup = { wid, yoff, gain };
    return m;
  }
  return { keyModel, flux: (Y, w) => x.tines_flux(Y, w) };
}

globalThis.TinesWasmEngine = TinesWasmEngine;
