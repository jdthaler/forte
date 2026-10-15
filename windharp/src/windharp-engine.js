// windharp-engine.js — the real-time Wind Harp. Runs in the AudioWorklet (through shared/worklet.js)
// and in Node (tests, renders).
//
//   wind U(t) = slider (smoothed) × (1 + gusts) × (1 + aftertouch)
//        │
//        ▼  per key: a shutter slides along the string and uncovers it
//   wake stations q_j ──lift ¼ρU²DC_L0 q_j──▶ string modes a_n ──T∂Y/∂x──▶ bridge ──▶ soundbox ──▶ two mics
//        ▲                                       │
//        └────────── (A/D) Ÿ(x_j) ◀──────────────┘          and the lift itself radiates (a dipole)
//
// Each step (one sample): the string's modal accelerations give each station's acceleration; each
// station's van der Pol wake advances by leapfrog (its velocity a half step ahead), with its own
// damping εΩ(q² − r)q̇ taken as the mean of the old and new velocity (so a large swing cannot blow
// up) and its frequency prewarped, Ω_d = (2/h) sin(Ωh/2), so that its linear part rings at Ω
// exactly. The lift that results is projected onto the modes, and each mode advances exactly
// under a force that runs linearly from the old lift to the new (first-order hold), so that the
// loop has no half-sample delay. With J = N stations at the midpoints x_j = (j + ½)L/J the
// projections are an exact discrete sine transform, split by symmetry into odd and even modes.
//
// A low string steps at a half or a quarter of the sample rate while ωh stays under WH_MAX for its top
// mode and its fastest shedding, and its force and lift are interpolated back to the sample rate.
//
// The wind and everything that follows from it (Ω, the onset r, the lift's size, the flow's damping)
// are worked out at the ends of each 128-sample block and ramped linearly across it. The gusts are
// two Ornstein–Uhlenbeck processes stepped once a block, seeded.
//
// One voice per key: a course of one or two strings (two from C5 up) behind one
// shutter. Pressing a sounding key reopens its shutter on the same strings. Beyond MAX_VOICES the
// quietest key not held (or, failing that, the quietest held), never one under 50 ms old, fades out
// over 30 ms. A changed n₀, tuning or winding gives the next press new strings and fades the old.

import { keyPan, Biquad } from '../../shared/dsp.js';
import {
  TAU, AIR, WAKE, U_REF, U_MAX, courseDesign, strouhal, onset, vdpKappa, shutterOpen, shutterClose, BOX, boxGain, KEY_LO, KEY_HI,
  GUST, homeHarmonic, shedding,
} from './windharp-model.js';

const OUT = 6.2;              // output units per pascal at 1 m
const MAX_VOICES = 12;        // keys sounding at once
const FADE = 0.03;            // s: a stolen key fades out over this
const YOUNG = 0.05;           // s: a key this young is never stolen
const GLIDE = 0.06;           // s: the wind slider glides
const AFTER = 0.5;            // full aftertouch raises the wind by this fraction
const POST_BLOCKS = 4;        // post the views' data every 4 blocks
const LINE_LO = 0.002, LINE_HI = 0.015; // the free wake's relative line width (FWHM) for Re ≤ 180 and Re ≥ 1000 (the model's choice)
const WH_MAX = 0.4;           // a string steps at 1/2 or 1/4 of the sample rate while ω h stays under this for its top mode and its fastest shedding

// xorshift32: seeded, so renders repeat exactly; uniform in [−0.5, 0.5)
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 - 0.5; }; }

