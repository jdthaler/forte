// quantum-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/quantum): QuantumWasmEngine, with the engine contract, and the model's
// functions for the page, its views and the tests.

import { GROUPS } from './quantum-params.js';
import { wasmEngine, scratch, nativeValue } from '../../shared/wasm.js';
import { waveGrid as gridOf } from './quantum-waves.js';
import { TUNING_PARAMS } from '../../shared/tuning.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'quantum', name: 'QuantumWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/quantum.wasm', import.meta.url).href };
const WELL_IDS = ['box', 'morse', 'hydrogen', 'bouncer', 'harmonic'];
const MAX_STATES = 64, MAX_W = (MAX_STATES * (MAX_STATES - 1)) / 2; // quantum-model.h, quantum-engine.h

const Base = wasmEngine(BUILD);

// A packet (the WebAssembly model's makePacket) packed for the engine
// (unpackPacket in quantum-engine.cpp): key, d, dc, sigma, pitch, scale, the number of states and of
// pairs, E, then i, j, k, f and w per pair.
function packPacket(pk) {
  const N = pk.E.length, NP = pk.pairs.length, a = new Float64Array(8 + N + 5 * NP);
  a.set([pk.key, pk.d, pk.dc || 0, pk.sigma, pk.pitch, pk.scale, N, NP]);
  a.set(pk.E, 8);
  pk.pairs.forEach((p, q) => a.set([p.i, p.j, p.k, p.f, p.w], 8 + N + 5 * q));
  return a;
}

// The engine, with the tests' hooks: e.voices, each voice's state read live from the engine (a test
// holding a voice sees it change), its weights and groups as views into the engine's memory, and
// its packet. A note may bring its packet (the page's noteData, from the page's WebAssembly model),
// so the audio thread needn't build it. Rendered into Float64Arrays (the tests'), it renders in
// double precision.
const VOICE = ['key', 'count', 'gl', 'gr', 'active', 'G', 'S', 's0', 's1', 'released', 'quench', 'stolen', 'dead', 'env', 'useIm', 'dc'];
const FLAGS = new Set(['released', 'quench', 'stolen', 'dead', 'useIm']);
const ARRAYS = [['w', Float64Array, MAX_W], ['gD', Float64Array, MAX_STATES], ['gR', Float64Array, MAX_STATES],
  ['gk', Int32Array, MAX_STATES], ['ga', Int32Array, MAX_STATES], ['gb', Int32Array, MAX_STATES], ['gw', Int32Array, MAX_STATES]];
function voiceView(x, p) {
  const v = {}, s = scratch(x), read = (j) => { x.quantum_voice_state(p, s.at); return s.f64(VOICE.length)[j]; };
  VOICE.forEach((k, j) => Object.defineProperty(v, k, { enumerable: true, get: FLAGS.has(k) ? () => read(j) > 0 : () => read(j) }));
  ARRAYS.forEach(([k, T, n], j) => Object.defineProperty(v, k, { enumerable: true, get: () => new T(x.memory.buffer, x.quantum_voice_array(p, j), n) }));
  Object.defineProperty(v, 'pan', { enumerable: true, get: () => [read(2), read(3)] });
  let pk = null;
  Object.defineProperty(v, 'pk', {
    enumerable: true,
    get: () => {
      if (pk) return pk;
      const n = x.quantum_voice_packet(p, s.at, s.size / 8), a = s.f64(n).slice(), N = a[6], NP = a[7];
      const pairs = Array.from({ length: NP }, (_, q) => { const b = 8 + N + 5 * q; return { i: a[b], j: a[b + 1], k: a[b + 2], f: a[b + 3], w: a[b + 4] }; });
      pk = { key: a[0], d: a[1], dc: a[2], sigma: a[3], pitch: a[4], scale: a[5], E: Array.from(a.subarray(8, 8 + N)), pairs };
      return pk;
    },
  });
  return v;
}
export class QuantumWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  noteOn(key, velocity, data) {
    if (data && data.pairs) {
      const x = Base.exports, s = scratch(x), a = packPacket(data);
      if (a.length * 8 <= s.size) { s.f64(a.length).set(a); x.quantum_offer(this.e, s.at, a.length); }
    }
    super.noteOn(key, velocity);
  }
  process(L, R, n) {
    if (!(L instanceof Float64Array)) { super.process(L, R, n); return; }
    const x = Base.exports;
    for (let at = 0; at < n; at += 128) {
      const m = Math.min(128, n - at);
      x.quantum_process64(this.e, m);
      L.set(new Float64Array(x.memory.buffer, x.quantum_left64(), m), at);
      R.set(new Float64Array(x.memory.buffer, x.quantum_right64(), m), at);
    }
  }
  get voices() {
    const x = Base.exports;
    return Array.from({ length: x.quantum_voices(this.e) }, (_, i) => voiceView(x, x.quantum_voice(this.e, i)));
  }
}
export const ready = () => QuantumWasmEngine.ready();

