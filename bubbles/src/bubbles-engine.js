// bubbles-engine.js — the real-time bubble organ. Runs in the AudioWorklet
// (through shared/worklet.js) and in Node (tests, renders).
//
//   key held ─▶ its nozzle releases bubbles (the first at once, then at the set rate, seeded random gaps)
//   each bubble: the neck snaps (a pressure kick, ramped over the snap time) ─▶ a damped oscillator for
//   its wall, ẍ + 2bẋ + ω₀²x = 0, run as a rotating phasor (exact for constant ω₀ and b)
//   while it rises, its depth, size and the surface's image change ω₀ and b: recomputed every block,
//   swept smoothly sample by sample
//   output = the volume acceleration ρR²ẍ/r heard by two hydrophones (1/r spreading from the nozzle)
//
// One nozzle per key: re-striking a key releases its next bubble at once, it never adds a second
// nozzle. Bubbles live in a fixed pool; beyond SOFT ringing bubbles the quietest old one fades out.
// Nothing is allocated in process().

import {
  TAU, G, P_ATM, KEY_LO, KEY_HI, R_REF, keyFreq, acoustics, nozzleEnv, tuneRadius, riseSpeed, riseDistance,
  hydrophoneGains, kickPressure, slowExponent, DEFAULT_COND,
} from './bubbles-model.js';

const OUT = 1;              // output units per pascal at the reference distance (a forte bubble: 0.16 Pa)
const MAX_BUBBLES = 192;    // the pool
const SOFT = 160;           // beyond this many ringing bubbles, the quietest old one fades out
const MIN_AGE = 0.012;      // s: a bubble younger than this is never stolen
const FADE = 0.006;         // s: a stolen bubble fades out over this
const BURST = 0.002;        // s: a bubble that reaches the surface bursts: its ring stops over this
const END = 1e-4;           // a bubble is freed 80 dB below its peak
const P_GLIDE = 0.05;       // s: the tank's pressure follows its knob with this time constant
const PRESS_GAIN = 2;       // aftertouch: full pressure releases (1 + 2) times as many bubbles
const KICK_JITTER = 0.25;   // the kick varies by this (× irregularity) from bubble to bubble
const POST_BLOCKS = 4;      // view messages every few blocks
const EV_MAX = 48, EVF = 8; // queued release events for the page, fields per event
export const WAVE_N = 1024; // points of the latest bubble's recorded waveform
const NK = KEY_HI - KEY_LO + 1;

class Bubble {
  constructor() {
    this.on = false; this.key = 0; this.age = 0; this.start = 0;
    this.ur = 0; this.ui = 0; this.mr = 1; this.mi = 0; this.sr = 0; this.si = 0; this.cr = 0; this.ci = 0;
    this.gl = 0; this.gr = 0; this.fade = 1; this.fadeStep = 0;
    this.rampLeft = 0; this.rampN = 1; this.rampK = 0; this.rampA = 0; this.rampV = 0; this.rampAl = 0; this.rampBe = 0;
    this.env = 0; this.peak = 0;
    // the bubble at release, for its glide
    this.R0 = 0; this.R = 0; this.d0 = 0; this.d = 0; this.U = 0; this.pb0 = 0; this.phiRe = 0; this.phiIm = 0;
    this.nSlow = 1; this.liq = null; this.gas = null; this.b = 0; this.wd = 0; this.w0 = 0; this.fd0 = 0; this.vel = 0;
  }
}

class Nozzle {
  constructor(key) { this.key = key; this.held = false; this.owed = false; this.vel = 0; this.due = 0; this.first = true; this.press = 0; this.released = 0; }
}

