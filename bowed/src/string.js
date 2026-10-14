// string.js — one bowed string as a digital waveguide in velocity waves
// (McIntyre, Schumacher & Woodhouse 1983; Smith 1992).
//
//   bridge ──(2·Db)── bow ──(2·Dn)── nut          x = 0 at the bridge
//
// Waves are lossless in the delay lines; each round trip ends in a one-pole
// low-pass for the string's own losses over that trip. The nut reflects with
// −1; the bridge side ends on the shared bridge, whose velocity V the engine
// solves for all strings at once. At the bow the friction force F enters
// both ways with the admittance Y = 1/(2Z₀) and is solved implicitly every
// sample (bowed-model.js: frictionForce, or frictionForceMem with rosin lag).
// The bow grips the string's surface, which also moves when the string rolls,
// so a second, lossy waveguide pair carries torsional waves (Woodhouse &
// Loach 1999); friction drives both, with admittances 1/(2Z₀) and 1/(2Z_t).
//
// Only the round-trip delays matter physically, so the bridge-side outgoing
// wave reaches the bridge after one sample and the return trip takes the
// remaining 2·Db − 1 (the view puts the waves back where they belong).
//
// A slip lasts β of a period, and it has to be resolved: below about 180
// samples per period the Helmholtz corner is too coarse (C6 at 48 kHz: five
// samples per slip, and a minimum bow force that has not converged). So each
// string runs at fs·os with os = 1, 2 or 4 (oversample() in the model). Within one
// output sample the other strings' pull on the bridge is held, the string's
// own reflection is exact, and its bridge force is low-passed and decimated.

import { frictionForce, frictionForceMem, classifyMotion, oversample } from './bowed-model.js';
import { Biquad } from '../../shared/dsp.js';

function tap(buf, m, w, d) { // Catmull–Rom read of the value written d samples before index w (d ≥ 1)
  const i = d | 0, f = d - i, p = w - i;
  const x0 = buf[(p + 1) & m], x1 = buf[p & m], x2 = buf[(p - 1) & m], x3 = buf[(p - 2) & m];
  const c1 = 0.5 * (x2 - x0), c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3, c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
  return ((c3 * f + c2) * f + c1) * f + x1;
}

const SLIPS = 64;

export class BowedString {
  constructor(key, fsBase) {
    const os = oversample(key, fsBase), fs = fsBase * os;
    const n = 1 << Math.ceil(Math.log2(fs / 60 + 16));
    Object.assign(this, { key, os, fs, fsBase, mask: n - 1, w: 0, wn: 0, ob: 0, lb: 0, ln: 0, v: 0, vs: 0, F: 0, damp: 1, dampT: 1, kself: 0, ftau: 0, fa: 1, tIdle: 0 });
    this.aa = [new Biquad().set('lp', 0.38 * fsBase, 0.5412, fs), new Biquad().set('lp', 0.38 * fsBase, 1.3066, fs)];
    this.fb = new Float64Array(n);   // bridge → bow, written at the bridge
    this.nl = new Float64Array(n);   // bow → nut → bow, written at the bow
    this.hb = new Float64Array(n);   // bow → bridge history (for the view only)
    this.tb = new Float64Array(n);   // torsional waves, bow → bridge → bow and bow → nut → bow
    this.tn = new Float64Array(n);
    this.st = { s: -1, u: 0 };       // friction state: 0 stick, ±1 slip; lagged slip speed
    this.slipT = new Float64Array(SLIPS); this.iv = new Float64Array(SLIPS); this.nSlip = 0; this.t = 0; this.stuck = 0;
    this.e = 0;                      // energy meter (Σ v² over the block)
    this.rng = (key * 2654435761) >>> 0; this.grain = 0; // rosin and hair grain
  }

