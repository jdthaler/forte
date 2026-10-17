// pianet-model.js — the physics of a sticky-pad reed piano (after the Hohner
// Pianet), free of audio and DOM so that the page, the engine, the tests and
// the render tool can all use it.
//
//            key down ⇒ the holder rises at speed V
//                ▲
//            ┌───┴───┐  holder h(t)
//            │ foam  │  spring k_p ∥ dashpot c_p (Kelvin–Voigt)
//            └▀▀▀▀▀▀▀┘  tacky face, bonded to the reed over a disc of radius a
//   ▓▓══════════════════▆▆  reed: steel strip + solder (modes q_n, reed.js)
//   clamp           x_c  ▔▔  pickup at the tip: magnet pole (T) or plate (N)
//
// 1. Reed: clamped–free strip with a solder tip mass, length solved per key.
// 2. Pad: massless face on a foam spring and dashpot. Pressing the key lifts
//    the holder; the bonded face drags the reed up.
// 3. Adhesion: the bond is a flat circular contact. Its edge is a crack, with
//    energy release rate G = F²/(8π a³ E*) (Kendall 1971). The crack moves
//    when G exceeds the rate-dependent work of adhesion,
//        G = G₀ [1 + (v/v₀)ⁿ]   ⇔   v = v₀ (G/G₀ − 1)^(1/n)
//    (Gent & Schultz 1972; Maugis & Barquins 1978). As the disc shrinks at
//    constant load G grows like a⁻³, so the peel runs away: the reed snaps
//    free. A faster key loads the bond before the crack can respond, so it
//    lets go at a larger force: rate-dependent tack, i.e. touch sensitivity.
// 4. Key up: the pad lands on the moving reed (unilateral contact, foam
//    damping, the bond re-forming with dwell time) and chokes it.
// 5. Pickups (see emFlux, esCap).

import { keyFreq } from '../../shared/dsp.js';
import { unitReed, STEEL } from './reed.js';

export const KEY_LO = 36, KEY_HI = 96;
const TAU = 2 * Math.PI;

// Reed family: graded thickness and solder ratio, width fixed. r = M_solder / (reed mass).
export const REED = {
  b: 3.0e-3, hBass: 0.75e-3, hTreble: 0.45e-3, rBass: 1.6, rTreble: 0.3,
  blob: 0.12,     // solder length / reed length (mass centre at 1 − blob/2)
  xPad: 0.8,      // pad position / reed length
  nModes: 8,
};
// Thermoelastic damping of steel (Zener): relaxation strength Δ = E α² T / c_v,
// peak at f_TED = π D_th / (2 h²).
export const TED = { delta: (2.0e11 * 1.2e-5 ** 2 * 293) / 3.6e6, Dth: 1.2e-5 };
export const AIR_SIGMA = 0.4;    // s⁻¹, air drag + radiation, lumped

// Pad and bond. The face is a 3 × 3 mm patch: equal-area disc radius a₀.
export const PAD = {
  a0: Math.sqrt(9e-6 / Math.PI), // m
  Estar: 1.0e6,   // Pa, contact modulus of the face (silicone / leather on foam)
  v0: 0.01,       // m/s, crack speed at which the work of adhesion doubles
  aMin: 0.03,     // bond gone when a < aMin·a₀
  heal: 0.005,    // s, time for a pressed face to re-wet the reed (dwell)
  preload: 0.02,  // N, pad resting on the reed
  travel: 5e-3,   // m, holder lift at the bottom of the key stroke
  vRet: 0.25,     // m/s, key return speed (spring)
};
// Key speed at the pad for velocity 0..1: 3 cm/s (pp) … 40 cm/s (ff).
export const keySpeed = (vel) => 0.03 * (40 / 3) ** Math.min(1, Math.max(0, vel));

