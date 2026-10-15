// stars-model.js — the physics of the Star Keyboard, free of audio and DOM so that the page, the
// engine, the tests and the render tool can all use it.
//
// Every key is a star. Solar-like stars oscillate in acoustic (p) modes that near-surface
// convection drives at random and damps: each mode is a damped oscillator kicked by noise, so a
// held note breathes. The keyboard is an evolutionary track: Sun-like dwarfs on the top keys, then
// subgiants, then ever larger red giants down the keyboard, whose dipole modes mix with gravity
// modes of the core. One fixed speed-up K turns μHz into Hz. A second family, δ Scuti stars, pulsates
// in a few coherent, self-excited modes instead (the κ-mechanism).
//
// Units: frequencies of the star in μHz, of the sound in Hz (= μHz × 10⁻⁶ × K); masses, radii and
// luminosities in solar units; temperatures in K; period spacings in s.

export const TAU = 2 * Math.PI;
export const KEY_LO = 36, KEY_HI = 96;                       // C2–C7
export const keyFreq = (m) => 440 * 2 ** ((m - 69) / 12);
export const cents = (a, b) => 1200 * Math.log2(a / b);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

// ---- the Sun and the scaling relations --------------------------------------------------------------------
// Solar reference values of Huber et al. (2011): ν_max = 3090 μHz, Δν = 135.1 μHz, T_eff = 5777 K.
// Rotation: 25.4 d at the equator (the model's choice of reference), Ω/2π = 0.4557 μHz.
export const SUN = { numax: 3090, dnu: 135.1, teff: 5777, rot: 1e6 / (25.4 * 86400) };
// Δν ∝ √(mean density) (Ulrich 1986; Kjeldsen & Bedding 1995); ν_max ∝ g/√T_eff (Brown et al. 1991).
export const deltaNu = (M, R) => SUN.dnu * Math.sqrt(M / (R * R * R));
export const nuMax = (M, R, T) => (SUN.numax * M) / (R * R) / Math.sqrt(T / SUN.teff);
// Width (FWHM) of the Gaussian envelope of mode power, δν_env = 0.66 ν_max^0.88 μHz (Mosser et al. 2012a).
export const envWidth = (numax) => 0.66 * numax ** 0.88;
// Linewidth of the radial modes near ν_max: a power law in T_eff over a lower bound, the form
// Appourchaux et al. (2012) fitted to Kepler dwarfs and subgiants. The numbers are the model's choice:
// 1.0 μHz for the Sun, 3.6 μHz at 6400 K (where Appourchaux et al. put the transition to F-like
// stars, at about 4 μHz), 0.13 μHz on the red-giant branch (4800 K). Above 6600 K it is held: the
// relation is for cool stars, and hotter stars barely oscillate this way.
export const LW = { floor: 0.05, sun: 0.95, s: 13, tMax: 6600 };
export const linewidth = (T) => LW.floor + LW.sun * (Math.min(T, LW.tMax) / SUN.teff) ** LW.s;
// Visibility of each degree l = 0–3 in power, relative to the radial modes: about what Kepler sees in
// red giants (V₁² ≈ 1.5, V₂² ≈ 0.6; Mosser et al. 2012a), l = 3 the model's choice.
export const VIS = [1, 1.5, 0.6, 0.05];

// ---- the zero-age main sequence: Tout, Pols, Eggleton & Han (1996), Z = 0.02 -------------------------------
// L = (αM^5.5 + βM^11)/(γ + M³ + δM⁵ + εM⁷ + ζM⁸ + ηM^9.5),
// R = (θM^2.5 + ιM^6.5 + κM^11 + λM^19 + μM^19.5)/(ν + ξM² + οM^8.5 + M^18.5 + πM^19.5)
const TZ = { a: 0.39704170, b: 8.52762600, g: 0.00025546, d: 5.43288900, e: 5.56357900, z: 0.78866060, h: 0.00586685,
  th: 1.71535900, io: 6.59778800, ka: 10.08855000, la: 1.01249500, mu: 0.07490166, nu: 0.01077422, xi: 3.08223400, om: 17.84778000, pi: 0.00022582 };
