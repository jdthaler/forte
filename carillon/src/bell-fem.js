// bell-fem.js — axisymmetric solid finite elements for a bell (or any body of
// revolution), one circumferential harmonic m at a time. Pure numerics: no
// audio, no DOM.
//
// A body of revolution vibrates in families m = 0, 1, 2, … In cylindrical
// coordinates (r, θ, z) the displacement of family m is
//   u_r = U_r(r, z) cos mθ,   u_θ = U_θ(r, z) sin mθ,   u_z = U_z(r, z) cos mθ
// (and the same with cos ↔ sin, at the same frequency, for m ≥ 1). That is
// exact three-dimensional elasticity: no shell kinematics, so a thick wall is
// no harder than a thin one and there is no shear locking (Perrin, Charnley &
// dePont 1983 solved church bells this way; Roozen-Kroon 1992 the carillon
// bell). The engineering strains of family m are
//   ε_rr = U_r,r cos   ε_zz = U_z,z cos   ε_θθ = (U_r + mU_θ)/r cos   γ_rz = (U_r,z + U_z,r) cos
//   γ_rθ = (U_θ,r − U_θ/r − mU_r/r) sin   γ_zθ = (U_θ,z − mU_z/r) sin
// and integrating cos² or sin² over θ gives π (m ≥ 1; for m = 0, 2π and the
// sin terms vanish, so U_θ, which then only twists the body, is dropped).
//
// The meridian section (r, z) is meshed with 8-node quadratic (serendipity)
// quadrilaterals, n_s along the wall and n_t through it, integrated 3 × 3.
// Nodes are numbered along the wall, so K and M are banded; the lowest modes
// come from subspace iteration on (K − σM)⁻¹M with a banded Cholesky factor,
// with a Rayleigh–Ritz step (shared/linalg.js genEig) each round.
//
// Units: everything is non-dimensional (E = 1, ρ = 1, lengths in the bell's
// diameter D), so f = √λ/(2π) · √(E/ρ)/D for a bronze bell of diameter D. Only
// Poisson's ratio ν enters the eigenproblem.

import { genEig } from '../../shared/linalg.js';

export const TAU = 2 * Math.PI;

// ---- the mesh ---------------------------------------------------------------------------------------
// A wall section: X(u, τ) = mid(u) + τ t(u) n(u), u ∈ [0, 1] along the mid-surface, τ ∈ [−½, ½]
// across it (n = the unit normal pointing to the outside). `geom` gives
//   mid(u) → [r, z],  tan(u) → unit tangent [dr, dz],  t(u) → thickness,  sGrid(ns) → element ends in u.
// The mid-surface is walked from u = 0 (the crown's bolt hole, for a bell) to u = 1 (the lip).
export function meshWall(geom, ns, nt) {
  const ue = geom.sGrid(ns); // ns + 1 element ends
  const rows = [], nodes = [], index = [];
  for (let i = 0; i <= 2 * ns; i++) {
    const e = i >> 1, u = i % 2 ? 0.5 * (ue[e] + ue[e + 1]) : ue[e];
    const [r0, z0] = geom.mid(u), [tr, tz] = geom.tan(u), t = geom.t(u), nr = -tz, nz = tr;
    const row = [];
    for (let j = 0; j <= 2 * nt; j++) {
      if (i % 2 && j % 2) { row.push(-1); continue; } // serendipity: no centre nodes
      const tau = j / (2 * nt) - 0.5;
      row.push(nodes.length);
      nodes.push([r0 + tau * t * nr, z0 + tau * t * nz]);
      index.push([i, j]);
    }
    rows.push(row);
  }
  const elems = [];
  for (let e = 0; e < ns; e++) for (let k = 0; k < nt; k++) {
    const i = 2 * e, j = 2 * k, R = rows;
    // local order: corners (−1,−1) (1,−1) (1,1) (−1,1), then midsides (0,−1) (1,0) (0,1) (−1,0); ξ along, η across
    elems.push([R[i][j], R[i + 2][j], R[i + 2][j + 2], R[i][j + 2], R[i + 1][j], R[i + 2][j + 1], R[i + 1][j + 2], R[i][j + 1]]);
  }
  return { nodes, elems, rows, ns, nt, ue, index };
}

