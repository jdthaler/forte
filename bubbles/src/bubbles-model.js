// bubbles-model.js — the physics of a gas bubble ringing in a liquid, kept free
// of audio and DOM so that the page, the engine, the tests and the render tool
// all use the same numbers.
//
// A bubble of radius R pulsates in its breathing (volume) mode: the gas is the
// spring, the liquid that moves with the wall is the mass. Linearised
// (Rayleigh–Plesset, plus heat flow in the gas and sound radiated into the
// liquid), the wall displacement x = R(t) − R₀ obeys
//
//   ẍ + 2b ẋ + ω₀² x = 0,
//   ω₀² = [p_b Re Φ − 2σ/R] / (ρ R² m),     p_b = p₀ + 2σ/R   (gas pressure inside)
//   b   = [2μ/(ρR²) + p_b Im Φ / (2ρωR²) + (ω²R/2c)(1 − sin ks/ks)] / m
//
// with Φ the complex polytropic index of the gas (Prosperetti 1977; Commander &
// Prosperetti 1989), and m = 1 − (R/s) cos ks the liquid's inertia changed by the
// free surface's image (s = 2d, d the depth below the surface). Re Φ = 3κ, κ the
// effective polytropic exponent between 1 (isothermal) and γ (adiabatic).
//
// Every function that the engine calls while it plays writes into an `out`
// object instead of returning a new one, so nothing is allocated on the audio thread.

export const TAU = 2 * Math.PI;
export const G = 9.81;              // m/s²
export const P_ATM = 101325;        // Pa
export const T_K = 293.15;          // the tank is at 20 °C
export const R_GAS = 8.314462618;   // J/(mol·K)

// Gases at 20 °C: heat capacity ratio γ, molar mass M (kg/mol), thermal conductivity K (W/m·K),
// specific heat c_p (J/kg·K). K hardly depends on pressure; the gas's density does (∝ p), so its
// thermal diffusivity D = K/(ρ_g c_p) falls as the pressure rises. SF₆'s K and c_p are approximate.
export const GASES = {
  air: { name: 'air', gamma: 1.4, M: 0.02897, K: 0.0257, cp: 1005 },
  helium: { name: 'helium', gamma: 5 / 3, M: 0.0040026, K: 0.151, cp: 5193 },
  argon: { name: 'argon', gamma: 5 / 3, M: 0.039948, K: 0.0177, cp: 520.3 },
  sf6: { name: 'SF₆', gamma: 1.10, M: 0.14606, K: 0.0130, cp: 665 },
};

// Liquids at 20 °C: density ρ (kg/m³), dynamic viscosity μ (Pa·s), surface tension σ (N/m), sound
// speed c (m/s). Glycerol–water viscosities and densities are the standard tables (by mass); the
// mixture's σ and c are interpolated by mass fraction between water and glycerol (estimates).
export const LIQUIDS = {
  water: { name: 'water', rho: 998.2, mu: 1.002e-3, sigma: 0.0728, c: 1482 },
  gly90: { name: '90 % glycerol', rho: 1234.7, mu: 0.219, sigma: 0.0643, c: 1876 },
  glycerol: { name: 'glycerol', rho: 1261, mu: 1.41, sigma: 0.0634, c: 1920 },
};

// The keyboard: A3–C8. At the defaults that is bubbles from 15 mm down to 0.8 mm in radius.
export const KEY_LO = 57, KEY_HI = 108;
export const keyFreq = (k) => 440 * 2 ** ((k - 69) / 12);

// The tank: nozzles in a row along the bottom, 2 cm apart, low notes on the left; two
// hydrophones at nozzle depth, set back from the row, near either end.
export const NOZZLE_PITCH = 0.02;                                      // m between nozzles
export const ROW = NOZZLE_PITCH * (KEY_HI - KEY_LO);                  // 1.02 m
export const HYDRO = { x: [0.2 * ROW, 0.8 * ROW], back: 0.35 };        // m
export const nozzleX = (key) => NOZZLE_PITCH * (Math.min(KEY_HI, Math.max(KEY_LO, key)) - KEY_LO);
const rHydro = (x, i) => Math.hypot(x - HYDRO.x[i], HYDRO.back);
export const R_REF = rHydro(ROW / 2, 0);                               // a centre nozzle's distance to either hydrophone
// Gains of the two hydrophones (1/r spreading), relative to a centre nozzle's.
export function hydrophoneGains(key, out = [0, 0]) {
  const x = nozzleX(key);
  out[0] = R_REF / rHydro(x, 0); out[1] = R_REF / rHydro(x, 1);
  return out;
}

