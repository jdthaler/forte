// bar.js — a vibraphone bar by finite elements: Timoshenko bending and
// Saint-Venant torsion of a bar whose thickness varies along its length (the
// undercut), and the optimiser that shapes the undercut so that the first three
// bending modes sit at 1 : 4 : 10. Pure functions: no audio, no DOM.
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
// Sturm-sequence bisection (count the negative pivots of K − λM) and each
// eigenvector from inverse iteration, all in O(n) per factorisation.

export const AL = { E: 69e9, rho: 2700, nu: 0.33 };   // aluminium alloy (6061-like)
export const G_AL = AL.E / (2 * (1 + AL.nu));
export const KAPPA = (10 * (1 + AL.nu)) / (12 + 11 * AL.nu); // Cowper's shear coefficient, rectangle

// Free–free Euler–Bernoulli beam: cos βL cosh βL = 1 (the ratios 1 : 2.756 : 5.404 : 8.933 : 13.34).
export const BETA_L = [4.730040745, 7.853204624, 10.99560784, 14.13716549, 17.27875966];
export const EB_RATIOS = BETA_L.map((b) => (b / BETA_L[0]) ** 2);

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

// Torsion constant of a b × h rectangle (b ≥ h), Roark's approximation.
export function torsionJ(b, h) {
  const t = Math.min(b, h), w = Math.max(b, h), r = t / w;
  return w * t ** 3 * (1 / 3 - 0.21 * r * (1 - r ** 4 / 12));
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

// Bending: banded K, M (n × 4, row i holds A[i][i..i+3]) of the half bar, and the
// per-element bending stiffness blocks (for strain-energy bookkeeping).
// opts.shear = false gives Euler–Bernoulli (φ = 0, no rotary inertia).
export function assembleBending(nodes, cut, b, opts = {}) {
  const shear = opts.shear !== false, { E, rho } = AL;
  const nn = nodes.length, n = 2 * nn;
  const K = new Float64Array(n * 4), M = new Float64Array(n * 4), Kb = [];
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
    Kb.push({ kb, phi, l, h: hm });
  }
  return { K, M, n, Kb };
}

