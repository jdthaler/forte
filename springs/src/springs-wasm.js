// springs-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/springs): SpringWasmEngine, with the engine contract, and the model's
// functions for the page, its views and the tests.

import { GROUPS } from './springs-params.js';
import { wasmEngine, scratch, nativeParams, nativeValue } from '../../shared/wasm.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'springs', name: 'SpringWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/springs.wasm', import.meta.url).href };

// The C++ engine's messages (springs-engine.h, msg) into the page's: 'echo' (the strike's first
// moments, which the engine keeps in its capture) and 'error'.
function views(m, e) {
  if (m.type === 2) return { type: 'error', message: `spring ${m.key}: numerical failure` };
  if (m.type !== 1) return null;
  const x = Base.exports, n = m.values[0];
  const data = new Float32Array(x.memory.buffer, x.springs_capture(e.e), n).slice();
  return { type: 'echo', key: m.key, fs: e.fs, data, n, vel: m.values[1] };
}

const Base = wasmEngine(BUILD, { messages: views });

// Engines the tests make and drop give their memory back.
const dropped = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry((h) => Base.exports?.forte_destroy(h)) : null;

// The engine, with the tests' hooks: e.voices (each one's key, fading, dead, released, level, peak,
// age) and e.byKey, read back. A note may bring its key's springs, packed by the page's WebAssembly
// model (wasmModel().keySprings(…).packed), so the audio thread needn't build them.
const VOICE = ['key', 'fading', 'dead', 'released', 'level', 'peak', 'age', 'own'];
const FLAGS = new Set(['fading', 'dead', 'released', 'own']);
export class SpringWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
    dropped?.register(this, this.h, this);
  }
  destroy() { dropped?.unregister(this); super.destroy(); }
  noteOn(key, velocity, data) {
    if (data instanceof Float64Array) {
      const x = Base.exports, at = x.springs_input(data.length); // (may grow the memory: take its buffer after)
      new Float64Array(x.memory.buffer, at, data.length).set(data);
      x.springs_offer(this.e, data.length);
    }
    super.noteOn(key, velocity);
  }
  get voices() {
    const x = Base.exports, s = scratch(x), out = s.f64(VOICE.length);
    return Array.from({ length: x.springs_voices(this.e) }, (_, i) => {
      x.springs_voice(this.e, i, s.at);
      return Object.fromEntries(VOICE.map((k, j) => [k, FLAGS.has(k) ? out[j] > 0 : out[j]]));
    });
  }
  get byKey() { return new Map(this.voices.filter((v) => v.own).map((v) => [v.key, v])); }
}
export const ready = () => SpringWasmEngine.ready();

// The model's functions the page, its views and the tests call, computed by the WebAssembly
// (springs-model.cpp): keySprings(key, P, fs), a key's springs tuned, with their modes (f, c_g, rel,
// n) and packed for the engine (.packed: the page's noteData), the last few hundred kept;
// tuneSpring(key, P), the key's spring before the virtual-pitch correction; dispersionCurve(sp,
// { fTop, n }), its two acoustic sheets (k, f, c_g, bead share); modeSigma, pulseLength and
// pulseSpectrum; and, for the tests, rodSolve, Wittrick's rod at any shape and wavenumber.
const TUNE = ['R', 'r', 'alpha', 'nu', 'E', 'rho', 'slinky', 'key', 'f0', 'L', 'turns', 'height', 'mass', 'c0', 'TD', 'Fc', 'kc', 'sheet', 'onBranch', 'axial', 'fMax', 'A'];
const geometryId = (P) => `${P.family}|${P.coil}|${P.wire}|${P.helix}|${P.drive}|${P.springs}|${P.spread}|${P.mallet}|${P.bead}|${P.endLoss}|${P.eta}|${P.oil}|${TUNING_KEEP.map((id) => P[id]).join('|')}`; // (and the tuning: each spring is cut for its key's tuned note)
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD), OUT = 8 * params.length;
  const writeP = (P) => { const a = s.f64(params.length); params.forEach((p, i) => { a[i] = nativeValue(p, P[p.id]); }); return s.at; };
  const built = new Map();
  const model = {
    keySprings(key, P, fs) {
      const id = `${geometryId(P)}|${key}|${fs}`;
      let d = built.get(id);
      if (d) return d;
      const n = x.springs_key_springs(key, writeP(P), fs), a = new Float64Array(x.memory.buffer, x.springs_packed(), n).slice();
      const springs = [];
      for (let i = 9, q = 0; q < a[8]; q++) {
        const [L, f0, TD, Fc, gain, N] = a.subarray(i, i + 6);
        i += 6;
        const take = () => { const v = a.slice(i, i + N); i += N; return v; };
        springs.push({ L, f0, key, TD, Fc, gain, f: take(), cg: take(), rel: take(), n: Int32Array.from(take()) });
      }
      d = { id: geometryId(P), fs, rho: a[4], pitchBefore: a[5], pitch: a[6], global: a[7], springs, packed: a };
      if (built.size > 300) built.delete(built.keys().next().value);
      built.set(id, d);
      return d;
    },
    isBuilt: (key, P, fs) => built.has(`${geometryId(P)}|${key}|${fs}`),
    tuneSpring(key, P) {
      x.springs_tune(key, writeP(P), s.at + OUT);
      const a = s.f64(TUNE.length, OUT), sp = Object.fromEntries(TUNE.map((k, i) => [k, a[i]]));
      sp.slinky = sp.slinky > 0; sp.onBranch = sp.onBranch > 0; sp.drive = sp.axial > 0 ? 'axial' : 'rotation';
      sp.solver = { rc: { A: sp.A } };
      sp.of = { key, P: { ...P } }; // what dispersionCurve recomputes it from (kept by scaleSpring's copy)
      return sp;
    },
    // (sp from tuneSpring, perhaps scaled: its R is what the curve is drawn for; n up to the scratch
    // area's room, about a thousand)
    dispersionCurve(sp, { fTop, n = 600 }) {
      if (OUT + 64 * n > s.size) throw new RangeError(`dispersionCurve: ${n} points do not fit (at most ${Math.floor((s.size - OUT) / 64)})`);
      const of = sp.of ?? { key: sp.key, P: {} };
      const m = x.springs_dispersion(of.key, writeP(of.P), sp.R, fTop, n, s.at + OUT), a = s.f64(m, OUT), pts = [[], []];
      for (let j = 0, i = 0; j < 2; j++) for (let q = 0; q < n; q++, i += 4) pts[j].push({ k: a[i], f: a[i + 1], cg: a[i + 2], share: a[i + 3] });
      return pts;
    },
    // Wittrick's rod at any shape { rr: r/R, alpha, nu } and wavenumber k (1/R; R = 1, E = ρ = 1):
    // its six ω ascending, dω/dk and each one's bead share in rotation and along the axis (share).
    rodSolve({ rr, alpha, nu }, k) {
      x.springs_rod(rr, alpha, nu, k, s.at + OUT);
      const a = s.f64(24, OUT).slice();
      return { w: a.subarray(0, 6), dw: a.subarray(6, 12), share: { rotation: a.subarray(12, 18), axial: a.subarray(18, 24) } };
    },
    modeSigma: (f, cg, L, D) => x.springs_mode_sigma(f, cg, L, D.endLoss, D.eta, D.oil) + (D.extra || 0),
    pulseLength: (P, velocity) => x.springs_pulse_length(P.mallet, velocity),
    pulseSpectrum: (f, tau) => x.springs_pulse_spectrum(f, tau),
  };
  return model;
}

globalThis.SpringWasmEngine = SpringWasmEngine;
