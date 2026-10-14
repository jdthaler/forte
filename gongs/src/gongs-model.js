// gongs-model.js — the gong as a nonlinear modal system: pure functions, no
// audio and no DOM, shared by the page, the engine, the tests and the renders.
//
// Every key is the same circular plate (or shallow spherical cap), scaled in
// size. In units of the radius a, the thickness h and the time
// τ = √(12) a² / (h c_p), with w̄ = w/h and κ = a²/(R h) (R = radius of
// curvature), the von Kármán shallow-shell equations are
//   ẅ + ∇⁴w = 12(1−ν²) L(w + w₀, F) + p,     ∇⁴F = −½ [L(w, w) + 2 L(w, w₀)],   w₀ = κ r²/2,
// the same for every key. Expanding w in plate modes Φ_k and F in Airy modes
// Ψ_n (see plate.js) gives, with in-plane inertia neglected,
//   ẍ_k + ω_k² x_k = −∂V/∂x_k + f_k,   V = ½ Σ_n C_n s_n²,   C_n = 3(1−ν²)/ζ_n⁴,
//   s_n = Σ_pq H^n_pq x_p x_q + 2κ Σ_p E^n_p x_p.
// V ≥ 0 is the membrane (stretching) energy. Its quadratic part is the shell's
// membrane stiffness; it is moved into the linear modes ("shell modes", found
// per curvature by diagonalising each angular block). What remains,
//   V_nl = ½ Σ_n C_n (Q_n² + 4 Q_n ℓ_n),   Q_n = xᵀ H̃^n x,   ℓ_n = Ẽ^n · x,
// is cubic (curvature: softening) plus quartic (stretching: hardening).

import TABLE from '../data/gong-modes.js';
import { symEig } from '../../shared/linalg.js';
import { keyFreq, TAU } from '../../shared/dsp.js';

export const NU = TABLE.nu;
export const NR = TABLE.nr;
export const AIR = { rho: 1.2, c: 343 };
// E (Pa), ρ (kg/m³), thermal expansion α (1/K), heat capacity c (J/kg K), thermal diffusivity D (m²/s)
export const MATERIALS = {
  bronze: { name: 'Bell bronze', E: 105e9, rho: 8700, alpha: 18e-6, cv: 380, D: 1.2e-5 },
  steel: { name: 'Steel', E: 200e9, rho: 7850, alpha: 12e-6, cv: 470, D: 1.35e-5 },
  aluminium: { name: 'Aluminium', E: 70e9, rho: 2700, alpha: 23e-6, cv: 900, D: 8.4e-5 },
};
export const plateSpeed = (mat) => Math.sqrt(mat.E / (mat.rho * (1 - NU * NU))); // c_p (m/s)

// Radial shape at r ∈ [0, 1] from its samples (Catmull–Rom).
export function interpR(R, r) {
  const u = Math.min(1, Math.max(0, r)) * (NR - 1), i = Math.min(NR - 2, Math.floor(u)), f = u - i;
  const y0 = R[Math.max(0, i - 1)], y1 = R[i], y2 = R[i + 1], y3 = i + 2 < NR ? R[i + 2] : 2 * R[i + 1] - R[i];
  const z0 = i === 0 ? 2 * y1 - y2 : y0;
  return y1 + 0.5 * f * (y2 - z0 + f * (2 * z0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - z0)));
}

// Free plates: m = 0, 1 modes have one more nodal circle than their index s.
export const modeLabel = (bc, m, s) => `(${m},${s + (bc === 'free' && m < 2 ? 1 : 0)})`;

