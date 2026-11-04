// planets-modes.mjs — the free oscillations of a layered, self-gravitating, spherical planet:
// the normal-mode solver behind the Ringing Planets (planets/README.md, "The modes").
//
// A planet's free oscillations are standing waves of the whole body. On a spherical, non-rotating,
// elastic and isotropic planet (SNREI) each is a multiplet nSl (spheroidal) or nTl (toroidal) of
// 2l+1 singlets sharing one frequency. The radial eigenfunctions (U, V for spheroidal, W for
// toroidal, P for the perturbed gravitational potential) make the Rayleigh quotient stationary:
//   ω² ∫ρ(U² + V²) r² dr = ∫ { κD² + μ/3 (2U' − F/r)² + μ(V' − V/r + kU/r)² + (k² − 2) μ V²/r²
//                               + 4πGρ²U² − 4ρgU²/r + 2kρgUV/r + 2ρ(U P' + kVP/r) } r² dr
//                           + (4πG)⁻¹ ∫₀^∞ (P'² + k²P²/r²) r² dr          (P made stationary too)
// with F = 2U − kV, D = U' + F/r, k² = l(l + 1) (Dahlen & Tromp 1998, §8.7), and for toroidal modes
//   ω² ∫ρW² r² dr = ∫ μ[(W' − W/r)² + (k² − 2) W²/r²] r² dr          over the solid outer shell.
// Spectral elements (Lagrange on Gauss–Lobatto–Legendre nodes) in radius give K x = ω² M x; P is
// eliminated exactly (its Poisson equation, with the exterior field (l+1)R P(R)² in closed form),
// the tangential motion slips at a fluid's boundary, and the generalized eigenproblem is solved
// densely (shared/linalg.js). Then each mode's Q from the layers' Qκ and Qμ (energy fractions), the
// physical dispersion of that Q from the model's reference frequency to the mode's own, and the
// first-order splitting by the planet's spin, χ (ω_m = ω + mχΩ).
//
// Usage: import { solvePlanet } from './planets-modes.mjs'; or run it:
//   node tools/planets-modes.mjs earth 2 [type]     print the modes of degree 2

import { genEig } from '../shared/linalg.js';
import { PLANETS, G, gravityAt } from '../planets/src/planets-models.js';

const FOUR_PI_G = 4 * Math.PI * G * 1000; // s⁻² per g/cm³ (r in km, ρ in g/cm³, g in km/s²)

// Gauss–Lobatto–Legendre nodes of order p on [−1, 1]
function gll(p) {
  if (p === 4) return [-1, -Math.sqrt(3 / 7), 0, Math.sqrt(3 / 7), 1];
  if (p === 5) { const a = Math.sqrt(1 / 3 + 2 * Math.sqrt(7) / 21), b = Math.sqrt(1 / 3 - 2 * Math.sqrt(7) / 21); return [-1, -a, -b, b, a, 1]; }
  throw new Error('order');
}
// Gauss–Legendre points and weights on [−1, 1] (Golub–Welsch would do; Newton on P_n is enough)
function gaussLegendre(n) {
  const x = [], w = [];
  for (let i = 0; i < n; i++) {
    let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1, p1 = z;
      for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      dp = n * (z * p1 - p0) / (z * z - 1);
      const dz = p1 / dp; z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    x.push(z); w.push(2 / ((1 - z * z) * dp * dp));
  }
  return { x, w };
}
// Lagrange basis on nodes ξ: values and derivatives at t
function lagrange(xi, t) {
  const n = xi.length, N = new Float64Array(n), dN = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let v = 1;
    for (let j = 0; j < n; j++) if (j !== i) v *= (t - xi[j]) / (xi[i] - xi[j]);
    N[i] = v;
    let d = 0;
    for (let m = 0; m < n; m++) {
      if (m === i) continue;
      let q = 1 / (xi[i] - xi[m]);
      for (let j = 0; j < n; j++) if (j !== i && j !== m) q *= (t - xi[j]) / (xi[i] - xi[j]);
      d += q;
    }
    dN[i] = d;
  }
  return { N, dN };
}

const P_ORDER = 4;
const XI = gll(P_ORDER);
const QUAD = gaussLegendre(8);
const BASIS = QUAD.x.map((t) => lagrange(XI, t));

