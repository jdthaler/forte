// bowed-model.js — the physics of the viola organista, free of audio and DOM
// so that the page, the engine, the tests and the render tool can share it.
//
// A steel string per key, pressed by its key onto a rosined wheel that turns
// at surface speed v_B, at a fraction β of the string's length from the
// bridge. The string is a lossy waveguide of wave impedance Z₀ = √(Tμ); the
// wheel grips it through the hyperbolic friction curve
//   μ(Δv) = μd + (μs − μd) v₀ / (v₀ + |Δv|)
// (with a short thermal lag), and the bridge sits on a spruce soundboard
// whose average point admittance, for a plate, is real:
//   Y∞ = 1 / (8 √(ρh) (Dx Dy)^¼)   (Cremer & Heckl).

import { keyFreq } from '../../shared/dsp.js';
import { DEFAULTS } from './bowed-params.js';
import { TUNE } from './bowed-tuning.js';
export const TUNE_TABLE = TUNE;  // mutable, for tools/bowed-tuning.mjs

export const RANGE = [36, 84];                // C2–C6
export const STEEL = { rho: 7850, E: 2.0e11, G: 7.93e10, uts: 2.4e9 };
export const C_TORSION = Math.sqrt(STEEL.G / STEEL.rho); // 3180 m/s, independent of tension

// ---- scale design ---------------------------------------------------------
// Harpsichord-like scale: c'' (C5) = 36 cm, lengths double every 1/0.8 octaves
// going down (a foreshortened bass, 1.9 m at C2). Tension rises from 95 N in
// the treble to 130 N in the bass. Mass per length then follows from
// Mersenne's law, f₀ = c / 2L with c = √(T/μ). Strings below C4 are wound
// (a steel core with a copper winding): same μ and Z₀, more internal loss.
// f0 is the free string's frequency: the tuner sets it a few cents sharp of
// the key (TUNE, bowed-tuning.js) so that the *bowed* note, which runs flat,
// is in tune at the voiced touch.
export const wound = (key) => Math.min(1, Math.max(0, (60 - key) / 24)); // 1 at C2 … 0 from C4
export function stringDesign(key) {
  const fKey = keyFreq(key), f0 = fKey * 2 ** ((TUNE[key - RANGE[0]] || 0) / 1200);
  const L = 0.36 * 2 ** ((-0.8 * (key - 72)) / 12);
  const T = 95 + 35 * Math.min(1, Math.max(0, (84 - key) / 48));
  const c = 2 * L * f0, mu = T / (c * c), Z0 = T / c;
  const d = Math.sqrt((4 * mu) / (Math.PI * STEEL.rho));          // as plain steel wire
  const B = (Math.PI ** 3 * STEEL.E * d ** 4) / (64 * T * L * L); // inharmonicity (neglected)
  return { key, fKey, f0, L, T, c, mu, Z0, d, B, stress: STEEL.rho * c * c, wound: wound(key) > 0 };
}

// ---- losses ----------------------------------------------------------------
// The string's own losses (air drag, internal friction) as a decay rate in
// s⁻¹ rising with frequency, × 7 at high frequency for the wound C2 string
// (friction between core and winding); `losses` scales them.
export const stringSigma = (f, P, key = 60) => P.losses * (0.35 + 1.4 * (1 + 6 * wound(key)) * (f / 1000) ** 2);

// ---- soundboard ---------------------------------------------------------------
// Simply supported orthotropic plate with smeared ribs, 1.3 × 0.65 m, 3 mm
// spruce. H = √(Dx Dy) makes it an affinely stretched isotropic plate, so
// the modal density and the mean point conductance have closed forms.
export const BOARD = { a: 1.3, b: 0.65, rhoH: 420 * 0.003, Dx: 300, Dy: 100 };
export const plateYinf = (B = BOARD) => 1 / (8 * Math.sqrt(B.rhoH) * (B.Dx * B.Dy) ** 0.25);
export const plateDensity = (B = BOARD) => (B.a * B.b * Math.sqrt(B.rhoH)) / (2 * (B.Dx * B.Dy) ** 0.25); // modes per Hz
export const plateFreq = (m, n, B = BOARD) => (Math.PI / 2) * (Math.sqrt(B.Dx) * (m / B.a) ** 2 + Math.sqrt(B.Dy) * (n / B.b) ** 2) / Math.sqrt(B.rhoH);
export const plateShape = (m, n, x, y, B = BOARD) => Math.sin((m * Math.PI * x) / B.a) * Math.sin((n * Math.PI * y) / B.b);

// The bridge runs diagonally across the board; key k presses on it at
// bridgePoint(k) (bass end near the tail, treble end near the keyboard).
export function bridgePoint(key, B = BOARD) {
  const u = (key - RANGE[0]) / (RANGE[1] - RANGE[0]);
  return [B.a * (0.18 + 0.6 * u), B.b * (0.78 - 0.5 * u)];
}

