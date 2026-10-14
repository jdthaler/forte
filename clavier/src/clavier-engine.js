// clavier-engine.js — real-time tangent clavier. Runs in the AudioWorklet
// (through shared/worklet.js) and in Node (tests, renders).
//
// Per key (see clavier-model.js): speaking modes q_n coupled through their mass
// to the string's height s at the anvil, quarter-wave yarn modes r_m with
// s = Σ r_m, a tangent of mass M on a Hertzian rubber tip, and a Hertzian
// steel anvil. Each sample:
//   1. every mode takes its free step (exact two-pole recursion)
//   2. the tangent and the anvil are solved together, implicitly (2-D Newton
//      on the tip height η and the string height s); the felt mute, a linear
//      spring–dashpot on the string, is eliminated into the same solve
//   3. every mode gets its share of the result: the speaking modes through
//      the anvil point's acceleration, the yarn modes through the force there
// The tension of the speaking length follows its stretch, so key pressure
// (the rubber wrapping the string round the anvil) and large swings
// (Kirchhoff–Carrier) both move the pitch.
//
// The pickups sense the speaking length's height under each pole through an
// exponential field; the selected tone networks make one biquad on the sum.

import { keyModel, pickupX, pickupMix, pickupWeight, toneBiquad, tipK, ANVIL_K, ANVIL_LOSS, KEY_DAMPING, REST_GAP, RETURN_FORCE, PRESS_MAX, MUTE_K, MUTE_R } from './clavier-model.js';
import { strikeSpeed } from './clavier-params.js';

const OUT = 0.1;               // pickup signal (m/s) → output
const MAX_VOICES = 24;
const BUSHING = 2;            // N·s/m: friction of a released key
const LIVE = new Set(['gain', 'velocity', 'press', 'tipLoss', 'keyMass', 'pickup', 'xLower', 'xUpper', 'field', 'soft', 'medium', 'treble', 'brilliant', 'muteOn', 'mute', 'muteX', 'kc', 'room', 'volume']);

class Voice {
  constructor(eng, key, mdl) {
    const { S, modes, yarn } = mdl, k = 1 / eng.fs, F = (n) => new Float64Array(n);
    this.key = key; this.mdl = mdl; this.S = S; this.version = mdl.version;
    const N = modes.length, M = yarn.length, { L, Ln, mu } = S, mn = (mu * L) / 2, nu = (mu * Ln) / 2;
    this.N = N; this.M = M;
    this.q = F(N); this.q1 = F(N);
    this.A1 = F(N); this.A2 = F(N); this.eps = F(N); this.beta = F(N); this.c = F(N); this.w = F(N);
    this.phi = F(N); this.gam = F(N); this.Wl = F(N); this.Wu = F(N);
    let Cb = 0;
    for (let i = 0; i < N; i++) {
      const m = modes[i], n = m.n, c = (mu * L * (n % 2 ? 1 : -1)) / (n * Math.PI);
      this.A1[i] = m.a1; this.A2[i] = m.a2;
      this.eps[i] = (m.b * m.kn * m.kn) / mu;   // ∂a1/∂T: the recursion's response to a tension change
      this.c[i] = c; this.beta[i] = (m.b * c) / mn; this.w[i] = (m.kn * m.kn * L) / 2;
      Cb += c * this.beta[i];
    }
    this.r = F(M); this.r1 = F(M); this.B1 = F(M); this.B2 = F(M); this.by = F(M);
    let Cy = 0;
    for (let j = 0; j < M; j++) { this.B1[j] = yarn[j].a1; this.B2[j] = yarn[j].a2; this.by[j] = yarn[j].b / nu; Cy += this.by[j]; }
    this.ms = (mu * L) / 3; this.Cb = Cb; this.Cy = Cy;
    this.mass = this.ms - Cb / (k * k);              // residual mass of the speaking static shape (> 0)
    this.kcGain = S.EA / (2 * L);                     // ΔT = EA/2L · ∫u_x²
    // state
    this.s = 0; this.s1 = 0; this.eta = -REST_GAP; this.eta1 = -REST_GAP;
    this.C1 = 0; this.C0 = 0; this.um = 0; this.Q = 0;
    this.Flp = 0; this.Fr = 0; this.Fa = 0; this.force = 0;
    this.Pl = 0; this.Pu = 0; this.ul = 0; this.uu = 0;
    this.pressure = eng.chanPressure; this.down = false; this.thrown = false;
    this.dead = false; this.killing = false; this.fade = 1; this.peak = 0; this.quiet = 0; this.Fpeak = 0;
    this.setPickups(eng.P);
    this.setMuteX(eng.P);
  }

