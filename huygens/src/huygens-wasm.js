// huygens-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/huygens): HuygensWasmEngine, with the engine contract, and the model's
// functions for the page, its views and the tests.

import { GROUPS } from './sync-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';
import { tuningRatio } from '../../shared/tuning.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'huygens', name: 'HuygensWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/huygens.wasm', import.meta.url).href };

// The C++ engine's one message (huygens-engine.h, msg::state) says the page's state is due: the
// firings, which need double precision, are read back from the engine into the page's 'state'
// message ({ t, fs, hold, osc, fires }).
function messages(m, e) {
  if (m.type !== 1) return null;
  const x = Base.exports, s = scratch(x);
  x.huygens_state(e.e, s.at);
  const [nf, no, t, hold] = s.f64(4);
  return {
    type: 'state', t, fs: e.fs, hold,
    osc: new Float64Array(x.memory.buffer, x.huygens_osc_buf(e.e), no).slice(),
    fires: new Float64Array(x.memory.buffer, x.huygens_fire_buf(e.e), nf).slice(),
  };
}

const Base = wasmEngine(BUILD, { messages });

// An oscillator of the C++ engine, read back: what the tests read (fires is a view into the
// engine's memory, valid until it next runs).
const OSC = ['key', 'nf', 'fTarget', 'panL', 'panR', 'keyDown', 'dead', 'gate', 'power', 'driftCents', 'V', 'sent'];
const FLAGS = new Set(['keyDown', 'dead']);
class WasmOsc {
  constructor(ptr) { this.ptr = ptr; }
  get state() {
    const x = Base.exports, s = scratch(x);
    x.huygens_osc(this.ptr, s.at);
    const a = s.f64(OSC.length);
    return Object.fromEntries(OSC.map((k, i) => [k, FLAGS.has(k) ? a[i] > 0 : a[i]]));
  }
  get fires() { const x = Base.exports; return new Float64Array(x.memory.buffer, x.huygens_osc_fires(this.ptr), 256); }
}
for (const k of OSC) Object.defineProperty(WasmOsc.prototype, k, { get() { return this.state[k]; } });

// The engine, with the page's and the tests' hooks: a note's data ({ f, phase, settled }, which the
// C++ otherwise computes from the parameters), noteOn returning the oscillator it plays,
// 'retune', osc, t, hold, report(), drainFirings() and summary(). The page's state is drained
// only while a page listens (post set).
export class HuygensWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
    this.listener = null;
  }
  get post() { return this.listener; }
  set post(f) { this.listener = f; Base.exports.huygens_listen(this.e, f ? 1 : 0); }
  noteOn(key, velocity, data) {
    const x = Base.exports;
    if (data) x.huygens_offer(this.e, data.f ?? NaN, data.phase ?? NaN, data.settled ? 1 : 0);
    super.noteOn(key, velocity);
    const o = x.huygens_last(this.e);
    return o ? new WasmOsc(o) : undefined;
  }
  handle(m) {
    if (m.type === 'retune') for (const [key, f] of m.list) Base.exports.huygens_retune(this.e, key, f);
    else super.handle(m);
  }
  get t() { return Base.exports.huygens_time(this.e); }
  get hold() { return Base.exports.huygens_hold(this.e); }
  get osc() {
    const x = Base.exports;
    return Array.from({ length: x.huygens_osc_count(this.e) }, (_, i) => new WasmOsc(x.huygens_osc_at(this.e, i)));
  }
  report(win = 0.3) {
    const x = Base.exports, s = scratch(x), n = x.huygens_report(this.e, win, s.at, s.size / 32), a = s.f64(4 * n);
    return Array.from({ length: n }, (_, i) => ({ key: a[4 * i], f: a[4 * i + 1], fTarget: a[4 * i + 2], drift: a[4 * i + 3] }));
  }
  drainFirings(buf) {
    const x = Base.exports, n = x.huygens_drain(this.e, buf.length);
    buf.set(new Float64Array(x.memory.buffer, x.huygens_fire_buf(this.e), n));
    return n;
  }
  summary(buf) {
    const x = Base.exports, n = x.huygens_summary(this.e, buf.length);
    buf.set(new Float64Array(x.memory.buffer, x.huygens_osc_buf(this.e), n));
    return n;
  }
}
export const ready = () => HuygensWasmEngine.ready();

// The model's functions (huygens-model.cpp's tunedFreq, deltaOf and lockRatio), computed by the
// WebAssembly (tunedFreq in the keyboard's tuning too, as the engine composes it), and its engine for the lock map's simulated points.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  return {
    Engine: HuygensWasmEngine,
    tunedFreq: (m, P) => x.huygens_tuned_freq(m, P.tuning === 'just' ? 1 : 0, +P.tonic || 0, P.mistune) * tuningRatio(P, m),
    deltaOf: (kick, vNom, vStrike, vExt) => x.huygens_delta(kick, vNom, vStrike, vExt),
    lockRatio(r, delta, maxFirings = 100000) {
      if (!x.huygens_lock_ratio(r, delta, maxFirings, s.at)) return null;
      const a = s.f64(2);
      return { p: a[0], q: a[1] };
    },
  };
}

globalThis.HuygensWasmEngine = HuygensWasmEngine;