// Kendall's flat punch: static pull-off force of a bond of radius a.
export const pullOffStatic = (a, F0) => F0 * (a / PAD.a0) ** 1.5;
// Work of adhesion at zero rate implied by the tack F₀ (J/m²).
export const workOfAdhesion = (F0) => (F0 * F0) / (8 * Math.PI * PAD.a0 ** 3 * PAD.Estar);
// Crack speed from the kinetic law, given load F on a bond of radius a.
export function crackSpeed(F, a, F0, n) {
  const g = (F / pullOffStatic(a, F0)) ** 2; // G / G₀
  return g > 1 ? PAD.v0 * (g - 1) ** (1 / n) : 0;
}

// Pull-off force under a load ramp F = R t (no reed): integrate the crack.
export function pullOff(R, F0, n, dt = 1e-6) {
  let a = PAD.a0, t = 0;
  for (;;) {
    t += dt;
    a -= crackSpeed(R * t, a, F0, n) * dt;
    if (a <= PAD.aMin * PAD.a0) return R * t;
    if (t > 1e4) return Infinity;
  }
}
// Its fast-loading limit, from da/dt ≈ −v₀ (G/G₀)^(1/n):
//   F*/F₀ = [ (2+n)/(3+n) · a₀ R / (v₀ F₀) ]^(n/(2+n))
export const pullOffFast = (R, F0, n) => F0 * (((2 + n) / (3 + n)) * PAD.a0 * R / (PAD.v0 * F0)) ** (n / (2 + n));

// ---- the reed of one key -------------------------------------------------------
// Structural loss factor η (clamp + internal friction, the "Reed loss" knob), plus
// thermoelastic damping and air: σ_n = AIR + π f_n (η + η_TED(f_n)).
export function reedSigma(f, h, eta) {
  const fT = (Math.PI * TED.Dth) / (2 * h * h), u = f / fT;
  return AIR_SIGMA + Math.PI * f * (eta + (TED.delta * u) / (1 + u * u));
}

const reedCache = new Map();
export function keyReed(m, P, fs = 96000) {
  const id = `${m}|${P.tipMass}|${P.loss}|${fs}`;
  const hit = reedCache.get(id);
  if (hit) return hit;
  const { E, rho } = STEEL, t = Math.min(1, Math.max(0, (m - KEY_LO) / (KEY_HI - KEY_LO)));
  const f0 = keyFreq(m), b = REED.b, h = REED.hBass * (1 - t) + REED.hTreble * t;
  const r = P.tipMass * REED.rBass ** (1 - t) * REED.rTreble ** t, bl = REED.blob;
  const u = unitReed({ r, s: 1 - bl / 2, j: (r * (bl * bl + (bl / 2) ** 2)) / 12, nModes: REED.nModes });
  // f₁ = Λ₁ √(EI/μ) / (2π L²), √(EI/μ) = h √(E / 12ρ): solve L
  const c = h * Math.sqrt(E / (12 * rho)), L = Math.sqrt((u.Lam[0] * c) / (TAU * f0));
  const mu = rho * b * h, EI = (E * b * h ** 3) / 12, nrm = 1 / Math.sqrt(mu * L), xc = REED.xPad;
  const modes = [];
  for (let n = 0; n < u.nModes; n++) {
    const f = (u.Lam[n] * c) / (TAU * L * L);
    if (f > Math.min(20000, 0.45 * fs)) break;
    const sigma = reedSigma(f, h, P.loss);
    modes.push({ f, sigma, T60: Math.log(1000) / sigma, ratio: f / f0, phiC: nrm * u.shape(n, xc), phiT: nrm * u.shape(n, 1) });
  }
  // stiffness at the pad, and tip deflection per unit pad deflection (static, kept modes)
  let cc = 0, ct = 0;
  for (const md of modes) { const w2 = (TAU * md.f) ** 2; cc += md.phiC ** 2 / w2; ct += (md.phiC * md.phiT) / w2; }
  for (const md of modes) md.release = md.phiC / (TAU * md.f) ** 2 / cc; // modal amplitude per metre of static pad deflection
  const kr = {
    key: m, f0, L, b, h, mu, EI, r, Msolder: r * mu * L, xc: xc * L, modes, kc: 1 / cc, tipGain: ct / cc,
    shape: (n, x) => nrm * u.shape(n, x / L), // dimensional mode shape, x in metres
  };
  if (reedCache.size > 400) reedCache.clear();
  reedCache.set(id, kr);
  return kr;
}