  // L from loopDesign(key, P, this.fs): delays, loss filters, impedance.
  design(L) {
    this.L = L;
    this.ga = 1 - Math.exp((-2 * Math.PI * 2000) / this.fs); this.gs = Math.sqrt((3 * (2 - this.ga)) / this.ga); // unit-rms grain
    this.kself = (2 * L.G * L.Z0) / (1 + L.G * L.Zall); // own share of the bridge velocity
    this.Z = L.Z0; this.Y = 1 / (2 * L.Z0);
    this.Yt = L.Zt > 0 ? 1 / (2 * L.Zt) : 0; this.Dtb = L.Dtb - 1; this.Dtn = L.Dtn - 1; this.rtb = L.rtb; this.rtn = L.rtn;
    this.Dfb = 2 * L.Db - 1; this.Dnl = 2 * L.Dn - 1;
    this.gb = L.gb * (1 - L.pb); this.pb = L.pb;
    this.gn = L.gn * (1 - L.pn); this.pn = L.pn;
    this.T0 = L.N0;
    this.wheel = L.wheel ?? 1;       // this string's wheel turns this much faster than the treadle setting
  }
  // Felt damper: extra loss per round trip, as the factor exp(−σ_d / f₀).
  setDamper(on, sigma) { this.dampT = on ? Math.exp(-sigma / this.L.f0) : 1; }

  clear() {
    this.fb.fill(0); this.nl.fill(0); this.hb.fill(0); this.tb.fill(0); this.tn.fill(0);
    this.ob = 0; this.lb = 0; this.ln = 0; this.v = 0; this.vs = 0; this.F = 0; this.st.s = -1; this.st.u = 0; this.tIdle = 0; this.nSlip = 0; this.e = 0;
    for (const b of this.aa) b.reset();
  }

  // One output sample: os internal steps with the other strings' bridge
  // velocity Vo held. Returns the force on the bridge at the output rate.
  tick(Vo, vB, FN, Fr) {
    if (this.os === 1) { const f = this.bridge(Vo + this.kself * this.ob); this.bow(vB, FN, Fr); return f; }
    let f = 0;
    for (let j = 0; j < this.os; j++) {
      f = this.aa[1].run(this.aa[0].run(this.bridge(Vo + this.kself * this.ob)));
      this.bow(vB, FN, Fr);
    }
    return f;
  }

  // Bridge end: reflect the arriving wave given the bridge velocity V.
  // Returns the string's force on the bridge.
  bridge(V) {
    const a = this.ob;
    this.w = (this.w + 1) & this.mask;
    this.fb[this.w] = V - a;
    return this.Z * (2 * a - V);
  }

  // Bow end: incoming waves, friction, outgoing waves. Returns the string's
  // velocity at the bow.
  bow(vB, FN, Fr) {
    const m = this.mask;
    this.lb = this.gb * tap(this.fb, m, this.w, this.Dfb) + this.pb * this.lb;
    this.damp += 0.004 * (this.dampT - this.damp);
    this.ln = this.gn * this.damp * tap(this.nl, m, this.wn, this.Dnl) + this.pn * this.ln;
    const bin = this.lb, nin = -this.ln, vh = bin + nin;
    // torsion: the string's surface under the bow also moves by rolling
    // (only friction drives it, so off the wheel it soon dies and is skipped)
    const tLive = FN > 0 || this.tIdle < this.Dtn + 4;
    const tbi = tLive ? -this.rtb * tap(this.tb, m, this.wn, this.Dtb) : 0, tni = tLive ? -this.rtn * tap(this.tn, m, this.wn, this.Dtn) : 0;
    const vsh = vh + tbi + tni;
    let F = 0;
    if (FN > 0) {
      const was = this.st.s;
      if (Fr.grain > 0) { // the grip is not uniform: band-limited noise on μ (≈ 2 kHz)
        this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
        this.grain += this.ga * (this.rng / 2147483648 - 1 - this.grain);
        FN *= 1 + Fr.grain * this.gs * this.grain;
      }
      if (Fr.tau > 0) {
        if (Fr.tau !== this.ftau) { this.ftau = Fr.tau; this.fa = 1 - Math.exp(-1 / (this.fs * Fr.tau)); }
        F = frictionForceMem(vsh, vB, FN, this.Y + this.Yt, Fr, this.st, this.fa);
      } else F = frictionForce(vsh, vB, FN, this.Y + this.Yt, Fr, this.st);
      if (was !== 0 && this.st.s === 0) this.stuck = this.t;
      // a slip counts if the stick before it lasted ≥ 3 % of a period (shorter
      // re-captures are ripple at the end of the same slip)
      else if (was === 0 && this.st.s !== 0 && this.t - this.stuck > 0.03 * this.T0) { this.slipT[this.nSlip % SLIPS] = this.t; this.nSlip++; }
    } else this.st.s = vsh > vB ? 1 : -1;
    const yf = this.Y * F, ytf = this.Yt * F;
    this.ob = nin + yf;
    this.wn = (this.wn + 1) & m;
    this.nl[this.wn] = bin + yf;
    if (tLive) {
      this.tb[this.wn] = tni + ytf; this.tn[this.wn] = tbi + ytf;
      this.tIdle = Math.abs(tbi) + Math.abs(tni) + Math.abs(ytf) < 1e-12 ? this.tIdle + 1 : 0;
    } else { this.tb[this.wn] = 0; this.tn[this.wn] = 0; } // keep the ring clean for when it wakes
    this.hb[this.wn] = this.ob;
    this.v = vh + yf; this.vs = vsh + yf + ytf; this.F = F;
    this.e += this.v * this.v;
    this.t++;
    return this.v;
  }

