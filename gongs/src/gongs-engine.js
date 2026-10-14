// gongs-engine.js — the real-time part. Runs in the AudioWorklet (through
// shared/worklet.js) and in Node (tests, renders).
//
// Each voice integrates one gong's shell modes, x_k (in thicknesses), with the
// nonlinear coupling V_nl from gongs-model.js and a Hertzian mallet:
//
//   (1+σ̃ₖh) xₖ⁺ − 2c̃ₖ xₖ + (1−σ̃ₖh) xₖ⁻ = h² [ φₖ F − gₖ (ψ⁺ + ψ⁻)/2 ],    ψ⁺ = ψ⁻ + g·(x⁺ − x⁻)/2
//
// The linear part is the exact damped modal recursion (exact frequencies at any
// step h). The nonlinearity uses a scalar auxiliary variable (SAV): ψ ≈
// √(2V_nl + ε₀), g = ∇V_nl/√(2V_nl + ε₀) at xⁿ. Then
//   E = Σ ½(δx)² + ½ ω̃² x⁺x + ψ²/2 + mallet + contact
// is conserved exactly (σ = 0) for any g, so the scheme cannot blow up however
// hard the gong is hit, and x⁺ follows from a rank-one (Sherman–Morrison) solve:
// O(modes) beyond the cost of g. The contact force is the discrete gradient of
// the Hertz potential, solved by Newton together with the plate.
//
// Accuracy: each step ψ is pinned to √(2V + ε₀) (energy-neutral, see project()),
// and the size of that correction is the error estimate: when it grows (a hard
// strike on a thin plate: deflections of several thicknesses) the voice halves
// its step, up to 8 substeps per sample, and returns to one when it calms down.
//
// Voices run at fs/R (R = 2, 4 or 8, the lowest rate that holds all their modes
// below fs/3R, where Ωh ≤ 2 keeps the SAV accurate); each rate has a bus and a
// polyphase interpolator back to fs.

import { keyPan } from '../../shared/dsp.js';
import { keyGong, modeLoss, mallet, rowEnds, interpR, MICS as MIC } from './gongs-model.js';

const OUT = 0.14;         // output per m/s of surface velocity (at the strike tone's weight)
const TAPS = 24;          // interpolator taps per phase
const MAX_VOICES = 16;
const NL_OFF = 1e-8;      // nonlinear energy fraction below which a voice runs linear
const UP = 2e-2, DOWN = 2e-3, CALM = 0.02, MAX_SUB = 8; // substep control: per-step energy defect, seconds of calm
const POST_BLOCKS = 12;

class Voice {
  constructor(eng, key, P) {
    const g = keyGong(key, P, eng.fs), S = g.S, N = g.Nv;
    this.g = g; this.S = S; this.key = key; this.N = N; this.R = g.R; this.k = g.k; this.P = P;
    const F = () => new Float64Array(N);
    this.x = F(); this.x1 = F(); this.xs = F(); this.gv = F(); this.a0 = F(); this.a1 = F();
    this.phi = F(); this.mL = F(); this.mR = F(); this.wd = F(); this.sg = F();
    this.cf = [1, 2, 4, 8].map(() => ({ A: F(), B: F(), iD: F() }));
    this.Q = new Float64Array(S.NS); this.L = new Float64Array(S.NS); this.y = new Float64Array(S.NS); this.z = new Float64Array(S.NS);
    this.end1 = rowEnds(S.p1.off, S.p1.j, N, new Int32Array(S.NS));
    this.end2 = rowEnds(S.p2.off, S.p2.q, N, new Int32Array(N));
    this.endE = rowEnds(S.e1.off, S.e1.i, N, new Int32Array(S.NS));
    this.rows = Int32Array.from([...Array(S.NS).keys()].filter((n) => this.end1[n] > S.p1.off[n]));
    this.vScale = g.h * g.w0; // m/s per unit of dx̄/dt̄
    this.setOutput(P);
    this.extra = 0; this.released = false; this.damped = false; this.killing = false; this.dead = false;
    this.m = 1; this.h = this.k; this.calm = 0; this.adapt = true;
    this.setDamping();
    this.nl = false; this.psi = 0; this.eps0 = 1; this.V = 0; this.Vprev = 0; this.V3 = 0; this.V4 = 0; this.defect = 0;
    this.hit = null; this.quiet = 0; this.age = 0; this.peak = 0; this.contactMs = 0; this.Einj = 0; this.guards = 0; this.lastF = 0;
    this.ph = 0; this.cents = 0; this.phInit = false; this.dc = 0;
  }