// ---- pickups -------------------------------------------------------------------
// The gaps are voiced per key like a technician would; the knobs give the C4
// values. The N's plate gap and edge height go ∝ √(swing) ∝ f^(−1/2), so every
// reed sweeps a similar fraction of the plate's nonlinear range.
export const voicing = (m) => Math.sqrt(261.63 / keyFreq(m));
// The T's pole gaps: below C4 also ∝ √(swing), which is as close as a bass
// reed's ff swing allows (it has to clear its pole). Above C4 only ∝ f^(−1/4):
// a smaller gap means more flux (below), so √ gaps would make the treble
// louder; the wider ones keep it level with the middle.
export function voicingT(m) { const r = 261.63 / keyFreq(m); return r >= 1 ? Math.sqrt(r) : Math.sqrt(Math.sqrt(r)); }

// Pianet T, variable reluctance: a magnet pole under the reed tip at gap g.
// The steel tip closes the magnetic circuit; the rest of the circuit (magnet,
// return path through air) is an equivalent air gap ℓ. Every pickup has the
// same magnet (a fixed MMF), so the flux is ∝ 1/(ℓ + g + y). Relative to a reed
// at rest at the reference gap g_ref = 1 mm:
//   Φ(y)/Φ_ref = (ℓ + g_ref) / (ℓ + g + y),   y = tip height (up = away from the pole)
// A closer pole gives more flux and a steeper dΦ/dy: the output at small swings
// goes as 1/(ℓ + g)². Output = −N dΦ/dt. The pole face is also an end stop for
// the tip (Pluck.stop); the flux is clamped there as a guard.
export const EM_ELL = 1.5e-3, EM_GREF = 1e-3;
export function emFlux(y, g) { const d = g + y; return (EM_ELL + EM_GREF) / (EM_ELL + (d > 0 ? d : 0)); }
// For y = Y sin ωt: Φ ∝ 1/(1 + ε sin) with ε = Y/(ℓ+g); successive harmonics fall by
//   ρ = (1 − √(1 − ε²)) / ε, so in dΦ/dt the 2nd/1st ratio is 2ρ.
export function emH2(Y, g) { const e = Y / (EM_ELL + g); return (2 * (1 - Math.sqrt(1 - e * e))) / e; }

// Pianet N, electrostatic: a plate square to the reed, facing the tip's end
// across gap g, with its lower edge at height y_e. Treat the tip as a line
// charge and the plate as the part of a grounded plane above the edge: the
// image charge it collects (∝ the tip–plate capacitance, by reciprocity) is a
// Lorentzian integrated over the plate,
//   C(y) = C₁ (1 mm / g) [½ + arctan((y − y_e)/g) / π].
// With the edge level with the reed (y_e = 0) C − C(0) is odd in y: no even
// harmonics. Raise the edge and only the upswing sees the plate.
export const ES = {
  C1: (8.854e-12 * 3e-3 * 1e-3) / 1e-3, // F, ε₀ A/g for the 3 × 1 mm tip end at 1 mm
  Cbus: 150e-12,  // F, plate rail + wiring + the other 60 reeds
  R: 10e6,        // Ω, bias resistor (and preamp input)
  Vb: 300,        // V, polarising voltage
};
export function esCap(y, g, ye) { return ES.C1 * (1e-3 / g) * (0.5 + Math.atan((y - ye) / g) / Math.PI); }
// The plate rail: charge Q through R from V_b, rail capacitance C = C_bus + ΔC(t).
//   dQ/dt = (V_b − Q/C) / R,  output = Q/C − V_b
// Stepped exactly with C held over each sample. Small ΔC: output ≈ −(V_b/C_bus) ΔC
// high-passed at 1/(2π R C_bus): ∝ dC/dt (constant voltage) below, ∝ ΔC (constant charge) above.
export class PlateRail {
  constructor(fs) { this.d = Math.exp(-1 / (fs * ES.R * ES.Cbus)); this.Q = ES.Cbus * ES.Vb; }
  step(dC) {
    const C = ES.Cbus + dC, CV = C * ES.Vb;
    this.Q = CV + (this.Q - CV) * this.d;
    return this.Q / C - ES.Vb;
  }
}