// Exact response of ä + 2ζωȧ + ω²a = g(t) over one step h, with g running linearly from g0 to g1:
//   a' = p11 a + p12 v + a0 g0 + a1 g1,   v' = p21 a + p22 v + b0 g0 + b1 g1
// (x' = Φx + (Γ0 − Γ1) g0 + Γ1 g1, Γ0 = A⁻¹(Φ − I)b, Γ1 = [(1/h) A⁻²(Φ − I) − A⁻¹] b).
function foh(w, z, h, out, o) {
  const wd = w * Math.sqrt(1 - z * z), e = Math.exp(-z * w * h), c = Math.cos(wd * h), s = Math.sin(wd * h), zw = z * w;
  const p11 = e * (c + (zw / wd) * s), p12 = (e * s) / wd, p21 = (-e * w * w * s) / wd, p22 = e * (c - (zw / wd) * s);
  const w2 = w * w;
  // A⁻¹ = [[−2ζω, −1], [ω², 0]]/ω²; A⁻¹ b = [−1/ω², 0]
  const i11 = (-2 * zw) / w2, i12 = -1 / w2, i21 = 1, i22 = 0;
  // M = Φ − I; Γ0 = A⁻¹ M b = A⁻¹ [p12, p22 − 1]
  const m1 = p12, m2 = p22 - 1;
  const g0a = i11 * m1 + i12 * m2, g0v = i21 * m1 + i22 * m2;
  // A⁻² M b = A⁻¹ Γ0
  const s0a = i11 * g0a + i12 * g0v, s0v = i21 * g0a + i22 * g0v;
  const g1a = s0a / h + 1 / w2, g1v = s0v / h; // − A⁻¹ b = [1/ω², 0]
  out[o] = p11; out[o + 1] = p12; out[o + 2] = p21; out[o + 3] = p22;
  out[o + 4] = g0a - g1a; out[o + 5] = g1a; out[o + 6] = g0v - g1v; out[o + 7] = g1v;
}

// One string: its modes, its wake stations and their exposure to the wind.
class Str {
  constructor(eng, key, S) {
    this.key = key; this.S = S; this.eng = eng;
    // modes kept: below 0.42 fs, at least one
    let N = 0;
    while (N < S.N && S.f[N] < 0.42 * eng.fs) N++;
    N = Math.max(1, N);
    const J = N, Jh = J >> 1, odd = J & 1;
    this.N = N; this.J = J; this.Jh = Jh; this.odd = odd;
    this.a = new Float64Array(N); this.v = new Float64Array(N); this.gOld = new Float64Array(N); this.acc = new Float64Array(N);
    this.w = new Float64Array(N); this.w2 = new Float64Array(N); this.cv = new Float64Array(N); this.co = new Float64Array(8 * N); // ω, ω², 2ζω, FOH coefficients
    this.kb = new Float64Array(N);                                              // bridge force per unit modal displacement: T nπ/L
    for (let n = 0; n < N; n++) { this.w[n] = TAU * S.f[n]; this.w2[n] = this.w[n] ** 2; this.kb[n] = (S.T * (n + 1) * Math.PI) / S.L; }
    // φ_nj = sin(nπ(j + ½)/J) for the stations j < J/2 (the rest by symmetry): by mode, and by station for each parity
    const No = (N + 1) >> 1, Ne = N >> 1;
    this.No = No; this.Ne = Ne;
    this.phi = new Float64Array(N * Math.max(1, Jh)); this.phiMid = new Float64Array(N);
    this.phiO = new Float64Array(Math.max(1, Jh) * No); this.phiE = new Float64Array(Math.max(1, Jh) * Math.max(1, Ne));
    this.accO = new Float64Array(No); this.accE = new Float64Array(Math.max(1, Ne));
    for (let n = 0; n < N; n++) {
      for (let j = 0; j < Jh; j++) {
        const p = Math.sin(((n + 1) * Math.PI * (j + 0.5)) / J);
        this.phi[n * Jh + j] = p;
        if (n & 1) this.phiE[j * Ne + (n >> 1)] = p; else this.phiO[j * No + (n >> 1)] = p;
      }
      this.phiMid[n] = odd ? Math.sin(((n + 1) * Math.PI) / 2) : 0;
    }
    this.q = new Float64Array(J); this.qv = new Float64Array(J); this.ya = new Float64Array(J);
    this.sp = new Float64Array(Math.max(1, Jh)); this.sm = new Float64Array(Math.max(1, Jh));
    this.e = new Float64Array(J); this.de = new Float64Array(J);
    const rand = rng(eng.seed * 7919 + key * 104729 + S.idx * 31);
    this.rs = ((eng.seed * 2654435761) ^ (key * 40503) ^ (S.idx * 977) ^ 0x9e3779b9) | 1; // the turbulence's own seeded stream (xorshift32)
    for (let j = 0; j < J; j++) this.q[j] = 1e-3 * rand(); // the stagnant air's leftover swirl
    // per-sample ramped scalars: [Ω_d², εΩ, r, kl (lift → modal acceleration), noise]
    this.k0 = new Float64Array(5); this.k1 = new Float64Array(5); this.dk = new Float64Array(5); this.started = false;
    this.Ad = eng.rigid ? 0 : WAKE.A / S.D; // a rigid string (tests): the wake of a fixed cylinder
    this.Ucur = 0; this.Om = 0; this.Re = 0; this.r = 0; this.zetaAt = -1; this.OmAt = -1;
    this.home = homeHarmonic(S);
    this.fb = new Float64Array(128); this.dip = new Float64Array(128); // this block's bridge force (N) and lift (N)
    this.x = 0; this.target = 0; // its shutter's position and target (the voice's, copied each block)
    // its own step: the sample period × D (1, 2 or 4), as long as ω h stays under WH_MAX for its top mode
    // and its shedding at 1.5 × the top wind; its force and lift are brought back to the sample rate by
    // linear interpolation
    const wTop = Math.max(this.w[N - 1], TAU * shedding(1.5 * U_MAX, S.D).fs);
    this.Dmax = 1;
    while (this.Dmax < 4 && wTop * eng.h * this.Dmax * 2 <= WH_MAX) this.Dmax *= 2;
    this.D = this.Dmax; this.hs = eng.h * this.D;
    this.fbs = new Float64Array(128); this.dips = new Float64Array(128); this.fbLast = 0; this.dipLast = 0;
  }

