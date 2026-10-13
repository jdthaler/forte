// ringdown-worklet.js — AudioWorklet wrapper (ringdown-engine.js is added first).

class RingdownProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new globalThis.RingdownEngine(sampleRate);
    this.port.onmessage = (e) => {
      const m = e.data, en = this.engine;
      if (m.type === 'noteOn') en.noteOn(m.data, m.vel);
      else if (m.type === 'noteOff') en.noteOff(m.key);
      else if (m.type === 'params') en.setParams(m.params);
      else if (m.type === 'panic') en.allOff();
    };
    this.blocks = 0;
    this.spare = new Float32Array(128);
  }
  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const L = out[0], R = out.length > 1 ? out[1] : this.spare;
    this.engine.process(L, R, L.length);
    if (++this.blocks >= 48) { this.port.postMessage({ type: 'stats', voices: this.engine.voices.length }); this.blocks = 0; }
    return true;
  }
}

registerProcessor('ringdown-processor', RingdownProcessor);
