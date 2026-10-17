// quantum-waves.js — eigenfunctions of each well on a display grid, for the
// views (no audio, no DOM; the tests import it too). Same units and the same sign
// convention as quantum-model.js: every eigenfunction is positive in its first
// lobe on the inner side, which is what makes all x_mn ≤ 0.
//
//   box       φₙ = √2 sin nπx                       (closed form)
//   harmonic  Hermite functions by their recurrence  (closed form)
//   morse, bouncer, hydrogen: Numerov integration at the exact Eₙ, inward from
//             both classically forbidden sides, matched by least squares in the
//             middle and normalised. Hydrogen is integrated in s = √r, where the
//             radial wave has a nearly uniform wavelength (Liouville transform:
//             u(r) = √(2s) w(s), w″ = [((2l+1)² − ¼)/s² − 8 − 8Es²] w).

import { HYDROGEN_L, morseKappa } from './quantum-model.js';

const PI = Math.PI;

// Numerov for φ″ = Q(y)φ on y = y0 + i·h, i = 0…N−1, from both ends, matched near iMatch.
// start(i) gives the two starting values at each end (default 0 and a tiny step).
function numerov(Q, y0, h, N, iMatch, startL = [0, 1e-12]) {
  const q = new Float64Array(N), L = new Float64Array(N), R = new Float64Array(N);
  for (let i = 0; i < N; i++) q[i] = 1 - (h * h * Q(y0 + i * h)) / 12;
  const step = (a, b, i1, i0, ip) => (2 * (6 - 5 * q[i1]) * b - q[i0] * a) / q[ip]; // (12 − 10q)/… form
  L[0] = startL[0]; L[1] = startL[1];
  for (let i = 1; i < iMatch + 40 && i + 1 < N; i++) {
    L[i + 1] = step(L[i - 1], L[i], i, i - 1, i + 1);
    if (Math.abs(L[i + 1]) > 1e150) for (let j = 0; j <= i + 1; j++) L[j] *= 1e-150;
  }
  R[N - 1] = 0; R[N - 2] = 1e-12;
  for (let i = N - 2; i > iMatch - 40 && i > 0; i--) {
    R[i - 1] = step(R[i + 1], R[i], i, i + 1, i - 1);
    if (Math.abs(R[i - 1]) > 1e150) for (let j = i - 1; j < N; j++) R[j] *= 1e-150;
  }
  let num = 0, den = 0;
  for (let i = Math.max(0, iMatch - 40); i < Math.min(N, iMatch + 40); i++) { num += L[i] * R[i]; den += R[i] * R[i]; }
  const sc = den > 0 ? num / den : 1, out = L;
  for (let i = iMatch; i < N; i++) out[i] = sc * R[i];
  return out;
}

// Sample a fine-grid function at display points (linear interpolation).
function sample(f, y0, h, ys) {
  const out = new Float64Array(ys.length);
  for (let r = 0; r < ys.length; r++) {
    const u = (ys[r] - y0) / h, i = Math.floor(u);
    out[r] = i < 0 || i + 1 >= f.length ? 0 : f[i] + (u - i) * (f[i + 1] - f[i]);
  }
  return out;
}

