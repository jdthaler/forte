// reeds-engine.js — the real-time reed piano. Runs in the AudioWorklet
// (through shared/worklet.js) and in Node (tests, renders).
//
//   reeds (modes + felt hammer) ─▶ C(y) of each reed in its slot ─▶ Σ δC
//   ─▶ comb node (R·C0 high-pass) ─▶ preamp × tremolo (LED + photocell)
//   ─▶ preamp saturation ─▶ ↓2 ─▶ speakers (two 4"×8" ovals) or direct out
//
// The reeds and everything up to the decimator run 2× oversampled: the slot's
// C(y) turns a large swing into many harmonics.

import { TAU, Biquad, DCBlock } from '../../shared/dsp.js';
import { keyModel, capCurve, pickupNode, hammerSpeed, PREAMP, LOSS } from './reeds-model.js';

const OS = 2;
const OUT = 0.5;           // volts at the preamp → output units
const HAMMER_MAX = 0.03;   // s: longest the hammer may stay in flight
const KILL = 300;          // s⁻¹: voice stealing / panic

export class Voice {
  constructor(eng, key, d) {
    const N = d.n, k = 1 / eng.fs2;
    this.key = key; this.N = N; this.k = k; this.version = d.version;
    const F = () => new Float64Array(N);
    this.q = F(); this.q1 = F(); this.a1 = F(); this.a2 = F(); this.a1d = F(); this.a2d = F();
    this.w = F(); this.bw = F(); this.pk = F(); this.bp = F(); this.om = F(); this.sig = F(); this.dw = F();
    let comp = 0;
    for (let i = 0; i < N; i++) {
      const om = TAU * d.freq[i], sig = d.sigma[i];
      this.om[i] = om; this.sig[i] = sig; this.dw[i] = d.dampW[i];
      const r = Math.exp(-sig * k), od = Math.sqrt(Math.max(om * om - sig * sig, 1e-6));
      this.a1[i] = 2 * r * Math.cos(od * k); this.a2[i] = r * r;
      const b = (k * r * Math.sin(od * k)) / od; // response to a unit force impulse (unit modal mass)
      this.w[i] = d.w[i]; this.bw[i] = b * d.w[i]; comp += b * d.w[i] * d.w[i];
      this.pk[i] = d.pk[i]; this.bp[i] = b * d.pk[i];
    }
    this.comp = comp; // strike-point compliance over one step: Σ b w²
    this.hammer = d.hammer;
    this.keyDown = true; this.damped = false; this.killing = false; this.dead = false;
    this.hammerOn = false; this.quiet = 0; this.peak = 0;
    this.yMin = 0; this.yMax = 0; this.contactSamples = 0; this.Fmax = 0;
    this.setDamper(eng.damperSigma);
  }

  setDamper(sd) {
    const k = this.k;
    for (let i = 0; i < this.N; i++) {
      const sig = this.sig[i] + (this.killing ? KILL : sd * this.dw[i]), om = this.om[i];
      const r = Math.exp(-sig * k), od = Math.sqrt(Math.max(om * om - sig * sig, 1e-6));
      this.a1d[i] = 2 * r * Math.cos(od * k); this.a2d[i] = r * r;
    }
  }
  updateDamping(eng) { this.damped = this.killing || (!this.keyDown && !eng.sustain); }
  kill(eng) { this.killing = true; this.setDamper(eng.damperSigma); this.damped = true; }

  // Launch the hammer from just below the reed's current position at speed v.
  strike(v) {
    const k = this.k;
    let u = 0;
    for (let i = 0; i < this.N; i++) u += this.w[i] * this.q[i];
    this.eta = u - 1.5 * v * k; this.etaPrev = this.eta - v * k;
    this.dPrev = -1; this.dPrev2 = -1; this.hammerOn = true; this.hammerSamples = 0; this.contact = false;
    this.contactSamples = 0; this.Fmax = 0;
    this.kOverM = (k * k) / this.hammer.mass;
    this.halfAlpha = this.hammer.alpha / (2 * k); // centred difference for d(δ^p)/dt
    this.yMin = 0; this.yMax = 0;
  }

