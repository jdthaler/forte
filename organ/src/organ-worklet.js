// organ-worklet.js — AudioWorklet wrapper (organ-engine.js is added first).

const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

class OrganProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new globalThis.OrganEngine(sampleRate);
    this.engine.listeners.push((ev) => this.port.postMessage(ev));
    this.port.onmessage = (e) => this.handle(e.data);
    this.busy = 0;
    this.blocks = 0;
    this.spare = new Float32Array(128);
  }

  handle(m) {
    const e = this.engine;
    switch (m.type) {
      case 'config': e.configure(m.gen); break;
      case 'params': e.setParams(m.params); break;
      case 'keyDown': e.keyDown(m.key, m.velocity); break;
      case 'keyUp': e.keyUp(m.key); break;
      case 'allOff': e.allOff(); break;
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const L = out[0], R = out.length > 1 ? out[1] : this.spare;
    const t0 = now();
    this.engine.process(L, R, L.length);
    this.busy += now() - t0;
    this.blocks++;
    if (this.blocks % 6 === 0) this.port.postMessage(this.engine.state());
    if (this.blocks >= 96) {
      const budget = (this.blocks * L.length * 1000) / sampleRate;
      this.port.postMessage({ type: 'stats', load: this.busy / budget, keys: this.engine.keys.size });
      this.busy = 0;
      this.blocks = 0;
    }
    return true;
  }
}

registerProcessor('organ-processor', OrganProcessor);
