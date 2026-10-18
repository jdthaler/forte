// bar.js — the vibraphone's bars as they are cut: the blanks, Timoshenko bending
// of a bar whose thickness varies along its length (the undercut) by finite
// elements, and the optimiser that shapes the undercut so that the first three
// bending modes sit at 1 : 4 : 10. tools/vibraphone-bars.mjs tunes the bars with
// it and writes the table (bar-table.js) that the C++ plays from; the C++
// (native/instruments/vibraphone/bar.cpp) has the same elements, with torsion and
// the mode shapes, for the instrument itself. Pure functions: no audio, no DOM.
//
//        ┌──────────────────────────────────────────────┐  ← top (struck)
//        │  full thickness h₀         full thickness h₀ │
//        └─────────╲________________________╱───────────┘
//                   ╲   undercut (arch):   ╱
//          |←  a  →| thin flat centre ±c, cosine sides out to ±a
//
// The bar and its cut are symmetric about the centre, so only half of it is
// meshed: bending modes 1, 3, 5 are symmetric (slope zero at the centre) and
// 2, 4 antisymmetric (no displacement at the centre). The stiffness and mass
// matrices are banded (half-bandwidth 3), so each eigenvalue comes from a
// Sturm-sequence bisection (count the negative pivots of K − λM), in O(n) per
// factorisation.

export const KEY_LO = 53, KEY_HI = 89; // F3–F6, the standard three-octave vibraphone
export const AL = { E: 69e9, rho: 2700, nu: 0.33 };   // aluminium alloy (6061-like)
export const G_AL = AL.E / (2 * (1 + AL.nu));
export const KAPPA = (10 * (1 + AL.nu)) / (12 + 11 * AL.nu); // Cowper's shear coefficient, rectangle

// Free–free Euler–Bernoulli beam: cos βL cosh βL = 1 (the ratios 1 : 2.756 : 5.404 : 8.933 : 13.34).
export const BETA_L = [4.730040745, 7.853204624, 10.99560784, 14.13716549, 17.27875966];
export const EB_RATIOS = BETA_L.map((b) => (b / BETA_L[0]) ** 2);

// What every bar starts as: aluminium 12.7 mm (½") thick, its width graded from
// 57 mm (F3) to 38 mm (F6); cf = c/a, the flat share of the cut (below).
export function barBlank(k) {
  const t = Math.min(1, Math.max(0, (k - KEY_LO) / (KEY_HI - KEY_LO)));
  return { b: 0.057 - 0.019 * t, h0: 0.0127, cf: 0.22 + 0.63 * t };
}

// 5-point Gauss–Legendre on [0, 1]
const GX = [0.04691007703066802, 0.2307653449471585, 0.5, 0.7692346550528415, 0.9530899229693319];
const GW = [0.11846344252809454, 0.23931433524968324, 0.28444444444444444, 0.23931433524968324, 0.11846344252809454];

// Thickness at distance X from the centre: flat at h₀ − d for X ≤ c, a cosine
// rise to h₀ at X = a (zero slope at both ends, so the cut is smooth).
export function thickness(cut, X) {
  const { h0, a, c, d } = cut;
  X = Math.abs(X);
  if (d <= 0 || X >= a) return h0;
  if (X <= c) return h0 - d;
  return h0 - d * 0.5 * (1 + Math.cos((Math.PI * (X - c)) / (a - c)));
}

// Half-bar node positions (0 = centre … L/2 = end), with nodes on the cut's corners.
export function halfMesh(cut, L, fine = 3) {
  const half = L / 2, x = [0];
  const seg = (to, n) => { const from = x[x.length - 1]; for (let i = 1; i <= n; i++) x.push(from + ((to - from) * i) / n); };
  const n = (k) => Math.max(1, Math.round(k * fine));
  if (cut.d <= 0 || cut.a <= 0) seg(half, n(36));
  else {
    const a = Math.min(cut.a, half), c = Math.min(cut.c, a);
    if (c > 1e-5 * L) seg(c, n(10));
    seg(a, n(16));
    if (half - a > 1e-5 * L) seg(half, n(10));
  }
  return x;
}

