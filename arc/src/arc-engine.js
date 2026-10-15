// arc-engine.js — the real-time part: Duddell's circuit integrated sample by sample, one
// circuit per arc lamp. Runs in the AudioWorklet (through shared/worklet.js) and in Node.
//
// Each arc: supply E → rheostat R_b → choke L_b → arc ∥ (coil L, R → capacitors the keys
// switch in). The circuit is stiff (a big choke, a small coil, a column that can cool in a
// few microseconds), so it is stepped implicitly at 4× the sample rate (2× above 50 kHz):
// the trapezoidal rule for the coils and capacitors (which keeps the LC resonance exact to
// a fraction of a cent) and the θ-method for the column (trapezoidal, or as L-stable as it
// must be when τ is shorter than the step). The linear circuit is reduced, each step, to a
// Norton source seen by the arc, i_a = J − G_N·u, and the arc's thermal current X is solved
// from it by Newton's method. The radiated pressure is the thermophone's, ∝ dP/dt with
// P = u·i, decimated back to the sample rate through a windowed-sinc low-pass.
//
// Keys close contacts: a contact's resistance falls from the leak resistance to nothing in
// about half a millisecond (closing). When the key comes up the contacts part and a little
// spark absorbs the coil's energy, its resistance growing with their separation (4 Ω per
// millisecond), so the note fades in about 10 ms (opening). Between notes each
// capacitor rests at the arc's voltage through the leak, so a key switches it in without a
// jolt and the note grows out of the arc's own fluctuations at the linear growth rate.

import { arcOp, cond, xEff, wOf, capFor, tuneKey, keyFreq, hissFactor, hissCurrent, pressureGain, SUPPLY, TALK, AYRTON, FLOOR_SHARP } from './arc-model.js';
import { Singer } from './arc-voice.js';

const MAXA = 6;               // arc lamps
const MAXE = 16;              // engaged capacitors per arc (closed + switching)
const R_LEAK = 2000;          // Ω, a resting capacitor's leak (and an open contact's end point)
const T_CLOSE = 5e-5;         // s, contact closing time constant (closed in ≈ 0.5 ms)
const K_OPEN = 4000;          // Ω/s: an opening contact's spark grows in resistance as the contacts part
const I_DROP = 2e-4;          // A, a switching branch is dropped once its current is below this
const R_QUENCH = 50;          // Ω: once the parted contacts' spark is this resistive it goes out at a current zero
const NOISE0 = 6e-5;          // rms conductance flicker of a quiet arc (seeds every note)
const HISS_RMS = 0.008;       // rms conductance noise of a fully hissing arc (× the hiss knob)
const F_NOISE = 4000;         // Hz, corner of the column's fluctuations
const STEAL_AFTER = 0.04;     // s: a note must have sounded this long before it can be stolen
const STEAL_WAIT = 0.014;     // s: a stolen arc's new capacitor waits for the old note to fade (and its spark to go out)
const POST_EVERY = 0.025;     // s, view updates
const TRAIL = 256;            // (i, u) points in the view's loop
const SMOOTH = 0.03;          // s, parameter glides
const NONE = -99;             // no key (−1 is the talking arc's blocking condenser)

