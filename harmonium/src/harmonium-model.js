// harmonium-model.js — the physics of a free-reed organ (harmonium, with the
// accordion's musette and cassotto), kept free of audio and DOM so that the
// page, the engine, the tests and the tools can all use it.
//
//   bellows ─▶ reservoir P ─▶ pallet ─▶ throat (air mass M_a) ─▶ cell (volume, pressure p_c)
//                                                                  │
//                         reed (brass cantilever) over its slot ◀──┘  jet U_g = c_d A(y) x, ½ρx² + ρℓ_j ẋ = Δp
//                                                                  │
//                                       sound ∝ d/dt (U_g + S ẏ) ◀─┘  (optionally through a cassotto)
//
// Each reed is a clamped–free brass tongue with a tuning weight at its tip,
// reduced to its first two bending modes. It rests a little above a close-
// fitting slot (its "set"). The wind pushes it into the slot, closing the gap
// the air escapes through (a blown-closed valve). The air feeding the reed has
// mass, and that inertia turns the reed's motion into a pressure in phase with
// its velocity: negative damping, so above a threshold the reed swings by
// itself, through the slot and out the other side, chopping the flow into
// pulses.

import { keyFreq } from '../../shared/dsp.js';

export { keyFreq };
export const AIR = { rho: 1.2, c: 343 };
export const BRASS = { E: 1.0e11, rho: 8500 };       // yellow brass: Young's modulus (Pa), density (kg/m³)
export const CD = 0.61;                              // vena contracta of a sharp-edged slot
export const EPS_V = AIR.rho * 0.3;                  // Pa per m/s: a whisper of viscous resistance (keeps Δp(x) strictly monotone at x = 0)
export const KEY_LO = 36, KEY_HI = 96;               // C2–C7, 61 keys (the 8′ rank)
export const F_REF = keyFreq(60);
const PI = Math.PI, TAU = 2 * PI;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// The ranks of reeds a key can sound. oct: octave relative to the key; cents: the musette's detuning
// (in units of the Musette detune knob); the stops say which are engaged.
export const RANKS = [
  { id: 'L', name: '16′', oct: -1, cents: 0 },
  { id: 'M', name: '8′', oct: 0, cents: 0 },
  { id: 'Mp', name: '8′ +', oct: 0, cents: 1 },
  { id: 'Mm', name: '8′ −', oct: 0, cents: -1 },
  { id: 'H', name: '4′', oct: 1, cents: 0 },
];
// Which ranks the stops engage: 16′, 8′ (with the musette's detuned reeds), 4′.
export function engaged(P, on = new Array(RANKS.length)) {
  const m = P.musette;
  on[0] = !!P.bourdon; on[1] = !!P.principal; on[4] = !!P.piccolo;
  on[2] = m === 'two' || m === 'three';
  on[3] = m === 'three';
  return on;
}
// The sounding frequency a rank's reed is made for on key m.
export const rankFreq = (m, r, P) => keyFreq(m) * 2 ** RANKS[r].oct * 2 ** ((RANKS[r].cents * P.detune) / 1200);

// ---------------------------------------------------------------------------
// The tongue: a uniform cantilever with a point mass at its tip.
// Frequency equation (μ = M/ρAL), from the moment-free tip and the tip weight's inertia in the shear:
//   1 + cos λ cosh λ + μλ (cos λ sinh λ − sin λ cosh λ) = 0,   ω = λ² √(EI/ρA) / L²
export function tipMassRoots(mu, n = 2) {
  const F = (x) => (1 + Math.cos(x) * Math.cosh(x) + mu * x * (Math.cos(x) * Math.sinh(x) - Math.sin(x) * Math.cosh(x))) / Math.cosh(x);
  const roots = [];
  for (let x = 0.05; roots.length < n && x < 40; x += 0.01) {
    if (F(x) * F(x + 0.01) <= 0) {
      let a = x, c = x + 0.01;
      for (let i = 0; i < 60; i++) { const m = 0.5 * (a + c); if (F(a) * F(m) <= 0) c = m; else a = m; }
      roots.push(0.5 * (a + c));
    }
  }
  return roots;
}
// Mode shape for root λ, normalised so that the tip moves by 1: the moment-free tip fixes
// σ = (cosh λ + cos λ)/(sinh λ + sin λ) whatever the tip mass (it only enters through λ).
export function modeShape(lam, u) {
  const s = (Math.cosh(lam) + Math.cos(lam)) / (Math.sinh(lam) + Math.sin(lam));
  const f = (z) => Math.cosh(z) - Math.cos(z) - s * (Math.sinh(z) - Math.sin(z));
  return f(lam * u) / f(lam);
}
// ∫₀¹ g(u) du by Simpson's rule
function simpson(g, n = 200) {
  let s = g(0) + g(1);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * g(i / n);
  return s / (3 * n);
}