// Torsion (Saint-Venant, linear elements): GJ θ″ and the polar inertia ρ(bh³ + hb³)/12.
export function assembleTorsion(nodes, cut, b) {
  const nn = nodes.length, K = new Float64Array(nn * 4), M = new Float64Array(nn * 4), { rho } = AL;
  for (let e = 0; e < nn - 1; e++) {
    const x0 = nodes[e], l = nodes[e + 1] - x0;
    let k = 0, m11 = 0, m12 = 0, m22 = 0;
    for (let g = 0; g < 5; g++) {
      const xi = GX[g], h = thickness(cut, x0 + xi * l), w = GW[g] * l;
      k += (w * G_AL * torsionJ(b, h)) / (l * l);
      const ip = (rho * (b * h ** 3 + h * b ** 3)) / 12;
      m11 += w * ip * (1 - xi) ** 2; m12 += w * ip * (1 - xi) * xi; m22 += w * ip * xi * xi;
    }
    K[e * 4] += k; K[e * 4 + 1] -= k; K[(e + 1) * 4] += k;
    M[e * 4] += m11; M[e * 4 + 1] += m12; M[(e + 1) * 4] += m22;
  }
  return { K, M, n: nn };
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

// Band matrix × vector.
function bandMul(B, N, x, y) {
  y.fill(0);
  for (let i = 0; i < N; i++) {
    y[i] += B[i * 4] * x[i];
    for (let j = 1; j <= 3 && i + j < N; j++) { const v = B[i * 4 + j]; y[i] += v * x[i + j]; y[i + j] += v * x[i]; }
  }
}

// The idx-th (1-based) eigenvalue and its M-normalised eigenvector of K x = λ M x.
export function bandEig(k, m, N, idx, { vector = true, tol = 1e-13, guess = 1e4 } = {}) {
  const d = new Float64Array(N), Lb = new Float64Array(N * 4);
  let lo = 0, hi = guess;
  while (ldl(k, m, N, hi, d, Lb) < idx) hi *= 4;
  for (let it = 0; it < 200 && hi - lo > tol * hi; it++) {
    const mid = 0.5 * (lo + hi);
    if (ldl(k, m, N, mid, d, Lb) >= idx) hi = mid; else lo = mid;
  }
  const lambda = 0.5 * (lo + hi);
  if (!vector) return { lambda };
  // inverse iteration at a shift just off the eigenvalue
  const shift = lambda * (1 - 1e-9) - 1e-9, x = new Float64Array(N), y = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = 1 + 0.37 * Math.sin(1.7 * i);
  for (let it = 0; it < 3; it++) {
    ldl(k, m, N, shift, d, Lb);
    bandMul(m, N, x, y);
    for (let i = 0; i < N; i++) { let v = y[i]; for (let t = 1; t <= 3 && i - t >= 0; t++) v -= Lb[(i - t) * 4 + t] * y[i - t]; y[i] = v; } // L z = y
    for (let i = 0; i < N; i++) y[i] /= d[i];
    for (let i = N - 1; i >= 0; i--) { let v = y[i]; for (let t = 1; t <= 3 && i + t < N; t++) v -= Lb[i * 4 + t] * y[i + t]; y[i] = v; } // Lᵀ x = z
    bandMul(m, N, y, x);
    let s = 0; for (let i = 0; i < N; i++) s += y[i] * x[i];
    s = 1 / Math.sqrt(s);
    for (let i = 0; i < N; i++) x[i] = y[i] * s;
  }
  return { lambda, x };
}

// Frequencies (Hz) of bending modes 1, 2, 3 only: what the optimiser needs.
export function bendingFreqs3(cut, L, b, fine = 3) {
  const nodes = halfMesh(cut, L, fine), { K, M, n } = assembleBending(nodes, cut, b);
  const ks = dropDof(K, n, 1), ms = dropDof(M, n, 1), ka = dropDof(K, n, 0), ma = dropDof(M, n, 0), N = n - 1;
  const f = (k, m, i) => Math.sqrt(bandEig(k, m, N, i, { vector: false }).lambda) / (2 * Math.PI);
  return [f(ks, ms, 2), f(ka, ma, 2), f(ks, ms, 3)];
}

// Interpolate a half-bar bending eigenvector (dofs w, θ per node, one dropped)
// to positions xs (from the centre) and expand by symmetry.
function bendingShape(nodes, Kb, x, drop, sym, xs) {
  const full = new Float64Array(2 * nodes.length);
  for (let i = 0, j = 0; i < full.length; i++) full[i] = i === drop ? 0 : x[j++];
  return xs.map((X) => {
    const ax = Math.abs(X);
    let e = 0;
    while (e < nodes.length - 2 && ax > nodes[e + 1]) e++;
    const l = nodes[e + 1] - nodes[e], xi = Math.min(1, Math.max(0, (ax - nodes[e]) / l));
    shapes(xi, l, Kb[e].phi, SH);
    let w = 0;
    for (let i = 0; i < 4; i++) w += SH.Nw[i] * full[2 * e + i];
    return X < 0 && !sym ? -w : w;
  });
}

// Everything about one bar: bending modes 1–5 and torsion modes 1–2, with
// shapes sampled at nx points along the whole bar (x from 0 at one end to L),
// unit modal mass over the whole bar (∫ρA w² + ρI θ² = 1; ∫ρI_p ψ² = 1 for torsion),
// and the share of each mode's strain energy stored as bending in each element.
export function barModes(cut, L, b, { nx = 97, fine = 3, nBend = 5, nTors = 2 } = {}) {
  const nodes = halfMesh(cut, L, fine), B = assembleBending(nodes, cut, b), n = B.n, N = n - 1;
  const xs = Array.from({ length: nx }, (_, i) => (i / (nx - 1)) * L - L / 2);
  const sets = [{ drop: 1, sym: true }, { drop: 0, sym: false }].map((s) => ({ ...s, k: dropDof(B.K, n, s.drop), m: dropDof(B.M, n, s.drop) }));
  const bend = [];
  // mode order: 1 sym, 2 anti, 3 sym, 4 anti, 5 sym (index 1 of each set is a rigid-body mode)
  for (let i = 0; i < nBend; i++) {
    const s = sets[i % 2], idx = 2 + Math.floor(i / 2);
    const { lambda, x } = bandEig(s.k, s.m, N, idx);
    const half = Float64Array.from(x, (v) => v * Math.SQRT1_2); // half-bar normalised to ½ → whole bar to 1
    const full = new Float64Array(n);
    for (let r = 0, j = 0; r < n; r++) full[r] = r === s.drop ? 0 : half[j++];
    // bending share of strain energy per element (for thermoelastic loss)
    let Ub = 0, Ut = 0;
    const uel = [];
    for (let e = 0; e < nodes.length - 1; e++) {
      const xe = [full[2 * e], full[2 * e + 1], full[2 * e + 2], full[2 * e + 3]], kb = B.Kb[e].kb;
      let u = 0;
      for (let p = 0; p < 4; p++) for (let q = 0; q < 4; q++) u += 0.5 * xe[p] * kb[p * 4 + q] * xe[q];
      uel.push({ h: B.Kb[e].h, u }); Ub += u;
    }
    Ut = 0.5 * lambda * 0.5; // ½ ω² (xᵀMx = ½ on the half bar)
    let w = bendingShape(nodes, B.Kb, half, s.drop, s.sym, xs);
    if (w[0] < 0) w = w.map((v) => -v); // sign: the end at x = 0 moves +
    bend.push({ f: Math.sqrt(lambda) / (2 * Math.PI), omega: Math.sqrt(lambda), sym: s.sym, w: Float64Array.from(w), elems: uel.map((e) => ({ h: e.h, share: e.u / Ut })), bendShare: Ub / Ut });
  }
  // torsion
  const T = assembleTorsion(nodes, cut, b), tors = [];
  const tsets = [{ drop: 0, sym: false, idx: 1 }, { drop: -1, sym: true, idx: 2 }];
  for (let i = 0; i < nTors; i++) {
    const s = tsets[i % 2];
    const k = s.drop >= 0 ? dropDof(T.K, T.n, s.drop) : T.K, m = s.drop >= 0 ? dropDof(T.M, T.n, s.drop) : T.M, Nt = s.drop >= 0 ? T.n - 1 : T.n;
    const { lambda, x } = bandEig(k, m, Nt, s.idx + Math.floor(i / 2));
    const full = new Float64Array(T.n);
    for (let r = 0, j = 0; r < T.n; r++) full[r] = r === s.drop ? 0 : x[j++] * Math.SQRT1_2;
    let psi = xs.map((X) => {
      const ax = Math.abs(X);
      let e = 0;
      while (e < nodes.length - 2 && ax > nodes[e + 1]) e++;
      const u = Math.min(1, Math.max(0, (ax - nodes[e]) / (nodes[e + 1] - nodes[e])));
      const v = (1 - u) * full[e] + u * full[e + 1];
      return X < 0 && !s.sym ? -v : v;
    });
    if (psi[0] < 0) psi = psi.map((v) => -v);
    tors.push({ f: Math.sqrt(lambda) / (2 * Math.PI), omega: Math.sqrt(lambda), sym: s.sym, psi: Float64Array.from(psi) });
  }
  let mass = 0;
  for (let e = 0; e < nodes.length - 1; e++) { const l = nodes[e + 1] - nodes[e]; for (let g = 0; g < 5; g++) mass += 2 * GW[g] * l * AL.rho * b * thickness(cut, nodes[e] + GX[g] * l); }
  return { L, b, cut, nx, xs: Float64Array.from(xs, (X) => X + L / 2), bend, tors, mass };
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
