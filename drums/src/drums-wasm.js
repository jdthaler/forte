// drums-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/drums): DrumWasmEngine, with the engine contract, and the model's functions
// for the views and the tests.

import { GROUPS } from './drums-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'drums', name: 'DrumWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/drums.wasm', import.meta.url).href };

// The C++ engine's message (drums-engine.h, msg::state) into the page's 'state': the focused drum's
// tension ratio, the beater's force, the heel's press and its modes' amplitudes.
function views(m) {
  if (m.type !== 1) return null;
  const n = m.values[2];
  return { type: 'state', key: m.key, tension: m.values[0], force: m.values[1], press: m.values[3], amps: Array.from(m.values.subarray(4, 4 + n)) };
}
const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the tests' hooks (e.voices: each sounding drum's state). A note may bring its
// drum, packed by the page's WebAssembly model (wasmModel().noteData), so the audio thread needn't
// build it.
const VOICE = ['key', 'modes', 'tension', 'force', 'Fmax', 'touched', 'energy', 'peak', 'hand', 'press', 'mallet'];
const FLAGS = new Set(['touched', 'hand', 'mallet']);
export class DrumWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  noteOn(key, velocity, data) {
    if (data instanceof Float64Array) {
      const x = Base.exports, s = scratch(x);
      if (data.length * 8 <= s.size) { s.f64(data.length).set(data); x.drums_offer(this.e, s.at, data.length); }
    }
    super.noteOn(key, velocity);
  }
  get voices() {
    const x = Base.exports, s = scratch(x), out = s.f64(VOICE.length);
    return Array.from({ length: x.drums_voices(this.e) }, (_, i) => {
      x.drums_voice(this.e, i, s.at);
      return Object.fromEntries(VOICE.map((k, j) => [k, FLAGS.has(k) ? out[j] > 0 : out[j]]));
    });
  }
}
export const ready = () => DrumWasmEngine.ready();

const NB = 8, NRS = 65;
// A packed drum (drums-engine.cpp packDrum) as an object: the parameters it was built for are skipped.
function unpack(d) {
  let at = 2 + d[1];
  const k = {};
  for (const f of ['key', 'drum', 'count', 'principal', 'a', 'depth', 'T', 'sigma', 'Eh', 'eta', 'rho', 'f0', 'kettle']) k[f] = d[at++];
  k.modes = [];
  for (let i = 0; i < k.count; i++) {
    const m = {};
    for (const f of ['m', 'n', 'f', 'sigma', 'sigmaAir', 'grad', 'far']) m[f] = d[at++];
    m.c = Array.from(d.subarray(at, at + NB)); at += NB;
    m.radial = Float64Array.from(d.subarray(at, at + NRS)); at += NRS;
    k.modes.push(m);
  }
  return k;
}

// The model, computed by the WebAssembly (drums-model.cpp): keyDrum(key, P), a key's drum
// ({ key, drum, a (m), T (N/m), f0, modes: [{ m, n, f, sigma, sigmaAir, far, radial }] }), drumAt
// (drum, a, T, P), the same untuned; noteData(key, P), the drum packed for the engine (cached per
// key and parameters); besselZero(m, i), bareRatio(m, n), patchDensity(drum, load, rho), and
// shape(mode, rho) from a mode's table.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const setP = (P) => s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id])));
  const out = () => s.at + 8 * params.length;
  const packed = (n) => Float64Array.from(new Float64Array(x.memory.buffer, out(), n));
  const cache = new Map();
  const shapers = params.filter((p, i) => x.drums_shapes(i)); // the parameters a drum is built from
  const shaping = (P) => JSON.stringify(shapers.map((p) => P[p.id]));
  function noteData(key, P) {
    const id = `${key} ${shaping(P)}`;
    let d = cache.get(id);
    if (!d) {
      setP(P);
      d = packed(x.drums_key_drum(key, s.at, out()));
      if (cache.size > 300) cache.clear();
      cache.set(id, d);
    }
    return d;
  }
  return {
    noteData,
    keyDrum: (key, P) => unpack(noteData(key, P)),
    drumAt(drum, a, T, P) { setP(P); return unpack(packed(x.drums_drum_at(drum, a, T, s.at, out()))); },
    composite(ratio, K, a, T, P) { setP(P); return unpack(packed(x.drums_composite(ratio, K, a, T, s.at, out()))); },
    besselZero: (m, i) => x.drums_bessel_zero(m, i),
    bareRatio: (m, n) => x.drums_bare_ratio(m, n),
    patchDensity: (drum, load, rho) => x.drums_patch_density(drum, load, rho),
    drumConstant: (drum, what) => x.drums_drum_constant(drum, what),
    shape(mode, rho) {
      const t = Math.min(Math.max(rho, 0), 1) * (NRS - 1), i = Math.min(Math.floor(t), NRS - 2), f = t - i;
      return mode.radial[i] + f * (mode.radial[i + 1] - mode.radial[i]);
    },
  };
}

globalThis.DrumWasmEngine = DrumWasmEngine;