// ---- shell modes and the pruned coupling tensor ----------------------------------------------
// The table's couplings grouped by (in-plane mode, angular block pair), with each
// plate mode's position inside its block (blocks list plate modes in table order).
const groupCache = new Map();
function groupsOf(bc) {
  if (groupCache.has(bc)) return groupCache.get(bc);
  const T = TABLE[bc], pos = [], count = new Map();
  T.modes.forEach((md) => { const c = count.get(md.m) || 0; pos.push(c); count.set(md.m, c + 1); });
  const map = new Map();
  for (let e = 0; e < T.H.n.length; e++) {
    let p = T.H.p[e], q = T.H.q[e];
    if (T.modes[p].m > T.modes[q].m) [p, q] = [q, p];
    const n = T.H.n[e], mp = T.modes[p].m, mq = T.modes[q].m, key = (n * 64 + mp) * 64 + mq;
    if (!map.has(key)) map.set(key, { n, mp, mq, a: [], b: [], v: [] });
    const g = map.get(key); g.a.push(pos[p]); g.b.push(pos[q]); g.v.push(T.H.v[e]);
  }
  const list = [...map.values()];
  groupCache.set(bc, list);
  return list;
}

// shell(bc, rise, terms): rise = dome height at the rim in thicknesses (κ = 2·rise),
// terms = how many coupling terms H̃^n_ij to keep (the strongest, by the
// equipartition weight √C_n |H̃| / (ω_i ω_j)). Cached.
const cache = new Map();
export function shell(bc = 'free', rise = 0, terms = 600) {
  const id = `${bc}|${rise}|${terms}`;
  if (cache.has(id)) return cache.get(id);
  const T = TABLE[bc], N = T.modes.length, NS = T.inplane.length, kap = 2 * rise;
  // linear stiffness, block by angular index m: λ⁴ δ + κ² Kc
  const blocks = new Map();
  T.modes.forEach((md, i) => { if (!blocks.has(md.m)) blocks.set(md.m, []); blocks.get(md.m).push(i); });
  const K = new Map();
  for (let e = 0; e < T.Kc.p.length; e++) { const p = T.Kc.p[e], q = T.Kc.q[e]; K.set(`${p},${q}`, T.Kc.v[e]); K.set(`${q},${p}`, T.Kc.v[e]); }
  const shellModes = [];
  for (const [m, idx] of blocks) {
    const b = idx.length, A = idx.map((p) => idx.map((q) => (p === q ? T.modes[p].lam2 ** 2 : 0) + kap * kap * (K.get(`${p},${q}`) || 0)));
    const V = A.map((r) => Float64Array.from(r)), om2 = symEig(V, b); // V ← eigenvectors (columns)
    for (let c = 0; c < b; c++) {
      let dom = 0;
      for (let r = 0; r < b; r++) if (Math.abs(V[r][c]) > Math.abs(V[dom][c])) dom = r;
      const sgn = V[dom][c] < 0 ? -1 : 1, U = idx.map((_, r) => sgn * V[r][c]);
      shellModes.push({ m, om2: om2[c], U, idx, plate: idx[dom] });
    }
  }
  shellModes.sort((a, b) => a.om2 - b.om2);
  const S = {
    bc, rise, kappa: kap, N, NS, terms,
    m: Int32Array.from(shellModes, (s) => s.m),
    Om: Float64Array.from(shellModes, (s) => Math.sqrt(s.om2)),
    plateOm: Float64Array.from(shellModes, (s) => T.modes[s.plate].lam2),
    label: shellModes.map((s) => modeLabel(bc, T.modes[s.plate].m, T.modes[s.plate].s)),
    C: Float64Array.from(T.inplane, (p) => (3 * (1 - NU * NU)) / p.z4),
  };
  S.tuned = shellModes.findIndex((s) => s.m === 0);
  // shell-mode index of (block m, column c), and the transform U (plate → shell) per block
  const where = new Map();
  shellModes.forEach((s, i) => { if (!where.has(s.m)) where.set(s.m, []); where.get(s.m).push(i); });
  for (const [m, list] of where) list.sort((a, b) => shellModes[a].om2 - shellModes[b].om2);
  S.R = shellModes.map((s) => {
    const R = new Float64Array(NR);
    s.idx.forEach((p, r) => { const Rp = T.modes[p].R; for (let i = 0; i < NR; i++) R[i] += s.U[r] * Rp[i]; });
    return R;
  });
  const Ublock = new Map(); // m → { idx (plate), cols (shell indices), U[r][c] }
  for (const [m, cols] of where) Ublock.set(m, { idx: blocks.get(m), cols, U: blocks.get(m).map((_, r) => cols.map((c) => shellModes[c].U[r])) });
  // curvature terms Ẽ^n_i = κ Σ_p U_pi E^n_p
  const Et = [];
  {
    const acc = new Map();
    for (let e = 0; e < T.E.n.length; e++) {
      const n = T.E.n[e], p = T.E.p[e], B = Ublock.get(T.modes[p].m), r = B.idx.indexOf(p);
      B.cols.forEach((c, j) => { const key = n * N + c; acc.set(key, (acc.get(key) || 0) + kap * B.U[r][j] * T.E.v[e]); });
    }
    for (const [key, v] of acc) if (v !== 0) Et.push({ n: Math.floor(key / N), i: key % N, v });
  }
  // couplings H̃^n = Uᵀ H^n U, block pair by block pair, then the strongest `terms` of them
  const G = groupsOf(bc), Ht = [];
  for (const { n, mp, mq, a, b, v } of G) {
    const A = Ublock.get(mp), B = Ublock.get(mq), na = A.cols.length, nb = B.cols.length, same = mp === mq;
    const M = new Float64Array(na * nb), W = new Float64Array(na * nb);
    for (let e = 0; e < a.length; e++) { M[a[e] * nb + b[e]] = v[e]; if (same) M[b[e] * nb + a[e]] = v[e]; }
    for (let r = 0; r < na; r++) for (let j = 0; j < nb; j++) { let t = 0; for (let q = 0; q < nb; q++) t += M[r * nb + q] * B.U[q][j]; W[r * nb + j] = t; }
    for (let i = 0; i < na; i++) for (let j = same ? i : 0; j < nb; j++) {
      let t = 0;
      for (let r = 0; r < na; r++) t += A.U[r][i] * W[r * nb + j];
      if (t !== 0) { const ci = A.cols[i], cj = B.cols[j]; Ht.push({ n, i: Math.min(ci, cj), j: Math.max(ci, cj), v: t }); }
    }
  }
  const wt = Float64Array.from(Ht, (h) => (h.w = (Math.sqrt(S.C[h.n]) * Math.abs(h.v)) / (S.Om[h.i] * S.Om[h.j])));
  const cut = terms < Ht.length ? Float64Array.from(wt).sort()[Ht.length - terms] : 0;
  const keep = Ht.filter((_, e) => wt[e] >= cut).slice(0, terms);
  S.H = keep; S.E = Et;
  // Packed for the engine: the full set, and a lite set of the strongest LITE terms, enough for
  // weakly nonlinear motion (the lowest modes' normal-form pitch shifts agree to a few %), which
  // a voice uses in its long tail.
  S.full = pack(keep, Et, N, NS);
  S.lite = pack(keep.slice().sort((a, b) => b.w - a.w).slice(0, LITE), Et, N, NS);
  Object.assign(S, S.full); // S.p1, p2, e1, e2: the full set
  cache.set(id, S);
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  return S;
}