export function zams(M) {
  const p = (e) => M ** e;
  const L = (TZ.a * p(5.5) + TZ.b * p(11)) / (TZ.g + p(3) + TZ.d * p(5) + TZ.e * p(7) + TZ.z * p(8) + TZ.h * p(9.5));
  const R = (TZ.th * p(2.5) + TZ.io * p(6.5) + TZ.ka * p(11) + TZ.la * p(19) + TZ.mu * p(19.5)) / (TZ.nu + TZ.xi * p(2) + TZ.om * p(8.5) + p(18.5) + TZ.pi * p(19.5));
  return { M, R, L, T: SUN.teff * (L / (R * R)) ** 0.25 };
}

// ---- the evolutionary track ----------------------------------------------------------------------------------
// A path through the stars, one coordinate s: for s ≥ 0, the star of mass M has grown to R = R_ZAMS·eˢ;
// for s < 0, the zero-age main sequence of mass M·eˢ (so the keys above where the track begins play
// younger, lighter dwarfs rather than nothing). T_eff along it (the model's choice of shape, with
// cited ends):
//  - main sequence, R from R_ZAMS to f_T·R_ZAMS: T = T_ZAMS + ΔT(M)(1 − e^(−s/0.09)); ΔT fixed so that
//    the 1 M☉ track passes through the Sun (R = 1, T = 5777 K); heavier stars cool on the main sequence.
//  - subgiants: T = T_TAMS (R_TAMS/R)^b (b = ½ is constant luminosity; low-mass subgiants brighten);
//  - the red-giant branch: the Hayashi line of a convective envelope with H⁻ opacity,
//    T ∝ M^(7/51) L^(1/102) (after Hayashi 1961), here 4800 K for 1 M☉ at 10 L☉.
//  The two branches join smoothly where they cross (a soft maximum in ln T).
export const TRACK = {
  tau: 0.09, hayashi: 4800,
  fT: (M) => 1.52 + 0.35 * (M - 1),
  dT: (M) => DT_SUN - 1900 * (M - 1),
  b: (M) => clamp(0.26 + 0.4 * (M - 1), 0.26, 0.5),
};
// ΔT for 1 M☉, solved so that the track passes through the Sun
const DT_SUN = (() => { const z = zams(1); return (SUN.teff - z.T) / (1 - Math.exp(-Math.log(1 / z.R) / TRACK.tau)); })();
export const SUN_S = Math.log(1 / zams(1).R); // where the Sun sits on the 1 M☉ track

// The Hayashi line, solved with L = R²(T/T☉)⁴: T^(49/51) = c M^(7/51) R^(1/51) T☉^(−2/51)
const HC = TRACK.hayashi / 10 ** (1 / 102);
export function hayashiT(M, R) { return (HC * M ** (7 / 51) * R ** (1 / 51) * SUN.teff ** (-2 / 51)) ** (51 / 49); }

const zcache = new Map();
function zamsC(M) { let z = zcache.get(M); if (!z) { z = zams(M); if (zcache.size > 64) zcache.clear(); zcache.set(M, z); } return z; }

export function starAt(s, M) {
  if (s < 0) { const z = zams(M * Math.exp(s)); return { ...z, s, stage: 'dwarf', track: M }; }
  const z = zamsC(M), R = z.R * Math.exp(s), sT = Math.log(TRACK.fT(M)), dT = TRACK.dT(M);
  let T, stage;
  if (s <= sT) { T = z.T + dT * (1 - Math.exp(-s / TRACK.tau)); stage = 'dwarf'; }
  else {
    const tT = z.T + dT * (1 - Math.exp(-sT / TRACK.tau)), tSg = tT * Math.exp(-(s - sT) * TRACK.b(M)), tH = hayashiT(M, R);
    const w = 0.01, x = (Math.log(tSg) - Math.log(tH)) / w;
    T = tH * Math.exp(w * (x > 30 ? x : Math.log1p(Math.exp(x))));
    stage = tSg > tH * 1.005 ? 'subgiant' : 'giant';
  }
  return { M, R, T, L: R * R * (T / SUN.teff) ** 4, s, stage, track: M };
}