export const gasOf = (P) => GASES[P.gas] || GASES.air;
export const liquidOf = (P) => LIQUIDS[P.liquid] || LIQUIDS.water;
// Pressure at depth d below the surface: the air above the tank plus the water column.
export const ambient = (P, d = P.depth) => P.pressure * P_ATM + liquidOf(P).rho * G * d;

// ---- heat flow in the gas: the complex polytropic index -----------------------------------------------
//   Φ = 3γ / (1 − 3(γ−1) iχ [√(i/χ) coth √(i/χ) − 1]),   χ = D/(ωR²)
// (e^{iωt} convention). χ → 0 (thick bubble, slow heat): Φ → 3γ, adiabatic. χ → ∞: Φ → 3, isothermal.
// With X = √(2/χ) = R√(2ω/D), √(i/χ) = (1 + i)X/2 and coth((1+i)X/2) = (sinh X − i sin X)/(cosh X − cos X).
export function phi(chi, gamma, out = {}) {
  const X = Math.sqrt(2 / chi);
  let zr, zi; // z·coth z − 1 with z = (1 + i)X/2
  if (X > 40) { zr = X / 2 - 1; zi = X / 2; } // coth → 1
  else {
    const sh = Math.sinh(X), sn = Math.sin(X), C = Math.cosh(X) - Math.cos(X);
    zr = (X * (sh + sn)) / (2 * C) - 1; zi = (X * (sh - sn)) / (2 * C);
  }
  // denominator 1 − 3(γ−1)·iχ(zr + i zi) = 1 + 3(γ−1)χ zi − i 3(γ−1)χ zr
  const g3 = 3 * (gamma - 1) * chi, dr = 1 + g3 * zi, di = -g3 * zr, m2 = dr * dr + di * di;
  out.re = (3 * gamma * dr) / m2; out.im = (-3 * gamma * di) / m2;
  return out;
}

// Devin's (1959) real form of the same result, for comparison: the polytropic exponent κ and the
// thermal damping constant d_th = Im Φ / Re Φ, with X = R√(2ω/D).
export function devin(X, gamma) {
  const sh = Math.sinh(X), sn = Math.sin(X), C = Math.cosh(X) - Math.cos(X), g = 3 * (gamma - 1);
  const d = (g * (X * (sh + sn) - 2 * C)) / (X * X * C + g * X * (sh - sn));
  const kappa = gamma / ((1 + d * d) * (1 + (g / X) * ((sh - sn) / C)));
  return { kappa, d };
}

// Thermal diffusivity of the gas at pressure p.
export const diffusivity = (gas, p) => gas.K / (((p * gas.M) / (R_GAS * T_K)) * gas.cp);

// Rise speed. Small bubbles (or any bubble in glycerol) creep up at the Hadamard–Rybczynski speed of a
// clean bubble in Stokes flow, U = ρgR²/3μ; mm-to-cm bubbles in water are deformed and rise at about
// Mendelson's (1967) wave speed, U = √(σ/ρR + gR) (d = 2R). We blend the two: U = (U_HR⁻² + U_M⁻²)^(−1/2).
export function riseSpeed(R, liq) {
  const uh = (liq.rho * G * R * R) / (3 * liq.mu), um = Math.sqrt(liq.sigma / (liq.rho * R) + G * R);
  return 1 / Math.sqrt(1 / (uh * uh) + 1 / (um * um));
}
// Distance risen after t seconds from rest: buoyancy against the added mass ½ρV starts it at 2g,
// and drag holds it at U:  dv/dt = 2g(1 − v²/U²),  z = (U²/2g) ln cosh(2gt/U).
export function riseDistance(t, U) {
  const a = (2 * G * t) / U;
  const lc = a > 20 ? a - Math.LN2 : Math.log(Math.cosh(a));
  return ((U * U) / (2 * G)) * lc;
}

