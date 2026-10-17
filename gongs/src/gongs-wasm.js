// gongs-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/gongs): GongWasmEngine, with the engine contract, and the model's functions
// for the views. The page runs it when it can and falls back to the JavaScript (gongs-engine.js).
// (It imports nothing from gongs-model.js: the worklet then loads no plate tables in JavaScript.)

import { GROUPS } from './gongs-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'gongs', name: 'GongWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/gongs.wasm', import.meta.url).href };
const BC = ['free', 'clamped'], NR = 65;
const tablesId = (bc, rise, terms) => `${bc}|${rise}|${terms}`;
const modeLabel = (bc, m, s) => `(${m},${s + (bc === 'free' && m < 2 ? 1 : 0)})`; // as gongs-model.js

// The C++ engine's messages (gongs-engine.h, msg) back into the JavaScript engine's: 'gong' (the
// focus gong's modes, bands and pitch, sent in three pieces) and 'error'.
function views(m, e) {
  const s = (e.views ??= { amp: new Float32Array(64), band: new Float32Array(6) });
  const v = m.values;
  switch (m.type) {
    case 1: s.amp.set(v.subarray(0, 30), 0); return null;
    case 2: s.amp.set(v.subarray(0, 30), 30); return null;
    case 3: {
      s.amp.set(v.subarray(0, 4), 60); s.band.set(v.subarray(4, 10));
      return { type: 'gong', key: m.key, n: v[17], amp: s.amp, band: s.band, E: v[10], enl: v[11], cents: v[12], nl: v[13] > 0, sub: v[14], contact: v[15], t: v[16] };
    }
    case 4: return { type: 'error', message: `gong ${m.key}: numerical failure` };
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// A set of tables as the JavaScript model's shell() has them (what the tests and views read):
// N, NS, tuned, Om, m, label, C, R; H and E (the couplings) when asked for.
function shellObject(x, ptr) {
  const s = scratch(x);
  x.gongs_shell_spec(ptr, s.at);
  const [b, rise, terms] = s.f64(3), bc = BC[b];
  x.gongs_shell(ptr, s.at);
  const head = s.f64(3), N = head[0], NS = head[1], a = s.f64(3 + 4 * N + NS + N * NR).slice();
  let at = 3;
  const take = (n) => a.subarray(at, (at += n));
  const Om = take(N).slice(), m = Int32Array.from(take(N)), pm = take(N), ps = take(N), C = take(NS).slice(), Rall = take(N * NR);
  const S = {
    id: tablesId(bc, rise, terms), bc, bcIndex: b, rise, terms, kappa: 2 * rise, N, NS, tuned: head[2], Om, m, C,
    label: Array.from(m, (_, i) => modeLabel(bc, pm[i], ps[i])),
    R: Array.from({ length: N }, (_, i) => Rall.slice(i * NR, (i + 1) * NR)),
  };
  let H = null, E = null;
  Object.defineProperties(S, {
    H: { enumerable: true, get() {
      if (!H) {
        H = [];
        for (let from = 0, n = x.gongs_shell_h_count(ptr); from < n; from += 1000) {
          const c = Math.min(1000, n - from);
          x.gongs_shell_h(ptr, from, c, s.at);
          const t = s.f64(4 * c);
          for (let e = 0; e < c; e++) H.push({ n: t[4 * e], i: t[4 * e + 1], j: t[4 * e + 2], v: t[4 * e + 3] });
        }
      }
      return H;
    } },
    E: { enumerable: true, get() {
      if (!E) {
        E = [];
        for (let from = 0, n = x.gongs_shell_e_count(ptr); from < n; from += 1000) {
          const c = Math.min(1000, n - from);
          x.gongs_shell_e(ptr, from, c, s.at);
          const t = s.f64(3 * c);
          for (let e = 0; e < c; e++) E.push({ n: t[3 * e], i: t[3 * e + 1], v: t[3 * e + 2] });
        }
      }
      return E;
    } },
  });
  return S;
}

// Tables a page built (gongs-model.js, engineTables) are the C++ ones S if they hold the same modes
// and couplings, to rounding.
const verdicts = new WeakMap();
function same(T, S) {
  if (verdicts.get(T)?.S === S) return verdicts.get(T).ok;
  const close = (a, b) => a.length === b.length && Array.prototype.every.call(a, (v, i) => Math.abs(v - b[i]) <= 1e-9 * (1 + Math.abs(v)));
  const sum = (h) => h.reduce((t, v) => t + Math.abs(v), 0);
  const H = S.H.map((t) => (t.i === t.j ? 1 : 2) * t.v), h = Array.from(T.full.p1.h);
  const ok = T.N === S.N && T.tuned === S.tuned && close(T.Om, S.Om) && close(T.m, S.m) && close(T.C, S.C)
    && h.length === H.length && Math.abs(sum(h) / sum(H) - 1) < 1e-9;
  verdicts.set(T, { S, ok });
  return ok;
}

// One of the engine's voices, as the test suite reaches into the JavaScript engine's (its state,
// its tables, its mallet, its methods). Fields are read from, and a few written to, the C++.
const F = {
  key: 0, N: 1, R: 2, k: 3, h: 4, m: 5, nl: 6, hit: 7, psi: 8, eps0: 9, V: 10, Einj: 11, guards: 12, peak: 13, nlr: 14, adapt: 15,
  w0: 16, cs: 17, full: 18, lite: 19, hitK: 20, hitMi: 21, hitXm: 22, hitXm1: 23, hitD0: 24, hitDm1: 25, hitSteps: 26, hitFmax: 27,
  hitTouched: 28, tail: 29, dead: 30, killing: 31, released: 32, damped: 33, V3: 34, V4: 35, fitting: 36, cents: 37,
};
const BOOL = ['nl', 'adapt', 'tail', 'dead', 'killing', 'released', 'damped', 'fitting'];
class WasmVoice {
  constructor(eng, ptr, serial) {
    this.eng = eng; this.p = ptr; this.serial = serial; this.hook = null; this.replay = null; this.views = {};
    const x = Base.exports, me = this;
    this.original = function step() { if (!me.replay) x.gongs_voice_step(me.p); }; // (a no-op while replaying)
    const hit = {};
    for (const [k, f] of [['K', 'hitK'], ['Mi', 'hitMi'], ['xm', 'hitXm'], ['xm1', 'hitXm1'], ['d0', 'hitD0'], ['dm1', 'hitDm1'], ['steps', 'hitSteps'], ['Fmax', 'hitFmax']]) {
      Object.defineProperty(hit, k, { enumerable: true, get: () => me.get(f) });
    }
    Object.defineProperty(hit, 'touched', { enumerable: true, get: () => me.get('hitTouched') > 0 });
    this.hitView = hit;
  }
  get(f) { return Base.exports.gongs_voice_get(this.p, F[f]); }
  // a view of one of its arrays (made again when the memory has grown)
  array(which, n = this.N) {
    const x = Base.exports, at = x.gongs_voice_array(this.p, which), c = this.views[which];
    if (c && c.buffer === x.memory.buffer && c.byteOffset === at && c.length === n) return c;
    return (this.views[which] = new Float64Array(x.memory.buffer, at, n));
  }
  get x() { return this.replay ?? this.array(0); }
  get x1() { return this.array(1); }
  get A() { return this.array(2); }
  get phi() { return this.array(4); }
  get gv() { return this.array(5); }
  get g() { const me = this; return { get sigma() { return me.array(3); }, w0: this.get('w0') }; }
  get S() {
    const x = Base.exports, s = scratch(x), ptr = x.gongs_voice_shell(this.p);
    x.gongs_shell_spec(ptr, s.at);
    const [b, rise, terms] = s.f64(3), id = tablesId(BC[b], rise, terms), e = this.eng;
    if (!e.shells.has(id)) e.shells.set(id, shellObject(x, ptr));
    // tables a page sent for these parameters, if they are the C++ ones (then the voice plays on them)
    const S = e.shells.get(id), sent = e.sent.get(id);
    return sent && same(sent, S) ? sent : S;
  }
  get hit() { return this.get('hit') > 0 ? this.hitView : null; }
  get adapt() { return this.get('adapt') > 0; }
  set adapt(on) { Base.exports.gongs_voice_set(this.p, F.adapt, on ? 1 : 0); }
  get lite() { return this.get('lite'); } // the coupling sets, as handles: v.cs === v.full, v.lite = v.full
  set lite(c) { Base.exports.gongs_voice_set(this.p, F.lite, c); }
  // step(): one step of the scheme. A test may replace it to watch every step the engine takes
  // (v.step = () => { step(); … }): the C++ then records x after each, and process() replays them.
  get step() { return this.hook ?? this.original; }
  set step(fn) { this.hook = fn; Base.exports.gongs_voice_trace(this.p, fn ? 1 : 0); }
  replaySteps() {
    const x = Base.exports, n = x.gongs_voice_trace_count(this.p), N = this.N;
    if (!n) return;
    const t = new Float64Array(x.memory.buffer, x.gongs_voice_trace_data(this.p), n).slice();
    x.gongs_voice_trace_clear(this.p);
    try { for (let s = 0; s < n; s += N) { this.replay = t.subarray(s, s + N); this.hook(); } } finally { this.replay = null; }
  }
  setDamping() { Base.exports.gongs_voice_set_damping(this.p); }
  energyD() { return Base.exports.gongs_voice_energy_d(this.p); }
  linear() { Base.exports.gongs_voice_linear(this.p); }
}
for (const f of ['key', 'N', 'R', 'k', 'h', 'm', 'psi', 'eps0', 'V', 'V3', 'V4', 'Einj', 'guards', 'peak', 'nlr', 'cs', 'full', 'cents', ...BOOL.filter((b) => b !== 'adapt')]) {
  if (Object.getOwnPropertyDescriptor(WasmVoice.prototype, f)) continue;
  Object.defineProperty(WasmVoice.prototype, f, { get() { const v = this.get(f); return BOOL.includes(f) ? v > 0 : v; } });
}

// The engine, with the JavaScript engine's test hooks: e.voices (each a WasmVoice), e.place(key, x0).
export class GongWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
    this.proxies = new Map(); // serial → WasmVoice
    this.shells = new Map();  // tables read back, by id
    this.sent = new Map();    // tables a page sent (the JavaScript engine's; this one builds its own)
  }
  setParams(P) {
    if (P.tables) {
      this.sent.set(P.tables.id, P.tables);
      if (this.sent.size > 24) this.sent.delete(this.sent.keys().next().value);
    }
    super.setParams(P);
  }
  get voices() {
    const x = Base.exports, s = scratch(x), n = x.gongs_voices(this.e, s.at), a = new Int32Array(x.memory.buffer, s.at, 2 * n).slice(), live = new Set();
    const list = [];
    for (let i = 0; i < n; i++) {
      const ptr = a[2 * i], serial = a[2 * i + 1];
      live.add(serial);
      if (!this.proxies.has(serial)) this.proxies.set(serial, new WasmVoice(this, ptr, serial));
      list.push(this.proxies.get(serial));
    }
    for (const k of this.proxies.keys()) if (!live.has(k)) this.proxies.delete(k);
    return list;
  }
  // a voice in a given state, at rest (tests: free vibration of chosen modes)
  place(key, x0) {
    const x = Base.exports, s = scratch(x), n = Math.min(x0.length, 64);
    s.f64(n).set(Array.from(x0).slice(0, n).map((v) => v || 0));
    const p = x.gongs_place(this.e, key, s.at, n);
    if (!p) return null;
    return this.voices.find((v) => v.p === p);
  }
  process(L, R, n) {
    super.process(L, R, n);
    for (const v of this.proxies.values()) if (v.hook) v.replaySteps();
  }
}
export const ready = () => GongWasmEngine.ready();