  // Felt force F = K δ^p + K α d(δ^p)/dt (δ = felt compression, F ≥ 0), solved
  // implicitly with the reed's and the hammer's response in the same step.
  // The elastic part is the discrete gradient of V = K δ^(p+1)/(p+1),
  //   Fₙ = [V(δₙ₊₁) − V(δₙ₋₁)] / (δₙ₊₁ − δₙ₋₁),
  // which makes the strike conserve energy exactly (Chatziioannou & van
  // Walstijn 2015); the hysteresis α takes energy out.
  contactForce(dFree) {
    const C = this.comp + this.kOverM, d0 = this.dPrev2, h = this.hammer;
    this.fd0 = d0; this.fV0 = d0 > 0 ? (h.K * d0 ** (h.p + 1)) / (h.p + 1) : 0; this.fP0 = d0 > 0 ? d0 ** h.p : 0;
    this.dPrev2 = this.dPrev;
    if (dFree <= 0 && d0 <= 0) { this.dPrev = dFree; return 0; }
    // g(D) = D + C F(D) − dFree is increasing; the root lies in [dFree − C F(dFree), dFree]
    let hi = dFree, lo = dFree - C * this.felt(dFree) - 1e-15, D = 0.5 * (lo + hi);
    for (let it = 0; it < 60; it++) {
      const F = this.felt(D), g = D + C * F - dFree;
      if (g > 0) hi = D; else lo = D;
      if (hi - lo <= 1e-13 * (Math.abs(dFree) + 1e-9)) break;
      const e = 1e-9 * (Math.abs(D) + 1e-9), dg = 1 + (C * (this.felt(D + e) - F)) / e;
      let Dn = D - g / dg;
      if (!(Dn > lo && Dn < hi)) Dn = 0.5 * (lo + hi);
      D = Dn;
    }
    this.dPrev = D;
    return this.felt(D);
  }
  // the felt's force for a compression D at the next step (previous-but-one step in fd0, fV0, fP0)
  felt(D) {
    const { K, p } = this.hammer, Dp = D > 0 ? D ** p : 0, dd = D - this.fd0;
    const el = Math.abs(dd) > 1e-15 ? ((D > 0 ? (K * Dp * D) / (p + 1) : 0) - this.fV0) / dd : K * Dp;
    const f = el + K * this.halfAlpha * (Dp - this.fP0);
    return f > 0 ? f : 0;
  }