// Scale of the reeds, as a voicer might draw it: thickness and width growing towards the bass
// (0.19 → 1.03 mm thick, 1.7 → 9.3 mm wide from C8 to C1), and below G3 a tuning weight at the
// tip (up to the tongue's own mass at C1) so that the bass reeds stay a manageable length.
// The length is then what tunes the reed: 5 mm at C8, 32 mm at C4, 88 mm at C1.
export const SCALE = { h: 0.5e-3, hExp: -0.35, b: 4.5e-3, bExp: -0.35, weight: 1.0, weightFrom: 196, weightOct: 2.58 };
export function reedScale(fNat) {
  const r = fNat / F_REF;
  const h = SCALE.h * r ** SCALE.hExp, b = SCALE.b * r ** SCALE.bExp;
  const mu = SCALE.weight * clamp(Math.log2(SCALE.weightFrom / fNat) / SCALE.weightOct, 0, 1);
  const lam = tipMassRoots(mu, 2), om = TAU * fNat;
  const L = lam[0] * Math.sqrt((Math.sqrt(BRASS.E / (12 * BRASS.rho)) * h) / om);
  return { h, b, mu, lam, L };
}

// ---------------------------------------------------------------------------
// The slot. The reed's downstream face sits at height w(x) = y ψ(x) above the plate's upstream
// face (positive into the slot, with the flow), y the tip's. The plate is e thick, the reed h,
// with a clearance δ round its sides and tip. Along each edge the air escapes through the
// shortest gap between the reed's corner and the slot's: while the reed overlaps the slot
// (0 < w < e + h) that is the clearance δ; outside it, √(d² + δ²) with d how far it is clear.
//   A(y) = 2 ∫₀ᴸ g(y ψ(x)) dx + (b + 2δ) g(y),   g(w) = √(d(w)² + δ²),   d = max(0, −w, w − e − h)
export function gapWidth(w, e, h, delta) {
  const d = w < 0 ? -w : w > e + h ? w - e - h : 0;
  return Math.sqrt(d * d + delta * delta);
}
export function slotArea(y, geo) {
  const { L, b, e, h, delta, lam } = geo, N = 48;
  let s = 0;
  for (let i = 0; i <= N; i++) { // trapezoid along the side (ψ is smooth)
    const u = i / N, g = gapWidth(y * modeShape(lam[0], u), e, h, delta);
    s += (i === 0 || i === N ? 0.5 : 1) * g;
  }
  return 2 * L * (s / N) + (b + 2 * delta) * gapWidth(y, e, h, delta);
}
// A(y) tabulated on a uniform grid (with dA/dy), extrapolated linearly beyond it.
export function areaTable(geo, n = 512) {
  const lo = -0.45 * geo.L, hi = 0.45 * geo.L, dy = (hi - lo) / (n - 1);
  const A = new Float64Array(n), shape = new Float64Array(49);
  for (let i = 0; i <= 48; i++) shape[i] = modeShape(geo.lam[0], i / 48);
  const { L, b, e, h, delta } = geo;
  for (let j = 0; j < n; j++) {
    const y = lo + j * dy;
    let s = 0;
    for (let i = 0; i <= 48; i++) s += (i === 0 || i === 48 ? 0.5 : 1) * gapWidth(y * shape[i], e, h, delta);
    A[j] = 2 * L * (s / 48) + (b + 2 * delta) * gapWidth(y, e, h, delta);
  }
  return { lo, dy, n, A };
}
export function areaAt(T, y, out) { // linear interpolation; out.A, out.dA
  let u = (y - T.lo) / T.dy, j = Math.floor(u);
  if (j < 0) j = 0; else if (j > T.n - 2) j = T.n - 2;
  const a0 = T.A[j], a1 = T.A[j + 1], dA = (a1 - a0) / T.dy;
  out.A = a0 + dA * (u - j) * T.dy; out.dA = dA;
  return out;
}