// The display window, the potential, and every state's φₙ at `rows` points.
//   ys: positions (natural units); V(y); phi[i] for pk.ns[i]; Erange for the plot;
//   turning(E): classical turning points; label/unit for the axis.
// solve(pk, P, rows), if given, computes the φₙ instead (the WebAssembly model's, the same
// numbers: quantum-wasm.js), and returns them as phi does, or null.
export function waveGrid(pk, P, rows, solve = null) {
  const id = pk.id, ns = pk.ns, nHi = ns[ns.length - 1], nLo = ns[0], Ehi = pk.E[pk.E.length - 1];
  const pre = solve ? solve(pk, P, rows) : null;
  const phi = pre ? [...pre] : [], ys = new Float64Array(rows);
  const span = (a, b) => { for (let r = 0; r < rows; r++) ys[r] = a + ((b - a) * (r + 0.5)) / rows; };
  const norm = (f, h, w = null) => { let s = 0; for (let i = 0; i < f.length; i++) s += f[i] * f[i] * (w ? w(i) : 1) * h; const k = 1 / Math.sqrt(s || 1); for (let i = 0; i < f.length; i++) f[i] *= k; return f; };
  const firstLobePositive = (f) => { let m = 0; for (const v of f) m = Math.max(m, Math.abs(v)); for (const v of f) if (Math.abs(v) > 0.05 * m) { if (v < 0) for (let i = 0; i < f.length; i++) f[i] = -f[i]; break; } return f; };

  if (id === 'box') {
    span(0, 1);
    if (!pre) for (const n of ns) phi.push(ys.map((y) => Math.SQRT2 * Math.sin(n * PI * y)));
    return { id, ys, phi, V: () => 0, Vmin: 0, Erange: [0, Ehi * 1.08], turning: () => [0, 1], walls: [0, 1], label: 'x / L' };
  }
  if (id === 'harmonic') {
    const X = 1.15 * Math.sqrt(2 * nHi + 1);
    span(-X, X);
    const rowsPhi = pre ? phi : ns.map(() => new Float64Array(rows));
    for (let r = 0; r < rows && !pre; r++) { // normalised Hermite functions, log-scaled recurrence, times (−1)ⁿ
      const x = ys[r];
      let a = 0, b = 1, lg = -0.5 * x * x - 0.25 * Math.log(PI); // ψ₀ = e^(lg)·b
      for (let n = 0; n <= nHi; n++) {
        if (n >= nLo) rowsPhi[n - nLo][r] = (n % 2 ? -1 : 1) * b * Math.exp(lg);
        const c = Math.sqrt(2 / (n + 1)) * x * b - Math.sqrt(n / (n + 1)) * a;
        a = b; b = c;
        const m = Math.abs(b);
        if (m > 1e100 || (m < 1e-100 && m > 0)) { const s = Math.log(m); a /= m; b /= m; lg += s; }
      }
    }
    return { id, ys, phi: rowsPhi, V: (x) => 0.5 * x * x, Vmin: 0, Erange: [0, Ehi * 1.12], turning: (E) => [-Math.sqrt(2 * E), Math.sqrt(2 * E)], label: 'x / √(ħ/mω)' };
  }
  if (id === 'morse') {
    const kap = pk.kap ?? morseKappa(pk.nbar, P.eta ?? 0.5), D = kap / 4, mu = kap / 2, V = (x) => D * (1 - Math.exp(-x)) ** 2;
    const turning = (E) => { const s = Math.sqrt(Math.min(E / D, 0.999999)); return [-Math.log(1 + s), -Math.log(1 - s)]; };
    const [a, b] = turning(Ehi), pad = 0.12 * (b - a);
    span(a - pad, b + pad);
    const kmax = Math.sqrt(2 * mu * Ehi), h = (2 * PI) / kmax / 20;
    const y0 = a - pad - 12 / Math.sqrt(2 * mu * D), y1 = b + pad + 12 / Math.sqrt(2 * mu * Math.max(D - Ehi, 1e-3)) ;
    const N = Math.min(400000, Math.ceil((Math.min(y1, b + 40) - y0) / h));
    for (let i = 0; i < ns.length && !pre; i++) {
      const E = pk.E[i], f = numerov((x) => 2 * mu * (V(x) - E), y0, h, N, Math.round(-y0 / h));
      phi.push(sample(firstLobePositive(norm(f, h)), y0, h, ys));
    }
    return { id, ys, phi, V, Vmin: 0, Erange: [0, Math.min(D, Ehi * 1.12)], turning, D, label: 'x · a (bond stretch)' };
  }
  if (id === 'bouncer') {
    const zt = Ehi, zmax = zt + 12 / Math.sqrt(1) + 4 * zt ** (-1 / 3);
    span(0, 1.12 * zt);
    const h = (2 * PI) / Math.sqrt(zt) / 24, N = Math.ceil(zmax / h) + 2;
    for (let i = 0; i < ns.length && !pre; i++) {
      const E = pk.E[i], f = numerov((z) => z - E, 0, h, N, Math.round((0.5 * E) / h));
      phi.push(sample(firstLobePositive(norm(f, h)), 0, h, ys));
    }
    return { id, ys, phi, V: (z) => z, Vmin: 0, Erange: [0, Ehi * 1.12], turning: (E) => [0, E], walls: [0], label: 'height z / ℓ' };
  }
  if (id === 'hydrogen') {
    const l = HYDROGEN_L, c2 = (2 * l + 1) ** 2 - 0.25, rOut = (n) => n * n * (1 + Math.sqrt(1 - ((l + 0.5) / n) ** 2));
    span(0, 1.08 * rOut(nHi));
    const sMax = Math.sqrt(rOut(nHi)) + 14, h = 0.11, N = Math.ceil(sMax / h) + 2;
    for (let i = 0; i < ns.length && !pre; i++) {
      const n = ns[i], E = pk.E[i];
      const Q = (s) => (s < 1e-9 ? 1e18 : c2 / (s * s) - 8 - 8 * E * s * s);
      const w = numerov(Q, 0, h, N, Math.round((0.6 * n) / h), [0, h ** (2 * l + 1.5)]);
      // u(r) = √(2s) w(s); ∫u² dr = ∫ 4s² w² ds
      norm(w, h, (j) => 4 * (j * h) ** 2);
      const u = new Float64Array(rows);
      for (let r = 0; r < rows; r++) {
        const s = Math.sqrt(ys[r]), x = s / h, j = Math.floor(x);
        u[r] = j + 1 < N ? Math.sqrt(2 * s) * (w[j] + (x - j) * (w[j + 1] - w[j])) : 0;
      }
      phi.push(firstLobePositive(u));
    }
    const Veff = (r) => -1 / r + (l * (l + 1)) / (2 * r * r);
    const E0 = pk.E[0];
    return {
      id, ys, phi, V: Veff, Vmin: 2.2 * E0, Erange: [2.2 * E0, -0.25 * E0],
      turning: (E) => { const e = Math.sqrt(1 + 2 * E * l * (l + 1)), a = -1 / (2 * E); return [a * (1 - e), a * (1 + e)]; }, walls: [0], label: 'r / a₀',
    };
  }
  throw new Error(`no waves for ${id}`);
}

