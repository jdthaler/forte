// plate.js — the circular plate: Bessel functions, linear modes, and the
// von Kármán coupling integrals. Pure functions, used by the table generator
// (tools/gongs-modes.mjs) and the tests. Lengths are in units of the radius a.
//
// Transverse modes (Kirchhoff plate, ∇⁴Φ = λ⁴Φ):
//   Φ_ms(r, θ) = [J_m(λr) + C·I_m(λr)] cos mθ / norm,   ∫_disc Φ² dA = 1
// with the free-edge (M_r = V_r = 0) or clamped (Φ = Φ' = 0) conditions at r = 1.
// Only the cos mθ family is kept: a strike on the line θ = 0 never excites the
// sin mθ companions of a perfectly round plate (mirror symmetry), and the
// coupling cannot create them, so they stay at rest.
//
// In-plane (Airy stress function) modes: the edge is free in-plane (a hanging
// gong), so N_rr = N_rθ = 0 ⇔ F = ∂F/∂r = 0. The eigenfunctions of ∇⁴Ψ = ζ⁴Ψ
// under those conditions are the clamped-plate modes (Touzé, Thomas & Chaigne
// 2002), and with them ∫ Φ_k L(Φ_p, Ψ) = ∫ Ψ L(Φ_p, Φ_k) for any Φ, which is
// what makes the modal system conservative.

const TAU = 2 * Math.PI;

// Bessel functions J_m(x), I_m(x) for integer m ≥ 0, and their derivatives,
// computed together via J_{m±1} and I_{m±1}: J' = (J_{m−1} − J_{m+1})/2,
// I' = (I_{m−1} + I_{m+1})/2. Power series where they are accurate to relative
// precision (I always; J while x < max(12, m)); otherwise J from its periodic
// integral representation (1/2π)∫cos(mτ − x sin τ)dτ, where the trapezoidal
// rule converges exponentially once the node count exceeds x + m.
const BJ = new Float64Array(4);
function series(n, x, sign) { // Σ_k (±1)^k (x/2)^{2k+|n|} / (k! (k+|n|)!), n may be −1
  const m = Math.abs(n), h = x / 2, h2 = h * h;
  let t = 1;
  for (let i = 1; i <= m; i++) t *= h / i;
  let s = t;
  for (let k = 1; k < 400; k++) { t *= (sign * h2) / (k * (k + m)); s += t; if (Math.abs(t) < 1e-17 * Math.abs(s)) break; }
  return n < 0 && m % 2 && sign < 0 ? -s : s;
}
function bessel4(m, x) {
  let jm, jp;
  if (x < Math.max(12, m)) { BJ[0] = series(m, x, -1); jm = series(m - 1, x, -1); jp = series(m + 1, x, -1); }
  else {
    const N = 2 * Math.ceil((x + m + 40) / 2);
    let j0 = 0, a = 0, b = 0;
    for (let k = 0; k < N; k++) {
      const t = (TAU * k) / N, ct = Math.cos(t), st = Math.sin(t), A = m * t - x * st, c = Math.cos(A), s = Math.sin(A);
      j0 += c; a += c * ct + s * st; b += c * ct - s * st;
    }
    BJ[0] = j0 / N; jm = a / N; jp = b / N;
  }
  BJ[1] = 0.5 * (jm - jp);
  BJ[2] = series(m, x, 1); BJ[3] = 0.5 * (series(m - 1, x, 1) + series(m + 1, x, 1));
  return BJ;
}
export const besselJ = (m, x) => bessel4(m, x)[0];
export const besselI = (m, x) => bessel4(m, x)[2];
const J = (m, x) => bessel4(m, x)[0];
const Jp = (m, x) => bessel4(m, x)[1];
const I = (m, x) => bessel4(m, x)[2];
const Ip = (m, x) => bessel4(m, x)[3];