  // the wind-dependent numbers at wind U (end of this block), the shutter moving from x0 to x1, and the modes' coefficients
  prepare(U, n, P, x0, x1, target) {
    // the step: D samples (a block that D does not divide is stepped sample by sample)
    const D = n % this.Dmax === 0 ? this.Dmax : 1;
    if (D !== this.D) { this.D = D; this.hs = this.eng.h * D; this.zetaAt = -1; }
    const S = this.S, eng = this.eng, h = this.hs, k1 = this.k1, J = this.J;
    n /= D;
    // the shedding at this wind (as shedding() in the model, without making an object)
    const Uu = Math.max(U, 0.05), Re = (Uu * S.D) / AIR.nu, rOn = onset(Re), Om = (TAU * strouhal(Re) * Uu) / S.D / vdpKappa(WAKE.eps * Math.max(rOn, 0));
    const open = x0, sw = Math.sin(0.5 * Om * h), line = LINE_LO + (LINE_HI - LINE_LO) * Math.min(1, Math.max(0, (Re - 180) / 820));
    k1[0] = (4 / (h * h)) * sw * sw;
    k1[1] = eng.epsW * Om;
    k1[2] = rOn;
    k1[3] = eng.rigid ? 0 : (0.25 * AIR.rho * U * U * S.D * WAKE.CL0 * 2) / (S.m * J);
    k1[4] = eng.noise * Math.max(0, Math.min(1, rOn)) * Math.sqrt(24 * 4 * line * Om ** 3 * h); // intensity s = 4 × line width; none in a steady (laminar) wake
    if (!this.started) { this.k0.set(k1); this.started = true; }
    const inv = 1 / n;
    for (let i = 0; i < 5; i++) this.dk[i] = (k1[i] - this.k0[i]) * inv;
    this.Ucur = U; this.Om = Om; this.Re = Re; this.r = rOn;
    // the shutter moves; each station's exposure ramps across the block
    const x = x1;
    for (let j = 0; j < J; j++) { const e1 = Math.min(1, Math.max(0, x * J - j)); this.de[j] = (e1 - this.e[j]) * inv; }
    this.x = x; this.target = target;
    // the flow's damping r_f = γΩρD² over the uncovered span joins the string's own (recomputed when either moves)
    const zeta = 1 / (2 * P.q), mean = 0.5 * (open + x);
    if (Math.abs(zeta - this.zetaAt) > 1e-9 || Math.abs(Om * mean - this.OmAt) > 1e-6 * Om + 1e-9) {
      const rf = WAKE.gamma * Om * AIR.rho * S.D * S.D * mean;
      for (let m = 0; m < this.N; m++) { const z = Math.min(0.5, zeta + rf / (2 * S.m * this.w[m])); foh(this.w[m], z, h, this.co, 8 * m); this.cv[m] = 2 * z * this.w[m]; }
      this.zetaAt = zeta; this.OmAt = Om * mean;
    }
  }

