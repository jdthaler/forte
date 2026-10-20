// Gong keyboard checks. Run: node test/gongs-tests.mjs
//
// First the plate against textbook results (Bessel zeros, Leissa's circular
// plate frequencies, Reissner's shallow-shell shift, the symmetry of the von
// Kármán bracket), then the nonlinear dynamics against independent
// integrations and the normal-form backbone, then the engine: tuning, decay,
// energy, regimes, level, stability and CPU. The model and the engine are the
// C++ (native/instruments/gongs), built as WebAssembly: the model's functions
// through gongs-wasm.js. plate.js is the JavaScript that computes the plate
// tables (tools/gongs-modes.mjs) the C++ is converted from.

import assert from 'node:assert/strict';
import { besselJ, besselI, plateModes, tripleL, radial, gaussLegendre } from '../gongs/src/plate.js';
import TABLE from '../gongs/data/gong-modes.js';
import { INSTRUMENT } from '../gongs/src/gongs-instrument.js';
import { wasmModel } from '../gongs/src/gongs-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { DEFAULTS, GROUPS, PRESETS } from '../gongs/src/gongs-params.js';
import { keyFreq } from '../shared/dsp.js';
import { TUNING_PARAMS, TUNING_KEEP } from '../shared/tuning.js';
import { readFileSync } from 'node:fs';
import { header as tableHeader } from '../tools/gongs-native-table.mjs';