// ---- the oscillation pattern -----------------------------------------------------------------------------------
// The asymptotic p-mode relation to second order (Tassoul 1980) with a curvature term about ν_max
// (in the form of Mosser et al. 2011, 2013):
//   ν_nl = Δν [n + l/2 + ε − l(l+1)D + (α/2)(n − n_max)²],    n_max = ν_max/Δν − ε,
// so that δν_0l = l(l+1)·D·Δν: δν₀₂ = 6D·Δν, δν₀₁ = δν₀₂/3, δν₀₃ = 2δν₀₂. The model's choices:
//   ε = 1.457 + 0.227 log₁₀(Δν/135.1)      (the Sun's l = 0, n = 21 mode at 3034 μHz; about 1.1 low on the RGB)
//   δν₀₂/Δν = 0.064 for Δν ≥ 100 μHz, 0.12 for Δν ≤ 15 μHz, log-linear between
//   α = 0.015 Δν^(−0.32)
export const epsilonOf = (dnu) => 1.457 + 0.2273 * Math.log10(dnu / SUN.dnu);
export const d02Of = (dnu) => 0.12 - 0.056 * clamp(Math.log(dnu / 15) / Math.log(100 / 15), 0, 1);
export const alphaOf = (dnu) => 0.015 * dnu ** -0.32;
// Gravity-mode period spacing ΔΠ₁ and coupling q of the dipole mixed modes, as the star leaves the
// main sequence (the model's choices, in the ranges Kepler measured: ΔΠ₁ ≈ 60–90 s on the low red-giant
// branch, larger in subgiants; strongest coupling at the subgiant/red-giant transition):
export const dPiOf = (dnu) => (dnu <= 20 ? 60 * (dnu / 4) ** 0.22 : 60 * 5 ** 0.22 * (dnu / 20) ** 1.3);
export const qOf = (dnu) => 0.10 + 0.15 * smooth(Math.log(dnu / 8) / Math.log(30 / 8));

// Seismic parameters of a star on the track.
export function seismic(st) {
  const dnu = deltaNu(st.M, st.R), numax = nuMax(st.M, st.R, st.T);
  const sT = Math.log(TRACK.fT(st.track ?? st.M));
  const evolved = st.s > sT ? smooth((st.s - sT) / 0.25) : 0;
  return {
    dnu, numax, eps: epsilonOf(dnu), d02: d02Of(dnu), alpha: alphaOf(dnu), fwhm: envWidth(numax),
    gamma: linewidth(st.T), dPi: dPiOf(dnu), q: qOf(dnu) * evolved,
  };
}

// Nominal (pure) p modes: [{ n, l, nu }], every degree, orders within ±span·σ of ν_max.
export function pModes(sz, span = 4) {
  const sig = sz.fwhm / (2 * Math.sqrt(2 * Math.log(2))), nmax = sz.numax / sz.dnu - sz.eps, D = sz.d02 / 6, out = [];
  const n0 = Math.max(1, Math.floor((sz.numax - span * sig) / sz.dnu - sz.eps - 2)), n1 = Math.ceil((sz.numax + span * sig) / sz.dnu - sz.eps + 1);
  for (let n = n0; n <= n1; n++) {
    for (let l = 0; l <= 3; l++) {
      const nu = sz.dnu * (n + l / 2 + sz.eps - l * (l + 1) * D + (sz.alpha / 2) * (n - nmax) ** 2);
      if (Math.abs(nu - sz.numax) <= span * sig) out.push({ n, l, nu });
    }
  }
  return out;
}

