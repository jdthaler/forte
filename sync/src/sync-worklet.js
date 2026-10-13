// sync-worklet.js — AudioWorklet wrapper (neon-engine.js is added first).

const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

class SyncProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new globalThis.NeonEngine(sampleRate);
    this.port.onmessage = (e) => this.handle(e.data);
    this.busy = 0; this.blocks = 0;
    this.spare = new Float32Array(128);
  }
  handle(m) {
    const e = this.engine;
    switch (m.type) {
      case 'noteOn': e.noteOn(m.key, { f: m.f }); break;
      case 'noteOff': e.noteOff(m.key); break;
      case 'retune': for (const [key, f] of m.list) e.retune(key, f); break;
      case 'params': e.setParams(m.params); break;
      case 'panic': e.allOff(); break;
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
    if (this.blocks % 4 === 0) {
      const e = this.engine;
      this.port.postMessage({
        type: 'state', t: e.t, fs: sampleRate, hold: e.hold,
        osc: e.report(0.25), fires: e.firings(e.t - 0.25 * sampleRate),
      });
    }
    if (this.blocks >= 96) {
      this.port.postMessage({ type: 'stats', load: this.busy / ((this.blocks * L.length * 1000) / sampleRate) });
      this.busy = 0; this.blocks = 0;
    }
    return true;
  }
}

registerProcessor('sync-processor', SyncProcessor);
