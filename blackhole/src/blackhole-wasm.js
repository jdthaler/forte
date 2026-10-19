// blackhole-wasm.js — the engine and model built as WebAssembly from the physics in C++
// (native/instruments/blackhole): BlackholeWasmEngine, with the engine contract, and the model's
// functions for the views.

import { GROUPS } from './ringdown-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';
import { tuningRatio, TUNING_KEEP } from '../../shared/tuning.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'blackhole', name: 'BlackholeWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/blackhole.wasm', import.meta.url).href };

// The C++ engine's one message (blackhole-engine.h, msg::voices): how many voices ring.
const messages = (m) => (m.type === 1 ? { type: 'voices', voices: Math.round(m.values[0]) } : null);

const Base = wasmEngine(BUILD, { messages });

// A key's voice (blackhole-model.h's keyVoice) goes to and from the WebAssembly packed as doubles
// (blackhole-web.cpp): key, count, hasChirp, the chirp, the info, then 12 numbers per mode.
const CHIRP = ['Mc', 'fStart', 'fIsco', 'f220', 'tc', 'cp', 'cx', 'amp', 'psi', 'fPk', 'tauB', 'fadeT'];
const INFO = ['key', 'f0', 'a', 'M', 'Msun', 'nu', 'rPlusKm', 'OmegaH', 'hawkingK'];
const MODE = ['l', 'm', 'n', 'f', 'gamma', 'tau', 'Q', 'amp', 'cpr', 'cpi', 'cxr', 'cxi'];
const HEAD = 3 + CHIRP.length + INFO.length;
const num = (v) => (typeof v === 'number' ? v : v === true ? 1 : v === false ? 0 : NaN); // missing: NaN
function pack(x, v, at) {
  const count = Math.min(v.modes.length, (x.blackhole_voice_size() - HEAD) / MODE.length);
  const a = new Float64Array(x.memory.buffer, at, HEAD + MODE.length * count);
  a[0] = v.key; a[1] = count; a[2] = v.chirp ? 1 : 0;
  CHIRP.forEach((k, i) => { a[3 + i] = v.chirp ? num(v.chirp[k]) : 0; });
  INFO.forEach((k, i) => { a[3 + CHIRP.length + i] = num(v.info?.[k]); });
  for (let j = 0; j < count; j++) MODE.forEach((k, i) => { a[HEAD + MODE.length * j + i] = num(v.modes[j][k]); });
}
function unpack(x, at) {
  const h = new Float64Array(x.memory.buffer, at, HEAD), count = h[1];
  const a = new Float64Array(x.memory.buffer, at, HEAD + MODE.length * count);
  const modes = Array.from({ length: count }, (_, j) => Object.fromEntries(MODE.map((k, i) => [k, a[HEAD + MODE.length * j + i]])));
  const chirp = a[2] ? Object.fromEntries(CHIRP.map((k, i) => [k, a[3 + i]])) : null;
  const info = Object.fromEntries(INFO.map((k, i) => [k, a[3 + CHIRP.length + i]]));
  return { key: a[0], modes, chirp, info };
}

// A voice of the C++ engine, read back field by field: what the tests read.
const VOICE = ['key', 'vel', 'keyDown', 'ring', 'stolen', 'dead', 'fade', 'level', 'hasChirp', 'stage', 'f', 't', 'phi', 'A', 'xfade'];
const FLAGS = new Set(['keyDown', 'ring', 'stolen', 'dead', 'hasChirp']);
class WasmVoice {
  constructor(ptr) { this.ptr = ptr; }
  get state() {
    const x = Base.exports, s = scratch(x);
    x.blackhole_voice(this.ptr, s.at);
    const a = s.f64(VOICE.length);
    return Object.fromEntries(VOICE.map((k, i) => [k, FLAGS.has(k) ? a[i] > 0 : a[i]]));
  }
  get chirp() { const s = this.state; return s.hasChirp ? { stage: s.stage, f: s.f, t: s.t, phi: s.phi, A: s.A, xfade: s.xfade } : null; }
}
for (const k of ['key', 'vel', 'keyDown', 'ring', 'stolen', 'dead', 'fade', 'level']) Object.defineProperty(WasmVoice.prototype, k, { get() { return this.state[k]; } });

