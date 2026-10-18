// glass-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/glass): ArmonicaWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './glass-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'glass', name: 'ArmonicaWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/glass.wasm', import.meta.url).href };

const N_MAX = 6, MODES = N_MAX - 1;
export const TRACE = 1024;                                    // samples of contact history for the view (glass-engine.h)
export const MIC = [35, 55].map((d) => (d * Math.PI) / 180); // microphone azimuths, from the finger (glass-engine.cpp)

// The C++ engine's messages (glass-engine.h, msg) into the views' 'state': the focused bowl's
// modes and its contact trace come first, the state last.
function views(m, e) {
  const s = (e.views ??= { type: 'state', key: -1, theta: 0, rot: 0, N: 0, V: 0, touch: false, nm: 0,
    q: new Float64Array(4 * N_MAX), trS: new Float32Array(TRACE), trF: new Float32Array(TRACE) });
  const v = m.values;
  switch (m.type) {
    case 2: s.q.set(v); return null; // qc, qs, qc1, qs1 for each family
    case 3: s.trS.set(v.subarray(1), v[0]); return null;
    case 4: s.trF.set(v.subarray(1), v[0]); return null;
    case 1: // key; theta, rot, N, V, touch, nm
      Object.assign(s, { key: m.key, theta: v[0], rot: v[1], N: v[2], V: v[3], touch: v[4] > 0, nm: v[5] });
      return s;
    default: return null;
  }
}

const Base = wasmEngine(BUILD, { messages: views });

// a bowl from its flat form (glass-web.cpp, putBowl): { key, a, h, f0, modes, mass }
const MODE = ['n', 'f', 'fEmpty', 'load', 'f1', 'f2', 'sigma', 'M', 'bryan', 'rad', 'psi'];
function bowlOf(key, a) {
  const modes = [];
  for (let i = 0; i < a[4]; i++) { const m = {}; MODE.forEach((k, j) => { m[k] = a[5 + MODE.length * i + j]; }); modes.push(m); }
  return { key, a: a[0], h: a[1], f0: a[2], modes, mass: a[3] };
}
const BOWL_SIZE = 5 + MODE.length * MODES;

// The engine, with the tests' hooks: e.voices (each voice's normal force,
// regulation, modal state and bowl; Nn and the modal state can be written) and the focused
// bowl's contact trace (e.trS, e.trF, e.tw).
export class ArmonicaWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get voices() {
    const x = Base.exports, e = this.e;
    return Array.from({ length: x.glass_voice_count(e) }, (_, i) => {
      const s = scratch(x), st = s.f64(5);
      x.glass_voice_state(e, i, s.at);
      const N = st[4], q = (which) => new Float64Array(x.memory.buffer, x.glass_voice_q(e, i, which), N);
      return {
        key: st[0], Nreg: st[1], touch: st[3] > 0, N,
        get Nn() { x.glass_voice_state(e, i, s.at); return s.f64(5)[2]; },
        set Nn(v) { x.glass_voice_set_nn(e, i, v); },
        qc: q(0), qc1: q(1), qs: q(2), qs1: q(3),
        get b() { x.glass_voice_bowl(e, i, s.at); return bowlOf(st[0], s.f64(BOWL_SIZE)); },
      };
    });
  }
  get trS() { const x = Base.exports; return new Float32Array(x.memory.buffer, x.glass_trace(this.e, 0), TRACE); }
  get trF() { const x = Base.exports; return new Float32Array(x.memory.buffer, x.glass_trace(this.e, 1), TRACE); }
  get tw() { return Base.exports.glass_trace_pos(this.e); }
}
export const ready = () => ArmonicaWasmEngine.ready();

// The model's functions (glass-model.h: bowl, freeLines, ringRatio, speakingThreshold, regulation,
// rimSpeed, transport), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  return {
    bowl(key, P) { x.glass_bowl(key, P.split, P.loss, P.water, s.at); return bowlOf(key, s.f64(BOWL_SIZE)); },
    freeLines(m, rot) {
      x.glass_free_lines(m.n, m.bryan, m.f1, m.f2, rot, s.at);
      const a = s.f64(8);
      return [0, 1, 2, 3].map((i) => ({ f: a[2 * i], w: a[2 * i + 1] }));
    },
    ringRatio: (n) => x.glass_ring_ratio(n),
    speakingThreshold: (key, P) => x.glass_speaking_threshold(key, P.wet, P.v0, P.rough ?? 0, P.speed, P.split, P.loss, P.water),
    regulation: (key) => x.glass_regulation(key),
    rimSpeed: (key, speed) => x.glass_rim_speed(key, speed),
    transport: (m, rot) => x.glass_transport(m.n, m.bryan, rot),
  };
}

globalThis.ArmonicaWasmEngine = ArmonicaWasmEngine;