// The radial mesh: each layer cut into elements no longer than `h` km (and a fraction of the
// shortest wavelength at fmax), finer near the surface where high-degree modes live.
export function mesh(P, fmax) {
  const els = [];
  for (const [li, l] of P.layers.entries()) {
    const vmin = Math.min(...[0, 0.5, 1].map((t) => { const x = (l.r0 + t * (l.r1 - l.r0)) / P.R; const s = l.vs(x); return s > 0 ? s : l.vp(x); }));
    const lam = vmin / fmax; // km
    const depthTop = P.R - l.r1;
    const h = Math.min(0.6 * lam, P.R / 25, depthTop < 0.12 * P.R ? P.R / 60 : Infinity);
    const n = Math.max(1, Math.ceil((l.r1 - l.r0) / h));
    for (let e = 0; e < n; e++) els.push({ layer: li, r0: l.r0 + (l.r1 - l.r0) * e / n, r1: l.r0 + (l.r1 - l.r0) * (e + 1) / n });
  }
  return els;
}

// Material at the element's quadrature points (cached per mesh)
function materials(P, els) {
  const gcache = new Map();
  const gAt = (r) => { const k = r.toFixed(6); if (!gcache.has(k)) gcache.set(k, gravityAt(P, r) / 1000); return gcache.get(k); };
  return els.map((e) => {
    const L = P.layers[e.layer], h = (e.r1 - e.r0) / 2, c = (e.r1 + e.r0) / 2;
    return QUAD.x.map((t, q) => {
      const r = c + h * t, x = r / P.R, rho = L.rho(x), vp = L.vp(x), vs = L.vs(x);
      const mu = rho * vs * vs, kappa = rho * vp * vp - (4 / 3) * mu;
      return { r, w: QUAD.w[q] * h * r * r, rho, mu, kappa, g: gAt(r), qmu: L.qmu, qkappa: L.qkappa, fluid: vs === 0, jac: 1 / h, B: BASIS[q] };
    });
  });
}

const dense = (n) => new Float64Array(n * n);

// Cholesky solve of SPD A (n×n) for many right-hand sides B (n×m, row-major); returns X
function cholSolve(A, n, B, m) {
  const L = Float64Array.from(A);
  for (let j = 0; j < n; j++) {
    let s = L[j * n + j];
    for (let k = 0; k < j; k++) s -= L[j * n + k] ** 2;
    if (!(s > 0)) throw new Error('not positive definite');
    const d = Math.sqrt(s); L[j * n + j] = d;
    for (let i = j + 1; i < n; i++) {
      let t = L[i * n + j];
      for (let k = 0; k < j; k++) t -= L[i * n + k] * L[j * n + k];
      L[i * n + j] = t / d;
    }
  }
  const X = Float64Array.from(B);
  for (let c = 0; c < m; c++) {
    for (let i = 0; i < n; i++) { let s = X[i * m + c]; for (let k = 0; k < i; k++) s -= L[i * n + k] * X[k * m + c]; X[i * m + c] = s / L[i * n + i]; }
    for (let i = n - 1; i >= 0; i--) { let s = X[i * m + c]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * X[k * m + c]; X[i * m + c] = s / L[i * n + i]; }
  }
  return X;
}

// Degrees of freedom: U and P continuous everywhere, V continuous except where a fluid meets a
// solid (it slips). Constrained at the centre: U, V (and P for l ≥ 1) vanish there.
function numberSpheroidal(P, els, l) {
  const np = P_ORDER;
  let nS = 0, nP = 0;
  const map = [];
  let lastU = -1, lastV = -1, lastP = -1;
  for (const [ei, e] of els.entries()) {
    const fluid = P.layers[e.layer].vs((e.r0 + e.r1) / 2 / P.R) === 0;
    const prevFluid = ei > 0 ? P.layers[els[ei - 1].layer].vs((els[ei - 1].r0 + els[ei - 1].r1) / 2 / P.R) === 0 : fluid;
    const U = [], V = [], Pp = [];
    for (let i = 0; i <= np; i++) {
      const atCentre = ei === 0 && i === 0;
      if (i === 0 && ei > 0) { U.push(lastU); Pp.push(lastP); V.push(fluid !== prevFluid || l === 0 ? (l === 0 ? -1 : nS++) : lastV); continue; }
      U.push(atCentre ? -1 : nS++);
      V.push(atCentre || l === 0 ? -1 : nS++);
      Pp.push(atCentre && l >= 1 ? -1 : nP++);
    }
    lastU = U[np]; lastV = V[np]; lastP = Pp[np];
    map.push({ U, V, P: Pp });
  }
  return { map, nS, nP };
}

