// worklet.js — the one AudioWorklet processor every Forte instrument can use.
// The page adds its engine module first (which sets globalThis[EngineName]),
// then this file, and creates
//   new AudioWorkletNode(ctx, 'forte-processor', { processorOptions: { engine: 'EngineName' }, … })
// With processorOptions.wasm = { name, bytes } (and that module added too), it runs the
// instrument's WebAssembly build (shared/wasm.js) instead, and falls back to the JavaScript
// engine if it fails; it tells the page which with { type: 'engine', kind: 'wasm' | 'js', reason? }.
//
// Engine contract (the same class runs in Node for tests and renders):
//   new Engine(sampleRate)
//   process(L, R, n)              fill n samples (R may be a scratch buffer for mono pages)
//   noteOn(key, velocity, data)   velocity 0..1; data = whatever the page attached
//   noteOff(key, velocity)       velocity: a MIDI note-off's release velocity 0..1, or undefined
//   setParams(P)                  full parameter object, or the page's engineParams(P) (a
//                                 WebAssembly engine, with static fullParams, gets the whole P)
//   setSustain?(on)   allNotesOff?()   handle?(msg)   (any other message type)
//   voiceCount?()                 shown in the CPU pill
//   stats?()                      more fields for the page's stats message (e.g. { modes })
//   engine.post(msg)              set by this wrapper: send a message to the page

import { runGuarded } from './guard.js';

const fine = !!globalThis.performance?.now; // some browsers' audio threads only have Date.now (1 ms ticks)
const now = () => (fine ? globalThis.performance.now() : Date.now());

class ForteProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions || {};
    let kind = 'js', reason;
    if (o.wasm) {
      try { const W = globalThis[o.wasm.name]; W.load(o.wasm.bytes); this.engine = new W(sampleRate); kind = 'wasm'; }
      catch (err) { reason = err.message; }
    }
    if (!this.engine) {
      const Engine = globalThis[o.engine];
      if (!Engine) throw new Error(`engine ${o.engine} not loaded`);
      this.engine = new Engine(sampleRate);
    }
    this.port.postMessage({ type: 'engine', kind, reason });
    this.engine.post = (m) => this.port.postMessage(m);
    this.port.onmessage = (e) => this.handle(e.data);
    this.busy = 0;
    this.worst = 0;
    this.blocks = 0;
    this.spare = new Float32Array(128);
  }

  handle(m) {
    const e = this.engine;
    try {
      switch (m.type) {
        case 'noteOn': e.noteOn(m.key, m.velocity, m.data); break;
        case 'noteOff': e.noteOff(m.key, m.velocity); break;
        case 'params': e.setParams(e.constructor.fullParams && m.P ? m.P : m.params); break;
        case 'sustain': e.setSustain?.(m.on); break;
        case 'panic': e.allNotesOff?.(); break;
        default: e.handle?.(m);
      }
    } catch (err) {
      this.port.postMessage({ type: 'error', message: err.message, key: m.key });
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const L = out[0], R = out.length > 1 ? out[1] : this.spare, n = L.length;
    const t0 = now();
    runGuarded(this, L, R, n, () => this.engine.allNotesOff?.());
    const dt = now() - t0;
    this.busy += dt;
    if (dt > this.worst) this.worst = dt;
    if (++this.blocks >= 96) {
      const block = (n * 1000) / sampleRate;
      // the worst block needs a sub-millisecond clock; with 1 ms ticks only the average is meaningful
      this.port.postMessage({ type: 'stats', load: this.busy / (this.blocks * block), peak: fine ? this.worst / block : undefined, voices: this.engine.voiceCount?.(), ...this.engine.stats?.() });
      this.busy = 0;
      this.worst = 0;
      this.blocks = 0;
    }
    return true;
  }
}

registerProcessor('forte-processor', ForteProcessor);
