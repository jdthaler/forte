// stars-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/stars): StarWasmEngine, with the engine contract, and the model's functions
// for the views. The page runs it when it can and falls back to the JavaScript (stars-engine.js).

import { GROUPS } from './stars-params.js';
import { starId } from './stars-model.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'stars', name: 'StarWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/stars.wasm', import.meta.url).href };

const MAX_MODES = 340;

// The C++ engine's messages (stars-engine.h, msg) back into the JavaScript engine's: 'amps' (the
// focus star's observed mode amplitudes, which come in parts of 30, then the summary) and 'error'.
function views(m, e) {
  switch (m.type) {
    case 1: (e.ampParts ??= new Float32Array(MAX_MODES)).set(m.values, m.key); return null;
    case 2: {
      const [N, drive, held, gen] = m.values;
      return { type: 'amps', key: m.key, id: `${e.ids?.get(gen) ?? ''}|${m.key}`, amp: e.ampParts.slice(0, N), drive, held: held > 0 };
    }
    case 3: return { type: 'error', message: `star ${m.key}: numerical failure` };
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// A star as the engine takes it (stars-engine.h, offer): key, K, δ Scuti?, N, then its modes.
const ARRAYS = ['f', 'l', 'm', 'zeta', 'p', 'gamma', 'wEnv', 'wCore', 'asat', 'mult'];
function pack(d, out) {
  const N = d.N;
  out[0] = d.key; out[1] = d.K; out[2] = d.family === 'dscuti' ? 1 : 0; out[3] = N;
  ARRAYS.forEach((k, j) => { const a = d.modes[k]; for (let i = 0; i < N; i++) out[4 + j * N + i] = a[i]; });
  return 4 + ARRAYS.length * N;
}

// Engines the tests make and drop give their memory back.
const dropped = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry((h) => Base.exports?.forte_destroy(h)) : null;

// The engine, with the JavaScript engine's test hooks: e.voices (each star's key, fading, held,
// level) and e.byKey, read back. A note may bring its star (the page's noteData, or a test's
// made-up one): played, as the JavaScript plays it, if it is the star the knobs make on that key.
const VOICE = ['key', 'fading', 'dead', 'held', 'own', 'age', 'level', 'peak', 'vel', 'pressure', 'N', 'nAct'];
const FLAGS = new Set(['fading', 'dead', 'held', 'own']);
export class StarWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
    dropped?.register(this, this.h, this);
  }
  destroy() { dropped?.unregister(this); super.destroy(); }
  // the stars' ids by generation (stars-engine.h: the engine counts the changes of kind, mass and
  // speed-up, and posts the focus star's), so that its messages name its star as the JavaScript's do
  setParams(P) {
    const id = starId(P);
    if (!this.ids) { this.ids = new Map([[0, id]]); this.gen = 0; }
    else if (id !== this.ids.get(this.gen)) {
      this.ids.delete((this.gen + 0x1000000 - 64) % 0x1000000); // (a star sounds for seconds, not 64 changes)
      this.gen = (this.gen + 1) % 0x1000000;
      this.ids.set(this.gen, id);
    }
    this.params = P;
    super.setParams(P);
  }
  get P() { return this.params ?? null; }
  noteOn(key, velocity, data) {
    if (data && data.modes && data.N > 0 && data.N <= MAX_MODES && this.params && data.id === `${starId(this.params)}|${key}`) {
      const x = Base.exports, s = scratch(x), n = pack(data, s.f64(4 + ARRAYS.length * data.N));
      x.stars_offer(this.e, s.at, n);
    }
    super.noteOn(key, velocity);
  }
  get voices() {
    const x = Base.exports, s = scratch(x), out = s.f64(VOICE.length);
    return Array.from({ length: x.stars_voices(this.e) }, (_, i) => {
      x.stars_voice(this.e, i, s.at);
      return Object.fromEntries(VOICE.map((k, j) => [k, FLAGS.has(k) ? out[j] > 0 : out[j]]));
    });
  }
  get byKey() { return new Map(this.voices.filter((v) => v.own).map((v) => [v.key, v])); }
}
export const ready = () => StarWasmEngine.ready();

// The model's functions the views call (stars-model.js's keyStar, starAt, zams, legendre, Elm),
// computed by the WebAssembly. keyStar's star has the JavaScript's fields, so the page sends it with
// the note to either engine.
const STAGES = ['dwarf', 'subgiant', 'giant', 'dscuti'];
const SZ = ['dnu', 'numax', 'eps', 'd02', 'alpha', 'fwhm', 'gamma', 'dPi', 'q'];
const TYPES = { l: Int8Array, m: Int8Array, mult: Int32Array };
const starOf = (a) => ({ M: a[0], R: a[1], T: a[2], L: a[3], s: a[4], stage: STAGES[a[5]], track: a[6] });
export async function wasmModel() {
  const x = await ready(), s = scratch(x), max = Math.floor(s.size / 8);
  return {
    keyStar(key, P) {
      const fam = P.family === 'dscuti' ? 1 : 0, n = x.stars_key_star(fam, P.mass, P.speedup, key, s.at, max);
      if (n < 0) throw new Error(`stars: key ${key}'s star does not fit the scratch area`);
      const a = s.f64(n).slice(), N = a[3], nAll = a[4];
      let i = 8;
      const star = starOf(a.subarray(i, i + 7)); i += 7;
      const sz = {}; SZ.forEach((k) => { sz[k] = a[i++]; });
      const modes = {};
      for (const k of ARRAYS) { modes[k] = (TYPES[k] ?? Float64Array).from(a.subarray(i, i + N)); i += N; }
      const all = [], multiplets = [];
      for (let j = 0; j < nAll; j++, i += 7) {
        const m = { l: a[i], n: a[i + 1], nu: a[i + 2], zeta: a[i + 3], power: a[i + 4], gamma: a[i + 5] };
        all.push(m);
        if (a[i + 6]) multiplets.push(m);
      }
      return {
        id: `${starId(P)}|${key}`, key, K: a[1], family: fam ? 'dscuti' : 'track', star, sz, multiplets, all, N, norm: a[5], modes, pitch: a[6], target: a[7],
      };
    },
    starAt(sIn, M) { x.stars_star_at(sIn, M, s.at); return starOf(s.f64(7)); },
    zams(M) { x.stars_zams(M, s.at); const a = s.f64(4); return { M: a[0], R: a[1], T: a[2], L: a[3] }; },
    legendre: (l, m, xx) => x.stars_legendre(l, m, xx),
    Elm: (l, m, incl) => x.stars_elm(l, m, incl),
  };
}

globalThis.StarWasmEngine = StarWasmEngine;
