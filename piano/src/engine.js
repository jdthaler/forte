// engine.js — real-time modal synthesis of hammered strings.
//
// Runs inside the AudioWorklet (loaded with addModule, exposed on globalThis)
// and in Node for tests / offline renders. No Web Audio dependencies here.
//
// Each sounding key is a Voice: all modes of all unison strings and all
// motion families of that key, integrated sample by sample:
//
//   q[n+1] = a1 q[n] − a2 q[n−1] + b·f[n]          (exact for a damped mode)
//   f      = −c_v S_v − c_h S_h   (resistive bridge: S = Σ c q̇ is the bridge
//                                   velocity channel shared by every mode)
//          +  w F                 (felt hammer, only while it is in flight)
//
// The hammer is a mass on a nonlinear hysteretic felt spring,
//   F = K [δ^p + α d(δ^p)/dt]₊,  δ = η − Σ w q,
// solved implicitly each sample (scalar Newton) so stiff felt stays stable.
//
// For speed, modes are stored in four contiguous segments according to which
// bridge channels they touch: V only | H only | V and H | torsion (output only).
//
// Una corda (soft pedal) shifts the action so each hammer misses one string of
// its unison: the struck strings share the blow, and the third (or second) is
// driven only through the bridge.
//
// Engine contract: shared/worklet.js. noteOn's data is the key's voice data
// (piano-instrument.js noteData); the engine keeps the last one sent per key,
// so the page sends it only when it changes. Hammer and instability events go
// to the page through this.post (set by shared/worklet.js; absent in Node).

const TWO_PI = 2 * Math.PI;
const OUT_SCALE = 24; // bridge velocity → full-scale audio
const SMOOTH_T = 0.01; // s: one-pole glide of live gains and pan (no zipper noise)
const MAXB = 256;      // render in chunks of at most this many samples

export const ENGINE_DEFAULTS = {
  gainV: 1, gainH: 0.35, gainT: 0.6, master: 1,
  damper: 25,      // s⁻¹ extra decay when a damper rests on the string
  width: 0.6,      // stereo spread across the keyboard
  maxModes: 4500,  // CPU budget (total oscillators across all voices)
  unaCorda: false, // soft pedal: each hammer strikes one string fewer
};

const KILL_SIGMA = 250;