  setPickups(P) {
    const { L } = this.S, X = pickupX(this.key, P), modes = this.mdl.modes;
    for (let i = 0; i < this.N; i++) { this.Wl[i] = pickupWeight(modes[i].n, X.lower, L); this.Wu[i] = pickupWeight(modes[i].n, X.upper, L); }
    this.xl = X.lower / L; this.xu = X.upper / L;
    [this.gl, this.gu] = pickupMix(P.pickup);
    this.lam = P.field * 1e-3;
    this.Pl = this.lam * Math.expm1(this.ul / this.lam); this.Pu = -this.lam * Math.expm1(-this.uu / this.lam);
  }

  setMuteX(P) {
    const { L, mu } = this.S, xm = Math.min(0.9 * L, P.muteX * 1e-3), mn = (mu * L) / 2, modes = this.mdl.modes;
    let Pb = 0, Pg = 0;
    for (let i = 0; i < this.N; i++) {
      const p = Math.sin(modes[i].kn * xm);
      this.phi[i] = p; this.gam[i] = (modes[i].b * p) / mn;
      Pb += p * this.beta[i]; Pg += p * this.gam[i];
    }
    this.xm = xm / L; this.Pb = Pb; this.Pg = Pg;
  }

  // Throw the key: the tangent flies at v (m/s) until it meets the string.
  strike(v, k) { this.eta1 = this.eta - v * k; this.down = true; this.thrown = true; this.Fpeak = 0; }
  release() { this.down = false; this.thrown = false; }

