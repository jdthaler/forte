// plectrum.js — the plectrum as a cantilever, and where it lets go of the
// string. Pure functions and small tables; no audio, no DOM.
//
// The plectrum sticks out of the jack's tongue horizontally, across under the
// string, free length ℓ. Rising with the jack it catches the string at s₀ =
// ℓ − o from its root (o, the overlap: how far it reaches past the string).
// The string presses down on it with a force F, so it bends (Euler–Bernoulli,
// small slopes, thickness t(z) = t₀(1 − τz/ℓ) for a taper τ):
//   deflection under the load  w = F c(s),    c(s) = ∫₀ˢ (s − z)²/EI(z) dz
//   slope there                θ: tan θ = F g(s),   g(s) = ∫₀ˢ (s − z)/EI(z) dz
//   foreshortening of point s  δ = F² Φ(s),  Φ(s) = ½∫₀ˢ G(z)² dz,  G(z) = ∫₀ᶻ (s − ζ)/EI(ζ) dζ
// So the plectrum is a spring of stiffness k(s) = 1/c(s) under the string,
// softer the further out the string sits, and its surface there slopes
// down towards the tip. Pushing on that slope drives the string sideways,
// towards the tip, against its own lateral stiffness K_z and friction μ.
// The string slides along the plectrum (which bends more, which steepens
// the slope) until it reaches the tip and slips off: the pluck.
//
// For the string sitting at material point s, with lateral position
// z(s) = s − δ(s) (z₀ = s₀ before it is loaded), the sideways force from
// the plectrum lies within the friction cone,
//   F tan(θ − φ) ≤ F_z ≤ F tan(θ + φ),   tan φ = μ,
// and the string slides (towards the tip) when K_z(z − z₀) needs less than
// the lower bound. The engine (string.js) adds the string's wave impedance Z
// to K_z, so the final slip takes the time it takes; this file has the
// quasi-static release, from the equilibrium alone, which the tests use to
// check the engine.

export const PLECTRUM = {
  len: 3.5e-3,   // m: free length ℓ
  table: 96,     // points tabulated along it
};
// Materials: their shape as a voicer cuts them (τ, the taper towards the tip)
// and their friction on the wire (μ). Estimates: quill (bird feather shaft,
// keratin) is cut thin towards a tapered tip; Delrin (acetal) is flat with
// a little bevel, and slippery.
export const MATERIALS = {
  delrin: { name: 'Delrin', taper: 0.15, mu: 0.2 },
  quill: { name: 'Quill', taper: 0.5, mu: 0.3 },
};

const memo = new Map();
// Dimensionless tables for a taper τ (EI₀ = 1, ℓ = 1): ĉ, ĝ, Φ̂ at s = j/(n − 1).
function unitTables(tau) {
  const id = tau.toFixed(4);
  let t = memo.get(id);
  if (t) return t;
  const n = PLECTRUM.table, Q = 400, c = new Float64Array(n), g = new Float64Array(n), F = new Float64Array(n);
  const flex = (z) => 1 / (1 - tau * z) ** 3; // 1/EI(z), EI₀ = 1
  for (let j = 1; j < n; j++) {
    const s = j / (n - 1), h = s / Q;
    let cc = 0, gg = 0, G = 0, ff = 0;
    for (let q = 0; q < Q; q++) {
      const z = (q + 0.5) * h, r = flex(z), d = s - z;
      cc += d * d * r * h; gg += d * r * h;
      const dG = d * r * h; G += 0.5 * dG; ff += 0.5 * G * G * h; G += 0.5 * dG;
    }
    c[j] = cc; g[j] = gg; F[j] = ff;
  }
  t = { c, g, F, n };
  memo.set(id, t);
  return t;
}

