// planets-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/planets): PlanetWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './planets-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'planets', name: 'PlanetWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/planets.wasm', import.meta.url).href };
const Base = wasmEngine(BUILD);

// The engine, with the tests' hook: e.oscillators(v), voice slot v's oscillators (−1: silent).
export class PlanetWasmEngine extends Base {
  constructor(fs) { super(fs); this.e = Base.exports.forte_engine(this.h); }
  oscillators(v) { return Base.exports.planets_voice_oscillators(this.e, v); }
}
export const ready = () => PlanetWasmEngine.ready();

// The model, computed by the WebAssembly (planets-model.cpp):
//   planets: [{ id, R (km), f0S2 (Hz), day (s), maxDepth (km), modes: [{ type 'S'|'T', n, l, f, Q, chi, U, V, P }] }]
//   speedup(key, P), magnitude(velocity, P), halfDuration(velocity, P), station(P) → { theta, phi }
//   multiplets(key, velocity, P, max) → the loudest [{ f (Hz, heard), amp, decay (1/s, heard), type, n, l }]
//   field(velocity, P, lmax, t, pts) → the radial displacement at points [θ, φ, θ, φ, …] (rad), t s after
//   legendre(L, θ) → { P, dP } (the tests' check of the spherical harmonics)
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const setP = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; };
  const out = () => s.at + 8 * params.length;
  const planets = Array.from({ length: x.planets_count() }, (_, i) => {
    const modes = Array.from({ length: x.planets_table_count(i) }, (_, j) => {
      x.planets_table_mode(i, j, s.at);
      const m = s.f64(9);
      return { type: m[0] ? 'T' : 'S', n: m[1], l: m[2], f: m[3], Q: m[4], chi: m[5], U: m[6], V: m[7], P: m[8] };
    });
    return { id: ['earth', 'mars', 'moon'][i], R: x.planets_radius(i), f0S2: x.planets_f0s2(i), day: x.planets_day(i), maxDepth: x.planets_max_depth(i), modes };
  });
  return {
    planets,
    speedup: (key, P) => x.planets_speedup(key, setP(P)),
    magnitude: (velocity, P) => x.planets_magnitude(velocity, setP(P)),
    halfDuration: (velocity, P) => x.planets_half_duration(velocity, setP(P)),
    station(P) { x.planets_station(setP(P), out()); const v = new Float64Array(x.memory.buffer, out(), 2); return { theta: v[0], phi: v[1] }; },
    multiplets(key, velocity, P, max = 60) {
      const n = x.planets_multiplets(key, velocity, setP(P), out(), max);
      const v = new Float64Array(x.memory.buffer, out(), 6 * n);
      return Array.from({ length: n }, (_, i) => ({ f: v[6 * i], amp: v[6 * i + 1], decay: v[6 * i + 2], type: v[6 * i + 3] ? 'T' : 'S', n: v[6 * i + 4], l: v[6 * i + 5] }));
    },
    field(velocity, P, lmax, t, pts) {
      const n = pts.length / 2, at = setP(P), p = out(), o = p + 16 * n;
      if (o + 8 * n - s.at > s.size) throw new Error('too many points');
      new Float64Array(x.memory.buffer, p, 2 * n).set(pts);
      x.planets_field(velocity, at, lmax, t, n, p, o);
      return Float64Array.from(new Float64Array(x.memory.buffer, o, n));
    },
    legendre(L, theta) {
      const n = (L + 1) * (L + 2) / 2;
      x.planets_legendre(L, theta, s.at, s.at + 8 * n);
      return { P: Array.from(s.f64(n)), dP: Array.from(s.f64(n, 8 * n)) };
    },
  };
}

globalThis.PlanetWasmEngine = PlanetWasmEngine;