const GongEngine = await loadEngine(INSTRUMENT);
const { keyGong, interpR, backbone } = await wasmModel();
const NU = TABLE.nu;

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  const t = performance.now();
  try { fn(); console.log('  ok  ', name, `(${((performance.now() - t) / 1000).toFixed(1)} s)`); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (r) => 1200 * Math.log2(r);
// The shell modes and couplings for an edge, a dome rise, a number of terms and an asymmetry, as the C++ builds them.
const shell = (bc = 'free', rise = 0, terms = 600, asym = DEFAULTS.asym) => keyGong(57, P({ bc, rise, terms, asym }), FS).S;
// The flat plate's frequency (λ², the table's) of the plate mode a shell mode grew from, by its label.
function plateOm(S, i) {
  const [, m, c] = S.label[i].match(/\((\d+),(\d+)\)/).map(Number), s = c - (S.bc === 'free' && m < 2 ? 1 : 0);
  return TABLE[S.bc].modes.find((md) => md.m === m && md.s === s).lam2;
}
// The nonlinear potential V_nl = ½ Σ_n C_n (Q_n² + 4 Q_n ℓ_n) and its gradient for modes < Nv, summed
// densely from the coupling tensors (the reference the scheme's steps are checked against).
function potential(S, x, Nv = S.N) {
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

// Render through the engine in 128-sample blocks, like the AudioWorklet. events: [t, 'on'|'off', key, vel],
// [t, 'msg', message] or [t, 'params', P]
function render(params, sec, events, post, quality) {
  const e = new GongEngine(FS);
  if (post) e.post = post;
  if (quality) e.setQuality(quality);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float64Array(n), R = new Float64Array(n), bl = new Float32Array(128), br = new Float32Array(128);
  const ev = events.map(([t, ty, k, v]) => ({ s: Math.round(t * FS), ty, k, v })).sort((a, b) => a.s - b.s);
  let j = 0;
  for (let s = 0; s < n; s += 128) {
    while (j < ev.length && ev[j].s <= s) { const q = ev[j++]; if (q.ty === 'on') e.noteOn(q.k, q.v); else if (q.ty === 'msg') e.handle(q.k); else if (q.ty === 'params') e.setParams(q.k); else e.noteOff(q.k); }
    e.process(bl, br, 128);
    for (let i = 0; i < 128 && s + i < n; i++) { L[s + i] = bl[i]; R[s + i] = br[i]; }
  }
  return { L, R, e };
}
// Hann-windowed amplitude at f over x[a, b).
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// Frequency of the strongest peak near f (golden-section search on the windowed amplitude).
function peak(x, f, a, b, span = 0.03) {
  let lo = f * (1 - span), hi = f * (1 + span);
  const g = (u) => -tone(x, u, a, b);
  // coarse scan first, then refine
  let best = lo, bv = Infinity;
  for (let i = 0; i <= 60; i++) { const u = lo + ((hi - lo) * i) / 60, v = g(u); if (v < bv) { bv = v; best = u; } }
  lo = best - (hi - lo) / 60; hi = best + (hi - lo) / 60;
  for (let it = 0; it < 40; it++) { const m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618; if (g(m1) < g(m2)) hi = m2; else lo = m1; }
  return 0.5 * (lo + hi);
}
// Mean frequency of a sampled oscillation from its upward zero crossings (per unit time step k).
function zfreq(xs, k) {
  const z = [];
  for (let i = 1; i < xs.length; i++) if (xs[i - 1] < 0 && xs[i] >= 0) z.push(i - 1 + xs[i - 1] / (xs[i - 1] - xs[i]));
  return (2 * Math.PI * (z.length - 1)) / ((z[z.length - 1] - z[0]) * k);
}
// A voice released from rest with only mode p displaced by a, damping off.
function freeVoice(key, params, p, a) {
  const e = new GongEngine(FS); e.setParams(params);
  const x0 = new Array(64).fill(0); x0[p] = a;
  const v = e.place(key, x0);
  v.g.sigma.fill(0); v.setDamping();
  return v;
}

console.log('plate');
test('Bessel functions: zeros of J₀, J₁ and tabulated values', () => {
  assert.ok(Math.abs(besselJ(0, 2.404825557695773)) < 1e-14 && Math.abs(besselJ(1, 3.831705970207512)) < 1e-14);
  assert.ok(Math.abs(besselJ(0, 30) - -0.08636798358104) < 1e-12, 'J₀(30), integral branch');
  assert.ok(Math.abs(besselI(0, 1) - 1.266065877752008) < 1e-14 && Math.abs(besselI(2, 10) / 2281.518967726 - 1) < 1e-12);
});
test('free-edge plate (ν = 0.3) matches Leissa, Vibration of Plates, table 2.3', () => {
  const ref = [['2,0', 5.3583], ['0,1', 9.0031], ['3,0', 12.439], ['1,1', 20.475], ['4,0', 21.835], ['5,0', 33.495], ['2,1', 35.260], ['0,2', 38.443]];
  const md = plateModes('free', { nu: 0.3, lam2Max: 40 });
  ref.forEach(([lab, l2], i) => {
    const [m] = lab.split(',').map(Number);
    assert.equal(md[i].m, m, `mode ${i} is (${lab})`);
    assert.ok(Math.abs(md[i].lam2 / l2 - 1) < 2e-4, `(${lab}) λ² = ${md[i].lam2.toFixed(4)} vs ${l2}`);
  });
});
test('clamped plate (= the in-plane Airy basis) matches the classical λ²', () => {
  const ref = [10.2158, 21.2604, 34.8770, 39.7711, 51.0300, 60.8287, 69.6658, 84.5826, 89.1041, 90.7390];
  const md = plateModes('clamped', { lam2Max: 95 });
  ref.forEach((l2, i) => assert.ok(Math.abs(md[i].lam2 - l2) < 2e-4, `${md[i].lam2} vs ${l2}`));
  TABLE.free.inplane.slice(0, 4).forEach((p, i) => assert.ok(Math.abs(Math.sqrt(p.z4) - ref[i]) < 2e-4, 'Airy basis = clamped modes'));
});
test('the native port\'s copy of the tables (native/instruments/gongs/gong-modes.h) is this data file, converted', () => {
  assert.ok(readFileSync(new URL('../native/instruments/gongs/gong-modes.h', import.meta.url), 'utf8') === tableHeader(), 'stale: run node tools/gongs-native-table.mjs');
});
test('tabulated mode shapes are orthonormal: ∫ Φ_p Φ_q dA = δ_pq', () => {
  const { x, w } = gaussLegendre(120), md = TABLE.free.modes;
  for (const p of [0, 1, 6, 7, 20]) for (const q of [0, 1, 6, 7, 20]) {
    if (md[p].m !== md[q].m) continue;
    let s = 0;
    for (let i = 0; i < x.length; i++) s += w[i] * x[i] * interpR(md[p].R, x[i]) * interpR(md[q].R, x[i]);
    s *= md[p].m ? Math.PI : 2 * Math.PI;
    assert.ok(Math.abs(s - (p === q ? 1 : 0)) < 2e-4, `<${p}|${q}> = ${s}`);
  }
});
test('von Kármán coupling: angular selection rule, and ∫Φ_k L(Φ_p,Ψ) = ∫Ψ L(Φ_p,Φ_k) (energy-consistent)', () => {
  for (const bc of ['free', 'clamped']) {
    const T = TABLE[bc], { H } = T;
    for (let e = 0; e < H.n.length; e++) {
      const j = T.inplane[H.n[e]].j, mp = T.modes[H.p[e]].m, mq = T.modes[H.q[e]].m;
      assert.ok(j === mp + mq || j === Math.abs(mp - mq), `${bc}: j=${j} from m=${mp},${mq}`);
    }
  }
  const md = plateModes('free', { nu: NU, lam2Max: 40 }), ps = plateModes('clamped', { lam2Max: 200, mMax: 6 });
  for (const [k, p, n] of [[0, 0, 0], [1, 0, 2], [2, 3, 5], [4, 6, 9]]) {
    const psi = ps.filter((s) => s.m === md[k].m + md[p].m || s.m === Math.abs(md[k].m - md[p].m))[n % 3];
    const a = tripleL(psi, md[p], md[k]), b = tripleL(md[k], md[p], psi);
    assert.ok(Math.abs(a - b) < 1e-6 * (1 + Math.abs(a)), `${a} vs ${b}`);
  }
});
test('stretching energy: the modal tensor equals a direct 1-D solution of the compatibility equation', () => {
  // For an axisymmetric deflection w(r), ∇⁴F = −½L(w,w) integrates once to (∇²F)' = −w_r²/(2r);
  // F = F' = 0 at the rim fixes ∇²F(1). The tensor says ∫(∇²F)² dA = Σ_n (H^n_pp)²/(4ζ_n⁴).
  for (const bc of ['free', 'clamped']) {
    const md = plateModes(bc, { nu: NU, lam2Max: 45 }).filter((m) => m.m === 0), T = TABLE[bc];
    for (const mode of md) {
      const M = 4000, r = (i) => i / M, wr = Float64Array.from({ length: M + 1 }, (_, i) => radial(mode, Math.max(r(i), 1e-9)).R1);
      const I = new Float64Array(M + 1);
      for (let i = M - 1; i >= 0; i--) I[i] = I[i + 1] + 0.5 * ((i ? wr[i] ** 2 / (2 * r(i)) : 0) + wr[i + 1] ** 2 / (2 * r(i + 1))) / M;
      let J = 0; for (let i = 0; i < M; i++) J += (0.5 * (r(i) * I[i] + r(i + 1) * I[i + 1])) / M;
      let direct = 0; for (let i = 0; i < M; i++) direct += (0.5 * ((I[i] - 2 * J) ** 2 * r(i) + (I[i + 1] - 2 * J) ** 2 * r(i + 1))) / M;
      direct *= 2 * Math.PI;
      const q = T.modes.findIndex((m) => m.m === 0 && Math.abs(m.lam2 - mode.lam2) < 1e-4);
      let modal = 0;
      for (let e = 0; e < T.H.n.length; e++) if (T.H.p[e] === q && T.H.q[e] === q) modal += T.H.v[e] ** 2 / (4 * T.inplane[T.H.n[e]].z4);
      assert.ok(Math.abs(modal / direct - 1) < 2e-4, `${bc} (0,·) λ²=${mode.lam2.toFixed(2)}: ${modal} vs ${direct}`);
    }
  }
});
test('shallow shell: free axisymmetric modes obey Reissner, ω² = ω_plate² + E/(ρR²); (2,0) is nearly inextensional', () => {
  for (const rise of [0.5, 1.5, 3]) {
    const S = shell('free', rise), kap = 2 * rise;
    for (let i = 0; i < 12; i++) if (S.m[i] === 0) {
      const reiss = Math.sqrt(plateOm(S, i) ** 2 + 12 * (1 - NU * NU) * kap * kap);
      assert.ok(Math.abs(S.Om[i] / reiss - 1) < 1e-4, `rise ${rise}: ${S.label[i]} ${S.Om[i]} vs ${reiss}`);
    }
    const memb = (S.Om[0] ** 2 - plateOm(S, 0) ** 2) / (12 * (1 - NU * NU) * kap * kap); // fraction of the closed-shell stiffening
    assert.ok(S.m[0] === 2 && memb < 0.005, `(2,0) takes ${(100 * memb).toFixed(2)} % of the membrane stiffening`);
    const C = shell('clamped', rise), t = C.tuned;
    assert.ok(C.Om[t] > plateOm(C, t) && C.Om[t] < Math.sqrt(plateOm(C, t) ** 2 + 12 * (1 - NU * NU) * kap * kap), 'clamped: between plate and Reissner bound');
  }
});

console.log('nonlinear dynamics');
test('free vibration: SAV scheme = RK4 reference = normal-form backbone (flat hardens, dome softens)', () => {
  for (const [rise, a] of [[0, 0.1], [1.5, 0.07]]) {
    const v = freeVoice(57, P({ rise }), shell('free', rise).tuned, a), S = v.S, p = S.tuned, N = v.N;
    const n = Math.round((24 * 2 * Math.PI) / S.Om[p] / v.k), xs = new Float64Array(n);
    for (let i = 0; i < n; i++) { v.step(); xs[i] = v.x[p]; }
    const sav = cents(zfreq(xs, v.k) / S.Om[p]);
    // RK4 on the same equations, at a quarter of the step
    const h = v.k / 4, X = new Float64Array(N), V = new Float64Array(N), xr = new Float64Array(4 * n);
    X[p] = a;
    const acc = (x, out) => { const { g } = potential(S, x, N); for (let j = 0; j < N; j++) out[j] = -(S.Om[j] ** 2) * x[j] - g[j]; };
    const k1 = new Float64Array(N), k2 = new Float64Array(N), k3 = new Float64Array(N), k4 = new Float64Array(N), Y = new Float64Array(N);
    for (let i = 0; i < 4 * n; i++) {
      acc(X, k1); for (let j = 0; j < N; j++) Y[j] = X[j] + 0.5 * h * V[j];
      acc(Y, k2); for (let j = 0; j < N; j++) Y[j] = X[j] + 0.5 * h * V[j] + 0.25 * h * h * k1[j];
      acc(Y, k3); for (let j = 0; j < N; j++) Y[j] = X[j] + h * V[j] + 0.5 * h * h * k2[j];
      acc(Y, k4);
      for (let j = 0; j < N; j++) { X[j] += h * V[j] + (h * h / 6) * (k1[j] + k2[j] + k3[j]); V[j] += (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]); }
      xr[i] = X[p];
    }
    const rk = cents(zfreq(xr, h) / S.Om[p]), nf = cents(Math.sqrt(1 + 2 * backbone(S, p, N) * a * a));
    assert.ok(Math.abs(sav - rk) < 0.1, `rise ${rise}: SAV ${sav.toFixed(2)} ¢ vs RK4 ${rk.toFixed(2)} ¢`);
    assert.ok(Math.abs(rk - nf) < 0.06 * Math.abs(nf), `rise ${rise}: RK4 ${rk.toFixed(2)} ¢ vs backbone ${nf.toFixed(2)} ¢`);
    assert.ok(rise ? nf < -0.5 : nf > 2, `sign: ${nf.toFixed(2)} ¢`);
  }
});
test('hardening → softening: the backbone of the strike tone changes sign at a dome rise of ~0.7 h', () => {
  const b = (rise) => { const S = shell('free', rise); return backbone(S, S.tuned); };
  assert.ok(b(0) > 0.3 && b(0.5) > 0 && b(1) < 0 && b(2) < 0, `${b(0)}, ${b(0.5)}, ${b(1)}, ${b(2)}`);
  let lo = 0.5, hi = 1;
  for (let i = 0; i < 20; i++) { const m = 0.5 * (lo + hi); if (b(m) > 0) lo = m; else hi = m; }
  assert.ok(lo > 0.6 && lo < 0.85, `crossover at rise ${lo.toFixed(3)} h`);
});
test('energy is conserved to round-off through a fortissimo strike (damping off)', () => {
  const e = new GongEngine(FS); e.setParams(P({ rise: 1.2, strike: 0.35 }));
  e.noteOn(55, 1);
  const v = e.voices[0], h = v.hit, k = v.h, mu = 1 / (Math.PI * h.Mi); // k: the scheme's step (substeps included)
  v.g.sigma.fill(0); v.setDamping();
  const pot = (d) => (d > 0 ? 0.4 * h.K * d ** 2.5 : 0);
  const total = () => { // plate (scheme's energy form, weighted by 1/sinc²(Ωh)) + ψ²/2 + mallet + contact, at the half step
    let E = 0;
    for (let i = 0; i < v.N; i++) {
      const vel = (v.x[i] - v.x1[i]) / k, w2 = (2 - v.A[i]) / (k * k), W = (Math.sin(v.S.Om[i] * k) / (v.S.Om[i] * k)) ** 2;
      E += (0.5 * vel * vel + 0.5 * w2 * v.x[i] * v.x1[i]) / W;
    }
    const m = v.hit || h;
    return E + 0.5 * (v.psi * v.psi - v.eps0) + 0.5 * Math.PI * mu * ((m.xm - m.xm1) / k) ** 2 + 0.5 * (pot(m.d0) + pot(m.dm1));
  };
  const E0 = total(), steps = Math.round(0.3 * FS / v.R);
  let worst = 0, Vmax = 0;
  for (let s = 0; s < steps; s++) { v.step(); const E = total(); worst = Math.max(worst, Math.abs(E / E0 - 1)); Vmax = Math.max(Vmax, Math.abs(v.V)); }
  assert.ok(h.steps > 5 && h.Fmax > 0, 'the mallet touched');
  assert.ok(worst < 1e-9 && v.guards === 0, `relative energy error ${worst.toExponential(2)}, guards ${v.guards}`);
  assert.ok(Vmax > 0.02 * E0, `and the strike was strongly nonlinear (V_nl up to ${(100 * Vmax / E0).toFixed(1)} % of the energy)`);
});
// Physical energy from the mode amplitudes (independent of the step: ½Ω²a² per mode for a
// sinusoid, from the midpoint X and the difference d), plus V_nl from the dense reference.
function physE(v) {
  const X = new Float64Array(v.N);
  let E = 0;
  for (let i = 0; i < v.N; i++) {
    const Om = v.S.Om[i], c = Math.cos((Om * v.h) / 2), s = Math.sin((Om * v.h) / 2), d = v.x[i] - v.x1[i];
    X[i] = 0.5 * (v.x[i] + v.x1[i]);
    E += 0.5 * Om * Om * ((X[i] * X[i]) / (c * c) + (d * d) / (4 * s * s));
  }
  return E + (v.nl ? potential(v.S, X, v.N).V : 0);
}
test('the conserved energy is the physical one: undamped, strikes and free vibration never gain (top modes at Ωh ≈ 2)', () => {
  // with the energy weights; without them the cascade into the top modes multiplied the energy (×1.7 struck, ×2.6 free)
  let worst = 0, wk = '';
  for (const key of [57, 69, 72, 84]) for (const vel of [0.8, 1]) {
    const e = new GongEngine(FS); e.setParams(P({ eta: 1e-5, thermal: 0, radiation: 0 })); e.setSustain(true);
    e.noteOn(key, vel);
    const v = e.voices[0], bl = new Float32Array(128), br = new Float32Array(128);
    v.g.sigma.fill(0); v.setDamping(); v.lite = v.full; // (the dense reference has the full coupling set)
    let E0 = null;
    for (let b = 0; b < Math.round((0.5 * FS) / 128); b++) {
      e.process(bl, br, 128);
      if (v.hit || !v.nl) continue;
      const E = physE(v);
      if (E0 === null) E0 = E;
      if (E / E0 > worst) { worst = E / E0; wk = `key ${key} v ${vel}`; }
    }
  }
  assert.ok(worst < 1.15, `struck: up to ${worst.toFixed(3)}× the energy just after contact (${wk})`);
  // free vibration of the C5 gong (top mode at Ωh = 2.07): its strike tone at 2 h, a little of everything else
  const e = new GongEngine(FS); e.setParams(P());
  const S = shell('free', DEFAULTS.rise), x0 = new Array(64).fill(0);
  for (let i = 0; i < 64; i++) x0[i] = 0.01 * Math.sin(1.7 * i + 0.3) * (S.Om[S.tuned] / S.Om[i]);
  x0[S.tuned] = 2;
  const v = e.place(72, x0);
  v.g.sigma.fill(0); v.adapt = false; v.lite = v.full; v.setDamping();
  const E0 = physE(v);
  let lo = 1, hi = 1;
  for (let s = 1; s <= Math.round((0.4 * v.g.w0) / v.k); s++) { v.step(); if (s % 50 === 0) { const r = physE(v) / E0; lo = Math.min(lo, r); hi = Math.max(hi, r); } }
  assert.ok(hi < 1.1 && lo > 0.9, `free vibration: energy between ${lo.toFixed(3)} and ${hi.toFixed(3)} of its start`);
  console.log(`        struck: ≤ ${worst.toFixed(3)}×; free vibration at C5: ${lo.toFixed(3)}–${hi.toFixed(3)}×`);
});

console.log('engine');
test('tuning: every key (C2–C6) has its strike tone within ±3 ¢ of 12-TET (soft centre strike, from the output)', () => {
  let worst = 0, wk = 0;
  for (let key = 36; key <= 84; key += 1) {
    const { L } = render(P({ strike: 0, speed: 0.5, eta: 1e-4 }), 0.75, [[0, 'on', key, 0.2]]);
    const f = keyFreq(key), a = Math.round(0.05 * FS), f1 = peak(L, f, a, L.length, 0.02), c = cents(f1 / f);
    if (Math.abs(c) > Math.abs(worst)) { worst = c; wk = key; }
  }
  console.log(`        worst ${worst.toFixed(2)} ¢ (key ${wk})`);
  assert.ok(Math.abs(worst) < 3, `worst ${worst.toFixed(2)} ¢ at key ${wk}`);
});
test('the keyboard\'s tuning: at A = 415 Hz in ¼-comma meantone (root C), C4, E4 and A4 sound within ±3 ¢ of 440·2^((m−69)/12)·415/440, C4 +10.26 ¢ and E4 −3.42 ¢ from equal temperament, A4 on the standard; each gong cut for its pitch (a ∝ 1/f)', () => {
  const T = { pitch: 415, temperament: 'meantone', tuningRoot: 0 };
  for (const [key, off] of [[60, 10.26], [64, -3.42], [69, 0]]) {
    const { L } = render(P({ strike: 0, speed: 0.5, eta: 1e-4, ...T }), 0.75, [[0, 'on', key, 0.2]]);
    const f = keyFreq(key) * (415 / 440) * 2 ** (off / 1200), c = cents(peak(L, f, Math.round(0.05 * FS), L.length, 0.02) / f);
    assert.ok(Math.abs(c) < 3, `key ${key}: ${c.toFixed(2)} ¢ from its target`);
    const g = keyGong(key, P(T), FS), g0 = keyGong(key, P(), FS);
    assert.ok(Math.abs(cents(g.f0 / f)) < 0.01 && Math.abs((g.a * g.f0) / (g0.a * keyFreq(key)) - 1) < 1e-9, `key ${key}: the model's pitch and radius`);
  }
});
test('the keys past C2–C6 (A0–B1, C♯6–C8): in tune, a forte note peaks 0.05–0.5, and the top keys keep ≥ 5 modes', () => {
  const out = [];
  for (const key of [21, 27, 33, 90, 97, 103, 108]) {
    const { L } = render(P({ strike: 0, speed: 0.5, eta: 1e-4 }), 0.75, [[0, 'on', key, 0.2]]);
    const f = keyFreq(key), c = cents(peak(L, f, Math.round(0.05 * FS), L.length, 0.02) / f);
    assert.ok(Math.abs(c) < 3, `key ${key}: ${c.toFixed(2)} ¢`);
    const { L: l, R: r } = render(P(), 1, [[0, 'on', key, 0.8]]);
    let pk = 0;
    for (let i = 0; i < l.length; i++) pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i]));
    assert.ok(pk > 0.05 && pk < 0.5, `key ${key}: peak ${pk}`);
    out.push(`${key}:${c.toFixed(1)}¢ ${pk.toFixed(2)}`);
  }
  for (const fs of [44100, 48000, 96000]) {
    for (let key = 36; key <= 84; key++) assert.ok(fs / keyGong(key, P(), fs).R <= 26000, `key ${key} at ${fs}: no faster than before`);
    for (let key = 85; key <= 108; key++) { const g = keyGong(key, P(), fs); assert.ok(g.Nv >= 5 && g.fsi <= 52000, `key ${key} at ${fs}: ${g.Nv} modes at ${g.fsi} Hz`); }
  }
  console.log(`        ${out.join(', ')}`);
});
test('decay of the strike tone matches the loss model (internal + thermoelastic + radiation)', () => {
  const p = P({ strike: 0, speed: 0.5 }), key = 52, g = keyGong(key, p, FS), sig = g.sigma[g.S.tuned];
  const { L } = render(p, 2.4, [[0, 'on', key, 0.2]]), f = keyFreq(key), W = 16384, a = Math.round(0.2 * FS), b = Math.round(2.0 * FS);
  const meas = Math.log(tone(L, f, a, a + W) / tone(L, f, b, b + W)) / ((b - a) / FS);
  assert.ok(Math.abs(meas / sig - 1) < 0.03, `σ ${meas.toFixed(4)} vs model ${sig.toFixed(4)} /s (T60 ${(6.91 / sig).toFixed(1)} s)`);
});
test('a centre strike rings only axisymmetric modes; off centre wakes the asymmetric ones', () => {
  const key = 57, S = shell('free', 0), w0 = keyGong(key, P(), FS).w0, f20 = (S.Om[0] * w0) / (2 * Math.PI), f0 = keyFreq(key);
  const c = render(P({ strike: 0 }), 0.6, [[0, 'on', key, 0.6]]), o = render(P({ strike: 0.5 }), 0.6, [[0, 'on', key, 0.3]]).L;
  const v = c.e.voices[0], asym = [...v.x].filter((_, i) => v.S.m[i] !== 0), sym = [...v.x].filter((_, i) => v.S.m[i] === 0);
  assert.ok(asym.every((q) => q === 0) && sym.some((q) => q !== 0), 'centre, even at mf: every m ≠ 0 coordinate exactly zero (an invariant subspace)');
  const r = (x) => tone(x, f20, 4800, 4800 + 16384) / tone(x, f0, 4800, 4800 + 16384);
  assert.ok(r(o) > 0.05, `off centre: (2,0)/(0,1) = ${r(o).toFixed(3)}`);
});
// A note's own slide (MPE) is where its mallet lands, taken as it strikes.
const slide = (key, value) => ({ type: 'slide', key, value });
const same = (x, y, what) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) assert.fail(`${what}: sample ${i} differs`); };
test('a note\'s own slide is its strike point: a lone gong slid to x is the gong struck at x, bit for bit, from its next strike on', () => {
  const key = 57;
  for (const x of [0, 0.5, 0.9]) {
    same(render(P(), 0.3, [[0, 'msg', slide(key, x)], [0, 'on', key, 0.6]]).L, render(P({ strike: x }), 0.3, [[0, 'on', key, 0.6]]).L, `struck at ${x}`);
    // slid while it rings: it rings on as it was struck, and the next stroke lands at x
    same(render(P(), 0.3, [[0, 'on', key, 0.6], [0.1, 'msg', slide(key, x)], [0.2, 'on', key, 0.8]]).L,
      render(P(), 0.3, [[0, 'on', key, 0.6], [0.1, 'params', P({ strike: x })], [0.2, 'on', key, 0.8]]).L, `struck at ${x}, slid`);
  }
  // a gong beside it keeps the knob's strike point: the pair is its two gongs, apart
  const pair = render(P(), 0.3, [[0, 'msg', slide(key, 0.7)], [0, 'on', key, 0.5], [0, 'on', 64, 0.5]]).L;
  const a = render(P({ strike: 0.7 }), 0.3, [[0, 'on', key, 0.5]]).L, b = render(P(), 0.3, [[0, 'on', 64, 0.5]]).L;
  let d = 0, pk = 0;
  for (let i = 0; i < pair.length; i++) { d = Math.max(d, Math.abs(pair[i] - a[i] - b[i])); pk = Math.max(pk, Math.abs(pair[i])); }
  assert.ok(d < 1e-5 * pk, `differs by ${(d / pk).toExponential(2)} of the peak`);
  // and back to none (NaN): bit-identical
  same(render(P(), 0.2, [[0, 'msg', slide(key, 0.7)], [0, 'msg', slide(key, NaN)], [0, 'on', key, 0.5], [0.05, 'msg', slide(64, 0.3)], [0.05, 'msg', slide(64, NaN)], [0.1, 'on', 64, 0.5]]).L,
    render(P(), 0.2, [[0, 'on', key, 0.5], [0.1, 'on', 64, 0.5]]).L, 'slid and back');
});
test('stability: each note\'s own strike point swept centre to rim every block, on chords struck ff again and again, at 44.1, 48 and 96 kHz', () => {
  // the chord's peak, against the same chord struck at the centre and at the rim by the knob
  const chord = (fs, o, slid) => {
    const e = new GongEngine(fs);
    e.setParams(P(o));
    const keys = [40, 57, 79], L = new Float32Array(128), R = new Float32Array(128);
    let pk = 0;
    for (let b = 0, n = Math.round((0.25 * fs) / 128); b < n; b++) {
      if (slid) keys.forEach((k, i) => e.handle(slide(k, 0.475 + 0.475 * Math.sin(b / (2 + i)))));
      if (b % 15 === 0) for (const k of keys) e.noteOn(k, 1);
      e.process(L, R, 128);
      for (let i = 0; i < 128; i++) { assert.ok(Number.isFinite(L[i]) && Number.isFinite(R[i]), `${fs} Hz ${JSON.stringify(o)}: NaN`); pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
    }
    return pk;
  };
  for (const fs of [44100, 48000, 96000]) for (const o of [{}, { rise: 4, thick: 0.003, speed: 12 }]) {
    const pk = chord(fs, o, true), ends = Math.max(chord(fs, { ...o, strike: 0 }), chord(fs, { ...o, strike: 0.95 }));
    assert.ok(pk < Math.max(1.5 * ends, 0.5), `${fs} Hz ${JSON.stringify(o)}: peak ${pk.toFixed(2)}, ${ends.toFixed(2)} with the knob`);
  }
});
console.log('twins');
test('every asymmetric mode has a sin twin, ε/2 higher (ε in ω²); the axisymmetric modes and the strike tone are untouched', () => {
  for (const bc of ['free', 'clamped']) {
    const S = shell(bc, 0.4, 300, 1.2), R = shell(bc, 0.4, 300, 0), T = TABLE[bc];
    assert.equal(S.N, T.modes.length + T.modes.filter((md) => md.m > 0).length, `${bc}: ${S.N} modes`);
    for (let i = 0; i < S.N; i++) {
      if (S.m[i] === 0) { assert.ok(S.fam[i] === 0 && S.Om[i] === R.Om[i], `${bc} ${S.label[i]}`); continue; }
      if (!S.fam[i]) continue;
      assert.ok(S.base[i] === S.base[i - 1] && !S.fam[i - 1] && S.label[i] === S.label[i - 1] + '′', `${bc}: ${S.label[i]} follows ${S.label[i - 1]}`);
      assert.ok(Math.abs((S.Om[i] / S.Om[i - 1]) ** 2 - 1.006 / 0.994) < 1e-12 && Math.abs(S.Om[i - 1] ** 2 * 1.006 - R.Om[i] ** 2) < 1e-9 * R.Om[i] ** 2, `${bc} ${S.label[i]}: the split`);
    }
    assert.ok(S.Om[S.tuned] === R.Om[R.tuned] && S.m[S.tuned] === 0, 'the strike tone');
  }
});
// Each twin pair (and each in-plane pair) turned by the same angle: x_c + i x_s → e^{imθ₀}(x_c + i x_s).
function turn(S, x, th) {
  const y = Float64Array.from(x);
  for (let i = 0; i < S.N; i++) if (S.fam[i]) {
    const c = Math.cos(S.m[i] * th), s = Math.sin(S.m[i] * th), a = x[i - 1], b = x[i];
    y[i - 1] = c * a - s * b; y[i] = s * a + c * b;
  }
  return y;
}
test('the twins\' couplings, built from the cos family\'s: a round gong\'s V_nl is the same turned to any angle', () => {
  // the coupling rule (cos family × the phases of the two angular orders) is right only if the
  // potential of any motion is unchanged when the whole pattern turns, as for a round gong it must be
  let rnd = 7;
  const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647 - 0.5);
  for (const [bc, rise] of [['free', 0], ['free', 1.5], ['clamped', 0.8]]) {
    const S = shell(bc, rise, 600, 0), x = Float64Array.from({ length: S.N }, (_, i) => r() / (1 + i));
    const V0 = potential(S, x).V;
    let worst = 0;
    for (const th of [0.3, 1.1, 2.5]) worst = Math.max(worst, Math.abs(potential(S, turn(S, x, th)).V / V0 - 1));
    assert.ok(worst < 1e-12, `${bc}, rise ${rise}: V changes by ${worst.toExponential(1)} when turned`);
  }
});
test('the engine\'s gradient (on complex twin amplitudes) is the dense ∇V_nl of the twins\' couplings', () => {
  let rnd = 11;
  const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647 - 0.5);
  for (const [bc, rise, key] of [['free', 0.4, 57], ['free', 2.5, 45], ['clamped', 1, 69]]) {
    const e = new GongEngine(FS); e.setParams(P({ bc, rise }));
    const S0 = keyGong(key, P({ bc, rise }), FS), x0 = Array.from({ length: S0.Nv }, (_, i) => 0.3 * r() / (1 + 0.2 * i));
    const v = e.place(key, x0), S = v.S, { V, g } = potential(S, v.x, v.N);
    let worst = 0, gmax = 0;
    for (let i = 0; i < v.N; i++) { worst = Math.max(worst, Math.abs(v.gv[i] - g[i])); gmax = Math.max(gmax, Math.abs(g[i])); }
    assert.ok(Math.abs(v.V / V - 1) < 1e-12, `${bc} ${rise}: V ${v.V} vs ${V}`);
    assert.ok(worst < 1e-12 * gmax, `${bc} ${rise}: gradient off by ${(worst / gmax).toExponential(1)} of its largest`);
    assert.ok(v.N === S0.Nv && S.fam.slice(0, v.N).filter(Boolean).length > 10, `${v.N} modes`);
  }
});
test('struck on the heavy axis only the cos twins ring (a mirror symmetry); between the axes both do', () => {
  const key = 72, p = P({ strike: 0.4, asym: 3, speed: 0.5 }), G = keyGong(key, p, FS), S = G.S;
  const on = render({ ...p, strikeAngle: 0 }, 0.3, [[0, 'on', key, 0.6]]).e.voices[0];
  assert.ok(S.fam.some((f, i) => f && i < on.N) && [...on.x].every((q, i) => !S.fam[i] || q === 0), 'on the axis: every sin twin exactly zero, even at mf');
  // the lowest pair, (2,0) and (2,0)′, 1.5 % apart (4 Hz): both peaks
  const i = S.m.findIndex((m) => m > 0), fc = (S.Om[i] * G.w0) / (2 * Math.PI), fs = (S.Om[i + 1] * G.w0) / (2 * Math.PI);
  const W = Math.round(1.2 * FS), a = Math.round(0.1 * FS);
  const between = render({ ...p, strikeAngle: 20 }, 1.4, [[0, 'on', key, 0.3]]).L, axis = render({ ...p, strikeAngle: 0 }, 1.4, [[0, 'on', key, 0.3]]).L;
  const pair = (x) => [tone(x, fc, a, a + W), tone(x, fs, a, a + W)];
  const [b1, b2] = pair(between), [a1, a2] = pair(axis);
  console.log(`        (2,0)′/(2,0): ${(b2 / b1).toFixed(2)} at 20°, ${(a2 / a1).toFixed(3)} on the axis (${fc.toFixed(1)} and ${fs.toFixed(1)} Hz)`);
  assert.ok(b2 > 0.3 * b1 && a2 < 0.02 * a1);
});
test('a perfectly round gong (ε = 0) sounds the same struck at any angle (it only turns the pattern)', () => {
  const key = 60, p = P({ asym: 0, strike: 0.35 });
  for (const vel of [0.3, 1]) {
    const a = render({ ...p, strikeAngle: 0 }, 0.05, [[0, 'on', key, vel]]).L, b = render({ ...p, strikeAngle: 37 }, 0.05, [[0, 'on', key, vel]]).L;
    let d = 0, m = 0;
    for (let i = 0; i < a.length; i++) { d = Math.max(d, Math.abs(a[i] - b[i])); m = Math.max(m, Math.abs(a[i])); }
    assert.ok(d < 1e-5 * m, `velocity ${vel}: differs by ${(d / m).toExponential(1)} of the peak`);
  }
});