  // What reaches the listener: each mode's surface velocity, weighted by (σ_rad)^(far/2)
  // relative to the strike tone. A close microphone (far = 0) hears the plate's motion; in
  // the room (far = 1) each mode is heard by the power it radiates, ∝ σ_rad ⟨v²⟩. The
  // mode shapes at two points near the rim make a decorrelated stereo pair.
  setOutput(P) {
    const { g, S, N, k } = this, [gl, gr] = keyPan(this.key, 0.5), ref = g.loss[S.tuned].srad, far = P.listen ?? 0.6;
    for (let i = 0; i < N; i++) {
      const w = (OUT * this.vScale * (g.loss[i].srad / ref) ** (far / 2)) / k;
      this.mL[i] = gl * w * interpR(S.R[i], MIC[0][0]) * Math.cos(S.m[i] * MIC[0][1]);
      this.mR[i] = gr * w * interpR(S.R[i], MIC[1][0]) * Math.cos(S.m[i] * MIC[1][1]);
    }
  }

  // Exact damped recursion for each mode, for steps k, k/2, k/4 and k/8, written in
  // the energy form of the scheme: c̃ = 2r cos(ω_d h)/(1+r²), σ̃h = (1−r²)/(1+r²), r = e^{−σh}.
  setDamping() {
    const { k, N, g } = this, extra = this.killing ? 300 : this.damped ? this.extra : 0;
    for (let i = 0; i < N; i++) {
      const Om = g.S.Om[i], sg = (g.sigma[i] + extra) / g.w0;
      this.sg[i] = sg; this.wd[i] = Math.sqrt(Math.max(Om * Om - sg * sg, 1e-9));
    }
    this.cf.forEach((c, j) => {
      const h = k / (1 << j);
      for (let i = 0; i < N; i++) {
        const r = Math.exp(-this.sg[i] * h), st = (1 - r * r) / (1 + r * r), ct = (2 * r * Math.cos(this.wd[i] * h)) / (1 + r * r);
        c.iD[i] = 1 / (1 + st); c.A[i] = 2 * ct; c.B[i] = 1 - st;
      }
    });
    this.use();
  }
  use() { const c = this.cf[Math.round(Math.log2(this.m))]; this.A = c.A; this.B = c.B; this.iD = c.iD; this.h = this.k / this.m; }

  // Change the number of substeps. The previous state is moved to the new spacing
  // exactly for modal motion under a constant contact force F (about the static
  // offset u = φF/Ω²): u(−h') = e^{σh'} [u(0) sin ω(h−h') + u(−h) e^{−σh} sin ωh'] / sin ωh,
  // and for the mallet under its constant deceleration F/(πμ).
  setSub(m2) {
    const E0 = this.energyD(), h = this.h, h2 = this.k / m2, { x, x1, wd, sg, phi } = this, hit = this.hit, F = hit ? this.lastF : 0, Om = this.S.Om;
    for (let i = 0; i < this.N; i++) {
      const s = Math.sin(wd[i] * h), u = F ? (phi[i] * F) / (Om[i] * Om[i]) : 0;
      x1[i] = u + (Math.exp(sg[i] * h2) * ((x[i] - u) * Math.sin(wd[i] * (h - h2)) + (x1[i] - u) * Math.exp(-sg[i] * h) * Math.sin(wd[i] * h2))) / s;
    }
    if (hit) {
      const a = -F * hit.Mi, v0 = (hit.xm - hit.xm1 + 0.5 * a * h * h) / h;
      hit.xm1 = hit.xm - v0 * h2 + 0.5 * a * h2 * h2;
      let w1 = 0; for (let i = 0; i < this.N; i++) w1 += phi[i] * x1[i];
      hit.dm1 = hit.xm1 - w1;
    }
    this.m = m2; this.use();
    if (this.nl) { this.gradient(); this.Vprev = this.V; this.psi = Math.sqrt(Math.max(2 * this.V + this.eps0, 1e-12 * this.eps0)); }
    this.calm = 0;
    const E1 = this.energyD(); // the discrete energy's form depends on the step: re-reference
    if (E0 > 0 && E1 > 0) this.Einj *= E1 / E0;
  }

