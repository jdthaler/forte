// worklet.js — the one AudioWorklet processor every Forte instrument can use (and, at the end,
// 'forte-limiter', the output chain's limiter).
// The page adds its engine's module first (<slug>/src/<slug>-wasm.js, which sets
// globalThis[XWasmEngine]), then this file, and creates
//   new AudioWorkletNode(ctx, 'forte-processor', { processorOptions: { wasm: { name: 'XWasmEngine', bytes } }, … })
// with the bytes of the instrument's WebAssembly build (shared/wasm.js), which it compiles here.
//
// Engine contract (the same class runs in Node for tests and renders):
//   new Engine(sampleRate)
//   process(L, R, n)              fill n samples (R may be a scratch buffer for mono pages)
//   noteOn(key, velocity, data)   velocity 0..1; data = whatever the page attached
//   noteOff(key, velocity)       velocity: a MIDI note-off's release velocity 0..1, or undefined
//   setParams(P)                  the full parameter object ({ type: 'params', P, swap: true }: a
//                                 preset, which changes the sound at once: the output fades out,
//                                 the engine takes P, and it fades back in, so the change doesn't click)
//   setSustain?(on)   allNotesOff?()   handle?(msg)   (any other message type: { type: 'pressure',
//                                 value, key }, 'bend', and one note's own { type: 'noteBend', value
//                                 (a frequency ratio), key } and { type: 'slide', value, key }, MPE's)
//   setQuality?(level)            'high', 'medium' or 'low' (shared/quality.js)
//   voiceCount?()                 shown in the CPU pill
//   stats?()                      more fields for the page's stats message (e.g. { modes })
//   engine.post(msg)              set by this wrapper: send a message to the page

import { runGuarded } from './guard.js';
import { Limiter } from './limiter.js';

// a preset's change (swap): out in 6 ms, the new parameters, back in 12 ms (a raised cosine each way)
const SWAP_OUT = 0.006, SWAP_IN = 0.012;
const fine = !!globalThis.performance?.now; // some browsers' audio threads only have Date.now (1 ms ticks)
const now = () => (fine ? globalThis.performance.now() : Date.now());

class ForteProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions || {};
    const W = globalThis[o.wasm?.name];
    if (!W) throw new Error(`engine ${o.wasm?.name} not loaded`);
    W.load(o.wasm.bytes);
    this.engine = new W(sampleRate);
    this.engine.post = (m) => this.port.postMessage(m);
    this.port.onmessage = (e) => this.handle(e.data);
    this.busy = 0;
    this.worst = 0;
    this.blocks = 0;
    this.spare = new Float32Array(128);
    this.swap = null; // a preset's change under way: { P (to take at the bottom), at (0..1 of the fade), out }
  }

  // a preset: fade out, take its parameters, fade in (a later preset during the fade replaces it)
  swapTo(P) {
    if (this.swap?.out) this.swap.P = P;
    else this.swap = { P, out: true, at: this.swap ? 1 - this.swap.at : 0 }; // fading in: turn back from where it is
  }
  fade(L, R, n) {
    const w = this.swap, step = 1 / ((w.out ? SWAP_OUT : SWAP_IN) * sampleRate);
    for (let i = 0; i < n; i++) {
      const g = w.at >= 1 ? (w.out ? 0 : 1) : 0.5 - 0.5 * Math.cos(Math.PI * (w.out ? 1 - w.at : w.at));
      L[i] *= g; R[i] *= g;
      w.at = Math.min(1, w.at + step);
    }
    if (w.at < 1) return;
    if (w.out) { this.engine.setParams(w.P); this.swap = { out: false, at: 0 }; } // at the bottom: the new sound, then up
    else this.swap = null;
  }

  handle(m) {
    const e = this.engine;
    try {
      switch (m.type) {
        case 'noteOn': e.noteOn(m.key, m.velocity, m.data); break;
        case 'noteOff': e.noteOff(m.key, m.velocity); break;
        case 'params': if (m.swap) this.swapTo(m.P); else if (this.swap?.out) this.swap.P = m.P; else e.setParams(m.P); break;
        case 'sustain': e.setSustain?.(m.on); break;
        case 'panic': e.allNotesOff?.(); break;
        case 'quality': e.setQuality?.(m.level); break;
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
    if (this.swap) this.fade(L, R, n);
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

// The output chain's limiter (shared/limiter.js; shared/chain.js makes the node): stereo in,
// stereo out, processorOptions = the chain's limiter settings.
class LimiterProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.limiter = new Limiter(options.processorOptions || {}, sampleRate);
  }

  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    if (!out?.length) return true;
    const L = out[0], R = out[1] ?? this.spare ?? (this.spare = new Float32Array(L.length));
    if (!inp?.length) { L.fill(0); R.fill(0); } // nothing playing into it: silence
    else { L.set(inp[0]); R.set(inp[1] ?? inp[0]); }
    this.limiter.process(L, R, L.length);
    return true;
  }
}

registerProcessor('forte-limiter', LimiterProcessor);
