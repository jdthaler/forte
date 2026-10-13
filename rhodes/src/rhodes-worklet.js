// rhodes-worklet.js — AudioWorklet wrapper (rhodes-engine.js is added first).

const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

class RhodesProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new globalThis.RhodesEngine(sampleRate);
    this.engine.listeners.push((ev) => this.port.postMessage(ev));
    this.port.onmessage = (e) => this.handle(e.data);
    this.data = new Map();
    this.busy = 0;
    this.blocks = 0;
    this.spare = new Float32Array(128);
  }

  handle(m) {
    const e = this.engine;
    switch (m.type) {
      case 'noteOn': {
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
    const L = out[0], R = out.length > 1 ? out[1] : this.spare;
    const t0 = now();
    this.engine.process(L, R, L.length);
    this.busy += now() - t0;
    if (++this.blocks >= 96) {
      const budget = (this.blocks * L.length * 1000) / sampleRate;
      this.port.postMessage({ type: 'stats', load: this.busy / budget, voices: this.engine.voices.length });
      this.busy = 0;
      this.blocks = 0;
    }
    return true;
  }
}

registerProcessor('rhodes-processor', RhodesProcessor);
