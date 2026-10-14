// vibraphone-engine.js — the real-time vibraphone. Runs in the AudioWorklet
// (through shared/worklet.js) and in Node (tests, renders).
//
//   mallet (Hertz contact, implicit) ─▶ bar modes 2–5 and torsion 1–2 (exact two-pole recursions)
//                                    └▶ bar mode 1 ⇄ tube mode 1 (implicit midpoint, coupled through the gap's air)
//   motor ─▶ shaft angle ─▶ each disc's open area ─▶ the tube's end correction and coupling, per sample
//   output = the tube's volume acceleration (a monopole) + each bar mode's own radiation, panned by
//   the bar's place along the frame
//
// One voice per bar: striking a ringing bar hits it where it is. Knobs glide (30 ms),
// the shaft has inertia, and the damper felt lands over 8 ms, so nothing clicks.

import { TAU } from '../../shared/dsp.js';
import { voiceData, tubeState, malletOf, barTempScale, KEY_LO, KEY_HI } from './vibraphone-model.js';

const OUT = 0.034;          // output units per m³/s² of volume acceleration
const MAX_VOICES = 16;      // bars sounding at once; the quietest older one fades out beyond this
const FADE = 0.03;          // s: a stolen voice fades out over this
const YOUNG = 0.05;         // s: a voice this young is never stolen
const MALLET_MAX = 0.03;    // s: the longest a mallet may stay in flight
const GLIDE = { gap: 0.03, detune: 0.03, temp: 0.03, cd: 0.03, tubes: 0.05, twist: 0.3, shaft2: 0.3 }; // s: knobs glide (the discs are turned on their shafts slowly)
const MOTOR_TAU = 0.35;     // s: the shaft spins up and down with this time constant
const PARK_HZ = 1.2;        // the shaft parks with a critically damped servo of this natural frequency
const DAMP_RAMP = 0.008;    // s: the damper felt lands (and lifts) over this
const POST_BLOCKS = 4;      // live view messages every few blocks
const BLOCK_MAX = 1024;

class Voice {
  constructor(eng, d) {
    const N = d.N;
    this.key = d.key; this.d = d; this.id = d.id; this.N = N;
    const F = () => new Float64Array(N);
    this.q = F(); this.q1 = F(); this.a1 = F(); this.a2 = F(); this.bc = F(); this.ws = F(); this.bws = F(); this.accOut = F(); this.sig = F();
    this.qb = 0; this.vb = 0; this.X = 0; this.vx = 0;
    // block parameters at the start (…0) and end (…1) of the audio block
    this.M11 = 1; this.M12 = 0; this.M22 = 1; this.Ka = 1; this.R = 0; this.lvS = 0; this.cdisc = 0; this.tubeGain = 0;
    this.M11n = 1; this.M12n = 0; this.M22n = 1; this.Kan = 1; this.Rn = 0; this.lvSn = 0; this.cdiscn = 0; this.tubeGainn = 0;
    this.fresh = true;
    this.K11 = 1; this.C11 = 0; this.sig1 = 0; this.ws0 = 0; this.out0 = d.out[0];
    this.cph = 1; this.sph = 0;
    this.malletOn = false; this.eta = 0; this.etaPrev = 0; this.dPrev = -1; this.dPrev2 = -1; this.contact = false; this.inFlight = 0;
    this.contactSamples = 0; this.Fmax = 0; this.lastContactMs = 0;
    this.released = false; this.damp = 0; this.dampSet = -1;
    this.fade = 1; this.fading = false; this.dead = false; this.age = 0;
    this.E = 0; this.Emax = 0; this.Eb = 0; this.Et = 0;
    this.gl = d.pan[0]; this.gr = d.pan[1];
    this.coefs(eng);
  }

  // Exact two-pole coefficients for modes 2… at the current damping (bar losses + damper).
  coefs(eng) {
    const d = this.d, k = 1 / eng.fs, P = eng.P, ts = barTempScale(P.temp), sd = (6.91 / P.damp) * this.damp;
    for (let i = 0; i < this.N; i++) {
      const f = d.f[i] * ts, om = TAU * f, sig = d.sigFixed[i] + Math.PI * f * P.eta + sd * d.dampW[i];
      this.sig[i] = sig;
      if (i === 0) { this.K11 = om * om; this.sig1 = sig; continue; }
      const r = Math.exp(-sig * k), od = Math.sqrt(Math.max(om * om - sig * sig, 1e-6));
      this.a1[i] = 2 * r * Math.cos(od * k); this.a2[i] = r * r; this.bc[i] = (k * r * Math.sin(od * k)) / od;
      this.accOut[i] = om * om * d.out[i];
    }
    this.dampSet = this.damp;
  }

