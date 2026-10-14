// string.js — one harpsichord string in modal form and everything that touches
// it: its plectra, its damper felt and the buff's leather pad. No audio, no
// DOM: the engine runs it, and so do the tests and the page's slow-motion view.
//
// Partial n (mass-normalised shape φₙ, see harpsichord-model.js) is a damped
// oscillator stepped exactly between samples,
//   qₙ[t+1] = a₁ qₙ[t] − a₂ qₙ[t−1] + bₙ fₙ[t],   a₁ = 2r cos ω_d h, a₂ = r², r = e^{−σh},
// with the input gain bₙ = (1 − a₁ + a₂)/ωₙ², so that a steady force gives
// exactly the static deflection (a pluck releases the string from its static
// shape, so this matters more than the response to a click).
//
// Point contacts at xᵢ (up to four) act through fₙ = Σᵢ φₙ(xᵢ) Fᵢ. Each is
// linear in the string's displacement there once we know which are touching,
// Fᵢ = αᵢ − βᵢ uᵢ[t+1], and uᵢ[t+1] = u_free,ᵢ + Σⱼ Cᵢⱼ Fⱼ with
// Cᵢⱼ = Σₙ φₙ(xᵢ) bₙ φₙ(xⱼ). So each sample solves (I + βC)F = α − β u_free
// exactly for the touching set (an implicit step; a one-sided contact that
// would pull is dropped and the rest solved again):
//   plectrum, rising     F = k(s)(y − u)  ≥ 0     (y: the plectrum's top; k(s) = 1/c(s), plectrum.js)
//   plectrum, returning  F = k_t(y − d − u) ≤ 0   (its underside, d lower, on the tongue's spring)
//   damper felt          F = −K_f(u − y_f) − R_f(u[t+1] − u[t−1])/2h ≤ 0
//   buff pad             F = −g K_b u − g R_b(u[t+1] − u[t−1])/2h     (g: how far the buff is engaged)
// Then each loaded plectrum's contact point slides by the friction law
// (plectrum.js), against the string's lateral stiffness K_z and its wave
// impedance Z = 2√(Tμ),
//   Z ż + K_z (z − z₀) = F tan(θ − φ)   while the string slides towards the tip,
// solved implicitly for the new contact point s. When the string would pass
// the tip, the plectrum lets go: its force is gone from that sample on.

import { beamC, beamG, lateralZ, coneLo, coneHi } from './plectrum.js';

const MAXP = 4;            // contact points per string
export const PT = { MAIN: 0, LUTE: 1, DAMPER: 2, BUFF: 3 };

export class PluckedString {
  // S: stringDesign; parts: stringPartials(S, …).partials; fs: sample rate
  constructor(S, parts, fs) {
    const N = parts.length, h = 1 / fs, F = () => new Float64Array(N);
    this.S = S; this.N = N; this.Na = N; this.h = h; this.fs = fs; this.parts = parts;
    this.q = F(); this.q1 = F(); this.A1 = F(); this.A2 = F(); this.Bin = F(); this.BF = F(); this.W = F(); this.K = F(); this.sig = F();
    for (let i = 0; i < N; i++) { this.W[i] = 2 * Math.PI * parts[i].f; this.K[i] = parts[i].k; this.BF[i] = parts[i].b; }
    this.nrm = Math.sqrt(2 / (S.mu * S.L));
    this.x = new Float64Array(MAXP).fill(-1);
    this.PHI = Array.from({ length: MAXP }, F); this.PHB = Array.from({ length: MAXP }, F);
    this.C = new Float64Array(MAXP * MAXP); this.cDirty = true;
    this.uNow = new Float64Array(MAXP); this.uOld = new Float64Array(MAXP); this.uf = new Float64Array(MAXP); this.hv = new Uint8Array(MAXP);
    this.al = new Float64Array(MAXP); this.be = new Float64Array(MAXP); this.Fc = new Float64Array(MAXP);
    this.act = new Uint8Array(MAXP); this.M = new Float64Array(MAXP * MAXP); this.rhs = new Float64Array(MAXP); this.idx = new Int32Array(MAXP); this.sid = new Int32Array(MAXP);
    // plectra (points MAIN and LUTE)
    this.pl = [null, null];
    this.phase = ['off', 'off'];      // 'off' (row disengaged) | 'under' (below the string) | 'above' (has plucked)
    this.gap = new Float64Array(2);   // m: plectrum top below the string with the key at rest
    this.s = new Float64Array(2); this.zOld = new Float64Array(2); this.Kz = new Float64Array(2);
    this.Fp = new Float64Array(2); this.Fd = 0;
    this.released = [false, false]; this.onRelease = null;
    this.relInfo = [{ F: 0, y: 0, u: 0, w: 0, s: 0, theta: 0 }, { F: 0, y: 0, u: 0, w: 0, s: 0, theta: 0 }];
    this.sl = { p: 0, y: 0, ufe: 0, Cpp: 0, tip: true }; // scratch for the slide solve
    this.passDepth = new Float64Array(2);
    this.feltK = 0; this.feltR = 0; this.feltPre = 0; this.tongueK = 0; this.thick = 0; this.buffK = 0; this.buffR = 0;
    this.peakF = 0; this.work = 0;
    this.trace = null;               // optional per-sample recorder (views, tests)
    this.setDamping(null);
  }

