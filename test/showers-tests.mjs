// Collider Showers checks. Run: node test/showers-tests.mjs
//
// The model (the C++, through showers-wasm.js) is checked against independent physics: the PDG's
// shower profile and its containment numbers, the gamma distribution integrated here, the
// Bethe–Heitler conversion length, the thermo-acoustic amplitude measured on a bar by the RAP
// experiment's formula, a finite-difference solution of the bar's wave equation, the free–free
// beam's frequency equation and its modes integrated here, and Love's rod. Then the engine against
// the model: pitch, overtones, ring times, the damper, energy and impact point, the neighbours'
// shares, pile-up, the sensors, level.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../showers/src/showers-instrument.js';
import { wasmModel } from '../showers/src/showers-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq, keyPan } from '../shared/dsp.js';

const Engine = await loadEngine(INSTRUMENT);
const M = await wasmModel();
const K = M.constants;

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });

// Render through the engine in 128-sample blocks like the AudioWorklet; events [t, fn(engine)].
function render(params, sec, events = [], onMessage) {
  const e = new Engine(FS);
  if (onMessage) e.post = onMessage;
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float32Array(n), R = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = [...events].sort((a, b) => a[0] - b[0]);
  for (let s = 0; s < n; s += bl) {
    while (ev.length && ev[0][0] * FS <= s) ev.shift()[1](e);
    e.process(bL, bR, bl);
    const m = Math.min(bl, n - s);
    L.set(bL.subarray(0, m), s); R.set(bR.subarray(0, m), s);
  }
  return [L, R, e];
}
const note = (key, params, sec, vel = 0.8, more = [], onMessage) => render(params, sec, [[0, (e) => e.noteOn(key, vel)], ...more], onMessage);
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel, scaled to a sine's amplitude).
function tone(x, f, a, b) {
  a = Math.round(a); b = Math.round(b);
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return (4 * Math.hypot(re, im)) / (b - a);
}
// The frequency of the strongest line near f in x[a, b): a golden-section search on the Goertzel.
function peak(x, f, a, b, span = 0.01) {
  let lo = f * (1 - span), hi = f * (1 + span);
  for (let i = 0; i < 60; i++) {
    const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo);
    if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1;
  }
  return (lo + hi) / 2;
}
const cents = (f, g) => 1200 * Math.log2(f / g);
const db = (r) => 20 * Math.log10(r);
const rms = (x, a = 0, b = x.length) => { a = Math.round(a); b = Math.round(b); let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
const simpson = (f, a, b, n = 2000) => { const h = (b - a) / n; let s = f(a) + f(b); for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return (s * h) / 3; };
// the regularised incomplete gamma, here by its series alone (independent of the C++'s continued fraction)
function lgamma(z) { // Lanczos (g = 7)
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1; let x = c[0]; for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
const gammaP = (a, x) => { let term = 1 / a, sum = term; for (let n = 1; n < 2000; n++) { term *= x / (a + n); sum += term; if (term < sum * 1e-16) break; } return sum * Math.exp(-x + a * Math.log(x) - lgamma(a)); };

const SL = M.slenderness(DEFAULTS.depth, DEFAULTS.width);

console.log('physics');
test('PDG\'s profile: the gamma density integrates to 1 and peaks at t_max = ln(E/Ec) + C, a photon\'s 1 X0 deeper', () => {
  for (const E of [1, 50, 2000]) for (const photonLike of [false, true]) {
    const tm = M.emTmax(E, photonLike), want = Math.log((E * 1000) / 9.64) + (photonLike ? 0.5 : -0.5);
    assert.ok(Math.abs(tm - want) < 1e-12, `${E} GeV: t_max ${tm} vs ${want}`);
    const I = simpson((t) => M.emProfile(t, tm), 1e-9, 200, 20000);
    assert.ok(Math.abs(I - 1) < 1e-4, `∫ = ${I}`);
    let best = 0, at = 0;
    for (let t = 0.01; t < 60; t += 0.01) { const v = M.emProfile(t, tm); if (v > best) { best = v; at = t; } }
    assert.ok(Math.abs(at - tm) < 0.02, `peak at ${at} vs ${tm}`);
  }
  assert.equal(K.EC_MEV, 9.64); // PDG, lead tungstate: Ec = 9.64 MeV
});
test('containment: a crystal holds the gamma profile\'s share up to its depth (the incomplete gamma, by its series)', () => {
  for (const [E, T] of [[50, 25.8], [3000, 25.8], [500, 9]]) {
    const r = M.shower('electron', E, T), a = 1 + 0.5 * M.emTmax(E);
    const want = gammaP(a, 0.5 * T);
    assert.ok(Math.abs(r.total - want) < 1e-9, `${E} GeV in ${T} X0: ${r.total} vs ${want}`);
    assert.ok(Math.abs(M.gammaShare(a, 0.5, T) - want) < 1e-12);
  }
  // and each slice holds the profile's integral over it
  const r = M.shower('electron', 50, 25.8), tm = M.emTmax(50), i = 40, T = 25.8;
  const slice = simpson((t) => M.emProfile(t, tm), (i * T) / M.NZ, ((i + 1) * T) / M.NZ, 200);
  assert.ok(Math.abs(r.q[i] / M.NZ - slice) < 1e-10, `slice ${i}: ${r.q[i] / M.NZ} vs ${slice}`);
});
test('transverse profile: 90 % within one Molière radius and 99 % within 3.5 (PDG); the row\'s shares from a 2D integral', () => {
  assert.ok(Math.abs(M.containment(1) - 0.9) < 1e-12, `R_M: ${M.containment(1)}`);
  assert.ok(Math.abs(M.containment(3.5) - 0.99) < 0.002, `3.5 R_M: ${M.containment(3.5)}`);
  // the density R²/(π (r² + R²)²), integrated over each square on a grid here
  const R = 1 / 3, rho = (x, y) => (R * R) / (Math.PI * (x * x + y * y + R * R) ** 2);
  for (const [x0, w] of [[0, 1.12], [0.25, 1.12], [0.5, 0.5], [0.1, 2.5]]) {
    for (const j of [-1, 0, 1, 2]) {
      const lo = (j - x0) * w - w / 2, n = 600, hx = w / n; let e = 0, ex = 0;
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) { const x = lo + (a + 0.5) * hx, y = -w / 2 + (b + 0.5) * hx, v = rho(x, y) * hx * hx; e += v; ex += v * x; }
      const s = M.share(x0, w, j), xbar = ex / e / w - (j - x0);
      assert.ok(Math.abs(s.e - e) < 2e-4 + 2e-3 * e, `x0 ${x0}, w ${w}, crystal ${j}: ${s.e} vs ${e}`);
      assert.ok(Math.abs(s.xbar - xbar) < 3e-3, `x0 ${x0}, w ${w}, crystal ${j}: centroid ${s.xbar} vs ${xbar}`);
    }
  }
  const c = M.share(0.5, 1.12, 0), d = M.share(0.5, 1.12, 1);
  assert.ok(Math.abs(c.e - d.e) < 1e-12 && Math.abs(c.xbar + d.xbar) < 1e-12, 'on the crack the two crystals share alike');
  assert.ok(M.share(0, 1.12, 0).e > 0.7 && M.share(0, 1.12, 0).e < 0.85, `CMS: ${M.share(0, 1.12, 0).e} in the struck crystal`);
});
test('photons convert after a Bethe–Heitler mean free path, 9/7 X0, and on average shower where PDG\'s photon profile does', () => {
  const N = 4000; let s = 0, cen = 0;
  for (let i = 0; i < N; i++) {
    const r = M.shower('photon', 50, 200, { seed: i === 0 ? 11 : -1 });
    s += r.start;
    let m0 = 0, m1 = 0; r.q.forEach((v, k) => { m0 += v; m1 += v * ((k + 0.5) / M.NZ) * 200; }); cen += m1 / m0;
  }
  s /= N; cen /= N;
  assert.ok(Math.abs(s / (9 / 7) - 1) < 0.05, `mean conversion depth ${s.toFixed(3)} X0`);
  // the gamma profile's centroid is a/b = t_max + 1/b
  const want = M.emTmax(50, true) + 2;
  assert.ok(Math.abs(cen - want) < 0.1, `centroid ${cen.toFixed(2)} vs PDG's photon profile's ${want.toFixed(2)}`);
});
test('pions: showers that vary, leak and lose energy; the trigger keeps those that leave a fifth', () => {
  const tot = [], starts = [];
  for (let i = 0; i < 300; i++) { const r = M.shower('pion', 100, 25.8, { seed: i === 0 ? 3 : -1 }); tot.push(r.total); starts.push(r.start); }
  const mean = tot.reduce((a, b) => a + b) / tot.length, sd = Math.sqrt(tot.reduce((a, b) => a + (b - mean) ** 2, 0) / tot.length);
  assert.ok(Math.min(...tot) >= 0.2, `the trigger let ${Math.min(...tot)} through`);
  assert.ok(mean < 0.75 && sd / mean > 0.15, `mean ${mean.toFixed(3)}, spread ${(sd / mean).toFixed(3)}`);
  assert.ok(Math.max(...starts) < 25.8 && starts.some((t) => t > 10), 'first interactions anywhere in the crystal');
  // Groom's ⟨f_em⟩ = 1 − (E/E0)^(m−1) rises with energy
  assert.ok(M.meanFem(10) < M.meanFem(100) && M.meanFem(100) < M.meanFem(1000) && Math.abs(M.meanFem(100) - (1 - 100 ** -0.17)) < 1e-12);
});
test('thermo-acoustics: a deposit across the middle rings the fundamental by RAP\'s B0 = 2αLW/(π c M), and only the odd modes', () => {
  // one slice at the middle holding the share W; the thermal strain's mean is αW/(cM), which is the
  // deposit's mean here, so B0/L = (2/π)·mean
  const q = new Float64Array(M.NZ), i = M.NZ / 2, W = 0.7;
  q[i] = W * M.NZ; q[i - 1] = 0; // ζ = (i + ½)/NZ, just past the middle
  const k = M.kicksOf(q, SL), z = (i + 0.5) / M.NZ;
  for (let n = 1; n <= 6; n++) {
    const want = ((2 * W) / (n * Math.PI)) * Math.sin(n * Math.PI * z);
    assert.ok(Math.abs(k.a[n - 1] - want) < 1e-12, `mode ${n}: ${k.a[n - 1]} vs ${want}`);
  }
  assert.ok(Math.abs(k.a[0] / ((2 * W) / Math.PI) - 1) < 1e-4, 'B0');
  assert.ok(Math.abs(k.a[1]) < 0.02 * k.a[0], 'the second mode hardly rung');
});
test('the bar\'s wave equation, solved by finite differences: the end moves as the model\'s modes say', () => {
  // u_tt = (u_z − ε)_z on [0, 1], free ends (u_z = ε there), from rest: c = L = 1, a period of 2
  const r = M.shower('electron', 50, 25.8), N = 512, dx = 1 / N, dt = 0.5 * dx;
  const eps = Float64Array.from({ length: N }, (_, j) => r.q[Math.floor(((j + 0.5) / N) * M.NZ)]);
  let u = new Float64Array(N + 1), v = new Float64Array(N + 1);
  const steps = Math.round(2 / dt), end = [];
  const acc = new Float64Array(N + 1);
  const accel = () => { // stress σ = u_z − ε on the cell faces, zero at the free ends
    for (let j = 0; j <= N; j++) {
      const sl = j > 0 ? (u[j] - u[j - 1]) / dx - eps[j - 1] : 0, sr = j < N ? (u[j + 1] - u[j]) / dx - eps[j] : 0;
      acc[j] = (sr - sl) / (j === 0 || j === N ? dx / 2 : dx);
    }
  };
  accel();
  for (let s = 0; s < steps; s++) { // leapfrog
    for (let j = 0; j <= N; j++) v[j] += 0.5 * dt * acc[j];
    for (let j = 0; j <= N; j++) u[j] += dt * v[j];
    accel();
    for (let j = 0; j <= N; j++) v[j] += 0.5 * dt * acc[j];
    end.push(u[N] - u[0]); // the crystal's length change: the odd modes
  }
  const k = M.kicksOf(r.q, SL);
  for (const n of [1, 3, 5]) {
    let c = 0; end.forEach((y, s) => { c += y * Math.cos(n * Math.PI * (s + 1) * dt) * dt; }); // over one period of 2
    const want = -2 * k.a[n - 1]; // u(1) − u(0) = Σ a_n ((−1)^n − 1) cos(nπt) + static
    assert.ok(Math.abs(c - want) < 0.01 * Math.abs(k.a[0]) + 0.01 * Math.abs(want), `mode ${n}: ${c.toExponential(4)} vs ${want.toExponential(4)}`);
  }
});
test('free–free beam: cos βL cosh βL = 1, and the modes are orthonormal with φ = ±2 at the ends and no curvature there', () => {
  for (let m = 0; m < M.MAX_FLEX; m++) {
    const b = M.BETA_L[m];
    assert.ok(Math.abs(Math.cos(b) * Math.cosh(b) - 1) < 1e-8 * Math.cosh(b), `root ${m + 1}: ${b}`);
    assert.ok(Math.abs(Math.abs(M.flexShape(m, 0)) - 2) < 1e-9 && Math.abs(Math.abs(M.flexShape(m, 1)) - 2) < 1e-6, `ends of mode ${m + 1}`);
    assert.ok(Math.abs(M.flexCurvature(m, 0)) < 1e-8 * b * b && Math.abs(M.flexCurvature(m, 1)) < 1e-6 * b * b, `curvature at the ends of ${m + 1}`);
    for (let n = 0; n <= m; n++) {
      const I = simpson((z) => M.flexShape(m, z) * M.flexShape(n, z), 0, 1, 4000);
      assert.ok(Math.abs(I - (m === n ? 1 : 0)) < 1e-6, `∫φ${m + 1}φ${n + 1} = ${I}`);
    }
    const z = 0.37, h = 1e-4, fd = (M.flexShape(m, z + h) - 2 * M.flexShape(m, z) + M.flexShape(m, z - h)) / (h * h);
    assert.ok(Math.abs(fd - M.flexCurvature(m, z)) < 1e-4 * b * b, `φ'' of ${m + 1}`);
  }
});
test('bending: the heat\'s thermal curvature, integrated twice here, projects onto the beam\'s modes as the model kicks them', () => {
  const r = M.shower('electron', 20, 25.8), k = M.kicksOf(r.q, SL), N = M.NZ;
  // y'' = −12 x̄ (L/w) q per unit x̄: integrate twice, then take away the rigid motions (1, ζ − ½)
  const ypp = Array.from({ length: N }, (_, i) => -12 * SL * r.q[i]);
  const yp = new Float64Array(N), y = new Float64Array(N);
  let s1 = 0; for (let i = 0; i < N; i++) { s1 += ypp[i] / N; yp[i] = s1 - ypp[i] / (2 * N); }
  let s0 = 0; for (let i = 0; i < N; i++) { s0 += yp[i] / N; y[i] = s0 - yp[i] / (2 * N); }
  const zs = Array.from({ length: N }, (_, i) => (i + 0.5) / N);
  const dot = (f, g) => f.reduce((s, v, i) => s + v * g[i], 0) / N;
  const one = zs.map(() => 1), tilt = zs.map((z) => z - 0.5);
  const a0 = dot(y, one), a1 = dot(y, tilt) / dot(tilt, tilt);
  const yr = y.map((v, i) => v - a0 - a1 * tilt[i]);
  for (let m = 0; m < 5; m++) {
    const phi = zs.map((z) => M.flexShape(m, z)), b = -dot(yr, phi);
    assert.ok(Math.abs(b - k.b[m]) < 2e-3 * Math.abs(k.b[0]) + 0.01 * Math.abs(b), `bending ${m + 1}: ${b.toExponential(4)} vs ${k.b[m].toExponential(4)}`);
  }
});
test('Love\'s rod: lateral inertia flattens the n-th stretching mode to n√((1+g)/(1+g n²)), g = (νπ r_p/L)²; Euler–Bernoulli bending', () => {
  for (const s of [SL, 4, 40]) {
    const g = (0.3 * Math.PI) ** 2 / (6 * s * s);
    for (const n of [1, 2, 5, 8]) assert.ok(Math.abs(M.longRatio(n, s) - n * Math.sqrt((1 + g) / (1 + g * n * n))) < 1e-12);
    // a bar of c0 = 1, length s, width 1: f_bend = β²/(2π s²) · w/√12, f_1 = 1/(2s)/√(1 + g)
    for (let m = 0; m < 4; m++) {
      const fb = (M.BETA_L[m] ** 2 / (2 * Math.PI * s * s)) * (1 / Math.sqrt(12)), f1 = 1 / (2 * s) / Math.sqrt(1 + g);
      assert.ok(Math.abs(M.flexRatio(m, s) - fb / f1) < 1e-12, `bending ${m + 1} at L/w ${s}`);
    }
  }
  assert.ok(Math.abs(M.longRatio(10, 1000) / 10 - 1) < 1e-5, 'a slender rod is harmonic');
  // CMS's crystal: 23 cm of PbWO4 (25.8 X0 of 0.89 cm) by 2.2 cm (1.12 R_M of 1.96 cm)
  assert.ok(Math.abs(SL - (25.8 * 0.8904) / (1.12 * 1.959)) < 0.01, `L/w ${SL}`);
});

console.log('engine');
test('tuning: every key\'s first stretching mode is its note (accelerometer)', () => {
  let worst = 0, wk = 0;
  for (let key = 21; key <= 108; key += 1) {
    const sec = Math.max(0.45, 40 / keyFreq(key)); // forty periods at least, to tell it from its neighbours
    const [L, R] = note(key, P({ sensor: 'accel' }), sec, 0.8);
    const a = 0.05 * FS, b = sec * FS, x = L.map((v, i) => v + R[i]);
    const f = peak(x, keyFreq(key), a, b, 0.004);
    if (Math.abs(cents(f, keyFreq(key))) > Math.abs(worst)) worst = cents(f, keyFreq(key)), wk = key;
  }
  assert.ok(Math.abs(worst) < 1, `worst ${worst.toFixed(2)} ¢ at key ${wk}`);
});
test('overtones: the second and third stretching modes where Love\'s rod puts them', () => {
  const [L] = note(48, P({ sensor: 'accel', energy: 2 }), 1.5);
  for (const n of [2, 3]) {
    const want = keyFreq(48) * M.longRatio(n, SL), f = peak(L, want, 0.1 * FS, 1.5 * FS, 0.004);
    assert.ok(Math.abs(cents(f, want)) < 1, `mode ${n}: ${f.toFixed(2)} vs ${want.toFixed(2)}`);
  }
});
test('ring time: a held key rings for its Q, T60 = Q ln 1000/(π f); let go, the damper\'s Q', () => {
  const key = 57, f = keyFreq(key), Q = 800, Qd = 30;
  const [L] = note(key, P({ sensor: 'accel', q: Q, damper: Qd }), 4, 0.8);
  const a1 = tone(L, f, 0.2 * FS, 0.7 * FS), a2 = tone(L, f, 2.2 * FS, 2.7 * FS);
  const T60 = (2 * Math.log(1000)) / Math.log(a1 / a2), want = (Q * Math.log(1000)) / (Math.PI * f);
  assert.ok(Math.abs(T60 / want - 1) < 0.03, `held: ${T60.toFixed(2)} s vs ${want.toFixed(2)} s`);
  const [L2] = note(key, P({ sensor: 'accel', q: Q, damper: Qd }), 1.2, 0.8, [[0.3, (e) => e.noteOff(key)]]);
  const b1 = tone(L2, f, 0.35 * FS, 0.45 * FS), b2 = tone(L2, f, 0.45 * FS, 0.55 * FS);
  const sig = Math.log(b1 / b2) / 0.1, wantSig = (Math.PI * f) / Q + (Math.PI * f) / Qd;
  assert.ok(Math.abs(sig / wantSig - 1) < 0.05, `released: σ ${sig.toFixed(2)} vs ${wantSig.toFixed(2)}`);
  const [L3] = note(key, P({ sensor: 'accel', q: Q, damper: Qd }), 1.2, 0.8, [[0.05, (e) => e.setSustain(true)], [0.3, (e) => e.noteOff(key)]]);
  assert.ok(tone(L3, f, 0.8 * FS, 1.2 * FS) > 50 * tone(L2, f, 0.8 * FS, 1.0 * FS + 1), 'the pedal keeps the dampers off');
});
test('engine against model: the harmonics\' levels are the model\'s kicks times the sensor', () => {
  for (const [energy, sensor] of [[2, 'piezo'], [50, 'piezo'], [3000, 'accel']]) {
    const p = P({ energy, sensor }), vel = 0.8;
    const [L, R] = note(60, p, 1.2, vel);
    const x = L.map((v, i) => v + R[i]), modes = M.modes(60, p), k = M.shower('electron', vel * energy, p.depth, { slender: SL }).kicks;
    const lv = (n) => Math.abs(modes[n - 1].hear * k.a[n - 1]);
    for (const n of [2, 3, 4]) {
      if (lv(n) < 0.01 * lv(1)) continue;
      const f1 = modes[0].f, fn = modes[n - 1].f, s1 = modes[0].sigma, sn = modes[n - 1].sigma;
      // over the window [0.2, 0.6] s each has decayed by its own rate: compare at the window's start
      const m1 = tone(x, f1, 0.2 * FS, 0.6 * FS) / Math.exp(-s1 * 0.2) / avgDecay(s1), mn = tone(x, fn, 0.2 * FS, 0.6 * FS) / Math.exp(-sn * 0.2) / avgDecay(sn);
      const got = db(mn / m1), want = db(lv(n) / lv(1));
      assert.ok(Math.abs(got - want) < 1, `${energy} GeV, ${sensor}, mode ${n}: ${got.toFixed(2)} dB vs ${want.toFixed(2)} dB`);
    }
  }
  function avgDecay(s) { // a Hann window's weighted mean of e^(−s t) over 0.4 s
    return simpson((t) => (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 0.4)) * Math.exp(-s * t), 0, 0.4, 400) / 0.2;
  }
});
test('energy: higher energies shower deeper, so the even harmonics fall and the note darkens', () => {
  const cen = (E) => { const r = M.shower('electron', E, 25.8); let a = 0, b = 0; r.q.forEach((v, i) => { a += v; b += v * (i + 0.5); }); return b / a / M.NZ; };
  assert.ok(cen(1) < cen(50) && cen(50) < cen(3000), `centroids ${cen(1).toFixed(3)}, ${cen(50).toFixed(3)}, ${cen(3000).toFixed(3)}`);
  const ratio = (energy) => {
    const [L] = note(60, P({ energy, sensor: 'accel' }), 0.8, 1);
    return tone(L, M.modes(60, P())[1].f, 0.05 * FS, 0.8 * FS) / tone(L, keyFreq(60), 0.05 * FS, 0.8 * FS);
  };
  assert.ok(ratio(3000) < 0.5 * ratio(2), `second harmonic over the first: ${ratio(2).toFixed(3)} at 2 GeV, ${ratio(3000).toFixed(3)} at 3 TeV`);
});
test('impact point: on the axis the crystal does not bend; off it the bending modes ring, by the heat\'s centroid', () => {
  const key = 72, W = 3, fb = keyFreq(key) * M.flexRatio(0, M.slenderness(DEFAULTS.depth, W));
  const lvl = (offset) => { const [L] = note(key, P({ offset, width: W }), 0.6, 0.8); return tone(L, fb, 0.05 * FS, 0.6 * FS); };
  const z = lvl(0), a = lvl(0.1), b = lvl(0.2);
  assert.ok(z < 0.01 * a, `on the axis ${z.toExponential(2)}, off it ${a.toExponential(2)}`);
  const sa = M.share(0.1, W, 0), sb = M.share(0.2, W, 0), want = (sb.e * sb.xbar) / (sa.e * sa.xbar);
  assert.ok(Math.abs(b / a / want - 1) < 0.05, `bending ×${(b / a).toFixed(3)} vs ×${want.toFixed(3)}`);
});
test('neighbours: a shower wider than its crystal rings the keys either side by their shares', () => {
  const p = P({ width: 0.5, sensor: 'accel', offset: 0.2 }), key = 60;
  const [L, R] = render(p, 0.6, [[0, (e) => e.setSustain(true)], [0, (e) => e.noteOn(key, 0.8)]]);
  // each key's pan is equal-power, so l·L + r·R holds its crystal's whole amplitude
  const amp = (k) => { const [l, r] = keyPan(k); return tone(L.map((v, i) => v * l + R[i] * r), keyFreq(k), 0.03 * FS, 0.5 * FS); };
  for (const j of [-1, 1]) {
    const got = amp(key + j) / amp(key), want = M.share(0.2, 0.5, j).e / M.share(0.2, 0.5, 0).e;
    assert.ok(Math.abs(db(got / want)) < 0.5, `key ${j > 0 ? '+' : ''}${j}: ${db(got).toFixed(2)} dB vs ${db(want).toFixed(2)} dB`);
  }
  assert.ok(amp(key + 1) > amp(key - 1), 'the shower leans toward the key it lands nearer');
});
test('pile-up: a held key keeps ringing while particles land, pressure adds more, letting go stops it', () => {
  const key = 64, f = keyFreq(key), p = P({ pileup: 150, q: 300 });
  const [L] = note(key, p, 3, 0.8, [[2, (e) => e.noteOff(key)]]);
  const [Lq] = note(key, P({ q: 300 }), 3, 0.8, [[2, (e) => e.noteOff(key)]]);
  const late = tone(L, f, 1.5 * FS, 2 * FS), quiet = tone(Lq, f, 1.5 * FS, 2 * FS);
  assert.ok(late > 10 * quiet, `held with pile-up ${late.toExponential(2)} vs without ${quiet.toExponential(2)}`);
  assert.ok(rms(L, 2.6 * FS, 3 * FS) < 0.05 * rms(L, 1.5 * FS, 2 * FS), 'it stops when the key comes up');
  const [Lp] = note(key, P({ q: 300 }), 2, 0.8, [[0.1, (e) => e.handle({ type: 'pressure', value: 1, key })]]);
  assert.ok(tone(Lp, f, 1.5 * FS, 2 * FS) > 10 * quiet, 'key pressure adds pile-up');
});
test('pions: no two notes alike, and quieter than electrons', () => {
  const lv = [];
  const [L] = render(P({ particle: 'pion', energy: 100 }), 6, Array.from({ length: 6 }, (_, i) => [i, (e) => e.noteOn(60, 0.8)]).flatMap((x, i) => [x, [i + 0.9, (e) => e.noteOff(60)]]));
  for (let i = 0; i < 6; i++) lv.push(rms(L, i * FS, (i + 0.3) * FS));
  const [Le] = render(P({ energy: 100 }), 2, [[0, (e) => e.noteOn(60, 0.8)], [0.9, (e) => e.noteOff(60)], [1, (e) => e.noteOn(60, 0.8)]]);
  const e1 = rms(Le, 0, 0.3 * FS), e2 = rms(Le, FS, 1.3 * FS);
  assert.ok(Math.abs(db(e2 / e1)) < 0.5, `electrons: ${db(e2 / e1).toFixed(2)} dB apart`);
  assert.ok(db(Math.max(...lv) / Math.min(...lv)) > 2, `pions: ${lv.map((v) => db(v / e1).toFixed(1)).join(', ')} dB`);
  assert.ok(lv.reduce((a, b) => a + b) / lv.length < e1, 'quieter on average');
});
test('sensors: a piezo in the middle misses the even harmonics; the accelerometer misses the bending', () => {
  const key = 55, f2 = M.modes(key, P())[1].f;
  const [L] = note(key, P({ piezo: 0.5, energy: 2 }), 0.6), [Lb] = note(key, P({ piezo: 0.3, energy: 2 }), 0.6);
  assert.ok(tone(L, f2, 0.05 * FS, 0.6 * FS) < 1e-3 * tone(Lb, f2, 0.05 * FS, 0.6 * FS), 'second harmonic at the middle');
  const fb = keyFreq(key) * M.flexRatio(1, SL);
  const [La] = note(key, P({ sensor: 'accel', offset: 0.3 }), 0.6), [Lp] = note(key, P({ offset: 0.3 }), 0.6);
  assert.ok(tone(La, fb, 0.05 * FS, 0.6 * FS) < 1e-3 * tone(Lp, fb, 0.05 * FS, 0.6 * FS), 'no bending on the accelerometer');
});
test('level: a forte note peaks between 0.05 and 0.6; chords and every preset stay finite; silence after release', () => {
  const [L] = note(60, P(), 1, 1);
  const pk = Math.max(...L.map(Math.abs));
  assert.ok(pk > 0.05 && pk < 0.6, `peak ${pk.toFixed(3)}`);
  for (const [i, pr] of PRESETS.entries()) {
    const p = { ...DEFAULTS, ...pr.p };
    const [A, B, e] = render(p, 2.5, [36, 48, 60, 67, 76, 88, 100].flatMap((k) => [[0, (x) => x.noteOn(k, 1)], [1, (x) => x.noteOff(k)]]));
    for (const v of A) assert.ok(Number.isFinite(v) && Math.abs(v) < 4, `preset ${i} (${pr.name}): ${v}`);
    assert.ok(rms(A, 2.2 * FS, 2.5 * FS) < 3e-3, `preset ${i} (${pr.name}) after release: ${rms(A, 2.2 * FS, 2.5 * FS)}`);
    assert.ok(e.voiceCount() <= 32, `voices ${e.voiceCount()}`);
    void B;
  }
});
test('voices: finished crystals are dropped, and fast playing never runs past the voice limit', () => {
  const [, , e] = note(60, P(), 3, 0.8, [[0.2, (x) => x.noteOff(60)]]);
  assert.equal(e.voiceCount(), 0);
  const ev = [];
  for (let i = 0; i < 80; i++) ev.push([i * 0.01, (x) => x.noteOn(21 + i, 1)]);
  const [A, , e2] = render(P({ width: 0.5 }), 1.2, ev);
  assert.ok(e2.voiceCount() <= 64 && A.every(Number.isFinite));
});
test('CPU: ten held voices with pile-up render well faster than real time', () => {
  const t0 = performance.now();
  render(P({ pileup: 200 }), 5, Array.from({ length: 10 }, (_, i) => [0, (e) => e.noteOn(40 + 4 * i, 0.8)]));
  const dt = (performance.now() - t0) / 1000;
  assert.ok(dt < 1.5, `${dt.toFixed(2)} s for 5 s of audio`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall ok');
process.exit(failures ? 1 : 0);
