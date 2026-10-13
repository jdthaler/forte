// rhodes-engine.js — real-time tine piano: coupled tine/tone-bar modes, felt
// or neoprene hammer, nonlinear electromagnetic pickup, harp wiring, suitcase
// tremolo, amp drive, speaker. Runs in the AudioWorklet and in Node.
//
// The voices run 2× oversampled, because the pickup's nonlinearity makes
// harmonics far above the tine's own partials. The sum is decimated with a
// windowed-sinc FIR.

const TAU = 2 * Math.PI;
const OS = 2;
const OUT_SCALE = 3.6e-4;

export const RHODES_ENGINE_DEFAULTS = {
  damper: 35, cable: 1000, resQ: 2,
  tremRate: 4, tremDepth: 0, drive: 0.15, tone: 6000, master: 1,
  maxVoices: 40,
};

class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; }
  set(type, f, Q, fs) {
    const w = (TAU * Math.min(f, 0.45 * fs)) / fs, c = Math.cos(w), al = Math.sin(w) / (2 * Q), a0 = 1 + al;
    if (type === 'lp') { this.b0 = (1 - c) / 2 / a0; this.b1 = (1 - c) / a0; this.b2 = this.b0; }
    else { this.b0 = (1 + c) / 2 / a0; this.b1 = -(1 + c) / a0; this.b2 = this.b0; }
    this.a1 = (-2 * c) / a0; this.a2 = (1 - al) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

class Voice {
  constructor(eng, key, d) {
    const N = d.n, k = 1 / eng.fs2;
    this.k = k; this.key = key; this.version = d.version; this.N = N;
    const F = () => new Float64Array(N);
    this.q = F(); this.q1 = F(); this.a1 = F(); this.a2 = F(); this.a1d = F(); this.a2d = F();
    this.w = F(); this.bw = F(); this.pk = F(); this.om = F(); this.sig = F(); this.dw = F();
    let comp = 0;
    for (let i = 0; i < N; i++) {
      const om = TAU * d.freq[i], sig = d.sigma[i];
      this.om[i] = om; this.sig[i] = sig; this.dw[i] = d.dampW[i];
      const r = Math.exp(-sig * k), od = Math.sqrt(Math.max(om * om - sig * sig, 1e-6));
      this.a1[i] = 2 * r * Math.cos(od * k); this.a2[i] = r * r;
      const b = (k * r * Math.sin(od * k)) / od;
      this.w[i] = d.w[i]; this.bw[i] = b * d.w[i]; comp += b * d.w[i] * d.w[i];
      this.pk[i] = d.pk[i];
    }
    this.comp = comp;
    this.hammer = d.hammer;
    this.wid = d.pickup.wid; this.yoff = d.pickup.yoff; this.gain = d.pickup.gain;
    this.phiPrev = this.flux(this.yoff);
    this.hasDamper = d.hasDamper;
    this.keyDown = true; this.damped = false; this.killing = false; this.dead = false;
    this.hammerOn = false; this.contactSamples = 0; this.Fmax = 0; this.peak = 0; this.quiet = 0; this.age = 0;
    this.yMin = 0; this.yMax = 0;
    this.setDamper(eng.p.damper);
  }

  flux(Y) { const z = 1 + (Y / this.wid) ** 2; return 1 / (z * Math.sqrt(z)); }

  setDamper(sd) {
    const k = this.k;
    for (let i = 0; i < this.N; i++) {
      const sig = this.sig[i] + (this.killing ? 300 : sd * this.dw[i]), om = this.om[i];
      const r = Math.exp(-sig * k), od = Math.sqrt(Math.max(om * om - sig * sig, 1e-6));
      this.a1d[i] = 2 * r * Math.cos(od * k); this.a2d[i] = r * r;
    }
    this.damperSigma = sd;
  }

  updateDamping(eng) { this.damped = this.killing || (!this.keyDown && !eng.sustain && this.hasDamper); }
  kill() { this.killing = true; this.setDamper(this.damperSigma); this.damped = true; }

  strike(v) {
    const k = this.k;
    let u = 0;
    for (let i = 0; i < this.N; i++) u += this.w[i] * this.q[i];
    this.eta = u - 1.5 * v * k; this.etaPrev = this.eta - v * k;
    this.dPrev = -1; this.hammerOn = true; this.hammerSamples = 0; this.contact = false;
    this.contactSamples = 0; this.Fmax = 0;
    this.kOverM = (k * k) / this.hammer.mass;
    this.alphaK = this.hammer.alpha / k;
    this.yMin = Infinity; this.yMax = -Infinity;
  }

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

  render(buf, n, eng) {
    const N = this.N, q = this.q, q1 = this.q1, PK = this.pk;
    const A1 = this.damped ? this.a1d : this.a1, A2 = this.damped ? this.a2d : this.a2;
    const g = this.gain * OUT_SCALE * eng.fs2, yoff = this.yoff, iw2 = 1 / (this.wid * this.wid);
    let phiPrev = this.phiPrev, peak = 0, yMin = this.yMin, yMax = this.yMax;
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
        this.hammerSamples++;
        if (this.hammerSamples > eng.hammerMax || (this.contact && F === 0 && this.dPrev < -2e-3)) {
          this.hammerOn = false;
          eng.emit({ type: 'hammer', key: this.key, contactMs: (this.contactSamples / eng.fs2) * 1000, Fmax: this.Fmax });
        }
      }
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
      // pickup: emf ∝ −dΦ/dt of the tip position relative to the pole
      const z = 1 + (y + yoff) * (y + yoff) * iw2;
      const phi = 1 / (z * Math.sqrt(z));
      const out = g * (phiPrev - phi);
      phiPrev = phi;
      buf[s] += out;
      const a = out < 0 ? -out : out;
      if (a > peak) peak = a;
    }
    this.phiPrev = phiPrev; this.yMin = yMin; this.yMax = yMax;
    this.peak = peak; this.age += n;
    if (!(peak < 1e3)) { this.dead = true; eng.emit({ type: 'error', key: this.key, message: 'numerical instability' }); return; }
    if (!this.hammerOn) {
      this.quiet = peak < (this.damped ? 2e-5 : 2e-6) ? this.quiet + 1 : 0;
      if (this.quiet > 60) this.dead = true;
    }
  }

  snapshot(out) { out.set(this.q); return out; }
}