  // Put the string into ideal Helmholtz motion for bow speed vB, mid-stick:
  // v(x, t) = Σ (2J/nπ) sin(nπx/L) cos nωt and y'(x, t) = Σ (2J/nωL) cos(nπx/L) sin nωt
  // with J = −vB/β (the level is −Jβ = vB for 1 − β of the period), split into the travelling
  // waves v_R = (v − c y')/2, v_L = (v + c y')/2 and written into the lines.
  initHelmholtz(vB) {
    this.clear();
    const L = this.L, J = -vB / L.beta, w = 2 * Math.PI * L.f0, N = Math.floor(L.N0 / 6), xb = L.beta * L.L, dx = L.c / this.fs;
    const field = (x, t) => {
      let v = 0, sl = 0;
      for (let n = 1; n <= N; n++) {
        const k = (n * Math.PI) / L.L, sig = Math.sin((n * Math.PI) / (N + 1)) / ((n * Math.PI) / (N + 1)); // Lanczos σ
        v += ((sig * 2 * J) / (n * Math.PI)) * Math.sin(k * x) * Math.cos(n * w * t);
        sl += ((sig * 2 * J) / (n * w * L.L)) * Math.cos(k * x) * Math.sin(n * w * t);
      }
      return [0.5 * (v - L.c * sl), 0.5 * (v + L.c * sl)]; // [v_R, v_L]
    };
    let t0 = 0, best = -1; // the middle of the longest stick at the bow
    for (let j = 0, run = 0; j < 128; j++) {
      run = Math.abs(field(xb, j / 64 / L.f0).reduce((a, b) => a + b) - vB) < 0.15 * vB ? run + 1 : 0;
      if (run > best) { best = run; t0 = (j - run / 2) / 64 / L.f0; }
    }
    const m = this.mask;
    for (let d = 0; d < 2 * L.Db + 2; d++) {
      const x = d + 1 < L.Db ? xb - (d + 1) * dx : (d + 1 - L.Db) * dx;
      const [vr, vl] = field(Math.max(0, x), t0);
      this.fb[(this.w - d) & m] = d + 1 < L.Db ? -vl : vr;
      if (d < L.Db) this.hb[(this.wn - d) & m] = field(xb - d * dx, t0)[1];
    }
    for (let d = 0; d < 2 * L.Dn + 2; d++) {
      const x = d < L.Dn ? xb + d * dx : L.L - (d - L.Dn) * dx;
      const [vr, vl] = field(Math.min(L.L, x), t0);
      this.nl[(this.wn - d) & m] = d < L.Dn ? vr : -vl;
    }
    const [vr, vl] = field(xb, t0);
    this.ob = vl; this.lb = vr; this.ln = -vl; this.v = vB; this.st.s = 0;
  }

