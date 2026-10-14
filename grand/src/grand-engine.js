// grand-engine.js — real-time electric grand. Runs in the AudioWorklet
// (through shared/worklet.js) and in Node (tests, renders).
//
// Each sounding key is a Voice: every partial of every unison string in both
// polarisations, as exactly discretised damped oscillators, coupled through
// the bridge. Within one polarisation (V or H) the bridge is a rank-one
// damping matrix u uᵀ shared by every mode (grand-model.js), solved implicitly
// with a centred bridge velocity, S = Σ uⱼ (qⱼ[n+1] − qⱼ[n−1]):
//
//   q[n+1] = a1 q[n] − a2 q[n−1] − u S + bh F,   S (1 + Σ u²) = Σ u (free − q[n−1])
//
// (Sherman–Morrison: one scalar per polarisation per sample, no matrix).
// For a mode alone this is (1 + β) q[n+1] = a1 q[n] − (a2 − β) q[n−1] with
// β = u²; β and a1 are chosen so its two poles sit exactly at
// e^{(−σ_int − σ_b ± iω_d) k}: every partial drains into the bridge at its
// model rate σ_b = G (T + EI k²)/L, up to the top of the band, and in-phase
// unisons drain N times as fast (Weinreich). Within a block the −u S
// correction is applied lazily (folded into the next sample), so the bridge
// costs no more per mode than an explicit one.
//
// The modes of a partial's unison strings sit side by side, lowest partial
// first, and a voice stops integrating its top partials once they have died
// below −140 dBFS (until it is struck again): the cost follows what sounds.
//
// The hammer is a mass on a nonlinear hysteretic felt, F = K[δ^p + α d(δ^p)/dt]₊,
// solved implicitly each sample by a scalar Newton iteration (as in
// piano/src/engine.js), together with the bridge. The piezo hears the bridge
// force F = Σ b q of both polarisations (V fully, H by the pickup ratio). The
// vertical force also drives the soundboard, when there is one: a bank of
// plate modes heard by two far-field microphones, plus the residual path of
// the plate's modes above its modal band.
//
// Output chain: piezo charge → RC high-pass (piezo capacitance against the
// preamp's input resistance) → bass / mid / treble EQ; then the blend with the
// soundboard microphones.

import { TAU, Biquad, keyPan } from '../../shared/dsp.js';
import { keyModel, boardModel, hammerSpeed, pickupTrim, SEGMENTS, RES_BANDS, RES_Q, KEY_LO, KEY_HI } from './grand-model.js';

const OUT = 0.012;          // bridge force (N) → full-scale audio
const MAXBL = 4096;         // largest block process() accepts
const KILL_SIGMA = 250;     // s⁻¹, fast fade for stolen / panicked / re-struck voices
const REPEAT = 0.06;        // s: the action needs this long to return the hammer for another blow
const DROP = 1e-7;          // a top partial falling below this (output units, −140 dB) stops being integrated
export const MODE_BUDGET = 4000; // oscillators across all voices (default; the page may lower it)
export const C_PIEZO = 10e-9; // F, capacitance of the piezo elements
export const EQ = { bass: 120, mid: 1000, midQ: 0.8, treble: 3500 }; // Hz

// Physics parameters: a change rebuilds the key models (new notes only).
const PHYS = ['scale', 'stringing', 'detune', 'stiffness', 'loss', 'mount', 'gFrame', 'boardH', 'tilt', 'hRatio', 'kH', 'hardness', 'strike', 'maxFreq', 'stretch'];