// ---- the mechanism of one key -------------------------------------------------------
// Runs at rate fs (the engine uses 2× the audio rate). step() advances one
// sample and returns the tip displacement. No allocation after construction.
export class Pluck {
  constructor(kr, P, fs) {
    const N = kr.modes.length, k = 1 / fs, F = () => new Float64Array(N);
    this.kr = kr; this.N = N; this.k = k; this.fs = fs;
    this.q = F(); this.q1 = F(); this.A1 = F(); this.A2 = F(); this.B = F(); this.BT = F(); this.PC = F(); this.PT = F(); this.S = F(); this.W2 = F();
    let C = 0, cs = 0, Ct = 0;
    for (let i = 0; i < N; i++) {
      const md = kr.modes[i], r = Math.exp(-md.sigma * k), wd = TAU * md.f;
      this.A1[i] = 2 * r * Math.cos(wd * k); this.A2[i] = r * r;
      const b = (k * r * Math.sin(wd * k)) / wd;
      this.PC[i] = md.phiC; this.PT[i] = md.phiT; this.B[i] = b * md.phiC; this.BT[i] = b * md.phiT;
      this.S[i] = this.B[i] / (1 - this.A1[i] + this.A2[i]); this.W2[i] = wd * wd;
      C += b * md.phiC * md.phiC; cs += this.S[i] * md.phiC; Ct += b * md.phiT * md.phiT;
    }
    this.C = C; this.cStatic = cs;
    // optional end stop under the tip (the magnet pole of the T pickup), y = −stop
    this.stop = Infinity; this.Ks = 3e5; this.stopDen = 1 / (1 + this.Ks * Ct); this.Ct = Ct; this.hits = 0;
    this.setPad(P);
    // at rest: the pad presses the reed with the preload, bonded over the full disc
    const Fp = -PAD.preload;
    for (let i = 0; i < N; i++) this.q[i] = this.q1[i] = this.S[i] * Fp;
    this.yc = this.ycRest = cs * Fp; this.e = Fp / this.kp; this.hRest = this.yc + this.e;
    this.h = this.hRest; this.hv = 0; this.hT = this.hRest;
    this.a = PAD.a0; this.F = Fp; this.v = 0;
    this.yRest = this.tip(); this.y = this.yRest;
    this.down = false; this.t = 0; this.released = false;
    this.rel = { y: 0, F: 0, v: 0, t: 0, V: 0 }; // at the last snap (valid when `released`)
  }
  setPad(P) {
    this.F0 = P.tack; this.n = P.rate; this.kp = P.padK * 1e3; this.cp = P.padC;
    const ck = this.cp / this.k;
    this.Bk = this.kp + ck; this.Ck = ck; this.den = 1 / (1 + this.Bk * this.C);
    this.relax = ck / (this.kp + ck); // free foam: backward-Euler relaxation of the face
  }
  tip() { let y = 0; for (let i = 0; i < this.N; i++) y += this.PT[i] * this.q[i]; return y; }
  press(vel) { this.V = keySpeed(vel); this.hv = this.V; this.hT = this.hRest + PAD.travel; this.down = true; this.t = 0; this.released = false; }
  lift() { this.hv = -PAD.vRet; this.hT = this.hRest; this.down = false; }
  step() {
    const N = this.N, q = this.q, q1 = this.q1, A1 = this.A1, A2 = this.A2, PC = this.PC, k = this.k;
    if (this.hv !== 0) {
      this.h += this.hv * k;
      if (this.hv > 0 ? this.h >= this.hT : this.h <= this.hT) { this.h = this.hT; this.hv = 0; }
    }
    let yf = 0;
    for (let i = 0; i < N; i++) { const qn = A1[i] * q[i] - A2[i] * q1[i]; q1[i] = q[i]; q[i] = qn; yf += PC[i] * qn; }
    // foam extension e = h − y_c, force on the reed F = k_p e + c_p ė (implicit in y_c)
    let F = (this.Bk * (this.h - yf) - this.Ck * this.e) * this.den;
    const bonded = this.a > PAD.aMin * PAD.a0;
    if (!bonded) {
      let eFree = this.e * this.relax; // the face springs back towards the holder
      if (Math.abs(eFree) < 1e-30) eFree = 0; // (back: no denormals, which cost the audio thread tenfold)
      if (yf <= this.h - eFree || F >= 0) { this.e = eFree; F = 0; }
    }
    if (F !== 0) {
      const B = this.B;
      for (let i = 0; i < N; i++) q[i] += B[i] * F;
      this.yc = yf + this.C * F; this.e = this.h - this.yc;
      if (F > 0) { // tension: the crack at the bond's edge advances
        const v = crackSpeed(F, this.a, this.F0, this.n);
        this.v = v; this.a -= v * k;
        if (this.a <= PAD.aMin * PAD.a0) {
          this.a = 0;
          if (this.down && !this.released) {
            const r = this.rel;
            this.released = true; r.y = this.yc; r.F = F; r.v = v; r.t = this.t; r.V = this.V;
          }
        }
      } else this.a += (PAD.a0 - this.a) * (k / PAD.heal); // pressed: the face re-wets the reed
    } else this.yc = yf;
    this.F = F; this.t += k;
    let y = 0;
    for (let i = 0; i < N; i++) y += this.PT[i] * q[i];
    if (y < -this.stop) { // the tip strikes the pole piece: stiff elastic contact, implicit
      const Fs = this.Ks * (-this.stop - y) * this.stopDen, BT = this.BT;
      for (let i = 0; i < N; i++) q[i] += BT[i] * Fs;
      y += this.Ct * Fs; this.hits++;
    }
    this.y = y;
    return y;
  }
  energy() { // vibration energy (J) about the static shape under the present pad force
    let E = 0;
    for (let i = 0; i < this.N; i++) {
      const d = (this.q[i] - this.q1[i]) * this.fs, x = this.q[i] - this.S[i] * this.F;
      E += 0.5 * (d * d + this.W2[i] * x * x);
    }
    return E;
  }
}