  // Adds this reed's capacitance change δC(t) = C(y₀ + y) − C(y₀) (farads) to buf.
  render(buf, n, eng) {
    const N = this.N, q = this.q, q1 = this.q1, PK = this.pk, BP = this.bp;
    const A1 = this.damped ? this.a1d : this.a1, A2 = this.damped ? this.a2d : this.a2;
    const T = eng.cap, c = T.c, ty0 = T.y0, idy = 1 / T.dy, xmax = T.n - 3 - 1e-9;
    const y0 = eng.y0, cRest = eng.cRest, dRest = eng.dRest, kF = eng.kF;
    let peak = 0, yMin = this.yMin, yMax = this.yMax;
    for (let s = 0; s < n; s++) {
      let y = 0;
      if (!this.hammerOn) {
        for (let i = 0; i < N; i++) {
          const q0 = q[i], qn = A1[i] * q0 - A2[i] * q1[i];
          q1[i] = q0; q[i] = qn; y += PK[i] * qn;
        }
      } else {
        const W = this.w, BW = this.bw;
        let uf = 0;
        for (let i = 0; i < N; i++) {
          const q0 = q[i], qn = A1[i] * q0 - A2[i] * q1[i];
          q1[i] = q0; q[i] = qn; uf += W[i] * qn;
        }
        const etaF = 2 * this.eta - this.etaPrev;
        const F = this.contactForce(etaF - uf);
        this.etaPrev = this.eta; this.eta = etaF - this.kOverM * F;
        if (F > 0) {
          for (let i = 0; i < N; i++) q[i] += BW[i] * F;
          this.contact = true; this.contactSamples++;
          if (F > this.Fmax) this.Fmax = F;
        }
        for (let i = 0; i < N; i++) y += PK[i] * q[i];
        if (++this.hammerSamples > eng.hammerMax || (this.contact && F === 0 && this.dPrev < -2e-4)) this.hammerOn = false;
      }
      if (y < yMin) yMin = y; else if (y > yMax) yMax = y;
      // the slot: C(y₀ + y) and dC/dy by Catmull–Rom on the Laplace table
      let x = (y0 + y - ty0) * idy;
      if (x < 1) x = 1; else if (x > xmax) x = xmax;
      const j = x | 0, f = x - j, p0 = c[j - 1], p1 = c[j], p2 = c[j + 1], p3 = c[j + 2];
      const b1 = 0.5 * (p2 - p0), b2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3, b3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);
      const dC = ((b3 * f + b2) * f + b1) * f + p1 - cRest;
      buf[s] += dC;
      // the field pulls the reed toward higher C: F = ½V² dC/dy (static part balanced at rest)
      const Fe = kF * (((3 * b3 * f + 2 * b2) * f + b1) * idy - dRest);
      for (let i = 0; i < N; i++) q[i] += BP[i] * Fe;
      const a = y < 0 ? -y : y;
      if (a > peak) peak = a;
    }
    this.yMin = yMin; this.yMax = yMax; this.peak = peak;
    if (!(peak < 0.05)) { this.dead = true; return; } // 5 cm: numerically blown up
    if (!this.hammerOn) {
      this.quiet = peak < (this.damped ? 3e-8 : 3e-9) ? this.quiet + 1 : 0;
      if (this.quiet > 40) this.dead = true;
    }
  }
}

export class ReedEngine {
  constructor(fs) {
    this.fs = fs; this.fs2 = OS * fs;
    this.P = null; this.voices = []; this.byKey = new Map(); this.sustain = false;
    this.models = new Map();
    this.hammerMax = Math.round(HAMMER_MAX * this.fs2);
    this.damperSigma = LOSS.damper; this.maxVoices = 32;
    this.mono = new Float64Array(128 * OS * 8);
    // decimator: Blackman-windowed sinc, cutoff at the output Nyquist
    const T = 47, h = new Float64Array(T);
    let sum = 0;
    for (let i = 0; i < T; i++) {
      const m = i - (T - 1) / 2, x = TAU * 0.23 * m;
      h[i] = (m === 0 ? 1 : Math.sin(x) / x) * (0.42 - 0.5 * Math.cos((TAU * i) / (T - 1)) + 0.08 * Math.cos((2 * TAU * i) / (T - 1)));
      sum += h[i];
    }
    for (let i = 0; i < T; i++) h[i] /= sum;
    this.fir = h; this.T = T; this.hist = new Float64Array(64); this.hi = 0;
    // pickup node, tremolo photocell, preamp
    this.u = 0; this.xPrev = 0; this.ldr = 0; this.tremPhase = 0;
    this.dc = new DCBlock(12, fs);
    this.spk = [new Biquad(), new Biquad(), new Biquad(), new Biquad()];
    this.spkHP1 = { a: 0, x1: 0, y1: 0 };
  }