// ---- one bubble's acoustics --------------------------------------------------------------------------
// R: radius (m); env: { p0 (Pa, liquid pressure at the bubble), d (m below the free surface), liq, gas,
// phiFixed? ({ re, im }: keep Φ as it was at release, for the glide) }. Fills `out`:
//   omega0, b, omegaD, fd (Hz, the ring), f0 (Hz, undamped), delta (= 2b/ω₀, = 1/Q) and its parts
//   dth, drad, dvis; kappa (= Re Φ/3), chi, pb, m (image inertia factor), radFactor, phiRe, phiIm, D.
const ph = { re: 0, im: 0 };
export const IMAGE_MAX = 0.25; // the image's share R/s is capped here (the formula is leading order in R/s)
export function acoustics(R, env, out = {}) {
  const { liq, gas } = env, rho = liq.rho, sig = liq.sigma;
  const pb = env.p0 + (2 * sig) / R, D = diffusivity(gas, pb);
  const d = Math.max(env.d, R), s = 2 * d, rs = Math.min(IMAGE_MAX, R / s);
  // iterate ω: Φ depends on χ = D/(ωR²), and the image term on k = ω/c
  let w = Math.sqrt((3 * gas.gamma * pb) / rho) / R, m = 1, re = 3 * gas.gamma, im = 0;
  for (let it = 0; it < 8; it++) {
    if (env.phiFixed) { re = env.phiFixed.re; im = env.phiFixed.im; }
    else { phi(D / (w * R * R), gas.gamma, ph); re = ph.re; im = ph.im; }
    m = 1 - rs * Math.cos((w / liq.c) * s);
    const w2 = (pb * re - (2 * sig) / R) / (rho * R * R * m);
    const wn = Math.sqrt(Math.max(w2, 1e-6));
    if (Math.abs(wn - w) < 1e-12 * w) { w = wn; break; }
    w = wn;
  }
  const ks = (w / liq.c) * s, radFactor = 1 - Math.sin(ks) / ks;
  const bVis = (2 * liq.mu) / (rho * R * R * m);
  const bTh = (pb * im) / (2 * rho * w * R * R * m);
  const bRad = ((w * w * R) / (2 * liq.c)) * (radFactor / m);
  const b = Math.min(bVis + bTh + bRad, 0.95 * w); // never overdamped (the knobs stay well short of this)
  out.omega0 = w; out.b = b; out.omegaD = Math.sqrt(w * w - b * b);
  out.f0 = w / TAU; out.fd = out.omegaD / TAU;
  out.delta = (2 * b) / w; out.dvis = (2 * bVis) / w; out.dth = (2 * bTh) / w; out.drad = (2 * bRad) / w;
  out.kappa = re / 3; out.phiRe = re; out.phiIm = im; out.chi = D / (w * R * R); out.D = D;
  out.pb = pb; out.m = m; out.radFactor = radFactor; out.R = R;
  return out;
}

// The conditions at a nozzle for parameters P (allocation-free with `env`).
export function nozzleEnv(P, env = {}) {
  env.liq = liquidOf(P); env.gas = gasOf(P); env.d = P.depth; env.p0 = ambient(P); env.phiFixed = null;
  return env;
}

// The radius that rings at f (Hz, the damped ring) under env: secant iteration on ln f against ln R.
const tmp = {};
export function tuneRadius(f, env) {
  let lr0 = Math.log(3.3 / f), lf0 = Math.log(acoustics(Math.exp(lr0), env, tmp).fd); // f·R ≈ 3.3 m/s
  let lr1 = lr0 + (lf0 - Math.log(f)), lf1 = Math.log(acoustics(Math.exp(lr1), env, tmp).fd);
  for (let it = 0; it < 30 && Math.abs(lf1 - Math.log(f)) > 1e-10; it++) {
    const slope = Math.abs(lf1 - lf0) > 1e-14 ? (lf1 - lf0) / (lr1 - lr0) : -1;
    const lr2 = lr1 - (lf1 - Math.log(f)) / slope;
    lr0 = lr1; lf0 = lf1; lr1 = Math.min(Math.log(0.2), Math.max(Math.log(2e-5), lr2));
    lf1 = Math.log(acoustics(Math.exp(lr1), env, tmp).fd);
  }
  return Math.exp(lr1);
}