// Far-field pressure of plate mode (m, n) in an infinite baffle, per unit
// modal velocity, towards (θ, φ) (Wallace 1972). Returns [re, im], with the
// common factor ρ₀ c₀ / (2π R) dropped.
export function wallace(m, n, f, theta, phi, B = BOARD) {
  const k = (2 * Math.PI * f) / 343;
  const al = k * B.a * Math.sin(theta) * Math.cos(phi), ga = k * B.b * Math.sin(theta) * Math.sin(phi);
  const term = (q, x) => { // ((−1)^q e^{−ix} − 1) / ((x / qπ)² − 1)
    const s = q % 2 ? -1 : 1, den = (x / (q * Math.PI)) ** 2 - 1;
    const re = s * Math.cos(x) - 1, im = -s * Math.sin(x);
    if (Math.abs(den) < 1e-6) return [0, ((-q * Math.PI) / 2) * Math.sign(x)]; // removable: x = ±qπ
    return [re / den, im / den];
  };
  const [ar, ai] = term(m, al), [br, bi] = term(n, ga);
  const pr = ar * br - ai * bi, pi = ar * bi + ai * br;
  const g = (k * B.a * B.b) / (Math.PI ** 2 * m * n);
  return [-g * pi, g * pr]; // × i k
}

// Modes of the board up to fMax, with loss factor eta, as drive / radiation
// data for the engine: f, sigma, modal mass, and the two microphones'
// complex radiation weights (left mic over the bass side, right over the treble).
export const MICS = [[0.7, Math.PI * 0.92], [0.7, Math.PI * 0.08]];
export function boardModes(fMax, eta, B = BOARD) {
  const out = [];
  for (let m = 1; m < 60; m++) for (let n = 1; n < 60; n++) {
    const f = plateFreq(m, n, B);
    if (f > fMax) { if (n === 1) m = 99; break; }
    const w = MICS.map(([th, ph]) => wallace(m, n, f, th, ph, B));
    out.push({ m, n, f, sigma: Math.PI * f * eta, M: (B.rhoH * B.a * B.b) / 4, w });
  }
  return out.sort((x, y) => x.f - y.f);
}

// ---- friction ---------------------------------------------------------------
export function friction(P) {
  const mus = P.mus, mud = Math.min(P.mud, P.mus - 0.02);
  return { mus, mud, v0: P.v0, tau: (P.memory ?? 0) / 1000, grain: P.grain ?? 0 };
}
export const mu = (u, F) => F.mud + ((F.mus - F.mud) * F.v0) / (F.v0 + Math.abs(u));

// The bow (wheel) junction: given the string's velocity at the bow if the
// friction force were zero (vh), the bow speed vB, the normal force FN and
// the admittance Y the bow point sees (1/(2Z₀), plus 1/(2Z_t) for the string
// rolling), return the friction force.
// `state` carries the hysteresis (McIntyre, Schumacher & Woodhouse 1983):
// state.s = 0 sticking, ±1 slipping in that direction. A sticking string
// stays stuck while the force needed is below μs·FN; a slipping one stays on
// its slipping branch while that branch exists.
function slipRoot(s, dv, c, F) { // relative slip speed u > 0 on branch s, or −1
  const a = s * dv, B = F.v0 - a + c * F.mud, C = F.v0 * (c * F.mus - a), disc = B * B - 4 * C;
  return disc < 0 ? -1 : 0.5 * (-B + Math.sqrt(disc));
}
export function frictionForce(vh, vB, FN, Y, F, state) {
  if (!(FN > 0)) { state.s = vh > vB ? 1 : -1; return 0; }
  const dv = vh - vB, c = Y * FN, v0 = F.v0;
  if (state.s !== 0) {
    const u = slipRoot(state.s, dv, c, F);
    if (u > 0) return -state.s * FN * (F.mud + ((F.mus - F.mud) * v0) / (v0 + u));
  }
  if (Math.abs(dv) <= c * F.mus) { state.s = 0; return -dv / Y; }
  const s = dv > 0 ? 1 : -1, u = slipRoot(s, dv, c, F);
  state.s = s;
  return -s * FN * (F.mud + ((F.mus - F.mud) * v0) / (v0 + Math.max(u, 0)));
}