  // The resonator's state for the knobs as they stand (at the block's end).
  tube(eng) {
    const d = this.d, S = eng.S, ts = tubeState(d.tube, d.f[0], { gap: S.gap, detune: S.detune, temp: S.temp, cd: S.cd }), u = S.tubes;
    this.M11n = 1 + u * (ts.M11 - 1); this.M12n = u * ts.M12; this.M22n = ts.ma + u * ts.mg; this.Kan = ts.Ka; this.Rn = ts.R;
    this.lvSn = ts.lvS; this.cdiscn = ts.cd; this.tubeGainn = u;
    if (this.fresh) {
      this.M11 = this.M11n; this.M12 = this.M12n; this.M22 = this.M22n; this.Ka = this.Kan; this.R = this.Rn;
      this.lvS = this.lvSn; this.cdisc = this.cdiscn; this.tubeGain = this.tubeGainn; this.fresh = false;
    }
    const ph = ((d.accidental ? S.shaft2 : 0) + S.twist * d.shaftIndex) * (Math.PI / 180);
    this.cph = Math.cos(ph); this.sph = Math.sin(ph);
  }

  // The mallet lands at x (fraction of the length from the end) and y (fraction of the half-width).
  strike(eng, velocity) {
    const d = this.d, P = eng.P, nx = d.nx, u = Math.min(nx - 1 - 1e-9, Math.max(0, P.strike * (nx - 1))), j = Math.floor(u), fr = u - j;
    const yb = P.across * (d.b / 2);
    this.coefs(eng);
    let comp = 0;
    for (let i = 0; i < this.N; i++) {
      const w = d.w[i * nx + j] * (1 - fr) + d.w[i * nx + j + 1] * fr, ws = d.tors[i] ? w * yb : w;
      this.ws[i] = ws;
      if (i > 0) { this.bws[i] = this.bc[i] * ws; comp += this.bc[i] * ws * ws; }
    }
    this.ws0 = this.ws[0]; this.compModes = comp;
    const M = malletOf(P), v = P.speedMax * Math.max(0, Math.min(1, velocity)), h = 1 / eng.fs;
    if (!(v > 0)) return;
    this.mal = M; this.kOverM = (h * h) / M.m; this.halfAlpha = M.alpha / (2 * h);
    // launch the head 1.5 steps above the bar's surface where it lands (downward positive)
    let uc = this.ws0 * this.qb;
    for (let i = 1; i < this.N; i++) uc += this.ws[i] * this.q[i];
    this.eta = uc - 1.5 * v * h; this.etaPrev = this.eta - v * h;
    this.dPrev = -1; this.dPrev2 = -1; this.malletOn = true; this.contact = false; this.inFlight = 0;
    this.contactSamples = 0; this.Fmax = 0;
    this.released = false; this.fading = false; this.fade = 1; this.age = 0;
  }