class Arc {
  constructor(eng, index, seed) {
    this.eng = eng; this.index = index;
    this.mKey = new Int32Array(MAXE); this.mC = new Float64Array(MAXE); this.nM = 0;
    this.tKey = new Int32Array(MAXE); this.tC = new Float64Array(MAXE); this.tV = new Float64Array(MAXE); this.tI = new Float64Array(MAXE);
    this.tR = new Float64Array(MAXE); this.tDir = new Int8Array(MAXE); this.tY = new Float64Array(MAXE); this.tW = new Float64Array(MAXE); this.nT = 0;
    this.capV = new Float64Array(128).fill(NaN); this.capT = new Float64Array(128);
    this.CB = 0; this.vB = 0; this.ic = 0; this.is = 0; this.X = 1; this.u = 0; this.ia = 0; this.P = 0; this.uDC = 0; this.Imean = 0;
    this.seed = (seed * 2654435761) >>> 0 || 1; this.nf = 0;
    this.gl = Math.SQRT1_2; this.gr = Math.SQRT1_2;
    this.onset = 0; this.released = 0; this.pendKey = NONE; this.pendC = 0; this.pendAt = 0;
    this.stP = 0; this.stI2 = 0; this.stOut = 0; this.stN = 0; this.stUmax = 0; this.amp = 0; this.Pmean = 0; this.out = 0;
    this.trail = new Float32Array(2 * TRAIL); this.ti = 0; this.tcount = 0; this.dec = 1;
  }
  // start from the DC operating point of the present settings
  rest(op) {
    this.is = op.I0; this.X = op.I0; this.u = op.u0; this.ia = op.I0; this.P = op.u0 * op.I0; this.uDC = op.u0; this.Imean = op.I0;
    this.ic = 0; this.vB = op.u0; this.CB = 0; this.nM = 0; this.nT = 0; this.capV.fill(NaN);
  }
  active() { return this.nM > 0 || this.nT > 0 || this.pendKey !== NONE; }
  held() { if (this.nM > 0 || this.pendKey !== NONE) return true; for (let k = 0; k < this.nT; k++) if (this.tDir[k] > 0) return true; return false; }
  has(key) { if (this.pendKey === key) return true; for (let k = 0; k < this.nM; k++) if (this.mKey[k] === key) return true; for (let k = 0; k < this.nT; k++) if (this.tKey[k] === key) return true; return false; }
  holds(key) { if (this.pendKey === key) return true; for (let k = 0; k < this.nM; k++) if (this.mKey[k] === key) return true; for (let k = 0; k < this.nT; k++) if (this.tKey[k] === key && this.tDir[k] > 0) return true; return false; }

  // A key closes its contact: the capacitor (resting at the arc's voltage through the leak) joins.
  engage(key, C) {
    for (let k = 0; k < this.nM; k++) if (this.mKey[k] === key) return;
    for (let k = 0; k < this.nT; k++) if (this.tKey[k] === key) { this.tDir[k] = 1; return; } // re-press while it was opening
    if (this.nT >= MAXE || this.nM + this.nT >= MAXE) return;
    const e = this.eng, k = this.nT++;
    let v = this.uDC;
    if (key >= 0 && key < 128 && !Number.isNaN(this.capV[key])) v = this.uDC + (this.capV[key] - this.uDC) * Math.exp(-(e.time - this.capT[key]) / (e.fs * R_LEAK * C));
    if (this.nM === 0 && this.nT === 1) { this.ic = 0; this.vB = v; } // the branch was open: it starts here
    this.tKey[k] = key; this.tC[k] = C; this.tV[k] = v; this.tI[k] = 0; this.tR[k] = R_LEAK; this.tDir[k] = 1;
  }
  // A key opens its contact: a closed capacitor is split off the bank at the bank's voltage,
  // carrying its share of the bank's current.
  release(key) {
    if (this.pendKey === key) { this.pendKey = NONE; return; }
    for (let k = 0; k < this.nT; k++) if (this.tKey[k] === key && this.tDir[k] > 0) { this.tDir[k] = -1; this.tR[k] = Math.max(this.tR[k], (2 * this.eng.h) / this.tC[k]); return; }
    for (let k = 0; k < this.nM; k++) if (this.mKey[k] === key) {
      const C = this.mC[k];
      let sumI = 0; for (let j = 0; j < this.nT; j++) sumI += this.tI[j];
      const share = this.CB > 0 ? ((this.ic - sumI) * C) / this.CB : 0;
      this.nM--; this.mKey[k] = this.mKey[this.nM]; this.mC[k] = this.mC[this.nM];
      this.CB -= C; if (this.CB < 1e-15 || this.nM === 0) this.CB = 0;
      if (this.nT < MAXE) { const t = this.nT++; this.tKey[t] = key; this.tC[t] = C; this.tV[t] = this.vB; this.tI[t] = share; this.tR[t] = (2 * this.eng.h) / C; this.tDir[t] = -1; }
      return;
    }
  }
  releaseAll() {
    this.pendKey = NONE;
    for (let guard = MAXE; this.nM > 0 && guard > 0; guard--) this.release(this.mKey[this.nM - 1]);
    for (let k = 0; k < this.nT; k++) if (this.tDir[k] > 0) { this.tDir[k] = -1; this.tR[k] = Math.max(this.tR[k], (2 * this.eng.h) / this.tC[k]); }
  }

