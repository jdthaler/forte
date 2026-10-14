// carillon-engine.js — the real-time carillon. Runs in the AudioWorklet (through
// shared/worklet.js) and in Node (tests, renders).
//
//   key ─▶ clapper (a mass on a pendulum, Hertz contact, solved implicitly every sample against
//          every mode of the bell, where the bell is: a ringing bell is struck as it moves)
//       ─▶ bell modes (exact two-pole recursions; each m ≥ 1 family a doublet, split by the asymmetry)
//       ─▶ each mode's radiated pressure at the listener (its multipole's efficiency and pattern,
//          spreading and air absorption over the distance) ─▶ panned by the bell's place in the frame
//
// A carillon has no dampers: key-up does nothing, and the bells ring until they die away. One voice
// per bell. Modes that have died below audibility are skipped, so a bell that has rung for a while
// costs only its few long-lived modes.

import { TAU, KEY_LO, KEY_HI, bellOf, bellModes, clapperOf, clapperSpeed, asymmetryOf, distanceGain } from './carillon-model.js';

const OUT = 0.00156;        // output units per pascal at the listener (30 m away)
const MAX_VOICES = 36;      // bells sounding at once; the quietest older one fades out beyond this
const FADE = 0.03;          // s: a stolen voice fades out over this
const YOUNG = 0.05;         // s: a voice this young is never stolen
const FLIGHT_MAX = 0.03;    // s: the longest the clapper is followed after it is launched
const GLIDE = 0.03;         // s: output gains (distance, listener) and the asymmetry glide over this
const PRUNE = 1e-5;         // a mode below this × the bell's loudest is skipped (−100 dB)
const POST_BLOCKS = 4;
const BLOCK_MAX = 1024;

