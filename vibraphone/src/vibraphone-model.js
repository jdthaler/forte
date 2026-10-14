// vibraphone-model.js — the physics of a vibraphone, kept free of audio and DOM
// so that the page, the engine, the tests and the tools can all use it.
//
//      mallet ●
//   ┌──────────╲_______________________╱──────────┐  aluminium bar (undercut, bar.js)
//   ○ cord at a node     air gap g         cord ○
//                 ┌────────═╪═────────┐  ← butterfly disc on the motor's shaft
//                 │                   │
//                 │  stopped tube,    │  quarter-wave resonator tuned to the bar
//                 │  pressure node at │
//                 │  the mouth        │
//                 └───────────────────┘  closed end
//
// Bar mode 1 and the tube's first mode are two oscillators sharing the air in
// the gap (inertial coupling); the disc's angle sets the mouth's open area, and
// so the tube's end correction and its coupling to the bar: the tremolo.

import { TAU, keyFreq } from '../../shared/dsp.js';
import { AL, barModes, bendingFreqs3 } from './bar.js';
import { BAR_TABLE } from './bar-table.js';

export { keyFreq };
export const KEY_LO = 53, KEY_HI = 89; // F3–F6, the standard three-octave vibraphone
export const T_TUNE = 20;              // °C: bars and tubes are tuned at this temperature
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const tKey = (k) => clamp((k - KEY_LO) / (KEY_HI - KEY_LO), 0, 1);

// Air: ideal gas at sea level.
export function air(T) {
  const K = T + 273.15;
  return { c: 331.3 * Math.sqrt(K / 273.15), rho: 101325 / (287.05 * K) };
}

// ---------------------------------------------------------------------------
// The bars

// What every bar starts as: aluminium 12.7 mm (½") thick, its width graded from
// 57 mm (F3) to 38 mm (F6); cf = c/a, the flat share of the cut (see bar.js).
export function barBlank(k) {
  const t = tKey(k);
  return { b: 0.057 - 0.019 * t, h0: 0.0127, cf: 0.22 + 0.63 * t };
}

// Natural or accidental, its place on its shaft, and its centre along the frame.
const IS_ACC = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
export function barLayout(k) {
  let nat = 0, acc = 0, x = 0;
  for (let m = KEY_LO; m < k; m++) if (IS_ACC[m % 12]) acc++; else nat++;
  const accidental = !!IS_ACC[k % 12];
  // naturals sit side by side (bar width + 8 mm); an accidental sits over the gap between two naturals
  if (accidental) x = barLayout(k - 1).x + (barBlank(k - 1).b + 0.008) / 2;
  else for (let m = KEY_LO; m <= k; m++) if (!IS_ACC[m % 12]) x += m === k ? barBlank(m).b / 2 : barBlank(m).b + 0.008;
  return { accidental, index: accidental ? acc : nat, x };
}
export const FRAME = barLayout(KEY_HI).x + barBlank(KEY_HI).b / 2;

