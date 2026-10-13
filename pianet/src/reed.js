// reed.js — a Pianet reed: a flat spring-steel strip clamped at one end, with
// a lump of solder at the free end that tunes it. Euler–Bernoulli beam,
// Hermite finite elements; the solder is a point mass M with rotary inertia J
// at its centre of mass s.
//
//   clamp ▓▓═══════════════════════▆▆   ← solder (M, J)
//          0                     s  L
//
// The problem is solved once in units L = EI = μ = 1 (μ = ρ b h per length),
// and scaled: ω_n = Λ_n √(EI/μ) / L², and mass-normalised shapes
// φ_n(x) = φ̂_n(x/L) / √(μL). With the solder given as a fraction of the
// reed's own mass (r = M/μL) and of its length, every key is the same
// dimensionless problem, so each key's length can be solved for its pitch.

import { genEig } from '../../shared/linalg.js';

export const STEEL = { E: 2.0e11, rho: 7850 };

// Hermite cubic shape functions (and their x-derivatives) on an element of length l.
function hermite(xi, l) {
  return [1 - 3 * xi * xi + 2 * xi ** 3, l * (xi - 2 * xi * xi + xi ** 3), 3 * xi * xi - 2 * xi ** 3, l * (-xi * xi + xi ** 3)];
}
function hermiteD(xi, l) {
  return [(-6 * xi + 6 * xi * xi) / l, 1 - 4 * xi + 3 * xi * xi, (6 * xi - 6 * xi * xi) / l, -2 * xi + 3 * xi * xi];
}

// Unit clamped–free strip (L = EI = μ = 1) with a tip mass r at ŝ and rotary
// inertia ĵ (in units μL³). Returns Λ_n = ω_n (L² √(μ/EI)) and φ̂_n(ξ), ξ ∈ [0, 1],
// normalised to unit modal mass and positive at the tip.
export function unitReed({ r = 0, s = 1, j = 0, nel = 16, nModes = 6 }) {
  const l = 1 / nel, NF = 2 * (nel + 1);
  const Kf = new Float64Array(NF * NF), Mf = new Float64Array(NF * NF);
  const ke = [[12, 6 * l, -12, 6 * l], [6 * l, 4 * l * l, -6 * l, 2 * l * l], [-12, -6 * l, 12, -6 * l], [6 * l, 2 * l * l, -6 * l, 4 * l * l]];
  const me = [[156, 22 * l, 54, -13 * l], [22 * l, 4 * l * l, 13 * l, -3 * l * l], [54, 13 * l, 156, -22 * l], [-13 * l, -3 * l * l, -22 * l, 4 * l * l]];
  const kc = 1 / l ** 3, mc = l / 420;
  for (let e = 0; e < nel; e++) {
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      Kf[(2 * e + a) * NF + 2 * e + b] += kc * ke[a][b];
      Mf[(2 * e + a) * NF + 2 * e + b] += mc * me[a][b];
    }
  }
  if (r > 0 || j > 0) { // solder: M N(s)ᵀN(s) + J N'(s)ᵀN'(s)
    const e = Math.min(nel - 1, Math.floor(s / l)), xi = s / l - e, Nv = hermite(xi, l), Nd = hermiteD(xi, l);
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) Mf[(2 * e + a) * NF + 2 * e + b] += r * Nv[a] * Nv[b] + j * Nd[a] * Nd[b];
  }
  const N = NF - 2, K = new Float64Array(N * N), M = new Float64Array(N * N); // clamp node 0
  for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) { K[i * N + k] = Kf[(i + 2) * NF + k + 2]; M[i * N + k] = Mf[(i + 2) * NF + k + 2]; }
  const nv = Math.min(nModes, N), { lambda, X } = genEig(K, M, N, nv);
  const Lam = [];
  for (let n = 0; n < nv; n++) {
    Lam.push(Math.sqrt(lambda[n]));
    if (X[(N - 2) * nv + n] < 0) for (let i = 0; i < N; i++) X[i * nv + n] *= -1;
  }
  const dof = (g, n) => (g < 2 ? 0 : X[(g - 2) * nv + n]);
  const shape = (n, x) => {
    const xx = Math.min(1, Math.max(0, x)), e = Math.min(nel - 1, Math.floor(xx / l)), xi = xx / l - e, Nv = hermite(xi, l);
    return Nv[0] * dof(2 * e, n) + Nv[1] * dof(2 * e + 1, n) + Nv[2] * dof(2 * e + 2, n) + Nv[3] * dof(2 * e + 3, n);
  };
  return { Lam, shape, nModes: nv };
}

// Cantilever with a tip point mass (no rotary inertia), exact: the n-th root of
//   1 + cos β cosh β + R β (cos β sinh β − sin β cosh β) = 0,   R = M/(μL),
// gives Λ_n = β_n² (e.g. Blevins, Formulas for Natural Frequency and Mode Shape, table 8-1).
export function tipMassRoots(R, count = 4) {
  const g = (b) => 1 + Math.cos(b) * Math.cosh(b) + R * b * (Math.cos(b) * Math.sinh(b) - Math.sin(b) * Math.cosh(b));
  const roots = [];
  let b0 = 0.05, g0 = g(b0);
  for (let b = 0.06; roots.length < count && b < 60; b += 0.01) {
    const g1 = g(b);
    if (Math.sign(g1) !== Math.sign(g0)) {
      let lo = b - 0.01, hi = b;
      for (let it = 0; it < 80; it++) { const mid = 0.5 * (lo + hi); if (Math.sign(g(mid)) === Math.sign(g(lo))) lo = mid; else hi = mid; }
      roots.push(0.5 * (lo + hi));
    }
    b0 = b; g0 = g1;
  }
  return roots;
}