// First-order analog section (b1 s + b0)/(a1 s + a0), bilinear with prewarping at fw.
class RC1 {
  constructor() { this.B0 = 1; this.B1 = 0; this.A1 = 0; this.x1 = 0; this.y1 = 0; }
  set(b1, b0, a1, a0, fw, fs) {
    const w = TAU * Math.min(fw, 0.45 * fs), K = w / Math.tan(w / (2 * fs)), A0 = a1 * K + a0;
    this.B0 = (b1 * K + b0) / A0; this.B1 = (b0 - b1 * K) / A0; this.A1 = (a0 - a1 * K) / A0;
    return this;
  }
  highpass(f, fs) { return this.set(1, 0, 1, TAU * f, f, fs); }
  // shelves of gain g (linear): boost (s + gω)/(s + ω), cut its mirror image
  lowShelf(f, g, fs) { const w = TAU * f; return g >= 1 ? this.set(1, g * w, 1, w, f, fs) : this.set(1, w, 1, w / g, f, fs); }
  highShelf(f, g, fs) { const w = TAU * f; return g >= 1 ? this.set(g, w, 1, w, f, fs) : this.set(1, w, 1 / g, w, f, fs); }
  run(x) { const y = this.B0 * x + this.B1 * this.x1 - this.A1 * this.y1; this.x1 = x; this.y1 = y; return y; }
}

class Voice {
  constructor(eng, key, d) {
    const N = d.n, nV = d.nV, k = 1 / eng.fs;
    this.key = key; this.k = k; this.N = N; this.nV = nV; this.version = eng.version; this.data = d;
    const F = () => new Float64Array(N);
    this.q = F(); this.q1 = F(); this.a1 = F(); this.a2 = F(); this.a1d = F(); this.a2d = F();
    this.h = F(); this.bh = F(); this.u = F(); this.beta = F(); this.bf = F(); this.om = F(); this.sig = F(); this.dmp = F();
    let comp = 0;
    for (let i = 0; i < N; i++) {
      const om = TAU * d.freq[i], sig = d.sigma[i], sb = 0.5 * d.c[i] * d.c[i]; // σ_b = c²/2 = G(T + EIk²)/L
      this.om[i] = om; this.sig[i] = sig; this.dmp[i] = d.damp[i];
      const r = Math.exp(-sig * k), od = Math.sqrt(Math.max(om * om - sig * sig, 1e-6));
      const b = (k * r * Math.sin(od * k)) / od; // impulse-invariant input gain
      this.h[i] = d.w[i]; this.bh[i] = b * d.w[i]; comp += b * d.w[i] * d.w[i];
      const a2 = r * r, R2 = Math.exp(-2 * (sig + sb) * k), beta = (a2 - R2) / (1 + R2);
      this.beta[i] = beta; this.u[i] = (d.c[i] < 0 ? -1 : 1) * Math.sqrt(beta);
      this.bf[i] = d.bf[i];
    }
    this.comp0 = comp; this.ns = d.ns; this.nVa = nV; this.nHa = N - nV; // active modes: [0, nVa) and [nV, nV + nHa)
    this.bridgeSums();
    this.coef(this.a1, this.a2, null, 0);
    this.hammer = d.hammer; this.seg = d.seg; this.hasDamper = d.hasDamper;
    [this.panL, this.panR] = keyPan(key, 0.5, KEY_LO, KEY_HI);
    this.trim = pickupTrim(key); this.dropThr = DROP / (OUT * this.trim);
    this.keyDown = true; this.damped = false; this.killing = false; this.dead = false;
    this.hammerOn = false; this.peak = 0; this.quiet = 0; this.age = 0; this.struck = -Infinity;
    this.eta = 0; this.F = 0; this.FV = 0; this.FH = 0; this.Fmax = 0; this.contactSamples = 0;
    this.setDamper(eng.P.damper);
  }

  // Per polarisation (V, H), over the active modes: Σ u², and the sums that tie
  // the bridge to the output (y = Σ bf q), to the hammer point (Σ h q) and to
  // the hammer's force (Σ u bh).
  bridgeSums() {
    const nV = this.nV, U = this.u, S = [0, 0, 0, 0, 0, 0, 0, 0];
    const add = (i0, i1, o) => { for (let i = i0; i < i1; i++) { const u = U[i]; S[o] += this.beta[i]; S[2 + o] += this.bf[i] * u; S[4 + o] += this.h[i] * u; S[6 + o] += u * this.bh[i]; } };
    add(0, this.nVa, 0); add(nV, nV + this.nHa, 1);
    this.invV = 1 / (1 + S[0]); this.invH = 1 / (1 + S[1]);
    this.kapV = S[2]; this.kapH = S[3]; this.swV = S[4]; this.swH = S[5]; this.rhoV = S[6]; this.rhoH = S[7];
    this.comp = this.comp0 - this.swV * this.rhoV * this.invV - this.swH * this.rhoH * this.invH; // compliance under the hammer, bridge included
  }
  get active() { return this.nVa + this.nHa; }

