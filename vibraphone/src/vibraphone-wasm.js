// vibraphone-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/vibraphone): VibraphoneWasmEngine, with the engine contract, and the model's
// functions for the views. The page runs it when it can and falls back to the JavaScript
// (vibraphone-engine.js).

import { GROUPS } from './vibraphone-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'vibraphone', name: 'VibraphoneWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/vibraphone.wasm', import.meta.url).href };

// The C++ engine's messages (vibraphone-engine.h, msg) back into the JavaScript engine's: 'vibe'
// (the struck bar, its tube and disc, the shaft; one object, kept, as the JavaScript keeps it) and
// 'error'.
const VIBE = ['Eb', 'Et', 'theta', 'open', 'kappa', 'ft', 'contactMs', 'Fmax', 'shaft', 'motor', 'X'];
function views(m, e) {
  if (m.type === 2) return { type: 'error', message: `bar ${m.key}: numerical failure` };
  if (m.type !== 1) return null;
  const v = (e.vibe ??= { type: 'vibe', key: 0, amp: new Float64Array(8) });
  v.key = m.key;
  v.amp.set(m.values.subarray(0, 8));
  VIBE.forEach((k, i) => { v[k] = m.values[8 + i]; });
  return v;
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the JavaScript engine's test hooks: e.voices (each bar's key, fading, released,
// energies, mallet contact) and e.byKey, read back. A note may bring its bar's data, packed by the
// page's WebAssembly model (wasmModel().voiceData), so the audio thread needn't build it.
const VOICE = ['key', 'fading', 'dead', 'released', 'Eb', 'Et', 'E', 'lastContactMs', 'Fmax', 'age', 'own', 'malletOn'];
const FLAGS = new Set(['fading', 'dead', 'released', 'own', 'malletOn']);
export class VibraphoneWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  noteOn(key, velocity, data) {
    if (data instanceof Float64Array) {
      const x = Base.exports, s = scratch(x);
      if (data.length * 8 <= s.size) { s.f64(data.length).set(data); x.vibraphone_offer(this.e, s.at, data.length); }
    }
    super.noteOn(key, velocity);
  }
  get voices() {
    const x = Base.exports, s = scratch(x), out = s.f64(VOICE.length);
    return Array.from({ length: x.vibraphone_voices(this.e) }, (_, i) => {
      x.vibraphone_voice(this.e, i, s.at);
      return Object.fromEntries(VOICE.map((k, j) => [k, FLAGS.has(k) ? out[j] > 0 : out[j]]));
    });
  }
  get byKey() { return new Map(this.voices.filter((v) => v.own).map((v) => [v.key, v])); }
}
export const ready = () => VibraphoneWasmEngine.ready();

// The model's functions the views call (vibraphone-model.js's barModel, tubeGeometry, tubeState,
// coupling, barTempScale, malletOf; bar.js's thickness), computed by the WebAssembly, and
// voiceData: a bar's data packed for the WebAssembly engine (the page's noteData).
const TUBE = ['a', 'S', 'Sb', 'Rb', 'delta0', 'lv'];
const STATE = ['length', 'le', 'ma', 'Ka', 'mg', 'Sb', 'Rrad', 'Rwall', 'R', 'lvS', 'cd', 'M11', 'M12', 'M22'];
const T_TUNE = 20;
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const bars = new Map();
  const model = {
    barModel(k, depth = 1) {
      const id = `${k}|${depth}`;
      if (bars.has(id)) return bars.get(id);
      const n = x.vibraphone_bar_model(k, depth, s.at), a = s.f64(n).slice();
      const nx = a[14], N = a[15], nn = a[16];
      let i = 17;
      const take = (m) => { const v = a.slice(i, i + m); i += m; return v; };
      const nodes = Array.from(take(nn)), xs = take(nx), modes = [];
      for (let j = 0; j < N; j++) {
        const [tors, nth, f, ratio, sym, sigTE, sigSup, sigRad, out] = take(9);
        modes.push({ kind: tors ? 'tors' : 'bend', n: nth, f, ratio, sym: sym > 0, w: take(nx), sigTE, sigSup, sigRad, out });
      }
      const geom = { key: a[0], L: a[1], b: a[2], h0: a[3], cf: a[4], A: a[5], D: a[6], depth: a[7], cut: { h0: a[8], a: a[9], c: a[10], d: a[11] } };
      const bar = { key: a[0], geom, xs, modes, nodes, mass: a[12], hmin: a[13] };
      if (bars.size > 256) bars.clear();
      bars.set(id, bar);
      return bar;
    },
    tubeGeometry(k, bar) {
      x.vibraphone_tube_geometry(bar.key, bar.geom.depth, s.at);
      const a = s.f64(TUBE.length);
      return Object.fromEntries(TUBE.map((key, i) => [key, a[i]]));
    },
    tubeState(tg, f1, { gap, detune = 0, temp = T_TUNE, cd }) {
      s.f64(11).set([...TUBE.map((key) => tg[key]), f1, gap, detune, temp, cd]);
      x.vibraphone_tube_state(s.at, s.at + 8 * 11);
      const a = s.f64(STATE.length, 8 * 11);
      return Object.fromEntries(STATE.map((key, i) => [key, a[i]]));
    },
    coupling(ts, theta, fb) {
      const a = s.f64(STATE.length);
      STATE.forEach((key, i) => { a[i] = ts[key]; });
      x.vibraphone_coupling(s.at, theta, fb, s.at + 8 * STATE.length);
      const c = s.f64(4, 8 * STATE.length);
      return { kappa: c[0], ft: c[1], fb: c[2], m22: c[3] };
    },
    barTempScale: (temp) => x.vibraphone_bar_temp_scale(temp),
    malletOf(P) {
      x.vibraphone_mallet(P.hardness, P.mass, s.at);
      const a = s.f64(4);
      return { m: a[0], K: a[1], p: a[2], alpha: a[3] };
    },
    thickness: (cut, X) => x.vibraphone_thickness(cut.h0, cut.a, cut.c, cut.d, X),
    voiceData(k, depth = 1) {
      const n = x.vibraphone_voice_data(k, depth, s.at);
      return s.f64(n).slice();
    },
  };
  return model;
}

globalThis.VibraphoneWasmEngine = VibraphoneWasmEngine;
