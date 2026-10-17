// ringdown-engine.js — plays black-hole ringdowns (and optional inspirals).
//
// Each mode is a decaying phasor ζ(t) = e^{−γt} e^{−2πift}; the two
// gravitational-wave polarisations are h₊ = Re(C₊ζ) and h× = −Im(C×ζ), summed
// over modes. Left = h₊, right = h× (or mono). With an inspiral, the note
// opens with the leading-order quadrupole chirp, f(t) = f₀(1 − t/τ_c)^(−3/8),
// rises through a short merger bridge, and hands over to the ringdown with
// the same phase and amplitude (ringdown-model.js has the schedule in closed
// form).
//
// The engine contract is shared/worklet.js's: noteOn(key, velocity, voice), the
// voice from keyVoice (ringdown-model.js). Under shared/worklet.js it posts the
// page { type: 'voices', voices } every 48 blocks of 128 samples.

const TAU = 2 * Math.PI;

export const RINGDOWN_DEFAULTS = { stereo: 1, releaseMute: 0, master: 1, maxVoices: 48 };
const STEAL_TAU = 0.0015;   // a stolen voice fades out with this time constant (gone in ~10 ms)
const VOICES_EVERY = 48 * 128; // samples between voice counts for the page

class Voice {
  constructor(eng, key, d, vel) {
    this.key = key; this.vel = vel; this.keyDown = true;
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
    this.stolen = false;
    this.level = Infinity;      // output level estimate, for choosing a voice to steal
    // the strain rises through the merger peak rather than jumping: a raised-
    // cosine rise over half a (2,2,0) cycle removes the onset click
    this.rise = d.chirp ? 1 : 0;
    this.riseStep = 2 * d.info.f0 * k;
    this.dead = false;
    this.chirp = d.chirp ? { ...d.chirp, t: 0, phi: 0, f: d.chirp.fStart, stage: 1, A: 0, xfade: 1 } : null;
    if (d.chirp) {
      const c = this.chirp;
      c.tc = c.tc ?? (5 / 256) * c.Mc ** (-5 / 3) * (Math.PI * c.fStart) ** (-8 / 3);
      c.bridge = Math.exp(-k / c.tauB);
    } else this.startRing();
  }

  startRing(phase = 0) {
    for (let i = 0; i < this.n; i++) { this.zr[i] = Math.cos(phase); this.zi[i] = -Math.sin(phase); }
    this.ring = true;
  }

  render(L, R, n, eng) {
    const k = eng.k, mono = !eng.p.stereo, g = eng.p.master * 0.35 * this.vel;
    const fadeStep = this.stolen ? eng.stealStep : !this.keyDown && eng.p.releaseMute ? eng.muteStep : 1;
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
          c.f = c.f220 - (c.f220 - c.f) * c.bridge;
          // hand over: the ringdown starts with the chirp's phase (and, by
          // construction, its amplitude), so the strain is continuous
          if (c.f >= 0.97 * c.f220) { c.stage = 3; this.startRing(c.phi + c.psi); this.rise = 0; }
        }
        if (c.stage < 3) {
          c.phi += TAU * c.f * k;
          // h ∝ f^(2/3), faded in at the start (the inspiral was already under way)
          c.A = c.amp * Math.min(1, (c.f / c.fPk) ** (2 / 3)) * (c.t < c.fadeT ? 0.5 - 0.5 * Math.cos((Math.PI * c.t) / c.fadeT) : 1);
          hp = c.A * c.cp * Math.cos(c.phi);
          hx = c.A * c.cx * Math.sin(c.phi);
          c.t += k;
        }
      }
      if (c && c.stage === 3 && c.xfade > 0) {
        // crossfade to the ringdown across half a cycle (weights sum to one)
        c.xfade = this.rise < 1 ? 0.5 + 0.5 * Math.cos(Math.PI * this.rise) : 0;
        hp = c.xfade * c.A * c.cp * Math.cos(c.phi);
        hx = c.xfade * c.A * c.cx * Math.sin(c.phi);
        c.phi += TAU * c.f220 * k;
      }
      if (this.ring) {
        const zr = this.zr, zi = this.zi, rr = this.rr, ri = this.ri;
        let rp = 0, rx = 0;
        for (let i = 0; i < this.n; i++) {
          const a = zr[i], b = zi[i];
          rp += this.cpr[i] * a - this.cpi[i] * b;
          rx -= this.cxr[i] * b + this.cxi[i] * a;
          zr[i] = a * rr[i] - b * ri[i];
          zi[i] = a * ri[i] + b * rr[i];
        }
        let env = 1;
        if (this.rise < 1) { env = 0.5 - 0.5 * Math.cos(Math.PI * this.rise); this.rise = Math.min(1, this.rise + this.riseStep); }
        hp += env * rp; hx += env * rx;
      }
      this.fade *= fadeStep;
      hp *= g * this.fade; hx *= g * this.fade;
      if (mono) { L[s] += hp; R[s] += hp; } else { L[s] += hp; R[s] += hx; }
      const m = Math.abs(hp) + Math.abs(hx);
      if (m > peak) peak = m;
    }
    if (this.ring) {
      // a mode that has died away goes to zero rather than into denormals, which cost the
      // audio thread tenfold (the fast overtones get there while the fundamental rings)
      for (let i = 0; i < this.n; i++) if (Math.abs(this.zr[i]) + Math.abs(this.zi[i]) < 1e-100) { this.zr[i] = 0; this.zi[i] = 0; }
    }
    if (this.ring && (!this.chirp || this.chirp.stage === 3)) {
      let env = 0;
      for (let i = 0; i < this.n; i++) env += Math.hypot(this.zr[i], this.zi[i]) * (Math.hypot(this.cpr[i], this.cpi[i]) + Math.hypot(this.cxr[i], this.cxi[i]));
      this.level = env * g * this.fade;
      if (this.level < 1e-5 || !(peak < 1e3)) this.dead = true;
    } else this.level = this.chirp ? this.chirp.amp * g * this.fade : peak;
    if (this.stolen && this.fade < 1e-4) this.dead = true;
  }
}

export class RingdownEngine {
  constructor(fs) {
    this.fs = fs; this.k = 1 / fs;
    this.p = { ...RINGDOWN_DEFAULTS };
    this.voices = [];
    this.stealStep = Math.exp(-this.k / STEAL_TAU);
    this.muteStep = Math.exp(-this.k / 0.04);
    this.sinceVoices = 0;
  }
  setParams(p) { this.p = { ...this.p, ...p }; }
  noteOn(key, vel, data) {
    // over the limit: fade out the quietest voice that is not already going
    let live = 0, quiet = null;
    for (const v of this.voices) if (!v.stolen) { live++; if (!quiet || v.level < quiet.level) quiet = v; }
    if (live >= this.p.maxVoices && quiet) quiet.stolen = true;
    this.voices.push(new Voice(this, key, data, vel));
    if (this.voices.length > 2 * this.p.maxVoices) this.voices.shift();   // hard limit, never reached in practice
  }
  noteOff(key) { for (const v of this.voices) if (v.key === key) v.keyDown = false; }
  allNotesOff() { this.voices.length = 0; }
  voiceCount() { return this.voices.length; }
  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    const vs = this.voices;
    let j = 0;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      v.render(L, R, n, this);
      if (!v.dead) vs[j++] = v;
    }
    vs.length = j;
    if (this.post && (this.sinceVoices += n) >= VOICES_EVERY) { this.sinceVoices = 0; this.post({ type: 'voices', voices: vs.length }); }
  }
}

globalThis.RingdownEngine = RingdownEngine;