export function spheroidal(P, l, opts = {}) {
  const fmax = opts.fmax ?? 0.01;
  const els = opts.els ?? mesh(P, fmax), mat = opts.mat ?? materials(P, els);
  const k = Math.sqrt(l * (l + 1)), k2 = l * (l + 1);
  const { map, nS, nP } = numberSpheroidal(P, els, l);
  const K = dense(nS), M = dense(nS), C = new Float64Array(nS * nP), A = dense(nP);
  const nb = P_ORDER + 1;
  for (const [ei, e] of els.entries()) {
    const m = map[ei];
    for (const q of mat[ei]) {
      const { r, w, rho, mu, kappa, g, jac, B } = q;
      // each local function's contribution to the linear functionals of the energy
      // rows: [D, e1, e2, V/r, U, V] for U and V functions; [P', P/r] for P functions
      const sF = [];
      for (let i = 0; i < nb; i++) {
        const N = B.N[i], dN = B.dN[i] * jac;
        if (m.U[i] >= 0) sF.push({ g: m.U[i], D: dN + 2 * N / r, e1: 2 * dN - 2 * N / r, e2: k * N / r, vr: 0, u: N, v: 0 });
        if (m.V[i] >= 0) sF.push({ g: m.V[i], D: -k * N / r, e1: k * N / r, e2: dN - N / r, vr: N / r, u: 0, v: N });
      }
      for (const a of sF) for (const b of sF) {
        const kab = kappa * a.D * b.D + (mu / 3) * a.e1 * b.e1 + mu * a.e2 * b.e2 + (k2 - 2) * mu * a.vr * b.vr
          + FOUR_PI_G * rho * rho * a.u * b.u - 4 * rho * g * a.u * b.u / r + k * rho * g * (a.u * b.v + a.v * b.u) / r;
        K[a.g * nS + b.g] += w * kab;
        M[a.g * nS + b.g] += w * rho * (a.u * b.u + a.v * b.v);
      }
      for (let j = 0; j < nb; j++) {
        const pj = m.P[j];
        if (pj < 0) continue;
        const N = B.N[j], dN = B.dN[j] * jac;
        for (const a of sF) C[a.g * nP + pj] += w * rho * (a.u * dN + k * a.v * N / r);
        for (let i = 0; i < nb; i++) {
          const pi = m.P[i];
          if (pi < 0) continue;
          const Ni = B.N[i], dNi = B.dN[i] * jac;
          A[pi * nP + pj] += w * (dNi * dN + k2 * Ni * N / (r * r)) / FOUR_PI_G;
        }
      }
    }
  }
  // the exterior's field, P(R)(R/r)^(l+1): (l+1) R P(R)² / 4πG
  const pTop = map[els.length - 1].P[P_ORDER];
  A[pTop * nP + pTop] += (l + 1) * P.R / FOUR_PI_G;
  // eliminate P: K − C A⁻¹ Cᵀ
  const Ct = new Float64Array(nP * nS);
  for (let i = 0; i < nS; i++) for (let j = 0; j < nP; j++) Ct[j * nS + i] = C[i * nP + j];
  const X = cholSolve(A, nP, Ct, nS); // A⁻¹ Cᵀ  (nP × nS)
  for (let i = 0; i < nS; i++) for (let j = 0; j < nS; j++) {
    let s = 0;
    for (let p = 0; p < nP; p++) s += C[i * nP + p] * X[p * nS + j];
    K[i * nS + j] -= s;
  }
  for (let i = 0; i < nS; i++) for (let j = 0; j < i; j++) { const s = 0.5 * (K[i * nS + j] + K[j * nS + i]); K[i * nS + j] = K[j * nS + i] = s; }
  const { lambda, X: vec } = genEig(K, M, nS);
  return { type: 'S', l, k, els, mat, map, nS, nP, lambda, vec, Xp: X };
}