// energy share above 4× the pitch, from the engine's view messages
function cascade(params, vel, key = 57, t = 0.15) {
  const msgs = [];
  render(params, t + 0.02, [[0, 'on', key, vel]], (m) => msgs.push({ t: m.t, band: Array.from(m.band), E: m.E, cents: m.cents }));
  const m = msgs.reduce((b, q) => (Math.abs(q.t - t) < Math.abs(b.t - t) ? q : b));
  return { hi: (m.band[3] + m.band[4] + m.band[5]) / m.E, top: (m.band[4] + m.band[5]) / m.E, cents: m.cents, msgs };
}
test('soft = bell, hard = crash: the energy above 8× the pitch grows by orders of magnitude with velocity', () => {
  const pp = cascade(P(), 0.15), mf = cascade(P(), 0.5), ff = cascade(P(), 1);
  assert.ok(pp.top < 1e-3, `pp: ${pp.top.toExponential(1)}`);
  assert.ok(ff.top > 0.03 && ff.top > 100 * pp.top, `ff: ${ff.top.toExponential(1)} vs pp ${pp.top.toExponential(1)}`);
  assert.ok(mf.top > pp.top && mf.top < ff.top, `mf in between: ${mf.top.toExponential(1)}`);
});
test('thinner plates are more nonlinear at the same strike (deflection in thicknesses ∝ (a/h)²)', () => {
  const thin = cascade(P({ thick: 0.005 }), 0.45), thick = cascade(P({ thick: 0.02 }), 0.45);
  assert.ok(thin.top > 30 * thick.top, `thin ${thin.top.toExponential(1)} vs thick ${thick.top.toExponential(1)}`);
});
test('pitch glides: a flat gong starts sharp and falls; a dome (rise 2.5 h) starts flat and rises', () => {
  const flat = cascade(P({ strike: 0.04, rise: 0 }), 0.4, 57, 2.1).msgs, dome = cascade(P({ strike: 0.04, rise: 2.5 }), 0.6, 57, 2.1).msgs;
  const at = (ms, t) => ms.reduce((b, q) => (Math.abs(q.t - t) < Math.abs(b.t - t) ? q : b)).cents;
  const f = [0.05, 0.5, 2].map((t) => at(flat, t)), d = [0.05, 0.5, 2].map((t) => at(dome, t));
  assert.ok(f[0] > 100 && f[1] < 0.75 * f[0] && Math.abs(f[2]) < 0.25 * f[0], `flat: ${f.map((c) => c.toFixed(0)).join(' → ')} ¢`);
  assert.ok(d[0] < -100 && d[1] > d[0] && Math.abs(d[2]) < -0.33 * d[0], `dome: ${d.map((c) => c.toFixed(0)).join(' → ')} ¢`);
});
test('level: a forte note peaks 0.1–0.5 across the keyboard; onsets are band-limited (no clicks); releases die away', () => {
  const peaks = [];
  for (const key of [36, 48, 60, 72, 84]) {
    const p = P({ release: 0.25 }), g = keyGong(key, p, FS), fTop = (g.S.Om[g.Nv - 1] * g.w0) / (2 * Math.PI);
    const { L, R } = render(p, 1.5, [[0.01, 'on', key, 0.8], [0.8, 'off', key]]), held = render(p, 0.85, [[0.01, 'on', key, 0.8]]).L;
    let pk = 0, jump = 0, pk1 = 0, rel = 0, before = 0, still = 0;
    for (let i = 1; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    const on = Math.round(0.01 * FS), off = Math.round(0.8 * FS);
    for (let i = on - 64; i < on + 960; i++) { jump = Math.max(jump, Math.abs(L[i] - L[i - 1])); pk1 = Math.max(pk1, Math.abs(L[i])); }
    for (let i = off - 960; i < off; i++) before = Math.max(before, Math.abs(L[i] - L[i - 1]));
    for (let i = off; i < off + 960; i++) { rel = Math.max(rel, Math.abs(L[i] - L[i - 1])); still = Math.max(still, Math.abs(held[i] - held[i - 1])); }
    assert.ok(pk > 0.1 && pk < 0.5, `key ${key}: peak ${pk.toFixed(3)}`);
    peaks.push(`${key}:${pk.toFixed(2)}`);
    assert.ok(jump < 1.5 * ((2 * Math.PI * fTop) / FS) * pk1, `key ${key}: onset step ${jump.toFixed(4)} exceeds the band limit of a ${fTop.toFixed(0)} Hz signal of peak ${pk1.toFixed(3)}`);
    // no click: after release no sample step exceeds those before it, or those of the same gong left ringing
    assert.ok(rel <= 1.01 * Math.max(before, still), `key ${key}: release step ${rel.toExponential(2)} vs ${before.toExponential(2)} before, ${still.toExponential(2)} undamped`);
    let tail = 0;
    for (let i = L.length - 4800; i < L.length; i++) tail = Math.max(tail, Math.abs(L[i]));
    assert.ok(tail < 1e-3 * pk, `key ${key}: after release ${tail.toExponential(1)}`);
  }
  console.log(`        peaks at velocity 0.8: ${peaks.join(' ')}`);
});
test('stability: every parameter at its min and max, ff restrikes — no NaN, peaks bounded', () => {
  const sliders = GROUPS.flatMap((g) => g.params).filter((p) => p.type !== 'select' && p.type !== 'checkbox');
  const cases = [];
  for (const p of sliders) for (const v of [p.min, p.max]) cases.push({ [p.id]: v });
  for (const bc of ['free', 'clamped']) for (const material of ['bronze', 'steel', 'aluminium']) cases.push({ bc, material, rise: 4, thick: 0.003, speed: 12 });
  let worst = 0, wc = null;
  for (const c of cases) {
    const { L, R } = render(P(c), 0.35, [[0, 'on', 40, 1], [0.05, 'on', 40, 1], [0.1, 'on', 79, 1], [0.12, 'on', 96, 1]]);
    for (let i = 0; i < L.length; i++) {
      const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      assert.ok(Number.isFinite(a), `${JSON.stringify(c)}: NaN at ${i}`);
      if (a > worst) { worst = a; wc = c; }
    }
  }
  console.log(`        loudest: ${worst.toFixed(2)} with ${JSON.stringify(wc)} (four fff strikes; the shell's limiter follows)`);
  assert.ok(worst < 4, `largest peak ${worst.toFixed(2)}`);
});
test('passivity: struck ff, through substep changes and projections, no preset ever gains energy (the guard never acts)', () => {
  for (const pr of PRESETS) for (const key of [43, 60, 79]) {
    const e = new GongEngine(FS); e.setParams(P(pr.p)); e.noteOn(key, 1);
    const v = e.voices[0], bl = new Float32Array(128), br = new Float32Array(128);
    let worst = 0;
    for (let b = 0; b < Math.round(0.4 * FS / 128); b++) { e.process(bl, br, 128); worst = Math.max(worst, v.energyD() / v.Einj); }
    assert.ok(worst < 1 + 1e-6 && v.guards === 0, `${pr.name}, key ${key}: E/E_in ${worst.toFixed(6)}, guards ${v.guards}`);
  }
});
// Six keys, each struck twice at full velocity 60 ms apart, released at 1.2 s (the review's pattern).
function sixTwice(params, fs, sec, each) {
  const e = new GongEngine(fs); e.setParams(params);
  const ev = [];
  [36, 50, 57, 64, 71, 84].forEach((k, i) => ev.push([0.02 * i, 'on', k], [0.02 * i + 0.06, 'on', k], [1.2, 'off', k]));
  ev.sort((a, b) => a[0] - b[0]);
  const bl = new Float32Array(128), br = new Float32Array(128);
  let j = 0, peak = 0, bus = 0, nan = false;
  for (let s = 0; s < sec * fs; s += 128) {
    while (j < ev.length && ev[j][0] * fs <= s) { const q = ev[j++]; if (q[1] === 'on') e.noteOn(q[2], 1); else e.noteOff(q[2]); }
    e.process(bl, br, 128);
    for (let i = 0; i < 128; i++) { const a = Math.max(Math.abs(bl[i]), Math.abs(br[i])); if (!(a < Infinity)) nan = true; else if (a > peak) peak = a; }
    for (const v of e.voices) { if (v.peak > bus) bus = v.peak; each?.(v); }
  }
  return { peak, bus, nan };
}
test('regression: a 3 ‰ clamped bronze dome (4 h) at 12 m/s, six keys struck twice (44.1 kHz) — no energy from nowhere', () => {
  // was: after a snap-through the energy ran away to 588× what the mallets gave, and the output peaked at 34
  const p = P({ thick: 0.003, rise: 4, bc: 'clamped', thermal: 0, radiation: 3, strike: 0, speed: 12, listen: 0, release: 30, terms: 2000 });
  let worst = 0;
  const r = sixTwice(p, 44100, 2, (v) => { if (v.nl) worst = Math.max(worst, v.energyD() / v.Einj); });
  assert.ok(!r.nan && worst <= 1.05, `energy up to ${worst.toFixed(3)}× what the mallets gave`);
  assert.ok(r.peak < 2, `output peak ${r.peak.toFixed(2)}`);
  console.log(`        energy ≤ ${worst.toFixed(3)}× the mallets'; output peak ${r.peak.toFixed(2)}`);
});
test('seeded random combinations of parameter extremes at 44.1 and 48 kHz: no NaN, bounded output', () => {
  const sliders = GROUPS.flatMap((g) => g.params).filter((q) => !['volume', 'room', 'velocity', ...TUNING_KEEP].includes(q.id));
  let seed = 12345, worst = { bus: 0 }, clipped = 0, n = 0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // the keyboard's tuning drawn apart, from its own sequence, so that the other parameters' combinations stay the ones they were
  let tseed = 777;
  const trnd = () => ((tseed = (tseed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const tune = (p) => { for (const q of TUNING_PARAMS) { if (trnd() < 0.5) continue; p[q.id] = q.options ? q.options[Math.floor(trnd() * q.options.length)][0] : trnd() < 0.5 ? q.min : q.max; } return p; };
  for (const fs of [44100, 48000]) for (let c = 0; c < 12; c++) {
    const p = { ...DEFAULTS };
    for (const q of sliders) {
      if (rnd() < 0.5) continue;
      if (q.type === 'select') p[q.id] = q.options[Math.floor(rnd() * q.options.length)][0];
      else p[q.id] = rnd() < 0.5 ? q.min : q.max;
    }
    tune(p);
    const r = sixTwice(p, fs, 1.6);
    assert.ok(!r.nan, `${fs} Hz, ${JSON.stringify(p)}: NaN`);
    if (r.bus > worst.bus) worst = { ...r, p, fs };
    if (r.peak > 2) clipped++;
    n++;
  }
  // (before: up to 481 on one voice's bus and 248 out; the soft clip keeps the output under 4)
  assert.ok(worst.bus < 25 && worst.peak < 4, `${worst.fs} Hz: one gong's bus peaks at ${worst.bus.toFixed(1)} (output ${worst.peak.toFixed(2)}) with ${JSON.stringify(worst.p)}`);
  console.log(`        ${n} combinations: loudest gong ${worst.bus.toFixed(1)}, the soft clip engaged in ${clipped}`);
});
test('regression: a gong cut off from its coupling (nonlinear-voice cap) keeps its pitch, then glides home', () => {
  // was: a forced switch to the linear path dropped a +184 ¢ glide to 0 in one step
  const glide = (p, key, vel, ts, cut) => {
    const e = new GongEngine(FS); e.setParams(p); e.noteOn(key, vel);
    const v = e.voices[0], t = v.S.tuned, xs = [], bl = new Float32Array(128), br = new Float32Array(128), step = v.step.bind(v);
    let at = -1;
    v.step = () => { step(); xs.push(v.x[t]); };
    for (let s = 0; s < 0.5 * FS; s += 128) { if (s >= ts * FS && at < 0) { at = xs.length; if (cut) v.linear(); } e.process(bl, br, 128); }
    const W = Math.round((4 * 2 * Math.PI) / (v.S.Om[t] * v.k)), c = (a, b) => { // zero crossings about the mean, in cents re Ω
      let m = 0; for (let i = a; i < b; i++) m += xs[i]; m /= b - a;
      const z = []; for (let i = a + 1; i < b; i++) if (xs[i - 1] < m && xs[i] >= m) z.push(i - 1 + (xs[i - 1] - m) / (xs[i - 1] - xs[i]));
      return cents((2 * Math.PI * (z.length - 1)) / ((z[z.length - 1] - z[0]) * v.k) / v.S.Om[t]);
    };
    return { before: c(at - W, at), after: c(at, at + W), m: v.m };
  };
  // (nlvoices 1: the one gong is at the cap, so it keeps the measurements a hand-over needs)
  for (const [name, p, key] of [['flat opera gong E4', P({ rise: 0, strike: 0.03, speed: 5.5, nlvoices: 1 }), 64], ['default A3', P({ nlvoices: 1 }), 57]]) {
    const ref = glide(p, key, 0.7, 0.2, false), cut = glide(p, key, 0.7, 0.2, true);
    assert.ok(cut.m === 1 && Math.abs(cut.before) > 150, `${name}: gliding ${cut.before.toFixed(0)} ¢ when cut`);
    assert.ok(Math.abs(cut.after - ref.after) < 20, `${name}: ${cut.before.toFixed(0)} → ${cut.after.toFixed(0)} ¢ when cut off, ${ref.after.toFixed(0)} ¢ left nonlinear`);
    console.log(`        ${name}: ${cut.before.toFixed(0)} → ${cut.after.toFixed(0)} ¢ when cut off, ${ref.after.toFixed(0)} ¢ left nonlinear`);
  }
});
test('Quality: Medium and Low run at most 2 and 1 gongs on the nonlinear coupling (fewer if Nonlinear voices says so) and let 12 and 8 ring at once; a phrase keeps its level (within 1.5 dB) and the cut-off gong its pitch (within 3 ¢); 20 fff gongs stay finite', () => {
  const crash = Array.from({ length: 20 }, (_, i) => [0.04 * i, 'on', 40 + 2 * i, 1]);
  const phrase = [[0, 'on', 57, 0.8], [0.25, 'on', 64, 0.8], [0.5, 'on', 50, 0.8]];
  const ref = render(P(), 1.5, phrase), mix = (r) => r.L.map((v, i) => v + r.R[i]), x0 = mix(ref), f = keyFreq(57);
  const ms = (x) => x.reduce((a, v) => a + v * v, 0) / x.length, p0 = peak(x0, f, 0.9 * FS, 1.5 * FS), res = [];
  for (const [quality, nl, ringing] of [['high', 16, 16], ['medium', 2, 12], ['low', 1, 8]]) {
    const { L, R, e } = render(P({ nlvoices: 16 }), 1.5, crash, null, quality);
    for (let i = 0; i < L.length; i++) assert.ok(Number.isFinite(L[i]) && Number.isFinite(R[i]), `${quality}: not finite`);
    const live = e.voices.filter((v) => !v.killing && !v.dead), nonlinear = live.filter((v) => v.nl).length;
    assert.ok(live.length <= ringing, `${quality}: ${live.length} gongs ringing`);
    assert.ok(nonlinear <= nl, `${quality}: ${nonlinear} gongs nonlinear`);
    const y = mix(render(P(), 1.5, phrase, null, quality)), dB = 10 * Math.log10(ms(y) / ms(x0)), c = cents(peak(y, f, 0.9 * FS, 1.5 * FS) / p0);
    assert.ok(Math.abs(dB) < 1.5, `${quality}: phrase ${dB.toFixed(2)} dB from High`);
    assert.ok(Math.abs(c) < 3, `${quality}: A3 ${c.toFixed(2)} ¢ from High`);
    res.push(`${quality} ${live.length} ringing, ${nonlinear} nonlinear, ${dB.toFixed(2)} dB, ${c.toFixed(2)} ¢`);
  }
  console.log(`        ${res.join('; ')}`);
  const four = render(P({ nlvoices: 4 }), 0.6, crash.slice(0, 6), null, 'medium').e.voices.filter((v) => v.nl && !v.killing).length;
  assert.ok(four <= 2, `medium, Nonlinear voices 4: ${four} nonlinear`);
});
// Blocks of 128 samples, timed one by one, as the AudioWorklet runs them.
function blockTimes(params, events, seconds, pedal = false) {
  const e = new GongEngine(FS); e.setParams(params); e.setSustain(pedal);
  const bl = new Float32Array(128), br = new Float32Array(128), nb = Math.round((seconds * FS) / 128), times = new Float64Array(nb);
  let maxNl = 0, cut = 0;
  for (let b = 0; b < nb; b++) {
    for (const [t, k, v] of events) if (Math.round((t * FS) / 128) === b) e.noteOn(k, v);
    const before = e.voices.slice(), t0 = performance.now();
    e.process(bl, br, 128);
    times[b] = performance.now() - t0;
    maxNl = Math.max(maxNl, e.voices.filter((u) => u.nl).length);
    for (const u of before) if (!e.voices.includes(u) && u.peak > 1e-5) cut++; // a gong that stopped while still audible
  }
  return { times, maxNl, voices: e.voiceCount(), cut };
}
test('CPU: 4 gongs struck fff, all on the full nonlinear coupling, under 30 % of real time', () => {
  const t = (keys, p) => {
    const e = new GongEngine(FS); e.setParams(p);
    for (const k of keys) e.noteOn(k, 1);
    const bl = new Float32Array(128), br = new Float32Array(128), n = Math.round((0.25 * FS) / 128);
    for (let i = 0; i < 10; i++) e.process(bl, br, 128);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) e.process(bl, br, 128);
    return { load: (performance.now() - t0) / 1000 / ((n * 128) / FS), full: e.voices.filter((v) => v.nl && v.cs === v.full).length };
  };
  const four = t([55, 60, 62, 65], P()), ten = t([48, 52, 55, 57, 60, 62, 64, 65, 67, 69], P()), tenAll = t([48, 52, 55, 57, 60, 62, 64, 65, 67, 69], P({ nlvoices: 16 }));
  console.log(`        4 voices ${(100 * four.load).toFixed(1)} %; 10 voices ${(100 * ten.load).toFixed(1)} % (${ten.full} nonlinear, the default cap), ${(100 * tenAll.load).toFixed(1)} % with all 10 nonlinear`);
  assert.equal(four.full, 4, 'all four on the full coupling');
  assert.ok(four.load < 0.3, `${(100 * four.load).toFixed(1)} %`);
});
test('no audio block much costlier than the rest: worst block of an fff melody (pedal held) ≤ 8× one gong\'s', () => {
  // the same work twice; for each block keep the faster run, which removes the machine's own hiccups
  const melody = [60, 62, 64, 65, 67, 69, 71, 72, 74, 72, 71, 69, 67, 65, 64, 62].map((k, i) => [0.05 + 0.25 * i, k, 1]);
  const a = blockTimes(P(), melody, 5, true), b = blockTimes(P(), melody, 5, true);
  const one = blockTimes(P(), [[0.05, 60, 1]], 0.35).times.slice(30, 120), base = one.reduce((s, v) => s + v, 0) / one.length;
  let worst = 0, at = 0;
  for (let i = 0; i < a.times.length; i++) { const t = Math.min(a.times[i], b.times[i]); if (t > worst) { worst = t; at = i; } }
  console.log(`        worst block ${(worst / base).toFixed(1)}× one fff gong's (${(1000 * worst).toFixed(0)} µs at ${((at * 128) / FS).toFixed(2)} s); at most ${a.maxNl} nonlinear of ${a.voices} ringing`);
  assert.ok(a.maxNl <= DEFAULTS.nlvoices, `${a.maxNl} nonlinear voices at once (cap ${DEFAULTS.nlvoices})`);
  assert.ok(a.cut === 0, `every gong rings until it has died away (${a.cut} cut off, ${a.voices} ringing at 5 s)`);
  assert.ok(worst < 8 * base, `worst block ${(worst / base).toFixed(1)}× the one-gong block`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