  // Recursion coefficients: the string's own decay plus, per partial, an optional extra rate.
  setDamping(extra) {
    const h = this.h, P = this.parts;
    for (let i = 0; i < this.N; i++) {
      const sg = P[i].sigma + (extra ? extra[i] : 0), w0 = this.W[i], r = Math.exp(-sg * h);
      const wd = Math.sqrt(Math.max(w0 * w0 - sg * sg, 1e-6));
      this.A1[i] = 2 * r * Math.cos(wd * h); this.A2[i] = r * r; this.sig[i] = sg;
      this.Bin[i] = (1 - this.A1[i] + this.A2[i]) / (w0 * w0);
    }
    for (let p = 0; p < MAXP; p++) if (this.x[p] >= 0) this.fillPoint(p);
    this.cDirty = true;
  }

  // Put contact point p at x (m from the nut).
  setPoint(p, x) {
    if (this.x[p] === x) return;
    this.x[p] = x; this.fillPoint(p); this.cDirty = true; this.hv[p] = 0;
  }
  fillPoint(p) {
    const x = this.x[p], PH = this.PHI[p], PB = this.PHB[p];
    for (let i = 0; i < this.N; i++) { PH[i] = this.nrm * Math.sin(this.K[i] * x); PB[i] = this.Bin[i] * PH[i]; }
  }
  updateC() {
    const C = this.C, Na = this.Na;
    for (let i = 0; i < MAXP; i++) for (let j = i; j < MAXP; j++) {
      let c = 0;
      if (this.x[i] >= 0 && this.x[j] >= 0) { const A = this.PHI[i], B = this.PHB[j]; for (let n = 0; n < Na; n++) c += A[n] * B[n]; }
      C[i * MAXP + j] = C[j * MAXP + i] = c;
    }
    this.cDirty = false;
  }
  dispAtQ(p, q, N = this.Na) { const A = this.PHI[p]; let u = 0; for (let i = 0; i < N; i++) u += A[i] * q[i]; return u; }
  // Static compliance at point p, Σ φₙ²/ωₙ² (m/N).
  staticCompliance(p) { const A = this.PHI[p]; let c = 0; for (let i = 0; i < this.N; i++) c += (A[i] * A[i]) / (this.W[i] * this.W[i]); return c; }

  // Arm plectrum p (MAIN or LUTE) for the next pluck: plectrum pl at x, its top
  // `gap` below the string at rest; `jackUp`: the jack is already above the string.
  armPlectrum(p, pl, x, gap, engaged, jackUp) {
    if (!engaged) { this.phase[p] = 'off'; return; }
    const S = this.S;
    this.setPoint(p, x);
    this.pl[p] = pl; this.gap[p] = gap; this.passDepth[p] = pl.overlap;
    this.Kz[p] = (S.T * S.L) / (x * (S.L - x));
    // a plectrum already under its string (perhaps loading it) stays as it is; one newly engaged is
    // under the string or above it, as the jack stands
    if (this.phase[p] === 'off') { this.phase[p] = jackUp ? 'above' : 'under'; this.s[p] = pl.s0; this.zOld[p] = pl.s0; }
    this.released[p] = false;
  }