export const LITE = 200;

// The part of shell() the engine needs, as plain data (typed arrays), so the page can build
// the tables (a few ms) and post them to the AudioWorklet instead of the audio thread
// building them. tablesId(P) names the set a parameter object asks for.
export const tablesId = (P) => `${P.bc}|${P.rise}|${P.terms}`;
export function engineTables(S) {
  const { bc, rise, terms, N, NS, Om, m, R, C, tuned, full, lite } = S;
  return { id: `${bc}|${rise}|${terms}`, bc, rise, terms, N, NS, Om, m, R, C, tuned, full, lite };
}

// Coupling rows for the engine: pass 1 by in-plane mode (sorted by the larger mode index, for
// per-key prefixes), pass 2 by transverse mode (sorted by partner index); curvature terms both ways.
function pack(H, Et, N, NS) {
  const rows = (list, nRows, row, order) => {
    const sorted = list.slice().sort((a, b) => row(a) - row(b) || order(a) - order(b)), off = new Int32Array(nRows + 1);
    for (const e of sorted) off[row(e) + 1]++;
    for (let r = 0; r < nRows; r++) off[r + 1] += off[r];
    return { off, sorted };
  };
  const r1 = rows(H, NS, (h) => h.n, (h) => h.j);
  const p1 = { off: r1.off, i: Int32Array.from(r1.sorted, (h) => h.i), j: Int32Array.from(r1.sorted, (h) => h.j), ij: Int32Array.from(r1.sorted, (h) => (h.i << 8) | h.j), h: Float64Array.from(r1.sorted, (h) => (h.i === h.j ? 1 : 2) * h.v) };
  const full = [];
  for (const h of H) { full.push({ k: h.i, n: h.n, q: h.j, v: h.v }); if (h.i !== h.j) full.push({ k: h.j, n: h.n, q: h.i, v: h.v }); }
  const r2 = rows(full, N, (h) => h.k, (h) => h.q);
  const p2 = { off: r2.off, n: Int32Array.from(r2.sorted, (h) => h.n), q: Int32Array.from(r2.sorted, (h) => h.q), nq: Int32Array.from(r2.sorted, (h) => (h.n << 8) | h.q), h: Float64Array.from(r2.sorted, (h) => h.v) };
  const used = new Set(H.map((h) => h.n)), Eu = Et.filter((e) => used.has(e.n));
  const r3 = rows(Eu, NS, (e) => e.n, (e) => e.i);
  const e1 = { off: r3.off, i: Int32Array.from(r3.sorted, (e) => e.i), v: Float64Array.from(r3.sorted, (e) => e.v) };
  const r4 = rows(Eu, N, (e) => e.i, (e) => e.n);
  const e2 = { off: r4.off, n: Int32Array.from(r4.sorted, (e) => e.n), v: Float64Array.from(r4.sorted, (e) => e.v) };
  return { p1, p2, e1, e2 };
}