  // Head force for a compression D at the next step: the discrete gradient of
  // V = Kδ^(p+1)/(p+1) between δ two steps back and D (energy-conserving), plus
  // the yarn's hysteresis K α d(δ^p)/dt.
  felt(D) {
    const { K, p } = this.mal, Dp = D > 0 ? D ** p : 0, dd = D - this.fd0;
    const el = Math.abs(dd) > 1e-15 ? ((D > 0 ? (K * Dp * D) / (p + 1) : 0) - this.fV0) / dd : K * Dp;
    const f = el + K * this.halfAlpha * (Dp - this.fP0);
    return f > 0 ? f : 0;
  }
  // Solve D + C·F(D) = dFree (C: the bar's and the mallet's compliance over one step).
  contactForce(dFree, C) {
    const d0 = this.dPrev2, { K, p } = this.mal;
    this.fd0 = d0; this.fV0 = d0 > 0 ? (K * d0 ** (p + 1)) / (p + 1) : 0; this.fP0 = d0 > 0 ? d0 ** p : 0;
    this.dPrev2 = this.dPrev;
    if (dFree <= 0 && d0 <= 0) { this.dPrev = dFree; return 0; }
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

  render(L, R, n, eng) {
    const N = this.N, q = this.q, q1 = this.q1, A1 = this.a1, A2 = this.a2, ACC = this.accOut;
    const h = 1 / eng.fs, h2 = 0.5 * h * h, hq = 0.25 * h * h, inv = 1 / n;
    const sinT = eng.sinT, cosT = eng.cosT, cph = this.cph, sph = this.sph;
    const M11a = this.M11, dM11 = this.M11n - M11a, M12a = this.M12, dM12 = this.M12n - M12a, M22a = this.M22, dM22 = this.M22n - M22a;
    const Kaa = this.Ka, dKa = this.Kan - Kaa, Ra = this.R, dR = this.Rn - Ra, lvSa = this.lvS, dlvS = this.lvSn - lvSa;
    const cda = this.cdisc, dcd = this.cdiscn - cda, tga = this.tubeGain, dtg = this.tubeGainn - tga;
    const K11 = this.K11, c1 = 2 * this.sig1, out0 = this.out0, gl = this.gl, gr = this.gr;
    const fadeStep = this.fading ? 1 / (FADE * eng.fs) : 0;
    let qb = this.qb, vb = this.vb, X = this.X, vx = this.vx, fade = this.fade;
    for (let s = 0; s < n; s++) {
      const t = (s + 1) * inv;
      // the disc in this bar's mouth: open area, and the end correction of the flow squeezing past it
      let sn = sinT[s] * cph + cosT[s] * sph;
      if (sn < 0) sn = -sn;
      const open = 1 - (cda + dcd * t) * sn, mc = (lvSa + dlvS * t) * (1 / open - 1);
      const m11 = M11a + dM11 * t, m12 = M12a + dM12 * t, m22 = M22a + dM22 * t + mc, ka = Kaa + dKa * t, r22 = Ra + dR * t;
      // pre-warped stiffnesses, so the implicit midpoint rule keeps each oscillator's own frequency
      const xb = (hq * K11) / m11, xt = (hq * ka) / m22;
      const wb = 1 + xb * (1 / 3 + xb * (2 / 15)), wt = 1 + xt * (1 / 3 + xt * (2 / 15));
      const k11 = K11 * wb * wb, k22 = ka * wt * wt;
      const a11 = 2 * m11 + h * c1 * m11 + h2 * k11, a12 = 2 * m12, a22 = 2 * m22 + h * r22 + h2 * k22;
      const id = 1 / (a11 * a22 - a12 * a12);
      const r1 = 2 * (m11 * vb + m12 * vx) - h * k11 * qb, r2 = 2 * (m12 * vb + m22 * vx) - h * k22 * X;
      let vmb = (a22 * r1 - a12 * r2) * id, vmx = (a11 * r2 - a12 * r1) * id;
      for (let i = 1; i < N; i++) { const qn = A1[i] * q[i] - A2[i] * q1[i]; q1[i] = q[i]; q[i] = qn; }
      if (this.malletOn) {
        const ws = this.ws, bws = this.bws;
        let uf = this.ws0 * (qb + h * vmb);
        for (let i = 1; i < N; i++) uf += ws[i] * q[i];
        const etaF = 2 * this.eta - this.etaPrev, C = this.compModes + h * h * a22 * id * this.ws0 * this.ws0 + this.kOverM;
        const Fc = this.contactForce(etaF - uf, C);
        this.etaPrev = this.eta; this.eta = etaF - this.kOverM * Fc;
        if (Fc > 0) {
          for (let i = 1; i < N; i++) q[i] += bws[i] * Fc;
          const f0 = this.ws0 * Fc * h * id;
          vmb += a22 * f0; vmx -= a12 * f0;
          this.contact = true; this.contactSamples++;
          if (Fc > this.Fmax) this.Fmax = Fc;
        }
        if (++this.inFlight > eng.malletMax || (this.contact && Fc === 0 && this.dPrev < -1e-4)) {
          this.malletOn = false; this.lastContactMs = (1000 * this.contactSamples) / eng.fs;
        }
      }
      const vbN = 2 * vmb - vb, vxN = 2 * vmx - vx;
      qb += h * vmb; X += h * vmx;
      let y = (tga + dtg * t) * (vxN - vx) * eng.fs + out0 * (vbN - vb) * eng.fs;
      vb = vbN; vx = vxN;
      for (let i = 1; i < N; i++) y -= ACC[i] * q[i];
      y *= OUT * fade;
      if (fadeStep) { fade -= fadeStep; if (fade <= 0) { fade = 0; this.dead = true; } }
      L[s] += gl * y; R[s] += gr * y;
    }
    this.qb = qb; this.vb = vb; this.X = X; this.vx = vx; this.fade = fade;
    this.M11 = this.M11n; this.M12 = this.M12n; this.M22 = this.M22n; this.Ka = this.Kan; this.R = this.Rn;
    this.lvS = this.lvSn; this.cdisc = this.cdiscn; this.tubeGain = this.tubeGainn;
    this.age += n / eng.fs;
    // energy: bar mode 1 and tube (block), the other modes from two successive samples
    const k = 1 / eng.fs;
    let Eb = 0.5 * (this.M11 * vb * vb + K11 * qb * qb);
    for (let i = 1; i < N; i++) {
      const om = TAU * this.d.f[i], c = Math.cos(om * k), sn = Math.sin(om * k), a = q[i], b = q1[i];
      Eb += (0.5 * om * om * Math.max(0, a * a - 2 * c * a * b + b * b)) / (sn * sn);
    }
    const Et = 0.5 * (this.M22 * vx * vx + this.Ka * X * X);
    this.Eb = Eb; this.Et = Et; this.E = Eb + Et;
    if (this.E > this.Emax) this.Emax = this.E;
    if (!(this.E < 1e6)) { this.dead = true; eng.post?.({ type: 'error', message: `bar ${this.key}: numerical failure` }); return; }
    if (!this.malletOn && this.age > YOUNG && (this.E <= 1e-9 * this.Emax || (this.damp > 0.99 && this.E < 1e-7 * this.Emax))) this.dead = true;
  }
}

export class VibraphoneEngine {
  constructor(fs) {
    this.fs = fs; this.P = null; this.S = null; this.voices = []; this.byKey = new Map(); this.sustain = false;
    this.models = new Map(); this.focus = null; this.blocks = 0;
    this.malletMax = Math.round(MALLET_MAX * fs);
    this.sinT = new Float64Array(BLOCK_MAX); this.cosT = new Float64Array(BLOCK_MAX);
    this.theta = 0; this.omega = 0; this.parkMode = null; this.parkTarget = 0;
    this.msg = { type: 'vibe', key: 0, amp: new Float64Array(8), Eb: 0, Et: 0, theta: 0, open: 1, kappa: 0, ft: 0, contactMs: 0, Fmax: 0, shaft: 0, motor: 0 };
  }

