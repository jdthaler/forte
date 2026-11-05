// tubular-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/tubular): TubularWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './tubular-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'tubular', name: 'TubularWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/tubular.wasm', import.meta.url).href };

// The C++ engine's messages (tubular-engine.h, msg) into the views': 'tube' (the struck tube; one
// object, kept) and 'error'.
const VIEW_MODES = 16;
const TUBE = ['E', 'contactMs', 'Fmax', 'damp', 'malletOn'];
function views(m, e) {
  if (m.type === 2) return { type: 'error', message: `tube ${m.key}: numerical failure` };
  if (m.type !== 1) return null;
  const v = (e.view ??= { type: 'tube', key: 0, amp: new Float64Array(VIEW_MODES) });
  v.key = m.key;
  v.amp.set(m.values.subarray(0, VIEW_MODES));
  TUBE.forEach((k, i) => { v[k] = m.values[VIEW_MODES + i]; });
  return v;
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the tests' hooks: e.voices (each tube's key, fading, released, energy, mallet
// contact, damper, modes) and e.byKey, read back. A note may bring its tube, packed by the page's
// WebAssembly model (wasmModel().voiceData), so the audio thread needn't build it.
const VOICE = ['key', 'fading', 'dead', 'released', 'E', 'lastContactMs', 'Fmax', 'age', 'own', 'malletOn', 'damp', 'N', 'sounding'];
const FLAGS = new Set(['fading', 'dead', 'released', 'own', 'malletOn']);
export class TubularWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  noteOn(key, velocity, data) {
    if (data instanceof Float64Array) {
      const x = Base.exports, s = scratch(x);
      if (data.length * 8 <= s.size) { s.f64(data.length).set(data); x.tubular_offer(this.e, s.at, data.length); }
    }
    super.noteOn(key, velocity);
  }
  get voices() {
    const x = Base.exports, s = scratch(x), out = s.f64(VOICE.length);
    return Array.from({ length: x.tubular_voices(this.e) }, (_, i) => {
      x.tubular_voice(this.e, i, s.at);
      return Object.fromEntries(VOICE.map((k, j) => [k, FLAGS.has(k) ? out[j] > 0 : out[j]]));
    });
  }
  get byKey() { return new Map(this.voices.filter((v) => v.own).map((v) => [v.key, v])); }
}
export const ready = () => TubularWasmEngine.ready();

// The model's functions (tubular-model.h), computed by the WebAssembly: tube(k, P), a key's tube
// for the parameters (its metal, section, cap, the microphones' distance and the keyboard's
// tuning, as the engine reads them) with every mode; modeAt, transform, a mode's shape and its
// Fourier transform; the beam (section, det, freqs, euler, cutoff, cutLength, kappa); the Bessel
// functions and the fat cylinder's factor; place(k), where the frame hangs a tube; mallet; the
// constants; and voiceData(k, P): a key's tube packed for the engine (the page's noteData).
const MATERIALS = ['brass', 'aluminium', 'steel'];
const SECTION = ['E', 'rho', 'G', 'kappa', 'a', 'ai', 'A', 'I', 'mc', 'Jc'];
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; }; // a choice as its index, as the engine gets it
  const out = () => s.at + 8 * params.length;
  const mat = (m) => (typeof m === 'number' ? m : Math.max(0, MATERIALS.indexOf(m)));
  const c = s.f64(x.tubular_constants(s.at)).slice();
  const metals = Object.fromEntries(MATERIALS.map((m, i) => [m, { E: c[3 * i], rho: c[3 * i + 1], nu: c[3 * i + 2] }]));
  const [C_AIR, RHO_AIR, SPACING, ROW, MIC_HALF, MIC_DROP, DAMPER_Z, DAMPER_W, CAP_DEPTH, KEY_LO, KEY_HI, KEY_MIN, KEY_MAX] = c.slice(9);
  const tubes = new Map();
  return {
    MATERIALS: metals, C_AIR, RHO_AIR, SPACING, ROW, MIC_HALF, MIC_DROP, DAMPER_Z, DAMPER_W, CAP_DEPTH, KEY_LO, KEY_HI, KEY_MIN, KEY_MAX,
    BETA_L: Array.from({ length: 6 }, (_, n) => x.tubular_beta_l(n)),
    tube(k, P) {
      const id = `${k}|${params.map((p) => P[p.id]).join('|')}`;
      if (tubes.has(id)) return tubes.get(id);
      const n = x.tubular_tube(k, put(P), out()), a = new Float64Array(x.memory.buffer, out(), n).slice();
      const N = a[16], NX = a[17];
      let i = 18;
      const take = (m) => { const v = a.slice(i, i + m); i += m; return v; };
      const modes = [];
      for (let j = 0; j < N; j++) {
        const [f, sigRad, J, dampW, gLr, gLi, gRr, gRi, alpha, beta, ka, kb, c0, c1, c2, c3] = take(16);
        modes.push({ n: j + 1, f, sigRad, J, dampW, gain: [[gLr, gLi], [gRr, gRi]], alpha, beta, ka, kb, c: [c0, c1, c2, c3], w: take(NX) });
      }
      const section = Object.fromEntries(SECTION.map((key, j) => [key, a[4 + j]]));
      const tube = { key: a[0], L: a[1], mass: a[2], f4: a[3], section, place: { x: a[14], y: a[15] }, NX, modes };
      if (tubes.size > 128) tubes.clear();
      tubes.set(id, tube);
      return tube;
    },
    modeAt(k, P, i, xm) { x.tubular_mode_at(k, put(P), i, xm, out()); const r = new Float64Array(x.memory.buffer, out(), 2); return { w: r[0], psi: r[1] }; },
    transform(k, P, i, kappa) { x.tubular_transform(k, put(P), i, kappa, out()); const r = new Float64Array(x.memory.buffer, out(), 2); return [r[0], r[1]]; },
    section(m, D, wall, cap) { x.tubular_section(mat(m), D, wall, cap, s.at); const a = s.f64(10); return Object.fromEntries(SECTION.map((key, j) => [key, a[j]])); },
    det: (m, D, wall, cap, L, omega) => x.tubular_det(mat(m), D, wall, cap, L, omega),
    freqs(m, D, wall, cap, L, fLo, fHi, n) { const k = x.tubular_freqs(mat(m), D, wall, cap, L, fLo, fHi, n, s.at); return Array.from(s.f64(k)); },
    euler: (m, D, wall, L, n) => x.tubular_euler(mat(m), D, wall, L, n),
    cutoff: (m, D, wall) => x.tubular_cutoff(mat(m), D, wall),
    cutLength: (m, D, wall, cap, note) => x.tubular_cut_length(mat(m), D, wall, cap, note),
    kappa: (nu, m) => x.tubular_kappa(nu, m),
    bessel: (which, v) => x.tubular_bessel(which, v),
    fat: (ka) => x.tubular_fat(ka),
    place(k) { x.tubular_place(k, s.at); const a = s.f64(2); return { x: a[0], y: a[1] }; },
    mallet(hardness, mass) { x.tubular_mallet(hardness, mass, s.at); const a = s.f64(4); return { m: a[0], K: a[1], p: a[2], alpha: a[3] }; },
    voiceData(k, P) { const n = x.tubular_voice_data(k, put(P), out()); return new Float64Array(x.memory.buffer, out(), n).slice(); },
  };
}

globalThis.TubularWasmEngine = TubularWasmEngine;