// mulberry32: small, fast and seedable, so renders and tests are reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class BubbleEngine {
  // seed: the random gaps and sizes (renders and tests repeat exactly); pool and soft: test hooks
  constructor(fs, seed = 0x5eed, { pool = MAX_BUBBLES, soft = SOFT } = {}) {
    this.fs = fs; this.P = null;
    this.rand = rng(seed); this.spare = NaN; this.soft = soft;
    this.pool = Array.from({ length: pool }, () => new Bubble());
    this.nozzles = Array.from({ length: NK }, (_, i) => new Nozzle(KEY_LO + i));
    // each nozzle's radius at the default conditions, and with "keep in tune" (cached per condition version)
    const def = nozzleEnv(DEFAULT_COND);
    this.Rnom = Float64Array.from({ length: NK }, (_, i) => tuneRadius(keyFreq(KEY_LO + i), def));
    this.Rtune = new Float64Array(NK); this.tuneVer = new Int32Array(NK).fill(-1); this.ver = 0;
    this.gainL = new Float64Array(NK); this.gainR = new Float64Array(NK);
    const g = [0, 0];
    for (let i = 0; i < NK; i++) { hydrophoneGains(KEY_LO + i, g); this.gainL[i] = g[0]; this.gainR[i] = g[1]; }
    this.env = nozzleEnv(DEFAULT_COND);                                            // conditions at the nozzles (targets)
    this.renv = { p0: 0, d: 0, liq: null, gas: null, phiFixed: null };              // scratch: a bubble at release
    this.genv = { p0: 0, d: 0, liq: null, gas: null, phiFixed: { re: 0, im: 0 } };   // scratch: a rising bubble (Φ kept)
    this.ac = {};                                                                   // scratch acoustics
    this.pT = P_ATM; this.pTarget = P_ATM; this.frame = 0; this.blocks = 0;
    // messages for the page (reused)
    this.ev = new Float64Array(EV_MAX * EVF); this.nev = 0;
    this.msg = { type: 'bubbles', frame: 0, fs, n: 0, ev: this.ev, active: 0 };
    this.wave = { type: 'wave', key: 0, buf: new Float32Array(WAVE_N), count: 0, dt: 0, R: 0, fd: 0, b: 0, delta: 0, dth: 0, drad: 0, dvis: 0, kappa: 0, d0: 0, frame: 0, done: false, p0: 0, chi: 0, m: 1, vel: 0, U: 0 };
    this.rec = null; this.recStride = 1; this.recPhase = 0; this.recPost = 0;
    this.log = null;
  }

  setParams(P) {
    const old = this.P;
    this.P = P;
    nozzleEnv(P, this.env);
    this.pTarget = P.pressure * P_ATM;
    if (!old) this.pT = this.pTarget;
    if (!old || old.depth !== P.depth || old.pressure !== P.pressure || old.gas !== P.gas || old.liquid !== P.liquid || old.keepInTune !== P.keepInTune) this.ver++;
  }

  noteOn(key, velocity) {
    if (!this.P || !(key >= KEY_LO && key <= KEY_HI)) return; // no nozzle outside A3–C8
    const z = this.nozzles[key - KEY_LO];
    // every press owes one bubble, released in the next block even if the key is already up again
    // (a quick tap); a held key struck again releases its next bubble now: the same nozzle, never a second
    z.held = true; z.owed = true; z.vel = Math.max(0, Math.min(1, velocity)); z.first = true;
  }
  noteOff(key) { if (key >= KEY_LO && key <= KEY_HI) this.nozzles[key - KEY_LO].held = false; }
  allNotesOff() {
    for (const z of this.nozzles) { z.held = false; z.owed = false; z.press = 0; }
    for (const b of this.pool) if (b.on) this.startFade(b, FADE);
  }
  handle(m) {
    if (m.type !== 'pressure') return; // aftertouch: more gas through the nozzle, more bubbles
    const v = Math.max(0, Math.min(1, +m.value || 0));
    if (m.key == null) for (const z of this.nozzles) z.press = v;
    else if (m.key >= KEY_LO && m.key <= KEY_HI) this.nozzles[m.key - KEY_LO].press = v;
  }
  voiceCount() { let n = 0; for (const b of this.pool) if (b.on) n++; return n; }

  // a standard normal deviate, clipped to ±2.5
  gauss() {
    let g;
    if (this.spare === this.spare) { g = this.spare; this.spare = NaN; }
    else {
      const u = Math.max(1e-12, this.rand()), v = this.rand(), r = Math.sqrt(-2 * Math.log(u));
      g = r * Math.cos(TAU * v); this.spare = r * Math.sin(TAU * v);
    }
    return Math.max(-2.5, Math.min(2.5, g));
  }
  // samples to the nozzle's next release: mean 1/rate, regular blended with exponential (Poisson) gaps
  interval(z) {
    const P = this.P, mean = this.fs / (P.rate * (1 + PRESS_GAIN * z.press)), j = P.irregular;
    return Math.max(1, mean * (1 - j + j * -Math.log(1 - this.rand())));
  }
  radius(i) {
    if (!this.P.keepInTune) return this.Rnom[i];
    if (this.tuneVer[i] !== this.ver) { this.Rtune[i] = tuneRadius(keyFreq(KEY_LO + i), this.env); this.tuneVer[i] = this.ver; }
    return this.Rtune[i];
  }
  startFade(b, sec) { const step = 1 / Math.max(1, sec * this.fs); if (!(b.fadeStep >= step)) b.fadeStep = step; }

  // Release a bubble from nozzle z, `offset` samples into this block. Returns false if the pool is full.
  release(z, offset) {
    let slot = null, live = 0;
    for (const b of this.pool) { if (!b.on) { if (!slot) slot = b; } else if (b.fadeStep === 0) live++; }
    if (live >= this.soft) { // fade the quietest bubble that has had time to sound
      let victim = null;
      for (const b of this.pool) if (b.on && b.fadeStep === 0 && b.age >= MIN_AGE * this.fs && (!victim || b.env < victim.env)) victim = b;
      if (victim) this.startFade(victim, FADE);
    }
    if (!slot) return false;
    const P = this.P, i = z.key - KEY_LO, liq = this.env.liq, gas = this.env.gas, fs = this.fs;
    let R = this.radius(i), vel = z.vel;
    const first = z.first;
    if (!first) {
      R *= 1 + (P.spread / 100) * this.gauss();
      vel *= Math.max(0.2, 1 + KICK_JITTER * P.irregular * this.gauss());
    }
    z.first = false; z.released++;
    if (this.log) this.log.push({ key: z.key, frame: this.frame + offset, R, vel, first }); // tests only (null otherwise)
    // the bubble at its nozzle, under the tank's pressure as it is now
    const renv = this.renv, a = this.ac;
    renv.liq = liq; renv.gas = gas; renv.d = P.depth; renv.p0 = this.pT + liq.rho * G * P.depth;
    acoustics(R, renv, a);
    const b = slot;
    b.on = true; b.key = z.key; b.age = 0; b.start = offset; b.fade = 1; b.fadeStep = 0;
    b.R0 = R; b.R = R; b.d0 = P.depth; b.d = P.depth; b.U = riseSpeed(R, liq); b.pb0 = a.pb; b.phiRe = a.phiRe; b.phiIm = a.phiIm;
    b.nSlow = slowExponent(R, gas, a.pb);
    b.liq = liq; b.gas = gas; b.vel = vel; b.fd0 = a.fd;
    this.setRing(b, a);
    b.mr = Math.exp(b.sr / fs) * Math.cos(b.si / fs); b.mi = Math.exp(b.sr / fs) * Math.sin(b.si / fs);
    b.ur = 0; b.ui = 0; b.env = 0; b.peak = 0;
    b.gl = this.gainL[i]; b.gr = this.gainR[i];
    // the kick: a pressure step Δp (a share of 2σ/R), ramped over the neck's snap time; the wall's
    // equilibrium moves by Δp/(ρRmω₀²) along a raised cosine, and the wall rings about it
    const dp = kickPressure(R, liq, vel);
    b.rampA = dp / (liq.rho * R * a.m * a.omega0 * a.omega0); b.rampV = 0;
    b.rampAl = (2 * a.b) / (a.omega0 * a.omega0); b.rampBe = (1 - a.b * b.rampAl) / a.omegaD;
    b.rampN = Math.max(1, Math.round((P.snap / 1000) * fs)); b.rampK = 0; b.rampLeft = b.rampN + 1;
    // record this one for the waveform view
    if (this.post) this.startRecording(b, a);
    if (this.post && this.nev < EV_MAX) {
      const e = this.ev, k = this.nev++ * EVF;
      e[k] = z.key; e[k + 1] = this.frame + offset; e[k + 2] = R; e[k + 3] = a.fd; e[k + 4] = a.b; e[k + 5] = b.U; e[k + 6] = P.depth; e[k + 7] = vel;
    }
    return true;
  }

  // The ring's complex frequency s = −b + iω_d, and the output coefficient c = OUT·ρR²s²/r_ref (p = Re(c·u)).
  setRing(b, a) {
    b.b = a.b; b.wd = a.omegaD; b.w0 = a.omega0;
    b.sr = -a.b; b.si = a.omegaD;
    const k = (OUT * b.liq.rho * b.R * b.R) / R_REF;
    b.cr = k * (b.sr * b.sr - b.si * b.si); b.ci = k * 2 * b.sr * b.si;
  }

  startRecording(b, a) {
    const w = this.wave, fs = this.fs;
    // a window long enough to see the ring fall 40 dB, at most 120 periods (so every period gets ≥ 8 points)
    const T = Math.max(0.004, Math.min(4.6 / a.b, 120 / a.fd, 1.5));
    this.rec = b; this.recStride = Math.max(1, Math.ceil((T * fs) / WAVE_N)); this.recPhase = 0; this.recPost = 0;
    w.key = b.key; w.count = 0; w.dt = this.recStride / fs; w.R = b.R0; w.fd = a.fd; w.b = a.b; w.delta = a.delta;
    w.dth = a.dth; w.drad = a.drad; w.dvis = a.dvis; w.kappa = a.kappa; w.d0 = b.d0; w.frame = this.frame; w.done = false;
    w.p0 = a.pb - (2 * b.liq.sigma) / b.R0; w.chi = a.chi; w.m = a.m; w.vel = b.vel; w.U = b.U;
  }

  // Where the bubble is at the end of this block, and its ring there (in this.ac). False once it
  // has reached the surface: it bursts, and its ring stops.
  glide(b, n) {
    const t = (b.age + n) / this.fs, liq = b.liq, genv = this.genv;
    const d = b.d0 - riseDistance(t, b.U);
    if (d <= b.R) { this.startFade(b, BURST); return false; }
    genv.liq = liq; genv.gas = b.gas; genv.d = d; genv.p0 = this.pT + liq.rho * G * d;
    const R = b.R0 * (b.pb0 / (genv.p0 + (2 * liq.sigma) / b.R0)) ** (1 / (3 * b.nSlow)); // it swells as the pressure falls
    genv.phiFixed.re = b.phiRe; genv.phiFixed.im = b.phiIm;
    acoustics(R, genv, this.ac);
    b.R = R; b.d = d;
    return true;
  }

  render(b, L, R, n) {
    const fs = this.fs, i0 = b.start;
    let { ur, ui, mr, mi, cr, ci, fade } = b;
    // sweep s and c linearly from their values now to the block's end
    let dr = 1, di = 0, dcr = 0, dci = 0;
    const steps = n - i0;
    if (b.age > 0 && this.glide(b, n)) {
      const a = this.ac, sr1 = -a.b, si1 = a.omegaD, k = (OUT * b.liq.rho * b.R * b.R) / R_REF;
      const cr1 = k * (sr1 * sr1 - si1 * si1), ci1 = k * 2 * sr1 * si1;
      const er = (sr1 - b.sr) / (steps * fs), ei = (si1 - b.si) / (steps * fs), ee = Math.exp(er);
      dr = ee * Math.cos(ei); di = ee * Math.sin(ei);
      dcr = (cr1 - cr) / steps; dci = (ci1 - ci) / steps;
      b.b = a.b; b.wd = a.omegaD; b.w0 = a.omega0; b.sr = sr1; b.si = si1; b.cr = cr1; b.ci = ci1;
    }
    const gl = b.gl, gr = b.gr, fstep = b.fadeStep, rec = this.rec === b, stride = this.recStride, w = this.wave;
    for (let i = i0; i < n; i++) {
      if (b.rampLeft > 0) {
        // The neck snapping: the equilibrium e moves out along a raised cosine, taken piecewise linear
        // between samples. u is the wall's deviation from the particular solution e − 2bė/ω₀², which
        // rings freely between samples; at each sample the slope of e changes by Δv, and u jumps by
        // 2bΔv/ω₀² + i(1 − 2b²/ω₀²)Δv/ω_d. The output Re(s²u) is then exactly ẍ: no staircase.
        const k = b.rampK++, N = b.rampN;
        const v = k < N ? 0.5 * b.rampA * fs * (Math.cos((Math.PI * k) / N) - Math.cos((Math.PI * (k + 1)) / N)) : 0;
        const dv = v - b.rampV; b.rampV = v;
        ur += b.rampAl * dv; ui += b.rampBe * dv; b.rampLeft--;
      }
      const y = (cr * ur - ci * ui) * fade;
      L[i] += gl * y; R[i] += gr * y;
      if (rec && this.recPhase++ % stride === 0 && w.count < WAVE_N) w.buf[w.count++] = y / OUT; // Pa at r_ref
      const nr = ur * mr - ui * mi; ui = ur * mi + ui * mr; ur = nr;
      const tr = mr * dr - mi * di; mi = mr * di + mi * dr; mr = tr;
      cr += dcr; ci += dci;
      if (fstep) { fade -= fstep; if (fade <= 0) { fade = 0; break; } }
    }
    // renormalise the step to its exact value at the block's end
    const e = Math.exp(b.sr / fs);
    b.mr = e * Math.cos(b.si / fs); b.mi = e * Math.sin(b.si / fs);
    b.ur = ur; b.ui = ui; b.fade = fade;
    b.age += n - i0; b.start = 0;
    b.env = Math.hypot(ur, ui) * Math.hypot(b.cr, b.ci) * fade;
    if (b.env > b.peak) b.peak = b.env;
    const over = fade <= 0 || (b.rampLeft === 0 && b.env <= END * b.peak) || !(b.env < 1e3);
    if (over) b.on = false;
    if (rec && (over || w.count >= WAVE_N)) { w.done = true; this.rec = null; }
  }

  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    if (!this.P) return;
    // the tank's pressure glides to its knob
    this.pT += (this.pTarget - this.pT) * (1 - Math.exp(-n / (P_GLIDE * this.fs)));
    if (Math.abs(this.pTarget - this.pT) < 1e-6 * this.pTarget) this.pT = this.pTarget;
    // nozzles: release what is due in this block
    for (const z of this.nozzles) {
      if (z.owed) { // the bubble a press owes, at the start of this block; the gaps run from it
        if (!this.release(z, 0)) continue; // pool full: next block
        z.owed = false; z.due = this.interval(z);
      }
      if (!z.held) continue;
      while (z.due < n) {
        if (!this.release(z, Math.max(0, Math.floor(z.due)))) { z.due = n; break; } // pool full: try again next block
        z.due += this.interval(z);
      }
      z.due -= n;
    }
    for (const b of this.pool) if (b.on) this.render(b, L, R, n);
    this.frame += n;
    if (this.post) this.postViews();
  }

  postViews() {
    const w = this.wave; // the latest bubble's waveform: as it fills, and once more when complete
    if (w.done || (this.rec && ++this.recPost >= 8)) { this.recPost = 0; this.post(w); w.done = false; }
    if (++this.blocks < POST_BLOCKS && this.nev === 0) return;
    this.blocks = 0;
    const m = this.msg;
    m.frame = this.frame; m.n = this.nev; m.active = this.voiceCount();
    this.post(m);
    this.nev = 0;
  }
}

globalThis.BubbleEngine = BubbleEngine;