  // A shut string whose wake has died rings on by itself: just its modes (no wake, no lift).
  quiet() {
    if (this.x !== 0 || this.target !== 0) return false;
    let m = 0;
    for (let j = 0; j < this.J; j++) m = Math.max(m, Math.abs(this.q[j]), Math.abs(this.qv[j]) / (this.Om + 1));
    return m < 1e-7;
  }
  ring(n) {
    const N = this.N, a = this.a, v = this.v, co = this.co, kb = this.kb, fb = this.fbs, dip = this.dips;
    for (let m = 0; m < N; m++) this.gOld[m] = 0;
    for (let i = 0; i < n; i++) {
      let F = 0;
      for (let m = 0; m < N; m++) { const o = 8 * m, am = a[m], vm = v[m], an = co[o] * am + co[o + 1] * vm; v[m] = co[o + 2] * am + co[o + 3] * vm; a[m] = an; F += kb[m] * an; }
      fb[i] = F; dip[i] = 0;
    }
  }

  // run a block of n samples: n/D steps of its own, then back to the sample rate (linear interpolation)
  run(n) {
    const D = this.D, ns = n / D;
    if (this.quiet()) this.ring(ns); else this.step(ns);
    const fbs = this.fbs, dips = this.dips, fb = this.fb, dip = this.dip;
    if (D === 1) { for (let i = 0; i < n; i++) { fb[i] = fbs[i]; dip[i] = dips[i]; } }
    else {
      let f0 = this.fbLast, d0 = this.dipLast, i = 0;
      const inv = 1 / D;
      for (let k = 0; k < ns; k++) {
        const f1 = fbs[k], d1 = dips[k], df = (f1 - f0) * inv, dd = (d1 - d0) * inv;
        for (let r = 1; r <= D; r++, i++) { fb[i] = f0 + df * r; dip[i] = d0 + dd * r; }
        f0 = f1; d0 = d1;
      }
    }
    this.fbLast = fbs[ns - 1]; this.dipLast = dips[ns - 1];
  }