  // The scheme's energy: plate (discrete form) + (ψ² − ε₀)/2 + mallet and contact.
  // Conserved, or decreasing with damping, by every step and projection.
  energyD() {
    const { x, x1, h, A, N } = this, m = this.hit;
    let E = 0;
    for (let i = 0; i < N; i++) { const v = (x[i] - x1[i]) / h; E += 0.5 * v * v + (0.5 * (2 - A[i]) * x[i] * x1[i]) / (h * h); }
    if (this.nl) E += 0.5 * (this.psi * this.psi - this.eps0);
    if (m) { const u = (m.xm - m.xm1) / h; E += (0.5 * u * u) / m.Mi + 0.5 * (pot(m.d0, m.K) + pot(m.dm1, m.K)); }
    return E;
  }

  // Passivity guard, a last resort for settings far outside a real gong's range
  // (a 3 ‰ steel dome hit at 12 m/s): the gong cannot hold more energy than the
  // mallets gave it. If the scheme's energy ever exceeds that (it can only grow
  // through the fallback in project()), the excess is taken out of the motion.
  // Counted in this.guards; the tests check that it never acts for the presets.
  guard() {
    const E = this.energyD();
    if (!(E > 1.3 * this.Einj)) return;
    const { x, x1, h, N } = this;
    let K = 0;
    for (let i = 0; i < N; i++) { const v = (x[i] - x1[i]) / h; K += 0.5 * v * v; }
    const ex = E - this.Einj, s = K > ex ? Math.sqrt(1 - ex / K) : 0, c = K > ex ? 1 : Math.sqrt(Math.max(0, this.Einj / Math.max(E - K, 1e-30)));
    for (let i = 0; i < N; i++) { x[i] *= c; x1[i] = x[i] - s * (x[i] - c * x1[i]); }
    this.gradient(); this.Vprev = this.V;
    this.eps0 = Math.max(this.eps0, -8 * this.V);
    this.psi = Math.sqrt(Math.max(2 * this.V + this.eps0, 1e-12 * this.eps0));
    this.guards++;
  }

  energy() { // plate energy (reduced units)
    let E = 0;
    const { x, x1, h, S } = this;
    for (let i = 0; i < this.N; i++) { const v = (x[i] - x1[i]) / h, X = 0.5 * (x[i] + x1[i]); E += 0.5 * (v * v + S.Om[i] * S.Om[i] * X * X); }
    return E;
  }

  strike(vel, P) {
    const ml = mallet(this.g, P, vel), S = this.S, rs = P.strike;
    // resolve the contact with ≥ 12 steps: Hertz contact time of the mallet on a rigid flat
    // (a lower bound; the plate's own give lengthens it), 3.218 (M²/(K² v))^{1/5}
    const tc = 3.218 * ((Math.PI * ml.mu) ** 2 / (ml.K * ml.K * Math.max(ml.vbar, 1e-6))) ** 0.2;
    let m = 1;
    while (m < MAX_SUB && (12 * this.k) / m > tc) m *= 2;
    if (m > this.m) this.setSub(m);
    for (let i = 0; i < this.N; i++) this.phi[i] = interpR(S.R[i], rs); // on the line θ = 0
    let w = 0, w1 = 0;
    for (let i = 0; i < this.N; i++) { w += this.phi[i] * this.x[i]; w1 += this.phi[i] * this.x1[i]; }
    const vb = ml.vbar, h = this.h;
    // the mallet starts one step short of the surface, moving at v̄ (plus the surface's own motion)
    const xm = w - vb * h, xm1 = xm - vb * h - (w - w1);
    this.hit = { K: ml.K, Mi: 1 / (Math.PI * ml.mu), xm, xm1, d0: xm - w, dm1: xm1 - w1, touched: false, t: 0, tmax: (6 * Math.PI) / S.Om[S.tuned], Fmax: 0, steps: 0 };
    const KE = 0.5 * Math.PI * ml.mu * vb * vb;
    this.gradient(); this.Vprev = this.V;
    this.eps0 = 2 * (this.energy() + Math.abs(this.V) + KE) + 1e-12;
    this.psi = Math.sqrt(Math.max(2 * this.V + this.eps0, 1e-12 * this.eps0));
    this.nl = true; this.released = false; this.damped = false; this.setDamping();
    this.age = 0; this.phInit = false; this.vImpact = ml.v; this.KE = KE;
    this.Einj = this.energyD();
  }

