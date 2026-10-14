// gongs-engine.js — the real-time part. Runs in the AudioWorklet (through
// shared/worklet.js) and in Node (tests, renders).
//
// Each voice integrates one gong's shell modes, x_k (in thicknesses), with the
// nonlinear coupling V_nl from gongs-model.js and a Hertzian mallet:
//
//   (1+σ̃ₖh) xₖ⁺ − 2c̃ₖ xₖ + (1−σ̃ₖh) xₖ⁻ = h² Wₖ [ φₖ F − gₖ (ψ⁺ + ψ⁻)/2 ],    ψ⁺ = ψ⁻ + g·(x⁺ − x⁻)/2
//
// The linear part is the exact damped modal recursion (exact frequencies at any
// step h). The nonlinearity uses a scalar auxiliary variable (SAV): ψ ≈
// √(2V_nl + ε₀), g = ∇V_nl/√(2V_nl + ε₀) at xⁿ. Then
//   E = Σ (1/Wₖ) [½(δx)² + ½ ω̃² x⁺x] + ψ²/2 + mallet + contact
// is conserved exactly (σ = 0) for any g, so the scheme cannot blow up however
// hard the gong is hit, and x⁺ follows from a rank-one (Sherman–Morrison) solve:
// O(modes) beyond the cost of g. The contact force is the discrete gradient of
// the Hertz potential, solved by Newton together with the plate.
//
// The weights Wₖ = sinc²(Ωₖh) make that conserved plate term the physical energy
// ½Ωₖ²aₖ² of each mode (with Wₖ = 1 it would be sinc²(Ωₖh)·½Ωₖ²aₖ², and energy
// handed from the low modes to the top ones, where Ωh ≈ 2 and sinc² ≈ 0.2, would
// be multiplied up to five times). Wₖ = 1 + O(Ω²h²) changes nothing at the low
// modes.
//
// Accuracy: each step ψ is pinned to √(2V + ε₀) (energy-neutral, see project()),
// and the size of that correction is the error estimate: when it grows (a hard
// strike on a thin plate: deflections of several thicknesses) the voice halves
// its step, and returns to one when it calms down. Since the projection already
// keeps the energy right, this is capped (2 substeps, 2 voices at a time) so that
// no audio block costs much more than its neighbours.
//
// Voices run at fs/R (R = 2, 4 or 8, the lowest rate that holds all their modes
// below fs/3R, so Ωh ≤ 2.07); each rate has a bus and a polyphase interpolator
// back to fs.

import { keyPan } from '../../shared/dsp.js';
import { keyGong, modeLoss, mallet, rowEnds, interpR, shell, tablesId, MICS as MIC } from './gongs-model.js';
import { DEFAULTS } from './gongs-params.js';

const OUT = 0.14;         // output per m/s of surface velocity (at the strike tone's weight)
const TAPS = 24;          // interpolator taps per phase
const MAX_VOICES = 16;
// A voice runs linear once its nonlinear energy measure r = (|V₄| + V₃²/E)/E (held over a
// couple of periods, see render) is below NL_OFF: the pitch shift left is ~¾r (0.3 ¢), and the
// nonlinear exchange time ~1/(rω) is longer than the ring. A voice that is quiet (under
// −60 dB, or 30 dB below the loudest gong) goes linear already at r < NL_QUIET.
const NL_OFF = 2e-4, NL_QUIET = 1e-3, QUIET = 1e-3, MASKED = 0.03;
// Below LITE_R (pitch shifts under ~1 %) a voice uses only the strongest couplings (model.LITE).
const LITE_R = 1e-2;
// Substep control: per-step energy defect up/down thresholds, seconds of calm before
// stepping back, at most MAX_SUB substeps, and at most SUB_VOICES voices substepping at once.
const UP = 2e-2, DOWN = 2e-3, CALM = 0.02, MAX_SUB = 2, SUB_VOICES = 2;
// Passivity: the physical energy may not exceed what the mallets put in by more than SLACK,
// or by LAG while the auxiliary variable ψ lags V by a step (see project()).
const SLACK = 1e-6, LAG = 0.05, BLEED = 1e-3;
// The linear tail's statistics average over this many periods of the strike tone (see resetFit).
const FIT_PERIODS = 1.5;
// The output is soft-clipped above CLIP (towards 2·CLIP): a backstop that normal playing never reaches.
const CLIP = 2;
const POST_BLOCKS = 12;
const sinc2 = (t) => (t < 1e-4 ? 1 - (t * t) / 3 : (Math.sin(t) / t) ** 2);

