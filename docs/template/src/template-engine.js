// template-engine.js — the real-time part. Runs in the AudioWorklet (through
// shared/worklet.js) and in Node (tests, renders). See shared/worklet.js for
// the engine contract.

import { TAU, modeCoeffs, keyPan } from '../../../shared/dsp.js';
import { keyModes } from './template-model.js';

const OUT = 0.15;

class Voice {
  constructor(key, P, fs) {
    this.key = key; this.fs = fs;
    this.modes = keyModes(key, P).map((m) => ({ ...modeCoeffs(m.f, m.sigma, fs), amp: m.amp, w: TAU * m.f, y1: 0, y2: 0 }));
    this.pan = keyPan(key);
    this.level = 1;
  }
  // A strike is an impulse of force: one sample of size 1/k on every mode
  // (the mallet's pulse shape is already in amp). The bar is linear, so a
  // restrike simply adds to whatever is still ringing.
  strike(velocity) {
    for (const m of this.modes) { m.y1 = this.level * m.y1 + m.b * m.amp * velocity * this.fs; m.y2 *= this.level; }
    this.level = 1; this.released = false; this.damped = false;
  }
  run() { // output ∝ surface velocity = ω × displacement
    let s = 0;
    for (const m of this.modes) {
      const y = m.a1 * m.y1 - m.a2 * m.y2;
      m.y2 = m.y1; m.y1 = y; s += m.w * y;
    }
    return s;
  }
}

export class TemplateEngine {
  constructor(fs) {
    this.fs = fs;
    this.P = null;
    this.voices = [];
    this.sustain = false;
  }
  setParams(P) { this.P = P; }
  setSustain(on) { this.sustain = on; if (!on) for (const v of this.voices) if (v.released) v.damped = true; }
  noteOn(key, velocity) {
    if (!this.P) return;
    let v = this.voices.find((x) => x.key === key);
    if (!v) { v = new Voice(key, this.P, this.fs); this.voices.push(v); }
    v.strike(velocity);
    if (this.voices.length > 48) this.voices.shift();
  }
  noteOff(key) {
    for (const v of this.voices) if (v.key === key && !v.released) { v.released = true; if (!this.sustain) v.damped = true; }
  }
  allNotesOff() { this.voices = []; }
  voiceCount() { return this.voices.length; }
  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    const damp = Math.exp(-1 / (this.fs * 0.08));
    for (const v of this.voices) {
      const [gl, gr] = v.pan;
      for (let i = 0; i < n; i++) {
        if (v.damped) v.level *= damp;
        const s = OUT * v.level * v.run();
        L[i] += gl * s; R[i] += gr * s;
      }
    }
    this.voices = this.voices.filter((v) => v.level > 1e-4);
  }
}

globalThis.TemplateEngine = TemplateEngine;