  render(out, n, eng) {
    const k = eng.k, k2 = k * k, P = eng.P, S = this.S, N = this.N, M = this.M;
    const A1 = this.A1, A2 = this.A2, eps = this.eps, cc = this.c, beta = this.beta;
    const w = this.w, Wl = this.Wl, Wu = this.Wu, phi = this.phi, gam = this.gam;
    const B1 = this.B1, B2 = this.B2, by = this.by;
    const Kr = eng.Kr, lr = P.tipLoss, Mt = P.keyMass * 1e-3, gap = S.gap, L = S.L;
    const mass = this.mass, Cy = this.Cy, Cb = this.Cb;
    const muteK = MUTE_K * eng.muteLevel, muteR = MUTE_R * eng.muteLevel, muted = eng.muteLevel > 1e-4;
    const G = muteK + muteR / k, Pb = this.Pb, Pg = this.Pg, xm = this.xm;
    const den = 1 + G * Pg, lamM = xm - Pb / k2;
    const kc = P.kc, kcGain = this.kcGain, wrapK = S.EA / (L * 2 * P.wrap * 1e-3), dTnom = S.dTnom, Tt = S.T;
    const lpF = eng.lpF, lpFall = eng.lpFall, gl = this.gl * S.mag * OUT * eng.fs, gu = this.gu * S.mag * OUT * eng.fs, lamP = this.lam, xl = this.xl, xu = this.xu;
    const target = this.down ? P.press + PRESS_MAX * Math.max(this.pressure, eng.bend) : -RETURN_FORCE;
    // q holds q[n], q1 holds q[n−1]; each sample q1 is overwritten with q[n+1] and the two swap
    let q = this.q, q1 = this.q1, r = this.r, r1 = this.r1;
    let s = this.s, s1 = this.s1, eta = this.eta, eta1 = this.eta1, C1 = this.C1, C0 = this.C0, um = this.um, Qn = this.Q;
    let Fl = this.Flp, Pl = this.Pl, Pu = this.Pu, peak = 0, fade = this.fade, Frp = this.Fr, Fap = this.Fa;
    if (muted && !this.muted) { um = xm * s; for (let i = 0; i < N; i++) um += phi[i] * q[i]; } // felt lands: where is the string?
    this.muted = muted;
    for (let t = 0; t < n; t++) {
      // tension of the speaking length: stretch + wrap (from the quasi-static tip force) − the tuned state
      const dl = Fl > 0 ? Fl / Kr : 0, dW = wrapK * dl * Math.cbrt(dl);   // δ² = (F/K)^(4/3)
      let dT = (kc ? kcGain * Qn : (kcGain * s * s) / L) + dW - dTnom;
      if (dT < -0.5 * Tt) dT = -0.5 * Tt; else if (dT > 0.6 * Tt) dT = 0.6 * Tt;
      // 1. free step (into q1)
      let SC = 0, SU = 0;
      if (muted) for (let i = 0; i < N; i++) { const v = (A1[i] - eps[i] * dT) * q[i] - A2[i] * q1[i]; q1[i] = v; SC += cc[i] * v; SU += phi[i] * v; }
      else for (let i = 0; i < N; i++) { const v = (A1[i] - eps[i] * dT) * q[i] - A2[i] * q1[i]; q1[i] = v; SC += cc[i] * v; }
      let RF = 0;
      for (let j = 0; j < M; j++) { const v = B1[j] * r[j] - B2[j] * r1[j]; r1[j] = v; RF += v; }
      // 2. contact solve. Junction: z = s⁺ = RF + Cy·Fj, with
      //    Fj = Fc + λ·Fm − mass·ŝ − J0 − Ks·s,  ŝ = (z − 2s + s1)/k²,  Fm = f1 z + f0 (felt)
      const s0 = (-2 * s + s1) / k2, J0 = (SC - 2 * C1 + C0) / k2, Ks = (Tt + dT) / L;
      let f1 = 0, f0 = 0;
      if (muted) { f1 = (-G * lamM) / den; f0 = (-G * (SU - Pb * s0) + (muteR / k) * um) / den; }
      const Az = 1 / Cy - lamM * f1 + mass / k2;
      const Bz = -RF / Cy - lamM * f0 + mass * s0 + J0 + Ks * s;
      const Fkey = this.thrown ? 0 : this.down ? (this.force += lpF * (target - this.force)) : -RETURN_FORCE;
      // the finger on a held key catches its rebound (it damps upward motion, not the stroke);
      // a released key only rubs its bushings
      const cK = this.down ? (!this.thrown && eta < eta1 ? KEY_DAMPING : 0) : BUSHING, Ae = Mt / k2 + cK / (2 * k);
      const Be = -(Mt * (2 * eta - eta1)) / k2 - (cK * eta1) / (2 * k) - Fkey;
      let z = -Bz / Az, e = -Be / Ae, Fr = 0, Fa = 0;
      if (e - z > 0 || z - gap > 0) {
        if (Frp > 0 || Fap > 0) { z = s; e = eta; }
        const d0 = eta - s, p0 = s - gap;
        let res = Infinity, zp = z, ep = e;
        for (let it = 0; it < 40; it++) {
          // rubber tip and anvil: F = K δ^1.5 (1 + λ dδ/dt), never pulling
          const d = e - z, p = z - gap;
          let dFr = 0, dFa = 0; Fr = 0; Fa = 0;
          if (d > 0) {
            const sq = Math.sqrt(d), hc = 1 + (lr * (d - d0)) / k;
            Fr = Kr * d * sq * hc;
            if (Fr > 0) dFr = Kr * (1.5 * sq * hc + (d * sq * lr) / k); else Fr = 0;
          }
          if (p > 0) {
            const sq = Math.sqrt(p), hc = 1 + (ANVIL_LOSS * (p - p0)) / k;
            Fa = ANVIL_K * p * sq * hc;
            if (Fa > 0) dFa = ANVIL_K * (1.5 * sq * hc + (p * sq * ANVIL_LOSS) / k); else Fa = 0;
          }
          const g1 = Az * z + Bz - Fr + Fa, g2 = Ae * e + Be + Fr, nr = Math.abs(g1) + Math.abs(g2);
          if (nr < 1e-10 * (1 + Fr + Fa)) break;
          if (nr > res) { z = 0.5 * (z + zp); e = 0.5 * (e + ep); continue; } // backtrack
          res = nr; zp = z; ep = e;
          const J11 = Az + dFr + dFa, J22 = Ae + dFr, det = J11 * J22 - dFr * dFr;
          const dz = (-g1 * J22 - dFr * g2) / det, de = (-g2 * J11 - dFr * g1) / det;
          z += dz; e += de;
          if (Math.abs(dz) < 1e-15 && Math.abs(de) < 1e-15) break;
        }
      }
      if (Fr > 0 && this.thrown) { this.thrown = false; this.force = target; }
      const Fc = Fr - Fa, Fm = f1 * z + f0, sh = z / k2 + s0;
      const Fj = Fc + lamM * Fm - mass * sh - J0 - Ks * s;
      // 3. modal update (into q1, then swap)
      let Q = 0, yl = 0, yu = 0;
      if (muted) for (let i = 0; i < N; i++) { const v = q1[i] - beta[i] * sh + gam[i] * Fm; q1[i] = v; Q += w[i] * v * v; yl += Wl[i] * v; yu += Wu[i] * v; }
      else for (let i = 0; i < N; i++) { const v = q1[i] - beta[i] * sh; q1[i] = v; Q += w[i] * v * v; yl += Wl[i] * v; yu += Wu[i] * v; }
      let zs = 0;
      for (let j = 0; j < M; j++) { const v = r1[j] + by[j] * Fj; r1[j] = v; zs += v; }
      let tmp = q; q = q1; q1 = tmp; tmp = r; r = r1; r1 = tmp;
      C0 = C1; C1 = SC - Cb * sh + Pb * Fm;
      um = xm * zs + SU - Pb * sh + Pg * Fm;
      s1 = s; s = zs; eta1 = eta; eta = e;
      if (!this.down && eta < -REST_GAP) { eta = eta1 = -REST_GAP; }
      Qn = Q + (s * s) / L;
      Frp = Fr; Fap = Fa;
      Fl += (Fr < Fl ? lpFall : lpF) * (Fr - Fl);   // the wrap lets go as soon as the tip lifts
      if (Fa > this.Fpeak) this.Fpeak = Fa;
      // pickups: Φ ∝ e^(±u/λ); output ∝ dΦ/dt, normalised to the string's velocity
      const ul = xl * s + yl, uu = xu * s + yu;
      const nPl = lamP * Math.expm1(ul / lamP), nPu = -lamP * Math.expm1(-uu / lamP);
      let y = gl * (nPl - Pl) + gu * (nPu - Pu);
      Pl = nPl; Pu = nPu; this.ul = ul; this.uu = uu;
      if (this.killing) { fade *= eng.killDecay; y *= fade; }
      out[t] += y;
      const a = y < 0 ? -y : y;
      if (a > peak) peak = a;
    }
    this.q = q; this.q1 = q1; this.r = r; this.r1 = r1; this.Q = Qn; this.Fr = Frp; this.Fa = Fap;
    this.s = s; this.s1 = s1; this.eta = eta; this.eta1 = eta1; this.C1 = C1; this.C0 = C0; this.um = um;
    this.Flp = Fl; this.Pl = Pl; this.Pu = Pu; this.fade = fade;
    this.peak = peak;
    if (!(peak < 1e3) || !Number.isFinite(s)) { this.dead = true; eng.emit({ type: 'error', key: this.key, message: 'numerical instability' }); return; }
    if (this.killing && fade < 1e-4) this.dead = true;
    if (!this.down && eta <= -REST_GAP) {
      this.quiet = peak < 3e-5 ? this.quiet + 1 : 0;
      if (this.quiet > 40) this.dead = true;
    }
  }
}