// Serendipity shape functions and their derivatives at (ξ, η).
const XI = [-1, 1, 1, -1, 0, 1, 0, -1], ETA = [-1, -1, 1, 1, -1, 0, 1, 0];
function shape(x, y, N, dx, dy) {
  for (let a = 0; a < 4; a++) {
    const xa = XI[a], ya = ETA[a];
    N[a] = 0.25 * (1 + x * xa) * (1 + y * ya) * (x * xa + y * ya - 1);
    dx[a] = 0.25 * xa * (1 + y * ya) * (2 * x * xa + y * ya);
    dy[a] = 0.25 * ya * (1 + x * xa) * (x * xa + 2 * y * ya);
  }
  for (let a = 4; a < 8; a++) {
    const xa = XI[a], ya = ETA[a];
    if (xa === 0) { N[a] = 0.5 * (1 - x * x) * (1 + y * ya); dx[a] = -x * (1 + y * ya); dy[a] = 0.5 * ya * (1 - x * x); }
    else { N[a] = 0.5 * (1 + x * xa) * (1 - y * y); dx[a] = 0.5 * xa * (1 - y * y); dy[a] = -y * (1 + x * xa); }
  }
}
const GP = [-Math.sqrt(0.6), 0, Math.sqrt(0.6)], GW = [5 / 9, 8 / 9, 5 / 9];

// Gauss-point data for every element: [{ N, dNr, dNz, r, w }] (w = weight · det J · r).
function gaussData(mesh) {
  const out = [];
  const N = new Float64Array(8), dx = new Float64Array(8), dy = new Float64Array(8);
  for (const el of mesh.elems) {
    const pts = [];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      shape(GP[a], GP[b], N, dx, dy);
      let rx = 0, zx = 0, ry = 0, zy = 0, r = 0;
      for (let q = 0; q < 8; q++) { const [nr, nz] = mesh.nodes[el[q]]; rx += dx[q] * nr; zx += dx[q] * nz; ry += dy[q] * nr; zy += dy[q] * nz; r += N[q] * nr; }
      const det = rx * zy - ry * zx;
      if (!(det > 0)) throw new Error('bell mesh folds over itself (negative Jacobian)');
      const dNr = new Float64Array(8), dNz = new Float64Array(8);
      for (let q = 0; q < 8; q++) { dNr[q] = (zy * dx[q] - zx * dy[q]) / det; dNz[q] = (-ry * dx[q] + rx * dy[q]) / det; }
      pts.push({ N: Float64Array.from(N), dNr, dNz, r, w: GW[a] * GW[b] * det * r });
    }
    out.push(pts);
  }
  return out;
}