  // Vibration energy (J): each partial as a free oscillator, ½(q̇² + ω²q²), exact between samples for an undamped partial.
  energy() {
    let E = 0;
    for (let i = 0; i < this.Na; i++) {
      const w = this.W[i], c = Math.cos(w * this.h), s2 = Math.sin(w * this.h) ** 2, a = this.q[i], b = this.q1[i];
      E += (w * w * (a * a - 2 * c * a * b + b * b)) / (2 * s2);
    }
    return E;
  }

  // Which points may touch this block: plectra rising (the key down, or still
  // above their rest), plectra on the way back (the key up), the damper felt
  // near the string, the buff when engaged.
  needsContacts(liftMax, keyDown, buffOn) {
    for (let p = 0; p < 2; p++) {
      const ph = this.phase[p];
      if (ph === 'under' && (keyDown || liftMax - this.gap[p] > -0.5e-3 || this.s[p] !== this.pl[p].s0)) return true;
      if (ph === 'above' && !keyDown) return true;
    }
    if (this.x[PT.DAMPER] >= 0 && liftMax < this.feltPre + 2e-3) return true;
    return buffOn && this.x[PT.BUFF] >= 0;
  }

  // Run n samples. lift[t]: the key's lift (m); a plectrum's top is at lift − gap
  // relative to the string at rest, the felt's underside at lift − feltPre.
  // buffG[t]: the buff's engagement (0..1). Adds the bridge force × gain ×
  // wts[w] into seg[w·stride + t] (w = w0, w1). Returns the bridge force's
  // half-range over the block (its swing: a steady force does not count).
  render(n, lift, keyDown, buffG, seg, stride, wts, w0, w1, gain) {
    const buffOn = buffG[0] > 1e-6 || buffG[n - 1] > 1e-6;
    let lmax = 0;
    for (let t = 0; t < n; t++) if (lift[t] > lmax) lmax = lift[t];
    if (!this.needsContacts(lmax, keyDown, buffOn)) return this.free(n, seg, stride, w0, w1, wts, gain);
    if (this.cDirty) this.updateC();
    const N = this.Na, A1 = this.A1, A2 = this.A2, BF = this.BF, h = this.h;
    const PHI = this.PHI, PHB = this.PHB, C = this.C, uf = this.uf, al = this.al, be = this.be, Fc = this.Fc, act = this.act, idx = this.idx;
    const uNow = this.uNow, uOld = this.uOld, hv = this.hv, X = this.x;
    const s0 = w0 * stride, s1 = w1 * stride, k0 = wts[w0] * gain, k1 = wts[w1] * gain;
    let q = this.q, q1 = this.q1, ymin = Infinity, ymax = -Infinity;
    for (let t = 0; t < n; t++) {
      const L = lift[t], bg = buffG[t];
      // 1. candidates and their laws F = α − βu
      let m = 0;
      for (let p = 0; p < MAXP; p++) {
        act[p] = 0;
        if (X[p] < 0) continue;
        let cand = false;
        if (p < 2) {
          const ph = this.phase[p], y = L - this.gap[p];
          if (ph === 'under' && (keyDown || y > -0.5e-3 || this.s[p] !== this.pl[p].s0)) { const k = 1 / beamC(this.pl[p], this.s[p]); al[p] = k * y; be[p] = k; cand = true; }
          else if (ph === 'above' && !keyDown) { al[p] = this.tongueK * (y - this.thick); be[p] = this.tongueK; cand = true; }
        } else if (p === PT.DAMPER) {
          if (L < this.feltPre + 2e-3) { al[p] = this.feltK * (L - this.feltPre); be[p] = this.feltK + this.feltR / (2 * h); cand = true; }
        } else if (bg > 1e-6) { al[p] = 0; be[p] = bg * (this.buffK + this.buffR / (2 * h)); cand = true; }
        if (!cand) { hv[p] = 0; continue; }
        if (!hv[p]) { uNow[p] = this.dispAtQ(p, q, N); uOld[p] = this.dispAtQ(p, q1, N); hv[p] = 1; }
        if (p === PT.DAMPER) al[p] += (this.feltR / (2 * h)) * uOld[p];
        else if (p === PT.BUFF) al[p] += ((bg * this.buffR) / (2 * h)) * uOld[p];
        act[p] = 1; idx[m++] = p;
      }
      // 2. the free step, with the free displacement at the candidates
      if (m === 0) {
        for (let i = 0; i < N; i++) q1[i] = A1[i] * q[i] - A2[i] * q1[i];
      } else if (m === 1) {
        const P0 = PHI[idx[0]];
        let u0 = 0;
        for (let i = 0; i < N; i++) { const v = A1[i] * q[i] - A2[i] * q1[i]; q1[i] = v; u0 += P0[i] * v; }
        uf[idx[0]] = u0;
      } else {
        const P0 = PHI[idx[0]], P1 = PHI[idx[1]], P2 = PHI[idx[m > 2 ? 2 : 1]], P3 = PHI[idx[m > 3 ? 3 : 1]];
        let u0 = 0, u1 = 0, u2 = 0, u3 = 0;
        for (let i = 0; i < N; i++) { const v = A1[i] * q[i] - A2[i] * q1[i]; q1[i] = v; u0 += P0[i] * v; u1 += P1[i] * v; u2 += P2[i] * v; u3 += P3[i] * v; }
        uf[idx[0]] = u0; uf[idx[1]] = u1; if (m > 2) uf[idx[2]] = u2; if (m > 3) uf[idx[3]] = u3;
      }
      let y = 0;
      if (m) {
        this.solve();
        // 3. plectra: a loaded one slides along and may let go; an unloaded one eases
        // back; a returning one gets past once the tongue has swung far enough
        let again = false;
        for (let a = 0; a < m; a++) {
          const p = idx[a];
          if (p > 1) continue;
          if (this.phase[p] === 'under') {
            if (act[p]) { if (this.slide(p, Fc[p], L - this.gap[p])) again = true; }
            else this.ease(p);
          } else if (act[p]) {
            const pen = uf[p] + this.cross(p) + C[p * MAXP + p] * Fc[p] - (L - this.gap[p] - this.thick);
            if (pen > this.passDepth[p]) { this.phase[p] = 'under'; this.s[p] = this.pl[p].s0; this.zOld[p] = this.pl[p].s0; act[p] = 0; Fc[p] = 0; again = true; }
          }
        }
        if (again) this.solve();
        // 4. apply the forces; the bridge force
        const f0 = act[idx[0]] ? Fc[idx[0]] : 0, B0 = PHB[idx[0]];
        if (m === 1) {
          if (f0 !== 0) for (let i = 0; i < N; i++) { const v = q1[i] + B0[i] * f0; q1[i] = v; y += BF[i] * v; }
          else for (let i = 0; i < N; i++) y += BF[i] * q1[i];
        } else {
          const f1 = act[idx[1]] ? Fc[idx[1]] : 0, B1 = PHB[idx[1]];
          const f2 = m > 2 && act[idx[2]] ? Fc[idx[2]] : 0, B2 = PHB[idx[m > 2 ? 2 : 1]];
          const f3 = m > 3 && act[idx[3]] ? Fc[idx[3]] : 0, B3 = PHB[idx[m > 3 ? 3 : 1]];
          for (let i = 0; i < N; i++) { const v = q1[i] + B0[i] * f0 + B1[i] * f1 + B2[i] * f2 + B3[i] * f3; q1[i] = v; y += BF[i] * v; }
        }
        // 5. the candidates' displacement one step on, by superposition: u = u_free + C F
        for (let a = 0; a < m; a++) {
          const p = idx[a];
          let u = uf[p];
          for (let b = 0; b < m; b++) { const j = idx[b]; if (act[j]) u += C[p * MAXP + j] * Fc[j]; }
          if (p < 2 && act[p]) { this.work += (Fc[p] * (u - uOld[p])) / 2; const af = Fc[p] < 0 ? -Fc[p] : Fc[p]; if (af > this.peakF) this.peakF = af; }
          uOld[p] = uNow[p]; uNow[p] = u;
        }
        this.Fp[0] = act[0] ? Fc[0] : 0; this.Fp[1] = act[1] ? Fc[1] : 0; this.Fd = act[PT.DAMPER] ? Fc[PT.DAMPER] : 0;
      } else {
        for (let i = 0; i < N; i++) y += BF[i] * q1[i];
        this.Fp[0] = this.Fp[1] = 0; this.Fd = 0;
      }
      const tmp = q; q = q1; q1 = tmp;
      if (this.trace) { this.q = q; this.q1 = q1; this.trace(this, L, t); }
      seg[s0 + t] += k0 * y; if (s1 !== s0) seg[s1 + t] += k1 * y;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    }
    this.q = q; this.q1 = q1;
    return 0.5 * (ymax - ymin);
  }
  // Σ_{j≠p} C_pj F_j over the active points: what the other contacts add at point p.
  cross(p) { let u = 0; for (let j = 0; j < MAXP; j++) if (j !== p && this.act[j]) u += this.C[p * MAXP + j] * this.Fc[j]; return u; }