// ---- mixed modes ---------------------------------------------------------------------------------------------------
// The dipole modes of an evolved star couple the p modes of the envelope with the g modes of the
// core. The asymptotic condition (Shibahashi 1979; as Mosser et al. 2012b use it)
//   tan θ_p = q tan θ_g,   θ_p = π(ν − ν_p)/Δν (relative to the nominal dipole p modes),   θ_g = π/(ν ΔΠ₁)
// has one root per g mode and per p mode. With h(y) = arctan(tan y / q), continued across its branches,
//   J(ν) = θ_g/π − h(θ_p)/π
// falls monotonically, and every mode sits where J is an integer. The share of each mode's inertia in
// the core (Mosser et al. 2015),
//   ζ = [1 + (q/N)/(q² cos²θ_p + sin²θ_p)]⁻¹,    N = Δν/(ν² ΔΠ₁),
// sets its period spacing ζΔΠ₁, its share of the p mode's power (1 − ζ) and its linewidth
// Γ₀(1 − ζ): the energy is shared, and the heavier the mode, the slower it is damped and driven.
// θ_p(ν): π times the (fractional) number of nominal dipole p modes below ν, piecewise linear between them.
export function thetaPOf(p1) {
  const P = p1.map((m) => m.nu).sort((a, b) => a - b), np = P.length;
  return (nu) => {
    let j = 0;
    if (nu >= P[np - 1]) j = np - 2; else while (j < np - 2 && nu >= P[j + 1]) j++;
    return Math.PI * (j + (nu - P[j]) / (P[j + 1] - P[j]));
  };
}
export const hBranch = (y, q) => Math.atan(Math.tan(y) / q) + Math.PI * Math.round(y / Math.PI);
export function mixedModes(sz, p1, lo, hi) {
  // θ_p: through the nominal dipole p modes (sorted), piecewise linear in ν, extended at the ends
  if (p1.length < 2 || !(sz.q > 0)) return [];
  const thetaP = thetaPOf(p1);
  const dPi = sz.dPi, q = sz.q;
  const J = (nu) => 1 / (nu * 1e-6 * dPi) - hBranch(thetaP(nu), q) / Math.PI;
  const out = [];
  const k0 = Math.ceil(J(hi)), k1 = Math.floor(J(lo));
  for (let k = k0; k <= k1; k++) {
    let a = lo, b = hi; // J(a) ≥ k ≥ J(b)
    for (let it = 0; it < 64; it++) { const m = 0.5 * (a + b); if (J(m) > k) a = m; else b = m; if (b - a < 1e-14 * m) break; }
    const nu = 0.5 * (a + b), tp = thetaP(nu), N = (sz.dnu * 1e-6) / ((nu * 1e-6) ** 2 * dPi);
    const c = Math.cos(tp), s = Math.sin(tp);
    const zeta = 1 / (1 + (q / N) / (q * q * c * c + s * s));
    out.push({ nu, zeta, j: Math.round(tp / Math.PI), thetaP: tp });
  }
  return out;
}

// ---- the star's modes ------------------------------------------------------------------------------------------------
// Multiplets (one entry per n, l; the m components come with rotation): [{ l, nu, zeta, power, gamma }]
//   power: in the Gaussian envelope × V_l² × (1 − ζ), relative (the observed power summed over m)
//   gamma: linewidth, μHz: Γ₀ for p modes, Γ₀ max(1 − ζ, 1/30) for mixed (the floor stands in for the
//          radiative damping that limits the g-dominated modes' lifetimes in the core; Dupret et al. 2009)
export const GFLOOR = 1 / 30;
export function multiplets(sz, span = 4) {
  const sig = sz.fwhm / (2 * Math.sqrt(2 * Math.log(2))), env = (nu) => Math.exp(-((nu - sz.numax) ** 2) / (2 * sig * sig));
  const pm = pModes(sz, span + 1), out = [];
  for (const m of pm) if (m.l !== 1 || !(sz.q > 0)) {
    if (Math.abs(m.nu - sz.numax) > span * sig) continue;
    out.push({ l: m.l, n: m.n, nu: m.nu, zeta: 0, power: VIS[m.l] * env(m.nu), gamma: sz.gamma });
  }
  if (sz.q > 0) {
    const p1 = pm.filter((m) => m.l === 1);
    const lo = Math.max(1, sz.numax - span * sig), hi = sz.numax + span * sig;
    for (const x of mixedModes(sz, p1, lo, hi)) {
      out.push({ l: 1, n: x.j, nu: x.nu, zeta: x.zeta, power: VIS[1] * env(x.nu) * (1 - x.zeta), gamma: sz.gamma * Math.max(1 - x.zeta, GFLOOR) });
    }
  }
  out.sort((a, b) => a.nu - b.nu);
  return out;
}