class Voice {
  constructor(eng, key, d) {
    const N = d.n, k = eng.k;
    this.k = k;
    this.key = key;
    this.version = d.version;
    this.N = N;
    const nu = d.unisons || 1, una = nu > 1 ? nu / (nu - 1) : 1;

    // order modes by segment; perm[i] = index in the incoming data
    const seg = (j) => (d.ct[j] !== 0 ? 3 : d.cv[j] !== 0 && d.ch[j] !== 0 ? 2 : d.ch[j] !== 0 ? 1 : 0);
    const perm = new Uint32Array(N);
    const ends = [0, 0, 0, 0];
    let p = 0;
    for (let s = 0; s < 4; s++) {
      for (let j = 0; j < N; j++) if (seg(j) === s) perm[p++] = j;
      ends[s] = p;
    }
    this.perm = perm;
    [this.e0, this.e1, this.e2] = ends;

    const F = () => new Float64Array(N);
    this.q = F(); this.q1 = F();
    this.a1 = F(); this.a2 = F(); this.a1d = F(); this.a2d = F();
    this.wN = F(); this.bwN = F(); this.wU = F(); this.bwU = F(); this.fbv = F(); this.fbh = F();
    this.cvk = F(); this.chk = F(); this.ctk = F();
    this.om = F(); this.sig = F();
    let comp = 0, compU = 0;
    for (let i = 0; i < N; i++) {
      const j = perm[i];
      const om = TWO_PI * d.freq[j];
      // The bridge feeds back the previous sample's bridge velocity through the
      // impulse-invariant gain b, which damps each mode by only r·sinc(ωk)·c²/2
      // (9 % short at 5.7 kHz). The shortfall goes into the mode's own, exactly
      // discretised decay, so its bridge loss is c²/2 at every frequency while
      // the explicit loop (and its stability) stays as it was.
      const c2 = d.cv[j] * d.cv[j] + d.ch[j] * d.ch[j];
      const r0 = Math.exp(-d.sigma[j] * k), th = Math.sqrt(Math.max(om * om - d.sigma[j] ** 2, 1e-6)) * k;
      const sig = d.sigma[j] + 0.5 * c2 * (1 - (r0 * Math.sin(th)) / th);
      this.om[i] = om; this.sig[i] = sig;
      const r = Math.exp(-sig * k);
      const od = Math.sqrt(Math.max(om * om - sig * sig, 1e-6));
      this.a1[i] = 2 * r * Math.cos(od * k);
      this.a2[i] = r * r;
      const b = (k * r * Math.sin(od * k)) / od; // impulse-invariant input gain
      this.wN[i] = d.w[j];
      this.bwN[i] = b * d.w[j];
      comp += b * d.w[j] * d.w[j];
      // una corda: the last string of the unison is missed, the others share the blow
      const wu = nu > 1 && d.uni[j] === nu - 1 ? 0 : d.w[j] * una;
      this.wU[i] = wu;
      this.bwU[i] = b * wu;
      compU += b * wu * wu;
      this.fbv[i] = b * d.cv[j];
      this.fbh[i] = b * d.ch[j];
      this.cvk[i] = d.cv[j] / k;
      this.chk[i] = d.ch[j] / k;
      this.ctk[i] = d.ct[j] / k;
    }
    this.compN = comp; this.compU = compU;
    this.hammer = d.hammer;
    // the felt touches one string fewer, so its contact stiffness drops by (ν−1)/ν
    this.KU = d.hammer.K / una;
    this.w = this.wN; this.bw = this.bwN; this.comp = comp; this.hK = d.hammer.K;
    this.outV = d.outV * OUT_SCALE;
    this.outH = d.outH * OUT_SCALE;
    this.hasDamper = d.hasDamper;
    this.sv = 0; this.sh = 0;
    this.keyDown = true;
    this.damped = false;
    this.killing = false;
    this.dead = false;
    this.hammerOn = false;
    this.contactSamples = 0;
    this.Fmax = 0;
    this.peak = 0;
    this.quiet = 0;
    this.age = 0;
    this.damperSigma = eng.p.damper;
    this.computeDamped();
    this.setPan(eng, true);
  }

  setDamperSigma(sd) {
    this.damperSigma = sd;
    this.computeDamped();
  }

  computeDamped() {
    const N = this.N, k = this.k;
    const extra = this.killing ? KILL_SIGMA : this.damperSigma;
    for (let i = 0; i < N; i++) {
      const sig = this.sig[i] + extra, om = this.om[i];
      const r = Math.exp(-sig * k);
      const od = Math.sqrt(Math.max(om * om - sig * sig, 1e-6));
      this.a1d[i] = 2 * r * Math.cos(od * k);
      this.a2d[i] = r * r;
    }
  }

  // A new voice starts at its pan; a width change glides there (see render).
  setPan(eng, snap = false) {
    const x = Math.max(-1, Math.min(1, ((this.key - 64.5) / 43.5) * eng.p.width));
    const ang = ((x + 1) * Math.PI) / 4;
    this.tPanL = Math.cos(ang) * Math.SQRT2;
    this.tPanR = Math.sin(ang) * Math.SQRT2;
    if (snap) { this.panL = this.tPanL; this.panR = this.tPanR; }
    this.panMoving = this.panL !== this.tPanL || this.panR !== this.tPanR;
  }

  updateDamping(eng) {
    this.damped = this.killing || (!this.keyDown && !eng.sustain && this.hasDamper);
  }

  kill() {
    if (this.killing) return;
    this.killing = true;
    this.computeDamped();
    this.damped = true;
  }