  // The free string: partials only, the fast path.
  free(n, seg, stride, w0, w1, wts, gain) {
    const N = this.Na, A1 = this.A1, A2 = this.A2, BF = this.BF;
    const s0 = w0 * stride, s1 = w1 * stride, k0 = wts[w0] * gain, k1 = wts[w1] * gain;
    let q = this.q, q1 = this.q1, ymin = Infinity, ymax = -Infinity;
    for (let t = 0; t < n; t++) {
      let y = 0;
      for (let i = 0; i < N; i++) { const v = A1[i] * q[i] - A2[i] * q1[i]; q1[i] = v; y += BF[i] * v; }
      const tmp = q; q = q1; q1 = tmp;
      seg[s0 + t] += k0 * y; if (s1 !== s0) seg[s1 + t] += k1 * y;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    }
    this.q = q; this.q1 = q1; this.hv.fill(0); this.Fp[0] = this.Fp[1] = 0; this.Fd = 0;
    return 0.5 * (ymax - ymin);
  }

  // Solve (I + βC)F = α − β u_free over the active points; drop one-sided
  // contacts that would pull (rising plectra push up, F ≥ 0; returning plectra
  // and the felt push down, F ≤ 0) and solve again.
  solve() {
    const act = this.act, al = this.al, be = this.be, uf = this.uf, C = this.C, Fc = this.Fc, M = this.M, r = this.rhs, id = this.sid;
    for (let iter = 0; iter <= MAXP; iter++) {
      let m = 0;
      for (let p = 0; p < MAXP; p++) if (act[p]) id[m++] = p;
      if (!m) return;
      for (let a = 0; a < m; a++) {
        const p = id[a];
        r[a] = al[p] - be[p] * uf[p];
        for (let b = 0; b < m; b++) M[a * MAXP + b] = (a === b ? 1 : 0) + be[p] * C[p * MAXP + id[b]];
      }
      for (let k = 0; k < m; k++) { // Gaussian elimination (m ≤ 4; I + βC is diagonally dominant here)
        const d = M[k * MAXP + k];
        for (let a = k + 1; a < m; a++) {
          const f = M[a * MAXP + k] / d;
          if (f === 0) continue;
          for (let b = k; b < m; b++) M[a * MAXP + b] -= f * M[k * MAXP + b];
          r[a] -= f * r[k];
        }
      }
      for (let k = m - 1; k >= 0; k--) {
        let v = r[k];
        for (let b = k + 1; b < m; b++) v -= M[k * MAXP + b] * r[b];
        r[k] = v / M[k * MAXP + k];
      }
      let worst = -1, wv = 0;
      for (let a = 0; a < m; a++) {
        const p = id[a], F = r[a];
        Fc[p] = F;
        let bad = 0;
        if (p < 2) bad = this.phase[p] === 'under' ? -F : F;
        else if (p === PT.DAMPER) bad = F;
        if (bad > wv) { wv = bad; worst = p; }
      }
      if (worst < 0) return;
      act[worst] = 0; Fc[worst] = 0;
    }
  }