  // n samples at the base rate; adds the oversampled pressure into eng.osL/osR.
  run(n, emf) {
    const e = this.eng, OS = e.OS, h = e.h, h2 = 0.5 * h, P = e.P;
    const kClose = Math.exp(-h / T_CLOSE), dOpen = K_OPEN * h, kn = e.kNoise, nNorm = e.noiseNorm, quiet = e.quiet;
    const osL = e.osL, osR = e.osR, gl = this.gl, gr = this.gr, watch = this.index === e.focus && !!e.post;
    let is = this.is, ic = this.ic, vB = this.vB, X = this.X, u = this.u, ia = this.ia, Pw = this.P, seed = this.seed, nf = this.nf;
    let stP = 0, stI2 = 0, stOut = 0, stUmax = this.stUmax;
    const kDC = e.kDC, iOut = 0.1 * e.sm.I0; // the arc counts as out while its current has all but stopped
    for (let s = 0; s < n; s++) {
      const E = e.sE[s], Rb = e.sRb[s], A = e.sA[s], B = e.sB[s], Xm = e.sXm[s], del2 = e.sDel2[s], itau = e.sItau[s], th = e.sTh[s];
      const L = e.sL[s], R = e.sR[s], kout = e.sKout[s], sig = quiet ? 0 : e.sSig[s] * nNorm;
      const Lbh = SUPPLY.Lb / h, as = Lbh + 0.5 * Rb, bs = 0.5 / as, Lh = L / h, ac = Lh + 0.5 * R, bc = 0.5 / ac;
      const em0 = emf ? emf[s] : 0, em1 = emf ? (s + 1 < n ? emf[s + 1] : emf[s]) : 0;
      for (let o = 0; o < OS; o++) {
        const e0 = em0 + ((em1 - em0) * o) / OS, e1 = em0 + ((em1 - em0) * (o + 1)) / OS;
        // the column's fluctuations (and the hiss): low-passed white noise on the conductance
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        nf += kn * ((seed | 0) / 2147483648 - nf);
        const nu = 1 + sig * nf;
        // Norton source of the circuit as the arc sees it at the end of the step
        const a_s = (Lbh * is + E - 0.5 * Rb * is - 0.5 * u) / as;
        let J = a_s, GN = bs, act = this.nM > 0 || this.nT > 0, a_c = 0, p = 0, q = 0;
        if (act) {
          a_c = (Lh * ic + 0.5 * (u + e0 + e1 - R * ic - vB)) / ac;
          let sumY = 0, sumYw = 0, sumI = 0;
          for (let k = 0; k < this.nT; k++) {
            const C = this.tC[k];
            let r = this.tDir[k] > 0 ? this.tR[k] * kClose : this.tR[k] + dOpen;
            if (r > R_LEAK) r = R_LEAK;
            this.tR[k] = r;
            const Y = 1 / (r + h2 / C), w = this.tV[k] + (h2 / C) * this.tI[k];
            this.tY[k] = Y; this.tW[k] = w; sumY += Y; sumYw += Y * w; sumI += this.tI[k];
          }
          const CB = this.CB;
          if (CB > 0) { const D = CB + h2 * (bc + sumY); p = (CB * vB + h2 * (ic - sumI + a_c + sumYw)) / D; q = (h2 * bc) / D; }
          else { const D = bc + sumY; p = (a_c + sumYw) / D; q = bc / D; }
          J = a_s - (a_c - bc * p); GN = bs + bc * (1 - q);
        }
        // the column: θ-method in X, Newton (the current through it is J·g/(G_N + g))
        let Fold;
        { const w = (A * X + B) / (A * X + 2 * B); Fold = (w * itau) * ((ia * ia - X * X) / X); }
        let Y = X + h * Fold;
        if (Y < 0.5 * X) Y = 0.5 * X; else if (Y > 2 * X + Xm) Y = 2 * X + Xm;
        let g = 0, iaN = 0;
        for (let it = 0; it < 4; it++) {
          const d = Y - Xm, rr = Math.sqrt(d * d + del2), Xe = 0.5 * (Y + Xm + rr), dXe = 0.5 * (1 + d / rr), den = A * Xe + B;
          const G = (Xe * Xe) / den, dG = G * dXe * (A * Xe + 2 * B) / (Xe * den);
          g = G * nu;
          const S = GN + g; iaN = (g * J) / S;
          const w = (A * Y + B) / (A * Y + 2 * B), dw = (A * B) / ((A * Y + 2 * B) * (A * Y + 2 * B));
          const i2 = iaN * iaN, F = w * itau * ((i2 - Y * Y) / Y);
          const Fx = itau * (dw * ((i2 - Y * Y) / Y) - w * (i2 / (Y * Y) + 1)), Fi = w * itau * ((2 * iaN) / Y);
          const dia = (J * GN * dG * nu) / (S * S);
          const res = Y - X - h * ((1 - th) * Fold + th * F), dres = 1 - h * th * (Fx + Fi * dia);
          let Yn = Y - res / dres;
          if (!(Yn > 0.5 * Y)) Yn = 0.5 * Y; else if (Yn > 2 * Y + Xm) Yn = 2 * Y + Xm;
          const done = Math.abs(Yn - Y) < 1e-9 * (Y + Xm);
          Y = Yn;
          if (done) break;
        }
        if (Y < 1e-3 * Xm) Y = 1e-3 * Xm;
        X = Y;
        { const d = X - Xm, Xe = 0.5 * (X + Xm + Math.sqrt(d * d + del2)); g = ((Xe * Xe) / (A * Xe + B)) * nu; }
        const uN = J / (GN + g);
        iaN = g * uN;
        is = a_s - bs * uN;
        if (act) {
          const vBn = p + q * uN, icN = a_c + bc * (uN - vBn);
          for (let k = 0; k < this.nT; k++) {
            const iN = this.tY[k] * (vBn - this.tW[k]), iO = this.tI[k];
            this.tV[k] += (h2 / this.tC[k]) * (iO + iN); this.tI[k] = iN;
            // an opening contact's spark goes out at a current zero once the contacts have parted
            if (this.tDir[k] < 0 && this.tR[k] >= R_QUENCH && (iN * iO <= 0 || Math.abs(iN) < I_DROP)) this.tDir[k] = -2;
          }
          vB = vBn; ic = icN;
          // contacts: merge a closed one into the bank, drop an open one whose current has died
          for (let k = this.nT - 1; k >= 0; k--) {
            const C = this.tC[k];
            if (this.tDir[k] > 0 && this.tR[k] < (2 * h) / C) {
              if (this.CB > 0) vB = (this.CB * vB + C * this.tV[k]) / (this.CB + C); else vB = this.tV[k];
              this.CB += C; if (this.nM < MAXE) { this.mKey[this.nM] = this.tKey[k]; this.mC[this.nM++] = C; }
              this.removeT(k);
            } else if (this.tDir[k] === -2 || (this.tDir[k] < 0 && this.tR[k] >= R_LEAK && Math.abs(this.tI[k]) < I_DROP)) {
              const key = this.tKey[k];
              if (key >= 0 && key < 128) { this.capV[key] = this.tV[k]; this.capT[key] = e.time + s; }
              this.removeT(k);
            }
          }
          if (this.nM === 0 && this.nT === 0) { ic = 0; this.CB = 0; }
        }
        const Pn = uN * iaN, y = kout * (Pn - Pw);
        Pw = Pn; u = uN; ia = iaN;
        const m = s * OS + o;
        osL[m] += gl * y; osR[m] += gr * y;
        stP += Pn; stI2 += ic * ic; if (Math.abs(iaN) < iOut) stOut++; if (uN > stUmax) stUmax = uN;
        if (watch && ++this.tcount >= this.dec) { this.tcount = 0; this.trail[this.ti] = iaN; this.trail[this.ti + 1] = uN; this.ti = (this.ti + 2) % (2 * TRAIL); }
      }
      this.uDC += kDC * (u - this.uDC); this.Imean += kDC * (is - this.Imean);
    }
    this.is = is; this.ic = ic; this.vB = vB; this.X = X; this.u = u; this.ia = ia; this.P = Pw; this.seed = seed; this.nf = nf;
    this.stP += stP; this.stI2 += stI2; this.stOut += stOut; this.stN += n * OS; this.stUmax = stUmax;
    if (!Number.isFinite(X + u + is + ic + vB)) { this.rest(arcOp(P)); } // never let a blow-up through
  }
  removeT(k) {
    const j = --this.nT;
    this.tKey[k] = this.tKey[j]; this.tC[k] = this.tC[j]; this.tV[k] = this.tV[j]; this.tI[k] = this.tI[j];
    this.tR[k] = this.tR[j]; this.tDir[k] = this.tDir[j]; this.tY[k] = this.tY[j]; this.tW[k] = this.tW[j];
  }
}