  // n steps of the string and its wake; writes the bridge force and lift into fbs, dips
  step(n) {
    const N = this.N, J = this.J, Jh = this.Jh, odd = this.odd, h = this.hs, No = this.No, Ne = this.Ne;
    const a = this.a, v = this.v, gOld = this.gOld, co = this.co, cv = this.cv, w2 = this.w2, kb = this.kb;
    const phi = this.phi, phiO = this.phiO, phiE = this.phiE, phiMid = this.phiMid, accO = this.accO, accE = this.accE;
    const q = this.q, qv = this.qv, ya = this.ya, e = this.e, de = this.de, sp = this.sp, sm = this.sm;
    const k0 = this.k0, dk = this.dk, Ad = this.Ad, fb = this.fbs, dip = this.dips;
    let Ow2 = k0[0], eO = k0[1], r = k0[2], kl = k0[3], nz = k0[4], rs = this.rs;
    const dOw2 = dk[0], deO = dk[1], dr = dk[2], dkl = dk[3], dnz = dk[4];
    const hh = 0.5 * h, U32 = 2.3283064365386963e-10;
    for (let i = 0; i < n; i++) {
      Ow2 += dOw2; eO += deO; r += dr; kl += dkl; nz += dnz;
      // 1. modal accelerations now (the lift is gOld), split into odd and even harmonics
      for (let k = 0, m = 0; k < No; k++, m += 2) accO[k] = gOld[m] - cv[m] * v[m] - w2[m] * a[m];
      for (let k = 0, m = 1; k < Ne; k++, m += 2) accE[k] = gOld[m] - cv[m] * v[m] - w2[m] * a[m];
      // 2. the stations' accelerations Σ_n φ_nj ä_n: odd harmonics symmetric about the middle, even antisymmetric
      for (let j = 0; j < Jh; j++) {
        let so = 0, se = 0;
        const oo = j * No, oe = j * Ne;
        for (let k = 0; k < No; k++) so += phiO[oo + k] * accO[k];
        for (let k = 0; k < Ne; k++) se += phiE[oe + k] * accE[k];
        ya[j] = so + se; ya[J - 1 - j] = so - se;
      }
      if (odd) { let so = 0; for (let k = 0; k < No; k++) so += phiMid[2 * k] * accO[k]; ya[Jh] = so; }
      // 3. the wake at each station (leapfrog; damping by the mean of old and new velocity; turbulence)
      let lift = 0;
      for (let j = 0; j < J; j++) {
        const ej = e[j] + de[j]; e[j] = ej;
        rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5;
        const qj = q[j], c = eO * (qj * qj - (ej * r - (1 - ej))) * hh;
        const vj = (qv[j] * (1 - c) + h * (Ad * ej * ya[j] - Ow2 * qj) + nz * ej * ((rs >>> 0) * U32 - 0.5)) / (1 + c);
        qv[j] = vj;
        const qn = qj + h * vj; q[j] = qn;
        ya[j] = ej * qn; lift += ya[j]; // ya now holds the lift's pattern f_j = e_j q_j
      }
      for (let j = 0; j < Jh; j++) { const f1 = ya[j], f2 = ya[J - 1 - j]; sp[j] = f1 + f2; sm[j] = f1 - f2; }
      // 4. the lift on each mode (the same transform back, odd and even harmonics apart), and 5. each mode's exact step
      let F = 0;
      const fm = odd ? ya[Jh] : 0;
      for (let m = 0; m < N; m++) {
        let g = 0;
        const o0 = m * Jh, src = m & 1 ? sm : sp;
        for (let j = 0; j < Jh; j++) g += phi[o0 + j] * src[j];
        g = (g + phiMid[m] * fm) * kl;
        const o = 8 * m, am = a[m], vm = v[m], g0 = gOld[m];
        const an = co[o] * am + co[o + 1] * vm + co[o + 4] * g0 + co[o + 5] * g;
        v[m] = co[o + 2] * am + co[o + 3] * vm + co[o + 6] * g0 + co[o + 7] * g;
        a[m] = an; gOld[m] = g;
        F += kb[m] * an;
      }
      fb[i] = F; dip[i] = lift;
    }
    k0[0] = Ow2; k0[1] = eO; k0[2] = r; k0[3] = kl; k0[4] = nz; this.rs = rs;
  }
}

// One key: a course of strings behind one shutter.
class Voice {
  constructor(eng, key, designs, version) {
    this.key = key; this.version = version; this.eng = eng;
    this.strings = designs.map((S) => new Str(eng, key, S));
    this.S = designs[0];
    this.x = 0; this.target = 0; this.rate = 0; this.held = false; this.pedal = false;
    this.fading = false; this.fade = 1; this.dead = false; this.age = 0; this.env = 0; this.press = 0; this.pressS = 0;
    // the box: pressure at 1 m per newton at its bridge point; the microphones by the bass and treble ends hear it panned
    this.pb = boxGain(key);
    [this.gl, this.gr] = keyPan(key, 0.6, KEY_LO, KEY_HI);
    this.liftPrev = 0;
  }
  open(velocity) { this.target = 1; this.rate = 1 / shutterOpen(velocity); this.held = true; }
  close(velocity) { this.target = 0; this.rate = 1 / shutterClose(velocity); this.held = false; }
}