// ---- assembly -----------------------------------------------------------------------------------
// Degrees of freedom: [U_r, U_θ, U_z] per node; `fixed` nodes and (for m = 0) every U_θ are removed.
// Returns banded K and M (upper band, row-major: A[i·(bw+1) + (j − i)]), the dof map and the bandwidth.
export function assemble(mesh, m, nu, { fixedNodes = [], gp = gaussData(mesh) } = {}) {
  const nn = mesh.nodes.length, map = new Int32Array(3 * nn).fill(-1), fixed = new Set(fixedNodes);
  let n = 0;
  for (let p = 0; p < nn; p++) for (let c = 0; c < 3; c++) if (!fixed.has(p) && !(m === 0 && c === 1)) map[3 * p + c] = n++;
  let bw = 0;
  for (const el of mesh.elems) {
    let lo = Infinity, hi = -Infinity;
    for (const p of el) for (let c = 0; c < 3; c++) { const d = map[3 * p + c]; if (d >= 0) { lo = Math.min(lo, d); hi = Math.max(hi, d); } }
    if (hi >= lo) bw = Math.max(bw, hi - lo);
  }
  const W = bw + 1, K = new Float64Array(n * W), M = new Float64Array(n * W);
  const lam = nu / ((1 + nu) * (1 - 2 * nu)), mu = 1 / (2 * (1 + nu)); // E = 1
  const c2 = lam + 2 * mu, th = m === 0 ? 2 * Math.PI : Math.PI;
  const Ke = new Float64Array(24 * 24), Me = new Float64Array(24 * 24);
  // strain rows per node: B[s][3q + c]
  const B = Array.from({ length: 6 }, () => new Float64Array(24));
  mesh.elems.forEach((el, ei) => {
    Ke.fill(0); Me.fill(0);
    for (const g of gp[ei]) {
      const { N, dNr, dNz, r, w } = g;
      for (const row of B) row.fill(0);
      for (let q = 0; q < 8; q++) {
        const R = 3 * q, T = 3 * q + 1, Z = 3 * q + 2, Nr = N[q] / r;
        B[0][R] = dNr[q];                                   // ε_rr
        B[1][R] = Nr; B[1][T] = m * Nr;                      // ε_θθ
        B[2][Z] = dNz[q];                                   // ε_zz
        B[3][R] = dNz[q]; B[3][Z] = dNr[q];                 // γ_rz
        B[4][R] = -m * Nr; B[4][T] = dNr[q] - Nr;           // γ_rθ
        B[5][T] = dNz[q]; B[5][Z] = -m * Nr;                // γ_zθ
      }
      const f = w * th;
      for (let a = 0; a < 24; a++) {
        const b0 = B[0][a], b1 = B[1][a], b2 = B[2][a], b3 = B[3][a], b4 = B[4][a], b5 = B[5][a];
        if (!(b0 || b1 || b2 || b3 || b4 || b5)) continue;
        // D·B column a
        const s0 = c2 * b0 + lam * (b1 + b2), s1 = c2 * b1 + lam * (b0 + b2), s2 = c2 * b2 + lam * (b0 + b1);
        for (let b = 0; b < 24; b++) {
          const v = B[0][b] * s0 + B[1][b] * s1 + B[2][b] * s2 + mu * (B[3][b] * b3 + B[4][b] * b4 + B[5][b] * b5);
          if (v) Ke[a * 24 + b] += f * v;
        }
      }
      for (let p = 0; p < 8; p++) for (let q = 0; q < 8; q++) {
        const v = w * N[p] * N[q];
        Me[(3 * p) * 24 + 3 * q] += th * v;            // U_r: cos²
        Me[(3 * p + 1) * 24 + 3 * q + 1] += Math.PI * v; // U_θ: sin²
        Me[(3 * p + 2) * 24 + 3 * q + 2] += th * v;    // U_z: cos²
      }
    }
    for (let a = 0; a < 24; a++) {
      const ga = map[3 * el[(a / 3) | 0] + (a % 3)];
      if (ga < 0) continue;
      for (let b = 0; b < 24; b++) {
        const gb = map[3 * el[(b / 3) | 0] + (b % 3)];
        if (gb < ga) continue;
        K[ga * W + gb - ga] += Ke[a * 24 + b];
        M[ga * W + gb - ga] += Me[a * 24 + b];
      }
    }
  });
  return { K, M, n, bw, map, gp };
}

// ---- banded linear algebra ------------------------------------------------------------------------
// y = A x for a symmetric band matrix (upper band storage), x, y of length n (several columns: stride p).
function bandMul(A, n, bw, x, y, p) {
  const W = bw + 1;
  y.fill(0);
  for (let i = 0; i < n; i++) {
    const ai = i * W, xi = i * p;
    for (let c = 0; c < p; c++) y[xi + c] += A[ai] * x[xi + c];
    const top = Math.min(n - 1, i + bw);
    for (let j = i + 1; j <= top; j++) {
      const a = A[ai + j - i];
      if (a === 0) continue;
      const xj = j * p;
      for (let c = 0; c < p; c++) { y[xi + c] += a * x[xj + c]; y[xj + c] += a * x[xi + c]; }
    }
  }
}
// Banded Cholesky A = UᵀU in place (upper band).
function bandCholesky(A, n, bw) {
  const W = bw + 1;
  for (let i = 0; i < n; i++) {
    const ai = i * W;
    let d = A[ai];
    const lo = Math.max(0, i - bw);
    for (let k = lo; k < i; k++) { const u = A[k * W + i - k]; d -= u * u; }
    if (!(d > 0)) throw new Error('banded Cholesky: matrix not positive definite');
    d = Math.sqrt(d);
    A[ai] = d;
    const top = Math.min(n - 1, i + bw);
    for (let j = i + 1; j <= top; j++) {
      let s = A[ai + j - i];
      const lo2 = Math.max(0, j - bw);
      for (let k = Math.max(lo, lo2); k < i; k++) s -= A[k * W + i - k] * A[k * W + j - k];
      A[ai + j - i] = s / d;
    }
  }
}
// Solve UᵀU x = b in place (p columns).
function bandSolve(U, n, bw, x, p) {
  const W = bw + 1;
  for (let i = 0; i < n; i++) { // Uᵀ y = b
    const xi = i * p, lo = Math.max(0, i - bw);
    for (let k = lo; k < i; k++) { const u = U[k * W + i - k]; if (u === 0) continue; const xk = k * p; for (let c = 0; c < p; c++) x[xi + c] -= u * x[xk + c]; }
    const d = 1 / U[i * W];
    for (let c = 0; c < p; c++) x[xi + c] *= d;
  }
  for (let i = n - 1; i >= 0; i--) { // U x = y
    const xi = i * p, top = Math.min(n - 1, i + bw);
    for (let j = i + 1; j <= top; j++) { const u = U[i * W + j - i]; if (u === 0) continue; const xj = j * p; for (let c = 0; c < p; c++) x[xi + c] -= u * x[xj + c]; }
    const d = 1 / U[i * W];
    for (let c = 0; c < p; c++) x[xi + c] *= d;
  }
}

