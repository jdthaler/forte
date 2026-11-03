// birdsong-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/birdsong): BirdsongWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './birdsong-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'birdsong', name: 'BirdsongWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/birdsong.wasm', import.meta.url).href };

// The C++ engine's message (birdsong-engine.h, msg) as the page's 'state': the newest voice's key,
// α, tension (−β), breath × gate, the frequency the labia sing, the note's, the onset α, the drive,
// the mouth's tuning, and the last period's (x, v) as a trail, newest first.
function state(m) {
  if (m.type !== 1) return null;
  const v = m.values, trail = [];
  for (let j = 8; j + 1 < v.length; j += 2) trail.push([v[j], v[j + 1]]);
  return { type: 'state', key: m.key, alpha: v[0], tension: v[1], e: v[2], fSung: v[3], fNote: v[4], onset: v[5], d: v[6], fo: v[7], trail };
}

const Base = wasmEngine(BUILD, { messages: state });

// The engine, with the tests' hook: e.voices, each sounding voice's state.
export class BirdsongWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get voices() {
    const x = Base.exports, s = scratch(x), out = [];
    for (let i = 0; i < x.birdsong_pool(); i++) {
      x.birdsong_voice(this.e, i, s.at);
      const a = s.f64(17);
      if (!a[0]) continue;
      out.push({ slot: i, held: a[1] > 0, key: a[2], env: a[3], e: a[4], alpha: a[5], beta: a[6], d: a[7], omega: a[8], gamma: a[9],
        fNote: a[10], fSung: a[11], fo: a[12], voicing: a[13], sub: a[14], x: a[15], v: a[16] });
    }
    return out;
  }
}
export const ready = () => BirdsongWasmEngine.ready();

// The model (birdsong-model.h), computed by the WebAssembly: onset(β), restX(α, β),
// fixedPoints(α, β), cycle(α, β) (the limit cycle: ok, omega, extents, harmonics' amplitudes c),
// cyclePoints(α, β, n), tracheaGain(f, L, r), oecGain(f, fo, Q) and rk4(x, v, α, β, h).
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  x.birdsong_constants(s.at);
  const [ALPHA_REST, C_AIR, H_MAX, HARMONICS, TRAIL] = s.f64(5);
  return {
    ALPHA_REST, C_AIR, H_MAX, HARMONICS, TRAIL,
    onset: (b) => x.birdsong_onset(b),
    restX: (a, b) => x.birdsong_rest_x(a, b),
    fixedPoints(a, b) { const n = x.birdsong_fixed_points(a, b, s.at); return Array.from(s.f64(n)); },
    cycle(a, b) {
      x.birdsong_cycle(a, b, s.at);
      const o = s.f64(6 + HARMONICS);
      return { ok: o[0] > 0, omega: o[1], xmin: o[2], xmax: o[3], vmin: o[4], vmax: o[5], c: Array.from(o.subarray(6)) };
    },
    cyclePoints(a, b, n) {
      const m = x.birdsong_cycle_points(a, b, s.at, n), o = s.f64(2 * m), pts = [];
      for (let i = 0; i < m; i++) pts.push([o[2 * i], o[2 * i + 1]]);
      return pts;
    },
    tracheaGain: (f, L, r) => x.birdsong_trachea_gain(f, L, r),
    oecGain: (f, fo, Q) => x.birdsong_oec_gain(f, fo, Q),
    rk4(xx, v, a, b, h) { x.birdsong_rk4(xx, v, a, b, h, s.at); const o = s.f64(2); return [o[0], o[1]]; },
  };
}

globalThis.BirdsongWasmEngine = BirdsongWasmEngine;