  // Launch the hammer at the string's current position (works for re-strikes).
  // unaCorda: the shifted action strikes one string fewer.
  strike(v, unaCorda = false) {
    const k = this.k;
    const una = unaCorda && this.KU !== this.hammer.K;
    this.w = una ? this.wU : this.wN;
    this.bw = una ? this.bwU : this.bwN;
    this.comp = una ? this.compU : this.compN;
    this.hK = una ? this.KU : this.hammer.K;
    let u = 0;
    for (let i = 0; i < this.N; i++) u += this.w[i] * this.q[i];
    this.eta = u - 1.5 * v * k;
    this.etaPrev = this.eta - v * k;
    this.dPrev = -1;
    this.hammerOn = true;
    this.hammerSamples = 0;
    this.contact = false;
    this.contactSamples = 0;
    this.Fmax = 0;
    this.kOverM = (k * k) / this.hammer.mass;
    this.alphaK = this.hammer.alpha / k;
  }

  // Solve D + C·F(D) = dFree for the felt compression D one step ahead.
  contactForce(dFree) {
    const h = this.hammer, p = h.p, K = this.hK, a = this.alphaK;
    const C = this.comp + this.kOverM;
    const dp = this.dPrev > 0 ? Math.pow(this.dPrev, p) : 0;
    if (dFree <= 0) { this.dPrev = dFree; return 0; }
    let lo = 0, hi = dFree, D = dFree;
    for (let it = 0; it < 50; it++) {
      const Dp = Math.pow(D, p);
      const fr = (1 + a) * Dp - a * dp;
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

  // Add n samples to L, R starting at off. eng.gV/gH/gT hold the (smoothed)
  // output gains for these samples.
  render(L, R, off, n, eng) {
    const N = this.N, e0 = this.e0, e1 = this.e1, e2 = this.e2;
    // qa holds q[n], qb q[n−1]; each step writes q[n+1] over q[n−1], then they swap
    let qa = this.q, qb = this.q1;
    const A1 = this.damped ? this.a1d : this.a1, A2 = this.damped ? this.a2d : this.a2;
    const FBV = this.fbv, FBH = this.fbh, CV = this.cvk, CH = this.chk, CT = this.ctk;
    const GV = eng.gV, GH = eng.gH, GT = eng.gT, oV = this.outV, oH = this.outH;
    let pl = this.panL, pr = this.panR;
    const panMoving = this.panMoving, tl = this.tPanL, tr = this.tPanR, aS = eng.aSm;
    let sv = this.sv, sh = this.sh, peak = 0;
    for (let s = 0; s < n; s++) {
      let nsv = 0, nsh = 0, nst = 0;
      if (!this.hammerOn) {
        for (let i = 0; i < e0; i++) {
          const q0 = qa[i], qn = A1[i] * q0 - A2[i] * qb[i] - FBV[i] * sv;
          qb[i] = qn;
          nsv += CV[i] * (qn - q0);
        }
        for (let i = e0; i < e1; i++) {
          const q0 = qa[i], qn = A1[i] * q0 - A2[i] * qb[i] - FBH[i] * sh;
          qb[i] = qn;
          nsh += CH[i] * (qn - q0);
        }
        for (let i = e1; i < e2; i++) {
          const q0 = qa[i], qn = A1[i] * q0 - A2[i] * qb[i] - FBV[i] * sv - FBH[i] * sh;
          qb[i] = qn;
          const dq = qn - q0;
          nsv += CV[i] * dq; nsh += CH[i] * dq;
        }
        for (let i = e2; i < N; i++) {
          const q0 = qa[i], qn = A1[i] * q0 - A2[i] * qb[i];
          qb[i] = qn;
          nst += CT[i] * (qn - q0);
        }
      } else {
        const W = this.w, BW = this.bw;
        let uf = 0;
        for (let i = 0; i < N; i++) {
          const qn = A1[i] * qa[i] - A2[i] * qb[i] - FBV[i] * sv - FBH[i] * sh;
          qb[i] = qn;
          uf += W[i] * qn;
        }
        const etaF = 2 * this.eta - this.etaPrev;
        const F = this.contactForce(etaF - uf);
        this.etaPrev = this.eta;
        this.eta = etaF - this.kOverM * F;
        if (F > 0) {
          for (let i = 0; i < N; i++) qb[i] += BW[i] * F;
          this.contact = true;
          this.contactSamples++;
          if (F > this.Fmax) this.Fmax = F;
        }
        for (let i = 0; i < N; i++) {
          const dq = qb[i] - qa[i];
          nsv += CV[i] * dq; nsh += CH[i] * dq; nst += CT[i] * dq;
        }
        this.hammerSamples++;
        if (this.hammerSamples > eng.hammerMaxSamples || (this.contact && F === 0 && this.dPrev < -2e-3)) {
          this.hammerOn = false;
          eng.emit({ type: 'hammer', key: this.key, contactMs: (this.contactSamples / eng.fs) * 1000, Fmax: this.Fmax });
        }
      }
      const t = qa; qa = qb; qb = t;
      sv = nsv; sh = nsh;
      const y = oV * (GV[s] * nsv + GT[s] * nst) + oH * GH[s] * nsh;
      if (panMoving) { pl += (tl - pl) * aS; pr += (tr - pr) * aS; }
      L[off + s] += pl * y;
      R[off + s] += pr * y;
      const ay = y < 0 ? -y : y;
      if (ay > peak) peak = ay;
    }
    this.q = qa; this.q1 = qb;
    this.sv = sv; this.sh = sh;
    if (panMoving) {
      if (Math.abs(tl - pl) + Math.abs(tr - pr) < 1e-7) { pl = tl; pr = tr; this.panMoving = false; }
      this.panL = pl; this.panR = pr;
    }
    this.peak = peak;
    this.age += n;
    if (!(peak < 1e3)) { // NaN or blow-up: silence this voice
      this.dead = true;
      eng.emit({ type: 'error', key: this.key, message: 'numerical instability' });
      return;
    }
    if (!this.hammerOn) {
      const thr = this.damped ? 1e-4 : 1e-5;
      this.quiet = peak < thr ? this.quiet + 1 : 0;
      if (this.quiet > 30) this.dead = true;
    }
  }

  // Audible amplitude of every mode (incoming data order), for spectra.
  modeAmplitudes(eng) {
    const out = new Float64Array(this.N), k = this.k, p = eng.p;
    const gv = p.gainV * this.outV, gh = p.gainH * this.outH, gt = p.gainT * this.outV;
    for (let i = 0; i < this.N; i++) {
      const vel = (this.q[i] - this.q1[i]) / k;
      const a = Math.hypot(vel, this.om[i] * this.q[i]);
      const c = Math.abs(gv * this.cvk[i] * k) + Math.abs(gh * this.chk[i] * k) + Math.abs(gt * this.ctk[i] * k);
      out[this.perm[i]] = a * c;
    }
    return out;
  }

  // State in the order of the incoming voice data (for visualisation).
  snapshot(out) {
    const perm = this.perm, q = this.q;
    for (let i = 0; i < this.N; i++) out[perm[i]] = q[i];
    return out;
  }
}

export class PianoEngine {
  constructor(fs) {
    this.fs = fs;
    this.k = 1 / fs;
    this.p = { ...ENGINE_DEFAULTS };
    this.voices = [];
    this.byKey = new Map();
    this.sustain = false;
    this.hammerMaxSamples = Math.round(0.08 * fs);
    this.data = new Map(); // key → its latest voice data
    // output gains glide to their targets sample by sample
    this.aSm = 1 - Math.exp(-1 / (SMOOTH_T * fs));
    this.gV = new Float64Array(MAXB); this.gH = new Float64Array(MAXB); this.gT = new Float64Array(MAXB);
    this.snapGains();
    this.overBudget = false;
  }

  emit(ev) { this.post?.(ev); }

  snapGains() {
    const p = this.p;
    this.sV = p.gainV * p.master; this.sH = p.gainH * p.master; this.sT = p.gainT * p.master;
  }

  setParams(p) {
    const old = this.p;
    this.p = { ...old, ...p };
    if (p.damper !== undefined && p.damper !== old.damper) {
      for (const v of this.voices) v.setDamperSigma(this.p.damper);
    }
    if (p.width !== undefined) for (const v of this.voices) v.setPan(this);
    if (!this.voices.length) this.snapGains(); // nothing sounds: no need to glide
  }

  // velocity: hammer speed in m/s (not 0..1). A sounding voice is struck again, unless
  // the key's data has a new version (the model changed): then a new voice starts.
  noteOn(key, velocity, data) {
    if (data) this.data.set(key, data); else data = this.data.get(key);
    if (!data) return;
    let v = this.byKey.get(key);
    if (!v || v.dead || v.killing || v.version !== data.version) {
      if (v && !v.dead) { v.keyDown = false; v.updateDamping(this); }
      v = new Voice(this, key, data);
      this.voices.push(v);
      this.byKey.set(key, v);
    }
    v.keyDown = true;
    v.updateDamping(this);
    v.strike(velocity, !!this.p.unaCorda);
    this.enforceBudget(v);
    return v;
  }

  noteOff(key) {
    const v = this.byKey.get(key);
    if (v) { v.keyDown = false; v.updateDamping(this); }
  }

  setSustain(on) {
    this.sustain = !!on;
    for (const v of this.voices) v.updateDamping(this);
  }

  allNotesOff() {
    for (const v of this.voices) v.kill();
  }

  modeCount() {
    let n = 0;
    for (const v of this.voices) n += v.N;
    return n;
  }

  voiceCount() { return this.voices.length; }
  stats() { return { modes: this.modeCount() }; } // the CPU pill shows the oscillators too

  // Over the oscillator budget: release the quietest voices. A voice whose
  // hammer is still in flight has not been heard yet (its peak is 0), so it is
  // never a victim; if only those remain, try again once they have sounded.
  enforceBudget(keep) {
    let total = 0;
    const vs = this.voices;
    for (let i = 0; i < vs.length; i++) if (!vs[i].killing) total += vs[i].N;
    this.overBudget = false;
    while (total > this.p.maxModes) {
      let victim = null, score = Infinity;
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        if (v === keep || v.killing || v.hammerOn || v.age === 0) continue;
        const s = (v.peak * (v.damped ? 0.1 : 1)) / (1 + v.age * this.k);
        if (s < score) { score = s; victim = v; }
      }
      if (!victim) { this.overBudget = true; break; }
      victim.kill();
      total -= victim.N;
    }
  }

  process(L, R, n) {
    L.fill(0, 0, n);
    R.fill(0, 0, n);
    const vs = this.voices, p = this.p, a = this.aSm;
    const tV = p.gainV * p.master, tH = p.gainH * p.master, tT = p.gainT * p.master;
    const GV = this.gV, GH = this.gH, GT = this.gT;
    for (let off = 0; off < n; off += MAXB) {
      const m = Math.min(MAXB, n - off);
      let sV = this.sV, sH = this.sH, sT = this.sT;
      for (let s = 0; s < m; s++) {
        sV += (tV - sV) * a; sH += (tH - sH) * a; sT += (tT - sT) * a;
        GV[s] = sV; GH[s] = sH; GT[s] = sT;
      }
      if (Math.abs(tV - sV) + Math.abs(tH - sH) + Math.abs(tT - sT) < 1e-9) { sV = tV; sH = tH; sT = tT; }
      this.sV = sV; this.sH = sH; this.sT = sT;
      for (let i = 0; i < vs.length; i++) if (!vs[i].dead) vs[i].render(L, R, off, m, this);
    }
    if (this.overBudget) this.enforceBudget(null);
    let j = 0;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (v.dead) {
        if (this.byKey.get(v.key) === v) this.byKey.delete(v.key);
      } else vs[j++] = v;
    }
    vs.length = j;
  }
}

globalThis.PianoEngine = PianoEngine;