// Timoshenko element with interdependent interpolation (exact for a uniform
// element in statics; Reddy): w cubic, θ quadratic, φ = 12EI/(κGAl²).
function shapes(xi, l, phi, out) {
  const mu = 1 / (1 + phi), x2 = xi * xi, x3 = x2 * xi;
  const Nw = out.Nw, Nt = out.Nt, dNw = out.dNw, dNt = out.dNt;
  Nw[0] = mu * (1 - 3 * x2 + 2 * x3 + phi * (1 - xi));
  Nw[1] = l * mu * (xi - 2 * x2 + x3 + (phi / 2) * (xi - x2));
  Nw[2] = mu * (3 * x2 - 2 * x3 + phi * xi);
  Nw[3] = l * mu * (-x2 + x3 + (phi / 2) * (-xi + x2));
  Nt[0] = ((6 * mu) / l) * (-xi + x2);
  Nt[1] = mu * (1 - 4 * xi + 3 * x2 + phi * (1 - xi));
  Nt[2] = ((6 * mu) / l) * (xi - x2);
  Nt[3] = mu * (-2 * xi + 3 * x2 + phi * xi);
  dNw[0] = (mu * (-6 * xi + 6 * x2 - phi)) / l;
  dNw[1] = mu * (1 - 4 * xi + 3 * x2 + (phi / 2) * (1 - 2 * xi));
  dNw[2] = (mu * (6 * xi - 6 * x2 + phi)) / l;
  dNw[3] = mu * (-2 * xi + 3 * x2 + (phi / 2) * (-1 + 2 * xi));
  dNt[0] = ((6 * mu) / (l * l)) * (-1 + 2 * xi);
  dNt[1] = (mu * (-4 + 6 * xi - phi)) / l;
  dNt[2] = ((6 * mu) / (l * l)) * (1 - 2 * xi);
  dNt[3] = (mu * (-2 + 6 * xi + phi)) / l;
}
const SH = { Nw: new Float64Array(4), Nt: new Float64Array(4), dNw: new Float64Array(4), dNt: new Float64Array(4) };

// Bending: banded K, M (n × 4, row i holds A[i][i..i+3]) of the half bar.
// opts.shear = false gives Euler–Bernoulli (φ = 0, no rotary inertia).
export function assembleBending(nodes, cut, b, opts = {}) {
  const shear = opts.shear !== false, { E, rho } = AL;
  const nn = nodes.length, n = 2 * nn;
  const K = new Float64Array(n * 4), M = new Float64Array(n * 4);
  for (let e = 0; e < nn - 1; e++) {
    const x0 = nodes[e], l = nodes[e + 1] - x0, hm = thickness(cut, x0 + l / 2);
    const phi = shear ? (12 * E * (b * hm ** 3 / 12)) / (KAPPA * G_AL * b * hm * l * l) : 0;
    const kb = new Float64Array(16), ks = new Float64Array(16), me = new Float64Array(16);
    for (let g = 0; g < 5; g++) {
      const xi = GX[g], h = thickness(cut, x0 + xi * l), A = b * h, I = (b * h ** 3) / 12, w = GW[g] * l;
      shapes(xi, l, phi, SH);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        kb[i * 4 + j] += w * E * I * SH.dNt[i] * SH.dNt[j];
        if (shear) ks[i * 4 + j] += w * KAPPA * G_AL * A * (SH.dNw[i] - SH.Nt[i]) * (SH.dNw[j] - SH.Nt[j]);
        me[i * 4 + j] += w * rho * (A * SH.Nw[i] * SH.Nw[j] + (shear ? I * SH.Nt[i] * SH.Nt[j] : 0));
      }
    }
    for (let i = 0; i < 4; i++) for (let j = i; j < 4; j++) {
      K[(2 * e + i) * 4 + j - i] += kb[i * 4 + j] + ks[i * 4 + j];
      M[(2 * e + i) * 4 + j - i] += me[i * 4 + j];
    }
  }
  return { K, M, n };
}

// Drop one degree of freedom (a symmetry condition at the centre) from a band matrix.
function dropDof(B, n, s) {
  const N = n - 1, out = new Float64Array(N * 4);
  for (let i = 0; i < N; i++) {
    const a = i < s ? i : i + 1;
    for (let j = 0; j < 4 && i + j < N; j++) {
      const c = i + j < s ? i + j : i + j + 1;
      if (c - a <= 3) out[i * 4 + j] = B[a * 4 + c - a];
    }
  }
  return out;
}

// LDLᵀ of the band matrix K − λM (no pivoting): returns the number of negative
// pivots, which by Sylvester's law of inertia is the number of eigenvalues below λ.
function ldl(k, m, N, lam, d, Lb) {
  let neg = 0;
  for (let i = 0; i < N; i++) {
    let di = k[i * 4] - lam * m[i * 4];
    for (let t = 1; t <= 3 && i - t >= 0; t++) { const l = Lb[(i - t) * 4 + t]; di -= l * l * d[i - t]; }
    if (di === 0) di = 1e-300;
    d[i] = di; if (di < 0) neg++;
    for (let j = 1; j <= 3 && i + j < N; j++) {
      let v = k[i * 4 + j] - lam * m[i * 4 + j];
      for (let kk = Math.max(0, i + j - 3); kk < i; kk++) v -= Lb[kk * 4 + (i + j - kk)] * Lb[kk * 4 + (i - kk)] * d[kk];
      Lb[i * 4 + j] = v / di;
    }
  }
  return neg;
}