// Free edge, W = A J_m(λr) + B I_m(λr) (derivation in README):
//   M_r ∝ W'' + ν(W' − m²W)         = 0
//   V_r ∝ (∇²W)' − (1−ν) m² (W' − W) = 0      at r = 1
function freeRows(m, l, nu) {
  const [j, jp, i, ip] = bessel4(m, l), m2 = m * m, c = 1 - nu;
  return [
    [-l * l * j - c * (l * jp - m2 * j), l * l * i - c * (l * ip - m2 * i)],
    [-l * l * l * jp - c * m2 * (l * jp - j), l * l * l * ip - c * m2 * (l * ip - i)],
  ];
}
export function freeChar(m, l, nu) { const [[a, b], [c, d]] = freeRows(m, l, nu), s = I(m, l); return (a * d - b * c) / (s * s); }
export function clampedChar(m, l) { const [j, jp, i, ip] = bessel4(m, l); return (j * ip) / i - jp; }

function roots(f, lo, hi, step) {
  const out = [];
  let a = lo, fa = f(a);
  for (let b = lo + step; b <= hi + 1e-12; b += step) {
    const fb = f(b);
    if (fa === 0) out.push(a);
    else if (fa * fb < 0) {
      let x0 = a, x1 = b, f0 = fa;
      for (let it = 0; it < 80 && x1 - x0 > 1e-13; it++) {
        const xm = 0.5 * (x0 + x1), fm = f(xm);
        if (f0 * fm <= 0) x1 = xm; else { x0 = xm; f0 = fm; }
      }
      out.push(0.5 * (x0 + x1));
    }
    a = b; fa = fb;
  }
  return out;
}

// Gauss–Legendre nodes and weights on [0, 1].
export function gaussLegendre(n) {
  const x = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5)), dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1, p1 = z;
      for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      dp = (n * (z * p1 - p0)) / (z * z - 1);
      const dz = p1 / dp; z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    x[i] = 0.5 * (1 - z); w[i] = 1 / ((1 - z * z) * dp * dp);
  }
  return { x, w };
}

const thetaNorm = (m) => (m === 0 ? TAU : Math.PI); // ∫ cos² mθ dθ

// Modes with λ² ≤ lam2Max, sorted by frequency. bc: 'free' | 'clamped'.
// Free plates also have rigid-body modes (λ = 0, m = 0 and 1): they carry no
// curvature, do not couple, barely radiate, and are left out.
export function plateModes(bc, { nu = 0.3, lam2Max = 200, mMax = 40 } = {}) {
  const modes = [], lmax = Math.sqrt(lam2Max) + 1e-9;
  const g = gaussLegendre(160);
  for (let m = 0; m <= mMax; m++) {
    const f = bc === 'free' ? (l) => freeChar(m, l, nu) : (l) => clampedChar(m, l);
    const ls = roots(f, 0.4, lmax, 0.02);
    if (!ls.length) { if (m > 2) break; continue; }
    ls.forEach((l, s) => {
      let C;
      if (bc === 'free') { const [[a, b]] = freeRows(m, l, nu); C = -a / b; } else C = -J(m, l) / I(m, l);
      const mode = { m, s, lam: l, lam2: l * l, C, norm: 1 };
      let q = 0;
      for (let i = 0; i < g.x.length; i++) { const R = radial(mode, g.x[i]).R; q += g.w[i] * R * R * g.x[i]; }
      mode.norm = Math.sqrt(q * thetaNorm(m));
      modes.push(mode);
    });
  }
  modes.sort((a, b) => a.lam - b.lam);
  return modes;
}

// Radial function and its first two derivatives at r (normalised mode).
export function radial({ m, lam, C, norm }, r) {
  const x = lam * r;
  const [j, jp, i, ip] = bessel4(m, x);
  let jpp, ipp;
  if (x < 1e-8) { jpp = m === 0 ? -0.5 : m === 2 ? 0.25 : 0; ipp = m === 0 ? 0.5 : m === 2 ? 0.25 : 0; }
  else { jpp = -jp / x - (1 - (m * m) / (x * x)) * j; ipp = -ip / x + (1 + (m * m) / (x * x)) * i; }
  return { R: (j + C * i) / norm, R1: (lam * (jp + C * ip)) / norm, R2: (lam * lam * (jpp + C * ipp)) / norm };
}
export const modeValue = (mode, r, th = 0) => radial(mode, r).R * Math.cos(mode.m * th);

