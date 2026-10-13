// ringdown-engine.js — plays black-hole ringdowns (and optional inspirals).
//
// Each mode is a decaying phasor ζ(t) = e^{−γt} e^{−2πift}; the two
// gravitational-wave polarisations are h₊ = Re(C₊ζ) and h× = −Im(C×ζ), summed
// over modes. Left = h₊, right = h× (or mono). With an inspiral, the note
// opens with the leading-order quadrupole chirp, f(t) = f₀(1 − t/τ_c)^(−3/8),
// rises through a short merger bridge, and hands over to the ringdown.

const TAU = 2 * Math.PI;

export const RINGDOWN_DEFAULTS = { stereo: 1, releaseMute: 0, master: 1, maxVoices: 48 };

class Voice {
  constructor(eng, d, vel) {
    this.key = d.key; this.vel = vel; this.keyDown = true;
    const k = eng.k, n = d.modes.length;
    const F = () => new Float64Array(n);
    this.n = n;
    this.zr = F(); this.zi = F(); this.rr = F(); this.ri = F();
    this.cpr = F(); this.cpi = F(); this.cxr = F(); this.cxi = F();
    d.modes.forEach((md, i) => {
      const r = Math.exp(-md.gamma * k), th = -TAU * md.f * k;
      this.rr[i] = r * Math.cos(th); this.ri[i] = r * Math.sin(th);
      this.cpr[i] = md.cpr; this.cpi[i] = md.cpi; this.cxr[i] = md.cxr; this.cxi[i] = md.cxi;
    });
    this.ring = false;
    this.fade = 1;
    // the strain rises through the merger peak rather than jumping: a raised-
    // cosine rise over half a (2,2,0) cycle removes the onset click
    this.rise = d.chirp ? 1 : 0;
    this.riseStep = 2 * d.info.f0 * k;
    this.dead = false;
    this.chirp = d.chirp ? { ...d.chirp, t: 0, phi: 0, f: d.chirp.fStart, stage: 1, A: 0 } : null;
    if (d.chirp) {
      const c = this.chirp;
      c.tc = (5 / 256) * c.Mc ** (-5 / 3) * (Math.PI * c.fStart) ** (-8 / 3);
    } else this.startRing();
  }

  startRing(phase = 0) {
    for (let i = 0; i < this.n; i++) { this.zr[i] = Math.cos(phase); this.zi[i] = -Math.sin(phase); }
    this.ring = true;
  }

  render(L, R, n, eng) {
    const k = eng.k, mono = !eng.p.stereo, g = eng.p.master * 0.35 * this.vel;
    const fadeStep = !this.keyDown && eng.p.releaseMute ? Math.exp(-k / 0.04) : 1;
    let peak = 0;
    for (let s = 0; s < n; s++) {
      let hp = 0, hx = 0;
      const c = this.chirp;
      if (c && c.stage < 3) {
        // inspiral: Newtonian chirp; then a short bridge to the ringdown pitch
        if (c.stage === 1) {
          c.f = c.fStart * Math.max(1e-9, 1 - c.t / c.tc) ** (-3 / 8);
          if (c.f >= c.fIsco || c.t >= c.tc) c.stage = 2;
        } else {
          c.f += (c.f220 - c.f) * (k * c.f220) / 1.5;
          if (c.f >= 0.97 * c.f220) { c.stage = 3; this.startRing(); this.rise = 0; c.xfade = 1; }
        }
        c.phi += TAU * c.f * k;
        // h ∝ f^(2/3); faded in over the first 30 ms (the inspiral was already under way)
        c.A = c.amp * Math.min(1.15, (c.f / c.fIsco) ** (2 / 3)) * (c.t < 0.03 ? 0.5 - 0.5 * Math.cos((Math.PI * c.t) / 0.03) : 1);
        hp = c.A * c.cp * Math.cos(c.phi);
        hx = c.A * c.cx * Math.sin(c.phi);
        c.t += k;
      } else if (c && c.xfade > 0) {
        // hand the chirp over to the ringdown across half a cycle
        c.phi += TAU * c.f220 * k;
        c.xfade = Math.max(0, c.xfade - this.riseStep);
        hp = c.xfade * c.A * c.cp * Math.cos(c.phi);
        hx = c.xfade * c.A * c.cx * Math.sin(c.phi);
      }
      if (this.ring) {
        const w = 1;
        const zr = this.zr, zi = this.zi, rr = this.rr, ri = this.ri;
        let rp = 0, rx = 0;
        for (let i = 0; i < this.n; i++) {
          const a = zr[i], b = zi[i];
          rp += this.cpr[i] * a - this.cpi[i] * b;
          rx -= this.cxr[i] * b + this.cxi[i] * a;
          zr[i] = a * rr[i] - b * ri[i];
          zi[i] = a * ri[i] + b * rr[i];
        }
        let env = w;
        if (this.rise < 1) { env *= 0.5 - 0.5 * Math.cos(Math.PI * this.rise); this.rise = Math.min(1, this.rise + this.riseStep); }
        hp += env * rp; hx += env * rx;
      }
      this.fade *= fadeStep;
      hp *= g * this.fade; hx *= g * this.fade;
      if (mono) { L[s] += hp; R[s] += hp; } else { L[s] += hp; R[s] += hx; }
      const m = Math.abs(hp) + Math.abs(hx);
      if (m > peak) peak = m;
    }
    if (this.ring && (!this.chirp || this.chirp.stage === 3)) {
      let env = 0;
      for (let i = 0; i < this.n; i++) env += Math.hypot(this.zr[i], this.zi[i]) * (Math.hypot(this.cpr[i], this.cpi[i]) + Math.hypot(this.cxr[i], this.cxi[i]));
      if (env * g * this.fade < 1e-5 || !(peak < 1e3)) this.dead = true;
    }
  }
}

export class RingdownEngine {
  constructor(fs) {
    this.fs = fs; this.k = 1 / fs;
    this.p = { ...RINGDOWN_DEFAULTS };
    this.voices = [];
  }
  setParams(p) { this.p = { ...this.p, ...p }; }
  noteOn(data, vel) {
    this.voices.push(new Voice(this, data, vel));
    if (this.voices.length > this.p.maxVoices) this.voices.shift();
  }
  noteOff(key) { for (const v of this.voices) if (v.key === key) v.keyDown = false; }
  allOff() { this.voices.length = 0; }
  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    for (const v of this.voices) v.render(L, R, n, this);
    this.voices = this.voices.filter((v) => !v.dead);
  }
}

globalThis.RingdownEngine = RingdownEngine;
