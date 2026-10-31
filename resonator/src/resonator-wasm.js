// resonator-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/resonator): ResonatorWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './resonator-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'resonator', name: 'ResonatorWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/resonator.wasm', import.meta.url).href };

export const MAX_PARTIALS = 32;

// The C++ engine's messages (resonator-engine.h, msg) into the views' 'state': the focused key's
// partials first, the state last.
function views(m, e) {
  const s = (e.views ??= { type: 'state', key: -1, env: 0, current: 0, cents: 0, locked: false, heard: 0, swing: 0, driven: 0, keyDown: false, n: 0, h: 1, amp: [], phase: [] });
  const v = m.values;
  switch (m.type) {
    case 2: s.amp = Array.from(v.subarray(0, v.length / 2)); s.phase = Array.from(v.subarray(v.length / 2)); return null;
    case 1:
      if (m.key !== s.key) { s.amp = []; s.phase = []; }
      Object.assign(s, { key: m.key, env: v[0], current: v[1], cents: v[2], locked: v[3] > 0, heard: v[4], swing: v[5], driven: v[6], keyDown: v[7] > 0, n: v[8], h: v[9] });
      return { ...s };
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the tests' hooks: e.voices, each voice's key, its drive and its first loop.
export class ResonatorWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get voices() {
    const x = Base.exports, e = this.e, s = scratch(x);
    return Array.from({ length: x.resonator_voice_count(e) }, (_, i) => {
      x.resonator_voice_state(e, i, s.at);
      const a = s.f64(14);
      return { key: a[0], keyDown: a[1] > 0, driven: a[2] > 0, env: a[3], current: a[4], cents: a[5], heard: a[6], ua: a[7], hammer: a[8] > 0, loops: a[9], h: a[10], gain: a[11], peak: a[12], N: a[13] };
    });
  }
}
export const ready = () => ResonatorWasmEngine.ready();

const HEAD = ['key', 'nu', 'n', 'f1', 'L', 'T', 'mu', 'd', 'B', 'xa', 'xh', 'sigmaBridge', 'damper', 'G'];
const PER = ['f', 'sigma', 'psiA', 'psiH', 'beta', 'f2', 'f3'];

// The model (resonator-model.h), computed by the WebAssembly: strings(key, P), a key's strings and
// their partials for the parameters P (its note in P's tuning); coilPlace(key), the MRP's coil as a
// fraction of the length; gapScale(key), its gap over the treble's; voicing(key), its current over middle C's; coilWeight(n, x, w); unisons(key); driveHarmonics(wave, bright); the
// constants.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  x.resonator_constants(s.at);
  const [, COIL_W, GAP_REF, F_REF, BRIDGE_G, CHANNELS, DRIVE_HARMONICS, HAMMER_AT] = s.f64(8);
  const WAVES = GROUPS.flatMap((g) => g.params).find((p) => p.id === 'wave').options.map((o) => o[0]);
  return {
    MAX_PARTIALS, COIL_W, GAP_REF, F_REF, BRIDGE_G, CHANNELS, DRIVE_HARMONICS, HAMMER_AT,
    strings(key, P, fs = 48000, most = MAX_PARTIALS, fmax = 8000) {
      s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); // a choice as its index, as the engine gets it
      const out = s.at + 8 * params.length;
      x.resonator_strings(key, s.at, fs, most, fmax, out);
      const a = new Float64Array(x.memory.buffer, out, 14 + 8 * MAX_PARTIALS), r = {};
      HEAD.forEach((k, j) => { r[k] = a[j]; });
      r.damper = r.damper > 0;
      r.partials = Array.from({ length: r.n }, (_, i) => Object.fromEntries(PER.map((k, j) => [k, a[14 + 8 * i + j]])));
      r.partial = (h) => r.f1 * h * Math.sqrt((1 + r.B * h * h) / (1 + r.B));
      return r;
    },
    coilPlace: (key) => x.resonator_coil_place(key),
    gapScale: (key) => x.resonator_gap_scale(key),
    voicing: (key) => x.resonator_voicing(key),
    coilWeight: (n, xa, w) => x.resonator_coil_weight(n, xa, w),
    unisons: (key) => x.resonator_unisons(key),
    driveHarmonics(wave, bright) { x.resonator_drive_harmonics(WAVES.indexOf(wave), bright, s.at); return Array.from(s.f64(DRIVE_HARMONICS)); },
  };
}

globalThis.ResonatorWasmEngine = ResonatorWasmEngine;
