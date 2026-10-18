// windharp-model.js — the Wind Harp's constants, and what the tests check the C++ against: the
// published Strouhal fit, the linear analysis written out on its own, and the von Kármán gust
// spectrum. The model itself (the strings, the shedding, the bands, the harmonic balance) is the
// C++'s (native/instruments/windharp/windharp-model.cpp), which the page and the tests call
// through windharp-wasm.js. No DOM, no audio.
//
// Each key is a stiff string in a wind. Air flowing across a thin cylinder sheds a von Kármán
// vortex street at the Strouhal frequency f_s = St(Re)·U/D, which pushes the string sideways,
// across the wind (Rayleigh 1879). The wake is modelled as van der Pol oscillators distributed
// along the string (Facchinetti, de Langre & Biolley 2004a, b), each driven by the string's
// local acceleration and loading it with the lift it carries:
//
//   string (per unit length):  m Ÿ + (r_s + r_f) Ẏ − T Y'' + EI Y'''' = ¼ ρU²D C_L0 q
//   wake at each station:      q̈ + εΩ (q² − r) q̇ + Ω² q = (A/D) Ÿ
//
// with m = m_s + ρπD²/4 (the air's added mass), r_f = γΩρD² the flow's damping, and the
// published constants ε = 0.3, A = 12, C_L0 = 0.3, γ = 0.8. Ω is set so that the free wake
// (a fixed cylinder) sheds exactly at f_s: the van der Pol limit cycle runs at κ(ε)Ω, κ = 1 −
// ε²/16 + 17ε⁴/3072 (Lindstedt–Poincaré). r is the shedding's onset: 1 well above the critical
// Reynolds number Re_c = 47, falling through 0 at Re_c (a supercritical Hopf bifurcation, whose
// amplitude grows as √(Re − Re_c): Provansal, Mathis & Boyer 1987), negative below it.
//
// When f_s nears a harmonic of the string the wake locks onto it. The linear analysis (de Langre
// 2006: lock-in is coupled-mode flutter) gives each harmonic's band of wind speeds,
// δ = ω_n/Ω ∈ (1 − √(AM), 1 + √(AM)), and its growth rate; a harmonic balance of the locked
// state gives how far lock-in persists beyond that band (the hysteresis) and its amplitude.

export const TAU = 2 * Math.PI;
export const KEY_LO = 55, KEY_HI = 96;          // G3–C7, 42 keys
export const keyFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// ---- air and the wake ----------------------------------------------------------------------------
export const AIR = { rho: 1.204, nu: 1.516e-5, c: 343 };          // 20 °C, sea level
export const WAKE = { eps: 0.3, A: 12, CL0: 0.3, gamma: 0.8 };     // Facchinetti, de Langre & Biolley (2004a)
export const RE_C = 47;                                            // no shedding below this
export const U_REF = 4.0;                                          // m/s: the wind every string is cut for
export const U_MAX = 8;                                            // m/s: the wind slider’s top (2 U_REF)

// Williamson & Brown (1998), two-term fit to two-dimensional laminar shedding: St = 0.2698 − 1.0271/√Re
// (the tests check the C++'s strings and shedding against it).
export const strouhal = (Re) => 0.2698 - 1.0271 / Math.sqrt(Math.max(Re, RE_C));

// ---- the linear analysis (de Langre 2006) --------------------------------------------------------
// In time units of 1/Ω and lengths of D, one string mode n coupled to the wake (the wake shaped as
// the mode: with the stations spaced evenly the modes do not mix) is Facchinetti's pair
//   ÿ + λẏ + δ²y = M q,   q̈ − εq̇ + q = A ÿ   (linearised about rest)
//   δ = ω_n/Ω,   λ = 2ζδ + γ/μ,   M = C_L0/(16π² St_Ω² μ),   St_Ω = ΩD/2πU
// and its characteristic equation is (s² + λs + δ²)(s² − εs + 1) = AM s². The tests hold the
// C++'s bands and the engine's growth to it: S is the C++'s string (windharp-wasm.js stringDesign)
// and sh its shedding at the wind U.
export function harmonicParams(S, n, U, sh) {
  const Om = sh.Om, wn = TAU * S.f[n - 1];
  const StO = (Om * S.D) / (TAU * U), M = WAKE.CL0 / (16 * Math.PI ** 2 * StO ** 2 * S.mu);
  return { ...sh, delta: wn / Om, lam: (2 * S.zeta * wn) / Om + WAKE.gamma / S.mu, M, AM: WAKE.A * M, wn };
}

// Roots of the quartic s⁴ + c3 s³ + c2 s² + c1 s + c0 (Durand–Kerner), as [re, im] pairs.
function quarticRoots(c3, c2, c1, c0) {
  const p = (zr, zi) => { // evaluate the monic polynomial at z
    let r = 1, i = 0;
    for (const c of [c3, c2, c1, c0]) { const nr = r * zr - i * zi + c, ni = r * zi + i * zr; r = nr; i = ni; }
    return [r, i];
  };
  const z = [[0.4, 0.9], [-0.4, 0.9], [0.4, -0.9], [-0.4, -0.9]].map(([a, b]) => [a * 1.3, b * 1.3]);
  for (let it = 0; it < 400; it++) {
    let moved = 0;
    for (let k = 0; k < 4; k++) {
      const [nr, ni] = p(z[k][0], z[k][1]);
      let dr = 1, di = 0;
      for (let j = 0; j < 4; j++) if (j !== k) { const ar = z[k][0] - z[j][0], ai = z[k][1] - z[j][1], tr = dr * ar - di * ai; di = dr * ai + di * ar; dr = tr; }
      const den = dr * dr + di * di || 1e-300, qr = (nr * dr + ni * di) / den, qi = (ni * dr - nr * di) / den;
      z[k][0] -= qr; z[k][1] -= qi; moved = Math.max(moved, Math.abs(qr) + Math.abs(qi));
    }
    if (moved < 1e-15) break;
  }
  return z;
}

// The coupled roots (dimensionless): s with Re s the growth rate, Im s the frequency.
export function coupledRoots(delta, lam, AM, eps) {
  return quarticRoots(lam - eps, 1 + delta * delta - lam * eps - AM, lam - eps * delta * delta, delta * delta);
}
// de Langre's coupled-mode flutter: with the wake's net damping zero (its amplitude saturated, ε → 0)
// the most unstable root; and the undamped band δ ∈ (1 − √AM, 1 + √AM) where the two roots merge.
export function flutterGrowth(delta, lam, AM, eps = 0) {
  let best = -Infinity, w = 0;
  for (const [re, im] of coupledRoots(delta, lam, AM, eps)) if (re > best) { best = re; w = Math.abs(im); }
  return { re: best, im: w };
}

// ---- gusts ---------------------------------------------------------------------------------------
// The wind's turbulence: U(t) = U (1 + I_u g(t)), g of unit variance with a von Kármán-like spectrum,
// flat below f_c = 1/(2π T_u) and falling as f^(−5/3) above it, made as the sum of two Ornstein–
// Uhlenbeck processes (corners f_c and 6 f_c) whose powers fit that slope between them
// (windharp-engine.cpp); the tests measure the engine's wind against this target.
export function gustSpectrum(f, Tu) { // the target, normalised to 1 at f → 0
  const fc = 1 / (TAU * Tu);
  return (1 + (f / fc) ** 2) ** (-5 / 6);
}