  // The motion over the last `win` slips: slips per period, kind.
  motion(win = 24, out = {}) {
    const n = Math.min(win, this.nSlip - 1, SLIPS - 1);
    if (n < 4 || this.t - this.slipT[(this.nSlip - 1) % SLIPS] > 3 * this.T0) { out.spp = 0; out.kind = 'none'; return out; }
    const iv = this.iv;
    for (let j = 0; j < n; j++) iv[j] = (this.slipT[(this.nSlip - 1 - j) % SLIPS] - this.slipT[(this.nSlip - 2 - j) % SLIPS]) / this.T0;
    return classifyMotion(iv, n, out);
  }

  // Displacement along the string at nPts points, bridge (x = 0) to nut,
  // from the travelling waves: slope y' = (v_left − v_right)/c.
  shape(out) {
    const nP = out.length, L = this.L, m = this.mask, dx = L.c / this.fs, xb = L.beta * L.L;
    let y = 0, prev = 0;
    for (let j = 0; j < nP; j++) {
      const x = (j / (nP - 1)) * L.L;
      let vl, vr;
      if (x < xb) {
        vl = tap(this.hb, m, this.wn, Math.max(1, (xb - x) / dx));
        vr = tap(this.fb, m, this.w, Math.max(1, L.Db - 1 + x / dx));
      } else {
        vr = tap(this.nl, m, this.wn, Math.max(1, (x - xb) / dx));
        vl = -tap(this.nl, m, this.wn, Math.max(1, L.Dn + (L.L - x) / dx));
      }
      const s = (vl - vr) / L.c;
      if (j) y += (0.5 * (s + prev) * L.L) / (nP - 1);
      prev = s; out[j] = y;
    }
    for (let j = 0; j < nP; j++) out[j] -= (out[nP - 1] * j) / (nP - 1); // pin the nut
    return out;
  }
}

// Bow one string alone on the bridge, for tests and the attack map.
// force(t) → normal force (N) at time t (s); vB a number or a function of t.
// Returns the string, and per output sample its bow-point velocity and bridge force.
export function simulate(s, Fr, vB, force, seconds, { keep = true } = {}) {
  const fs = s.fsBase, n = Math.round(seconds * fs);
  const v = keep ? new Float32Array(n) : null, fbr = keep ? new Float32Array(n) : null;
  for (let i = 0; i < n; i++) {
    const f = s.tick(0, typeof vB === 'function' ? vB(i / fs) : vB, force(i / fs), Fr);
    if (keep) { v[i] = s.v; fbr[i] = f; }
  }
  return { s, v, fbr };
}

// Guettler's measure of an attack: how long after the key goes down until
// the slips come regularly, once per period (here: the first of 15 in a row
// within ±8 % of the period). The force ramps from 0 to FN in `rise`
// seconds while the wheel already turns at vB. Returns seconds, or Infinity
// if it has not settled within `sec`.
export function settleTime(s, Fr, vB, FN, rise, sec = 0.6) {
  s.clear();
  const n = Math.round(sec * s.fsBase), t0 = s.t, T0 = s.T0;
  let n0 = 0, run = 0, last = -1, start = 0;
  for (let i = 0; i < n; i++) {
    s.tick(0, vB, FN * Math.min(1, i / (rise * s.fsBase)), Fr);
    if (s.nSlip === n0) continue;
    n0 = s.nSlip;
    if (last >= 0) {
      run = Math.abs(s.t - last - T0) < 0.08 * T0 ? run + 1 : 0;
      if (run === 1) start = last;
      if (run >= 15) return (start - t0) / s.fs;
    }
    last = s.t;
  }
  return Infinity;
}