// |ψ(y, t)|² on the grid, at time t (s). With pure dephasing the density matrix is
// the average over a random classical phase ξ (variance 2t/T_φ), taken on M nodes;
// that reproduces ρ_mn ∝ e^(−(m−n)²t/T_φ) exactly up to aliasing at Δn = M.
export function density(pk, G, t, Tphi = Infinity, out = new Float64Array(G.ys.length)) {
  const N = pk.ns.length, rows = G.ys.length, w = 2 * PI * pk.scale, E0 = pk.E[0];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) { const ph = -w * (pk.E[i] - E0) * t; re[i] = pk.c[i] * Math.cos(ph); im[i] = pk.c[i] * Math.sin(ph); }
  const v = Tphi < 1e6 ? (2 * Math.max(t, 0)) / Tphi : 0;
  let nodes = [[0, 1]];
  if (v > 1e-4) {
    if (v < 0.25) { const s = Math.sqrt(v); nodes = [[-1.7320508 * s, 1 / 6], [0, 2 / 3], [1.7320508 * s, 1 / 6]]; } // 3-point Gauss–Hermite
    else { const M = 16; let tot = 0; nodes = []; for (let j = 0; j < M; j++) { const x = (2 * PI * j) / M - PI; let p = 0; for (let k = -3; k <= 3; k++) p += Math.exp(-((x + 2 * PI * k) ** 2) / (2 * v)); nodes.push([x, p]); tot += p; } nodes.forEach((q) => { q[1] /= tot; }); }
  }
  out.fill(0);
  for (const [xi, p] of nodes) {
    for (let r = 0; r < rows; r++) {
      let a = 0, b = 0;
      for (let i = 0; i < N; i++) {
        const f = G.phi[i][r];
        if (xi === 0) { a += re[i] * f; b += im[i] * f; }
        else { const k = pk.ns[i] - pk.ns[0], c = Math.cos(k * xi), s = Math.sin(k * xi); a += (re[i] * c + im[i] * s) * f; b += (im[i] * c - re[i] * s) * f; }
      }
      out[r] += p * (a * a + b * b);
    }
  }
  return out;
}