// The nModes lowest eigenpairs of K x = λ M x (both banded), by subspace iteration on (K − σM)⁻¹M
// with Rayleigh–Ritz. σ < 0 keeps K − σM positive definite. Returns { lambda, X (n × nModes, M-normalised) }.
export function bandEig(K, M, n, bw, nModes, { tol = 1e-12, maxIter = 300, shift = null, seed = 1, X0 = null } = {}) {
  const W = bw + 1, p = Math.min(n, nModes + Math.max(8, nModes));
  // The shift: first a rough one from the smallest K/M diagonal ratio; once the Ritz values have
  // settled a little, σ = −0.1 × the lowest elastic eigenvalue, so that (K − σM)⁻¹M separates the
  // wanted modes well (a thin wall's lowest λ is far below its diagonal ratios).
  let s = Infinity;
  for (let i = 0; i < n; i++) s = Math.min(s, K[i * W] / M[i * W]);
  let sigma = shift ?? -1e-3 * s, refined = shift !== null;
  const A = new Float64Array(K.length);
  const factor = () => { for (let i = 0; i < A.length; i++) A[i] = K[i] - sigma * M[i]; bandCholesky(A, n, bw); };
  factor();
  let X = new Float64Array(n * p);
  let st = seed >>> 0 || 1;
  const rnd = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 4294967296 - 0.5; };
  for (let i = 0; i < n; i++) for (let c = 0; c < p; c++) X[i * p + c] = rnd();
  // a warm start (the vectors of a nearby problem, e.g. a rib changed slightly): converges in a few rounds
  if (X0 && X0.n === n && X0.p === p) { X.set(X0.X); if (X0.sigma) { sigma = X0.sigma; refined = true; factor(); } }
  const Y = new Float64Array(n * p), KY = new Float64Array(n * p), MY = new Float64Array(n * p);
  let prev = null, lambda = null, Q = null, iters = 0, converged = false, best = Infinity, stale = 0;
  for (let it = 0; it < maxIter; it++) {
    iters = it + 1;
    bandMul(M, n, bw, X, Y, p);
    bandSolve(A, n, bw, Y, p); // Y = (K − σM)⁻¹ M X
    bandMul(K, n, bw, Y, KY, p); bandMul(M, n, bw, Y, MY, p);
    const Kr = new Float64Array(p * p), Mr = new Float64Array(p * p);
    for (let a = 0; a < p; a++) for (let b = a; b < p; b++) {
      let sk = 0, sm = 0;
      for (let i = 0; i < n; i++) { const y = Y[i * p + a]; sk += y * KY[i * p + b]; sm += y * MY[i * p + b]; }
      Kr[a * p + b] = Kr[b * p + a] = sk; Mr[a * p + b] = Mr[b * p + a] = sm;
    }
    const ev = genEig(Kr, Mr, p, p);
    lambda = ev.lambda; Q = ev.X;
    // X = Y Q
    const Xn = new Float64Array(n * p);
    for (let i = 0; i < n; i++) for (let c = 0; c < p; c++) { let v = 0; for (let a = 0; a < p; a++) v += Y[i * p + a] * Q[a * p + c]; Xn[i * p + c] = v; }
    X = Xn;
    if (prev) {
      let worst = 0;
      for (let c = 0; c < nModes; c++) worst = Math.max(worst, Math.abs(lambda[c] - prev[c]) / Math.max(Math.abs(lambda[c]), 1e-30 + Math.abs(lambda[nModes - 1]) * 1e-9));
      if (!refined && (worst < 1e-3 || it >= 12)) {
        const top = lambda[p - 1];
        let low = top;
        for (let c = 0; c < p; c++) if (lambda[c] > 1e-8 * top) { low = lambda[c]; break; }
        sigma = -0.1 * low; refined = true; factor();
      } else if (refined) {
        if (worst < tol) { converged = true; break; }
        // rounding sets a floor (a thin wall's K is ill-conditioned): stop once the change stops falling
        if (worst < 0.5 * best) { best = worst; stale = 0; } else if (++stale >= 10 && best < 1e-5) { converged = true; break; }
      }
    }
    prev = Float64Array.from(lambda);
  }
  const out = new Float64Array(n * nModes);
  for (let i = 0; i < n; i++) for (let c = 0; c < nModes; c++) out[i * nModes + c] = X[i * p + c];
  if (!converged) throw new Error(`bandEig: no convergence in ${maxIter} iterations`);
  return { lambda: Float64Array.from(lambda.subarray(0, nModes)), X: out, n, nModes, iters, warm: { X, n, p, sigma } };
}