// End of each packed row when only modes < Nv are present (rows sorted by that index).
export function rowEnds(off, idx, Nv, out) {
  for (let r = 0; r + 1 < off.length; r++) {
    let lo = off[r], hi = off[r + 1];
    while (lo < hi) { const mid = (lo + hi) >> 1; if (idx[mid] < Nv) lo = mid + 1; else hi = mid; }
    out[r] = lo;
  }
  return out;
}

// V_nl and its gradient for modes < Nv (dense reference, used by tests and the views).
export function potential(S, x, Nv = S.N) {
  const Q = new Float64Array(S.NS), L = new Float64Array(S.NS), g = new Float64Array(S.N);
  for (const h of S.H) if (h.i < Nv && h.j < Nv) Q[h.n] += (h.i === h.j ? 1 : 2) * h.v * x[h.i] * x[h.j];
  const used = new Set(S.H.map((h) => h.n));
  for (const e of S.E) if (e.i < Nv && used.has(e.n)) L[e.n] += e.v * x[e.i];
  let V = 0;
  for (let n = 0; n < S.NS; n++) V += 0.5 * S.C[n] * Q[n] * (Q[n] + 4 * L[n]);
  for (const h of S.H) if (h.i < Nv && h.j < Nv) {
    const y = 2 * S.C[h.n] * (Q[h.n] + 2 * L[h.n]);
    g[h.i] += y * h.v * x[h.j]; if (h.i !== h.j) g[h.j] += y * h.v * x[h.i];
  }
  for (const e of S.E) if (e.i < Nv && used.has(e.n)) g[e.i] += 2 * S.C[e.n] * Q[e.n] * e.v;
  return { V, g };
}

