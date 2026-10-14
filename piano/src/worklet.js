// worklet.js — AudioWorklet wrapper around PianoEngine (engine.js must be
// added to the worklet first; it registers itself on globalThis).

import { runGuarded } from '../../shared/guard.js';

const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

class PianoProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new globalThis.PianoEngine(sampleRate);
    this.engine.listeners.push((ev) => this.port.postMessage(ev));
    this.port.onmessage = (e) => this.handle(e.data);
    this.busy = 0;
    this.blocks = 0;
    this.spare = new Float32Array(128);
    this.data = new Map();
  }

  handle(m) {
    const e = this.engine;
    switch (m.type) {
      case 'noteOn': {
        // voice data is sent once per key per parameter version, then reused
        if (m.data) this.data.set(m.key, m.data);
        const d = this.data.get(m.key);
        if (d) e.noteOn(m.key, d, m.velocity);
        break;
      }
      case 'noteOff': e.noteOff(m.key); break;
      case 'sustain': e.setSustain(m.on); break;
      case 'params': e.setParams(m.params); break;
      case 'panic': e.allNotesOff(); break;
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const L = out[0];
    const R = out.length > 1 ? out[1] : this.spare;
    const t0 = now();
    runGuarded(this, L, R, L.length, () => this.engine.allNotesOff());
    this.busy += now() - t0;
    if (++this.blocks >= 96) {
      const budget = (this.blocks * L.length * 1000) / sampleRate;
      this.port.postMessage({
        type: 'stats',
        load: this.busy / budget,
        voices: this.engine.voices.length,
        modes: this.engine.modeCount(),
      });
      this.busy = 0;
      this.blocks = 0;
    }
    return true;
  }
}

registerProcessor('piano-processor', PianoProcessor);
