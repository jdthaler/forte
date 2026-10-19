// piano-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/piano): PianoWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS, ALL_PARAMS } from './params.js';
import { MATERIALS, SHAPES, noteName } from './materials.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'piano', name: 'PianoWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/piano.wasm', import.meta.url).href };

// The C++ engine's messages (piano-engine.h, msg), as the page's.
function messages(m) {
  if (m.type === 1) return { type: 'hammer', key: m.key, contactMs: m.values[0], Fmax: m.values[1] };
  if (m.type === 2) return { type: 'error', key: m.key, message: 'numerical instability' };
  return null;
}

const Base = wasmEngine(BUILD, { messages });

// Voice data as the C++ takes it (piano-model.h, packVoiceData): version, key, n, unisons, the
// hammer's mass, K, p, alpha, outV, outH, hasDamper, T, kc, then freq, sigma, w, cv, ch, ct, g,
// famId, uni, idx. A voice data object's version (a string, or a number) becomes a number.
const HEAD = 13, ARRAYS = ['freq', 'sigma', 'w', 'cv', 'ch', 'ct', 'g', 'famId', 'uni', 'idx'];
const versions = new Map();
const versionId = (v) => { if (!versions.has(v)) versions.set(v, versions.size + 1); return versions.get(v); };
export function packVoiceData(d) {
  const n = d.n, out = new Float64Array(HEAD + ARRAYS.length * n);
  out.set([versionId(d.version), d.key, n, d.unisons, d.hammer.mass, d.hammer.K, d.hammer.p, d.hammer.alpha, d.outV, d.outH, d.hasDamper ? 1 : 0, d.T, d.kc]);
  ARRAYS.forEach((k, i) => out.set(d[k], HEAD + i * n));
  return out;
}
export function unpackVoiceData(a) {
  const n = a[2], at = (i) => a.subarray(HEAD + i * n, HEAD + (i + 1) * n);
  return {
    version: a[0], key: a[1], n, unisons: a[3],
    freq: at(0).slice(), sigma: at(1).slice(), w: at(2).slice(), cv: at(3).slice(), ch: at(4).slice(), ct: at(5).slice(), g: at(6).slice(),
    famId: Uint8Array.from(at(7)), uni: Uint8Array.from(at(8)), idx: Uint16Array.from(at(9)),
    hammer: { mass: a[4], K: a[5], p: a[6], alpha: a[7] },
    outV: a[8], outH: a[9], hasDamper: a[10] > 0, T: a[11], kc: a[12],
  };
}

// A voice of the engine, read back: what the tests and the slow-motion view read (q and perm are views into the engine's memory, valid until it next runs).
const VOICE = ['key', 'N', 'hammerOn', 'contactSamples', 'Fmax', 'killing', 'dead', 'eta', 'etaPrev', 'keyDown', 'damped', 'peak', 'age', 'own'];
const FLAGS = new Set(['hammerOn', 'killing', 'dead', 'keyDown', 'damped', 'own']);
class WasmVoice {
  constructor(engine, ptr) { this.engine = engine; this.ptr = ptr; }
  get state() {
    const x = Base.exports, s = scratch(x);
    x.piano_voice(this.engine.e, this.ptr, s.at);
    const a = s.f64(VOICE.length);
    return Object.fromEntries(VOICE.map((k, i) => [k, FLAGS.has(k) ? a[i] > 0 : a[i]]));
  }
  array(which) { const x = Base.exports; return new Float64Array(x.memory.buffer, x.piano_voice_q(this.ptr, which), this.N); }
  get q() { return this.array(0); }
  get q1() { return this.array(1); }
  get perm() { return this.array(2); }
  // state in the order of the incoming voice data (for visualisation)
  snapshot(out) { const q = this.q, perm = this.perm; for (let i = 0; i < q.length; i++) out[perm[i]] = q[i]; return out; }
  // audible amplitude of every mode (incoming data order), for spectra
  modeAmplitudes() {
    const x = Base.exports, s = scratch(x), n = this.N;
    x.piano_voice_amplitudes(this.engine.e, this.ptr, s.at);
    return s.f64(n).slice();
  }
}
for (const k of VOICE) Object.defineProperty(WasmVoice.prototype, k, { get() { return this.state[k]; } });