// The engine, with three hooks for the tests: a note's data (a key's voice, which the C++
// otherwise builds from the parameters), maxVoices, and voices (one array, kept up to date in
// place).
export class BlackholeWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
    this.list = [];
  }
  setParams(P) {
    if ('maxVoices' in P) Base.exports.blackhole_max_voices(this.e, P.maxVoices);
    super.setParams(P);
  }
  noteOn(key, velocity, data) {
    const x = Base.exports;
    if (data) { const s = scratch(x); pack(x, data, s.at); x.blackhole_offer(this.e, s.at); }
    super.noteOn(key, velocity);
  }
  get voices() {
    const x = Base.exports, n = this.voiceCount(), list = this.list;
    list.length = n;
    for (let i = 0; i < n; i++) { const p = x.blackhole_voice_at(this.e, i); if (list[i]?.ptr !== p) list[i] = new WasmVoice(p); }
    return list;
  }
}
export const ready = () => BlackholeWasmEngine.ready();

// The model's functions the views call, computed by the WebAssembly: the QNM bank (its table, with
// log(−Im Mω) as lim, and omega(l, m, n, a), interpolated), a key's voice (keyVoice, and voiceFor,
// cached by the 'model' parameters and the sample rate), its strain in closed form (strainCurve),
// and the spin-weighted spherical harmonics (swsh).
const MODEL = [...GROUPS.flatMap((g) => g.params).filter((p) => p.kind === 'model').map((p) => p.id), ...TUNING_KEEP]; // and the keyboard's tuning
export async function wasmModel() {
  const x = await ready();
  const nu = x.blackhole_table_size(), f64 = (p, n) => new Float64Array(x.memory.buffer, p, n).slice();
  const u = f64(x.blackhole_table_u(), nu);
  const modes = Array.from({ length: x.blackhole_table_modes() }, (_, i) => {
    const s = scratch(x);
    x.blackhole_table_lmn(i, s.at);
    const [l, m, n] = s.f64(3);
    return { l, m, n, re: f64(x.blackhole_table_re(i), nu), lim: f64(x.blackhole_table_lim(i), nu) };
  });
  const bank = {
    u, modes,
    omega(l, m, n, a) {
      const s = scratch(x);
      if (!x.blackhole_omega(l, m, n, a, s.at)) return null;
      const [re, im] = s.f64(2);
      return { re, im };
    },
  };
  const keyVoice = (key, P, fs) => {
    const s = scratch(x);
    x.blackhole_key_voice(key, P.spinU, P.massRatio, P.inclination, P.t0, P.overtones, P.retrograde, P.inspiral ? 1 : 0, P.inspiralOct, fs, tuningRatio(P, key), s.at);
    return unpack(x, s.at);
  };
  let cacheKey = '', cache = new Map();
  const voiceFor = (key, P, fs) => {
    const k = JSON.stringify([fs, ...MODEL.map((id) => P[id])]);
    if (k !== cacheKey) { cacheKey = k; cache = new Map(); }
    let v = cache.get(key);
    if (!v) cache.set(key, (v = keyVoice(key, P, fs)));
    return v;
  };
  const strainCurve = (v, n) => {
    const s = scratch(x);
    pack(x, v, s.at);
    const dur = x.blackhole_strain(s.at, n), b = x.blackhole_strain_buf(); // (the memory may have grown)
    const all = new Float32Array(x.memory.buffer, b, 2 * n);
    return { hp: all.slice(0, n), hx: all.slice(n), dur };
  };
  return { Engine: BlackholeWasmEngine, bank, keyVoice, voiceFor, strainCurve, swsh: (s, l, m, theta) => x.blackhole_swsh(s, l, m, theta) };
}

globalThis.BlackholeWasmEngine = BlackholeWasmEngine;