// ∫₀^{2π} cos jθ cos pθ cos qθ dθ  and  ∫ cos jθ sin pθ sin qθ dθ.
const c2 = (j, k) => (j !== k ? 0 : j === 0 ? TAU : Math.PI);
export const triCC = (j, p, q) => 0.5 * (c2(j, Math.abs(p - q)) + c2(j, p + q));
export const triSS = (j, p, q) => 0.5 * (c2(j, Math.abs(p - q)) - c2(j, p + q));

// The von Kármán coupling. For each in-plane mode n and transverse modes p ≤ q
// allowed by the angular selection rule (j_n = m_p + m_q or |m_p − m_q|):
//   H[n][p][q] = ∫ Ψ_n L(Φ_p, Φ_q) dA
// with L(f, g) = f_rr (g_r/r + g_θθ/r²) + g_rr (f_r/r + f_θθ/r²) − 2 (f_rθ/r − f_θ/r²)(g_rθ/r − g_θ/r²),
// and, per unit curvature κ = a²/(R h) of a spherical cap w₀ = κ r²/2 (L(Φ, w₀) = κ ∇²Φ):
//   E[n][p] = ∫ Ψ_n ∇²Φ_p dA.
// ∫_disc f L(g, h) dA for any three modes of the form R(r) cos mθ (used both ways round by the tests).
function tabulate(list, g) {
  const nr = g.x.length;
  return list.map((md) => {
    const R = new Float64Array(nr), R1 = new Float64Array(nr), R2 = new Float64Array(nr);
    for (let i = 0; i < nr; i++) { const v = radial(md, g.x[i]); R[i] = v.R; R1[i] = v.R1; R2[i] = v.R2; }
    return { R, R1, R2 };
  });
}
function bracket(g, F, mf, P, mp, Q, mq) {
  const cc = triCC(mf, mp, mq), ss = triSS(mf, mp, mq);
  let v = 0;
  for (let i = 0; i < g.x.length; i++) {
    const r = g.x[i], ir = 1 / r, ir2 = ir * ir;
    const a = P.R2[i] * (Q.R1[i] * ir - mq * mq * Q.R[i] * ir2) + Q.R2[i] * (P.R1[i] * ir - mp * mp * P.R[i] * ir2);
    const b = -2 * mp * mq * (P.R1[i] * ir - P.R[i] * ir2) * (Q.R1[i] * ir - Q.R[i] * ir2);
    v += g.w[i] * r * F.R[i] * (a * cc + b * ss);
  }
  return v;
}
export function tripleL(f, p, q, quad = 200) {
  const g = gaussLegendre(quad), [F, P, Q] = tabulate([f, p, q], g);
  return bracket(g, F, f.m, P, p.m, Q, q.m);
}

export function couplings(modes, inplane, { quad = 200, tol = 0 } = {}) {
  const g = gaussLegendre(quad), nr = g.x.length;
  const T = tabulate(modes, g), S = tabulate(inplane, g);
  const H = [], E = [];
  inplane.forEach((psi, n) => {
    const s = S[n].R, jn = psi.m;
    modes.forEach((fp, p) => {
      if (fp.m !== jn) return;
      let v = 0;
      for (let i = 0; i < nr; i++) {
        const r = g.x[i], P = T[p];
        v += g.w[i] * r * s[i] * (P.R2[i] + P.R1[i] / r - (fp.m * fp.m * P.R[i]) / (r * r));
      }
      E.push({ n, p, v: v * c2(jn, fp.m) });
    });
    for (let p = 0; p < modes.length; p++) for (let q = p; q < modes.length; q++) {
      const mp = modes[p].m, mq = modes[q].m;
      if (jn !== mp + mq && jn !== Math.abs(mp - mq)) continue;
      const v = bracket(g, S[n], jn, T[p], mp, T[q], mq);
      if (Math.abs(v) > tol) H.push({ n, p, q, v });
    }
  });
  return { H, E };
}
