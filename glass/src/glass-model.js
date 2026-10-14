// glass-model.js — the physics of Franklin's armonica, kept free of audio and
// DOM so that the page, the engine, the tests and the render tool share it.
//
// Each key is a thin hemispherical glass bowl on a horizontal spindle. Its
// sound is the flexural (inextensional) modes of the shell, n = 2, 3, 4, …
// nodal meridians. Rayleigh found the exact inextensional displacement field
// of a spherical shell (Theory of Sound §§ 233–235): with θ the polar angle
// from the pole (the neck) and φ the azimuth,
//   u = sinθ tⁿ cos nφ,  v = sinθ tⁿ sin nφ,  w = −(n + cosθ) tⁿ cos nφ,   t = tan(θ/2)
// (meridional, azimuthal, outward normal). It stretches nothing, so all the
// strain energy is bending, and for a sphere the bending is a pure twist:
// κ_θ = −κ_φ = n(n²−1)tⁿ cos nφ /(a² sin²θ), τ = −n(n²−1)tⁿ sin nφ /(a² sin²θ).
// Rayleigh's energy ratio is then exact within thin-shell theory:
//   ω_n² = E h² n²(n²−1)² I₁ / (3ρ(1+ν) a⁴ I₂),
//   I₁ = ∫ t²ⁿ/sin³θ dθ,   I₂ = ∫ t²ⁿ [2 sin²θ + (n + cosθ)²] sinθ dθ   (0 … π/2).
// At the rim (θ = π/2) the tangential motion is 1/n of the radial: v = sin nφ,
// w = −n cos nφ. A finger rubbing tangentially therefore drives the pattern
// whose radial node sits under it.
//
// Units: SI throughout.

import { keyFreq } from '../../shared/dsp.js';

export const KEY_LO = 53, KEY_HI = 93;            // F3–A6 (Franklin: 37 bowls, G3–G6)
export const GLASS = { E: 70e9, rho: 2500, nu: 0.22 }; // soda-lime/potash glass
export const RHO_WATER = 1000, C_AIR = 343;
export const N_MAX = 6;                            // highest family kept (if below 16 kHz)
const PI = Math.PI;
const INCH = 0.0254;