export class ClavierEngine {
  constructor(fs) {
    this.fs = fs; this.k = 1 / fs;
    this.P = null; this.version = 0;
    this.voices = []; this.byKey = new Map(); this.cache = new Map();
    this.space = false; this.bend = 0; this.chanPressure = 0;
    this.muteLevel = 0;
    this.lpF = 1 - Math.exp(-1 / (0.01 * fs));      // 10 ms: the tip's quasi-static squeeze, and smoothing of key force
    this.lpFall = 1 - Math.exp(-1 / (0.0005 * fs));
    this.lpM = 1 - Math.exp(-128 / (0.012 * fs));   // mute felt engages over ~12 ms (per block)
    this.killDecay = Math.exp(-1 / (0.004 * fs));
    this.mono = new Float64Array(4096);
    this.tone = { b0: 0, b1: 0, b2: 0, a1: 0, a2: 0, z1: 0, z2: 0 };
    this.shL = shelf('low', 130, -3, fs); this.shH = shelf('high', 4000, 3, fs); // amplifier (Gabrielli et al. 2013)
    this.dcx = 0; this.dcy = 0; this.dcR = Math.exp((-2 * Math.PI * 8) / fs);
    this.listeners = [];
  }

  emit(m) { if (this.post) this.post(m); for (const f of this.listeners) f(m); }

  setParams(P) {
    const old = this.P;
    this.P = { ...P };
    if (!old || Object.keys(P).some((id) => !LIVE.has(id) && P[id] !== old[id])) { this.version++; this.cache.clear(); }
    this.Kr = tipK(this.P);
    const tb = toneBiquad(this.P, this.fs);
    Object.assign(this.tone, tb);
    if (old) for (const v of this.voices) {
      if (['pickup', 'xLower', 'xUpper', 'field'].some((id) => P[id] !== old[id])) v.setPickups(this.P);
      if (P.muteX !== old.muteX) v.setMuteX(this.P);
    }
  }