  // Start from a given displacement, at rest (tests: free vibration of chosen modes).
  setState(x0) {
    this.x.fill(0); this.x1.fill(0);
    for (let i = 0; i < Math.min(this.N, x0.length); i++) this.x[i] = this.x1[i] = x0[i] || 0;
    this.gradient(); this.Vprev = this.V;
    this.eps0 = 2 * (this.energy() + Math.abs(this.V)) + 1e-12;
    this.psi = Math.sqrt(2 * this.V + this.eps0);
    this.nl = true; this.hit = null; this.phInit = false; this.Einj = this.energyD();
    return this;
  }

  // V_nl(x) and g = ∇V_nl (into gv), over this key's modes. Returns V.
  gradient() {
    const S = this.S, x = this.x, Q = this.Q, L = this.L, y = this.y, z = this.z, C = S.C, gv = this.gv, N = this.N;
    const o1 = S.p1.off, I1 = S.p1.i, J1 = S.p1.j, H1 = S.p1.h, e1o = S.e1.off, EI = S.e1.i, EV = S.e1.v, end1 = this.end1, endE = this.endE, rows = this.rows;
    let V3 = 0, V4 = 0;
    for (let r = 0; r < rows.length; r++) {
      const n = rows[r];
      let q0 = 0, q1 = 0, e = o1[n];
      const e1 = end1[n];
      for (; e + 1 < e1; e += 2) { q0 += H1[e] * x[I1[e]] * x[J1[e]]; q1 += H1[e + 1] * x[I1[e + 1]] * x[J1[e + 1]]; }
      if (e < e1) q0 += H1[e] * x[I1[e]] * x[J1[e]];
      let l = 0;
      for (let f = e1o[n], f1 = endE[n]; f < f1; f++) l += EV[f] * x[EI[f]];
      const q = q0 + q1, c = C[n];
      Q[n] = q; L[n] = l; V4 += 0.5 * c * q * q; V3 += 2 * c * q * l;
      y[n] = 2 * c * (q + 2 * l); z[n] = 2 * c * q;
    }
    const o2 = S.p2.off, N2 = S.p2.n, Q2 = S.p2.q, H2 = S.p2.h, end2 = this.end2, e2o = S.e2.off, EN = S.e2.n, EV2 = S.e2.v;
    for (let i = 0; i < N; i++) {
      let g0 = 0, g1 = 0, e = o2[i];
      const e1 = end2[i];
      for (; e + 1 < e1; e += 2) { g0 += y[N2[e]] * H2[e] * x[Q2[e]]; g1 += y[N2[e + 1]] * H2[e + 1] * x[Q2[e + 1]]; }
      if (e < e1) g0 += y[N2[e]] * H2[e] * x[Q2[e]];
      for (let f = e2o[i], f1 = e2o[i + 1]; f < f1; f++) g0 += z[EN[f]] * EV2[f];
      gv[i] = g0 + g1;
    }
    this.V3 = V3; this.V4 = V4; this.V = V3 + V4;
    return this.V;
  }