  setParams(P) {
    const old = this.P;
    this.P = P;
    const k = 1 / this.fs2;
    if (!old || old.gap !== P.gap) this.cap = capCurve(P.gap);
    if (!old || old.gap !== P.gap || old.offset !== P.offset) {
      this.y0 = P.offset * 1e-3;
      const c = this.cap, x = Math.min(Math.max((this.y0 - c.y0) / c.dy, 1), c.n - 3 - 1e-9), j = x | 0, f = x - j;
      const p0 = c.c[j - 1], p1 = c.c[j], p2 = c.c[j + 1], p3 = c.c[j + 2];
      const b1 = 0.5 * (p2 - p0), b2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3, b3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);
      this.cRest = ((b3 * f + b2) * f + b1) * f + p1;
      this.dRest = ((3 * b3 * f + 2 * b2) * f + b1) / c.dy;
    }
    this.kF = 0.5 * P.bias * P.bias;
    // comb node: exact update for δC linear within a step
    const node = pickupNode(P), A = Math.exp(-k / node.tau);
    this.nodeA = A; this.nodeB = -node.gain * (node.tau / k) * (1 - A);
    // preamp: gain, then a stage that clips softly and asymmetrically
    this.drive = 0.25 * 16 ** P.drive;
    this.tremInc = P.tremRate / this.fs2;
    // photocell: fast to light up, slow to go dark (CdS)
    this.ldrOn = 1 - Math.exp(-k / 0.004); this.ldrOff = 1 - Math.exp(-k / 0.035);
    // speaker: two 4"×8" ovals on the open-backed lid
    const fs = this.fs;
    this.spk[0].set('hp', 130, 0.9, fs);           // cone resonance (suspension + moving mass)
    this.spk[1].set('peak', 2600, 2.2, fs, 6);       // cone break-up
    this.spk[2].set('lp', 6000, 0.8, fs);            // voice-coil inductance, cone mass
    this.spk[3].set('peak', 900, 1.0, fs, -2.5);     // dip between the lid's baffle step and break-up
    this.spkHP1.a = Math.exp((-TAU * 280) / fs);     // open back: front–rear cancellation below ~c/2d
    if (old && (old.solder !== P.solder || old.strike !== P.strike || old.hardness !== P.hardness)) this.models.clear();
  }

  model(key) {
    let m = this.models.get(key);
    if (!m) { m = keyModel(key, this.P, this.fs2).voice; this.models.set(key, m); }
    return m;
  }

  setSustain(on) { this.sustain = !!on; for (const v of this.voices) v.updateDamping(this); }

  noteOn(key, velocity, data) {
    if (!this.P) return;
    const d = data || this.model(key);
    let v = this.byKey.get(key);
    if (!v || v.dead || v.killing || (data && v.version !== data.version) || (!data && v.data !== d)) {
      if (v && !v.dead) { v.keyDown = false; v.updateDamping(this); }
      v = new Voice(this, key, d); v.data = d;
      this.voices.push(v); this.byKey.set(key, v);
    }
    v.keyDown = true; v.updateDamping(this);
    v.strike(hammerSpeed(velocity));
    if (this.voices.length > this.maxVoices) {
      let victim = null, score = Infinity;
      for (const u of this.voices) if (u !== v && !u.killing && u.peak < score) { score = u.peak; victim = u; }
      if (victim) victim.kill(this);
    }
  }
  noteOff(key) { const v = this.byKey.get(key); if (v) { v.keyDown = false; v.updateDamping(this); } }
  allNotesOff() { for (const v of this.voices) v.kill(this); }
  voiceCount() { return this.voices.length; }

  process(L, R, n) {
    const n2 = n * OS, mono = this.mono, P = this.P;
    mono.fill(0, 0, n2);
    if (P) for (const v of this.voices) v.render(mono, n2, this);
    let j = 0;
    for (const v of this.voices) {
      if (v.dead) { if (this.byKey.get(v.key) === v) this.byKey.delete(v.key); } else this.voices[j++] = v;
    }
    this.voices.length = j;
    if (!P) { L.fill(0, 0, n); R.fill(0, 0, n); return; }

    const hist = this.hist, fir = this.fir, T = this.T, A = this.nodeA, B = this.nodeB;
    const gain = PREAMP.gain, D = this.drive, iD = 1 / D, depth = P.tremDepth, inc = this.tremInc;
    const speaker = P.output === 'speaker', s0 = this.spk[0], s1 = this.spk[1], s2 = this.spk[2], s3 = this.spk[3], hp = this.spkHP1;
    let u = this.u, xPrev = this.xPrev, ldr = this.ldr, ph = this.tremPhase, hi = this.hi;
    for (let s = 0; s < n2; s++) {
      // comb node voltage (AC part), v′ = −v/τ − (V_b/C0) δC′
      const x = mono[s];
      u = A * u + B * (x - xPrev); xPrev = x;
      // tremolo: the oscillator lights an LED on its positive half-cycles; the
      // photocell beside it shunts the preamp's signal as it lights up
      ph += inc; if (ph >= 1) ph -= 1;
      const led = depth * Math.max(0, Math.sin(TAU * ph));
      ldr += (led > ldr ? this.ldrOn : this.ldrOff) * (led - ldr);
      let v = (gain * u) / (1 + 3 * ldr);
      // preamp stage: transistor runs out of swing sooner on one side
      v *= D;
      v = v > 0 ? 1.6 * Math.tanh(v / 1.6) : 1.1 * Math.tanh(v / 1.1);
      v *= iD;
      hi = (hi + 1) & 63; hist[hi] = v;
      if (s & 1) {
        let a = 0;
        for (let t = 0; t < T; t++) a += fir[t] * hist[(hi - t) & 63];
        let o = this.dc.run(a);
        if (speaker) {
          const yh = hp.a * (hp.y1 + o - hp.x1); hp.x1 = o; hp.y1 = yh;
          o = s3.run(s2.run(s1.run(s0.run(yh))));
        }
        L[s >> 1] = OUT * o;
      }
    }
    this.u = u; this.xPrev = xPrev; this.ldr = ldr; this.tremPhase = ph; this.hi = hi;
    for (let i = 0; i < n; i++) R[i] = L[i];
  }
}