  // Stop integrating the top partials (all unison strings of each) once their
  // share of the bridge force has fallen below DROP: a few per block. A
  // dropped mode, even at rest, still yields to the bridge within each step,
  // so Σ u² keeps it (it is mostly the stiff top partials'); only the output
  // correction Σ bf u follows the modes still summed.
  quietTop(i1) { // is the partial whose strings end at i1 below the threshold? If so, clear it
    const q = this.q, q1 = this.q1, BF = this.bf, i0 = i1 - this.ns;
    let c = 0;
    for (let i = i0; i < i1; i++) c += Math.abs(BF[i]) * (Math.abs(q[i]) + Math.abs(q1[i]));
    if (c >= this.dropThr) return false;
    for (let i = i0; i < i1; i++) q[i] = q1[i] = 0;
    return true;
  }
  dropTop() {
    const BF = this.bf, U = this.u, ns = this.ns;
    let n = 0;
    while (n < 4 && this.nVa > ns && this.quietTop(this.nVa)) { this.nVa -= ns; n++; }
    while (n < 8 && this.nHa > 0 && this.quietTop(this.nV + this.nHa)) { this.nHa -= ns; n++; }
    if (n) {
      let kV = 0, kH = 0;
      for (let i = 0; i < this.nVa; i++) kV += BF[i] * U[i];
      for (let i = this.nV; i < this.nV + this.nHa; i++) kH += BF[i] * U[i];
      this.kapV = kV; this.kapH = kH;
    }
  }

  // Recursion coefficients with an extra decay rate (the damper or the kill) on
  // top of the string's own: a2 = e^{−2σk}; a1 places the poles, with the
  // bridge's β, at the exact damped frequency.
  coef(A1, A2, extra, sd) {
    const k = this.k;
    for (let i = 0; i < this.N; i++) {
      const sig = this.sig[i] + (extra === null ? 0 : extra ? KILL_SIGMA : sd * this.dmp[i]), om = this.om[i], beta = this.beta[i];
      const a2 = Math.exp(-2 * sig * k), R2 = (a2 - beta) / (1 + beta), R = Math.sqrt(R2), st = -Math.log(R) / k;
      A1[i] = 2 * R * (1 + beta) * Math.cos(Math.sqrt(Math.max(om * om - st * st, 1e-6)) * k); A2[i] = a2;
    }
  }
  setDamper(sd) { this.coef(this.a1d, this.a2d, this.killing, sd); this.damperSigma = sd; }
  updateDamping(eng) { this.damped = this.killing || (!this.keyDown && !eng.sustain && this.hasDamper); }
  kill() { if (this.killing) return; this.killing = true; this.setDamper(this.damperSigma); this.damped = true; }

  // Launch the hammer at speed v (m/s) from where the string is now (re-strikes work).
  strike(v) {
    const k = this.k;
    let u = 0;
    for (let i = 0; i < this.N; i++) u += this.h[i] * this.q[i];
    if (this.nVa < this.nV || this.nHa < this.N - this.nV) { this.nVa = this.nV; this.nHa = this.N - this.nV; this.bridgeSums(); }
    this.eta = u - 1.5 * v * k; this.etaPrev = this.eta - v * k;
    this.dPrev = -1; this.hammerOn = true; this.hammerSamples = 0; this.contact = false;
    this.contactSamples = 0; this.Fmax = 0; this.v0 = v; this.struck = this.age;
    this.kOverM = (k * k) / this.hammer.mass;
    this.alphaK = this.hammer.alpha / k;
  }