  // Consistency projection. The SAV update of ψ is only second-order accurate,
  // and if ψ drifts from √(2V + ε₀) the ε₀ "reservoir" can leak into the modes.
  // So each step ψ^{n−½} is reset to √(V(xⁿ) + V(xⁿ⁻¹) + ε₀) and the plate
  // velocity xⁿ − xⁿ⁻¹ is rescaled (by s ≈ 1) so that the scheme's energy
  // Σ ½(δx)² + ½ω̃² xⁿxⁿ⁻¹ + ψ²/2 is unchanged: the true energy then stays what
  // the mallet put in. The relative size of the correction is the error estimate.
  project(V) {
    const Vm = 0.5 * (V + this.Vprev);
    this.Vprev = V;
    // A dome struck hard can snap through: the cubic part of V_nl then goes far
    // below zero (most of the stretching energy is in the shell modes' stiffness).
    // ε₀ is only a reference level, so raise it, shifting ψ² with it.
    if (2 * Vm + this.eps0 < 0.25 * this.eps0) { const e = Math.max(2 * this.eps0, -8 * Vm); this.psi = Math.sign(this.psi) * Math.sqrt(this.psi * this.psi + e - this.eps0); this.eps0 = e; }
    const target = Math.sqrt(Math.max(2 * Vm + this.eps0, 1e-12 * this.eps0)), dE = 0.5 * (this.psi * this.psi - target * target);
    if (Math.abs(dE) < 1e-13 * this.eps0) { this.psi = target; return; }
    const { N, x, x1, A, phi } = this, ik2 = 1 / (this.h * this.h), m = this.hit;
    let a = 0, b = 0, c = 0, dw = 0;
    for (let i = 0; i < N; i++) { const d = x[i] - x1[i], w2 = (2 - A[i]) * ik2; a += d * d; b -= w2 * x[i] * d; c += w2 * x[i] * x[i]; dw += phi[i] * d; }
    a *= 0.5 * ik2; b *= 0.5; c *= 0.5;
    const Ep = a + b + c, rel = Math.abs(dE) / (Ep + 1e-30);
    if (rel > this.defect) this.defect = rel;
    if (m) { // mallet in flight or in contact: move its previous position with the surface's, so the
      // compression (and the contact energy) is unchanged; its kinetic energy joins the quadratic in s
      const M = 1 / m.Mi, p = (m.xm - m.xm1 - dw) / this.h, q = dw / this.h;
      a += 0.5 * M * q * q; b += M * p * q; c += 0.5 * M * p * p;
    }
    const disc = b * b - 4 * a * (c - (a + b + c) - dE);
    if (!(a > 0) || disc < 0) { this.defect = 1; return; } // no velocity scaling does it: keep ψ, flag
    const r = Math.sqrt(disc), s1 = (-b + r) / (2 * a), s2 = (-b - r) / (2 * a), s = Math.abs(s1 - 1) < Math.abs(s2 - 1) ? s1 : s2;
    this.psi = target;
    for (let i = 0; i < N; i++) x1[i] = x[i] - s * (x[i] - x1[i]);
    if (m) m.xm1 += (1 - s) * dw;
  }

  // One step of the scheme (size h): advances x, x1.
  step() {
    const N = this.N, x = this.x, x1 = this.x1, A = this.A, B = this.B, iD = this.iD, k2 = this.h * this.h;
    if (!this.nl && !this.hit) {
      for (let i = 0; i < N; i++) { const xn = A[i] * x[i] - B[i] * x1[i]; x1[i] = x[i]; x[i] = xn * iD[i]; }
      return;
    }
    const gv = this.gv, a0 = this.a0, c4 = 0.25 * k2;
    let gx1 = 0, gb = 0, ga0 = 0;
    if (this.nl) {
      const V = this.gradient(), it = 1 / Math.sqrt(Math.max(2 * V + this.eps0, 1e-12 * this.eps0));
      this.project(V);
      for (let i = 0; i < N; i++) { gv[i] *= it; gx1 += gv[i] * x1[i]; }
    } else gv.fill(0);
    const nlf = k2 * (this.psi - 0.25 * gx1);
    for (let i = 0; i < N; i++) {
      const a = (A[i] * x[i] - B[i] * x1[i] - nlf * gv[i]) * iD[i];
      a0[i] = a; gb += gv[i] * gv[i] * iD[i]; ga0 += gv[i] * a;
    }
    const den = 1 / (1 + c4 * gb), gX0 = ga0 * den;
    let F = 0, gX1 = 0;
    const h = this.hit, a1 = this.a1;
    if (h) {
      const phi = this.phi;
      let ga1 = 0;
      for (let i = 0; i < N; i++) { a1[i] = k2 * phi[i] * iD[i]; ga1 += gv[i] * a1[i]; }
      gX1 = ga1 * den;
      let w0 = 0, w1 = 0;
      for (let i = 0; i < N; i++) { const b = c4 * gv[i] * iD[i]; w0 += phi[i] * (a0[i] - b * gX0); w1 += phi[i] * (a1[i] - b * gX1); }
      const xmF = 2 * h.xm - h.xm1, dFree = xmF - w0, Meff = k2 * h.Mi + w1;
      const dp = contact(dFree, h.dm1, Meff, h.K);
      F = contactF(dp, h.dm1, h.K);
      h.xm1 = h.xm; h.xm = xmF - k2 * h.Mi * F; h.dm1 = h.d0; h.d0 = dp; this.lastF = F;
      if (F > 0) { h.touched = true; h.steps++; if (F > h.Fmax) h.Fmax = F; }
      h.t += this.h;
      if ((h.touched && F === 0 && dp < -1) || h.t > h.tmax) { this.contactMs = (h.steps * this.h * 1000) / this.g.w0; this.hit = null; }
    }
    let gdx = 0;
    for (let i = 0; i < N; i++) {
      const b = c4 * gv[i] * iD[i], xn = a0[i] - b * gX0 + (F ? F * (a1[i] - b * gX1) : 0);
      gdx += gv[i] * (xn - x1[i]);
      x1[i] = x[i]; x[i] = xn;
    }
    this.psi += 0.5 * gdx;
  }