export class ArcEngine {
  constructor(fs, seed = 1, opts = {}) {
    this.fs = fs; this.P = null; this.seed = seed; this.quiet = !!opts.quiet;
    this.OS = opts.os ?? (fs <= 50000 ? 4 : fs <= 100000 ? 2 : 1);
    this.h = 1 / (fs * this.OS);
    this.arcs = Array.from({ length: MAXA }, (_, k) => new Arc(this, k, seed * 7919 + k * 104729 + 1));
    this.nArcs = 1; this.mode = 'mono'; this.focus = 0; this.time = 0; this.sincePost = 0;
    this.caps = new Float64Array(128).fill(NaN); this.capsKey = ''; this.table = null;
    this.stack = []; this.singer = new Singer(fs, seed * 31 + 5);
    const B = 128;
    for (const k of ['sE', 'sRb', 'sA', 'sB', 'sXm', 'sDel2', 'sItau', 'sTh', 'sL', 'sR', 'sKout', 'sSig', 'emf']) this[k] = new Float64Array(B);
    this.osL = new Float64Array(B * this.OS); this.osR = new Float64Array(B * this.OS);
    this.kNoise = 1 - Math.exp((-2 * Math.PI * F_NOISE) / (fs * this.OS));
    this.noiseNorm = Math.sqrt((3 * (2 - this.kNoise)) / this.kNoise); // one-pole on uniform noise → unit rms
    this.kS = 1 - Math.exp(-1 / (SMOOTH * fs)); this.kDC = 1 - Math.exp(-1 / (0.02 * fs));
    // decimation: Kaiser-windowed sinc, cutoff ≈ 0.44 fs
    this.firN = this.OS > 1 ? 16 * this.OS : 1;
    this.fir = new Float64Array(this.firN);
    if (this.OS > 1) {
      const N = this.firN, fc = 0.44 / this.OS, beta = 7, I0 = (x) => { let s = 1, t = 1; for (let k = 1; k < 30; k++) { t *= (x / (2 * k)) ** 2; s += t; } return s; };
      let sum = 0;
      for (let k = 0; k < N; k++) {
        const m = k - (N - 1) / 2, sinc = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m), r = (2 * k) / (N - 1) - 1;
        this.fir[k] = sinc * (I0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / I0(beta)); sum += this.fir[k];
      }
      for (let k = 0; k < N; k++) this.fir[k] /= sum;
    }
    this.histL = new Float64Array(2 * this.firN); this.histR = new Float64Array(2 * this.firN); this.hp = 0;
    this.sm = null;
  }

  setParams(P) {
    const old = this.P;
    this.P = P;
    const target = { I0: P.current, l: P.gap, tau: P.tau, rho: P.restrike, L: P.coil * 1e-3, R: P.coilR, dist: P.dist, hiss: P.hiss, voice: P.voice };
    if (!this.sm) {
      this.sm = { ...target };
      const op = arcOp(P);
      for (const a of this.arcs) a.rest(op);
    }
    this.target = target;
    this.op = arcOp(P);
    if (P.table && P.table !== this.table) this.table = P.table;
    const tk = tuneKey(P);
    if (tk !== this.capsKey) { this.capsKey = tk; this.caps.fill(NaN); }
    const nArcs = P.mode === 'poly' ? Math.max(2, Math.min(MAXA, Math.round(P.arcs))) : 1;
    if (!old || old.mode !== P.mode || nArcs !== this.nArcs) this.reconfigure(P.mode, nArcs, !old);
  }
  reconfigure(mode, nArcs, first) {
    for (const a of this.arcs) a.releaseAll();
    this.singer.on = false; this.stack.length = 0;
    const op = arcOp(this.P);
    for (let k = 0; k < MAXA; k++) {
      const a = this.arcs[k];
      if (k >= this.nArcs && k < nArcs && !a.active()) a.rest(op); // an arc lit afresh starts at rest
      if (nArcs > 1) { const x = (k / (nArcs - 1) - 0.5) * 1.2, ang = ((x + 1) * Math.PI) / 4; a.gl = Math.cos(ang); a.gr = Math.sin(ang); }
      else { a.gl = Math.SQRT1_2; a.gr = Math.SQRT1_2; }
    }
    this.mode = mode; this.nArcs = nArcs; this.focus = 0;
    if (mode === 'talk') this.arcs[0].engage(-1, TALK.C); // the transformer's blocking condenser
    void first;
  }

  // capacitor for a key: the page's precomputed table (even a slightly stale one, while a
  // slider moves: the bank stays as it was cut), else computed here and cached
  capOf(key) {
    const t = this.table, i = key - (t?.lo ?? 0);
    if (t && i >= 0 && i < t.caps.length && t.key === this.capsKey) return t.caps[i];
    if (!Number.isNaN(this.caps[key])) return this.caps[key];
    if (t && i >= 0 && i < t.caps.length) return t.caps[i];
    return (this.caps[key] = capFor(key, this.P));
  }

  noteOn(key) {
    if (!this.P) return;
    if (this.mode === 'talk') {
      const i = this.stack.indexOf(key); if (i >= 0) this.stack.splice(i, 1);
      this.stack.push(key); this.singer.f0t = keyFreq(key); if (!this.singer.on || this.singer.env < 0.01) this.singer.f0 = this.singer.f0t;
      this.singer.on = true; return;
    }
    const C = this.capOf(key);
    if (this.mode === 'mono') { const a = this.arcs[0]; if (!a.held()) a.onset = this.time; a.engage(key, C); this.focus = 0; return; }
    // several arcs: the arc that already has this key (re-press), else a free one, else steal
    let a = null;
    for (let k = 0; k < this.nArcs; k++) if (this.arcs[k].has(key)) { a = this.arcs[k]; break; }
    if (!a) {
      let best = null;
      for (let k = 0; k < this.nArcs; k++) {
        const c = this.arcs[k];
        if (c.held()) continue;
        const rank = (c.active() ? 1e12 : 0) + c.released; // silent arcs first, then the longest released
        if (!best || rank < best.rank) best = { c, rank };
      }
      a = best?.c ?? null;
    }
    if (!a) { // steal the longest-held note that has sounded (it fades as its contact opens)
      let best = null;
      for (let k = 0; k < this.nArcs; k++) { const c = this.arcs[k]; if (this.time - c.onset >= STEAL_AFTER * this.fs && (!best || c.onset < best.onset)) best = c; }
      if (!best) return; // every arc has only just started: drop the note rather than cut one off
      // the old note fades as its contact opens; the new capacitor goes in once it has
      best.releaseAll(); best.released = this.time; best.onset = this.time;
      best.pendKey = key; best.pendC = C; best.pendAt = this.time + Math.round(STEAL_WAIT * this.fs);
      this.focus = best.index; return;
    }
    if (!a.held()) a.onset = this.time;
    if (a.pendKey === key) return;
    a.engage(key, C); this.focus = a.index;
  }
  noteOff(key) {
    if (!this.P) return;
    if (this.mode === 'talk') {
      const i = this.stack.indexOf(key); if (i >= 0) this.stack.splice(i, 1);
      if (this.stack.length) this.singer.f0t = keyFreq(this.stack[this.stack.length - 1]); else this.singer.on = false;
      return;
    }
    for (let k = 0; k < this.nArcs; k++) { const a = this.arcs[k]; if (a.holds(key)) { a.release(key); if (!a.held()) a.released = this.time; } }
  }
  allNotesOff() {
    if (this.mode === 'talk') { this.singer.on = false; this.stack.length = 0; return; }
    for (const a of this.arcs) { a.releaseAll(); a.released = this.time; }
  }
  // tests: kick the musical branch of an arc (A)
  kick(amps, k = 0) { this.arcs[k].ic += amps; }
  voiceCount() { let n = 0; for (let k = 0; k < this.nArcs; k++) if (this.arcs[k].active()) n++; return this.mode === 'talk' ? (this.singer.on ? 1 : 0) : n; }

  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    if (!this.P) return;
    for (let s0 = 0; s0 < n; s0 += 128) this.block(L, R, s0, Math.min(128, n - s0));
  }
  block(L, R, s0, n) {
    const P = this.P, sm = this.sm, tg = this.target, k = this.kS, OS = this.OS, talk = this.mode === 'talk';
    // per-sample parameter glides and everything that follows from them
    for (let s = 0; s < n; s++) {
      sm.I0 += k * (tg.I0 - sm.I0); sm.l += k * (tg.l - sm.l); sm.tau += k * (tg.tau - sm.tau); sm.rho += k * (tg.rho - sm.rho);
      sm.L += k * (tg.L - sm.L); sm.R += k * (tg.R - sm.R); sm.dist += k * (tg.dist - sm.dist); sm.hiss += k * (tg.hiss - sm.hiss); sm.voice += k * (tg.voice - sm.voice);
      const A = AYRTON.a + AYRTON.b * sm.l, B = AYRTON.c + AYRTON.d * sm.l, V0 = A + B / sm.I0, Xm = B / (sm.rho * V0 - A);
      const tau = sm.tau * 1e-6, w = (A * sm.I0 + B) / (A * sm.I0 + 2 * B), z = (this.h * 2 * w) / tau;
      this.sA[s] = A; this.sB[s] = B; this.sXm[s] = Xm; this.sDel2[s] = (FLOOR_SHARP * Xm) ** 2; this.sItau[s] = 1 / tau; this.sTh[s] = Math.max(0.5, 1 - 1 / z);
      this.sE[s] = SUPPLY.E; this.sRb[s] = (SUPPLY.E - V0) / sm.I0;
      this.sL[s] = talk ? TALK.L : sm.L; this.sR[s] = talk ? TALK.R : sm.R;
      this.sKout[s] = pressureGain(sm.dist) / this.h;
      const hf = hissFactor(this.arcs[0].Imean, sm.l);
      this.sSig[s] = NOISE0 + HISS_RMS * sm.hiss * hf;
      this.emf[s] = talk ? sm.voice * this.singer.next() : 0;
    }
    const osL = this.osL, osR = this.osR;
    osL.fill(0, 0, n * OS); osR.fill(0, 0, n * OS);
    for (const a of this.arcs) if (a.pendKey !== NONE && this.time >= a.pendAt) { const key = a.pendKey; a.pendKey = NONE; a.engage(key, a.pendC); }
    for (let a = 0; a < MAXA; a++) {
      const arc = this.arcs[a];
      if (a < this.nArcs || arc.active()) {
        if (a === this.focus) arc.dec = this.trailDec(arc);
        arc.run(n, talk && a === 0 ? this.emf : null);
      }
    }
    // decimate
    if (OS === 1) { for (let s = 0; s < n; s++) { L[s0 + s] = osL[s]; R[s0 + s] = osR[s]; } }
    else {
      const N = this.firN, f = this.fir, hL = this.histL, hR = this.histR;
      let hp = this.hp;
      for (let s = 0; s < n; s++) {
        for (let o = 0; o < OS; o++) { const m = s * OS + o; hL[hp] = hL[hp + N] = osL[m]; hR[hp] = hR[hp + N] = osR[m]; hp = hp + 1 === N ? 0 : hp + 1; }
        let yl = 0, yr = 0;
        for (let j = 0; j < N; j++) { yl += f[j] * hL[hp + j]; yr += f[j] * hR[hp + j]; }
        L[s0 + s] = yl; R[s0 + s] = yr;
      }
      this.hp = hp;
    }
    this.time += n;
    this.sincePost += n / this.fs;
    if (this.post && this.sincePost >= POST_EVERY) { this.sincePost = 0; this.report(); }
  }
  // the view's loop shows about two cycles of the sounding note
  trailDec(arc) {
    let C = arc.CB; for (let k = 0; k < arc.nT; k++) if (arc.tDir[k] > 0) C += arc.tC[k];
    const L = this.mode === 'talk' ? TALK.L : this.sm.L;
    if (!(C > 0)) return Math.max(1, Math.round((this.fs * this.OS * 0.01) / TRAIL));
    const f = 1 / (2 * Math.PI * Math.sqrt(L * C));
    return Math.max(1, Math.round((2 * this.fs * this.OS) / (f * TRAIL)));
  }
  report() {
    const arcs = [];
    for (let k = 0; k < this.nArcs; k++) {
      const a = this.arcs[k], N = Math.max(1, a.stN), keys = [];
      for (let j = 0; j < a.nM; j++) keys.push(a.mKey[j]);
      for (let j = 0; j < a.nT; j++) if (a.tDir[j] > 0) keys.push(a.tKey[j]);
      arcs.push({ P: a.stP / N, Iac: Math.sqrt(a.stI2 / N), out: a.stOut / N, umax: a.stUmax, I: a.Imean, u: a.uDC, keys });
      a.stP = 0; a.stI2 = 0; a.stOut = 0; a.stN = 0; a.stUmax = 0;
    }
    const f = this.arcs[this.focus], op = this.op;
    this.post({
      type: 'arc', arcs, focus: this.focus, mode: this.mode,
      trail: f.trail, ti: f.ti, X: f.X, I0: this.sm.I0, u0: op.u0, Xm: op.Xm, Ur: op.Ur,
      hiss: hissFactor(f.Imean, this.sm.l), Ih: hissCurrent(this.sm.l),
      vowel: this.mode === 'talk' && this.singer.on ? this.singer.vowel() : null,
    });
  }
}

globalThis.ArcEngine = ArcEngine;