  // Solve D + C·F(D) = dFree for the felt compression D one step ahead.
  contactForce(dFree) {
    const h = this.hammer, p = h.p, K = h.K, a = this.alphaK, C = this.comp + this.kOverM;
    const dp = this.dPrev > 0 ? Math.pow(this.dPrev, p) : 0;
    if (dFree <= 0) { this.dPrev = dFree; return 0; }
    let lo = 0, hi = dFree, D = dFree;
    for (let it = 0; it < 50; it++) {
      const Dp = Math.pow(D, p), fr = (1 + a) * Dp - a * dp;
      const g = D + C * (fr > 0 ? K * fr : 0) - dFree;
      if (Math.abs(g) <= 1e-12 * dFree) break;
      if (g > 0) hi = D; else lo = D;
      const dg = 1 + (fr > 0 && D > 0 ? (C * K * (1 + a) * p * Dp) / D : 0);
      let Dn = D - g / dg;
      if (!(Dn > lo && Dn < hi)) Dn = 0.5 * (lo + hi);
      D = Dn;
    }
    const fr = (1 + a) * Math.pow(D, p) - a * dp;
    this.dPrev = D;
    return fr > 0 ? K * fr : 0;
  }

  // One sample of the hammer phase: the free step of every mode, then the
  // contact and the two bridge sums together (q holds the actual state here).
  hammerStep(A1, A2, eng) {
    const N = this.N, nV = this.nV, q = this.q, q1 = this.q1, U = this.u, H = this.h, BH = this.bh, BF = this.bf;
    let aV = 0, aH = 0, uf = 0;
    for (let i = 0; i < nV; i++) {
      const q0 = q[i], qm = q1[i], f = A1[i] * q0 - A2[i] * qm;
      aV += U[i] * (f - qm); uf += H[i] * f; q1[i] = q0; q[i] = f;
    }
    for (let i = nV; i < N; i++) {
      const q0 = q[i], qm = q1[i], f = A1[i] * q0 - A2[i] * qm;
      aH += U[i] * (f - qm); uf += H[i] * f; q1[i] = q0; q[i] = f;
    }
    const sV0 = aV * this.invV, sH0 = aH * this.invH;
    const etaF = 2 * this.eta - this.etaPrev;
    const F = this.contactForce(etaF - (uf - this.swV * sV0 - this.swH * sH0));
    this.etaPrev = this.eta; this.eta = etaF - this.kOverM * F;
    const sV = sV0 + F * this.rhoV * this.invV, sH = sH0 + F * this.rhoH * this.invH;
    let fv = 0, fh = 0;
    for (let i = 0; i < nV; i++) { const x = q[i] - U[i] * sV + BH[i] * F; q[i] = x; fv += BF[i] * x; }
    for (let i = nV; i < N; i++) { const x = q[i] - U[i] * sH + BH[i] * F; q[i] = x; fh += BF[i] * x; }
    if (F > 0) {
      this.contact = true; this.contactSamples++;
      if (F > this.Fmax) this.Fmax = F;
    }
    this.F = F; this.FV = fv; this.FH = fh;
    this.hammerSamples++;
    if (this.hammerSamples > eng.hammerMax || (this.contact && F === 0 && this.dPrev < -2e-3)) this.hammerOn = false;
  }

