// qnm.js — quasinormal modes of Kerr black holes by Leaver's method.
//
// Gravitational perturbations (spin weight s = −2) of a Kerr hole separate
// (Teukolsky) into an angular and a radial ODE that share two unknowns: the
// complex frequency ω and the spheroidal separation constant A. Leaver (1985)
// expanded each solution in a series whose coefficients obey a three-term
// recurrence α_k a_{k+1} + β_k a_k + γ_k a_{k−1} = 0. A solution with the
// right boundary conditions (regular on the axis; ingoing at the horizon,
// outgoing at infinity) exists only when the corresponding continued fraction
// vanishes:
//
//     0 = β_n − α_{n−1}γ_n/(β_{n−1} − …β_0) − α_n γ_{n+1}/(β_{n+1} − α_{n+1}γ_{n+2}/(β_{n+2} − …))
//
// The n-th "inversion" is the numerically stable form for the n-th overtone.
// We solve both conditions together: for each trial ω, find A(aω) from the
// angular fraction, then step ω on the radial fraction (secant). Modes are
// tracked from their Schwarzschild values up in spin.
//
// Internally Leaver's units 2M = 1; the interface uses M = 1 (G = c = 1):
// a ∈ [0, 1), and Mω.

// ---- complex arithmetic on {re, im} ----------------------------------------
const cx = (re, im = 0) => ({ re, im });
const add = (a, b) => cx(a.re + b.re, a.im + b.im);
const sub = (a, b) => cx(a.re - b.re, a.im - b.im);
const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const scl = (a, k) => cx(a.re * k, a.im * k);
const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const abs = (a) => Math.hypot(a.re, a.im);
const I = cx(0, 1);
export const C = { cx, add, sub, mul, div, scl, abs };

// ---- angular (spin-weighted spheroidal) continued fraction ------------------
function angularResidual(A, c, l, m, s, N) {
  const k1 = Math.abs(m - s) / 2, k2 = Math.abs(m + s) / 2;
  const lmin = Math.max(Math.abs(m), Math.abs(s)), ni = l - lmin;
  const alpha = (n) => cx(-2 * (n + 1) * (n + 2 * k1 + 1));
  const beta = (n) => {
    // n(n−1) + 2n(k1+k2+1−2c) − [2c(2k1+s+1) − (k1+k2)(k1+k2+1)] − [c² + s(s+1) + A]
    let r = cx(n * (n - 1) + 2 * n * (k1 + k2 + 1) + (k1 + k2) * (k1 + k2 + 1) - s * (s + 1));
    r = sub(r, scl(c, 4 * n + 2 * (2 * k1 + s + 1)));
    r = sub(r, mul(c, c));
    return sub(r, A);
  };
  const gamma = (n) => scl(c, 2 * (n + k1 + k2 + s));
  let h = beta(0);
  for (let k = 1; k <= ni; k++) h = sub(beta(k), div(mul(alpha(k - 1), gamma(k)), h));
  let t = beta(N);
  for (let k = N - 1; k > ni; k--) t = sub(beta(k), div(mul(alpha(k), gamma(k + 1)), t));
  return sub(h, div(mul(alpha(ni), gamma(ni + 1)), t));
}

// complex secant on f(z) = 0
function secant(f, z0, z1, tol = 1e-13, maxIt = 80) {
  let f0 = f(z0), f1 = f(z1);
  for (let it = 0; it < maxIt; it++) {
    const df = sub(f1, f0);
    if (abs(df) === 0) break;
    const z2 = sub(z1, div(mul(f1, sub(z1, z0)), df));
    z0 = z1; f0 = f1; z1 = z2; f1 = f(z1);
    if (abs(sub(z1, z0)) < tol * Math.max(1, abs(z1))) return { z: z1, ok: true, it };
  }
  return { z: z1, ok: abs(f1) < 1e-8, it: maxIt };
}

export function separationConstant(c, l, m, s = -2, Aguess = null, N = 300) {
  const A0 = Aguess ?? cx(l * (l + 1) - s * (s + 1));
  const r = secant((A) => angularResidual(A, c, l, m, s, N), A0, add(A0, cx(1e-3, 1e-3)));
  return r.z;
}