export function toroidal(P, l, opts = {}) {
  const fmax = opts.fmax ?? 0.01;
  const all = opts.els ?? mesh(P, fmax), allMat = opts.mat ?? materials(P, all);
  // the solid shell above the outermost fluid
  let first = 0;
  for (let i = all.length - 1; i >= 0; i--) if (P.layers[all[i].layer].vs((all[i].r0 + all[i].r1) / 2 / P.R) === 0) { first = i + 1; break; }
  const els = all.slice(first), mat = allMat.slice(first);
  const k2 = l * (l + 1);
  const map = []; let n = 0, last = -1;
  for (const [ei] of els.entries()) {
    const W = [];
    for (let i = 0; i <= P_ORDER; i++) {
      if (i === 0 && ei > 0) { W.push(last); continue; }
      W.push(first === 0 && ei === 0 && i === 0 ? -1 : n++);
    }
    last = W[P_ORDER];
    map.push({ W });
  }
  const K = dense(n), M = dense(n);
  for (const [ei] of els.entries()) for (const q of mat[ei]) {
    const { r, w, rho, mu, jac, B } = q;
    for (let i = 0; i <= P_ORDER; i++) {
      const gi = map[ei].W[i]; if (gi < 0) continue;
      const Ni = B.N[i], ai = B.dN[i] * jac - Ni / r;
      for (let j = 0; j <= P_ORDER; j++) {
        const gj = map[ei].W[j]; if (gj < 0) continue;
        const Nj = B.N[j], aj = B.dN[j] * jac - Nj / r;
        K[gi * n + gj] += w * mu * (ai * aj + (k2 - 2) * Ni * Nj / (r * r));
        M[gi * n + gj] += w * rho * Ni * Nj;
      }
    }
  }
  const { lambda, X: vec } = genEig(K, M, n);
  return { type: 'T', l, k: Math.sqrt(k2), els, mat, map, nS: n, lambda, vec };
}

// One mode's eigenfunctions at radius r: spheroidal { U, dU, V, dV, P }, toroidal { W, dW }
export function evalMode(sol, c, r) {
  const { els, map, vec, nS } = sol;
  let ei = els.findIndex((e) => r >= e.r0 && r <= e.r1);
  if (ei < 0) ei = r < els[0].r0 ? 0 : els.length - 1;
  const e = els[ei], h = (e.r1 - e.r0) / 2, t = (r - (e.r0 + e.r1) / 2) / h;
  const { N, dN } = lagrange(XI, Math.max(-1, Math.min(1, t)));
  const val = (idx) => { let v = 0, d = 0; for (let i = 0; i <= P_ORDER; i++) { const gi = idx[i]; if (gi < 0) continue; const x = vec[gi * nS + c]; v += N[i] * x; d += dN[i] * x / h; } return [v, d]; };
  if (sol.type === 'T') { const [W, dW] = val(map[ei].W); return { W, dW }; }
  const [U, dU] = val(map[ei].U), [V, dV] = val(map[ei].V);
  // P = −A⁻¹Cᵀ s
  let Pv = 0;
  for (let i = 0; i <= P_ORDER; i++) {
    const pi = map[ei].P[i]; if (pi < 0) continue;
    let s = 0; for (let j = 0; j < nS; j++) s += sol.Xp[pi * nS + j] * vec[j * nS + c];
    Pv -= N[i] * s;
  }
  return { U, dU, V, dV, P: Pv };
}