  render(bl, br, n, eng) {
    const N = this.N, x = this.x, xs = this.xs, mL = this.mL, mR = this.mR;
    let peak = 0;
    for (let s = 0; s < n; s++) {
      xs.set(x);
      for (let j = 0; j < this.m; j++) this.step();
      let l = 0, r = 0;
      for (let i = 0; i < N; i++) { const v = x[i] - xs[i]; l += mL[i] * v; r += mR[i] * v; }
      bl[s] += l; br[s] += r;
      const a = l < 0 ? -l : l;
      if (a > peak) peak = a;
      if (this.nl && this.adapt) { // substep control
        if (this.defect > UP && this.m < MAX_SUB) this.setSub(2 * this.m);
        else if (this.m > 1 && this.defect < DOWN) { if ((this.calm += this.k / this.g.w0) > CALM) this.setSub(this.m / 2); }
        else this.calm = 0;
        this.defect = 0;
      }
    }
    this.age += n;
    this.peak = peak;
    if (!(peak < 1e3) || x[0] !== x[0]) { this.dead = true; eng.post?.({ type: 'error', message: `gong ${this.key}: numerical failure` }); return; }
    // pitch of the strike tone, from the phase advance of its modal coordinate (about its
    // slowly moving mean: a dome's quadratic stiffness gives it a static offset)
    const t = this.S.tuned, Om = this.S.Om[t], X = 0.5 * (x[t] + this.x1[t]), v = (x[t] - this.x1[t]) / this.h, dt = Om * this.k * n;
    this.dc += (1 - Math.exp(-dt / 25)) * (X - this.dc);
    const ph = Math.atan2(-v / Om, X - this.dc);
    if (this.phInit) {
      let d = ph - this.ph - dt;
      d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      this.cents += 0.25 * ((1200 / Math.LN2) * Math.log1p(d / dt) - this.cents);
    }
    this.ph = ph; this.phInit = true;
    if (this.nl) this.guard();
    if (this.nl && !this.hit) {
      const E = this.energy();
      if (E <= 0 || Math.abs(this.V4) + (this.V3 * this.V3) / E < NL_OFF * E) { this.nl = false; if (this.m > 1) this.setSub(1); }
    }
    if (!this.nl && !this.hit) {
      this.quiet = peak < (this.damped ? 1e-5 : 3e-6) ? this.quiet + 1 : 0;
      if (this.quiet > 40) this.dead = true;
    }
  }