// ---- modes of one harmonic m ------------------------------------------------------------------------
// The modes of family m: [{ m, lambda, U: Float64Array(3·nodes) (zero at removed dofs), T: kinetic-energy
// shares { rz, th } }], lowest first, rigid-body modes (λ ≈ 0) dropped.
export function modesOf(mesh, m, nu, nModes, opts = {}) {
  const asm = assemble(mesh, m, nu, opts);
  const extra = m <= 1 && !opts.fixedNodes?.length ? 2 : 0; // a free body: up to two rigid modes in m = 0, 1
  const ev = bandEig(asm.K, asm.M, asm.n, asm.bw, nModes + extra, { ...opts, X0: opts.warm?.[m] });
  if (opts.warm) opts.warm[m] = ev.warm;
  const nn = mesh.nodes.length, W = asm.bw + 1, out = [];
  const lamTop = ev.lambda[ev.nModes - 1];
  for (let c = 0; c < ev.nModes; c++) {
    const lam = ev.lambda[c];
    if (lam < 1e-8 * lamTop) continue; // rigid body
    const x = new Float64Array(asm.n);
    for (let i = 0; i < asm.n; i++) x[i] = ev.X[i * ev.nModes + c];
    // kinetic-energy shares of (U_r, U_z) and U_θ: M couples only like components
    const Mx = new Float64Array(asm.n);
    bandMul(asm.M, asm.n, asm.bw, x, Mx, 1);
    let rz = 0, th = 0;
    const U = new Float64Array(3 * nn);
    for (let p = 0; p < nn; p++) for (let k = 0; k < 3; k++) {
      const d = asm.map[3 * p + k];
      if (d < 0) continue;
      U[3 * p + k] = x[d];
      if (k === 1) th += x[d] * Mx[d]; else rz += x[d] * Mx[d];
    }
    out.push({ m, lambda: lam, U, T: { rz, th } });
    if (out.length === nModes) break;
  }
  void W;
  return out;
}

// ---- validation geometry: a ring of rectangular section --------------------------------------------
// Mean radius R, radial thickness h, axial width b (lengths in any unit; E = ρ = 1).
export function ringGeom(R, h, b) {
  return {
    mid: (u) => [R, b * (1 - u)], tan: () => [0, -1], t: () => h,
    sGrid: (ns) => Array.from({ length: ns + 1 }, (_, i) => i / ns),
  };
}
// Rayleigh's thin ring, in-plane bending (Love, §293; Rayleigh, Theory of Sound §233):
//   ω_m² = (E I / ρ A R⁴) · m²(m² − 1)² / (m² + 1),   I = b h³ / 12, A = b h.
export const ringRayleigh = (m, R, h) => Math.sqrt(((h * h) / 12 / R ** 4) * ((m * m * (m * m - 1) ** 2) / (m * m + 1))) / TAU;
// …and its extensional (breathing) mode, m = 0: ω = √(E/ρ)/R.
export const ringBreathing = (R) => 1 / (TAU * R);
