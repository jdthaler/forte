// rhodes-engine.js — real-time tine piano: coupled tine/tone-bar modes, felt
// or neoprene hammer, nonlinear electromagnetic pickup, harp wiring, suitcase
// tremolo, amp drive, speaker. Runs in the AudioWorklet and in Node.
//
// The voices run 2× oversampled, because the pickup's nonlinearity makes
// harmonics far above the tine's own partials. The sum is decimated with a
// windowed-sinc FIR.
//
// Live controls glide rather than jump once per block (which clicks): the
// pickup's position, width and voicing per voice, and the harp resonance,
// speaker roll-off, amp drive, vibrato depth and level for the whole output.

import { pickupFor } from './tine.js';

const TAU = 2 * Math.PI;
const OS = 2;
const OUT_SCALE = 3.6e-4;
const MAXN = 2048;        // output samples per internal block (the mix buffer holds OS × this)
const SMOOTH_T = 0.01;    // s: glide of the output-stage controls
// A pickup being moved glides through two one-poles of this time constant, so
// it starts and stops moving smoothly: the flux change through the coil is
// heard as a soft thump (as when a technician moves one), not a click.
const PICKUP_T = 0.01;
const PICKUP_KEYS = ['gap', 'offset', 'poleRadius', 'voicing'];

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