// The pitch a listener hears: the modes of one star are unresolved by the ear (a Sun-like star's l = 0
// and l = 1 modes alternate about 0.2 ERB apart on its key, a red giant's 0.1), so its pitch is that of
// a narrow band of sound, at the centre of its power. This model's estimate: the power-weighted mean of
// log frequency.
export function heardPitch(ms) {
  let w = 0, s = 0;
  for (const m of ms) { w += m.power; s += m.power * Math.log(m.nu); }
  return Math.exp(s / w);
}

// ---- tuning: which star sits on each key -------------------------------------------------------------------------
// The key's star is the one on the path whose heard pitch × K is the note: solved for s by bisection.
// Its ν_max then sits a little above the note (the log-centroid of a Gaussian lies below its peak) and
// its radial modes wherever the pattern puts them.
export function starForPitch(nuTarget, M) {
  const pitchAt = (s) => heardPitch(multiplets(seismic(starAt(s, M))));
  let a = -2.5, b = 3.4; // pitch(a) > target > pitch(b)
  // a first guess from ν_max, then a bracket
  let lo = a, hi = b;
  for (let it = 0; it < 40; it++) { const m = 0.5 * (lo + hi); if (seismic(starAt(m, M)).numax > nuTarget) lo = m; else hi = m; }
  a = Math.max(-2.5, lo - 0.05); b = Math.min(3.4, lo + 0.05);
  let fa = pitchAt(a) - nuTarget, fb = pitchAt(b) - nuTarget;
  for (let g = 0; fa < 0 && g < 20; g++) { a -= 0.05; fa = pitchAt(a) - nuTarget; }
  for (let g = 0; fb > 0 && g < 20; g++) { b += 0.05; fb = pitchAt(b) - nuTarget; }
  // regula falsi (Illinois), then the star
  let side = 0;
  for (let it = 0; it < 60; it++) {
    const m = (a * fb - b * fa) / (fb - fa), fm = pitchAt(m) - nuTarget;
    if (Math.abs(fm) < 1e-7 * nuTarget || Math.abs(b - a) < 1e-12) { a = b = m; break; }
    if (fm * fb > 0) { b = m; fb = fm; if (side === -1) fa /= 2; side = -1; } else { a = m; fa = fm; if (side === 1) fb /= 2; side = 1; }
  }
  return starAt(0.5 * (a + b), M);
}

// The speed-up K: chosen so that the Sun itself is a key, G6 (1568 Hz), on the 1 M☉ track.
export const SUN_KEY = 91;
export const K0 = 510800;

// ---- inclination and the spherical harmonics ----------------------------------------------------------------------
// Associated Legendre functions P_l^m(x), 0 ≤ m ≤ l ≤ 3 (without the Condon–Shortley phase).
export function legendre(l, m, x) {
  const s = Math.sqrt(Math.max(0, 1 - x * x));
  switch (l * 4 + m) {
    case 0: return 1;
    case 4: return x; case 5: return s;
    case 8: return 0.5 * (3 * x * x - 1); case 9: return 3 * x * s; case 10: return 3 * s * s;
    case 12: return 0.5 * x * (5 * x * x - 3); case 13: return 1.5 * (5 * x * x - 1) * s; case 14: return 15 * x * s * s; case 15: return 15 * s * s * s;
    default: return 0;
  }
}
const fact = [1, 1, 2, 6, 24, 120, 720];
// Share of a multiplet's power in its m component seen at inclination i (Gizon & Solanki 2003):
//   E_lm(i) = [(l − |m|)!/(l + |m|)!] [P_l^|m|(cos i)]²,   Σ_m E_lm = 1.
export function Elm(l, m, incl) {
  const a = Math.abs(m), p = legendre(l, a, Math.cos(incl));
  return (fact[l - a] / fact[l + a]) * p * p;
}
// Real spherical harmonic pattern for drawing: Y ∝ P_l^|m|(cos θ) cos(mφ), normalised to peak 1.
export function ylmPattern(l, m, theta, phi) {
  const a = Math.abs(m), norm = [[1], [1, 1], [1, 1 / 3, 1 / 3], [1, 1 / 4.0, 1 / 15, 1 / 15]][l][a];
  return norm * legendre(l, a, Math.cos(theta)) * Math.cos(a * phi);
}