// Stereo: equal-power pan by where the bar sits along the 1.2 m frame (bass left).
export function barPan(k, width = 0.55) {
  const p = width * ((2 * barLayout(k).x) / FRAME - 1), a = ((p + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}

// The bar for key k with its undercut at `depth` × the tuned depth (1: the
// 1 : 4 : 10 bar from the table; 0: a plain bar). The cut keeps its shape in
// proportion to the bar, and the bar is cut to the length that keeps mode 1 on pitch
// (a plain bar is about 1.5–1.7 times longer than the tuned one: the cut lowers f₁).
export function barGeometry(k, depth = 1) {
  const { b, h0, cf } = barBlank(k), row = BAR_TABLE[k - KEY_LO];
  if (!row || row[0] !== k) throw new Error(`no tuned bar for key ${k}: run node tools/vibraphone-bars.mjs`);
  const A = row[2], D = row[3] * depth;
  const cutFor = (L) => ({ h0, a: (A * L) / 2, c: (cf * A * L) / 2, d: D * h0 });
  let L = row[1];
  if (depth !== 1) {
    // at a fixed shape f₁ ∝ 1/L², nearly (shear and rotary inertia add a little)
    for (let it = 0; it < 8; it++) {
      const f1 = bendingFreqs3(cutFor(L), L, b)[0], r = f1 / keyFreq(k);
      L *= Math.sqrt(r);
      if (Math.abs(r - 1) < 1e-9) break;
    }
  }
  return { key: k, L, b, h0, cf, A, D, depth, cut: cutFor(L) };
}

// Thermoelastic damping (Zener): bending squeezes one face and stretches the
// other, and heat flowing across the thickness h takes energy with it.
//   η = Δ ωτ/(1 + ω²τ²),  Δ = Eα²T/(ρc_p),  τ = h²/(π² D_th)
export const THERMO = { alpha: 23e-6, cp: 900, k: 167, T: 293.15 };
export const ZENER_DELTA = (AL.E * THERMO.alpha ** 2 * THERMO.T) / (AL.rho * THERMO.cp);
const D_TH = THERMO.k / (AL.rho * THERMO.cp);
export function zener(h, f) {
  const wt = (TAU * f * h * h) / (Math.PI * Math.PI * D_TH);
  return (ZENER_DELTA * wt) / (1 + wt * wt);
}

// Losses that do not depend on the knobs (σ, s⁻¹; unit modal mass):
//  · thermoelastic, each element weighted by its share of the mode's bending energy;
//  · the cords: each bar hangs on two cords through holes at mode 1's nodes, a small
//    dashpot r_s at each: σ = ½ r_s Σ w(x_s)² (zero for mode 1, whose nodes they are,
//    but for the cords' width);
//  · radiation from the bar itself (below).
export const SUPPORT = { r: 0.25, halfWidth: 0.002 }; // N·s/m per cord; cord radius (m)

// A thin strip moving normal to itself radiates as a line of dipoles whose
// strength per unit length is its added mass over ρ₀, π(b/2)² per metre of
// velocity. Far field: p = ρ₀ω²k cosθ I(μ) q / 4πr with I(μ) = ∫ (πb²/4) w(x) e^{ikxμ} dx
// (μ = cos of the angle to the bar). Its power gives the radiation damping
//   σ_rad = ρ₀ c k⁴ J / 32π,   J = ∫(1 − μ²)|I(μ)|² dμ,
// and the same power from a monopole of volume acceleration q̈·k√J/2 is what
// the listener hears. Above kb ≈ 2 the strip stops being compact: the dipole
// strength is rolled off by 1/√(1 + (kb/2)²). Torsion: the two edges move in
// opposite directions, a lateral quadrupole: density (πb⁴/128)·k ψ(x) (estimate).
function radiationJ(xs, shape, density, k, L) {
  const nx = xs.length, NM = 24;
  let J = 0;
  for (let j = 0; j < NM; j++) {
    const mu = -1 + (2 * (j + 0.5)) / NM;
    let re = 0, im = 0;
    for (let i = 0; i < nx; i++) {
      const wq = (i === 0 || i === nx - 1 ? 0.5 : 1) * (xs[1] - xs[0]);
      const ph = k * (xs[i] - L / 2) * mu, v = density(xs[i]) * shape[i] * wq;
      re += v * Math.cos(ph); im += v * Math.sin(ph);
    }
    J += (1 - mu * mu) * (re * re + im * im) * (2 / NM);
  }
  return J;
}

const interp = (xs, ys, x) => {
  const n = xs.length, u = clamp(((x - xs[0]) / (xs[n - 1] - xs[0])) * (n - 1), 0, n - 1 - 1e-9), i = Math.floor(u), f = u - i;
  return ys[i] * (1 - f) + ys[i + 1] * f;
};
export const DAMPER_X = 0.05; // the felt damper bar presses on each bar this far (× L) from its inner end

// Everything about one bar (key k, undercut depth) that does not change while it rings.
const barCache = new Map();
export function barModel(k, depth = 1) {
  const id = `${k}|${depth}`;
  if (barCache.has(id)) return barCache.get(id);
  const g = barGeometry(k, depth), m = barModes(g.cut, g.L, g.b), { c, rho } = air(T_TUNE);
  const xs = m.xs, w1 = m.bend[0].w;
  // the cords hang at mode 1's nodes
  const nodes = [];
  for (let i = 1; i < xs.length; i++) if (w1[i - 1] * w1[i] < 0) nodes.push(xs[i - 1] + ((xs[i] - xs[i - 1]) * w1[i - 1]) / (w1[i - 1] - w1[i]));
  const at = (sh, x) => interp(xs, sh, x);
  const slope = (sh, x) => (at(sh, x + 1e-4) - at(sh, x - 1e-4)) / 2e-4;
  const supportSigma = (sh) => nodes.reduce((s, x) => s + 0.5 * SUPPORT.r * (at(sh, x) ** 2 + (SUPPORT.halfWidth * slope(sh, x)) ** 2 / 3), 0);
  const dip = (k) => 1 / Math.sqrt(1 + ((k * g.b) / 2) ** 2);
  const modes = [];
  for (const [n, md] of m.bend.entries()) {
    const k = (TAU * md.f) / c, J = radiationJ(xs, md.w, () => (Math.PI * g.b * g.b) / 4, k, g.L);
    const sigRad = (rho * c * k ** 4 * J * dip(k) ** 2) / (32 * Math.PI);
    let eta = 0;
    for (const e of md.elems) eta += e.share * zener(e.h, md.f);
    modes.push({
      kind: 'bend', n: n + 1, f: md.f, ratio: md.f / m.bend[0].f, sym: md.sym, w: md.w,
      sigTE: Math.PI * md.f * eta, sigSup: supportSigma(md.w), sigRad, out: (k * Math.sqrt(J) * dip(k)) / 2,
    });
  }
  for (const [n, md] of m.tors.entries()) {
    const k = (TAU * md.f) / c, J = radiationJ(xs, md.psi, () => (Math.PI * g.b ** 4 * k) / 128, k, g.L);
    const sigRad = (rho * c * k ** 4 * J * dip(k) ** 2) / (32 * Math.PI);
    // torsion: the cords sit on the centre line, so they barely touch it; no bending, so no thermoelastic loss
    modes.push({ kind: 'tors', n: n + 1, f: md.f, ratio: md.f / m.bend[0].f, sym: md.sym, w: md.psi, sigTE: 0, sigSup: 0, sigRad, out: (k * Math.sqrt(J) * dip(k)) / 2 });
  }
  const model = { key: k, geom: g, xs, modes, nodes, mass: m.mass, hmin: g.h0 - g.cut.d };
  barCache.set(id, model);
  return model;
}

// ---------------------------------------------------------------------------
// The resonators

// Tube radius, graded from 38 mm (F3) to 21 mm (F6).
export const tubeRadius = (k) => 0.038 * (0.021 / 0.038) ** tKey(k);

// Geometry of bar and tube where they meet: the mouth (radius a_t, area S) sits
// under the middle of the bar, and S_b = ∫ w₁ dA over the part of the bar above
// it is the volume mode 1 pushes toward the mouth per unit modal displacement.
// The flow escaping sideways through the gap must travel ~R_b = min(b/2, a_t).
export function tubeGeometry(k, bar) {
  const a = tubeRadius(k), { L, b } = bar.geom, w1 = bar.modes[0].w, N = 64;
  let Sb = 0;
  for (let i = 0; i < N; i++) {
    const x = -a + (2 * a * (i + 0.5)) / N, chord = Math.min(b, 2 * Math.sqrt(Math.max(0, a * a - x * x)));
    Sb += chord * interp(bar.xs, w1, L / 2 + x) * ((2 * a) / N);
  }
  return { a, S: Math.PI * a * a, Sb: Math.abs(Sb), Rb: Math.min(b / 2, a), delta0: 0.61 * a, lv: 0.25 * a };
}

// The escaping air's inertance (kg/m⁴): radial flow out of the gap of height g,
// ρ₀ ln(1 + R_b/g)/(2πg). It is what couples the bar to the tube: a bar pressed
// close to the mouth has nowhere to push its air but into the tube.
export const gapInertance = (rho, g, Rb) => (rho * Math.log(1 + Rb / g)) / (TAU * g);

// The disc: a butterfly valve on the shaft across the mouth, its area cd·S. At
// angle θ (0 = edge-on, open) it leaves s = 1 − cd|sin θ| of the mouth open, and
// the flow squeezing past it adds an end correction ℓ_v(1/s − 1) (ℓ_v = a/4, an estimate).
export const openFraction = (theta, cd) => 1 - cd * Math.abs(Math.sin(theta));

// The two-oscillator model of bar mode 1 (q, unit modal mass) and the tube's
// first mode (X, volume pushed out of the mouth). The escaping volume is X − S_b q, so
//   T = ½ q̇² + ½ (m_a + m_c) Ẋ² + ½ m_g (Ẋ − S_b q̇)²,   V = ½ ω_b² q² + ½ K_a X²
// with m_a = ρℓ_e/2S and K_a = m_a (πc/2ℓ_e)² for a quarter-wave tube of
// effective length ℓ_e = L_t + 0.61 a_t. The tube is cut so that, with the disc
// open and the bar in place, it is tuned to the bar (× 2^(detune/1200)) at 20 °C.
// Losses: radiation from the mouth R = ρck²/4π (an unflanged pipe, i.e. a monopole of
// volume velocity Ẋ: the far field of bar plus gap plus tube nets to Ẋ alone), and
// the walls' viscous and thermal boundary layers, σ_w = αc with α = 2.95×10⁻⁵ √f / a_t.
export function tubeState(tg, f1, { gap, detune = 0, temp = T_TUNE, cd }) {
  const g = Math.max(1e-3, gap), a0 = air(T_TUNE), A = air(temp);
  // cut the tube at the tuning temperature, with the disc open
  const wT = TAU * f1 * 2 ** (detune / 1200), lx = (Math.log(1 + tg.Rb / g) * tg.S) / (TAU * g);
  const le = -lx + Math.sqrt(lx * lx + ((Math.PI * a0.c) / (2 * wT)) ** 2);
  const ma = (A.rho * le) / (2 * tg.S), Ka = ma * ((Math.PI * A.c) / (2 * le)) ** 2, mg = gapInertance(A.rho, g, tg.Rb);
  const k = (TAU * f1) / A.c, Rrad = (A.rho * A.c * k * k) / (4 * Math.PI), sw = 2.95e-5 * Math.sqrt(f1) / tg.a * A.c;
  return {
    length: le - tg.delta0, le, ma, Ka, mg, Sb: tg.Sb, Rrad, Rwall: 2 * sw * ma, R: Rrad + 2 * sw * ma,
    lvS: (A.rho * tg.lv) / tg.S, cd,
    M11: 1 + mg * tg.Sb * tg.Sb, M12: -mg * tg.Sb, M22: ma + mg, // + m_c(θ) on M22
  };
}
export const discMass = (ts, theta) => ts.lvS * (1 / openFraction(theta, ts.cd) - 1);

// Coupling coefficient κ = |M₁₂|/√(M₁₁M₂₂) and the tube's own frequency (bar held still) at disc angle θ.
export function coupling(ts, theta, fb) {
  const m22 = ts.M22 + discMass(ts, theta);
  return { kappa: -ts.M12 / Math.sqrt(ts.M11 * m22), ft: Math.sqrt(ts.Ka / m22) / TAU, fb: fb / Math.sqrt(ts.M11), m22 };
}

// Two oscillators coupled through their masses, M = [[1, −κ], [−κ, 1]] in
// normalised coordinates: (1 − κ²)ω⁴ − (ω_b² + ω_t²)ω² + ω_b²ω_t² = 0. When tuned,
// ω± = ω₀/√(1 ∓ κ): the pair splits by about κf₀ and the energy beats between them.
export function twoOscillator(fb, ft, kappa) {
  const wb = TAU * fb, wt = TAU * ft, s = wb * wb + wt * wt, dsc = Math.sqrt(s * s - 4 * (1 - kappa * kappa) * wb * wb * wt * wt);
  return [Math.sqrt((s - dsc) / (2 * (1 - kappa * kappa))) / TAU, Math.sqrt((s + dsc) / (2 * (1 - kappa * kappa))) / TAU];
}

// The damped pair exactly: the roots s of det(s²M + sC + K) = 0 (a quartic with real
// coefficients, solved by Durand–Kerner). Returns [{ f, sigma }] for the two modes.
export function coupledModes(M11, M12, M22, C11, C22, K11, K22) {
  const a4 = M11 * M22 - M12 * M12, a3 = M11 * C22 + M22 * C11, a2 = M11 * K22 + M22 * K11 + C11 * C22, a1 = C11 * K22 + C22 * K11, a0 = K11 * K22;
  const c = [a3 / a4, a2 / a4, a1 / a4, a0 / a4];
  const P = (re, im) => { // z⁴ + c0 z³ + c1 z² + c2 z + c3
    let pr = 1, pi = 0;
    for (const ck of c) { const r = pr * re - pi * im + ck, i = pr * im + pi * re; pr = r; pi = i; }
    return [pr, pi];
  };
  const scale = Math.sqrt(Math.sqrt(c[3]));
  let z = [0, 1, 2, 3].map((j) => [scale * Math.cos(0.4 + (j * Math.PI) / 2), scale * Math.sin(0.4 + (j * Math.PI) / 2)]);
  for (let it = 0; it < 500; it++) {
    let move = 0;
    z = z.map(([re, im], j) => {
      let [nr, ni] = P(re, im), dr = 1, di = 0;
      for (let q = 0; q < 4; q++) if (q !== j) { const xr = re - z[q][0], xi = im - z[q][1], t = dr * xr - di * xi; di = dr * xi + di * xr; dr = t; }
      const den = dr * dr + di * di, qr = (nr * dr + ni * di) / den, qi = (ni * dr - nr * di) / den;
      move = Math.max(move, Math.hypot(qr, qi));
      return [re - qr, im - qi];
    });
    if (move < 1e-12 * scale) break;
  }
  return z.filter(([, im]) => im > 0).map(([re, im]) => ({ f: im / TAU, sigma: -re })).sort((x, y) => x.f - y.f);
}

// ---------------------------------------------------------------------------
// Mallet: a yarn-wound head on a rubber core. Contact force F = K δ^p (δ = how far the
// head is squashed), stiffening as the yarn packs down onto the core, with a little
// hysteresis F·(1 + α dδ/dt …) from the yarn. The Hardness knob is the force at 1 mm.
export const MALLET = { p: 2.3, alpha: 3e-5 };
export const malletOf = (P) => ({ m: P.mass / 1000, K: P.hardness / 1e-3 ** MALLET.p, p: MALLET.p, alpha: MALLET.alpha });

// Bar frequencies drift with temperature: aluminium softens (dE/E ≈ −4.8×10⁻⁴ per K)
// and expands (α = 23×10⁻⁶ per K), so f ∝ 1 + ½(α + dE/E)ΔT: about −0.4 ¢ per kelvin.
export const BAR_TEMPCO = 0.5 * (THERMO.alpha - 4.8e-4);
export const barTempScale = (temp) => 1 + BAR_TEMPCO * (temp - T_TUNE);

// ---------------------------------------------------------------------------
// The voice data the engine plays (the page sends it with each note; in Node the
// engine builds it): modes, their shapes at the points that matter, losses, outputs.
export function voiceData(k, depth = 1) {
  const bar = barModel(k, depth), tg = tubeGeometry(k, bar), lay = barLayout(k), nx = bar.xs.length;
  const N = bar.modes.length, w = new Float64Array(N * nx);
  bar.modes.forEach((m, i) => w.set(m.w, i * nx));
  const L = bar.geom.L, xd = (1 - DAMPER_X) * L; // the inner end (x = L), where the views draw it
  const d1 = interp(bar.xs, bar.modes[0].w, xd);
  return {
    key: k, depth, L, b: bar.geom.b, nx, N, nb: bar.modes.filter((m) => m.kind === 'bend').length, w,
    f: Float64Array.from(bar.modes, (m) => m.f),
    tors: Uint8Array.from(bar.modes, (m) => (m.kind === 'tors' ? 1 : 0)),
    sigFixed: Float64Array.from(bar.modes, (m) => m.sigTE + m.sigSup + m.sigRad),
    out: Float64Array.from(bar.modes, (m) => m.out),
    // the damper felt: a line across the bar at x_d (torsion: averaged over the width)
    dampW: Float64Array.from(bar.modes, (m) => (interp(bar.xs, m.w, xd) * (m.kind === 'tors' ? bar.geom.b / Math.sqrt(12) : 1) / d1) ** 2),
    tube: tg, accidental: lay.accidental, shaftIndex: lay.index, pan: barPan(k),
  };
}