  // Add this voice's piezo signal (panned) and its vertical bridge force (for the board).
  render(PL, PR, SEG, n, eng) {
    const nV = this.nV, nVa = this.nVa, h1 = nV + this.nHa, q = this.q, q1 = this.q1, U = this.u, BF = this.bf;
    const A1 = this.damped ? this.a1d : this.a1, A2 = this.damped ? this.a2d : this.a2;
    const gH = eng.P.pickH, pl = this.panL * this.trim * OUT, pr = this.panR * this.trim * OUT, so = this.seg * MAXBL;
    const invV = this.invV, invH = this.invH, kV = this.kapV, kH = this.kapH;
    // sv, sh: this sample's bridge sums, whose −u S correction to q is still pending
    let sv = 0, sh = 0, peak = 0, fv = 0, fh = 0;
    for (let s = 0; s < n; s++) {
      if (this.hammerOn) {
        this.hammerStep(A1, A2, eng);
        fv = this.FV; fh = this.FH;
      } else {
        let a = 0, y = 0;
        for (let i = 0; i < nVa; i++) {
          const qa = q[i] - U[i] * sv, qm = q1[i], f = A1[i] * qa - A2[i] * qm;
          a += U[i] * (f - qm); y += BF[i] * f;
          q1[i] = qa; q[i] = f;
        }
        sv = a * invV; fv = y - kV * sv;
        a = 0; y = 0;
        for (let i = nV; i < h1; i++) {
          const qa = q[i] - U[i] * sh, qm = q1[i], f = A1[i] * qa - A2[i] * qm;
          a += U[i] * (f - qm); y += BF[i] * f;
          q1[i] = qa; q[i] = f;
        }
        sh = a * invH; fh = y - kH * sh;
      }
      const y = fv + gH * fh;
      PL[s] += pl * y; PR[s] += pr * y;
      SEG[so + s] += fv;
      const ay = (y < 0 ? -y : y) * OUT;
      if (ay > peak) peak = ay;
    }
    // apply the pending correction, so q is the actual state between blocks
    if (sv !== 0) for (let i = 0; i < nVa; i++) q[i] -= U[i] * sv;
    if (sh !== 0) for (let i = nV; i < h1; i++) q[i] -= U[i] * sh;
    this.FV = fv; this.FH = fh;
    this.peak = peak; this.age += n;
    if (!(peak < 1e3)) { this.dead = true; if (eng.post) eng.post({ type: 'error', message: 'numerical instability', key: this.key }); return; }
    if (!this.hammerOn) {
      this.dropTop();
      this.quiet = peak < (this.damped ? 1e-5 : 2e-6) ? this.quiet + 1 : 0;
      if (this.quiet > 40) this.dead = true;
    }
  }
}

// The soundboard: a bank of plate modes driven by the vertical bridge force at
// three points, heard as acceleration × Rayleigh radiation gain at two mics,
// plus the residual path of the modes above BOARD.fmax (grand-model.js).
class Board {
  constructor(B, fs) {
    const K = B.K, k = 1 / fs;
    this.B = B; this.K = K;
    this.e0 = new Float64Array(K); this.e1 = new Float64Array(K);
    this.a1 = new Float64Array(K); this.a2 = new Float64Array(K);
    this.ph = new Float64Array(K * SEGMENTS); this.rl = new Float64Array(K); this.rr = new Float64Array(K);
    const g = B.micGain * fs * fs; // second difference → acceleration
    for (let i = 0; i < K; i++) {
      const om = B.omega[i], sig = B.sigma[i], r = Math.exp(-sig * k), od = Math.sqrt(om * om - sig * sig);
      this.a1[i] = 2 * r * Math.cos(od * k); this.a2[i] = r * r;
      const b = (k * r * Math.sin(od * k)) / od;
      for (let s = 0; s < SEGMENTS; s++) this.ph[i * SEGMENTS + s] = b * B.phi[i * SEGMENTS + s];
      this.rl[i] = g * B.RL[i]; this.rr[i] = g * B.RR[i];
    }
    this.lpG = 1 - Math.exp((-TAU * B.fBridge) / fs); // bridge mass: one-pole low-pass on the force
    this.lp = new Float64Array(SEGMENTS);
    // residual path: per band, a band-pass for each mic, fed by the segments' forces; then
    // a 4th-order high-pass at the modal band's edge per mic
    this.res = Float64Array.from(B.res, (x) => x * B.micGain);
    this.rf = Array.from({ length: 4 * RES_BANDS }, (_, i) => new Biquad().set('bp', B.resF[i >> 2], RES_Q, fs)); // [band][mic][stage]
    this.rh = Array.from({ length: 4 }, () => new Biquad().set('hp', B.fRes, Math.SQRT1_2, fs));
    this.quiet = 0;
  }
  // SEG holds the bridge force per segment; writes OUT-scaled mic signals into ML, MR.
  run(SEG, ML, MR, n, active) {
    const K = this.K, e0 = this.e0, e1 = this.e1, A1 = this.a1, A2 = this.a2, PH = this.ph, RL = this.rl, RR = this.rr, lp = this.lp, g = this.lpG;
    const rs = this.res, rf = this.rf, h0 = this.rh[0], h1 = this.rh[1], h2 = this.rh[2], h3 = this.rh[3];
    if (!active && this.quiet > 400) { ML.fill(0, 0, n); MR.fill(0, 0, n); return; }
    let peak = 0;
    for (let s = 0; s < n; s++) {
      const f0 = (lp[0] += g * (SEG[s] - lp[0])), f1 = (lp[1] += g * (SEG[MAXBL + s] - lp[1])), f2 = (lp[2] += g * (SEG[2 * MAXBL + s] - lp[2]));
      let mL = 0, mR = 0;
      for (let k = 0, o = 0; k < RES_BANDS; k++, o += 6) {
        mL += rf[4 * k + 1].run(rf[4 * k].run(rs[o] * f0 + rs[o + 2] * f1 + rs[o + 4] * f2));
        mR += rf[4 * k + 3].run(rf[4 * k + 2].run(rs[o + 1] * f0 + rs[o + 3] * f1 + rs[o + 5] * f2));
      }
      mL = h1.run(h0.run(mL)); mR = h3.run(h2.run(mR));
      for (let i = 0, j = 0; i < K; i++, j += 3) {
        const x0 = e0[i], x1 = e1[i];
        const xn = A1[i] * x0 - A2[i] * x1 + PH[j] * f0 + PH[j + 1] * f1 + PH[j + 2] * f2;
        const acc = xn - 2 * x0 + x1;
        e1[i] = x0; e0[i] = xn;
        mL += RL[i] * acc; mR += RR[i] * acc;
      }
      ML[s] = mL * OUT; MR[s] = mR * OUT;
      const a = mL < 0 ? -mL : mL;
      if (a > peak) peak = a;
    }
    this.quiet = peak * OUT < 1e-7 ? this.quiet + 1 : 0;
    if (this.quiet > 400) { e0.fill(0); e1.fill(0); lp.fill(0); for (const f of rf) f.reset(); for (const f of this.rh) f.reset(); }
  }
}