  // Plectrum p carries force F with its top at y: move the contact point by the
  // friction law. Returns true if the forces must be solved again (the
  // plectrum's stiffness changed, or it let go).
  slide(p, F, y) {
    const pl = this.pl[p], Kz = this.Kz[p], Zh = this.S.Z / this.h, z0 = pl.s0, zOld = this.zOld[p];
    let s = this.s[p];
    const zs = lateralZ(pl, s, F), need = Zh * (zs - zOld) + Kz * (zs - z0);
    const tip = need < F * coneLo(pl, s, F);
    if (!tip && need <= F * coneHi(pl, s, F)) { this.zOld[p] = zs; return false; } // sticks
    // slides: the force follows the plectrum's stiffness at the new point (the other contacts held)
    const sl = this.sl;
    sl.p = p; sl.y = y; sl.ufe = this.uf[p] + this.cross(p); sl.Cpp = this.C[p * MAXP + p]; sl.tip = tip;
    if (tip) {
      if (this.slideG(pl.len) < 0) { this.letGo(p, F, y); return true; } // past the tip: the pluck
      let a = s, b = pl.len;
      for (let it = 0; it < 48; it++) { const mid = 0.5 * (a + b); if (this.slideG(mid) < 0) a = mid; else b = mid; }
      s = 0.5 * (a + b);
    } else {
      let a = 0.05 * pl.len, b = s;
      if (this.slideG(a) > 0) s = a;
      else { for (let it = 0; it < 48; it++) { const mid = 0.5 * (a + b); if (this.slideG(mid) > 0) b = mid; else a = mid; } s = 0.5 * (a + b); }
    }
    this.s[p] = s;
    this.zOld[p] = lateralZ(pl, s, this.slideF(s));
    const k = 1 / beamC(pl, s);
    this.al[p] = k * y; this.be[p] = k;
    return true;
  }
  // The vertical force if the string sat at s (the plectrum's stiffness there).
  slideF(s) { const sl = this.sl, k = 1 / beamC(this.pl[sl.p], s), f = (k * (sl.y - sl.ufe)) / (1 + k * sl.Cpp); return f > 0 ? f : 0; }
  // The lateral balance at s: Z(z − z_old)/h + K_z(z − z₀) − F tan(θ ∓ φ).
  slideG(s) {
    const sl = this.sl, p = sl.p, pl = this.pl[p], f = this.slideF(s), z = lateralZ(pl, s, f);
    return (this.S.Z / this.h) * (z - this.zOld[p]) + this.Kz[p] * (z - pl.s0) - f * (sl.tip ? coneLo(pl, s, f) : coneHi(pl, s, f));
  }
  // Unloaded, the string eases back sideways towards where it was caught.
  ease(p) {
    const pl = this.pl[p], Kz = this.Kz[p], Zh = this.S.Z / this.h, z0 = pl.s0;
    const z = (Zh * this.zOld[p] + Kz * z0) / (Zh + Kz);
    this.zOld[p] = z; this.s[p] = Math.abs(z - z0) < 1e-9 ? z0 : Math.max(z0, Math.min(z, pl.len));
  }
  letGo(p, F, y) {
    const pl = this.pl[p], s = this.s[p], r = this.relInfo[p];
    this.phase[p] = 'above'; this.act[p] = 0; this.Fc[p] = 0; this.released[p] = true;
    r.F = F; r.y = y; r.u = this.uf[p] + this.cross(p) + this.C[p * MAXP + p] * F; r.w = F * beamC(pl, s); r.s = s; r.theta = Math.atan(F * beamG(pl, s));
    if (this.onRelease) this.onRelease(p, r);
  }

  // Stop integrating top partials that have died away (a few per call).
  dropTop(thr) {
    const q = this.q, q1 = this.q1, BF = this.BF;
    let n = 0;
    while (n < 4 && this.Na > 4) {
      const i = this.Na - 1;
      if (Math.abs(BF[i]) * (Math.abs(q[i]) + Math.abs(q1[i])) >= thr) break;
      q[i] = q1[i] = 0; this.Na--; n++;
    }
    if (n) { this.cDirty = true; this.hv.fill(0); }
  }
  wake() { if (this.Na !== this.N) { this.Na = this.N; this.cDirty = true; this.hv.fill(0); } }
}