export class RhodesEngine {
  constructor(fs) {
    this.fs = fs; this.fs2 = OS * fs;
    this.p = { ...RHODES_ENGINE_DEFAULTS };
    this.voices = []; this.byKey = new Map(); this.sustain = false;
    this.hammerMax = Math.round(0.05 * this.fs2);
    this.listeners = [];
    this.mono = new Float64Array(4096);
    // decimation FIR: Blackman-windowed sinc, cutoff at the output Nyquist
    const T = 63, h = new Float64Array(T), c = 0.25;
    let sum = 0;
    for (let i = 0; i < T; i++) {
      const m = i - (T - 1) / 2, x = 2 * Math.PI * c * m;
      const sinc = m === 0 ? 1 : Math.sin(x) / x;
      const win = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (T - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (T - 1));
      h[i] = sinc * win; sum += h[i];
    }
    for (let i = 0; i < T; i++) h[i] /= sum;
    this.fir = h; this.T = T;
    this.histL = new Float64Array(128); this.histR = new Float64Array(128); this.hi = 0;
    this.harp = new Biquad();
    this.hpL = new Biquad(); this.hpR = new Biquad(); this.lpL = new Biquad(); this.lpR = new Biquad();
    this.tremPhase = 0;
    this.updateFilters();
  }

  emit(ev) { for (const f of this.listeners) f(ev); }

  updateFilters() {
    const p = this.p;
    // harp: ~1 H of pickup coils against the cable capacitance → resonant low-pass
    const fRes = 1 / (TAU * Math.sqrt(1.0 * p.cable * 1e-12));
    this.harp.set('lp', fRes, p.resQ, this.fs2);
    this.hpL.set('hp', 70, 0.7, this.fs); this.hpR.set('hp', 70, 0.7, this.fs);
    this.lpL.set('lp', p.tone, 0.7, this.fs); this.lpR.set('lp', p.tone, 0.7, this.fs);
    // power-amp saturation: unity small-signal gain, a little make-up when pushed
    this.driveK = 1 + 10 * p.drive * p.drive;
    this.driveN = (1 + 0.6 * p.drive) / this.driveK;
  }

  setParams(p) {
    const old = this.p;
    this.p = { ...old, ...p };
    if (p.damper !== undefined && p.damper !== old.damper) for (const v of this.voices) v.setDamper(this.p.damper);
    this.updateFilters();
  }

  noteOn(key, data, velocity) {
    let v = this.byKey.get(key);
    if (!v || v.dead || v.killing || v.version !== data.version) {
      if (v && !v.dead) { v.keyDown = false; v.updateDamping(this); }
      v = new Voice(this, key, data);
      this.voices.push(v); this.byKey.set(key, v);
    }
    v.keyDown = true; v.updateDamping(this); v.strike(velocity);
    if (this.voices.length > this.p.maxVoices) {
      let victim = null, score = Infinity;
      for (const u of this.voices) if (u !== v && !u.killing && u.peak < score) { score = u.peak; victim = u; }
      if (victim) victim.kill();
    }
    return v;
  }
  noteOff(key) { const v = this.byKey.get(key); if (v) { v.keyDown = false; v.updateDamping(this); } }
  setSustain(on) { this.sustain = !!on; for (const v of this.voices) v.updateDamping(this); }
  allNotesOff() { for (const v of this.voices) v.kill(); }

  process(L, R, n) {
    const n2 = n * OS, mono = this.mono, p = this.p;
    mono.fill(0, 0, n2);
    for (const v of this.voices) v.render(mono, n2, this);
    let j = 0;
    for (const v of this.voices) {
      if (v.dead) { if (this.byKey.get(v.key) === v) this.byKey.delete(v.key); } else this.voices[j++] = v;
    }
    this.voices.length = j;

    const hL = this.histL, hR = this.histR, fir = this.fir, T = this.T;
    const tremInc = p.tremRate / this.fs2, depth = p.tremDepth, dk = this.driveK, dn = this.driveN, drive = p.drive > 0;
    for (let s = 0; s < n2; s++) {
      let x = this.harp.run(mono[s]);
      // suitcase "vibrato": an opto-coupled stereo auto-pan
      this.tremPhase += tremInc;
      if (this.tremPhase >= 1) this.tremPhase -= 1;
      const lfo = Math.sin(TAU * this.tremPhase);
      let l = x * (1 - depth * 0.5 * (1 + lfo)), r = x * (1 - depth * 0.5 * (1 - lfo));
      if (drive) { l = Math.tanh(dk * l) * dn; r = Math.tanh(dk * r) * dn; }
      this.hi = (this.hi + 1) & 127;
      hL[this.hi] = l; hR[this.hi] = r;
      if (s & 1) {
        let al = 0, ar = 0;
        for (let t = 0; t < T; t++) { const idx = (this.hi - t) & 127; al += fir[t] * hL[idx]; ar += fir[t] * hR[idx]; }
        const o = s >> 1;
        L[o] = this.lpL.run(this.hpL.run(al)) * p.master;
        R[o] = this.lpR.run(this.hpR.run(ar)) * p.master;
      }
    }
  }
}

globalThis.RhodesEngine = RhodesEngine;
