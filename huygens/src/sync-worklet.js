// sync-worklet.js — AudioWorklet wrapper (neon-engine.js is added first).

import { runGuarded } from '../../shared/guard.js';

const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

class SyncProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new globalThis.NeonEngine(sampleRate);
    this.port.onmessage = (e) => this.handle(e.data);
    this.busy = 0; this.blocks = 0; this.sinceState = 0;
    this.spare = new Float32Array(128);
    // state for the page, at most 30 times a second: only the new firings
    this.stateEvery = Math.ceil(sampleRate / 128 / 30);
    this.fireBuf = new Float64Array(32 * 258);
    this.oscBuf = new Float64Array(32 * 3);
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
    runGuarded(this, L, R, L.length, () => this.engine.allOff());
    this.busy += now() - t0;
    this.blocks++;
    if (++this.sinceState >= this.stateEvery) {
      this.sinceState = 0;
      const e = this.engine;
      const nf = e.drainFirings(this.fireBuf), no = e.summary(this.oscBuf);
      this.port.postMessage({ type: 'state', t: e.t, fs: sampleRate, hold: e.hold, osc: this.oscBuf.slice(0, no), fires: this.fireBuf.slice(0, nf) });
    }
    if (this.blocks >= 96) {
      this.port.postMessage({ type: 'stats', load: this.busy / ((this.blocks * L.length * 1000) / sampleRate) });
      this.busy = 0; this.blocks = 0;
    }
    return true;
  }
}

registerProcessor('sync-processor', SyncProcessor);