// Friction with memory: rosin does not follow the sliding speed instantly
// (its grip is set by the contact temperature: Smith & Woodhouse 2000; a lag
// is measured directly by Hess & Soom 1990). μ follows a lagged sliding speed
// ũ, dũ/dt = (|Δv| − ũ)/τ, so steady sliding still gives the curve above,
// but μ cannot change within a slip faster than τ. The state then fixes μ for
// this sample, and the junction is linear: stick iff |Δv_free| ≤ Y μ(ũ) F_N.
export function frictionForceMem(vh, vB, FN, Y, F, state, a) { // a = 1 − e^(−Δt/τ)
  const dv = vh - vB, m = F.mud + ((F.mus - F.mud) * F.v0) / (F.v0 + state.u), lim = Y * m * FN;
  let f, du;
  if (Math.abs(dv) <= lim) { f = -dv / Y; du = 0; state.s = 0; }
  else { state.s = dv > 0 ? 1 : -1; f = -state.s * m * FN; du = Math.abs(dv) - lim; }
  state.u += a * (du - state.u);
  return f;
}

// ---- bridge and loop -----------------------------------------------------------
// Bridge conductance G (s/kg). The strings all end on one bridge whose
// velocity is V = G·(total string force); with every string attached, string
// k on its own reflects  r = 2 G Z_k / (1 + G ΣZ) − 1.
export const bridgeG = (P) => P.mobility * plateYinf();
let ZSUM = 0;
for (let k = RANGE[0]; k <= RANGE[1]; k++) ZSUM += stringDesign(k).Z0;
export const Z_ALL = ZSUM;

// One-pole loss filter H(z) = g(1 − p)/(1 − p z⁻¹) for a wave travelling for
// `dur` seconds, matching the string's decay rates s0 at f₀ and sh at fh.
// Returns { g, p, tau } with tau the filter's phase delay at f₀ in samples.
export function lossFilter(f0, s0, fh, sh, fs, dur) {
  const w0 = (2 * Math.PI * f0) / fs, wh = (2 * Math.PI * fh) / fs, c0 = Math.cos(w0);
  const G0 = Math.exp(-s0 * dur), Gh = Math.exp(-sh * dur), R2 = (Gh / G0) ** 2;
  let p = 0;
  if (R2 < 1 - 1e-12) {
    const A = (R2 * Math.cos(wh) - c0) / (R2 - 1);
    p = A > 1 ? A - Math.sqrt(A * A - 1) : 1;
  }
  // a passive filter: the gain at DC, g, must not exceed 1 (else the loop grows)
  const q2 = 0.9999 ** 2, B = (q2 - G0 * G0 * c0) / (q2 - G0 * G0);
  p = Math.max(0, Math.min(p, B - Math.sqrt(B * B - 1)));
  const g = (G0 * Math.sqrt(1 - 2 * p * c0 + p * p)) / (1 - p);
  const tau = Math.atan2(p * Math.sin(w0), 1 - p * c0) / w0;
  return { g, p, tau };
}

// Each string's waveguide runs at os × the output rate, os = 1, 2 or 4, so
// that a period spans at least ~180 samples (see string.js).
export const oversample = (key, fs) => Math.min(4, 2 ** Math.max(0, Math.ceil(Math.log2((180 * keyFreq(key)) / fs))));

// Everything a key's waveguide needs: its round-trip delays (bridge side 2·Db,
// nut side 2·Dn, in samples), a loss filter for each side (the string's own
// losses are distributed, so each side gets its share of the travel time),
// and the resulting decay rate σ₁ of the free string's fundamental.
export function loopDesign(key, P, fs) {
  const s = stringDesign(key), G = bridgeG(P);
  const N0 = fs / s.f0;
  const beta = Math.min(0.5, Math.max(P.beta, 2.6 / N0)); // the bridge side needs ≥ 1.3 samples each way
  const fh = Math.min(0.35 * fs, Math.max(4000, 3 * s.f0));
  const s0 = stringSigma(s.f0, P, key), sh = stringSigma(fh, P, key);
  const lb = lossFilter(s.f0, s0, fh, sh, fs, beta / s.f0), ln = lossFilter(s.f0, s0, fh, sh, fs, (1 - beta) / s.f0);
  const Db = (beta * N0 - lb.tau) / 2, Dn = ((1 - beta) * N0 - ln.tau) / 2;
  const rB = 1 - (2 * G * s.Z0) / (1 + G * Z_ALL);       // |bridge reflection|, one string alone
  const sigma1 = -s.f0 * Math.log(rB) + s0; // bridge + the string's own loss at f₀
  // Torsion: waves at c_t = √(G/ρ); a solid wire's torsional impedance seen at
  // its surface is ρ I_p c_t / r² = μ c_t / 2. Both ends clamp the twist; the
  // torsional fundamental c_t / 2L has quality factor P.torsionQ.
  const Zt = P.torsionQ > 0 ? (s.mu * C_TORSION) / 2 : 0, ft = C_TORSION / (2 * s.L), st = (Math.PI * ft) / Math.max(1, P.torsionQ);
  const Dtb = Math.max(2, (2 * beta * s.L * fs) / C_TORSION), Dtn = Math.max(2, (2 * (1 - beta) * s.L * fs) / C_TORSION);
  return {
    ...s, G, Zall: Z_ALL, N0, beta, Db, Dn, gb: lb.g, pb: lb.p, gn: ln.g, pn: ln.p, rB, sigma1,
    Zt, ft, Dtb, Dtn, rtb: Math.exp((-st * Dtb) / fs), rtn: Math.exp((-st * Dtn) / fs),
  };
}