  setParams(P) {
    const first = !this.P;
    this.P = P;
    const target = { gap: P.gap / 1000, detune: P.detune, temp: P.temp, cd: P.cd, tubes: P.tubes ? 1 : 0, twist: P.twist, shaft2: P.shaft2 };
    this.T = target;
    if (first) this.S = { ...target };
    // bar losses and the damper apply at once to every sounding bar
    for (const v of this.voices) v.coefs(this);
  }

  setSustain(on) { this.sustain = !!on; }

  noteOn(key, velocity, data) {
    if (!this.P || !(key >= KEY_LO && key <= KEY_HI)) return; // F3–F6: there is no bar outside
    // one copy of each bar's data: the page's (sent with the note), else built here
    const id = `${key}|${this.P.depth}`;
    let d = this.models.get(id);
    if (!d) {
      d = data && data.key === key && data.depth === this.P.depth ? data : voiceData(key, this.P.depth);
      d.id = id;
      if (this.models.size > 256) this.models.clear();
      this.models.set(id, d);
    }
    let v = this.byKey.get(key);
    if (!v || v.dead || v.fading || v.id !== d.id) {
      if (v && !v.dead) v.fading = true; // the bar was re-cut: the old one fades out quickly
      v = new Voice(this, d);
      v.tube(this);
      this.voices.push(v); this.byKey.set(key, v);
    }
    v.strike(this, velocity);
    this.focus = v;
    let live = 0;
    for (const u of this.voices) if (!u.fading) live++;
    if (live > MAX_VOICES) {
      let victim = null, score = Infinity;
      for (const u of this.voices) {
        if (u === v || u.fading || u.malletOn || u.age < YOUNG) continue;
        if (u.E < score) { score = u.E; victim = u; }
      }
      if (victim) victim.fading = true;
    }
  }

