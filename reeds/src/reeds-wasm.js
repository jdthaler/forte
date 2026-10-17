// reeds-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/reeds): ReedWasmEngine, with the engine contract, and the model's functions
// for the views. The page runs it when it can and falls back to the JavaScript (reeds-engine.js,
// reeds-model.js).

import { GROUPS } from './reeds-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'reeds', name: 'ReedWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/reeds.wasm', import.meta.url).href };

const Base = wasmEngine(BUILD);

// Voice data as the C++ takes it (reeds-model.h, packVoiceData): version, key, n, the hammer's
// mass, K, p, alpha, then freq, sigma, w, pk, dampW. A JavaScript voice data's version (the
// descriptor's reedKey) becomes a number.
const HEAD = 7, ARRAYS = ['freq', 'sigma', 'w', 'pk', 'dampW'];
const versions = new Map();
const versionId = (v) => { if (!versions.has(v)) versions.set(v, versions.size + 1); return versions.get(v); };
export function packVoiceData(d) {
  const n = d.n, out = new Float64Array(HEAD + ARRAYS.length * n);
  out.set([versionId(d.version), d.key, n, d.hammer.mass, d.hammer.K, d.hammer.p, d.hammer.alpha]);
  ARRAYS.forEach((k, i) => out.set(d[k].subarray(0, n), HEAD + i * n));
  return out;
}
export function unpackVoiceData(a) {
  const n = a[2], at = (i) => a.slice(HEAD + i * n, HEAD + (i + 1) * n);
  return { version: a[0], key: a[1], n, freq: at(0), sigma: at(1), w: at(2), pk: at(3), dampW: at(4), hammer: { mass: a[3], K: a[4], p: a[5], alpha: a[6] } };
}

// The engine, with the JavaScript engine's test hooks: its voices (key, dead, killing, frame hits,
// peak, …, and the data object a note brought, where it was a JavaScript one) and byKey; its slot
// and comb node (fs2, kF, nodeA, nodeB, y0, cRest, the C(y) tables…, read back from its memory);
// and a voice the suite pushes (an object with render(buf, n)), whose δC goes into the comb node.
// A note may bring its reed's data: packed by the page's WebAssembly model (wasmModel().voiceData),
// or a JavaScript voice data object (the tests), packed here.
const VOICE = ['key', 'dead', 'killing', 'hits', 'peak', 'hammerOn', 'keyDown', 'damped', 'own', 'contactSamples', 'Fmax', 'N', 'yMin', 'yMax', 'version'];
const FLAGS = new Set(['dead', 'killing', 'hammerOn', 'keyDown', 'damped', 'own']);
const STATE = ['fs2', 'damperSigma', 'hammerMax', 'kF', 'nodeA', 'nodeB', 'y0', 'cRest', 'dRest', 'y0N', 'cRestN', 'dRestN', 'blend', 'twoTables'];
let slotN = 0;
export class ReedWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    const x = Base.exports;
    this.e = x.forte_engine(this.h);
    this.sent = new Map(); // the JavaScript data objects notes brought, by version
    this.pushed = [];      // voices the tests push
    if (!slotN) { const s = scratch(x); x.reeds_slot_grid(s.at); slotN = s.f64(3)[2]; }
  }
  noteOn(key, velocity, data) {
    if (data) {
      const packed = data instanceof Float64Array ? data : packVoiceData(data), x = Base.exports, s = scratch(x);
      if (!(data instanceof Float64Array)) this.sent.set(packed[0], data);
      if (packed.length * 8 <= s.size) { s.f64(packed.length).set(packed); x.reeds_offer(this.e, s.at, packed.length); }
    }
    super.noteOn(key, velocity);
  }
  get voices() {
    const x = Base.exports, s = scratch(x), out = s.f64(VOICE.length);
    const list = Array.from({ length: x.reeds_voices(this.e) }, (_, i) => {
      x.reeds_voice(this.e, i, s.at);
      const v = Object.fromEntries(VOICE.map((k, j) => [k, FLAGS.has(k) ? out[j] > 0 : out[j]]));
      v.data = this.sent.get(v.version);
      return v;
    });
    list.push(...this.pushed);
    Object.defineProperty(list, 'push', { value: (...v) => this.pushed.push(...v) });
    return list;
  }
  get byKey() { return new Map(this.voices.filter((v) => v.own).map((v) => [v.key, v])); }
  get capA() { return new Float64Array(Base.exports.memory.buffer, Base.exports.reeds_cap(this.e, 0), slotN); }
  get capB() { return new Float64Array(Base.exports.memory.buffer, Base.exports.reeds_cap(this.e, 1), slotN); }
  set kF(v) { Base.exports.reeds_set_kf(this.e, v); }
  get kF() { return this.state.kF; }
  get state() {
    const x = Base.exports, s = scratch(x);
    x.reeds_state(this.e, s.at);
    const a = s.f64(STATE.length);
    return Object.fromEntries(STATE.map((k, i) => [k, k === 'blend' || k === 'twoTables' ? a[i] > 0 : a[i]]));
  }
  process(L, R, n) {
    if (!this.pushed.length) { super.process(L, R, n); return; }
    const x = Base.exports;
    for (let at = 0; at < n; at += 128) {
      const m = Math.min(128, n - at), buf = new Float64Array(x.memory.buffer, x.reeds_extra(this.e), 2 * m);
      buf.fill(0);
      for (const v of this.pushed) if (!v.dead) v.render(buf, 2 * m, this);
      x.reeds_use_extra(this.e);
      super.process(L.subarray(at, at + m), R.subarray(at, at + m), m);
    }
  }
}
for (const k of STATE) if (k !== 'kF') Object.defineProperty(ReedWasmEngine.prototype, k, { get() { return this.state[k]; } });
export const ready = () => ReedWasmEngine.ready();