// The idx-th (1-based) eigenvalue of K x = λ M x, by bisection on the Sturm count.
export function bandEig(k, m, N, idx, { tol = 1e-13, guess = 1e4 } = {}) {
  const d = new Float64Array(N), Lb = new Float64Array(N * 4);
  let lo = 0, hi = guess;
  while (ldl(k, m, N, hi, d, Lb) < idx) hi *= 4;
  for (let it = 0; it < 200 && hi - lo > tol * hi; it++) {
    const mid = 0.5 * (lo + hi);
    if (ldl(k, m, N, mid, d, Lb) >= idx) hi = mid; else lo = mid;
  }
  return { lambda: 0.5 * (lo + hi) };
}

// Frequencies (Hz) of bending modes 1, 2, 3 only: what the optimiser needs.
export function bendingFreqs3(cut, L, b, fine = 3) {
  const nodes = halfMesh(cut, L, fine), { K, M, n } = assembleBending(nodes, cut, b);
  const ks = dropDof(K, n, 1), ms = dropDof(M, n, 1), ka = dropDof(K, n, 0), ma = dropDof(M, n, 0), N = n - 1;
  const f = (k, m, i) => Math.sqrt(bandEig(k, m, N, i).lambda) / (2 * Math.PI);
  return [f(ks, ms, 2), f(ka, ma, 2), f(ks, ms, 3)];
}

// Shape the undercut of a bar of thickness h0 and width b so that bending modes
// 1, 2, 3 sit at f1 : r2·f1 : r3·f1. The cut's flat centre is a fixed fraction cf
// of its half-width a; the unknowns are a, the depth d and the length L.
// Newton's method with a finite-difference Jacobian, from a starting guess.
export function tuneUndercut({ f1, b, h0, cf, r2 = 4, r3 = 10, start, fine = 3, maxIter = 40 }) {
  // unknowns u = [A = a/(L/2), D = d/h0, ln L]
  let u = start ? [start.A, start.D, Math.log(start.L)] : [0.6, 0.6, Math.log(0.3)];
  const res = (v) => {
    const L = Math.exp(v[2]), a = (v[0] * L) / 2, cut = { h0, a, c: cf * a, d: v[1] * h0 };
    const f = bendingFreqs3(cut, L, b, fine);
    return [Math.log(f[1] / f[0] / r2), Math.log(f[2] / f[0] / r3), Math.log(f[0] / f1)];
  };
  let r = res(u), it = 0;
  for (; it < maxIter; it++) {
    if (Math.abs(r[0]) + Math.abs(r[1]) + Math.abs(r[2]) < 1e-9) break;
    const J = [[], [], []], e = 1e-6;
    for (let j = 0; j < 3; j++) {
      const v = u.slice(); v[j] += e;
      const rj = res(v);
      for (let i = 0; i < 3; i++) J[i][j] = (rj[i] - r[i]) / e;
    }
    const step = solve3(J, r.map((x) => -x));
    let s = Math.min(1, 0.08 / Math.max(Math.abs(step[0]), Math.abs(step[1]), 1e-12));
    // backtrack until the residual falls
    const norm = (x) => Math.hypot(x[0], x[1], x[2]);
    let un, rn;
    for (let bt = 0; bt < 12; bt++, s *= 0.5) {
      un = [u[0] + s * step[0], u[1] + s * step[1], u[2] + s * step[2]];
      if (!(un[0] > 0.05 && un[0] < 1 && un[1] > 0 && un[1] < 0.92)) continue;
      rn = res(un);
      if (norm(rn) < norm(r)) break;
    }
    if (!rn) break;
    u = un; r = rn;
  }
  const L = Math.exp(u[2]), a = (u[0] * L) / 2;
  return { L, A: u[0], D: u[1], cf, cut: { h0, a, c: cf * a, d: u[1] * h0 }, residualCents: r.map((x) => (1200 * x) / Math.LN2), iterations: it };
}

function solve3(A, b) {
  const m = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = c + 1; r < 3; r++) { const f = m[r][c] / m[c][c]; for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k]; }
  }
  const x = [0, 0, 0];
  for (let r = 2; r >= 0; r--) { let s = m[r][3]; for (let k = r + 1; k < 3; k++) s -= m[r][k] * x[k]; x[r] = s / m[r][r]; }
  return x;
}