export class GrandEngine {
  constructor(fs) {
    this.fs = fs;
    this.P = null;
    this.voices = []; this.byKey = new Map(); this.sustain = false;
    this.cache = new Map(); this.version = 0; this.physSig = '';
    this.boards = new Map(); this.board = null; this.boardModel = null;
    this.hammerMax = Math.round(0.08 * fs);
    this.repeat = Math.round(REPEAT * fs);
    this.maxModes = MODE_BUDGET;
    this.pL = new Float64Array(MAXBL); this.pR = new Float64Array(MAXBL);
    this.mL = new Float64Array(MAXBL); this.mR = new Float64Array(MAXBL);
    this.seg = new Float64Array(SEGMENTS * MAXBL);
    this.hp = [new RC1(), new RC1()]; this.lo = [new RC1(), new RC1()]; this.hi = [new RC1(), new RC1()];
    this.mid = [new Biquad(), new Biquad()];
    this.mix = 0;
  }

  setParams(P) {
    const old = this.P;
    this.P = P;
    const sig = PHYS.map((id) => P[id]).join('|');
    if (sig !== this.physSig) { this.physSig = sig; this.cache.clear(); this.version++; }
    if (P.mount === 'board') {
      const key = String(P.boardH);
      if (!this.boards.has(key)) {
        if (this.boards.size > 4) this.boards.clear();
        const B = boardModel(P);
        this.boards.set(key, { B, filter: new Board(B, this.fs) });
      }
      const b = this.boards.get(key);
      this.boardModel = b.B; this.board = b.filter;
    } else { this.boardModel = null; this.board = null; }
    this.mix = P.mount === 'board' ? P.listen : 0;
    if (!old || old.damper !== P.damper) for (const v of this.voices) v.setDamper(P.damper);
    const fs = this.fs;
    for (let c = 0; c < 2; c++) {
      this.hp[c].highpass(1 / (TAU * P.rIn * 1e3 * C_PIEZO), fs);
      this.lo[c].lowShelf(EQ.bass, 10 ** (P.bass / 20), fs);
      this.mid[c].set('peak', EQ.mid, EQ.midQ, fs, P.mid);
      this.hi[c].highShelf(EQ.treble, 10 ** (P.treble / 20), fs);
    }
  }