export class WindHarpEngine {
  constructor(fs, seed = 1, opts = {}) {
    this.fs = fs; this.h = 1 / fs; this.seed = seed; this.P = null;
    this.epsW = opts.eps ?? WAKE.eps;         // the wake's ε (tests may turn it down to see the linear coupled-mode growth)
    this.noise = opts.noise ?? 1;             // scales the wake's turbulence (tests)
    this.rigid = !!opts.rigid;                // hold every string still: the wakes of fixed cylinders (tests)
    this.voices = []; this.byKey = new Map(); this.version = 0; this.designKey = '';
    this.sustain = false; this.chanPress = 0; this.chanS = 0; this.dom = { n: 1, amp: 0 };
    this.rand = rng(seed * 31337 + 7);
    // wind: slider glide, gusts (two OU processes), the result
    this.Uw = U_REF; this.started = false; this.g1 = 0; this.g2 = 0; this.U = U_REF; this.Ug = 0;
    // the soundbox: the flat (mass-like) path per key, and the box's low resonances on the summed force
    this.bp = BOX.modes.map((md) => new Biquad().set('bp', md.f, md.Q, fs));
    this.flatL = new Float64Array(128); this.flatR = new Float64Array(128); this.mono = new Float64Array(128);
    this.dipL = new Float64Array(128); this.dipR = new Float64Array(128);
    this.fbSum = new Float64Array(128); this.dipSum = new Float64Array(128);
    // the top's radiation efficiency, (1 + s/ω₁)/(1 + s/ω₂), by the bilinear transform with both corners prewarped
    const pw = (f) => 2 * fs * Math.tan((Math.PI * f) / fs), K = 2 * fs, w1 = pw(BOX.shelf.f1), w2 = pw(BOX.shelf.f2), a0 = 1 + K / w2;
    this.shelf = new Float64Array([(1 + K / w1) / a0, (1 - K / w1) / a0, (1 - K / w2) / a0]); this.shelfZ = new Float64Array(2);
    this.focus = null; this.blocks = 0;
    this.msg = {
      type: 'harp', U: 0, Uw: 0, key: -1, N: 0, J: 0, a: new Float64Array(16), v: new Float64Array(16), w: new Float64Array(16),
      q: new Float64Array(16), qv: new Float64Array(16), e: new Float64Array(16), Om: 0, D: 0, L: 0, lock: 0, home: 0, amp: 0, voices: 0, x: 0, Uv: 0, Re: 0, course: 1,
      keys: new Float64Array(MAX_VOICES * 3 + 6), nk: 0,
    };
  }

  setParams(P) {
    this.P = P;
    const dk = `${P.n0}|${P.tuning}|${P.unison}|${P.mass}`;
    if (dk !== this.designKey) { this.designKey = dk; this.version++; }
    if (!this.started) { this.Uw = P.wind; this.started = true; }
  }

  design(key) { return courseDesign(key, this.P); }

  noteOn(key, velocity = 0.7) {
    if (!this.P) return;
    let v = this.byKey.get(key);
    if (v && (v.dead || v.fading || v.version !== this.version)) { if (!v.dead) v.fading = true; v = null; }
    if (!v) {
      v = new Voice(this, key, this.design(key), this.version);
      this.voices.push(v); this.byKey.set(key, v);
      let live = 0;
      for (const u of this.voices) if (!u.fading && !u.dead) live++;
      if (live > MAX_VOICES) {
        let victim = null, score = Infinity;
        for (const u of this.voices) {
          if (u === v || u.fading || u.dead || u.age < YOUNG) continue;
          const s = (u.held || u.pedal ? 1e6 : 0) + u.env;
          if (s < score) { score = s; victim = u; }
        }
        if (victim) victim.fading = true;
      }
    }
    v.pedal = false;
    v.open(velocity);
    this.focus = v;
  }

  noteOff(key, velocity) {
    const v = this.byKey.get(key);
    if (!v || !v.held) return;
    if (this.sustain) { v.held = false; v.pedal = true; return; }
    v.close(velocity);
  }

  setSustain(on) {
    this.sustain = on;
    if (!on) for (const v of this.voices) if (v.pedal) { v.pedal = false; v.close(); }
  }

  allNotesOff() { for (const v of this.voices) { v.fading = true; v.held = false; v.target = 0; } }
  voiceCount() { let n = 0; for (let i = 0; i < this.voices.length; i++) if (!this.voices[i].dead) n++; return n; }