  // view data: mode amplitudes (in thicknesses) and energy per octave band of the key's pitch
  snapshot(amp, band) {
    const { x, x1, h, S } = this;
    band.fill(0);
    let E = 0;
    for (let i = 0; i < this.N; i++) {
      const v = (x[i] - x1[i]) / h, X = 0.5 * (x[i] + x1[i]), Om = S.Om[i], e = 0.5 * (v * v + Om * Om * X * X);
      amp[i] = Math.sqrt(X * X + (v * v) / (Om * Om));
      const b = Math.max(0, Math.min(band.length - 1, Math.floor(Math.log2(Om / S.Om[S.tuned])) + 1));
      band[b] += e; E += e;
    }
    for (let i = this.N; i < amp.length; i++) amp[i] = 0;
    return E;
  }
}

// Contact: solve δ⁺ + M (Φ(δ⁺) − Φ(δ⁻))/(δ⁺ − δ⁻) = δ_free, Φ(δ) = K δ₊^{5/2}/(5/2).
const pot = (d, K) => (d > 0 ? 0.4 * K * d * d * Math.sqrt(d) : 0);
function contactF(d, dm, K) {
  if (d <= 0 && dm <= 0) return 0;
  const dd = d - dm;
  return Math.abs(dd) > 1e-12 * (1 + Math.abs(d)) ? (pot(d, K) - pot(dm, K)) / dd : d > 0 ? K * d * Math.sqrt(d) : 0;
}
function contact(dFree, dm, M, K) {
  if (dFree <= 0 && dm <= 0) return dFree;
  let hi = dFree, lo = dFree - M * contactF(dFree, dm, K) - 1e-12, d = dFree;
  for (let it = 0; it < 60; it++) {
    const F = contactF(d, dm, K), G = d - dFree + M * F;
    if (Math.abs(G) <= 1e-13 * (1 + Math.abs(dFree))) break;
    if (G > 0) hi = d; else lo = d;
    const e = 1e-7 * (1 + Math.abs(d)), dG = 1 + (M * (contactF(d + e, dm, K) - contactF(d - e, dm, K))) / (2 * e);
    let dn = d - G / dG;
    if (!(dn > lo && dn < hi)) dn = 0.5 * (lo + hi);
    if (hi - lo < 1e-15 * (1 + Math.abs(d))) break;
    d = dn;
  }
  return d;
}

// Polyphase interpolator (Kaiser-windowed sinc): a bus at fs/R → fs.
class Upsampler {
  constructor(R) {
    const L = R * TAPS, c = (L - 1) / 2, beta = 7.5, I0 = (v) => { let s = 1, t = 1; for (let j = 1; j < 30; j++) { t *= (v / (2 * j)) ** 2; s += t; } return s; };
    this.R = R; this.h = new Float64Array(L);
    for (let i = 0; i < L; i++) {
      const u = (i - c) / R, sinc = u === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u), w = I0(beta * Math.sqrt(Math.max(0, 1 - ((2 * i) / (L - 1) - 1) ** 2))) / I0(beta);
      this.h[i] = sinc * w;
    }
    for (let p = 0; p < R; p++) { let s = 0; for (let t = 0; t < TAPS; t++) s += this.h[p + R * t]; for (let t = 0; t < TAPS; t++) this.h[p + R * t] /= s; }
    this.hl = new Float64Array(2 * TAPS); this.hr = new Float64Array(2 * TAPS); this.w = 0;
    this.inL = new Float64Array(128); this.inR = new Float64Array(128); this.idle = 99;
  }
  run(m, L, R) { // m input samples from inL/inR → m·R outputs added to L, R
    const { h, hl, hr, inL, inR } = this, Rr = this.R;
    for (let j = 0; j < m; j++) {
      this.w = (this.w + 1) % TAPS;
      hl[this.w] = hl[this.w + TAPS] = inL[j]; hr[this.w] = hr[this.w + TAPS] = inR[j];
      const base = this.w + TAPS;
      for (let p = 0; p < Rr; p++) {
        let l = 0, r = 0;
        for (let t = 0; t < TAPS; t++) { const c = h[p + Rr * t]; l += c * hl[base - t]; r += c * hr[base - t]; }
        L[j * Rr + p] += l; R[j * Rr + p] += r;
      }
    }
  }
}