  // { type: 'budget', modes }: the page lowers (or restores) the oscillator
  // budget when the audio thread runs hot (grand-main.js measures the load).
  handle(m) {
    if (m.type === 'budget' && Number.isFinite(m.modes)) {
      this.maxModes = Math.min(MODE_BUDGET, Math.max(600, Math.round(m.modes)));
      this.enforceBudget(null);
    }
  }

  model(key) {
    let d = this.cache.get(key);
    if (!d) { d = keyModel(key, this.P, this.boardModel, this.fs); this.cache.set(key, d); }
    return d;
  }

  noteOn(key, velocity) {
    if (!this.P || key < KEY_LO || key > KEY_HI) return null;
    let v = this.byKey.get(key);
    // the action has not yet brought the hammer back for another blow
    if (v && !v.dead && !v.killing && v.age - v.struck < this.repeat) { v.keyDown = true; v.updateDamping(this); return v; }
    if (!v || v.dead || v.killing || v.version !== this.version) {
      // the same strings, struck again after a physics knob moved: the old voice fades out fast
      if (v && !v.dead) v.kill();
      v = new Voice(this, key, this.model(key));
      this.voices.push(v); this.byKey.set(key, v);
    }
    v.keyDown = true; v.updateDamping(this);
    v.strike(hammerSpeed(velocity));
    this.enforceBudget(v);
    return v;
  }
  noteOff(key) { const v = this.byKey.get(key); if (v) { v.keyDown = false; v.updateDamping(this); } }
  setSustain(on) { this.sustain = !!on; for (const v of this.voices) v.updateDamping(this); }
  allNotesOff() { for (const v of this.voices) v.kill(); }
  voiceCount() { return this.voices.length; }

  // Keep the total oscillator count within budget: fade out the quietest, oldest voices.
  enforceBudget(keep) {
    let total = 0;
    for (const v of this.voices) if (!v.killing) total += v.active;
    while (total > this.maxModes) {
      let victim = null, score = Infinity;
      for (const v of this.voices) {
        if (v === keep || v.killing) continue;
        const s = (v.peak * (v.damped ? 0.1 : 1)) / (1 + v.age / this.fs);
        if (s < score) { score = s; victim = v; }
      }
      if (!victim) break;
      victim.kill(); total -= victim.active;
    }
  }

  process(L, R, n) {
    const pL = this.pL, pR = this.pR, SEG = this.seg, vs = this.voices;
    pL.fill(0, 0, n); pR.fill(0, 0, n);
    for (let s = 0; s < SEGMENTS; s++) SEG.fill(0, s * MAXBL, s * MAXBL + n);
    if (this.P) for (let i = 0; i < vs.length; i++) vs[i].render(pL, pR, SEG, n, this);
    const board = this.board, mix = this.mix;
    if (board) board.run(SEG, this.mL, this.mR, n, vs.length > 0);
    const hpL = this.hp[0], hpR = this.hp[1], loL = this.lo[0], loR = this.lo[1], miL = this.mid[0], miR = this.mid[1], hiL = this.hi[0], hiR = this.hi[1];
    const gp = 1 - mix, mL = this.mL, mR = this.mR;
    for (let s = 0; s < n; s++) {
      const l = hiL.run(miL.run(loL.run(hpL.run(pL[s])))), r = hiR.run(miR.run(loR.run(hpR.run(pR[s]))));
      L[s] = gp * l + (board ? mix * mL[s] : 0);
      R[s] = gp * r + (board ? mix * mR[s] : 0);
    }
    let j = 0;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (v.dead) { if (this.byKey.get(v.key) === v) this.byKey.delete(v.key); } else vs[j++] = v;
    }
    vs.length = j;
  }
}

globalThis.GrandEngine = GrandEngine;