// ---------------------------------------------------------------------------
// One reed, made for a sounding frequency fSound under the knobs P. tune(fSound) says how far
// below its natural frequency the reed sounds at the default wind (the voicer's tuning); the
// reed is cut to fNat = fSound / tune.
export const P_NOM = 800;   // Pa: the wind the reeds are voiced for (the default bellows pressure)
export const DESIGN = {
  setExp: 0.2,        // set ∝ (static deflection at P_NOM)^0.2 × length^0.8
  setLen: 0.8,
  deltaExp: 1,        // clearance ∝ length
  plate: [0.6e-3, 0.03], // plate thickness e = a + b·L
  throat: 0.4,        // ωM_a = 0.4 u* R_j: the voicer gives up some drive for a lower threshold
  cellRatio: 3,       // the cell's Helmholtz resonance, as a multiple of the reed's frequency (cell × 1)
  inlet: 6,           // the pallet's opening, as a multiple of the reed's working gap area
  zeta2: 2,           // mode 2 damped twice as much (in ζ) as mode 1
  cd: 2,              // drag coefficient of a flat plate moving broadside
};

// The reed's two modes for a natural frequency fNat (no air).
function tongue(fNat, P) {
  const { h, b, mu, lam, L } = reedScale(fNat), rho = BRASS.rho;
  const m0 = rho * b * h * L, M = mu * m0; // tongue mass, tip weight
  const modes = [];
  for (let n = 0; n < 2; n++) {
    const ln = lam[n], shape = (u) => modeShape(ln, u);
    const I1 = simpson(shape), I2 = simpson((u) => shape(u) ** 2);
    const m = m0 * I2 + M, om = (ln * ln * Math.sqrt((BRASS.E * h * h) / (12 * rho))) / (L * L);
    const zeta = (n === 0 ? 1 : DESIGN.zeta2) / (2 * (P ? P.q : 500));
    const I3 = simpson((u) => shape(u) ** 3);
    modes.push({ n, lam: ln, f: om / TAU, om, m, k: m * om * om, S: b * L * I1, I1, I2, I3, zeta });
  }
  const sag = modes.reduce((s, md) => s + md.S / md.k, 0); // static tip deflection per pascal
  return { h, b, mu, lam, L, m0, M, modes, sag };
}
const REF = tongue(F_REF, null); // the C4 reed: the knobs are set at C4 and scaled from it