// ---- rotation ------------------------------------------------------------------------------------------------------------
// Each m component moves by δν = m [w_env Ω_env + w_core Ω_core]/2π (first-order perturbation; Ledoux
// 1951): a p mode feels the envelope, w_env = 1 − C_nl with C_nl ≈ 0 for high-order p modes; a
// mixed dipole mode feels the core through its inertia there, w_core = ζ(1 − C_g) with C_g = 1/(l(l+1)) = ½,
// and the envelope through the rest, w_env = 1 − ζ (Goupil et al. 2013). δ Scuti's low-order modes
// have a small Ledoux constant, here C = 0.05.
export function splitWeights(l, zeta, C = 0) {
  if (l === 0) return [0, 0];
  return [(1 - zeta) * (1 - C), zeta * (1 - 1 / (l * (l + 1)))];
}

// ---- the played star: everything the engine needs, per mode -------------------------------------------------------------
// The parameters that build a star (the rest act live in the engine).
export const starId = (P) => `${P.family}|${P.mass}|${P.speedup}`;
export const DB_KEEP = -27;   // multiplets more than this far below the strongest are left out (dB)
export const MAX_MODES = 340; // and at most this many m components per star (the strongest)
export const DS = { ratio1: 0.773, ratio2: 0.802, Q: 0.033, C: 0.05, teff: 7500, mass: 1.8 };

// Deterministic per-key random numbers (each δ Scuti star is an individual).
export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// keyStar(key, P) → { id, key, K, family, star, sz, modes: { f, l, m, zeta, p, gamma, wEnv, wCore, asat }, … }
//   f: the sound's frequency of the mode without rotation (Hz); p: its mean power per m component
//   (intrinsic, scaled so that the star's observed mean square is ½ at unit driving; δ Scuti: its
//   saturated amplitude² instead); gamma: linewidth in the sound (Hz).
export function keyStar(key, P) {
  const K = P.speedup ?? K0, target = keyFreq(key) / K * 1e6; // μHz
  if (P.family === 'dscuti') return dScutiStar(key, P, K, target);
  const star = starForPitch(target, P.mass ?? 1), sz = seismic(star), mults = multiplets(sz);
  let pmax = 0;
  for (const m of mults) pmax = Math.max(pmax, m.power);
  let keep = mults.filter((m) => m.power >= pmax * 10 ** (DB_KEEP / 10));
  // at most MAX_MODES m components: drop the weakest multiplets
  let count = keep.reduce((n, m) => n + 2 * m.l + 1, 0);
  if (count > MAX_MODES) {
    const sorted = [...keep].sort((a, b) => b.power - a.power), kept = new Set();
    let c = 0;
    for (const m of sorted) { if (c + 2 * m.l + 1 > MAX_MODES) continue; kept.add(m); c += 2 * m.l + 1; }
    keep = keep.filter((m) => kept.has(m)); count = c;
  }
  const N = count, f = new Float64Array(N), l = new Int8Array(N), mm = new Int8Array(N), zeta = new Float64Array(N), p = new Float64Array(N),
    gamma = new Float64Array(N), wEnv = new Float64Array(N), wCore = new Float64Array(N), asat = new Float64Array(N), mult = new Int32Array(N);
  let i = 0, norm = 0;
  keep.forEach((x, j) => {
    const [we, wc] = splitWeights(x.l, x.zeta);
    // the multiplet's observed power is VIS·env·(1 − ζ) = x.power, shared among its m by E_lm (Σ = 1), so
    // each m component carries the intrinsic power x.power/V_l² and is seen with gain √(V_l² E_lm)
    for (let m = -x.l; m <= x.l; m++, i++) {
      f[i] = x.nu * 1e-6 * K; l[i] = x.l; mm[i] = m; zeta[i] = x.zeta; p[i] = x.power / VIS[x.l];
      gamma[i] = x.gamma * 1e-6 * K; wEnv[i] = we; wCore[i] = wc; mult[i] = j;
    }
    norm += x.power;
  });
  // observed mean square Σ g²p/2 = Σ_multiplets power/2 → scale so it is ½
  for (let k = 0; k < N; k++) p[k] /= norm;
  return {
    id: `${starId(P)}|${key}`, key, K, family: 'track', star, sz, multiplets: keep, all: mults, N, norm,
    modes: { f, l: l, m: mm, zeta, p, gamma, wEnv, wCore, asat, mult },
    pitch: heardPitch(mults) * 1e-6 * K, target: keyFreq(key),
  };
}