// One strike of one reed, sample by sample at the engine's internal rate,
// for the page's views and the tests (not real time). Records the tip height
// y, the capacitance change δC, the comb voltage v (through the R·C0 node),
// the modal coordinates for the first nFrames samples, and the hammer.
export function traceStrike(data, P, velocity, fs, seconds, nFrames = 0) {
  const e = new ReedEngine(fs);
  e.setParams(P);
  const v = new Voice(e, data.key, data), N = v.N, n = Math.round(seconds * e.fs2);
  v.strike(hammerSpeed(velocity));
  const y = new Float32Array(n), dC = new Float32Array(n), volt = new Float32Array(n);
  const q = new Float32Array(nFrames * N), eta = new Float32Array(nFrames);
  const one = new Float64Array(1);
  const amps = new Float64Array(N), k = 1 / e.fs2;
  let u = 0, xp = 0, release = -1;
  for (let s = 0; s < n; s++) {
    one[0] = 0;
    const was = v.hammerOn;
    v.render(one, 1, e);
    if (was && !v.hammerOn) {
      // each mode's amplitude at the slot as the hammer leaves, from two successive samples
      release = s;
      for (let i = 0; i < N; i++) {
        const c = Math.cos(v.om[i] * k), a = v.q[i], b = v.q1[i];
        amps[i] = Math.abs(v.pk[i]) * Math.sqrt(Math.max(0, a * a - 2 * c * a * b + b * b)) / Math.sin(v.om[i] * k);
      }
    }
    let yy = 0;
    for (let i = 0; i < N; i++) yy += v.pk[i] * v.q[i];
    y[s] = yy; dC[s] = one[0];
    u = e.nodeA * u + e.nodeB * (one[0] - xp); xp = one[0]; volt[s] = u;
    if (s < nFrames) { q.set(v.q, s * N); eta[s] = v.hammerOn ? v.eta : NaN; }
  }
  return { fs2: e.fs2, n, N, y, dC, volt, q, eta, nFrames, release, amps, contactMs: (v.contactSamples / e.fs2) * 1000, Fmax: v.Fmax };
}

globalThis.ReedEngine = ReedEngine;