  noteOff(key) { const v = this.byKey.get(key); if (v) v.released = true; }
  allNotesOff() { for (const v of this.voices) v.fading = true; }
  voiceCount() { return this.voices.length; }

  // The shaft: spun by the motor through a belt, with some inertia; stopped, it parks
  // so that the naturals' discs stand open (θ = 0) or closed (θ = 90°).
  shaft(n) {
    const P = this.P, dt = n / this.fs, th0 = this.theta;
    if (P.motor === 'run') {
      this.parkMode = null;
      this.omega += (TAU * P.speed - this.omega) * (1 - Math.exp(-dt / MOTOR_TAU));
      this.theta += this.omega * dt;
    } else {
      if (this.parkMode !== P.motor) {
        this.parkMode = P.motor;
        const off = P.motor === 'closed' ? Math.PI / 2 : 0, ahead = this.theta + this.omega / (TAU * PARK_HZ);
        this.parkTarget = off + Math.PI * Math.ceil((ahead - off) / Math.PI - 0.5);
      }
      const wn = TAU * PARK_HZ, sub = Math.max(1, Math.ceil(dt * wn * 8)), ds = dt / sub;
      for (let i = 0; i < sub; i++) { // semi-implicit, critically damped
        this.omega += (wn * wn * (this.parkTarget - this.theta) - 2 * wn * this.omega) * ds;
        this.theta += this.omega * ds;
      }
    }
    const d = this.theta - th0;
    for (let s = 0; s < n; s++) { const a = th0 + (d * (s + 1)) / n; this.sinT[s] = Math.sin(a); this.cosT[s] = Math.cos(a); }
    if (this.theta > 1e4) { const w = TAU * Math.floor(this.theta / TAU); this.theta -= w; this.parkTarget -= w; }
  }

  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    if (!this.P) return;
    // knobs glide
    const S = this.S, T = this.T;
    let moving = false;
    for (const id in T) {
      if (S[id] === T[id]) continue;
      S[id] += (1 - Math.exp(-n / (GLIDE[id] * this.fs))) * (T[id] - S[id]);
      if (Math.abs(T[id] - S[id]) < 1e-6 * (Math.abs(T[id]) + 1e-3)) S[id] = T[id];
      moving = true;
    }
    this.shaft(n);
    const P = this.P, dStep = n / (DAMP_RAMP * this.fs);
    for (const v of this.voices) {
      // the damper felt: on every bar not held by a key, unless the pedal is down
      const want = v.released && !this.sustain && !P.pedalLock ? 1 : 0;
      if (v.damp !== want) { v.damp = want > v.damp ? Math.min(1, v.damp + dStep) : Math.max(0, v.damp - dStep); }
      if (v.damp !== v.dampSet) v.coefs(this);
      if (moving || v.fresh) v.tube(this);
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

  // Live data for the page's views: the struck bar's mode amplitudes, the energy in bar
  // and tube, and its disc.
  postFocus() {
    const v = this.focus, m = this.msg;
    m.shaft = this.theta; m.motor = this.omega / TAU;
    if (!v) { m.key = 0; this.post(m); return; }
    const k = 1 / this.fs, N = Math.min(v.N, m.amp.length);
    m.key = v.key; m.Eb = v.Eb; m.Et = v.Et;
    m.amp[0] = Math.sqrt(v.qb * v.qb + (v.vb * v.vb) / v.K11);
    for (let i = 1; i < N; i++) {
      const om = TAU * v.d.f[i], c = Math.cos(om * k), a = v.q[i], b = v.q1[i];
      m.amp[i] = Math.sqrt(Math.max(0, a * a - 2 * c * a * b + b * b)) / Math.sin(om * k);
    }
    const th = Math.atan2(this.sinT[0] * v.cph + this.cosT[0] * v.sph, this.cosT[0] * v.cph - this.sinT[0] * v.sph);
    const open = 1 - v.cdisc * Math.abs(Math.sin(th)), m22 = v.M22 + v.lvS * (1 / open - 1);
    m.theta = th; m.open = open; m.kappa = -v.M12 / Math.sqrt(v.M11 * m22); m.ft = Math.sqrt(v.Ka / m22) / TAU;
    m.contactMs = v.lastContactMs; m.Fmax = v.Fmax; m.X = Math.sqrt(v.X * v.X + (v.vx * v.vx * m22) / v.Ka);
    this.post(m);
  }
}

globalThis.VibraphoneEngine = VibraphoneEngine;