// Simpson's rule on [a, b] with m (even) intervals.
function simpson(f, a, b, m = 96) {
  const h = (b - a) / m;
  let s = f(a) + f(b);
  for (let i = 1; i < m; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}

// Rayleigh's integrals, written in t = tan(θ/2) (dθ = 2 dt/(1+t²)), so they are
// smooth rational integrands on [0, t_max]; t_max = 1 at the rim of a hemisphere.
//   I₁ = ¼ [1/(2n−2) + 1/n + 1/(2n+2)]                              (closed form)
//   I₂ = ∫ 4t²ⁿ⁺¹ [8t² + ((n+1) + (n−1)t²)²] / (1+t²)⁴ dt
//   I₃ = ∫ sin³θ t²ⁿ dθ = ∫ 16 t²ⁿ⁺³ / (1+t²)⁴ dt                    (Coriolis)
//   J(θ_d) = ∫ sin⁵θ t²ⁿ dθ = ∫ 64 t²ⁿ⁺⁵ / (1+t²)⁶ dt               (liquid, to depth θ_d)
const cache = new Map();
export function rayleigh(n) {
  if (cache.has(n)) return cache.get(n);
  const I1 = 0.25 * (1 / (2 * n - 2) + 1 / n + 1 / (2 * n + 2));
  const I2 = simpson((t) => (4 * t ** (2 * n + 1) * (8 * t * t + ((n + 1) + (n - 1) * t * t) ** 2)) / (1 + t * t) ** 4, 0, 1);
  const I3 = simpson((t) => (16 * t ** (2 * n + 3)) / (1 + t * t) ** 4, 0, 1);
  const nu = GLASS.nu;
  const r = {
    I1, I2, I3,
    lambda: Math.sqrt((n * n * (n * n - 1) ** 2 * I1) / (3 * (1 + nu) * I2)), // ω = λ (h/a²) √(E/ρ)
    bryan: (2 * I3) / I2, // pattern precession in the bowl's frame, as a fraction of its rotation
  };
  cache.set(n, r);
  return r;
}
// Rayleigh's inextensional field itself (unit sphere), for the tests and views.
export function rayleighField(n, th, ph) {
  const t = Math.tan(th / 2) ** n;
  return { u: Math.sin(th) * t * Math.cos(n * ph), v: Math.sin(th) * t * Math.sin(n * ph), w: -(n + Math.cos(th)) * t * Math.cos(n * ph) };
}
export const liquidJ = (n, thetaD) => (thetaD <= 0 ? 0 : simpson((t) => (64 * t ** (2 * n + 5)) / (1 + t * t) ** 6, 0, Math.tan(Math.min(thetaD, PI / 2) / 2), 64));

// A thin ring (Rayleigh, Hoppe): the same modes in the limit of a short cylinder.
export const ringRatio = (n) => (n * (n * n - 1)) / Math.sqrt(n * n + 1) / (6 / Math.sqrt(5));
export const ringBryan = (n) => 2 / (n * n + 1);

// Bowl size. Franklin (letter to Beccaria, 1762): the largest glass nine inches
// across, the smallest three, graded in quarter inches, with walls "about a
// tenth of an inch near the brim" (the tuned walls below reproduce that, as a
// check). Diameter is taken linear in key from G3 to G6 (extrapolated a little
// beyond).
export function bowlRadius(key) { return 0.5 * INCH * (9 - (6 * (key - 55)) / 36); }

// Wall thickness that puts the (empty, perfect) n = 2 mode on the key's pitch.
export function bowlThickness(key, f = keyFreq(key)) {
  const a = bowlRadius(key);
  return (2 * PI * f * a * a) / (rayleigh(2).lambda * Math.sqrt(GLASS.E / GLASS.rho));
}

// Radiation: treat the bowl as a sphere of radius a vibrating in the order-n
// harmonic. Far-field pressure p·r = ρc a v_s · ε_n(ka), ε_n = 1/(ka |h_n′(ka)|),
// which → (ka)ⁿ⁺¹/((n+1)(2n−1)!!) for ka ≪ 1 (a 2ⁿ-pole is a poor radiator when
// small) and → 1 for ka ≫ 1.
export function radiationEff(n, ka) {
  // spherical Bessel j, y by upward recurrence (y dominates |h| at small ka)
  let j0 = Math.sin(ka) / ka, y0 = -Math.cos(ka) / ka;
  let j1 = j0 / ka - Math.cos(ka) / ka, y1 = y0 / ka - Math.sin(ka) / ka;
  let jm = j0, ym = y0, jn = j1, yn = y1;
  for (let l = 1; l < n; l++) {
    const jp = ((2 * l + 1) / ka) * jn - jm, yp = ((2 * l + 1) / ka) * yn - ym;
    jm = jn; ym = yn; jn = jp; yn = yp;
  }
  // h_n′ = h_{n−1} − (n+1)/x h_n
  const dj = jm - ((n + 1) / ka) * jn, dy = ym - ((n + 1) / ka) * yn;
  return 1 / (ka * Math.hypot(dj, dy));
}

// Deterministic per-key pseudo-random number in [−1, 1] (bowls are individuals).
export function keyNoise(m, salt = 0) {
  let t = ((m + 977 * salt) * 2654435761) >>> 0;
  t ^= t >>> 15; t = Math.imul(t, 2246822519) >>> 0; t ^= t >>> 13;
  return ((t >>> 0) / 4294967296) * 2 - 1;
}

// Liquid loading (French 1983; Jundt et al. 2006): the wall's horizontal motion
// at height z, ξ = −n sinθ tⁿ cos nφ, drives a 2-D potential flow in each
// horizontal slice of the liquid whose kinetic energy is ρ_l π r² ξ²/(2n) per
// unit height. Added kinetic energy over the glass's:
//   Λ_n = (ρ_l a / ρ_g h) · n J_n(θ_d) / I₂,   f = f₀ / √(1 + Λ_n),
// with the fill depth d = a(1 − cos θ_d) measured from the bottom of the bowl.
export function waterLoad(n, a, h, fill) {
  if (!(fill > 0)) return 0;
  const thetaD = Math.acos(1 - Math.min(1, fill));
  return ((RHO_WATER * a) / (GLASS.rho * h)) * n * liquidJ(n, thetaD) / rayleigh(n).I2;
}

// Everything the engine and the views need for one bowl.
//   modes: [{ n, f, f1, f2, sigma, M, bryan, rad, psi }]
//     f      empty-or-wet mean frequency of the doublet (Hz)
//     f1, f2 the two members, split by the bowl's irregularity
//     M      modal mass referred to tangential rim displacement (kg)
//     rad    radiation efficiency ε_n(ka) at f
//     psi    orientation of the irregularity (its 2n-th harmonic) on the bowl
export function bowl(key, P) {
  const a = bowlRadius(key), h = bowlThickness(key), f0 = keyFreq(key);
  const cE = Math.sqrt(GLASS.E / GLASS.rho);
  const modes = [];
  for (let n = 2; n <= N_MAX; n++) {
    const r = rayleigh(n);
    const fEmpty = (r.lambda * (h / (a * a)) * cE) / (2 * PI);
    const load = waterLoad(n, a, h, P.water);
    const f = fEmpty / Math.sqrt(1 + load);
    if (f > 16000 && n > 2) break;
    // The irregularity is a mass irregularity (uneven wall), so liquid, which
    // loads every part of the wall equally, dilutes it (Jundt et al. 2006 saw
    // the doublet of a wine glass merge on filling).
    const split = (P.split / 1200) * Math.LN2 * (n === 2 ? 1 : 0.6 + 0.4 * Math.abs(keyNoise(key, n))) / (1 + load);
    const M = PI * GLASS.rho * h * a * a * r.I2 * (1 + load);
    modes.push({
      n, f, fEmpty, load,
      f1: f * (1 - split / 2), f2: f * (1 + split / 2),
      sigma: PI * f * P.loss + 0.15,
      M, bryan: r.bryan,
      rad: radiationEff(n, (2 * PI * f * a) / C_AIR),
      psi: (PI / (2 * n)) * keyNoise(key, 10 + n),
    });
  }
  return { key, a, h, f0, modes, mass: 2 * PI * a * a * h * GLASS.rho };
}

// The lab-frame lines of a free (untouched) rotating bowl, family n. In the
// bowl's frame the doublet obeys
//   q̈_c − 2g q̇_s + ω₁² q_c = 0,   q̈_s + 2g q̇_c + ω₂² q_s = 0,   g = nBΩ,
// whose frequencies solve (ω₁² − λ²)(ω₂² − λ²) = 4g²λ²:
//   λ² = ω̄² + 2g² ± √((ω₁² − ω₂²)²/4 + 4g²ω̄² + 4g⁴),  ω̄² = (ω₁² + ω₂²)/2.
// A microphone fixed in the room sees each as two Doppler lines λ ± nΩ, in the
// proportion |1 ± r|, r = (ω₁² − λ²)/(2gλ) (the mode's forward/backward
// travelling content). For a perfect bowl r = ∓1: one line each, at
// ω ± n(1 − B)Ω — the pattern precesses at (1 − B)Ω in space (Bryan 1890).
// Returns [{ f, w }] with w the relative weight within each pair.
export function freeLines(m, rot) {
  const W = 2 * PI * rot, g = m.n * m.bryan * W, w1 = 2 * PI * m.f1, w2 = 2 * PI * m.f2;
  const wb2 = 0.5 * (w1 * w1 + w2 * w2), d = Math.sqrt(0.25 * (w1 * w1 - w2 * w2) ** 2 + 4 * g * g * wb2 + 4 * g ** 4);
  const out = [];
  for (const lam of [Math.sqrt(wb2 + 2 * g * g - d), Math.sqrt(wb2 + 2 * g * g + d)]) {
    const r = g > 0 ? (w1 * w1 - lam * lam) / (2 * g * lam) : Infinity;
    const wp = Number.isFinite(r) ? Math.abs(1 + r) / (Math.abs(1 + r) + Math.abs(1 - r)) : 0.5;
    out.push({ f: (lam - m.n * W) / (2 * PI), w: 1 - wp }, { f: (lam + m.n * W) / (2 * PI), w: wp });
  }
  return out;
}

// Friction of wet skin on clean glass: a Stribeck curve (cf. Armstrong-Hélouvry
// et al. 1994) plus a weak viscous (hydrodynamic) term,
//   μ(u) = μd + Δμ/(1 + (u/v0)²) + β u.
// Flat at zero slip, steepest at u = v0/√3, with a gentle tail, so the bowls
// still speak over a range of treadle speeds; for u < v0 its third derivative
// is positive, so oscillations start softly (supercritically). Water softens
// the stratum corneum and, on clean (hydrophilic) glass, gives the high,
// steeply falling friction of boundary-lubricated skin: the "squeaky clean"
// grab. Dry skin barely weakens with speed (Δμ small).
export function friction(P) {
  const w = Math.min(1, Math.max(0, P.wet));
  return { mud: 0.3 + 0.1 * w, dmu: 0.03 + 0.8 * w * w, v0: P.v0, beta: 0.02 };
}
export const mu = (u, fr) => fr.mud + fr.dmu / (1 + (u / fr.v0) ** 2) + fr.beta * u;
export function frictionSlope(u, fr) { // −dμ/du: positive where friction weakens with speed
  const x = u / fr.v0;
  return (2 * fr.dmu * x) / (fr.v0 * (1 + x * x) ** 2) - fr.beta;
}

// The fingertip: a skin pad (mass, shear spring, damper) between the finger
// bone, held still, and the contact; and the pressed pulp's damping of the
// rim's normal (radial) motion, which grows with the contact as the finger
// presses (cr·N/(N + N½)). Order-of-magnitude values for a fingertip: shear
// stiffness ~2 N/mm, damping of a few N·s/m, a skin layer of ~20 mg at the
// contact; land = time constant of the normal force building up, lift = time
// for it to fall to zero as the finger leaves the rim.
export const SKIN = { m: 2e-5, k: 2000, c: 8, cr: 6, nHalf: 0.1, land: 0.012, lift: 0.01 };
export const pulpDamping = (N) => (SKIN.cr * N) / (N + SKIN.nHalf);

export const rimSpeed = (key, speed) => 2 * PI * speed * bowlRadius(key);

// Lab-frame coupling of the cos/sin patterns of family n for a bowl turning at
// `rot` rev/s: the material carries the pattern round at (1 − B)Ω.
export const transport = (m, rot) => m.n * (1 - m.bryan) * 2 * PI * rot;

// Speaking threshold. Steady sliding at the rim speed V is unstable when the
// friction's negative slope, seen through the skin pad, feeds the pattern
// whose tangential antinode is under the finger (S) faster than it loses
// energy. S loses to the glass (σ) and, because rotation turns S into the
// other pattern C (rate γ = n(1−B)Ω) which the pressed pulp damps hard (σ_C),
// to a drain γ²/σ_C. From the envelope equations ṡ = −σ_S s + γc,
// ċ = −γs − σ_C c, the onset is at σ_neg = σ + γ²/σ_C with
//   σ_neg = Re[g/(1 − g Y_p(ω))]/(2M),  g = N·(−μ′(V)),  Y_p = 1/(c + i(ωm − k/ω)).
// Returns the normal force N (newtons) at onset for the n = 2 family.
export function speakingThreshold(key, P, b = bowl(key, P)) {
  const m = b.modes[0], fr = friction(P), sl = frictionSlope(rimSpeed(key, P.speed), fr);
  if (!(sl > 0)) return Infinity;
  const w = 2 * PI * m.f, yr = SKIN.c, yi = w * SKIN.m - SKIN.k / w, y2 = yr * yr + yi * yi;
  const Yr = yr / y2, Yi = -yi / y2; // Y_p = 1/(yr + i yi)
  const gam = transport(m, P.speed);
  const excess = (N) => { // σ_neg − σ − γ²/σ_C at normal force N
    const g = N * sl, dr = 1 - g * Yr, di = -g * Yi, sC = m.sigma + (pulpDamping(N) * m.n * m.n) / (2 * m.M);
    return (g * dr) / (dr * dr + di * di) / (2 * m.M) - m.sigma - (gam * gam) / sC;
  };
  let lo = 0, hi = 1;
  while (excess(hi) < 0 && hi < 1e4) hi *= 2;
  if (excess(hi) < 0) return Infinity;
  for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); if (excess(mid) < 0) lo = mid; else hi = mid; }
  return 0.5 * (lo + hi);
}

// Key regulation, as a technician regulates touch: each bowl's finger force is
// set relative to its speaking threshold for a wet finger at the reference
// treadle speed, so "pressure 1" means "just speaks" on every bowl.
export const REF = { wet: 0.85, v0: 0.5, speed: 0.5, loss: 4e-4, split: 0, water: 0 };
const regCache = new Map();
export function regulation(key) {
  if (!regCache.has(key)) regCache.set(key, speakingThreshold(key, REF));
  return regCache.get(key);
}