// A plectrum, dimensioned: tip stiffness k_tip = 1/c(ℓ) (the voicing), overlap o.
//   EI₀ = k_tip ĉ(1) ℓ³
export function makePlectrum({ kTip, overlap, material = 'delrin', mu = null, taper = null, foreshortening = true, len = PLECTRUM.len }) {
  const mat = MATERIALS[material] || MATERIALS.delrin, tau = taper ?? mat.taper, T = unitTables(tau);
  const EI0 = kTip * T.c[T.n - 1] * len ** 3;
  const o = Math.min(Math.max(overlap, 0.05e-3), 0.9 * len);
  return {
    len, overlap: o, s0: len - o, kTip, EI0, tau, material, mu: mu ?? mat.mu, fore: foreshortening ? 1 : 0, T,
  };
}
// Linear interpolation in the tables, dimensioned (scalars, so the audio
// thread allocates nothing): c(s) (m/N), g(s) (1/N), Φ(s) (m/N²).
function interp(arr, pl, s) {
  const n = pl.T.n, u = Math.min(Math.max(s / pl.len, 0), 1) * (n - 1), j = Math.min(n - 2, Math.floor(u)), f = u - j;
  return arr[j] * (1 - f) + arr[j + 1] * f;
}
export const beamC = (pl, s) => (interp(pl.T.c, pl, s) * pl.len ** 3) / pl.EI0;
export const beamG = (pl, s) => (interp(pl.T.g, pl, s) * pl.len * pl.len) / pl.EI0;
export const beamPhi = (pl, s) => (pl.fore * interp(pl.T.F, pl, s) * pl.len ** 5) / (pl.EI0 * pl.EI0);
export function beamAt(pl, s) { return { c: beamC(pl, s), g: beamG(pl, s), phi: beamPhi(pl, s) }; }

// Lateral position of the string when it sits at material point s under force F.
export const lateralZ = (pl, s, F) => s - F * F * beamPhi(pl, s);
// The friction cone's edges for a slope tan θ = F g: tan(θ − φ) and tan(θ + φ).
export function coneLo(pl, s, F) { const tt = F * beamG(pl, s), mu = pl.mu; return (tt - mu) / (1 + mu * tt); }
export function coneHi(pl, s, F) { const tt = F * beamG(pl, s), mu = pl.mu; return (tt + mu) / Math.max(1e-9, 1 - mu * tt); }
export function coneEdges(pl, s, F) { return [coneLo(pl, s, F), coneHi(pl, s, F)]; }

// The quasi-static pluck: raise the jack slowly; at each height y find the
// equilibrium of string (static compliance Cs, lateral stiffness Kz) and
// plectrum, with stick–slip friction; stop where the string passes the tip.
// Returns { F, y, u, w, s, path } at release (null if it never lets go below yMax).
export function quasiStaticRelease(pl, Cs, Kz, { yMax = 0.02, dy = 2e-7 } = {}) {
  let s = pl.s0, z = pl.s0;
  const path = [];
  const forceAt = (y, ss) => y / (beamC(pl, ss) + Cs);
  for (let y = dy; y < yMax; y += dy) {
    let F = forceAt(y, s);
    const zs = lateralZ(pl, s, F), need = Kz * (zs - pl.s0), lo = coneLo(pl, s, F);
    if (need < F * lo) {
      // slides towards the tip: K_z(z(s) − z₀) = F(s) tan(θ(s) − φ)
      const gfun = (ss) => { const Fs = forceAt(y, ss); return Kz * (lateralZ(pl, ss, Fs) - pl.s0) - Fs * coneLo(pl, ss, Fs); };
      if (gfun(pl.len) < 0) return { F, y, u: Cs * F, w: F * beamC(pl, s), s, theta: Math.atan(F * beamG(pl, s)), path };
      let a = s, b = pl.len;
      for (let it = 0; it < 60; it++) { const m = 0.5 * (a + b); if (gfun(m) < 0) a = m; else b = m; }
      s = 0.5 * (a + b); F = forceAt(y, s);
    }
    z = lateralZ(pl, s, F);
    if (path.length < 4000 && Math.round(y / dy) % 10 === 0) path.push({ y, F, s, z });
  }
  return null;
}

// Closed form, frictionless or not, for a uniform plectrum without
// foreshortening, when the string stays put until it reaches the tip:
// K_z o = F (F g_ℓ − μ)/(1 + μ F g_ℓ),  g_ℓ = ℓ²/2EI, so
//   g F² − μ(1 + K_z o g) F − K_z o = 0;  μ = 0: F = √(2 EI K_z o)/ℓ.
export function releaseForceClosed(EI, len, Kz, o, mu = 0) {
  const g = (len * len) / (2 * EI), bq = mu * (1 + Kz * o * g);
  return (bq + Math.sqrt(bq * bq + 4 * g * Kz * o)) / (2 * g);
}