// The model's functions the views call (reeds-model.js's keyModel, capCurve, pickupNode,
// electrostaticShift, hammerSpeed; reeds-engine.js's traceStrike), computed by the WebAssembly,
// and voiceData: a key's reed packed for the WebAssembly engine (the page's noteData). reedModel
// keeps each key's model until the reed parameters change, as reeds-instrument.js does.
const INFO = ['key', 'f0', 'L', 'h', 'b', 'mReed', 'M', 'J', 'blobSide', 'ratio', 'xh', 'xd', 'xp'];
const MODE = ['n', 'f', 'ratio', 'bare', 'sigma', 'sigSteel', 'sigClamp', 'w', 'pk', 'dampW', 'Gamma', 'Theta'];
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD);
  x.reeds_slot_grid(s.at);
  const [y0, dy, nY] = s.f64(3);

  // key m's reed at the engine's rate fs (twice the audio rate), as reeds-model.js's keyModel
  function keyModel(m, P, fs) {
    const n = x.reeds_key_model(m, P.solder, P.strike, P.hardness, fs, s.at), a = s.f64(n).slice();
    const info = Object.fromEntries(INFO.map((k, i) => [k, a[i]]));
    info.hammer = { mass: a[13], K: a[14], p: a[15], alpha: a[16] };
    info.kPick = a[17];
    const [nel, EI, mu, mass, nv, N, kept] = a.subarray(18, 25);
    let i = 25;
    const take = (k) => { const v = a.subarray(i, i + k); i += k; return v; };
    const modes = Array.from({ length: kept }, () => { const v = take(MODE.length); return Object.fromEntries(MODE.map((k, j) => [k, v[j]])); });
    const omega = Array.from(take(nv)), Gamma = Array.from(take(nv)), Theta = Array.from(take(nv)), X = take(N * nv).slice();
    // the FEM's mode shape (unit modal mass) at x ∈ [0, L], from its nodes' degrees of freedom, as
    // reedFEM's shape interpolates them (Hermite cubics)
    const L = info.L, l = L / nel;
    const shape = (j, xx) => {
      const xc = Math.min(L, Math.max(0, xx)), e = Math.min(nel - 1, Math.floor(xc / l)), xi = xc / l - e;
      const Nv = [1 - 3 * xi * xi + 2 * xi ** 3, l * (xi - 2 * xi * xi + xi ** 3), 3 * xi * xi - 2 * xi ** 3, l * (-xi * xi + xi ** 3)];
      const v = (d) => (d < 2 ? 0 : X[(d - 2) * nv + j]);
      return Nv[0] * v(2 * e) + Nv[1] * v(2 * e + 1) + Nv[2] * v(2 * e + 2) + Nv[3] * v(2 * e + 3);
    };
    const reed = { L, h: info.h, b: info.b, EI, mu, m: mass, M: info.M, J: info.J, omega, Gamma, Theta, shape, nModes: nv, f0: info.f0, ratio: info.ratio, blob: { a: info.blobSide } };
    const pn = x.reeds_voice_data(m, P.solder, P.strike, P.hardness, fs, s.at), packed = s.f64(pn).slice();
    return { key: info.key, info, reed, modes, voice: unpackVoiceData(packed), packed };
  }
  let models = new Map(), modelsFor = '';
  function reedModel(key, P, fs) {
    const r = `${P.solder}|${P.strike}|${P.hardness}`;
    if (r !== modelsFor) { models = new Map(); modelsFor = r; }
    let md = models.get(`${key}|${fs}`);
    if (!md) { md = keyModel(key, P, 2 * fs); models.set(`${key}|${fs}`, md); }
    return md;
  }
  return {
    keyModel,
    reedModel,
    voiceData: (key, P, fs) => reedModel(key, P, fs).packed,
    capCurve(gap) {
      x.reeds_cap_curve(gap, s.at);
      return { c: s.f64(nY).slice(), y0, dy, n: nY };
    },
    pickupNode(P) {
      x.reeds_pickup_node(P.rbias, P.bias, s.at);
      const [R, tau, fc, gain] = s.f64(4);
      return { R, tau, fc, gain };
    },
    electrostaticShift(model, P) {
      x.reeds_electrostatic_shift(model.info.kPick, P.gap, P.offset, P.bias, s.at);
      const [kE, cents] = s.f64(2);
      return { kE, cents };
    },
    hammerSpeed: (vel) => x.reeds_hammer_speed(vel),
    // one strike of key's reed (built at 2 fs, as the page's noteData), as reeds-engine.js's traceStrike
    traceStrike(key, P, velocity, fs, seconds, nFrames = 0) {
      const a = s.f64(params.length);
      params.forEach((p, i) => { a[i] = nativeValue(p, P[p.id]); });
      x.reeds_trace(key, velocity, fs, seconds, nFrames);
      x.reeds_trace_info(s.at);
      const h = s.f64(7 + 6).slice(), N = h[2], n = h[1];
      const arr = (which, len) => new Float32Array(x.memory.buffer, x.reeds_trace_array(which), len).slice();
      return {
        fs2: h[0], n, N, y: arr(0, n), dC: arr(1, n), volt: arr(2, n), q: arr(3, nFrames * N), eta: arr(4, nFrames), nFrames,
        release: h[4], amps: h.slice(7, 7 + N), contactMs: h[5], Fmax: h[6],
      };
    },
  };
}

globalThis.ReedWasmEngine = ReedWasmEngine;
