// dsp.js — small building blocks shared by the engines. Importable from an
// AudioWorklet module and from Node.

export const TAU = 2 * Math.PI;
export const keyFreq = (m) => 440 * 2 ** ((m - 69) / 12);
export const sigmaFromT60 = (t60) => Math.log(1000) / t60;

// A damped mode  q'' + 2σ q' + ω² q = f(t), discretised impulse-invariantly:
//   q[n+1] = a1·q[n] − a2·q[n−1] + b·f[n]
// so a unit impulse of force gives exactly e^(−σt)·sin(ω_d t)/ω_d at the sample times.
export function modeCoeffs(f, sigma, fs) {
  const k = 1 / fs, wd = TAU * f, r = Math.exp(-sigma * k);
  return { a1: 2 * r * Math.cos(wd * k), a2: r * r, b: (k * r * Math.sin(wd * k)) / wd };
}

// RBJ biquad: 'lp' | 'hp' | 'bp' (0 dB peak) | 'peak' (gain dB) | 'notch'.
export class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; }
  set(type, f, Q, fs, gainDb = 0) {
    const w = (TAU * Math.min(f, 0.45 * fs)) / fs, c = Math.cos(w), al = Math.sin(w) / (2 * Q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'notch') { b0 = 1; b1 = -2 * c; b2 = 1; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else { const A = 10 ** (gainDb / 40); b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  run(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  reset() { this.z1 = this.z2 = 0; }
}

// One-pole low-pass, y += g (x − y), with g set from a cutoff in Hz.
export class OnePole {
  constructor(f = 1000, fs = 48000) { this.y = 0; this.set(f, fs); }
  set(f, fs) { this.g = 1 - Math.exp((-TAU * f) / fs); return this; }
  run(x) { this.y += this.g * (x - this.y); return this.y; }
}

// DC blocker, y[n] = x[n] − x[n−1] + R·y[n−1], corner ≈ f Hz.
export class DCBlock {
  constructor(f = 10, fs = 48000) { this.R = Math.exp((-TAU * f) / fs); this.x1 = 0; this.y1 = 0; }
  run(x) { const y = x - this.x1 + this.R * this.y1; this.x1 = x; this.y1 = y; return y; }
}

// Fractional delay line, Catmull–Rom cubic interpolation; read(d) needs d ≥ 1.
export class Delay {
  constructor(maxSamples) { this.n = 1 << Math.ceil(Math.log2(maxSamples + 4)); this.buf = new Float64Array(this.n); this.w = 0; }
  write(x) { this.buf[this.w] = x; this.w = (this.w + 1) & (this.n - 1); }
  read(d) {
    const m = this.n - 1, i = Math.floor(d), f = d - i, p = this.w - 1 - i;
    const x0 = this.buf[(p + 1) & m], x1 = this.buf[p & m], x2 = this.buf[(p - 1) & m], x3 = this.buf[(p - 2) & m];
    const c0 = x1, c1 = 0.5 * (x2 - x0), c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3, c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
    return ((c3 * f + c2) * f + c1) * f + c0;
  }
}

// Equal-power pan of a MIDI key across the keyboard (low left, high right).
export function keyPan(key, width = 0.6, lo = 36, hi = 96) {
  const p = Math.max(-1, Math.min(1, (2 * (key - lo)) / (hi - lo) - 1)) * width;
  const a = ((p + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}