// The model's functions the views call (gongs-model.js's keyGong, interpR, backbone and
// contactTime), computed by the WebAssembly. keyGong's gong has the fields the views read.
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD), at = 8 * params.length;
  const setP = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; };
  const shells = new Map(); // by id
  const rArg = at + 8 * 80; // (after keyGong's results)
  return {
    keyGong(key, P, fs) {
      const ptr = x.gongs_key(setP(P), key, fs, s.at + at), o = s.f64(11 + 64, at);
      const Nv = o[8], g = { key, fs, f0: o[0], w0: o[1], a: o[2], h: o[3], mass: o[4], fsi: o[5], R: o[6], k: o[7], Nv, fc: o[9], cp: o[10], sigma: o.slice(11, 11 + Nv) };
      const id = tablesId(P.bc, P.rise, P.terms);
      if (!shells.has(id)) {
        shells.set(id, shellObject(x, ptr));
        if (shells.size > 8) shells.delete(shells.keys().next().value);
      }
      g.S = shells.get(id);
      return g;
    },
    interpR(R, r) { s.f64(NR, rArg).set(R); return x.gongs_interp_r(s.at + rArg, r); },
    backbone: (S, p, Nv = S.N) => x.gongs_backbone(S.bcIndex, S.rise, S.terms, p, Nv),
    contactTime: (G, P, vel) => x.gongs_contact_time(setP(P), G.key, G.fs, vel),
  };
}

globalThis.GongWasmEngine = GongWasmEngine;