  handle(m) {
    if (m.type === 'pressure') {
      if (m.key === null || m.key === undefined) this.chanPress = m.value;
      else { const v = this.byKey.get(m.key); if (v) v.press = m.value; }
    }
  }

  gauss() { let s = 0; for (let k = 0; k < 4; k++) s += this.rand(); return s * Math.sqrt(3); } // ≈ unit normal (sum of 4 uniforms)

  // the wind at the end of a block of n samples: slider glide, gusts, aftertouch (all gliding)
  wind(n) {
    const P = this.P, dt = n * this.h;
    this.Uw += (P.wind - this.Uw) * (1 - Math.exp(-dt / GLIDE));
    const I = P.gust, Tu = P.gustTime, t1 = Tu, t2 = Tu / GUST.ratio, w2 = GUST.w2;
    if (I > 0) {
      const e1 = Math.exp(-dt / t1), e2 = Math.exp(-dt / t2);
      this.g1 = this.g1 * e1 + Math.sqrt(1 - e1 * e1) * this.gauss();
      this.g2 = this.g2 * e2 + Math.sqrt(1 - e2 * e2) * this.gauss();
    } else { this.g1 *= 0.99; this.g2 *= 0.99; }
    this.Ug = Math.sqrt(1 - w2) * this.g1 + Math.sqrt(w2) * this.g2; // unit variance
    const kp = 1 - Math.exp(-dt / GLIDE);
    this.chanS += (this.chanPress - this.chanS) * kp;
    for (let i = 0; i < this.voices.length; i++) { const v = this.voices[i]; v.pressS += (v.press - v.pressS) * kp; }
    const U = this.Uw * (1 + I * this.Ug) * (1 + AFTER * this.chanS);
    this.U = Math.max(0.05, Math.min(1.5 * U_MAX, U));
    return this.U;
  }

  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    if (!this.P) return;
    const P = this.P, U = this.wind(n), fs = this.fs;
    const flatL = this.flatL, flatR = this.flatR, mono = this.mono, dipL = this.dipL, dipR = this.dipR;
    flatL.fill(0, 0, n); flatR.fill(0, 0, n); mono.fill(0, 0, n); dipL.fill(0, 0, n); dipR.fill(0, 0, n);
    const fadeK = 1 - this.h / FADE;
    const dipGain = 1 / (4 * Math.PI * AIR.c * BOX.r); // p = (cos θ/4πcr) dF/dt, cos θ = 1 (the listener faces the board)
    for (let vi = 0; vi < this.voices.length; vi++) {
      const v = this.voices[vi];
      if (v.dead) continue;
      const Uv = U * (1 + AFTER * v.pressS);
      // the shutter moves
      const x0 = v.x;
      if (v.x !== v.target) { const step = v.rate * n * this.h; v.x = v.target > v.x ? Math.min(v.target, v.x + step) : Math.max(v.target, v.x - step); }
      const fb = this.fbSum, dip = this.dipSum, strs = v.strings, ns = strs.length;
      fb.fill(0, 0, n); dip.fill(0, 0, n);
      let wq = 0;
      for (let si = 0; si < ns; si++) {
        const st = strs[si], S = st.S;
        st.prepare(Uv, n, P, x0, v.x, v.target);
        st.run(n);
        // lift per unit Σ e q: ¼ρU²D C_L0 Δx, each station's span heard as incoherent cells of the correlation length, √(ℓ_c Δx)
        const dx = S.L / st.J, lg = 0.25 * AIR.rho * Uv * Uv * S.D * WAKE.CL0 * Math.sqrt(Math.min(1, S.lc / dx)) * dx * dipGain * fs;
        const sfb = st.fb, sdip = st.dip;
        for (let i = 0; i < n; i++) { fb[i] += sfb[i]; dip[i] += lg * sdip[i]; }
        for (let j = 0; j < st.J; j++) wq += st.q[j] * st.q[j];
      }
      // the key's outputs: its bridge force into the box; its lift radiated as a dipole
      const pb = v.pb, gl = v.gl, gr = v.gr;
      let fade = v.fade, env = v.env, prev = v.liftPrev;
      for (let i = 0; i < n; i++) {
        if (v.fading) fade *= fadeK;
        const F = fb[i] * fade, p = pb * F;
        flatL[i] += gl * p; flatR[i] += gr * p; mono[i] += p;
        const l = dip[i] * fade, d = l - prev; prev = l;
        dipL[i] += gl * d; dipR[i] += gr * d;
        const af = F < 0 ? -F : F;
        env = af > env ? af : env * 0.9997;
      }
      v.fade = fade; v.env = env; v.liftPrev = prev; v.age += n / fs;
      // retire: faded, or shut and silent
      const S = v.S;
      if (v.fading && fade < 1e-4) v.dead = true;
      if (!v.fading && v.target === 0 && v.x === 0 && env < 1e-7 * (S.T / S.L) * S.D && wq < 1e-6) v.dead = true;
    }
    // the box's resonances on the summed (centre) pressure, and the mix
    const md = BOX.modes, bp = this.bp, nm = md.length, sh = this.shelf, sz = this.shelfZ;
    for (let i = 0; i < n; i++) {
      const x = mono[i];
      let l = flatL[i], r = flatR[i];
      for (let k = 0; k < nm; k++) { const y = (md[k].G - 1) * bp[k].run(x); l += md[k].sign[0] * y * 0.7071; r += md[k].sign[1] * y * 0.7071; }
      // the top's radiation efficiency (first-order shelf, one per microphone)
      const yl = sh[0] * l + sz[0], yr = sh[0] * r + sz[1];
      sz[0] = sh[1] * l - sh[2] * yl; sz[1] = sh[1] * r - sh[2] * yr;
      L[i] = OUT * (yl + dipL[i]); R[i] = OUT * (yr + dipR[i]);
    }
    // drop dead voices in place (no allocation)
    let j = 0;
    for (let i = 0; i < this.voices.length; i++) { const v = this.voices[i]; if (!v.dead) this.voices[j++] = v; else if (this.byKey.get(v.key) === v) this.byKey.delete(v.key); }
    this.voices.length = j;
    if (this.focus && this.focus.dead) this.focus = null;
    if (this.post && ++this.blocks >= POST_BLOCKS) { this.blocks = 0; this.postState(); }
  }

  // the dominant mode of a string (a voice's first, if given a voice) and its amplitude; into a reused object
  dominant(v, out = this.dom) {
    if (v.strings) v = v.strings[0];
    let best = 0, be = -1;
    for (let m = 0; m < v.N; m++) { const e = v.v[m] * v.v[m] + v.w[m] * v.w[m] * v.a[m] * v.a[m]; if (e > be) { be = e; best = m; } }
    out.n = best + 1; out.amp = Math.sqrt(Math.max(0, be)) / v.w[best];
    return out;
  }

  postState() {
    const m = this.msg, f = this.focus;
    m.U = this.U; m.Uw = this.Uw; m.voices = this.voiceCount();
    if (f) {
      const s0 = f.strings[0], d = this.dominant(s0);
      m.key = f.key; m.N = s0.N; m.J = s0.J; m.Om = s0.Om; m.D = s0.S.D; m.L = s0.S.L; m.lock = d.n; m.amp = d.amp / s0.S.D; m.home = s0.home; m.x = f.x; m.Uv = s0.Ucur; m.Re = s0.Re; m.course = f.strings.length;
      for (let i = 0; i < s0.N; i++) { m.a[i] = s0.a[i]; m.v[i] = s0.v[i]; m.w[i] = s0.w[i]; }
      for (let i = 0; i < s0.J; i++) { m.q[i] = s0.q[i]; m.qv[i] = s0.qv[i]; m.e[i] = s0.e[i]; }
    } else m.key = -1;
    let nk = 0;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (v.dead || nk >= MAX_VOICES + 2) continue;
      const d = this.dominant(v.strings[0]);
      m.keys[3 * nk] = v.key; m.keys[3 * nk + 1] = d.n; m.keys[3 * nk + 2] = d.amp / v.S.D; nk++;
    }
    m.nk = nk;
    this.post(m);
  }
}

globalThis.WindHarpEngine = WindHarpEngine;