// One reed, voiced. The voicer's rules (all scaled from C4, where the knobs are set):
//  - the set y0 grows with the reed's length and a little with how far the wind bends it,
//    ∝ L^0.8 (deflection at P_NOM)^0.2, so the soft bass reeds stand well clear of their slots
//    and the stiff treble ones close to them;
//  - the clearance δ ∝ length; the plate is e = 0.6 mm + 0.03 L thick;
//  - the throat's air mass is sized against the jet's resistance at the working point:
//    ω M_a = 0.4 u* R_j, where u* is the inertance that drives a blown-closed reed hardest well
//    above threshold (the voicer gives up some of that drive for a lower threshold); the Air
//    mass knob multiplies it;
//  - the cell's volume puts its Helmholtz resonance with the throat 3× above the reed (× the
//    Cell knob's 1/√ ratio), and the pallet opens 6× the reed's working gap.
export function reedDesign(fNat, P) {
  const t = tongue(fNat, P), { h, b, mu, lam, L, modes } = t;
  const lr = L / REF.L;
  const e = DESIGN.plate[0] + DESIGN.plate[1] * L;
  const delta = P.clearance * 1e-6 * lr ** DESIGN.deltaExp;
  const y0 = P.set * 1e-3 * (t.sag / REF.sag) ** DESIGN.setExp * lr ** DESIGN.setLen;
  const geo = { L, b, h, e, delta, lam, mu, y0 };
  const perim = 2 * L * modes[0].I1 + b; // dA/dy above the plate (per metre of tip travel)
  // the working point: deflected by P_NOM, the jet at √(2 P_NOM/ρ)
  const yNom = -y0 + P_NOM * t.sag, Anom = slotArea(yNom, geo), xNom = Math.sqrt((2 * P_NOM) / AIR.rho);
  const Rj = (AIR.rho * xNom) / (CD * Anom);
  // drive ∝ u(1 − εu)/(1 + u²) with u = ωM_a/R_j and ε = ωS/(c_d x |dA/dy|) (the reed's swept
  // volume against the gap's modulation of the flow): largest at u* = √(1 + ε²) − ε
  const eps = (modes[0].om * modes[0].S) / (CD * xNom * perim), uOpt = Math.sqrt(1 + eps * eps) - eps;
  const Ma = (DESIGN.throat * P.throat * uOpt * Rj) / modes[0].om;
  const omCell = (TAU * DESIGN.cellRatio * fNat) / Math.sqrt(P.cell);
  const C = 1 / (Ma * omCell * omCell), V = C * AIR.rho * AIR.c * AIR.c;
  const Ain = DESIGN.inlet * Anom;
  const K = (0.5 * AIR.rho) / (CD * Ain) ** 2; // orifice: Δp = K U|U|
  // the air's form drag on the swinging tongue, −½ρ C_D b |w'|w' along it: on mode 1, −D|ẏ|ẏ
  const drag = 0.5 * AIR.rho * DESIGN.cd * b * L * modes[0].I3;
  return { fNat, geo, modes, perim, Ma, C, V, Ain, K, lj: e + h, drag, fCell: omCell / TAU, m0: t.m0, M: t.M, sag: t.sag, Anom, Rj, eps, uOpt, throatLA: Ma / AIR.rho };
}

// The voicer's tuning: how far the default wind pulls a reed below its natural pitch,
// measured by tools/harmonium-tuning.mjs (the engine, one reed at the default wind) and
// tabulated per semitone from C1 to C8.
import { TUNE_LO, TUNE } from './tuning-table.js';
export { TUNE_LO, TUNE };
export function tuneRatio(fSound) {
  const u = clamp(12 * Math.log2(fSound / keyFreq(TUNE_LO)), 0, TUNE.length - 1), j = Math.min(TUNE.length - 2, Math.floor(u));
  return TUNE[j] + (TUNE[j + 1] - TUNE[j]) * (u - j);
}
export function reedModel(fSound, P, tuned = true) {
  const r = tuned ? tuneRatio(fSound) : 1;
  const d = reedDesign(fSound / r, P);
  d.fSound = fSound; d.tune = r;
  d.table = areaTable(d.geo);
  return d;
}

// ---------------------------------------------------------------------------
// The steady state at wind pressure Pw (no motion): the throat carries what the gap lets
// through, the pallet's orifice drops a little, the reed sits deflected towards the slot.
export function equilibrium(R, Pw, pd = 0) {
  const out = { A: 0, dA: 0 };
  let dp = Pw, x = 0, y = 0, U = 0;
  for (let it = 0; it < 200; it++) {
    y = 0;
    for (const md of R.modes) y += (md.n === 0 ? -R.geo.y0 : 0) + (md.S * dp) / md.k;
    areaAt(R.table, y, out);
    x = dp > 0 ? (-EPS_V + Math.sqrt(EPS_V * EPS_V + 2 * AIR.rho * dp)) / AIR.rho : 0;
    U = CD * out.A * x;
    const next = Pw - R.K * U * U - pd;
    if (Math.abs(next - dp) < 1e-10 * Pw) { dp = next; break; }
    dp += 0.7 * (next - dp);
  }
  return { y, x, U, dp, pc: Pw - R.K * U * U, A: out.A, dA: out.dA };
}