// Q, the spin splitting χ, and how much of the motion is tangential in a fluid (a spurious mode's
// mark: the fluid's zero-frequency family)
export function modeProperties(sol, c) {
  const { els, mat, map, vec, nS, k, type } = sol;
  const k2 = k * k, omega2 = sol.lambda[c];
  let Ek = 0, Em = 0, T = 0, chiNum = 0, fluidTan = 0;
  for (const [ei] of els.entries()) for (const q of mat[ei]) {
    const { r, w, rho, mu, kappa, jac, B, qmu, qkappa, fluid } = q;
    const get = (idx) => { let v = 0, d = 0; for (let i = 0; i <= P_ORDER; i++) { const gi = idx[i]; if (gi < 0) continue; const x = vec[gi * nS + c]; v += B.N[i] * x; d += B.dN[i] * jac * x; } return [v, d]; };
    if (type === 'T') {
      const [W, dW] = get(map[ei].W);
      Em += w * mu * ((dW - W / r) ** 2 + (k2 - 2) * W * W / (r * r)) / qmu;
      T += w * rho * W * W;
      continue;
    }
    const [U, dU] = get(map[ei].U), [V, dV] = get(map[ei].V);
    const F = 2 * U - k * V, D = dU + F / r;
    if (kappa > 0) Ek += w * kappa * D * D / qkappa;
    if (mu > 0) Em += w * mu * ((2 * dU - F / r) ** 2 / 3 + (dV - V / r + k * U / r) ** 2 + (k2 - 2) * V * V / (r * r)) / qmu;
    T += w * rho * (U * U + V * V);
    if (k > 0) chiNum += w * rho * (2 * U * V / k + V * V / k2);
    if (fluid) fluidTan += w * rho * V * V;
  }
  const invQ = (Ek + Em) / (omega2 * T);
  return { Q: 1 / invQ, chi: type === 'T' ? 1 / k2 : chiNum / T, fluidTan: fluidTan / T };
}

// Every mode of a planet below fmax (Hz) up to degree lmax.
export function solvePlanet(P, { fmax = 0.004, fmin = 1e-4, lmax = 40, types = "ST", log = false, meshF = 1.6 } = {}) {
  const els = mesh(P, fmax * meshF), mat = materials(P, els);
  const out = [];
  for (const type of types) {
    for (let l = type === 'T' ? 1 : 0; l <= lmax; l++) {
      const sol = type === 'S' ? spheroidal(P, l, { els, mat }) : toroidal(P, l, { els, mat });
      // n counts every mode of the degree, the trivial ones too: 0S1 (the planet moving whole) and
      // 0T1 (turning whole), at zero frequency, and modes below fmin (the Earth's Slichter mode 1S1)
      let n = l === 1 ? 1 : 0, any = false;
      for (let c = 0; c < sol.lambda.length; c++) {
        const w2 = sol.lambda[c];
        if (!(w2 > 0)) continue;
        const f0 = Math.sqrt(w2) / (2 * Math.PI);
        if (f0 < 1e-5) continue; // the trivial motions, numerically just off zero
        if (f0 > fmax * 1.05) break;
        const pr = modeProperties(sol, c);
        if (pr.fluidTan > 0.5) continue; // a fluid's spurious, near-geostrophic motion
        if (f0 < fmin) { n++; continue; }
        // physical dispersion: from the model's reference frequency to the mode's
        const f = f0 * (1 + Math.log(f0 / P.fref) / (Math.PI * pr.Q));
        if (f <= fmax) out.push({ type, n, l, f, f0, Q: pr.Q, chi: pr.chi, fluidTan: pr.fluidTan, sol, c });
        n++; any = true;
      }
      if (log) console.error(type, l, n);
      if (!any && l > 2) break;
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const P = PLANETS.find((p) => p.id === (process.argv[2] ?? 'earth'));
  const l = +(process.argv[3] ?? 2), type = process.argv[4] ?? 'S';
  const els = mesh(P, 0.0064), mat = materials(P, els);
  console.log(`${els.length} elements`);
  const t0 = Date.now();
  const sol = type === 'S' ? spheroidal(P, l, { els, mat }) : toroidal(P, l, { els, mat });
  console.log(`${sol.nS} dof, ${Date.now() - t0} ms`);
  let shown = 0;
  for (let c = 0; c < sol.lambda.length && shown < 12; c++) {
    const w2 = sol.lambda[c];
    const f = w2 > 0 ? Math.sqrt(w2) / (2 * Math.PI) * 1000 : -Math.sqrt(-w2) / (2 * Math.PI) * 1000;
    if (Math.abs(f) < 0.05) continue;
    const pr = modeProperties(sol, c);
    const fd = f * (1 + Math.log(f / 1000 / P.fref) / (Math.PI * pr.Q));
    console.log(`f ${f.toFixed(5)} mHz  dispersed ${fd.toFixed(5)}  Q ${pr.Q.toFixed(0)}  χ ${pr.chi.toFixed(4)}  fluidTan ${pr.fluidTan.toFixed(3)}`);
    shown++;
  }
}