// Backbone of mode p to leading order (Lindstedt / normal form): with x_p = a cos ωt,
//   ω² = Ω_p² + a² [ ¾ Γ_p − Σ_k δ_k² (1/Ω_k² + 1/(2(Ω_k² − 4Ω_p²))) ],
// Γ_p = 2 Σ_n C_n (H̃^n_pp)² (stretching, hardening), δ_k = Σ_n 2C_n (H̃^n_pp Ẽ^n_k + 2 H̃^n_pk Ẽ^n_p)
// (curvature, quadratic: the δ² terms soften). Returns d(ω/Ω)/d(a²).
export function backbone(S, p, Nv = S.N) {
  const used = new Set(S.H.map((h) => h.n));
  const Hpp = new Map(), Hpk = new Map(), Ep = new Map(), Ek = new Map();
  for (const h of S.H) {
    if (h.i >= Nv || h.j >= Nv) continue;
    if (h.i === p && h.j === p) Hpp.set(h.n, h.v);
    else if (h.i === p || h.j === p) Hpk.set(`${h.n},${h.i === p ? h.j : h.i}`, h.v);
  }
  for (const e of S.E) if (used.has(e.n) && e.i < Nv) { if (e.i === p) Ep.set(e.n, e.v); Ek.set(`${e.n},${e.i}`, e.v); }
  let G = 0;
  for (const [n, v] of Hpp) G += 2 * S.C[n] * v * v;
  let soft = 0;
  const O2 = S.Om[p] ** 2;
  for (let k = 0; k < Nv; k++) {
    let d = 0;
    for (const n of used) d += 2 * S.C[n] * ((Hpp.get(n) || 0) * (Ek.get(`${n},${k}`) || 0) + 2 * (k === p ? Hpp.get(n) || 0 : Hpk.get(`${n},${k}`) || 0) * (Ep.get(n) || 0));
    if (d) soft += d * d * (1 / S.Om[k] ** 2 + 1 / (2 * (S.Om[k] ** 2 - 4 * O2)));
  }
  return (0.75 * G - soft) / (2 * O2);
}

// ---- one key ---------------------------------------------------------------------------------
// The key's gong: tuned so that its first axisymmetric mode (the strike tone of
// a centre hit) is the key's equal-tempered pitch at small amplitude. With h/a,
// the material and the mallet's mass ratio fixed, every key is the same gong
// scaled in size (a ∝ 1/f), and the motion in units of the thickness is the
// same at every key: only the time scale changes.
export const OS_MAX_HZ = 26000, CAP = 0.33;
export function keyGong(key, P, fs, S = shell(P.bc, P.rise, P.terms)) {
  const mat = MATERIALS[P.material] || MATERIALS.bronze, cp = plateSpeed(mat);
  const f0 = keyFreq(key), w0 = (TAU * f0) / S.Om[S.tuned]; // 1/τ
  const a = (P.thick * cp) / (Math.sqrt(12) * w0), h = P.thick * a;
  // internal rate: the lowest fs/R (R a power of 2) that holds every mode below CAP·fs/R,
  // but no faster than ~24 kHz
  let R = 1;
  while (fs / R > OS_MAX_HZ) R *= 2;
  const fTop = (S.Om[S.N - 1] * w0) / TAU;
  while (R < 8 && CAP * (fs / (2 * R)) > fTop) R *= 2;
  const fsi = fs / R, k = w0 / fsi;
  let Nv = 0;
  while (Nv < S.N && (S.Om[Nv] * w0) / TAU < CAP * fsi) Nv++;
  const fc = (AIR.c ** 2 / TAU) * Math.sqrt((12 * mat.rho * (1 - NU * NU)) / (mat.E * h * h)); // coincidence
  const g = { S, key, f0, w0, a, h, mass: mat.rho * h * Math.PI * a * a, cp, mat, R, fsi, k, Nv, fc };
  g.loss = modeLoss(g, P);
  g.sigma = g.loss.map((l) => l.sigma);
  return g;
}