// ---- Schelleng's bounds ---------------------------------------------------------
// Schelleng (1973), in the form of Schoonderwaldt, Guettler & Askenfelt (2008)
// eqs. (4, 5) for a hyperbolic friction curve: during Helmholtz slipping the
// relative speed is ≈ v_B/β, so the effective μs − μ is (μs − μd)·v_B/(v_B + β v₀).
// R is the bridge resistance that would give the string's actual decay σ₁:
// a string on a dashpot R loses 2Z₀/R per period, so R = 2 Z₀ f₀ / σ₁.
export function schelleng(L, P, beta = L.beta, vB = P.speed) {
  const F = friction(P), dmu = F.mus - F.mud, R = (2 * L.Z0 * L.f0) / L.sigma1;
  const w = vB + beta * F.v0;
  return {
    R,
    Fmax: (2 * L.Z0 * w) / (dmu * beta),
    Fmin: (L.Z0 * L.Z0 * w) / (2 * R * dmu * beta * beta),
  };
}

// Ideal Helmholtz motion (Helmholtz 1863; Raman 1918): the bow-point velocity
// is v_B for a fraction 1 − β of each period (stick) and −v_B(1 − β)/β for β
// (slip); the corner travels round the string once per period; the bridge
// force is a sawtooth of peak-to-peak 2 Z₀ v_B / β, harmonics falling as 1/n.
export const helmholtz = (beta, vB) => ({ stick: 1 - beta, vSlip: (-vB * (1 - beta)) / beta, Fpp: (2 * vB) / beta });
// Envelope of the string's displacement (peak to peak) traced by the corner:
// two parabolic arcs, y_pp(x) = v_B T₀ x (L − x) / (β L²).
export const helmholtzEnvelope = (x, L, beta, vB, f0) => (vB * x * (L - x)) / (f0 * beta * L * L);

// ---- what the string is doing ------------------------------------------------
// Classify the motion from the intervals between successive slips (iv[0..n),
// in periods of the free string). Helmholtz motion slips once per period,
// regularly; "multiple slipping" (Schelleng's surface sound, below F_min)
// slips two or more times per period in a repeating pattern; "raucous"
// motion (above F_max) is aperiodic, with prolonged sticks.
export function classifyMotion(iv, n = iv.length, out = {}) {
  let sum = 0, dev = 0;
  for (let j = 0; j < n; j++) { sum += iv[j]; dev = Math.max(dev, Math.abs(iv[j] - 1)); }
  const spp = n / sum;
  out.spp = spp;
  if (dev < 0.12) { out.kind = 'helmholtz'; return out; }
  // a repeating pattern: some group of k consecutive intervals spans one period
  for (let k = 2; k <= 4; k++) {
    let ok = n >= 2 * k;
    for (let j = 0; ok && j + k <= n; j++) {
      let span = 0;
      for (let i = j; i < j + k; i++) span += iv[i];
      if (Math.abs(span - 1) > 0.12) ok = false;
    }
    if (ok) { out.kind = 'multiple'; return out; }
  }
  out.kind = spp > 1.3 ? 'multiple' : 'raucous';
  return out;
}

// ---- the key action -----------------------------------------------------------
// The builder regulates each key so that a normal touch (velocity 0.7) on the
// default wheel presses with half of Schelleng's maximum force: well above
// where a fresh note starts in surface sound (≈ 0.25 F_max), below where the
// motion turns raucous (≈ 0.9 F_max), and where attacks settle most reliably
// into Helmholtz motion (see the tests and the attack map). The table is
// fixed: moving the wheel or the bow position moves the operating point
// around the Schelleng diagram, as it would on the real instrument.
export const VOICED = new Float64Array(RANGE[1] + 1);
for (let k = RANGE[0]; k <= RANGE[1]; k++) VOICED[k] = 0.5 * schelleng(loopDesign(k, DEFAULTS, 48000), DEFAULTS).Fmax;
// Normal force for key velocity vel (0..1), the key-pressure knob `force`,
// and extra finger pressure `after` (MIDI aftertouch, 0..1).
export const touch = (vel) => 0.75 + 0.36 * vel;  // 1 at vel 0.7
export const keyForce = (key, vel, force, after = 0) => VOICED[key] * force * touch(vel) * (1 + 1.5 * after);
// Time for the key to bring the string onto the wheel and up to full force:
// the key's travel divided by its speed.
export const riseTime = (vel, attackMs) => attackMs / 1000 / (0.15 + 0.85 * vel);