// ---- offline runs for the views and the tests ---------------------------------------
// Press, ring, and record: holder, pad face, reed at the pad and at the tip (all
// measured from the free reed's equilibrium), pad force, bond radius, modal states.
export function simulatePluck(m, P, vel, { fs = 96000, periods = 6, frames = 480, maxT = 0.4 } = {}) {
  const kr = keyReed(m, P, fs);
  let p = new Pluck(kr, P, fs);
  p.press(vel);
  while (!p.released && p.t < maxT) p.step();
  const rel = p.released ? { ...p.rel } : null, tEnd = rel ? Math.min(maxT, rel.t + periods / kr.f0) : maxT;
  p = new Pluck(kr, P, fs); // run again, recording `frames` snapshots
  p.press(vel);
  const out = { kr, rel, tEnd, t: [], h: [], face: [], yc: [], y: [], F: [], a: [], q: [] };
  const every = Math.max(1, Math.floor((tEnd * fs) / frames));
  for (let s = 0; p.t < tEnd; s++) {
    p.step();
    if (s % every) continue;
    out.t.push(p.t); out.h.push(p.h); out.face.push(p.h - p.e); out.yc.push(p.yc);
    out.y.push(p.y); out.F.push(p.F); out.a.push(p.a / PAD.a0); out.q.push(Float64Array.from(p.q));
  }
  return out;
}

// Where the pad lets go, for a set of key velocities: { vel, V, y, F, v, t } (null = no release).
export function releaseCurve(m, P, vels, fs = 96000) {
  const kr = keyReed(m, P, fs);
  return vels.map((vel) => {
    const p = new Pluck(kr, P, fs);
    p.press(vel);
    while (!p.released && p.t < 0.5) p.step();
    return p.released ? { vel, ...p.rel } : { vel, V: keySpeed(vel), y: p.yc, F: p.F, v: 0, t: p.t, stuck: true };
  });
}