// Damping of each mode: σ = ω η / 2 (1/s), with the loss factor η the sum of
//   internal friction η_int (a knob),
//   thermoelastic relaxation (Zener): Δ ωτ/(1 + ω²τ²), τ = h²/(π² D), Δ = Eα²T/(ρc)·(1+ν)/(1−ν),
//   radiation: ρ₀c₀ σ_rad / (ρ h ω), σ_rad the mode's radiation efficiency.
// σ_rad also sets how loud each mode is in the room (radiated power ∝ σ_rad ⟨v²⟩).
export function modeLoss(g, P) {
  const { S, w0, a, h, mat, fc } = g;
  const Delta = ((mat.E * mat.alpha ** 2 * 293) / (mat.rho * mat.cv)) * ((1 + NU) / (1 - NU)), tth = (h * h) / (Math.PI ** 2 * mat.D);
  const out = [];
  for (let i = 0; i < g.Nv; i++) {
    const w = S.Om[i] * w0, f = w / TAU;
    const th = ((P.thermal ?? 1) * Delta * w * tth) / (1 + (w * tth) ** 2);
    const srad = radiationEfficiency(f / fc, (2 * AIR.c) / (a * fc), (w * a) / AIR.c);
    const rad = P.radiation * ((AIR.rho * AIR.c) / (mat.rho * h * w)) * srad;
    out.push({ f, th, rad, srad, int: P.eta, sigma: 0.5 * w * (P.eta + th + rad) });
  }
  return out;
}

// Radiation efficiency of a plate mode. Below coincidence (x = f/f_c < 1) a plate
// radiates from its rim (Maidanik's edge-mode result for a baffled plate, with
// pc = (perimeter/area)·c/f_c = 2c/(a f_c) for a disc); above it, 1/√(1 − f_c/f).
// That estimate assumes many wavelengths across the plate. A free disc smaller than
// the sound wavelength (ka < 1) has no net volume flow and radiates at best as a
// dipole: the factor (ka)²/(1 + (ka)²) rolls it off there.
export function radiationEfficiency(x, pc, ka = Infinity) {
  const small = ka === Infinity ? 1 : (ka * ka) / (1 + ka * ka);
  if (x < 0.98) {
    const al = Math.sqrt(x);
    return small * Math.min(2, (pc / (Math.PI * Math.PI)) * (((1 - al * al) * Math.log((1 + al) / (1 - al)) + 2 * al) / (1 - al * al) ** 1.5));
  }
  return small * Math.min(2, 1 / Math.sqrt(Math.max(1e-3, 1 - 1 / Math.max(x, 1.001))));
}

// Mallet: a Hertzian sphere (head modulus E_m, radius 0.08 a, mass μ × the gong's mass).
// In the reduced units, contact force F̄ = K̄ δ̄^{3/2}, the mallet obeys ẍ_m = −F̄/(π μ), and
// the impact speed is v̄ = v τ / h = √12 v / (c_p (h/a)²).
export const HEAD = 0.08, HEAD_NU = 0.45;
export function mallet(g, P, vel) {
  const Estar = P.hardness * 1e6 / (1 - HEAD_NU ** 2);
  const K = 16 * (1 - NU * NU) * (Estar / g.mat.E) * Math.sqrt(HEAD) * P.thick ** -2.5;
  const v = P.speed * vel * vel; // m/s
  return { K, mu: P.mass, v, vbar: (Math.sqrt(12) * v) / (g.cp * P.thick ** 2) };
}

// Hertz contact time of a sphere on a rigid flat (estimate, s), for the hint.
export function contactTime(g, P, vel) {
  const ml = mallet(g, P, vel), M = ml.mu * g.mass;
  const Kd = (4 / 3) * (P.hardness * 1e6 / (1 - HEAD_NU ** 2)) * Math.sqrt(HEAD * g.a);
  return 3.218 * (M * M / (Kd * Kd * Math.max(ml.v, 1e-3))) ** 0.2;
}

// The two close microphones (r/a, θ) that make the stereo pair: left, right. The
// mallet strikes on the line θ = 0, so they sit off it, at different radii.
export const MICS = [[0.9, 0.35], [0.75, 2.8]];