// ---- δ Scuti: coherent, self-excited modes ----------------------------------------------------------------------------
// Driven by the κ-mechanism in the He II ionisation zone, a δ Scuti star's unstable modes grow until
// a nonlinearity stops them. Each mode's amplitude follows the Landau equation
//   dA/dt = (γ − βA²) A        →        A → A_sat = √(γ/β),
// with no noise. The radial fundamental F (the note), first and second overtones at the period ratios
// of double- and triple-mode δ Scuti stars, P₁/P₀ = 0.773 and P₂/P₁ = 0.802, and a few nonradial
// modes (l = 1, 2) in between, placed and sized per key (the model's choice). Real growth times are
// years; here γ is set by the "growth time" knob, a fraction of a second.
function dScutiStar(key, P, K, target) {
  const r = rng(key * 7919 + 17), list = [];
  list.push({ l: 0, nu: target, a: 1 });
  list.push({ l: 0, nu: target / DS.ratio1, a: 0.42 });
  list.push({ l: 0, nu: target / DS.ratio1 / DS.ratio2, a: 0.22 });
  const radial = list.map((x) => x.nu);
  const free = (nu) => radial.every((x) => Math.abs(cents(nu, x)) > 60);
  for (const [l, a] of [[1, 0.36], [1, 0.22], [2, 0.18], [1, 0.12]]) {
    let nu;
    for (let g = 0; g < 50; g++) { nu = target * (1.06 + 0.6 * r()); if (free(nu)) break; }
    list.push({ l, nu, a: a * (0.8 + 0.4 * r()) });
  }
  // the star: a density from the pulsation constant of the fundamental, Q = P_F √(ρ/ρ☉) = 0.033 d (model's choice)
  const PF = 1 / (target * 1e-6) / 86400, rho = (DS.Q / PF) ** 2, M = DS.mass, R = (M / rho) ** (1 / 3), T = DS.teff;
  const star = { M, R, T, L: R * R * (T / SUN.teff) ** 4, s: 0, stage: 'dscuti', track: M };
  const sz = { dnu: SUN.dnu * Math.sqrt(rho), numax: target, eps: 0, d02: 0, alpha: 0, fwhm: 0, gamma: 0, dPi: 0, q: 0 };
  const N = list.reduce((n, x) => n + 2 * x.l + 1, 0);
  const f = new Float64Array(N), l = new Int8Array(N), mm = new Int8Array(N), zeta = new Float64Array(N), p = new Float64Array(N),
    gamma = new Float64Array(N), wEnv = new Float64Array(N), wCore = new Float64Array(N), asat = new Float64Array(N), mult = new Int32Array(N);
  let i = 0, norm = 0;
  list.forEach((x, j) => {
    for (let m = -x.l; m <= x.l; m++, i++) {
      f[i] = x.nu * 1e-6 * K; l[i] = x.l; mm[i] = m; wEnv[i] = x.l ? 1 - DS.C : 0; asat[i] = x.a; mult[i] = j;
    }
    norm += VIS[x.l] * x.a * x.a; // observed Σ_m g² A² = V_l² A² per multiplet
  });
  const s = 1 / Math.sqrt(norm);
  for (let k = 0; k < N; k++) { asat[k] *= s; p[k] = asat[k] * asat[k]; }
  const multiplets = list.map((x) => ({ l: x.l, nu: x.nu, zeta: 0, power: VIS[x.l] * x.a * x.a, gamma: 0 }));
  return { id: `${starId(P)}|${key}`, key, K, family: 'dscuti', star, sz, multiplets, all: multiplets, N, modes: { f, l, m: mm, zeta, p, gamma, wEnv, wCore, asat, mult }, pitch: keyFreq(key), target: keyFreq(key) };
}
