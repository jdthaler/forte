// carillon-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/carillon): CarillonWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './carillon-params.js';
import { BELL_TABLE } from './bell-table.js';
import { IDEAL } from './partials.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'carillon', name: 'CarillonWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/carillon.wasm', import.meta.url).href };
const PROFILES = GROUPS.flatMap((g) => g.params).find((p) => p.id === 'profile').options.map(([v]) => v);
const PARTIALS = Object.keys(IDEAL); // the C++ Partial enum's order (bell-table.h)

// The C++ engine's messages (carillon-engine.h, msg) into the views' 'bell' message: the struck
// bell, its resonators' amplitudes in pieces, then done.
function views(m, e) {
  const s = (e.views ??= { type: 'bell', key: 0, amp: new Float32Array(512), n: 0, contactMs: 0, fwhm: 0, Fmax: 0, v: 0, age: 0, id: '' });
  const v = m.values;
  switch (m.type) {
    case 1: // the struck bell: n, age, contactMs, fwhm, Fmax, v, profile, historic
      s.key = m.key;
      if (!m.key) { s.n = 0; return s; }
      [s.n, s.age, s.contactMs, s.fwhm, s.Fmax, s.v] = v;
      // the historic amount came as float32: the page compares the id with its own, so give back
      // the number it set
      s.id = `${PROFILES[v[6]]}|${e.historics?.get(v[7]) ?? v[7]}`;
      return null;
    case 2: s.amp.set(v.subarray(1), v[0]); return null; // amplitudes from the index in v[0]
    case 3: return s.key ? s : null;
    case 4: return { type: 'error', message: `bell ${m.key}: numerical failure` };
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the tests' hooks: e.voices (in the order they were struck:
// key, fading, released, its resonators and those playing, and the clapper's cl: on, ms, fwhm, Fmax,
// v) and e.byKey (key → voice).
export class CarillonWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
    this.historics = new Map();
  }
  setParams(P) {
    if (typeof P.historic === 'number') { if (this.historics.size > 256) this.historics.clear(); this.historics.set(Math.fround(P.historic), P.historic); }
    super.setParams(P);
  }
  get voices() {
    const x = Base.exports, s = scratch(x), out = s.f64(13);
    return Array.from({ length: x.carillon_voices(this.e) }, (_, i) => {
      x.carillon_voice(this.e, i, s.at);
      const [key, fading, dead, released, on, ms, fwhm, Fmax, v, age, level, resonators, playing] = out;
      return { key, fading: fading > 0, dead: dead > 0, released: released > 0, age, level, resonators, playing, cl: { on: on > 0, ms, fwhm, Fmax, v } };
    });
  }
  get byKey() {
    const x = Base.exports, voices = this.voices, map = new Map();
    for (const v of voices) { const i = x.carillon_by_key(this.e, v.key); if (i >= 0) map.set(v.key, voices[i]); }
    return map;
  }
}
export const ready = () => CarillonWasmEngine.ready();

// The model's functions (carillon-model.h: bellOf, bellModes, clapperOf, clapperSpeed, hertzTime,
// asymmetryOf, doubletSplit, struckPartials, strikeNote, airAbsorption, radiationEfficiency),
// computed by the WebAssembly. A bell keeps its rib from the JavaScript table (the same numbers:
// bell-table.h is converted from it) for the drawings' nodal circles and mode shapes.
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD), OUT = 256;
  const setP = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; };
  const prof = (p) => Math.max(0, PROFILES.indexOf(p));
  const out = (n) => s.f64(n, OUT);
  const model = {
    // ratio: the keyboard's tuning for the key (shared/tuning.js tuningRatio), which the bell is cast for
    bellOf(key, profile = 'minor', historicAmount = 0, ratio = 1) {
      const pi = prof(profile);
      x.carillon_bell(key, pi, historicAmount, ratio, s.at + OUT);
      const head = out(8), n = head[6], all = out(8 + n + (head[7] ? n + 5 + 66 : 0)).slice();
      let at = 8;
      const take = (k) => Array.from(all.subarray(at, (at += k)));
      const f = take(n);
      let hist = null;
      if (head[7]) {
        const lnf = take(n), d = take(5), a = take(66);
        // (bell: whose it is, for asymmetryOf)
        hist = { lnf, d, asym: Array.from({ length: 33 }, (_, m) => ({ e: a[2 * m], psi: a[2 * m + 1] })), bell: [key, pi, historicAmount, ratio], memo: new Map() };
      }
      return {
        key, profile, rib: BELL_TABLE.ribs[x.carillon_rib(key, pi)], D: head[0], H: head[1], mass: head[2], fNom: head[3], fPrime: head[4], f, hist,
        strikeHeight: head[5], args: [key, pi, historicAmount, ratio],
      };
    },
    bellModes(b, P) {
      const n = x.carillon_bell_modes(...b.args, setP(P), s.at + OUT), a = out(12 * n);
      return Array.from({ length: n }, (_, i) => {
        const [j, m, k, name, f, sigma, sigRad, sigInt, eff, reach, rad, kappa] = a.subarray(12 * i, 12 * i + 12);
        return { j, m, k, name: PARTIALS[name], f, sigma, sigRad, sigInt, eff, reach, rad, kappa };
      });
    },
    clapperOf(b, P) {
      x.carillon_clapper(...b.args, setP(P), s.at + OUT);
      const [m, R, K, Es] = out(4);
      return { m, R, K, Es };
    },
    clapperSpeed: (b, P, velocity) => x.carillon_clapper_speed(...b.args, setP(P), velocity),
    hertzTime: (m, K, v) => x.carillon_hertz_time(m, K, v),
    // dB/m at f (Hz), temperature T (°C) and relative humidity hr (%), at sea level (ISO 9613-1)
    airAbsorption: (f, T = 15, hr = 70) => x.carillon_air_absorption(f, T, hr),
    // a sphere vibrating in its ℓ-th harmonic: the real part of its specific impedance over ρc
    radiationEfficiency: (l, ka) => x.carillon_radiation_efficiency(l, ka),
    // a bell's hist (from bellOf) carries the bell; without one, the knob's asymmetry alone
    asymmetryOf(m, eps, hist) {
      const id = `${m}|${eps}`, memo = hist?.memo;
      if (memo?.has(id)) return memo.get(id); // (the views ask for every resonator, every frame)
      x.carillon_asymmetry(...(hist ? hist.bell : [60, 0, 0, 1]), m, eps, s.at + OUT);
      const [e, psi] = out(2), a = { e, psi };
      if (memo) { if (memo.size > 512) memo.clear(); memo.set(id, a); }
      return a;
    },
    doubletSplit(kappa, e) { x.carillon_doublet_split(kappa, e, s.at + OUT); return Array.from(out(2)); },
    struckPartials(b, P) {
      const n = x.carillon_struck_partials(...b.args, setP(P), P.velocity ?? 0.7, s.at + OUT), a = out(2 * n);
      return Array.from({ length: n }, (_, i) => ({ f: a[2 * i], a: a[2 * i + 1] }));
    },
    strikeNote(partials) {
      const n = partials.length, inp = s.f64(2 * n);
      partials.forEach((p, i) => { inp[2 * i] = p.f; inp[2 * i + 1] = p.a; });
      const res = 8 * 2 * n;
      x.carillon_strike_note(s.at, n, s.at + res);
      const [f, strength, m] = s.f64(3, res);
      return { f, strength, curve: m ? s.f64(m, res + 24).slice() : null, fLo: 40, ppo: 48 };
    },
  };
  return model;
}

globalThis.CarillonWasmEngine = CarillonWasmEngine;
