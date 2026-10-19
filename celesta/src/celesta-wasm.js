// celesta-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/celesta): CelestaWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './celesta-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';
import { tuningRatio } from '../../shared/tuning.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'celesta', name: 'CelestaWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/celesta.wasm', import.meta.url).href };

// The C++ engine's messages (celesta-engine.h, msg) into the views': 'cel' (the struck bar and
// its box; one object, kept) and 'error'.
const CEL = ['Eb', 'Et', 'X', 'contactMs', 'Fmax', 'kappa', 'ft', 'damp', 'hammerOn'];
function views(m, e) {
  if (m.type === 2) return { type: 'error', message: `bar ${m.key}: numerical failure` };
  if (m.type !== 1) return null;
  const v = (e.cel ??= { type: 'cel', key: 0, amp: new Float64Array(7) });
  v.key = m.key;
  v.amp.set(m.values.subarray(0, 7));
  CEL.forEach((k, i) => { v[k] = m.values[7 + i]; });
  return v;
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the tests' hooks: e.voices (each bar's key, fading, released, energies,
// hammer contact, damper) and e.byKey, read back.
const VOICE = ['key', 'fading', 'dead', 'released', 'Eb', 'Et', 'E', 'lastContactMs', 'Fmax', 'age', 'own', 'hammerOn', 'damp'];
const FLAGS = new Set(['fading', 'dead', 'released', 'own', 'hammerOn']);
export class CelestaWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get voices() {
    const x = Base.exports, s = scratch(x), out = s.f64(VOICE.length);
    return Array.from({ length: x.celesta_voices(this.e) }, (_, i) => {
      x.celesta_voice(this.e, i, s.at);
      return Object.fromEntries(VOICE.map((k, j) => [k, FLAGS.has(k) ? out[j] > 0 : out[j]]));
    });
  }
  get byKey() { return new Map(this.voices.filter((v) => v.own).map((v) => [v.key, v])); }
}
export const ready = () => CelestaWasmEngine.ready();

// The model's functions (celesta-model.h), computed by the WebAssembly: bar(k, thick, ratio), a
// key's bar and box, cut for its tuning ratio (shared/tuning.js tuningRatio; 1 in equal temperament
// at A = 440 Hz); boxState(k, P), its box for the knobs and the tuning; the Timoshenko beam (det, freqs) and Euler's
// for comparison; torsion; Zener's loss; the coupled pair; the hammer; the steel's constants.
const BOX = ['depth', 'le', 'ma', 'Ka', 'mg', 'Rrad', 'Rwall', 'R', 'M11', 'M12', 'M22'];
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const bars = new Map();
  const st = s.f64(5);
  x.celesta_steel(s.at);
  const STEEL = { E: st[0], rho: st[1], nu: st[2], kappa: st[3], G: st[4] };
  return {
    STEEL,
    BETA_L: Array.from({ length: 5 }, (_, n) => x.celesta_beta_l(n)),
    bar(k, thick = 2.5, ratio = 1) {
      const id = `${k}|${thick}|${ratio}`;
      if (bars.has(id)) return bars.get(id);
      const n = x.celesta_bar(k, thick, ratio, s.at), a = s.f64(n).slice();
      const N = a[5], NX = a[6];
      let i = 18;
      const take = (m) => { const v = a.slice(i, i + m); i += m; return v; };
      const modes = [];
      for (let j = 0; j < N; j++) {
        const [tors, f, ratio, sigTE, sigSup, sigRad, out, dampW] = take(8);
        modes.push({ kind: tors ? 'tors' : 'bend', f, ratio, sigTE, sigSup, sigRad, out, dampW, w: take(NX) });
      }
      const nb = modes.filter((m) => m.kind === 'bend').length;
      modes.forEach((m, j) => { m.n = m.kind === 'bend' ? j + 1 : j - nb + 1; });
      const bar = {
        key: a[0], L: a[1], b: a[2], h: a[3], mass: a[4], NX, nodes: [a[7], a[8]],
        box: { w: a[9], l: a[10], S: a[11], Sb: a[12], Rb: a[13], delta0: a[14], perim: a[15] }, pan: [a[16], a[17]], modes,
      };
      if (bars.size > 256) bars.clear();
      bars.set(id, bar);
      return bar;
    },
    boxState(k, P) {
      x.celesta_box_state(k, P.thick, tuningRatio(P, k), P.gap / 1000, P.detune, s.at);
      const a = s.f64(BOX.length);
      return Object.fromEntries(BOX.map((key, i) => [key, a[i]]));
    },
    timoshenkoDet: (omega, L, b, h) => x.celesta_timoshenko_det(omega, L, b, h),
    timoshenkoFreqs(L, b, h, n) { const m = x.celesta_timoshenko_freqs(L, b, h, n, s.at); return Array.from(s.f64(m)); },
    eulerFreq: (L, b, h, n) => x.celesta_euler_freq(L, b, h, n),
    torsionFreq: (L, b, h, n) => x.celesta_torsion_freq(L, b, h, n),
    torsionJ: (b, h) => x.celesta_torsion_j(b, h),
    zener: (h, f) => x.celesta_zener(h, f),
    twoOscillator(fb, ft, kappa) { x.celesta_two_oscillator(fb, ft, kappa, s.at); return Array.from(s.f64(2)); },
    hammer(k, P) { x.celesta_hammer(k, P.hardness, P.mass, s.at); const a = s.f64(4); return { m: a[0], K: a[1], p: a[2], alpha: a[3] }; },
  };
}

globalThis.CelestaWasmEngine = CelestaWasmEngine;