// The engine, with the page's and the tests' hooks: noteOn returns the voice it struck; voices,
// byKey, modeCount(), stats(); setParams takes maxModes (the CPU budget, not a parameter). A note
// may bring its key's voice data: packed by the model (wasmModel's keyModel(…).packed), or a voice
// data object (its .data, perhaps altered), which is packed here.
export class PianoWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  setParams(P) {
    if (P.maxModes !== undefined) Base.exports.piano_set_max_modes(this.e, P.maxModes);
    super.setParams(P);
  }
  // A key's voice data ahead of its notes: its sympathetic string's partials come from it.
  offer(data) {
    const packed = data instanceof Float64Array ? data : packVoiceData(data), x = Base.exports;
    const at = x.piano_offer_buffer(this.e, packed.length); // (may grow the memory: then take its buffer)
    new Float64Array(x.memory.buffer, at, packed.length).set(packed);
    x.piano_offer(this.e, packed.length);
  }
  // the page's { type: 'offering' } (it will offer every key: the engine builds none for the
  // sympathetic strings) and { type: 'offer', data }
  handle(m) {
    if (m.type === 'offer') this.offer(m.data);
    else if (m.type === 'offering') Base.exports.piano_offering(this.e);
  }
  noteOn(key, velocity, data) {
    if (data) this.offer(data);
    super.noteOn(key, velocity);
    const v = Base.exports.piano_last(this.e);
    return v ? new WasmVoice(this, v) : undefined;
  }
  get voices() {
    const x = Base.exports;
    return Array.from({ length: x.piano_voices(this.e) }, (_, i) => new WasmVoice(this, x.piano_voice_at(this.e, i)));
  }
  get byKey() { return new Map(this.voices.filter((v) => v.own).map((v) => [v.key, v])); }
  modeCount() { return Base.exports.piano_mode_count(this.e); }
  // the sympathetic strings: key's group ({ size, energy, damped }), and the partials that last ran
  sympathetic(key) { const x = Base.exports; return { size: x.piano_sym_size(this.e, key), energy: x.piano_sym_energy(this.e, key), damped: x.piano_sym_damped(this.e, key) > 0 }; }
  sympatheticRunning() { return Base.exports.piano_sym_running(this.e); }
  stats() { return { modes: this.modeCount() }; } // the CPU pill shows the oscillators too
}
export const ready = () => PianoWasmEngine.ready();

// The model's functions the views and the tests call, computed by the WebAssembly:
// keyModel(key, P, fs) gives { model, data, packed }: the string model (piano-model.cpp,
// computeKeyModel, with its secAt), the voice data (buildVoiceData) and that data packed for the
// engine. Cached per key for the latest version asked for (the 'model' parameters and fs).
// sectionProps(shape, A, aspect, scale) gives a cross-section's properties.
const MODEL = ALL_PARAMS.filter((p) => p.kind === 'model').map((p) => p.id);
const FAMILY = ['bend1', 'bend2', 'torsion'];
const SEC = ['A', 'I1', 'I2', 'J', 'Ip', 'half', 'lever', 'w', 't'];
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD);
  const materials = Object.values(MATERIALS);
  const section = (shape, A, aspect, sc) => {
    x.piano_section(shape, A, aspect, sc, s.at);
    const a = s.f64(SEC.length);
    return Object.fromEntries(SEC.map((k, i) => [k, a[i]]));
  };
  const read = (f, which, n) => new Float64Array(x.memory.buffer, x.piano_family(f, which), n).slice();
  const cache = new Map();
  function keyModel(key, P, fs) {
    const version = JSON.stringify([fs, ...MODEL.map((id) => P[id])]);
    let c = cache.get(key);
    if (c && c.version === version) return c;
    const a = s.f64(params.length);
    params.forEach((p, i) => { a[i] = nativeValue(p, P[p.id]); });
    if (!x.piano_key(key, fs)) throw new Error(`key ${key}: the string model failed`);
    const h = s.f64(x.piano_model(s.at)).slice();
    const sec = Object.fromEntries(SEC.map((k, i) => [k, h[6 + i]]));
    const [shape, A0, aspect, tau] = h.subarray(15, 19), uniform = h[19] > 0, L = h[2];
    const families = FAMILY.map((type, f) => {
      const [n, ritz, nb, B] = h.subarray(43 + 4 * f, 47 + 4 * f);
      const fam = { type, n, omega: read(f, 0, n), phiH: read(f, 1, n), bridge: read(f, 2, n),
        shape: ritz ? { kind: 'ritz', nb, coef: read(f, 4, n * nb) } : { kind: 'sine', norm: read(f, 3, n) } };
      if (f < 2) fam.B = B;
      return fam;
    });
    const hammer = { mass: h[38], K: h[39], p: h[40], width: h[41] };
    const info = {
      key, name: noteName(key), f0: h[20], L, T: h[3], tuned: h[21] > 0,
      stress: h[22], strengthRatio: h[23], mu: h[24], dMu: h[25], A: h[26], sec,
      B1: h[27], B2: h[28], f1: h[29], f1hard: h[30], f1torsion: h[31], tuneAxis: h[32] === 1 ? 'I1' : 'I2',
      torsionRatio: h[33], cT: h[34], cTheta: h[35], xh: h[4], wH: h[5], beta: h[36], uniform, taper: h[37], hammer,
    };
    const secAt = (xx) => section(shape, A0, aspect, uniform ? 1 : 1 + tau * (1 - (2 * xx) / L));
    const model = { key, L, T: h[3], xh: h[4], wH: h[5], sec, secAt, families, info, material: materials[h[42]] };
    const packed = new Float64Array(x.memory.buffer, x.piano_packed(), x.piano_packed_count()).slice();
    c = { version, model, data: unpackVoiceData(packed), packed };
    cache.set(key, c);
    return c;
  }
  return { keyModel, sectionProps: (shape, A, aspect = 1, sc = 1) => section(Object.keys(SHAPES).indexOf(shape), A, aspect, sc) };
}

globalThis.PianoWasmEngine = PianoWasmEngine;