export class GongEngine {
  constructor(fs) {
    this.fs = fs;
    this.P = null;
    this.voices = [];
    this.sustain = false;
    this.buses = [null, null, null, null]; // R = 1, 2, 4, 8
    this.blocks = 0;
    this.focus = null;
    this.amp = new Float32Array(64); this.band = new Float32Array(6);
  }
  setParams(P) {
    const old = this.P;
    this.P = P;
    if (old && (old.eta !== P.eta || old.radiation !== P.radiation || old.thermal !== P.thermal || old.release !== P.release)) {
      for (const v of this.voices) {
        v.P = { ...v.P, eta: P.eta, radiation: P.radiation, thermal: P.thermal, release: P.release };
        v.g.loss = modeLoss(v.g, v.P); v.g.sigma = v.g.loss.map((l) => l.sigma);
        v.extra = 6.91 / P.release; v.setDamping();
      }
    }
    if (old && old.listen !== P.listen) for (const v of this.voices) v.setOutput(P);
  }
  setSustain(on) {
    this.sustain = on;
    if (!on) for (const v of this.voices) if (v.released && !v.damped) { v.damped = true; v.setDamping(); }
  }
  bus(R) {
    const i = Math.round(Math.log2(R));
    if (!this.buses[i]) this.buses[i] = new Upsampler(R);
    return this.buses[i];
  }
  add(v) { this.voices.push(v); this.bus(v.R); this.focus = v; return v; }
  noteOn(key, velocity) {
    if (!this.P) return;
    const P = this.P;
    let v = this.voices.find((u) => u.key === key && !u.killing && !u.dead);
    if (v && ['bc', 'rise', 'terms', 'thick', 'material'].some((id) => v.P[id] !== P[id])) { v.killing = true; v.setDamping(); v = null; }
    if (!v) v = this.add(new Voice(this, key, P));
    v.P = P; v.extra = 6.91 / P.release; v.setOutput(P);
    v.strike(Math.max(0.01, Math.min(1, velocity)), P);
    this.focus = v;
    const live = this.voices.filter((u) => !u.killing && !u.dead);
    if (live.length > MAX_VOICES) {
      let victim = null;
      for (const u of live) if (u !== v && (!victim || u.peak < victim.peak)) victim = u;
      if (victim) { victim.killing = true; victim.setDamping(); }
    }
  }
  noteOff(key) {
    for (const v of this.voices) if (v.key === key && !v.released) {
      v.released = true;
      if (!this.sustain) { v.damped = true; v.setDamping(); }
    }
  }
  handle(m) {
    if (m.type === 'pressure' && this.P) { // aftertouch: a hand pressed against the gong
      for (const v of this.voices) if (m.key === null || m.key === undefined || v.key === m.key) {
        v.extra = 6.91 / this.P.release + 40 * m.value; v.damped = v.released || m.value > 0.02; v.setDamping();
      }
    }
  }
  place(key, x0) { return this.add(new Voice(this, key, this.P)).setState(x0); } // a voice in a given state (tests)
  allNotesOff() { for (const v of this.voices) { v.killing = true; v.setDamping(); } }
  voiceCount() { return this.voices.length; }
  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    const B = this.buses, V = this.voices;
    for (let i = 0; i < B.length; i++) if (B[i]) { B[i].inL.fill(0, 0, n / B[i].R); B[i].inR.fill(0, 0, n / B[i].R); }
    for (let i = 0; i < V.length; i++) { const v = V[i], b = this.bus(v.R); v.render(b.inL, b.inR, n / v.R, this); b.idle = 0; }
    for (let i = 0; i < B.length; i++) if (B[i] && B[i].idle++ < 4) B[i].run(n / B[i].R, L, R);
    let j = 0;
    for (let i = 0; i < V.length; i++) if (!V[i].dead) V[j++] = V[i];
    V.length = j;
    if (this.post && ++this.blocks >= POST_BLOCKS) {
      this.blocks = 0;
      const f = this.focus;
      if (f && !f.dead) {
        const E = f.snapshot(this.amp, this.band);
        this.post({ type: 'gong', key: f.key, n: f.N, amp: this.amp, band: this.band, E, enl: E > 0 ? f.V / E : 0, cents: f.cents, nl: f.nl, sub: f.m, contact: f.contactMs, t: f.age / (this.fs / f.R) });
      }
    }
  }
}

globalThis.GongEngine = GongEngine;