// ---------------------------------------------------------------------------
// Small oscillations about the steady state ∝ e^{st}. Linearised: the gap's flow
// δU_g = δΔp/R_j + G_A δy (R_j = (ρx + ε)/c_d A, G_A = c_d x dA/dy), the reed's own swept
// volume s S_n η_n, the cell (compliance C) fed through the throat (s M_a + R_in) and, if
// fitted, the cassotto downstream (Z_d). Eliminating the pressures leaves one scalar equation
//   F(s) = 1 + Z_eff(s) Σₙ Sₙ (s Sₙ + G_A) / (mₙ (s² + 2ζₙωₙ s + ωₙ²)) = 0   (solved times Πₙ Dₙ/ωₙ²),
//   Z_eff = Z_t R_j / (Z_t + R_j),   Z_t = (s M_a + R_in) ∥ 1/(sC) + Z_d
// (all reed modes share y = Σ η_n at the tip). A blown-closed reed (G_A < 0) is driven when the
// part of Z_t it works against is inertive (Fletcher 1993).
const cx = (re, im) => ({ re, im });
const cadd = (a, b) => cx(a.re + b.re, a.im + b.im);
const cmul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const cinv = (a) => cdiv(cx(1, 0), a);
export function linearOperator(R, Pw, cass = null) {
  const eq = equilibrium(R, Pw);
  const Rj = (AIR.rho * eq.x + EPS_V) / (CD * eq.A), Mj = (AIR.rho * R.lj) / (CD * eq.A), GA = CD * eq.x * eq.dA, Rin = 2 * R.K * eq.U;
  const F = (s) => {
    const rj = cx(Rj + Mj * s.re, Mj * s.im); // the jet: its resistance and its air's mass
    const zin = cx(R.Ma * s.re + Rin, R.Ma * s.im);
    let zt = cdiv(zin, cadd(cx(1, 0), cmul(cx(R.C * s.re, R.C * s.im), zin)));
    if (cass) {
      const zn = cx(cass.M * s.re + cass.R, cass.M * s.im);
      zt = cadd(zt, cdiv(zn, cadd(cx(1, 0), cmul(cx(cass.C * s.re, cass.C * s.im), zn))));
    }
    const zeff = cdiv(cmul(zt, rj), cadd(zt, rj));
    // F·Πₙ mₙDₙ/(mₙωₙ²): free of the reed's own poles, so Newton can start on them
    const ds = R.modes.map((md) => cadd(cmul(s, s), cx(2 * md.zeta * md.om * s.re + md.om * md.om, 2 * md.zeta * md.om * s.im)));
    let prod = cx(1, 0), sum = cx(0, 0);
    for (let n = 0; n < R.modes.length; n++) {
      const md = R.modes[n], w2 = md.om * md.om;
      prod = cmul(prod, cx(ds[n].re / w2, ds[n].im / w2));
      let other = cx(1, 0);
      for (let k = 0; k < R.modes.length; k++) if (k !== n) other = cmul(other, cx(ds[k].re / R.modes[k].om ** 2, ds[k].im / R.modes[k].om ** 2));
      sum = cadd(sum, cmul(other, cx((md.S * (md.S * s.re + GA)) / (md.m * w2), (md.S * md.S * s.im) / (md.m * w2))));
    }
    return cadd(prod, cmul(zeff, sum));
  };
  return { F, eq, Rj, Mj, GA, Rin };
}
// The root of F near s0 (Newton, complex secant derivative). Returns { re, im } or null.
export function linearRoot(R, Pw, s0 = null, cass = null) {
  const { F } = linearOperator(R, Pw, cass);
  let s = s0 || cx(-R.modes[0].zeta * R.modes[0].om, R.modes[0].om);
  for (let it = 0; it < 60; it++) {
    const f = F(s), dh = 1e-6 * Math.hypot(s.re, s.im);
    const f2 = F(cx(s.re + dh, s.im));
    const df = cx((f2.re - f.re) / dh, (f2.im - f.im) / dh); // F is analytic: dF/ds = ∂F/∂re
    const step = cdiv(f, df);
    s = cx(s.re - step.re, s.im - step.im);
    if (Math.hypot(step.re, step.im) < 1e-11 * Math.hypot(s.re, s.im)) return s;
  }
  return Number.isFinite(s.re) ? s : null;
}
// The threshold blowing pressure: where the reed's root crosses into the right half plane
// (followed from 2 Pa upwards on a log grid, then bisected). Returns { P, f } (f: the frequency
// the reed starts at) or null if it never does below pMax.
export function threshold(R, pMax = 2e4, cass = null) {
  let s = linearRoot(R, 2, null, cass), pPrev = 2, sPrev = s;
  if (!s) return null;
  if (s.re > 0) return { P: 2, f: s.im / TAU };
  for (let p = 2 * 1.05; p <= pMax; p *= 1.05) {
    const sn = linearRoot(R, p, s, cass);
    if (!sn) return null;
    if (sn.re > 0) {
      let a = pPrev, b = p, sa = sPrev;
      for (let i = 0; i < 50; i++) {
        const m = Math.sqrt(a * b), sm = linearRoot(R, m, sa, cass);
        if (sm.re > 0) b = m; else { a = m; sa = sm; }
      }
      const sf = linearRoot(R, b, sa, cass);
      return { P: b, f: sf.im / TAU };
    }
    pPrev = p; sPrev = sn; s = sn;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The wind. The feeders (pumped by the feet) push air into a spring-loaded reservoir through
// their own resistance, so the reservoir's pressure is the player's effort less what the reeds
// draw: P = P_effort − U/G in the steady state, approached with time constant τ = C/G.
// The expression stop shuts the reservoir off: only the wind chest's small volume is left,
// so the pressure follows the pumping (and its strokes) within a few milliseconds.
export const WIND = {
  G: 1.0e-4,        // m³/s per Pa: how much more the feeders deliver per pascal the pressure falls short
  tauRes: 0.6,      // s: reservoir
  tauExpr: 0.015,   // s: wind chest only (expression stop)
  pumpDepth: 0.2,   // how unevenly each stroke delivers (0: smooth)
};
export function windTau(P) { return P.expression ? WIND.tauExpr : WIND.tauRes; }
// Pumping: two feeders worked alternately, each at `rate` strokes per second; each delivers
// ∝ |sin| over its stroke, so the effort swells 2·rate times a second: |sin 2π·rate·t|.
export function pumpShape(t, rate) {
  if (!(rate > 0)) return 1;
  return 1 - WIND.pumpDepth + WIND.pumpDepth * (PI / 2) * Math.abs(Math.sin(TAU * rate * t));
}

// ---------------------------------------------------------------------------
// The cassotto (accordion tone chamber): the reeds sound into a chamber of volume V whose
// single mouth (area A, length ℓ, end corrections included) leads out. A Helmholtz resonator:
//   C dp_d/dt = Σ U_out − U_k,   M dU_k/dt = p_d − R U_k,   f_k = 1/(2π√(MC)),  Q = ω_k M / R
// The sound is the mouth's volume acceleration: the reeds' flow, low-passed above f_k at
// 12 dB/octave, after a peak at f_k. Its pressure p_d acts back on every reed.
export const CASSOTTO = { A: 20e-4, l: 0.03, Q: 2 };
export function cassotto(P) {
  const M = (AIR.rho * CASSOTTO.l) / CASSOTTO.A, om = TAU * P.cassF, C = 1 / (M * om * om);
  return { M, C, R: (om * M) / CASSOTTO.Q, V: C * AIR.rho * AIR.c * AIR.c, f: P.cassF };
}

// Pallet: velocity sets how fast the key opens it (a fast key opens it in 3 ms, a slow one in 30).
export const palletOpen = (vel) => 0.003 + 0.027 * (1 - clamp(vel, 0, 1)) ** 2;
export const palletClose = (rel) => (rel === undefined ? 0.008 : 0.003 + 0.012 * (1 - clamp(rel, 0, 1)));
// Percussion (Martin 1841): a small hammer strikes the 8′ reed as the key goes down, so it
// speaks at once; velocity sets the hammer's blow (tip speed given to the reed, m/s).
export const percussionSpeed = (vel) => 0.6 * clamp(vel, 0.05, 1);