// The model's functions the page, its views and the tests call, computed by the WebAssembly
// (quantum-model.cpp): makePacket(key, P, { fMax, maxPairs, rel }), a key's packet (its states n,
// cₙ, Eₙ, its Bohr pairs, pitch and time scales); solveNbar(key, P, info); and waveGrid(pk, P,
// rows), quantum-waves.js's grid around the eigenfunctions computed here.
const PARAMS = GROUPS.flatMap((g) => g.params);
// (the tuning's last: a key's pitch is its equal-tempered one times the tuning's ratio)
const KNOBS = ['potential', 'eta', 'lock', 'bpm', 'beats', 'nbar', 'sigma', 'detector', ...TUNING_PARAMS.map((p) => p.id)].map((id) => PARAMS.find((p) => p.id === id));
export async function wasmModel() {
  const x = await ready(), s = scratch(x), at = 8 * KNOBS.length; // the knobs first, then the results
  const knobs = (P) => { s.f64(KNOBS.length).set(KNOBS.map((p) => nativeValue(p, P[p.id] ?? p.def))); return s.at; };
  const solve = (pk, P, rows) => {
    const N = pk.ns.length;
    s.f64(2 * N).set([...pk.ns, ...pk.E]);
    const p = x.quantum_wave_grid(WELL_IDS.indexOf(pk.id), pk.kap ?? NaN, pk.nbar, P.eta ?? 0.5, N, s.at, rows);
    const a = new Float64Array(x.memory.buffer, p, N * rows);
    return Array.from({ length: N }, (_, i) => a.slice(i * rows, (i + 1) * rows));
  };
  return {
    makePacket(key, P, { fMax = 20000, maxPairs = 300, rel = 1e-3 } = {}) {
      const n = x.quantum_make_packet(knobs(P), key, fMax, maxPairs, rel, s.at + at, (s.size - at) / 8), a = s.f64(n, at).slice();
      const N = a[15], NP = a[16], take = (i) => Array.from(a.subarray(17 + i * N, 17 + (i + 1) * N));
      const pairs = Array.from({ length: NP }, (_, q) => { const b = 17 + 3 * N + 5 * q; return { i: a[b], j: a[b + 1], k: a[b + 2], f: a[b + 3], w: a[b + 4] }; });
      return {
        key: a[0], id: WELL_IDS[a[1]], d: a[2], f0: a[3], pitch: a[4], nbar: a[5], sigma: a[6], ns: take(0), c: take(1), E: take(2), scale: a[7], pairs,
        offBeat: a[8] > 0, Tcl: a[9], Trev: a[10], Tsr: a[11], tColl: a[12], kap: Number.isNaN(a[13]) ? undefined : a[13], dc: a[14],
      };
    },
    solveNbar(key, P, info = {}) {
      const nb = x.quantum_solve_nbar(knobs(P), key, s.at + at);
      info.locked = s.f64(1, at)[0] > 0;
      return nb;
    },
    waveGrid: (pk, P, rows) => gridOf(pk, P, rows, solve),
  };
}

globalThis.QuantumWasmEngine = QuantumWasmEngine;