  model(key) {
    let m = this.cache.get(key);
    if (!m) { m = keyModel(key, this.P, this.fs); m.version = this.version; this.cache.set(key, m); }
    return m;
  }

  setSustain(on) { this.space = !!on; }   // Space / CC64 engages the mute bar
  handle(m) {
    if (m.type === 'pressure') {
      const v = Math.min(1, Math.max(0, m.value));
      if (m.key === null || m.key === undefined) { this.chanPressure = v; for (const u of this.voices) u.pressure = v; }
      else for (const u of this.voices) if (u.key === m.key) u.pressure = v;
    } else if (m.type === 'bend') this.bend = Math.max(0, Math.min(1, m.value)); // the wheel presses every held key harder
  }

  noteOn(key, velocity) {
    if (!this.P) return;
    let v = this.byKey.get(key);
    if (!v || v.dead || v.killing || v.version !== this.version) {
      if (v && !v.dead) v.release();
      v = new Voice(this, key, this.model(key));
      this.voices.push(v); this.byKey.set(key, v);
    }
    v.pressure = this.chanPressure;
    v.strike(strikeSpeed(Math.min(1, Math.max(0, velocity))), this.k);
    if (this.voices.length > MAX_VOICES) {
      let victim = null, score = Infinity;
      for (const u of this.voices) if (u !== v && !u.killing && u.peak + (u.down ? 1 : 0) < score) { score = u.peak + (u.down ? 1 : 0); victim = u; }
      if (victim) victim.killing = true;
    }
    return v;
  }
  noteOff(key) { const v = this.byKey.get(key); if (v) v.release(); }
  allNotesOff() { for (const v of this.voices) v.killing = true; }
  voiceCount() { return this.voices.length; }

  process(L, R, n) {
    const P = this.P, mono = this.mono;
    mono.fill(0, 0, n);
    if (!P) { L.fill(0, 0, n); R.fill(0, 0, n); return; }
    this.muteLevel += this.lpM * ((P.muteOn || this.space ? P.mute : 0) - this.muteLevel);
    if (this.muteLevel < 1e-4 && !(P.muteOn || this.space)) this.muteLevel = 0;
    for (const v of this.voices) v.render(mono, n, this);
    let j = 0;
    for (const v of this.voices) { if (v.dead) { if (this.byKey.get(v.key) === v) this.byKey.delete(v.key); } else this.voices[j++] = v; }
    this.voices.length = j;
    const T = this.tone, sL = this.shL, sH = this.shH, R0 = this.dcR, gain = 10 ** (P.gain / 20);
    for (let i = 0; i < n; i++) {
      const x = mono[i];
      let y = T.b0 * x + T.z1;
      T.z1 = T.b1 * x - T.a1 * y + T.z2; T.z2 = T.b2 * x - T.a2 * y;
      y = sL.run(sH.run(y));
      const d = y - this.dcx + R0 * this.dcy; this.dcx = y; this.dcy = d;
      L[i] = gain * d; R[i] = gain * d;
    }
  }
}

// RBJ shelving biquad.
function shelf(type, f, db, fs) {
  const A = 10 ** (db / 40), w = (2 * Math.PI * f) / fs, c = Math.cos(w), al = Math.sin(w) / Math.SQRT2, sA = 2 * Math.sqrt(A) * al;
  let b0, b1, b2, a0, a1, a2;
  if (type === 'low') { b0 = A * (A + 1 - (A - 1) * c + sA); b1 = 2 * A * (A - 1 - (A + 1) * c); b2 = A * (A + 1 - (A - 1) * c - sA); a0 = A + 1 + (A - 1) * c + sA; a1 = -2 * (A - 1 + (A + 1) * c); a2 = A + 1 + (A - 1) * c - sA; }
  else { b0 = A * (A + 1 + (A - 1) * c + sA); b1 = -2 * A * (A - 1 + (A + 1) * c); b2 = A * (A + 1 + (A - 1) * c - sA); a0 = A + 1 - (A - 1) * c + sA; a1 = 2 * (A - 1 - (A + 1) * c); a2 = A + 1 - (A - 1) * c - sA; }
  const q = { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, z1: 0, z2: 0 };
  q.run = (x) => { const y = q.b0 * x + q.z1; q.z1 = q.b1 * x - q.a1 * y + q.z2; q.z2 = q.b2 * x - q.a2 * y; return y; };
  return q;
}

globalThis.ClavierEngine = ClavierEngine;