class Voice {
  constructor(eng, key, P) {
    const g = keyGong(key, P, eng.fs, eng.shellFor(P)), S = g.S, N = g.Nv;
    this.eng = eng;
    this.g = g; this.S = S; this.key = key; this.N = N; this.R = g.R; this.k = g.k; this.P = P;
    const F = () => new Float64Array(N);
    this.x = F(); this.x1 = F(); this.xs = F(); this.gv = F(); this.a0 = F(); this.a1 = F();
    this.phi = F(); this.mL = F(); this.mR = F(); this.wd = F(); this.sg = F();
    // per step size k, k/2, k/4, k/8: the recursion, and the energy weights W = sinc²(Ωh)
    this.cf = [1, 2, 4, 8].map(() => ({ A: F(), B: F(), iD: F(), WD: F(), iW: F() }));
    this.Q = new Float64Array(S.NS); this.L = new Float64Array(S.NS); this.y = new Float64Array(S.NS); this.z = new Float64Array(S.NS);
    // running statistics of each mode's free vibration (mean; upward crossings of it: last time,
    // period, count; the previous sample), and the linear tail built from them (see linear())
    this.m1 = F(); this.m2 = F(); this.zt = F(); this.zT = F(); this.zn = F(); this.yp = F();
    this.tm = F(); this.tdw = F(); this.toff = F(); this.te0 = F(); this.tw = F();
    // the full coupling set while strongly nonlinear, the lite one (strongest terms only) in the tail
    const view = (c) => {
      const end1 = rowEnds(c.p1.off, c.p1.j, N, new Int32Array(S.NS));
      return { p1: c.p1, p2: c.p2, e1: c.e1, e2: c.e2, end1, end2: rowEnds(c.p2.off, c.p2.q, N, new Int32Array(N)),
        endE: rowEnds(c.e1.off, c.e1.i, N, new Int32Array(S.NS)), rows: Int32Array.from([...Array(S.NS).keys()].filter((n) => end1[n] > c.p1.off[n])) };
    };
    this.full = view(S.full); this.lite = view(S.lite); this.cs = this.full;
    this.vScale = g.h * g.w0; // m/s per unit of dx̄/dt̄
    this.setOutput(P);
    // Every field is created here, and every real-valued one starts as a double (−0 acts as 0
    // in all the arithmetic below, but V8 cannot store it as a small integer). The object's
    // hidden class then never changes later, which would de-optimise the hot loops mid-note.
    this.extra = -0; this.released = false; this.damped = false; this.killing = false; this.dead = false;
    this.m = 1; this.h = this.k; this.calm = -0; this.adapt = true; this.tail = false; this.n1 = -0; this.n2 = -0; this.lam = -0; this.tf = -0; this.fitting = false; this.wantFit = false; this.odd = false; this.armed = false;
    this.A = this.cf[0].A; this.B = this.cf[0].B; this.iD = this.cf[0].iD; this.WD = this.cf[0].WD; this.iW = this.cf[0].iW;
    this.nl = false; this.psi = -0; this.eps0 = 1.5; this.V = -0; this.Vprev = -0; this.V3 = -0; this.V4 = -0; this.defect = -0;
    this.hit = null; this.quiet = 0; this.age = 0; this.peak = -0; this.contactMs = -0; this.Einj = -0; this.guards = 0; this.lastF = -0; this.nlr = -0; this.v4max = -0; this.v3max = -0;
    this.ph = -0; this.cents = -0; this.phInit = false; this.dc = -0; this.KE = -0; this.vImpact = -0;
    this.setDamping();
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
  // the energy form of the scheme: c̃ = 2r cos(ω_d h)/(1+r²), σ̃h = (1−r²)/(1+r²), r = e^{−σh};
  // and the energy weight W = sinc²(Ωh) of each mode's forcing (stored as W/(1+σ̃h) and 1/W).
  setDamping() {
    const { k, N, g } = this, extra = this.killing ? 300 : this.damped ? this.extra : 0, E0 = this.nl ? this.energyD() : 0;
    for (let i = 0; i < N; i++) {
      const Om = g.S.Om[i], sg = (g.sigma[i] + extra) / g.w0;
      this.sg[i] = sg; this.wd[i] = Math.sqrt(Math.max(Om * Om - sg * sg, 1e-9));
    }
    this.cf.forEach((c, j) => {
      const h = k / (1 << j);
      for (let i = 0; i < N; i++) {
        const r = Math.exp(-this.sg[i] * h), st = (1 - r * r) / (1 + r * r), ct = (2 * r * Math.cos(this.wd[i] * h)) / (1 + r * r), W = sinc2(g.S.Om[i] * h);
        c.iD[i] = 1 / (1 + st); c.A[i] = 2 * ct; c.B[i] = 1 - st; c.WD[i] = W * c.iD[i]; c.iW[i] = 1 / W;
      }
    });
    this.use();
    if (this.tail) this.tailCoeffs();
    // the energy's discrete form depends (at O(σ²h²)) on the damping: re-reference the bound
    if (this.nl) { const dE = this.energyD() - E0; if (dE > 0) this.Einj += dE; }
  }
  use() { const c = this.cf[Math.round(Math.log2(this.m))]; this.A = c.A; this.B = c.B; this.iD = c.iD; this.WD = c.WD; this.iW = c.iW; this.h = this.k / this.m; this.lam = 1 - Math.exp((-2 * this.h * this.S.Om[this.S.tuned]) / (2 * Math.PI * FIT_PERIODS)); }
  // What the linear tail needs to know about each mode's free vibration, measured from the
  // moment the mallet leaves the plate:
  //   its mean position, a two-stage exponential average over FIT_PERIODS periods of the
  //   strike tone (m2/n2; its ripple at a mode's own frequency ω is 1/(1 + (ωτ)²), about 1 %
  //   at the tone);
  //   its frequency now, from the times of its upward crossings of that mean (zt the last one,
  //   zT the period, averaged over the last few, zn how many), in units of the reduced time
  //   tf. Crossings (with hysteresis for the tone, see fit) mostly ignore the harmonics a
  //   nonlinear mode carries. They run only while a hand-over may be forced (limitNonlinear).
  resetFit() { this.m1.fill(0); this.m2.fill(0); this.zt.fill(0); this.zT.fill(0); this.zn.fill(0); this.yp.set(this.x); this.n1 = -0; this.n2 = -0; this.tf = -0; this.armed = false; }
  mean(i) { return this.n2 > 0 ? this.m2[i] / this.n2 : 0; }
  // enough data: about 2.5 periods of the strike tone for the means, and three crossings of the tone
  fitted() { return this.n2 > 0.4 && this.zn[this.S.tuned] >= 3; }

  // Change the number of substeps. The previous state is moved to the new spacing
  // exactly for modal motion about a fixed offset u (the static response φF/Ω² to a
  // constant contact force F while the mallet touches, else each mode's running mean):
  //   u(−h') = e^{σh'} [u(0) sin ω(h−h') + u(−h) e^{−σh} sin ωh'] / sin ωh,
  // and for the mallet under its constant deceleration F/(πμ). The weighted energy is the
  // physical one, so this transfer keeps it to the accuracy of the modal picture; what is
  // left is removed (or restored) by rescaling the velocity, so the change is energy-neutral.
  setSub(m2) {
    const E0 = this.energyD(), h = this.h, h2 = this.k / m2, { x, x1, wd, sg, phi } = this, hit = this.hit, F = hit ? this.lastF : 0, Om = this.S.Om;
    for (let i = 0; i < this.N; i++) {
      const s = Math.sin(wd[i] * h), u = F ? (phi[i] * F) / (Om[i] * Om[i]) : this.nl ? this.mean(i) : 0;
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
    const dE = this.energyD() - E0;
    if (dE !== 0 && !this.rescale(dE) && dE > 0) this.Einj += dE; // (never needed in the tests)
  }

  // The scheme's energy: plate (discrete form, weighted: the physical ½Ω²a² per mode)
  // + (ψ² − ε₀)/2 + mallet and contact. Conserved, or decreasing with damping, by every
  // step and projection.
  energyD() {
    const { x, x1, h, A, iW, N } = this, m = this.hit;
    let E = 0;
    for (let i = 0; i < N; i++) { const v = (x[i] - x1[i]) / h; E += iW[i] * (0.5 * v * v + (0.5 * (2 - A[i]) * x[i] * x1[i]) / (h * h)); }
    if (this.nl) E += 0.5 * (this.psi * this.psi - this.eps0);
    if (m) { const u = (m.xm - m.xm1) / h; E += (0.5 * u * u) / m.Mi + 0.5 * (pot(m.d0, m.K) + pot(m.dm1, m.K)); }
    return E;
  }

  // Rescale the plate velocity xⁿ − xⁿ⁻¹ by s (the mallet's previous position moves with the
  // surface, so the contact is untouched; its kinetic energy joins the quadratic in s) so that
  // the scheme's energy changes by −dE. The s nearest 1; false if there is none.
  rescale(dE) {
    const { N, x, x1, A, iW, phi } = this, ik2 = 1 / (this.h * this.h), m = this.hit;
    let a = 0, b = 0, c = 0, dw = 0;
    for (let i = 0; i < N; i++) { const d = x[i] - x1[i], w2 = (2 - A[i]) * ik2 * iW[i]; a += iW[i] * d * d; b -= w2 * x[i] * d; c += w2 * x[i] * x[i]; dw += phi[i] * d; }
    a *= 0.5 * ik2; b *= 0.5; c *= 0.5;
    if (m) { const M = 1 / m.Mi, p = (m.xm - m.xm1 - dw) / this.h, q = dw / this.h; a += 0.5 * M * q * q; b += M * p * q; c += 0.5 * M * p * p; }
    const disc = b * b - 4 * a * (c - (a + b + c) + dE);
    if (!(a > 0) || disc < 0) return false;
    const r = Math.sqrt(disc), s1 = (-b + r) / (2 * a), s2 = (-b - r) / (2 * a), s = Math.abs(s1 - 1) < Math.abs(s2 - 1) ? s1 : s2;
    for (let i = 0; i < N; i++) x1[i] = x[i] - s * (x[i] - x1[i]);
    if (m) m.xm1 += (1 - s) * dw;
    return true;
  }

  // Passivity guard, a last resort: the gong cannot hold more energy than the mallets gave
  // it. The weighted scheme conserves the physical energy, so this only catches what the
  // projection could not do (see project()): a plate driven so far (tens of thicknesses)
  // that a step no longer resolves it. The excess is taken out of the velocity, or, if that
  // is not enough, the whole motion is scaled down (x and xⁿ⁻¹ together, so the sound has no
  // step in it) until it holds no more than that. Each time the bound is also lowered by
  // BLEED: a gong the scheme cannot follow dies away instead of ringing on in a state the
  // model no longer describes. Counted in this.guards; the tests check that it never acts
  // for the presets.
  guard(E) {
    this.guards++;
    this.Einj *= 1 - BLEED;
    if (this.rescale(E - this.Einj)) return;
    const { x, x1 } = this;
    let c = Math.sqrt(Math.max(0, this.Einj / Math.max(E, 1e-30)));
    for (let it = 0; it < 9; it++) {
      if (it === 8) c = 0;
      for (let i = 0; i < this.N; i++) { x[i] *= c; x1[i] *= c; }
      this.gradient(); this.Vprev = this.V;
      this.eps0 = Math.max(this.eps0, -8 * this.V);
      this.psi = Math.sqrt(Math.max(2 * this.V + this.eps0, 1e-12 * this.eps0));
      if (this.energyD() <= this.Einj) return;
      c = 0.7;
    }
  }

  energy() { // plate energy (reduced units)
    let E = 0;
    const { x, x1, h, S } = this;
    for (let i = 0; i < this.N; i++) { const v = (x[i] - x1[i]) / h, X = 0.5 * (x[i] + x1[i]); E += 0.5 * (v * v + S.Om[i] * S.Om[i] * X * X); }
    return E;
  }
  // mode i's squared amplitude about its offset, for a (discrete) sinusoid at its present frequency
  tailAmp2(i) {
    const { x, x1, h, tm } = this, X = 0.5 * (x[i] + x1[i]) - tm[i], d = x[i] - x1[i], th = 0.5 * this.tw[i] * h;
    const c = Math.cos(th), s = Math.sin(th);
    return (X * X) / (c * c) + (d * d) / (4 * s * s);
  }

  strike(vel, P) {
    const ml = mallet(this.g, P, vel), S = this.S, rs = P.strike;
    if (this.tail) { this.tail = false; this.setDamping(); } // the coefficients go back to the linear ones
    // resolve the contact with ≥ 6 steps (at most 4 substeps): Hertz contact time of the mallet
    // on a rigid flat (a lower bound; the plate's own give lengthens it), 3.218 (M²/(K² v))^{1/5}.
    // The discrete-gradient contact conserves energy at any step; this only shapes the pulse.
    const tc = 3.218 * ((Math.PI * ml.mu) ** 2 / (ml.K * ml.K * Math.max(ml.vbar, 1e-6))) ** 0.2;
    let m = 1;
    while (m < MAX_SUB && (6 * this.k) / m > tc) m *= 2;
    if (m > this.m) this.setSub(m);
    for (let i = 0; i < this.N; i++) this.phi[i] = interpR(S.R[i], rs); // on the line θ = 0
    let w = 0, w1 = 0;
    for (let i = 0; i < this.N; i++) { w += this.phi[i] * this.x[i]; w1 += this.phi[i] * this.x1[i]; }
    const vb = ml.vbar, h = this.h;
    // the mallet starts one step short of the surface, moving at v̄ (plus the surface's own motion)
    const xm = w - vb * h, xm1 = xm - vb * h - (w - w1);
    this.hit = { K: ml.K, Mi: 1 / (Math.PI * ml.mu), xm, xm1, d0: xm - w, dm1: xm1 - w1, touched: false, t: -0, tmax: (6 * Math.PI) / S.Om[S.tuned], Fmax: -0, steps: 0 };
    const KE = 0.5 * Math.PI * ml.mu * vb * vb;
    this.gradient(); this.Vprev = this.V;
    this.eps0 = 2 * (this.energy() + Math.abs(this.V) + KE) + 1e-12;
    this.psi = Math.sqrt(Math.max(2 * this.V + this.eps0, 1e-12 * this.eps0));
    this.resetFit();
    this.nl = true; this.nlr = -0; this.v4max = -0; this.v3max = -0; this.released = false; this.damped = false; this.setDamping();
    if (this.cs !== this.full) { this.cs = this.full; this.gradient(); this.Vprev = this.V; }
    this.age = 0; this.phInit = false; this.vImpact = ml.v; this.KE = KE;
    this.Einj = this.energyD();
  }

  // Start from a given displacement, at rest (tests: free vibration of chosen modes).
  setState(x0) {
    this.x.fill(0); this.x1.fill(0); this.tail = false;
    for (let i = 0; i < Math.min(this.N, x0.length); i++) this.x[i] = this.x1[i] = x0[i] || 0;
    this.gradient(); this.Vprev = this.V;
    this.eps0 = 2 * (this.energy() + Math.abs(this.V)) + 1e-12;
    this.psi = Math.sqrt(2 * this.V + this.eps0);
    this.nl = true; this.hit = null; this.phInit = false; this.Einj = this.energyD();
    return this;
  }

  // V_nl(x) and g = ∇V_nl (into gv), over this key's modes. Returns V.
  gradient() {
    const c = this.cs, x = this.x, Q = this.Q, L = this.L, y = this.y, z = this.z, C = this.S.C, gv = this.gv, N = this.N;
    const o1 = c.p1.off, IJ = c.p1.ij, H1 = c.p1.h, e1o = c.e1.off, EI = c.e1.i, EV = c.e1.v, end1 = c.end1, endE = c.endE, rows = c.rows;
    let V3 = 0, V4 = 0;
    for (let r = 0; r < rows.length; r++) {
      const n = rows[r];
      let q0 = 0, q1 = 0, e = o1[n];
      const e1 = end1[n];
      for (; e + 1 < e1; e += 2) { // (i, j) packed as i·256 + j
        const a = IJ[e], b = IJ[e + 1];
        q0 += H1[e] * x[a >> 8] * x[a & 255]; q1 += H1[e + 1] * x[b >> 8] * x[b & 255];
      }
      if (e < e1) { const a = IJ[e]; q0 += H1[e] * x[a >> 8] * x[a & 255]; }
      let l = 0;
      for (let f = e1o[n], f1 = endE[n]; f < f1; f++) l += EV[f] * x[EI[f]];
      const q = q0 + q1, cn = C[n];
      Q[n] = q; L[n] = l; V4 += 0.5 * cn * q * q; V3 += 2 * cn * q * l;
      y[n] = 2 * cn * (q + 2 * l); z[n] = 2 * cn * q;
    }
    const o2 = c.p2.off, NQ = c.p2.nq, H2 = c.p2.h, end2 = c.end2, e2o = c.e2.off, EN = c.e2.n, EV2 = c.e2.v;
    for (let i = 0; i < N; i++) {
      let g0 = 0, g1 = 0, e = o2[i];
      const e1 = end2[i];
      for (; e + 1 < e1; e += 2) { // (n, q) packed as n·256 + q
        const a = NQ[e], b = NQ[e + 1];
        g0 += y[a >> 8] * H2[e] * x[a & 255]; g1 += y[b >> 8] * H2[e + 1] * x[b & 255];
      }
      if (e < e1) { const a = NQ[e]; g0 += y[a >> 8] * H2[e] * x[a & 255]; }
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
  // Σ (1/W)[½(δx)² + ½ω̃² xⁿxⁿ⁻¹] + ψ²/2 is unchanged: the true energy then stays what
  // the mallet put in. The relative size of the correction is the error estimate.
  // It is also the passivity check, every step: what the scheme holds is compared with
  // what the mallets gave it (see guard()).
  project(V) {
    const Vm = 0.5 * (V + this.Vprev);
    this.Vprev = V;
    // A dome struck hard can snap through: the cubic part of V_nl then goes far
    // below zero (most of the stretching energy is in the shell modes' stiffness).
    // ε₀ is only a reference level, so raise it, shifting ψ² with it.
    if (2 * Vm + this.eps0 < 0.25 * this.eps0) { const e = Math.max(2 * this.eps0, -8 * Vm); this.psi = Math.sign(this.psi) * Math.sqrt(this.psi * this.psi + e - this.eps0); this.eps0 = e; }
    const target = Math.sqrt(Math.max(2 * Vm + this.eps0, 1e-12 * this.eps0)), dE = 0.5 * (this.psi * this.psi - target * target);
    const { N, x, x1, A, iW, phi } = this, ik2 = 1 / (this.h * this.h), m = this.hit;
    let a = 0, b = 0, c = 0, dw = 0;
    for (let i = 0; i < N; i++) { const d = x[i] - x1[i], w2 = (2 - A[i]) * ik2 * iW[i]; a += iW[i] * d * d; b -= w2 * x[i] * d; c += w2 * x[i] * x[i]; dw += phi[i] * d; }
    a *= 0.5 * ik2; b *= 0.5; c *= 0.5;
    const Ep = a + b + c, rel = Math.abs(dE) / (Ep + 1e-30);
    if (rel > this.defect) this.defect = rel;
    let contact = 0;
    if (m) { // mallet in flight or in contact: move its previous position with the surface's, so the
      // compression (and the contact energy) is unchanged; its kinetic energy joins the quadratic in s
      const M = 1 / m.Mi, p = (m.xm - m.xm1 - dw) / this.h, q = dw / this.h;
      a += 0.5 * M * q * q; b += M * p * q; c += 0.5 * M * p * p;
      contact = 0.5 * (pot(m.d0, m.K) + pot(m.dm1, m.K));
    }
    let s = 1, ok = true;
    if (Math.abs(dE) >= 1e-13 * this.eps0) {
      const disc = b * b - 4 * a * (c - (a + b + c) - dE);
      // No velocity scaling does it (near a turning point the plate has little motion to
      // give): keep ψ for now, flag it.
      if (!(a > 0) || disc < 0) { this.defect = 1; ok = false; }
      else {
        const r = Math.sqrt(disc), s1 = (-b + r) / (2 * a), s2 = (-b - r) / (2 * a);
        s = Math.abs(s1 - 1) < Math.abs(s2 - 1) ? s1 : s2;
        for (let i = 0; i < N; i++) x1[i] = x[i] - s * (x[i] - x1[i]);
        if (m) m.xm1 += (1 - s) * dw;
      }
    }
    if (ok) this.psi = target;
    // The physical energy (plate + V_nl at these steps + mallet), whether or not ψ caught up.
    // A kept ψ can only lag by a step's worth; if V outruns the motion for good (a scheme that
    // can no longer follow the plate), what it would invent is taken out here.
    const E = a * s * s + b * s + c + contact + 0.5 * (target * target - this.eps0);
    if (E > (ok ? 1 + SLACK : 1 + LAG) * this.Einj + 1e-12 * this.eps0) { this.psi = target; this.guard(E); }
  }

  // One step of the scheme (size h): advances x, x1.
  step() {
    const N = this.N, x = this.x, x1 = this.x1, A = this.A, B = this.B, iD = this.iD, k2 = this.h * this.h;
    if (!this.nl && !this.hit) {
      if (this.tail) { const o = this.toff; for (let i = 0; i < N; i++) { const xn = A[i] * x[i] - B[i] * x1[i]; x1[i] = x[i]; x[i] = xn * iD[i] + o[i]; } return; }
      for (let i = 0; i < N; i++) { const xn = A[i] * x[i] - B[i] * x1[i]; x1[i] = x[i]; x[i] = xn * iD[i]; }
      return;
    }
    const gv = this.gv, a0 = this.a0, WD = this.WD, c4 = 0.25 * k2;
    let gx1 = 0, gb = 0, ga0 = 0;
    if (this.nl) {
      this.gradient();
      const v4 = this.V4 < 0 ? -this.V4 : this.V4, v3 = this.V3 * this.V3;
      if (v4 > this.v4max) this.v4max = v4;
      if (v3 > this.v3max) this.v3max = v3;
      this.project(this.V);
      // g = ∇V/√(2V + ε₀), with the ε₀ (and the x) the projection leaves
      const it = 1 / Math.sqrt(Math.max(2 * this.V + this.eps0, 1e-12 * this.eps0));
      for (let i = 0; i < N; i++) { gv[i] *= it; gx1 += gv[i] * x1[i]; }
    } else gv.fill(0);
    const nlf = k2 * (this.psi - 0.25 * gx1);
    for (let i = 0; i < N; i++) {
      const u = gv[i] * WD[i], a = (A[i] * x[i] - B[i] * x1[i]) * iD[i] - nlf * u;
      a0[i] = a; gb += gv[i] * u; ga0 += gv[i] * a;
    }
    const den = 1 / (1 + c4 * gb), gX0 = ga0 * den;
    let F = 0, gX1 = 0;
    const h = this.hit, a1 = this.a1;
    if (h) {
      const phi = this.phi;
      let ga1 = 0;
      for (let i = 0; i < N; i++) { a1[i] = k2 * phi[i] * WD[i]; ga1 += gv[i] * a1[i]; }
      gX1 = ga1 * den;
      let w0 = 0, w1 = 0;
      for (let i = 0; i < N; i++) { const b = c4 * gv[i] * WD[i]; w0 += phi[i] * (a0[i] - b * gX0); w1 += phi[i] * (a1[i] - b * gX1); }
      const xmF = 2 * h.xm - h.xm1, dFree = xmF - w0, Meff = k2 * h.Mi + w1;
      const dp = contact(dFree, h.dm1, Meff, h.K);
      F = contactF(dp, h.dm1, h.K);
      h.xm1 = h.xm; h.xm = xmF - k2 * h.Mi * F; h.dm1 = h.d0; h.d0 = dp; this.lastF = F;
      if (F > 0) { h.touched = true; h.steps++; if (F > h.Fmax) h.Fmax = F; }
      h.t += this.h;
      if ((h.touched && F === 0 && dp < -1) || h.t > h.tmax) { this.contactMs = (h.steps * this.h * 1000) / this.g.w0; this.hit = null; this.resetFit(); }
    }
    let gdx = 0;
    for (let i = 0; i < N; i++) {
      const b = c4 * gv[i] * WD[i], xn = a0[i] - b * gX0 + (F ? F * (a1[i] - b * gX1) : 0);
      gdx += gv[i] * (xn - x1[i]);
      x1[i] = x[i]; x[i] = xn;
    }
    this.psi += 0.5 * gdx;
    if (this.fitting && (this.odd = !this.odd)) this.fit();
  }
  // Running statistics for the linear tail (see resetFit), sampled every other step: the
  // mean, and upward crossings of it (yp the previous sample). Every mode has Ωh ≤ 2.07,
  // so at two steps none aliases onto the mean; the top modes' crossings may alias, and
  // linear() then leaves them at their own frequency.
  // The strike tone's crossings are counted with hysteresis (only after it has been below
  // its mean by 0.3 of its amplitude), so that the harmonics it carries in a crash cannot
  // add crossings.
  fit() {
    const { N, x, x1, yp, m1, m2, zt, zT, zn } = this, l = this.lam, tf = this.tf, dt = 2 * this.h, t = this.S.tuned;
    const n1 = (this.n1 += l * (1 - this.n1)), n2 = (this.n2 += l * (n1 - this.n2)), in2 = 1 / n2;
    for (let i = 0; i < N; i++) {
      const xi = x[i], u = (m1[i] += l * (xi - m1[i])), m = (m2[i] += l * (u - m2[i])) * in2, y = yp[i] - m, yn = xi - m;
      if (y < 0 && yn >= 0 && (i !== t || this.armed)) {
        const tc = tf + (dt * y) / (y - yn);
        if (zn[i] > 1) zT[i] += 0.3 * (tc - zt[i] - zT[i]); else if (zn[i] > 0) zT[i] = tc - zt[i];
        zt[i] = tc; zn[i]++;
        if (i === t) this.armed = false;
      }
      yp[i] = xi;
      if (i === t && !this.armed) { const v = (xi - x1[i]) / (this.h * this.S.Om[t]); if (yn < 0 && yn * yn > 0.09 * (yn * yn + v * v)) this.armed = true; }
    }
    this.tf = tf + dt;
  }

  render(bl, br, n, eng) {
    const N = this.N, x = this.x, xs = this.xs, mL = this.mL, mR = this.mR;
    if (this.tail) this.tailCoeffs();
    // the statistics for a hand-over run only while one may be forced (see limitNonlinear)
    if (this.nl && this.wantFit !== this.fitting) { this.fitting = this.wantFit; if (this.fitting) this.resetFit(); }
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
        if (this.defect > (eng.warming ? -1 : UP) && this.m < MAX_SUB && eng.subVoices < SUB_VOICES) { this.setSub(2 * this.m); eng.subVoices++; }
        else if (this.m > 1 && this.defect < (eng.warming ? Infinity : DOWN)) { if ((this.calm += this.k / this.g.w0) > CALM) this.setSub(this.m / 2); }
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
    if (eng.warming === 1 && this.nl) this.guard(this.energyD() + 1); // (only to compile it)
    // r = (|V₄| + V₃²/E)/E is instantaneous: it nearly vanishes as the strike tone crosses zero.
    // So take its largest value over the block's steps, held for about two periods of the tone.
    if (this.nl) {
      const E = Math.max(this.energy(), 1e-30), r = (this.v4max + this.v3max / E) / E;
      this.nlr = Math.max(r, this.nlr * Math.exp((-n * this.k * this.S.Om[this.S.tuned]) / (4 * Math.PI)));
      this.v4max = -0; this.v3max = -0;
      const quiet = peak < QUIET || peak < MASKED * eng.loudest;
      if (!this.hit && (this.nlr < (eng.warming === 2 ? Infinity : NL_OFF) || (this.nlr < NL_QUIET && quiet))) this.linear();
      else if (!this.hit) { // weakly nonlinear: the lite coupling set (ψ is re-synced, energy-neutrally, by the next projection)
        const cs = this.nlr < (eng.warming === 3 ? Infinity : LITE_R) ? this.lite : this.nlr > 2 * LITE_R ? this.full : this.cs;
        if (cs !== this.cs) { this.cs = cs; this.gradient(); this.Vprev = this.V; }
      }
    }
    if (!this.nl && !this.hit) {
      this.quiet = peak < (this.damped ? 1e-5 : 3e-6) ? this.quiet + 1 : 0;
      if (this.quiet > 40) this.dead = true;
    }
  }

  // From here on the voice rings linearly (exact modal decay), continuing its motion where
  // the nonlinear one left it. Each mode keeps the frequency and the mean position it had,
  // both measured over its last few periods (see resetFit). Each mode's frequency shift then
  // fades with its own energy, as a nonlinear shift ∝ a² would, so a gong cut off from its
  // coupling mid-glide carries on gliding, without a jump in pitch; and since the motion
  // is continued about its own mean, a dome that has snapped through rings about its new
  // shape instead of being flung back. (The mean itself is held: it does not sound.) A mode
  // that is not oscillating near its own frequency (a weak mode only driven by the others)
  // goes back to it.
  linear() {
    if (this.m > 1) this.setSub(1);
    this.nl = false; this.nlr = 0;
    const { N, tm, tdw, wd, zt, zT, zn, tf } = this, ok = this.fitted();
    let any = false;
    for (let i = 0; i < N; i++) {
      tm[i] = ok ? this.mean(i) : 0; tdw[i] = 0;
      if (!ok || zn[i] < 3 || tf - zt[i] > 2 * zT[i]) continue;
      const w = (2 * Math.PI) / zT[i];
      if (w > 0.6 * wd[i] && w < 1.6 * wd[i]) tdw[i] = w - wd[i];
    }
    for (let i = 0; i < N; i++) if (tm[i] !== 0 || tdw[i] !== 0) any = true;
    // (a gong that falls below NL_OFF by itself, unmeasured, is linear to 0.3 ¢: the plain path)
    if (any) this.beginTail(); else this.tail = false;
  }
  beginTail() {
    for (let i = 0; i < this.N; i++) { this.tw[i] = this.wd[i] + this.tdw[i]; this.te0[i] = this.tailAmp2(i); }
    this.tail = true; this.tailCoeffs();
  }
  // The tail's recursion for the present amplitudes (called every block while it rings): each
  // mode's shift is scaled by its squared amplitude relative to the start, ω = ω_d + (a/a₀)² Δω.
  tailCoeffs() {
    const { N, A, B, iD, wd, sg, h, tdw, tm, toff, te0, tw } = this;
    for (let i = 0; i < N; i++) {
      const r = Math.exp(-sg[i] * h), f = tdw[i] !== 0 && te0[i] > 0 ? Math.min(1, this.tailAmp2(i) / te0[i]) : 0;
      tw[i] = wd[i] + f * tdw[i];
      A[i] = (4 * r * Math.cos(tw[i] * h)) / (1 + r * r);
      toff[i] = tm[i] * (1 - (A[i] - B[i]) * iD[i]);
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
    this.buses = [1, 2, 4, 8].map((R) => new Upsampler(R)); // all allocated here, none on the audio thread later
    this.blocks = 0;
    this.focus = null;
    this.amp = new Float32Array(64); this.band = new Float32Array(6);
    this.subVoices = 0; this.warming = 0; this.post = null; this.loudest = -0; this.loud = -0;
    this.tables = new Map(); // coupling tables sent by the page (model.engineTables), by tablesId
    this.warmUp();
  }
  // Run every hot path (noteOn, strike, contact, nonlinear steps, substeps, linear steps,
  // the nonlinear-voice limit, the interpolators) through process() on scratch buffers, so
  // that the JIT has compiled them and the default tables exist before the first real
  // note; then forget it all.
  warmUp() {
    const L = new Float32Array(128), R = new Float32Array(128);
    this.process(L, R, 128); // before any parameters arrive, as in the worklet
    this.P = { ...DEFAULTS, nlvoices: 1 };
    this.post = () => {}; // the view messages too (and post is then not a constant to V8)
    this.noteOn(57, 1); this.noteOn(45, 0.5); this.noteOn(50, 0.7);
    for (let i = 0; i < 160; i++) {
      // forced phases take every substep switch, the guard and the switch to the linear path
      // through their usual branches; the normal phases in between take the common ones
      this.warming = i < 25 ? 1 : i < 45 ? 0 : i < 55 ? 3 : i < 70 ? 2 : 0;
      // both linear paths: a tail with a shifted frequency and an offset (Voice.linear), and plain modes
      if (i === 72) this.voices.forEach((v, j) => {
        if (v.nl || v.hit) return;
        if (j % 2) { v.tail = false; v.setDamping(); } else { v.tdw[v.S.tuned] = 1e-9 * v.wd[v.S.tuned]; v.tm[v.S.tuned] = 1e-9; v.beginTail(); }
      });
      if (i === 90) this.allNotesOff(); // and voices fading out and being removed
      this.process(L, R, 128);
    }
    this.warming = 0;
    this.voices = []; this.focus = null; this.P = null; this.post = null; this.blocks = 0; this.subVoices = 0;
    for (const u of this.buses) { u.hl.fill(0); u.hr.fill(0); u.inL.fill(0); u.inR.fill(0); u.idle = 99; }
  }
  // The coupling tables for P. The page builds them (a few ms per change of Dome rise,
  // Coupling terms or Rim) and sends them with the parameters that ask for them, so the
  // audio thread only looks them up. Without the page (Node) they are built here, once.
  shellFor(P) { return this.tables.get(tablesId(P)) ?? shell(P.bc, P.rise, P.terms); }
  setParams(P) {
    const old = this.P;
    this.P = P;
    if (P.tables) {
      this.tables.set(P.tables.id, P.tables);
      if (this.tables.size > 24) this.tables.delete(this.tables.keys().next().value);
    } else this.shellFor(P); // fetch (or build) them now, not at the next strike
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
  bus(R) { return this.buses[R === 1 ? 0 : R === 2 ? 1 : R === 4 ? 2 : 3]; }
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
  // Polyphony of the expensive part: at most P.nlvoices gongs run their nonlinear
  // coupling at once. Beyond that the one whose nonlinearity matters least (smallest r)
  // carries on linearly (Voice.linear): it keeps ringing, its cascade frozen where it is
  // and its pitch gliding home with its energy, without a jump.
  // A gong is handed over only once its free motion has been measured for a few periods (see
  // Voice.linear). At the cap, the two gongs next in line (the least nonlinear; a third
  // keeps measuring until it falls further behind) measure it, so that the next strike finds
  // one ready; over the cap, all do. (The cap may be exceeded for those few periods.)
  limitNonlinear() {
    const V = this.voices, cap = Math.max(1, this.P?.nlvoices ?? 4);
    let count = 0;
    for (let i = 0; i < V.length; i++) if (V[i].nl && !V[i].killing) count++;
    while (count > cap) {
      let w = null;
      for (let i = 0; i < V.length; i++) { const v = V[i]; if (v.nl && !v.killing && !v.hit && v.fitted() && (!w || v.nlr < w.nlr)) w = v; }
      if (!w) break;
      w.linear(); count--;
    }
    for (let i = 0; i < V.length; i++) {
      const v = V[i];
      if (count < cap || !v.nl || v.killing || v.hit) { v.wantFit = false; continue; }
      let rank = 0;
      for (let j = 0; j < V.length; j++) { const u = V[j]; if (u !== v && u.nl && !u.killing && !u.hit && u.nlr < v.nlr) rank++; }
      v.wantFit = count > cap || rank < 2 || (v.fitting && rank < 3); // (over the cap: all, to hand one over soonest)
    }
  }
  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    this.limitNonlinear();
    const B = this.buses, V = this.voices;
    this.subVoices = 0;
    for (let i = 0; i < V.length; i++) if (V[i].m > 1) this.subVoices++;
    this.loudest = this.loud; this.loud = -0; // the loudest voice's peak in the last block, for masking
    for (let i = 0; i < B.length; i++) { B[i].inL.fill(0, 0, n / B[i].R); B[i].inR.fill(0, 0, n / B[i].R); }
    for (let i = 0; i < V.length; i++) { const v = V[i], b = this.bus(v.R); v.render(b.inL, b.inR, n / v.R, this); b.idle = 0; if (v.peak > this.loud) this.loud = v.peak; }
    for (let i = 0; i < B.length; i++) if (B[i].idle++ < 4) B[i].run(n / B[i].R, L, R);
    // backstop: a soft clip above CLIP, towards 2·CLIP (normal playing stays far below it)
    for (let i = 0; i < n; i++) {
      const l = L[i], r = R[i];
      if (l > CLIP || l < -CLIP) L[i] = Math.sign(l) * CLIP * (1 + Math.tanh(Math.abs(l) / CLIP - 1));
      if (r > CLIP || r < -CLIP) R[i] = Math.sign(r) * CLIP * (1 + Math.tanh(Math.abs(r) / CLIP - 1));
    }
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
