// marimba-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/marimba): MarimbaWasmEngine, with the engine contract, and the model's
// functions for the views, the tests and the tools.

import { GROUPS, KINDS } from './marimba-params.js';
import { wasmEngine, scratch, nativeParams, nativeValue } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'marimba', name: 'MarimbaWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/marimba.wasm', import.meta.url).href };

// The C++ engine's messages (marimba-engine.h, msg) into the views': 'bar' (the struck bar and its
// tube; one object, kept) and 'error'.
const BAR = ['Eb', 'Et', 'X1', 'X2', 'kappa1', 'kappa2', 'ft1', 'ft2', 'contactMs', 'Fmax'];
function views(m, e) {
  if (m.type === 2) return { type: 'error', message: `bar ${m.key}: numerical failure` };
  if (m.type !== 1) return null;
  const v = (e.bar ??= { type: 'bar', key: 0, amp: new Float64Array(8) });
  v.key = m.key;
  v.amp.set(m.values.subarray(0, 8));
  BAR.forEach((k, i) => { v[k] = m.values[8 + i]; });
  return v;
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the tests' hooks: e.voices (each bar's key, fading, held, energies, mallet
// contact, its pairs' κ, its strokes) and e.byKey, read back. A note may bring its bar's data, packed by the
// page's WebAssembly model (wasmModel().voiceData), so the audio thread needn't build it.
const VOICE = ['key', 'fading', 'dead', 'held', 'Eb', 'Et', 'E', 'lastContactMs', 'Fmax', 'age', 'own', 'malletOn', 'kappa1', 'kappa2', 'strokes'];
const FLAGS = new Set(['fading', 'dead', 'held', 'own', 'malletOn']);
export class MarimbaWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  noteOn(key, velocity, data) {
    if (data instanceof Float64Array) {
      const x = Base.exports, s = scratch(x);
      if (data.length * 8 <= s.size) { s.f64(data.length).set(data); x.marimba_offer(this.e, s.at, data.length); }
    }
    super.noteOn(key, velocity);
  }
  get voices() {
    const x = Base.exports, s = scratch(x), out = s.f64(VOICE.length);
    return Array.from({ length: x.marimba_voices(this.e) }, (_, i) => {
      x.marimba_voice(this.e, i, s.at);
      return Object.fromEntries(VOICE.map((k, j) => [k, FLAGS.has(k) ? out[j] > 0 : out[j]]));
    });
  }
  get byKey() { return new Map(this.voices.filter((v) => v.own).map((v) => [v.key, v])); }
}
export const ready = () => MarimbaWasmEngine.ready();

// The model's functions (marimba-model.h), computed by the WebAssembly. kind is 'marimba' or
// 'xylophone' (or its index). barModel(kind, k, depth, ratio) cuts the bar for its key's tuning
// ratio (shared/tuning.js tuningRatio; 1 in equal temperament at A = 440 Hz); voiceData(k, P)
// takes the instrument, the depth and the tuning from the parameters, as the engine does.
const kindIndex = (kind) => (typeof kind === 'number' ? kind : KINDS.findIndex(([k]) => k === kind));
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD);
  const bars = new Map();
  const model = {
    barModel(kind, k, depth = 1, ratio = 1) {
      const ki = kindIndex(kind), id = `${ki}|${k}|${depth}|${ratio}`;
      if (bars.has(id)) return bars.get(id);
      const n = x.marimba_bar_model(ki, k, depth, ratio, s.at), a = s.f64(n).slice();
      const nx = a[14], N = a[15], nn = a[16];
      let i = 17;
      const take = (m) => { const v = a.slice(i, i + m); i += m; return v; };
      const nodes = Array.from(take(nn)), xs = take(nx), modes = [];
      for (let j = 0; j < N; j++) {
        const [tors, nth, f, r, sym, sigSup, sigRad, out] = take(8);
        modes.push({ kind: tors ? 'tors' : 'bend', n: nth, f, ratio: r, sym: sym > 0, w: take(nx), sigSup, sigRad, out });
      }
      const geom = { key: a[0], L: a[1], b: a[2], h0: a[3], cf: a[4], A: a[5], D: a[6], depth: a[7], cut: { h0: a[8], a: a[9], c: a[10], d: a[11] } };
      const bar = { kind: ki, key: a[0], geom, ratio, xs, modes, nodes, mass: a[12], hmin: a[13] };
      if (bars.size > 256) bars.clear();
      bars.set(id, bar);
      return bar;
    },
    // the tube under a bar: { a, length, le, ma, mg, modes: [{ Ka, R, ft, Sb, M11, M12, M22, kappa }] × 2 }
    tube(bar, { gap, detune = 0, offset = 0 }) {
      x.marimba_tube(bar.kind, bar.key, bar.geom.depth, bar.ratio, gap, detune, offset, s.at);
      const a = s.f64(21).slice();
      const mode = (o) => ({ Ka: a[o], R: a[o + 1], ft: a[o + 2], Sb: a[o + 3], M11: a[o + 4], M12: a[o + 5], M22: a[o + 6], kappa: a[o + 7] });
      return { a: a[0], length: a[1], le: a[2], ma: a[3], mg: a[4], modes: [mode(5), mode(13)] };
    },
    malletOf(P) {
      x.marimba_mallet(P.hardness, P.mass, s.at);
      const a = s.f64(4);
      return { m: a[0], K: a[1], p: a[2], alpha: a[3] };
    },
    blank(kind, k) {
      x.marimba_blank(kindIndex(kind), k, s.at);
      const a = s.f64(8);
      return { b: a[0], h0: a[1], cf: a[2], A: a[3], accidental: a[4] > 0, x: a[5], pan: [a[6], a[7]] };
    },
    tune(kind, k, { A, D, L }) {
      x.marimba_tune(kindIndex(kind), k, A, D, L, s.at);
      const a = s.f64(7);
      return { L: a[0], A: a[1], D: a[2], cents: [a[3], a[4], a[5]], iterations: a[6] };
    },
    thickness: (cut, X) => x.marimba_thickness(cut.h0, cut.a, cut.c, cut.d, X),
    voiceData(k, P) {
      s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id])));
      const n = x.marimba_voice_data(k, s.at, s.at + 8 * params.length);
      return s.f64(n, 8 * params.length).slice();
    },
  };
  return model;
}

globalThis.MarimbaWasmEngine = MarimbaWasmEngine;