function keyPan(key) {
  const p = 0.5 * ((2 * (key - KEY_LO)) / (KEY_HI - KEY_LO) - 1), a = ((p + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}

class Voice {
  constructor(eng, key) {
    const P = eng.P;
    this.key = key; this.id = `${P.profile}|${P.historic}`;
    this.bell = bellOf(key, P.profile, P.historic);
    this.modes = bellModes(this.bell, P);
    // resonators: one per m = 0 mode, two (the doublet) per m ≥ 1 mode
    const list = [];
    this.modes.forEach((md, i) => { list.push([i, 0]); if (md.m > 0) list.push([i, 1]); });
    const N = list.length, F = () => new Float64Array(N);
    this.N = N; this.src = Int32Array.from(list, (x) => x[0]); this.mem = Uint8Array.from(list, (x) => x[1]);
    this.A1 = F(); this.A2 = F(); this.Bc = F(); this.PHI = F(); this.B = F(); this.G = F(); this.GT = F();
    this.Y1 = F(); this.Y2 = F(); this.W = F(); this.SIG = F(); this.AMP = F(); this.ANG = F();
    this.act = new Uint8Array(N); this.idx = new Int32Array(N); this.nAct = 0;
    this.buf = new Float64Array(BLOCK_MAX);
    [this.gl, this.gr] = keyPan(key);
    this.eps = null; this.age = 0; this.fade = 1; this.fading = false; this.dead = false;
    this.peak = 0; this.level = 0; this.released = false;
    this.clap = null; this.cl = { on: false, x: 0, x1: 0, d1: -1, d2: -1, n: 0, contact: 0, Fmax: 0, ms: 0, fwhm: 0, forces: new Float64Array(Math.ceil(FLIGHT_MAX * eng.fs) + 2) };
    this.coefs(eng, true);
    this.gains(eng, true);
  }

  // Frequencies (with the doublet split at the current asymmetry) and damping → two-pole coefficients.
  // (No allocation: this runs in process() while the asymmetry glides.)
  coefs(eng, first = false) {
    const h = 1 / eng.fs, eps = eng.S.asym, nyq = 0.45 * eng.fs;
    this.eps = eps;
    if (first) { // a historic bell's own asymmetry in harmonic 2m, as a phasor (the knob's lies along ψ = 0)
      this.HRE = new Float64Array(this.N); this.HIM = new Float64Array(this.N);
      for (let r = 0; r < this.N; r++) {
        const m = this.modes[this.src[r]].m, as = asymmetryOf(m, 0, this.bell.hist);
        this.HRE[r] = as.e * Math.cos(2 * m * as.psi); this.HIM[r] = as.e * Math.sin(2 * m * as.psi);
      }
    }
    for (let r = 0; r < this.N; r++) {
      const md = this.modes[this.src[r]], member = this.mem[r], m = md.m;
      const re = eps + this.HRE[r], im = this.HIM[r], e = Math.sqrt(re * re + im * im);
      const fac = m > 0 ? (member === 0 ? 1 - (e * md.kappa) / 4 : 1 + (e * md.kappa) / 4) : 1; // doubletSplit()
      const f = md.f * fac, w = TAU * f, sig = md.sigma, rr = Math.exp(-sig * h);
      // the pair's orientation is set when the bell is hung (a ringing doublet keeps its axes)
      if (first) this.ANG[r] = e > 0 && m > 0 ? Math.atan2(im, re) / (2 * m) : 0;
      this.W[r] = w; this.SIG[r] = sig;
      if (f >= nyq) { this.A1[r] = 0; this.A2[r] = 0; this.Bc[r] = 0; continue; }
      this.A1[r] = 2 * rr * Math.cos(w * h); this.A2[r] = rr * rr; this.Bc[r] = (h * rr * Math.sin(w * h)) / w;
    }
  }

  // Output gains toward the listener (targets; they glide): the mode's radiation, its doublet member's
  // pattern cos/sin m(β − ψ) at the listener's azimuth β, the distance; × fs for velocity from the
  // backward difference, corrected to the exact amplitude at the mode's frequency.
  gains(eng, now = false) {
    const P = eng.P, h = 1 / eng.fs, beta = ((P.strikeAngle + P.around) * Math.PI) / 180;
    for (let r = 0; r < this.N; r++) {
      const md = this.modes[this.src[r]], m = md.m, member = this.mem[r], w = this.W[r];
      const pat = m === 0 ? 1 : member === 0 ? Math.cos(m * (beta - this.ANG[r])) : Math.sin(m * (beta - this.ANG[r]));
      const corr = (0.5 * w * h) / Math.sin(0.5 * w * h);
      // demos and tests: listen without some named partials (mute), or to only some (only)
      const muted = (P.mute && md.name && P.mute.includes(md.name)) || (P.only && !(md.name && P.only.includes(md.name)));
      this.GT[r] = this.A1[r] === 0 || muted ? 0 : OUT * md.rad * pat * distanceGain(md.f, eng.S.distance) * eng.fs * corr;
      if (now) this.G[r] = this.GT[r];
    }
  }

  // The clapper is launched at the wall where the bell is now: its ball 1.5 steps from the surface,
  // moving at v. Each mode's reach at the strike point: the inner surface's motion there, times
  // cos/sin m(α − ψ) for the two members of a doublet (α the strike's azimuth).
  strike(eng, velocity) {
    const P = eng.P, h = 1 / eng.fs, alpha = (P.strikeAngle * Math.PI) / 180;
    const bell = this.bell, modesNow = bellModes(bell, P); // strike height may have moved
    let C = 0, u = 0;
    for (let r = 0; r < this.N; r++) {
      const md = modesNow[this.src[r]], m = md.m, member = this.mem[r];
      const ang = m === 0 ? 1 : member === 0 ? Math.cos(m * (alpha - this.ANG[r])) : Math.sin(m * (alpha - this.ANG[r]));
      const phi = this.A1[r] === 0 ? 0 : md.reach * ang;
      this.PHI[r] = phi; this.B[r] = this.Bc[r] * phi; C += this.Bc[r] * phi * phi;
      u += phi * this.Y1[r];
      this.act[r] = this.A1[r] !== 0 ? 1 : 0;
    }
    this.compact();
    const v = clapperSpeed(this.bell, P, velocity);
    if (!(v > 0)) return;
    const cl = this.cl, c = clapperOf(bell, P);
    this.clap = c; this.Cm = C; this.hm = (h * h) / c.m;
    cl.x = u - 1.5 * v * h; cl.x1 = cl.x - v * h; cl.d1 = -1; cl.d2 = -1; cl.on = true; cl.n = 0; cl.contact = 0; cl.Fmax = 0; cl.v = v;
    this.fading = false; this.fade = 1; this.age = 0; this.released = false;
  }

  // Hertz force for a compression D at the next step: the discrete gradient of V = (2/5) K δ^(5/2)
  // between δ two steps back and D, so the impact neither makes nor loses energy numerically.
  hertz(D) {
    const K = this.clap.K, d0 = this.fd0;
    const V = D > 0 ? 0.4 * K * D * D * Math.sqrt(D) : 0, dd = D - d0;
    const f = Math.abs(dd) > 1e-16 ? (V - this.fV0) / dd : D > 0 ? K * D * Math.sqrt(D) : 0;
    return f > 0 ? f : 0;
  }
  // Solve D + C·F(D) = dFree (C: the bell's and the clapper's compliance over one step).
  contactForce(dFree, C) {
    const cl = this.cl, d0 = cl.d2, K = this.clap.K;
    this.fd0 = d0; this.fV0 = d0 > 0 ? 0.4 * K * d0 * d0 * Math.sqrt(d0) : 0;
    cl.d2 = cl.d1;
    if (dFree <= 0 && d0 <= 0) { cl.d1 = dFree; return 0; }
    let hi = dFree, lo = dFree - C * this.hertz(dFree) - 1e-15, D = 0.5 * (lo + hi);
    for (let it = 0; it < 60; it++) {
      const F = this.hertz(D), g = D + C * F - dFree;
      if (g > 0) hi = D; else lo = D;
      if (hi - lo <= 1e-14 * (Math.abs(dFree) + 1e-9)) break;
      const e = 1e-9 * (Math.abs(D) + 1e-9), dg = 1 + (C * (this.hertz(D + e) - F)) / e;
      let Dn = D - g / dg;
      if (!(Dn > lo && Dn < hi)) Dn = 0.5 * (lo + hi);
      D = Dn;
    }
    cl.d1 = D;
    return this.hertz(D);
  }

  render(L, R, n, eng) {
    const N = this.N, A1 = this.A1, A2 = this.A2, Y1 = this.Y1, Y2 = this.Y2, G = this.G, GT = this.GT, act = this.act, buf = this.buf;
    const glide = 1 - Math.exp(-n / (GLIDE * eng.fs)), inv = 1 / n;
    buf.fill(0, 0, n);
    if (this.cl.on) {
      // the clapper is in flight or in contact: every mode, sample by sample
      const cl = this.cl, PHI = this.PHI, B = this.B, C = this.Cm + this.hm;
      for (let r = 0; r < N; r++) G[r] += glide * (GT[r] - G[r]);
      for (let s = 0; s < n; s++) {
        let uf = 0;
        for (let r = 0; r < N; r++) { const y = A1[r] * Y1[r] - A2[r] * Y2[r]; Y2[r] = Y1[r]; Y1[r] = y; uf += PHI[r] * y; }
        let F = 0;
        if (cl.on) {
          const xf = 2 * cl.x - cl.x1;
          F = this.contactForce(xf - uf, C);
          cl.x1 = cl.x; cl.x = xf - this.hm * F;
          if (F > 0) { for (let r = 0; r < N; r++) Y1[r] += B[r] * F; cl.contact++; if (F > cl.Fmax) cl.Fmax = F; }
          if (cl.n < cl.forces.length) cl.forces[cl.n] = F;
          if (++cl.n >= cl.forces.length || (cl.contact > 0 && F === 0 && cl.d1 < -1e-4 * this.bell.D)) this.endContact(eng);
        }
        let y = 0;
        for (let r = 0; r < N; r++) y += G[r] * (Y1[r] - Y2[r]);
        buf[s] = y;
      }
    } else {
      // free ringing: mode by mode over the block, four at a time (independent recursions in one loop
      // run in parallel in the CPU), each output gain ramping to its target
      const idx = this.idx, na = this.nAct;
      let q = 0;
      for (; q + 4 <= na; q += 4) {
        const r0 = idx[q], r1 = idx[q + 1], r2 = idx[q + 2], r3 = idx[q + 3];
        const a10 = A1[r0], a20 = A2[r0], a11 = A1[r1], a21 = A2[r1], a12 = A1[r2], a22 = A2[r2], a13 = A1[r3], a23 = A2[r3];
        let y10 = Y1[r0], y20 = Y2[r0], y11 = Y1[r1], y21 = Y2[r1], y12 = Y1[r2], y22 = Y2[r2], y13 = Y1[r3], y23 = Y2[r3];
        let g0 = G[r0], g1 = G[r1], g2 = G[r2], g3 = G[r3];
        const d0 = glide * (GT[r0] - g0) * inv, d1 = glide * (GT[r1] - g1) * inv, d2 = glide * (GT[r2] - g2) * inv, d3 = glide * (GT[r3] - g3) * inv;
        for (let s = 0; s < n; s++) {
          const x0 = a10 * y10 - a20 * y20, x1 = a11 * y11 - a21 * y21, x2 = a12 * y12 - a22 * y22, x3 = a13 * y13 - a23 * y23;
          buf[s] += g0 * (x0 - y10) + g1 * (x1 - y11) + g2 * (x2 - y12) + g3 * (x3 - y13);
          y20 = y10; y10 = x0; y21 = y11; y11 = x1; y22 = y12; y12 = x2; y23 = y13; y13 = x3;
          g0 += d0; g1 += d1; g2 += d2; g3 += d3;
        }
        Y1[r0] = y10; Y2[r0] = y20; Y1[r1] = y11; Y2[r1] = y21; Y1[r2] = y12; Y2[r2] = y22; Y1[r3] = y13; Y2[r3] = y23;
        G[r0] = g0; G[r1] = g1; G[r2] = g2; G[r3] = g3;
      }
      for (; q < na; q++) {
        const r = idx[q], a1 = A1[r], a2 = A2[r];
        let y1 = Y1[r], y2 = Y2[r], g = G[r];
        const dg = glide * (GT[r] - g) * inv;
        for (let s = 0; s < n; s++) { const y = a1 * y1 - a2 * y2; buf[s] += g * (y - y1); y2 = y1; y1 = y; g += dg; }
        Y1[r] = y1; Y2[r] = y2; G[r] = g;
      }
      // the skipped modes' gains still follow their targets
      if (na < N) for (let r = 0; r < N; r++) if (!act[r]) G[r] += glide * (GT[r] - G[r]);
    }
    const gl = this.gl, gr = this.gr, fadeStep = this.fading ? 1 / (FADE * eng.fs) : 0;
    let fade = this.fade;
    for (let s = 0; s < n; s++) {
      const y = buf[s] * fade;
      if (fadeStep) { fade -= fadeStep; if (fade <= 0) { fade = 0; this.dead = true; } }
      L[s] += gl * y; R[s] += gr * y;
    }
    this.fade = fade;
    this.age += n / eng.fs;
    this.prune(eng);
  }

  endContact(eng) {
    const cl = this.cl, fs = eng.fs;
    cl.on = false; cl.ms = (1000 * cl.contact) / fs;
    // the force pulse's width at half its peak
    let a = -1, b = -1;
    for (let i = 0; i < Math.min(cl.n, cl.forces.length); i++) if (cl.forces[i] >= 0.5 * cl.Fmax) { if (a < 0) a = i; b = i; }
    cl.fwhm = a >= 0 ? (1000 * (b - a + 1)) / fs : 0;
  }

  // Each mode's amplitude as heard (from two successive samples: exact for a free decaying sinusoid);
  // skip those far below the bell's loudest; the bell is done when every mode is.
  prune(eng) {
    const h = 1 / eng.fs, N = this.N, Y1 = this.Y1, Y2 = this.Y2, AMP = this.AMP;
    let sum = 0, any = false;
    for (let r = 0; r < N; r++) {
      if (!this.act[r]) { AMP[r] = 0; continue; }
      const w = this.W[r], c = Math.cos(w * h), sn = Math.sin(w * h), a = Y1[r], b = Y2[r];
      // displacement amplitude × the output's gain at this frequency (G·(y − y₁) has gain 2 sin(ωh/2))
      const amp = (Math.sqrt(Math.max(0, a * a - 2 * c * a * b + b * b)) / sn) * Math.abs(this.GT[r]) * 2 * Math.sin(0.5 * w * h);
      AMP[r] = amp; sum += amp;
    }
    if (!(sum < 1e6)) { this.dead = true; eng.post?.({ type: 'error', message: `bell ${this.key}: numerical failure` }); return; }
    if (sum > this.peak) this.peak = sum;
    this.level = sum;
    if (this.cl.on || this.age < YOUNG) return;
    const floor = PRUNE * this.peak;
    for (let r = 0; r < N; r++) if (this.act[r]) { if (AMP[r] < floor || AMP[r] < 1e-12) this.act[r] = 0; else any = true; }
    this.compact();
    if (!any) this.dead = true;
  }
  compact() { let k = 0; for (let r = 0; r < this.N; r++) if (this.act[r]) this.idx[k++] = r; this.nAct = k; }
}

export class CarillonEngine {
  constructor(fs) {
    this.fs = fs; this.P = null; this.S = null; this.T = null;
    this.voices = []; this.byKey = new Map(); this.sustain = false; this.focus = null; this.blocks = 0;
    this.msg = { type: 'bell', key: 0, amp: new Float32Array(512), n: 0, contactMs: 0, fwhm: 0, Fmax: 0, v: 0, age: 0 };
  }

  setParams(P) {
    const first = !this.P;
    this.P = P;
    this.T = { asym: P.asym / 100, distance: P.distance };
    if (first) this.S = { ...this.T };
    for (const v of this.voices) { v.coefs(this); v.gains(this); } // losses, listener: at once (gains glide)
  }

  setSustain(on) { this.sustain = !!on; } // a carillon has no dampers: nothing to lift

  noteOn(key, velocity) {
    if (!this.P || !(key >= KEY_LO && key <= KEY_HI)) return;
    const id = `${this.P.profile}|${this.P.historic}`;
    let v = this.byKey.get(key);
    if (!v || v.dead || v.fading || v.id !== id) {
      if (v && !v.dead) v.fading = true; // a different bell now hangs there: the old one fades out
      v = new Voice(this, key);
      this.voices.push(v); this.byKey.set(key, v);
    }
    v.strike(this, velocity);
    this.focus = v;
    let live = 0;
    for (const u of this.voices) if (!u.fading) live++;
    if (live > MAX_VOICES) {
      let victim = null, score = Infinity;
      for (const u of this.voices) {
        if (u === v || u.fading || u.cl.on || u.age < YOUNG) continue;
        if (u.level < score) { score = u.level; victim = u; }
      }
      if (victim) victim.fading = true;
    }
  }

  noteOff(key) { const v = this.byKey.get(key); if (v) v.released = true; } // the clapper falls back; the bell rings on
  allNotesOff() { for (const v of this.voices) v.fading = true; }
  voiceCount() { return this.voices.length; }

  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    if (!this.P) return;
    const S = this.S, T = this.T, a = 1 - Math.exp(-n / (GLIDE * this.fs));
    let moved = false;
    for (const id in T) {
      if (S[id] === T[id]) continue;
      S[id] += a * (T[id] - S[id]);
      if (Math.abs(T[id] - S[id]) < 1e-6 * (Math.abs(T[id]) + 1e-4)) S[id] = T[id];
      moved = true;
    }
    for (const v of this.voices) {
      if (moved) { if (v.eps !== S.asym) v.coefs(this); v.gains(this); }
      v.render(L, R, n, this);
    }
    let j = 0;
    for (const v of this.voices) {
      if (v.dead) { if (this.byKey.get(v.key) === v) this.byKey.delete(v.key); } else this.voices[j++] = v;
    }
    this.voices.length = j;
    if (this.focus?.dead) this.focus = null;
    if (this.post && ++this.blocks >= POST_BLOCKS) { this.blocks = 0; this.postFocus(); }
  }

  // Live data for the page's views: the struck bell's partials as heard (each doublet member), and
  // its last clapper impact.
  postFocus() {
    const v = this.focus, m = this.msg;
    if (!v) { m.key = 0; m.n = 0; this.post(m); return; }
    const n = Math.min(v.N, m.amp.length);
    m.key = v.key; m.n = n; m.age = v.age;
    for (let r = 0; r < n; r++) m.amp[r] = v.AMP[r];
    m.contactMs = v.cl.ms; m.fwhm = v.cl.fwhm; m.Fmax = v.cl.Fmax; m.v = v.cl.v || 0; m.id = v.id;
    this.post(m);
  }
}

globalThis.CarillonEngine = CarillonEngine;