// Each key's nozzle releases bubbles of the radius that sounds its note at the default depth,
// pressure, gas and liquid (DEFAULT_ENV); with "keep in tune", the radius that sounds it now.
export const DEFAULT_COND = { depth: 0.3, pressure: 1, gas: 'air', liquid: 'water' };
const defaultRadii = new Map();
export function nominalRadius(key) {
  let R = defaultRadii.get(key);
  if (R === undefined) { R = tuneRadius(keyFreq(key), nozzleEnv(DEFAULT_COND)); defaultRadii.set(key, R); }
  return R;
}
export const keyRadius = (key, P, env = nozzleEnv(P)) => (P.keepInTune ? tuneRadius(keyFreq(key), env) : nominalRadius(key));

// ---- the kick at pinch-off ------------------------------------------------------------------------
// The neck snaps shut under surface tension, leaving the gas out of equilibrium by Δp, a fraction ε of
// the Laplace pressure 2σ/R (ε = KICK × velocity). The wall then rings about an equilibrium shifted by
// a = Δp/(ρRω₀²m), and the pressure it radiates starts at
//   p = ρ R² ẍ / r = R Δp / r = 2εσ / r,
// the same for every size of bubble: big bubbles move more liquid (volume velocity ∝ R) but more
// slowly. That is how the keyboard balances: by the physics of the kick, not by voicing.
export const KICK = 0.5;
export const kickPressure = (R, liq, velocity) => (KICK * velocity * 2 * liq.sigma) / R;
// Peak hydrophone pressure (Pa) at the reference distance for a kick at velocity v.
export const peakPressure = (liq, velocity) => (2 * KICK * velocity * liq.sigma) / R_REF;

// Excitation of a ring by a step spread over τ (a raised-cosine ramp): its spectrum at f, relative to
// an instant step. A neck that snaps slowly (τ ≳ a period) barely rings the bubble.
export function snapGain(f, tau) {
  const u = 2 * f * tau;
  return Math.abs(u - 1) < 1e-6 ? Math.PI / 4 : Math.abs(Math.cos((Math.PI * u) / 2) / (1 - u * u));
}

// ---- the glide while it rises -----------------------------------------------------------------------
// t seconds after release from depth d0 the bubble has risen z; the liquid pressure falls by ρgz, the
// bubble swells, and the surface's image comes closer. Φ is kept at its value at release. The swelling
// is slow (tenths of a second), so it follows the same heat-flow theory at a slow rate, OMEGA_SLOW:
// R ∝ p_b^(−1/3n), n = Re Φ(D/ω_s R²)/3, nearly isothermal (n → 1) for small bubbles, partly adiabatic for
// the biggest, whose gas takes R²/π²D ≈ half a second to share its heat with the liquid.
export const OMEGA_SLOW = TAU * 3;
export const slowExponent = (R, gas, pb) => phi(diffusivity(gas, pb) / (OMEGA_SLOW * R * R), gas.gamma, ph).re / 3;
const genv = { p0: 0, d: 0, liq: null, gas: null, phiFixed: { re: 0, im: 0 } };
// pTank: the air pressure above the water now (Pa). Returns the ring's frequency (Hz); out gets the rest.
export function glideAt(t, rel, pTank, out = tmp) {
  const z = riseDistance(t, rel.U), d = rel.d0 - z, liq = rel.liq;
  genv.liq = liq; genv.gas = rel.gas; genv.d = d; genv.p0 = pTank + liq.rho * G * Math.max(0, d);
  const R = rel.R0 * (rel.pb0 / (genv.p0 + (2 * liq.sigma) / rel.R0)) ** (1 / (3 * rel.nSlow));
  genv.phiFixed.re = rel.phiRe; genv.phiFixed.im = rel.phiIm;
  acoustics(R, genv, out); out.z = z; out.depth = d;
  return out.fd;
}

// Everything about a bubble of radius R released at a nozzle under P, for the page and the tests.
export function bubbleModel(R, P) {
  const env = nozzleEnv(P), a = acoustics(R, env, {});
  const U = riseSpeed(R, env.liq);
  return { ...a, U, d0: P.depth, p0: env.p0, liq: env.liq, gas: env.gas, R0: R, pb0: a.pb, nSlow: slowExponent(R, env.gas, a.pb), T60: Math.log(1000) / a.b, Q: 1 / a.delta };
}