// ---- radial continued fraction (Leaver 1985, 2M = 1) ----------------------
function radialResidual(w, A, a, m, s, ni, N) {
  const b = Math.sqrt(1 - 4 * a * a);
  const cp = cx(w.re / 2 - a * m, w.im / 2);                 // ω/2 − a m
  const iw = mul(I, w), w2 = mul(w, w);
  const cpb = scl(mul(I, cp), 2 / b);                        // (2i/b)(ω/2 − am)
  const k4 = div(mul(add(scl(w, 4), cx(0, 2)), cp), cx(b));  // ((4ω + 2i)/b)(ω/2 − am)
  const D0 = sub(sub(cx(1 - s), iw), cpb);
  const D1 = add(add(cx(-4), scl(iw, 2 * (2 + b))), scl(cpb, 2));
  const D2 = sub(sub(cx(s + 3), scl(iw, 3)), cpb);
  let D3 = sub(scl(w2, 4 + 2 * b - a * a), scl(w, 2 * a * m));
  D3 = add(add(sub(D3, cx(s + 1)), scl(iw, 2 + b)), sub(k4, A));
  const D4 = sub(sub(sub(cx(s + 1), scl(w2, 2)), scl(iw, 2 * s + 3)), k4);
  const alpha = (n) => add(cx(n * n + n), scl(D0, n + 1));
  const beta = (n) => add(cx(-2 * n * n + 2 * n), add(scl(D1, n), D3));
  const gamma = (n) => add(cx(n * n - 3 * n + 2), add(scl(D2, n - 1), D4));
  let h = beta(0);
  for (let k = 1; k <= ni; k++) h = sub(beta(k), div(mul(alpha(k - 1), gamma(k)), h));
  let t = beta(N);
  for (let k = N - 1; k > ni; k--) t = sub(beta(k), div(mul(alpha(k), gamma(k + 1)), t));
  return sub(h, div(mul(alpha(ni), gamma(ni + 1)), t));
}

// Schwarzschild seeds, Mω for s = −2 (Leaver 1985; Berti, Cardoso & Starinets 2009)
export const SCHWARZSCHILD = {
  2: [cx(0.373672, -0.088962), cx(0.346711, -0.273915), cx(0.301053, -0.478277), cx(0.251505, -0.705148)],
  3: [cx(0.599443, -0.092703), cx(0.582644, -0.281298), cx(0.551685, -0.479093), cx(0.511962, -0.690337)],
  4: [cx(0.809178, -0.094164), cx(0.796632, -0.284334), cx(0.772710, -0.479908), cx(0.739837, -0.683924)],
};

// One QNM at spin a (M = 1). Returns Mω, A and convergence info.
export function solveQNM({ l, m, n, a, guess, Aguess = null, s = -2, N = null }) {
  const aL = a / 2;
  // The radial fraction converges more slowly as a → 1, slowest for the
  // counter-rotating overtones: (2,−2,2) at a = 1 − 10⁻⁶ needs ~10⁵ terms.
  const depth = N ?? Math.round(400 + 150 / Math.sqrt(Math.max(1e-7, 1 - a)));
  let A = Aguess;
  const f = (wL) => {
    A = separationConstant(cx(aL * wL.re, aL * wL.im), l, m, s, A);
    return radialResidual(wL, A, aL, m, s, n, depth);
  };
  const w0 = scl(guess, 2);
  const r = secant(f, w0, mul(w0, cx(1 + 1e-5, 1e-5)), 1e-12, 100);
  const w = scl(r.z, 0.5);
  A = separationConstant(cx(aL * r.z.re, aL * r.z.im), l, m, s, A);
  return { omega: w, A, ok: r.ok, it: r.it, depth };
}

// Track (l, m, n) from a = 0 along an increasing list of spins. Near
// extremality overtones crowd together, so a step whose solution lands far from
// its linear extrapolation is suspected of hopping branches: the step is halved
// (in log(1 − a)) and retried.
export function trackQNM(l, m, n, spins, opts = {}) {
  const out = [];
  let prev = null, prev2 = null;
  const step = (a, depth, keep) => {
    let guess;
    if (!prev) guess = SCHWARZSCHILD[l][n];
    else if (!prev2) guess = prev.omega;
    else guess = add(prev.omega, scl(sub(prev.omega, prev2.omega), (a - prev.a) / (prev.a - prev2.a)));
    const r = solveQNM({ l, m, n, a, guess, Aguess: prev ? prev.A : null, ...opts });
    if (prev2 && depth < 12) {
      const moved = abs(sub(prev.omega, prev2.omega)) * Math.abs((a - prev.a) / (prev.a - prev2.a));
      if (!r.ok || abs(sub(r.omega, guess)) > 0.5 * moved + 1e-7) {
        const mid = 1 - Math.sqrt((1 - prev.a) * (1 - a));
        step(mid > prev.a && mid < a ? mid : 0.5 * (prev.a + a), depth + 1, false);
        step(a, depth + 1, keep);
        return;
      }
    }
    const pt = { a, omega: r.omega, A: r.A, ok: r.ok };
    if (keep) out.push(pt);
    prev2 = prev; prev = pt;
  };
  for (const a of spins) step(a, 0, true);
  return out;
}