// harp: ~1 H of pickup coils against the cable capacitance → resonant low-pass
const harpHz = (cablePF) => 1 / (TAU * Math.sqrt(1.0 * cablePF * 1e-12));

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
    // the engine's own pickup settings win over the (possibly cached) voice data
    const pu = eng.p.gap !== undefined ? pickupFor(key, eng.p) : d.pickup;
    this.wid = this.wid1 = this.tWid = pu.wid; this.yoff = this.yoff1 = this.tYoff = pu.yoff; this.gain = this.gain1 = this.tGain = pu.gain;
    this.pickupMoving = false;
    this.phiPrev = this.flux(this.yoff);
    this.hasDamper = d.hasDamper;
    this.keyDown = true; this.damped = false; this.killing = false; this.dead = false;
    this.hammerOn = false; this.contactSamples = 0; this.Fmax = 0; this.peak = 0; this.quiet = 0; this.age = 0;
    this.yMin = 0; this.yMax = 0;
    this.setDamper(eng.p.damper);
  }

  flux(Y) { const z = 1 + (Y / this.wid) ** 2; return 1 / (z * Math.sqrt(z)); }

  // move the pickup (gap / voicing / pole) under a sounding note: glide there
  retargetPickup(pu) {
    this.tWid = pu.wid; this.tYoff = pu.yoff; this.tGain = pu.gain;
    this.pickupMoving = this.tWid !== this.wid || this.tYoff !== this.yoff || this.tGain !== this.gain;
  }

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
    const gs = OUT_SCALE * eng.fs2, moving = this.pickupMoving, aP = eng.aPick;
    const tWid = this.tWid, tYoff = this.tYoff, tGain = this.tGain;
    let wid = this.wid, yoff = this.yoff, gain = this.gain, wid1 = this.wid1, yoff1 = this.yoff1, gain1 = this.gain1;
    let g = gain * gs, iw2 = 1 / (wid * wid);
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
      if (moving) {
        wid1 += (tWid - wid1) * aP; yoff1 += (tYoff - yoff1) * aP; gain1 += (tGain - gain1) * aP;
        wid += (wid1 - wid) * aP; yoff += (yoff1 - yoff) * aP; gain += (gain1 - gain) * aP;
        g = gain * gs; iw2 = 1 / (wid * wid);
      }
      // pickup: emf ∝ −dΦ/dt of the tip position relative to the pole
      const z = 1 + (y + yoff) * (y + yoff) * iw2;
      const phi = 1 / (z * Math.sqrt(z));
      const out = g * (phiPrev - phi);
      phiPrev = phi;
      buf[s] += out;
      const a = out < 0 ? -out : out;
      if (a > peak) peak = a;
    }
    if (moving) {
      if (Math.abs(tWid - wid) + Math.abs(tWid - wid1) < 1e-9 * tWid && Math.abs(tYoff - yoff) + Math.abs(tYoff - yoff1) < 1e-9 * tWid
        && Math.abs(tGain - gain) + Math.abs(tGain - gain1) < 1e-9 * tGain) {
        wid = wid1 = tWid; yoff = yoff1 = tYoff; gain = gain1 = tGain; this.pickupMoving = false;
      }
      this.wid = wid; this.yoff = yoff; this.gain = gain; this.wid1 = wid1; this.yoff1 = yoff1; this.gain1 = gain1;
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
    this.mono = new Float64Array(OS * MAXN);
    // decimation FIR: Blackman-windowed sinc, cutoff at the output Nyquist. That
    // is a half-band filter: every tap an even distance from the centre (other
    // than the centre) is exactly zero, and block() skips them.
    const T = 63, h = new Float64Array(T), c = 0.25;
    let sum = 0;
    for (let i = 0; i < T; i++) {
      const m = i - (T - 1) / 2, x = 2 * Math.PI * c * m;
      const sinc = m === 0 ? 1 : m % 2 === 0 ? 0 : Math.sin(x) / x;
      const win = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (T - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (T - 1));
      h[i] = sinc * win; sum += h[i];
    }
    for (let i = 0; i < T; i++) h[i] /= sum;
    this.fir = h; this.T = T;
    this.histL = new Float64Array(128); this.histR = new Float64Array(128); this.hi = 0;
    this.harp = new Biquad();
    this.hpL = new Biquad(); this.hpR = new Biquad(); this.lpL = new Biquad(); this.lpR = new Biquad();
    this.hpL.set('hp', 70, 0.7, fs); this.hpR.set('hp', 70, 0.7, fs);
    this.tremPhase = 0;
    this.aSm = 1 - Math.exp(-1 / (SMOOTH_T * this.fs2));
    this.aPick = 1 - Math.exp(-1 / (PICKUP_T * this.fs2));
    this.overLimit = false;
    this.snapLive();
  }

  emit(ev) { for (const f of this.listeners) f(ev); }

  // Jump the output stage straight to the current settings (nothing sounding).
  snapLive() {
    const p = this.p;
    this.sCable = p.cable; this.sResQ = p.resQ; this.sTone = p.tone;
    this.sDrive = p.drive; this.sDepth = p.tremDepth; this.sMaster = p.master;
    this.harp.set('lp', harpHz(this.sCable), this.sResQ, this.fs2);
    this.lpL.set('lp', this.sTone, 0.7, this.fs); this.lpR.set('lp', this.sTone, 0.7, this.fs);
    this.gliding = false;
  }

  setParams(p) {
    const old = this.p;
    this.p = { ...old, ...p };
    if (p.damper !== undefined && p.damper !== old.damper) for (let i = 0; i < this.voices.length; i++) this.voices[i].setDamper(this.p.damper);
    if (this.p.gap !== undefined && PICKUP_KEYS.some((k) => p[k] !== undefined && p[k] !== old[k])) {
      for (let i = 0; i < this.voices.length; i++) this.voices[i].retargetPickup(pickupFor(this.voices[i].key, this.p));
    }
    if (this.voices.length) this.gliding = true; else this.snapLive();
  }

  noteOn(key, data, velocity) {
    let v = this.byKey.get(key);
    if (!v || v.dead || v.killing || v.version !== data.version) {
      if (v && !v.dead) { v.keyDown = false; v.updateDamping(this); }
      v = new Voice(this, key, data);
      this.voices.push(v); this.byKey.set(key, v);
    }
    v.keyDown = true; v.updateDamping(this); v.strike(velocity);
    this.trimVoices(v);
    return v;
  }

  // Over the voice limit: release the quietest. A voice whose hammer is still
  // in flight has not been heard yet (peak 0), so it is never the victim; if
  // only those are left, try again once they have sounded.
  trimVoices(keep) {
    const vs = this.voices;
    let live = 0;
    for (let i = 0; i < vs.length; i++) if (!vs[i].killing) live++;
    this.overLimit = false;
    while (live > this.p.maxVoices) {
      let victim = null, score = Infinity;
      for (let i = 0; i < vs.length; i++) {
        const u = vs[i];
        if (u !== keep && !u.killing && !u.hammerOn && u.age > 0 && u.peak < score) { score = u.peak; victim = u; }
      }
      if (!victim) { this.overLimit = true; break; }
      victim.kill(); live--;
    }
  }

  noteOff(key) { const v = this.byKey.get(key); if (v) { v.keyDown = false; v.updateDamping(this); } }
  setSustain(on) { this.sustain = !!on; for (let i = 0; i < this.voices.length; i++) this.voices[i].updateDamping(this); }
  allNotesOff() { for (let i = 0; i < this.voices.length; i++) this.voices[i].kill(); }

  process(L, R, n) {
    for (let off = 0; off < n; off += MAXN) this.block(L, R, off, Math.min(MAXN, n - off));
  }

  block(L, R, off, n) {
    const n2 = n * OS, mono = this.mono, p = this.p, vs = this.voices;
    mono.fill(0, 0, n2);
    for (let i = 0; i < vs.length; i++) vs[i].render(mono, n2, this);
    let j = 0;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (v.dead) { if (this.byKey.get(v.key) === v) this.byKey.delete(v.key); } else vs[j++] = v;
    }
    vs.length = j;
    if (this.overLimit) this.trimVoices(null);

    const hL = this.histL, hR = this.histR, fir = this.fir, T = this.T, TC = (T - 1) >> 1; // TC: centre tap
    const tremInc = p.tremRate / this.fs2;
    const gliding = this.gliding, a = this.aSm;
    const tCable = p.cable, tResQ = p.resQ, tTone = p.tone, tDrive = p.drive, tDepth = p.tremDepth, tMaster = p.master;
    let depth = this.sDepth, master = this.sMaster, drive = this.sDrive;
    // power-amp saturation: unity small-signal gain, a little make-up when
    // pushed; below drive 0.02 it fades into a straight wire
    let dk = 1 + 10 * drive * drive, dn = (1 + 0.6 * drive) / dk, dmix = Math.min(1, drive / 0.02);
    for (let s = 0; s < n2; s++) {
      if (gliding) {
        depth += (tDepth - depth) * a; master += (tMaster - master) * a;
        if (drive !== tDrive) {
          drive += (tDrive - drive) * a;
          if (Math.abs(tDrive - drive) < 1e-6) drive = tDrive;
          dk = 1 + 10 * drive * drive; dn = (1 + 0.6 * drive) / dk; dmix = Math.min(1, drive / 0.02);
        }
        if (this.sCable !== tCable || this.sResQ !== tResQ) {
          this.sCable += (tCable - this.sCable) * a; this.sResQ += (tResQ - this.sResQ) * a;
          if (Math.abs(tCable - this.sCable) < 1e-3 && Math.abs(tResQ - this.sResQ) < 1e-6) { this.sCable = tCable; this.sResQ = tResQ; }
          this.harp.set('lp', harpHz(this.sCable), this.sResQ, this.fs2);
        }
        if (this.sTone !== tTone) {
          this.sTone += (tTone - this.sTone) * a;
          if (Math.abs(tTone - this.sTone) < 0.01) this.sTone = tTone;
          if (s & 1) { this.lpL.set('lp', this.sTone, 0.7, this.fs); this.lpR.set('lp', this.sTone, 0.7, this.fs); }
        }
      }
      const x = this.harp.run(mono[s]);
      // suitcase "vibrato": an opto-coupled stereo auto-pan
      this.tremPhase += tremInc;
      if (this.tremPhase >= 1) this.tremPhase -= 1;
      let l = x, r = x;
      if (depth !== 0) {
        const lfo = Math.sin(TAU * this.tremPhase);
        l = x * (1 - depth * 0.5 * (1 + lfo)); r = x * (1 - depth * 0.5 * (1 - lfo));
      }
      if (drive > 0) { l += dmix * (Math.tanh(dk * l) * dn - l); r += dmix * (Math.tanh(dk * r) * dn - r); }
      this.hi = (this.hi + 1) & 127;
      hL[this.hi] = l; hR[this.hi] = r;
      if (s & 1) {
        const hc = (this.hi - TC) & 127;
        let al = fir[TC] * hL[hc], ar = fir[TC] * hR[hc];
        for (let t = 0; t < T; t += 2) { const idx = (this.hi - t) & 127; al += fir[t] * hL[idx]; ar += fir[t] * hR[idx]; }
        const o = off + (s >> 1);
        L[o] = this.lpL.run(this.hpL.run(al)) * master;
        R[o] = this.lpR.run(this.hpR.run(ar)) * master;
      }
    }
    if (gliding) {
      if (Math.abs(tDepth - depth) < 1e-7 && Math.abs(tMaster - master) < 1e-7 * (1 + tMaster)
        && drive === tDrive && this.sCable === tCable && this.sResQ === tResQ && this.sTone === tTone) {
        depth = tDepth; master = tMaster; this.gliding = false;
      }
      this.sDepth = depth; this.sMaster = master; this.sDrive = drive;
    }
  }
}

globalThis.RhodesEngine = RhodesEngine;
