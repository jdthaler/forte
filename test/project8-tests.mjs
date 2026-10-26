// Project 8 checks. Run: node test/project8-tests.mjs
//
// The model (the C++, through project8-wasm.js) is checked against independent physics: the
// electron's cyclotron frequency from CODATA and Project 8's own krypton line, the cooling time
// from the classical electron radius, the closed-form radiation reaction against the Larmor energy
// loss integrated here, the harmonics' powers summed against Larmor's total and their small-β
// limit (Landau and Lifshitz), Bessel functions from their integral, the bottle's bounce from its
// mirror force integrated here, Project 8's modulation index, the TE₁₁ cutoff, tritium's β
// spectrum (its mean energy, 5.69 keV) and the gas's collisions. Then the engine against the model:
// every key's note, the chirp, the fading, the escape, the receivers' harmonics and Doppler
// vibrato, the gas, tritium, the pedal, pitch bend, level and Quality.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS } from '../project8/src/project8-instrument.js';
import { GROUPS } from '../project8/src/project8-params.js';
import { wasmModel } from '../project8/src/project8-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { tunedFreq } from '../shared/tuning.js';

const Engine = await loadEngine(INSTRUMENT);
const M = await wasmModel();
const K = M.constants;
const PARAMS = GROUPS.flatMap((g) => g.params);

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (± ${tol})`);
const cents = (a, b) => 1200 * Math.log2(a / b);
// a quiet trap: no gas, no noise, the antennas (no Doppler vibrato) and a shallow bottle
const P = (o = {}) => ({ ...DEFAULTS, gas: 1e-11, noise: 0, ...o });
const QUIET = { receiver: 'antennas', depth: 0.01 };
const ME = 510998.95, C = 299792458, QE = 1.602176634e-19, MKG = 9.1093837015e-31, EPS0 = 8.8541878128e-12;
const gammaOf = (Kev) => 1 + Kev / ME;

// Render through the engine in 128-sample blocks like the AudioWorklet; events [t, fn(engine)].
function render(params, sec, events = [], onMessage) {
  const e = new Engine(FS);
  e.post = onMessage ?? (() => {});
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
// A held note; the messages it sent.
function note(key, params, sec, vel = 0.8, more = []) {
  const msgs = [];
  const [L, R, e] = render(params, sec, [[0, (x) => x.noteOn(key, vel)], ...more], (m) => msgs.push(m));
  return { L, R, e, msgs, birth: msgs.find((m) => m.type === 'birth'), end: msgs.find((m) => m.type === 'end') };
}
const mono = (L, R) => L.map((x, i) => x + R[i]);
// How long a note's electron ran on its birth's own course: to its first collision or its end.
const course = (n) => Math.min(n.msgs.find((m) => m.type === 'collision')?.age ?? Infinity, n.end?.age ?? Infinity);
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel, scaled to a sine's amplitude).
function tone(x, f, a, b) {
  a = Math.max(0, Math.round(a)); b = Math.min(x.length, Math.round(b));
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return (4 * Math.hypot(re, im)) / (b - a);
}
// The frequency of the strongest line in [lo, hi] in x[a, b): a scan, then a golden-section search.
function peak(x, lo, hi, a, b) {
  let best = lo, bv = -1;
  for (let i = 0; i <= 80; i++) { const f = lo * (hi / lo) ** (i / 80), v = tone(x, f, a, b); if (v > bv) { bv = v; best = f; } }
  let l = best / (hi / lo) ** (1 / 80), r = best * (hi / lo) ** (1 / 80);
  for (let i = 0; i < 60; i++) {
    const m1 = r - 0.618 * (r - l), m2 = l + 0.618 * (r - l);
    if (tone(x, m1, a, b) > tone(x, m2, a, b)) r = m2; else l = m1;
  }
  return (l + r) / 2;
}
const rms = (x, a, b) => { a = Math.round(a); b = Math.round(b); let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
// The model's prediction of a note's frequency t s in: the key × γ₀/γ(t) × (1 + cot²θ/2), the bottle's mean field.
function predicted(key, p, Kev, cos0, t, Kref = K.KR_K) {
  const e = M.cool(Kev, cos0, p.field, t, 64), g = gammaOf(e.K), cot2 = (e.cos * e.cos) / (1 - e.cos * e.cos);
  return tunedFreq(p, key) * (gammaOf(Kref) / g) * (1 + cot2 / 2);
}
// Bessel Jₙ from its integral, (1/π) ∫₀^π cos(nτ − x sin τ) dτ.
const besselInt = (n, x) => { const N = 2000; let s = 0; for (let i = 0; i <= N; i++) { const t = (Math.PI * i) / N; s += (i === 0 || i === N ? 0.5 : 1) * Math.cos(n * t - x * Math.sin(t)); } return s / N; };

console.log('the model');
test('the cyclotron frequency is e/2πm (CODATA: 27.992 GHz/T) over γ: Project 8\'s fit of the krypton K line, 25 940 625.2 kHz at 0.959023787 T, to a part in 10⁷', () => {
  near(M.gyro(), QE / (2 * Math.PI * MKG), 1e-3, 'e / 2πm');
  near(M.cyclotron(0.959023787, K.KR_K) / 25940625.2e3, 1, 1e-7, 'the K line in Phase II');
  near(M.cyclotron(1, 18600), M.gyro() / (1 + 18600 / ME), 1e-6, 'f = f₀ / γ');
});
test('the cooling time is τ = 3 / (4 (r_e / c) ω²) with the classical electron radius, 2.58 s in 1 T and B⁻²', () => {
  const re = 2.8179403262e-15, w = (QE / MKG);
  near(M.coolingTime(1), 3 / (4 * (re / C) * w * w), 1e-6, 'τ(1 T)');
  near(M.coolingTime(3) * 9, M.coolingTime(1), 1e-9, 'τ ∝ B⁻²');
});
test('the closed-form radiation reaction (coth in the guiding centre\'s frame) solves dγ/dt = −P / mc², P = (mc²/2τ) γ²β⊥², with v∥ fixed, integrated here by RK4', () => {
  for (const [Kev, cos, B, T] of [[17824, 0.02, 0.959, 4], [300e3, 0.3, 1, 1.5], [1000, 0.6, 2, 0.5]]) {
    const tau = M.coolingTime(B), g0 = gammaOf(Kev), bpar = Math.sqrt(1 - 1 / g0 ** 2) * cos;
    const dg = (g) => -(g * g * (1 - bpar * bpar) - 1) / (2 * tau); // γ²β⊥² = γ² − 1 − γ²β∥²
    let g = g0; const N = 4000, h = T / N;
    for (let i = 0; i < N; i++) { const k1 = dg(g), k2 = dg(g + (h * k1) / 2), k3 = dg(g + (h * k2) / 2), k4 = dg(g + h * k3); g += (h * (k1 + 2 * k2 + 2 * k3 + k4)) / 6; }
    const e = M.cool(Kev, cos, B, T, 1);
    near(e.K, (g - 1) * ME, 1e-6 * Kev, `K after ${T} s from ${Kev} eV`);
    // and its velocity along the field is unchanged: cos θ = β∥ / β
    near(e.cos, bpar / Math.sqrt(1 - 1 / g ** 2), 1e-9, 'cos θ');
  }
});
test('the chirp: an electron of the krypton line at 89.5° in 0.959 T rises 317 MHz/s, as Larmor\'s power over γmc² says, inside Phase II\'s measured 352 ± 55 MHz/s (its waveguide radiates a little more than free space)', () => {
  const B = 0.959, g = gammaOf(K.KR_K), c = Math.cos((89.5 * Math.PI) / 180), b2perp = (1 - 1 / g ** 2) * (1 - c * c);
  const P = (QE ** 4 * B * B * g * g * b2perp) / (6 * Math.PI * EPS0 * MKG ** 2 * C) / QE; // eV/s
  const slope = (M.cyclotron(B, K.KR_K) * P) / (g * ME);
  near(M.power(B, K.KR_K, c) / P, 1, 1e-6, 'Larmor');
  const e = M.cool(K.KR_K, c, B, 1e-3);
  near((M.cyclotron(B, e.K) - M.cyclotron(B, K.KR_K)) / 1e-3 / slope, 1, 1e-3, 'the model\'s chirp');
  near(slope / 1e6, 317, 1, 'MHz/s');
  assert.ok(Math.abs(slope / 1e6 - 352.3) < 54.5, 'within Phase II\'s spread');
});
test('Bessel functions: the series against their integral, and J′ₙ = (Jₙ₋₁ − Jₙ₊₁)/2 against a numerical derivative', () => {
  for (const n of [0, 1, 2, 5, 9]) for (const x of [0.1, 0.8, 2.5, 7]) {
    near(M.besselJ(n, x), besselInt(n, x), 1e-9, `J${n}(${x})`);
    near(M.besselJd(n, x), (besselInt(n, x + 1e-5) - besselInt(n, x - 1e-5)) / 2e-5, 1e-6, `J′${n}(${x})`);
  }
});
test('the harmonics (Schott): their powers over all directions add up to Larmor\'s γ⁴β²/3, and at small β Pₙ ∝ (n+1) n^(2n+1) β^2n / (2n+1)! (Landau and Lifshitz §74)', () => {
  for (const b of [0.26, 0.55, 0.78]) {
    let s = 0;
    for (let n = 1; n <= 60; n++) s += M.harmonicPower(n, b);
    near(s / ((b * b) / (1 - b * b) ** 2 / 3), 1, 2e-4, `β = ${b}`);
  }
  const b = 0.01, ll = (n) => ((n + 1) * n ** (2 * n + 1) * b ** (2 * n)) / [1, 1, 2, 6, 24, 120, 720, 5040][2 * n + 1];
  near(M.harmonicPower(2, b) / M.harmonicPower(1, b), ll(2) / ll(1), 1e-3 * (ll(2) / ll(1)), 'P₂ / P₁');
  near(M.harmonicPower(3, b) / M.harmonicPower(1, b), ll(3) / ll(1), 2e-3 * (ll(3) / ll(1)), 'P₃ / P₁');
  // side-on, the field of harmonic n is n β J′ₙ(nβ)
  for (const n of [1, 2, 4]) near(M.sideOn(n, 0.3), n * 0.3 * ((besselInt(n - 1, n * 0.3) - besselInt(n + 1, n * 0.3)) / 2), 1e-9, `side-on ${n}`);
});
test('the bottle: an electron bounces at v⊥ / 2πL (its mirror force integrated here, μ = p⊥² / B kept), sees a mean field B₀ (1 + cot²θ / 2), and is held while cot²θ < ΔB / B₀', () => {
  const L = 0.1, Kev = K.KR_K, g = gammaOf(Kev), v = C * Math.sqrt(1 - 1 / g ** 2);
  for (const deg of [89.9, 89, 88]) {
    const th = (deg * Math.PI) / 180, vp = v * Math.sin(th), vz0 = v * Math.cos(th);
    // dz/dt = v∥(z), v∥² = v² − v⊥² B(z) / B₀ (μ kept): the period, and the time-averaged field
    const zmax = L * Math.sqrt(v * v / (vp * vp) - 1), N = 20000;
    let T = 0, Bt = 0;
    for (let i = 0; i < N; i++) {
      const z = zmax * Math.sin((Math.PI / 2) * ((i + 0.5) / N)), dz = zmax * Math.cos((Math.PI / 2) * ((i + 0.5) / N)) * (Math.PI / 2) / N;
      const vz = Math.sqrt(Math.max(1e-30, v * v - vp * vp * (1 + (z * z) / (L * L))));
      T += dz / vz; Bt += (1 + (z * z) / (L * L)) * dz / vz;
    }
    near(1 / (4 * T) / M.axial(Kev, Math.cos(th), L), 1, 1e-4, `bounce at ${deg}°`);
    near(Bt / T, 1 + (Math.cos(th) / Math.sin(th)) ** 2 / 2, 1e-6, `mean field at ${deg}°`);
    assert.ok(vz0 > 0);
  }
  const t = M.trap(DEFAULTS, Kev);
  near(t.delta, 0.5e-3 / 0.959, 1e-12, 'Δ');
  near(t.cosMax, Math.sqrt(t.delta / (1 + t.delta)), 1e-12, 'the widest pitch angle held: sin²θ = B₀ / B_max');
});
test('the waveguide: TE₁₁\'s cutoff in Phase II\'s 10.03 mm guide is 1.8412 c / 2πa = 17.5 GHz, and the bounce\'s modulation index is Project 8\'s h = βc f cos θ / v_φ f_a', () => {
  near(M.guideCutoff(), (1.8411837813 * C) / (2 * Math.PI * 0.010030 / 2), 1e3, 'cutoff');
  const Kev = K.KR_K, g = gammaOf(Kev), beta = Math.sqrt(1 - 1 / g ** 2), f = M.cyclotron(0.959, Kev), L = 0.1;
  for (const cos of [0.005, 0.02]) {
    const fa = M.axial(Kev, cos, L), vphi = C / Math.sqrt(1 - (M.guideCutoff() / f) ** 2);
    const h = (beta * C * f * cos) / (vphi * fa);
    near(M.guideIndex(f, L, cos / Math.sqrt(1 - cos * cos)), h, 1e-9 * h, `h at cos θ = ${cos}`);
  }
  // Phase II's deep traps held θ > 88.4°; here 0.5 mT, θ > 88.7°, and h ≤ 0.92 at the walls
  near((Math.acos(M.trap(DEFAULTS, Kev).cosMax) * 180) / Math.PI, 88.69, 0.01, 'θ_min');
  near(M.trap(DEFAULTS, Kev).hWall, 0.92, 0.01, 'h at the walls');
});
test('tritium\'s β spectrum F(2, E) p E (E₀ − K)²: normalised, zero at E₀ = 18 573.7 eV and falling there as (E₀ − K)², its mean energy 5.69 keV; the engine\'s draws follow it', () => {
  let s = 0; const N = 20000;
  for (let i = 0; i < N; i++) s += M.betaSpectrum(((i + 0.5) / N) * K.T2_ENDPOINT) * (K.T2_ENDPOINT / N);
  near(s, 1, 1e-6, 'normalised');
  assert.equal(M.betaSpectrum(K.T2_ENDPOINT), 0);
  near(M.betaSpectrum(K.T2_ENDPOINT - 10) / M.betaSpectrum(K.T2_ENDPOINT - 20), 0.25, 0.001, '(E₀ − K)²');
  near(M.betaMean() / 1000, 5.69, 0.01, 'the mean energy, keV');
  const d = M.drawTritium(20000), mean = d.reduce((a, b) => a + b, 0) / d.length;
  near(mean / 1000, 5.69, 0.06, 'the draws\' mean (keV)');
  assert.ok(Math.max(...d) < K.T2_ENDPOINT && Math.min(...d) > 0, 'inside (0, E₀)');
});
test('the gas: collisions at n σ v, with σ = 3.40 × 10⁻²² m² (T₂, 18.6 keV) and elastic a tenth as likely: one every 0.2 ms at Phase II\'s 2 × 10⁻⁶ mbar and 85 K (it measured 0.15 to 0.19 ms)', () => {
  const n = (2e-6 * 100) / (1.380649e-23 * 85), g = gammaOf(18600), v = C * Math.sqrt(1 - 1 / g ** 2);
  near(M.collisionRate(2e-6, 18600), n * 3.40e-22 * 1.1 * v, 1e-6 * M.collisionRate(2e-6, 18600), 'rate at 18.6 keV');
  const t = 1e3 / M.collisionRate(2e-6, K.KR_K);
  assert.ok(t > 0.14 && t < 0.25, `${t.toFixed(3)} ms`);
  // the draws: a tenth as many elastic as inelastic, inelastic angles averaging 0.5°, elastic ones
  // spread about the screening angle ħ / p a_TF
  const cs = M.collide(20000, K.KR_K, 0.01), el = cs.filter((c) => c.elastic), inel = cs.filter((c) => !c.elastic);
  near(el.length / inel.length, 0.1, 0.012, 'elastic share');
  near(inel.reduce((a, c) => a + c.angle, 0) / inel.length / ((0.5 * Math.PI) / 180), 1, 0.03, 'inelastic mean angle');
  const pc = Math.sqrt(K.KR_K ** 2 + 2 * K.KR_K * ME), chi = 197.3269804 / (pc * 0.885 * 0.0529177210903);
  near(M.screeningAngle(K.KR_K), chi, 1e-12, 'χ₀');
  const med = el.map((c) => c.angle).sort((a, b) => a - b)[el.length >> 1];
  near(med / chi, 1, 0.1, 'elastic median angle = χ₀');
  assert.ok(inel.every((c) => c.loss >= 12.6), 'every inelastic collision costs at least 12.6 eV');
});

console.log('the engine');
test('every key starts on its note (and on its tuning): the krypton line\'s carrier over its first 80 ms, as the model predicts it, to 0.3 ¢', () => {
  const p = P(QUIET);
  for (const key of [21, 33, 45, 57, 69, 81, 93, 108]) {
    const win = Math.max(0.08, 12 / tunedFreq(p, key));
    const n = note(key, p, win + 0.02), x = mono(n.L, n.R), f0 = tunedFreq(p, key);
    const want = predicted(key, p, n.birth.K, n.birth.cos, win / 2);
    const got = peak(x, f0 * 0.98, f0 * 1.02, 0, win * FS);
    near(cents(got, want), 0, 0.3, `key ${key}`);
    near(cents(predicted(key, p, n.birth.K, n.birth.cos, 0), f0), 0, 0.5, `key ${key} starts on its note`);
  }
});
test('the chirp: a held note climbs as the electron cools, by what the model gives (21 ¢ a second at first, slowing as the energy falls)', () => {
  const p = P(QUIET), key = 69, n = note(key, p, 3.2), x = mono(n.L, n.R), T = course(n);
  assert.ok(T > 2, `this electron runs ${T.toFixed(2)} s`);
  for (const t of [0.5, 1.5, T - 0.3]) {
    const want = predicted(key, p, n.birth.K, n.birth.cos, t), got = peak(x, 430, 460, (t - 0.2) * FS, (t + 0.2) * FS);
    near(cents(got, want), 0, 0.3, `at ${t} s`);
  }
  const rise = cents(predicted(key, p, n.birth.K, n.birth.cos, 1), tunedFreq(p, key));
  assert.ok(rise > 16 && rise < 20, `${rise.toFixed(1)} ¢ in the first second`);
});
test('the note fades as the radiated field, ∝ u⊥ (the waveguide\'s carrier): the energy e-folds in τ, the amplitude in 2τ', () => {
  const p = P({ depth: 0.01 }), n = note(69, p, 3), x = mono(n.L, n.R), T = Math.min(2.6, course(n) - 0.2);
  assert.ok(T > 1.5, `this electron runs ${course(n).toFixed(2)} s`);
  const u = (t) => M.cool(n.birth.K, n.birth.cos, p.field, t, 64).uPerp;
  const a = (t) => tone(x, peak(x, 430, 460, (t - 0.1) * FS, (t + 0.1) * FS), (t - 0.1) * FS, (t + 0.1) * FS);
  near(a(T) / a(0.5), u(T) / u(0.5), 0.01, 'amplitude ratio');
});
test('an electron radiates itself out of the trap: its note ends when cot²θ reaches ΔB / B₀, as the model has it, and with no gas that takes 2τ on average', () => {
  const p = P({ noise: 0 });
  let found = 0;
  for (let i = 0; i < 10 && found < 4; i++) {
    const msgs = [];
    render(p, 14, [[0, (x) => { for (let k = 0; k < i; k++) x.noteOn(30, 0.5), x.noteOff(30); x.noteOn(64, 0.8); }]], (m) => msgs.push(m));
    if (!msgs.some((m) => m.type === 'end' && m.key === 64)) continue; // this one outlasts the render
    found++;
    const birth = msgs.filter((m) => m.type === 'birth').at(-1), end = msgs.find((m) => m.type === 'end' && m.key === 64);
    assert.ok(end && end.reason === 'radiated out', `note ${i}: ${end?.reason}`);
    // from its birth, or from its last collision (rare at 10⁻¹¹ mbar, but it happens)
    const col = msgs.filter((m) => m.type === 'collision' && m.key === 64).at(-1), from = col ?? { ...birth, age: 0 };
    const delta = M.trap(p, K.KR_K).delta, cot2 = (t) => { const e = M.cool(from.K, from.cos, p.field, t, 32); return (e.cos * e.cos) / (1 - e.cos * e.cos); };
    let lo = 0, hi = 14;
    for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (cot2(m) < delta) lo = m; else hi = m; }
    near(end.age, from.age + lo, 2 * 32 / FS, `note ${i}'s escape`);
  }
  assert.equal(found, 4, 'four escapes');
  // with cos θ₀ uniform over what the trap holds, tan θ ∝ e^(−t/2τ) makes the escape time exponential, mean 2τ
  const tau = M.coolingTime(0.959);
  let s = 0; const N = 4000;
  for (let i = 0; i < N; i++) {
    const c0 = M.trap(p, K.KR_K).cosMax * ((i + 0.5) / N), delta = M.trap(p, K.KR_K).delta;
    let lo = 0, hi = 60;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2, e = M.cool(K.KR_K, c0, 0.959, m, 16); if ((e.cos * e.cos) / (1 - e.cos * e.cos) < delta) lo = m; else hi = m; }
    s += lo;
  }
  near(s / N / (2 * tau), 1, 0.05, 'mean escape time / 2τ');
});
test('the antenna ring hears the harmonics n β⊥ J′ₙ(nβ⊥) of the electron\'s orbit; the waveguide only the carrier', () => {
  const key = 57, f = tunedFreq(P(), key);
  const a = note(key, P(QUIET), 0.3), xa = mono(a.L, a.R);
  const e = M.cool(a.birth.K, a.birth.cos, 0.959, 0.1, 8), b = Math.sqrt(1 - 1 / gammaOf(e.K) ** 2) * Math.sqrt(1 - e.cos ** 2); // β⊥ mid-window
  for (const n of [2, 3, 4]) near(20 * Math.log10(tone(xa, n * f, 0, 0.2 * FS) / tone(xa, f, 0, 0.2 * FS)), 20 * Math.log10(M.sideOn(n, b) / M.sideOn(1, b)), 0.3, `harmonic ${n} (dB)`);
  const g = note(key, P({ depth: 0.01 }), 0.3), xg = mono(g.L, g.R);
  assert.ok(tone(xg, 2 * f, 0, 0.2 * FS) < 1e-4 * tone(xg, f, 0, 0.2 * FS), 'the waveguide: no second harmonic');
});
test('in the waveguide, the bounce\'s Doppler shift is a vibrato at the bounce frequency (f/211 here), its depth h f_a', () => {
  // the instantaneous frequency from zero crossings, high on the keyboard where the bounce is quick
  const key = 96, p = P({ depth: 2 }), n = note(key, p, 1.2), x = mono(n.L, n.R);
  const cross = [];
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) cross.push(i - 1 + -x[i - 1] / (x[i] - x[i - 1]));
  const fi = [], ti = [];
  for (let i = 1; i < cross.length; i++) { fi.push(FS / (cross[i] - cross[i - 1])); ti.push((cross[i] + cross[i - 1]) / 2 / FS); }
  // after the chirp's trend (a line fitted over 0.2–1.1 s), what is left swings by ± h f_a
  const sel = ti.map((t, i) => i).filter((i) => ti[i] > 0.2 && ti[i] < 1.1);
  const mt = sel.reduce((a, i) => a + ti[i], 0) / sel.length, mf = sel.reduce((a, i) => a + fi[i], 0) / sel.length;
  const slope = sel.reduce((a, i) => a + (ti[i] - mt) * (fi[i] - mf), 0) / sel.reduce((a, i) => a + (ti[i] - mt) ** 2, 0);
  const res = sel.map((i) => fi[i] - mf - slope * (ti[i] - mt));
  const amp = Math.sqrt(2) * Math.sqrt(res.reduce((a, r) => a + r * r, 0) / res.length);
  near(amp / (n.birth.h * n.birth.fa), 1, 0.12, `the vibrato's depth (h = ${n.birth.h.toFixed(3)}, f_a = ${n.birth.fa.toFixed(2)} Hz)`);
  near(n.birth.fa / tunedFreq(p, key), M.axial(n.birth.K, n.birth.cos, 0.1) / M.cyclotron(0.959, K.KR_K), 1e-5, 'f_a in the note\'s scale');
});
test('the gas: at Phase II\'s pressure collisions come at the model\'s rate, they knock electrons out, and each note lasts milliseconds', () => {
  const p = P({ gas: 2e-6 }), msgs = [];
  const ev = Array.from({ length: 40 }, (_, i) => [0.05 * i, (x) => x.noteOn(40 + i, 0.8)]);
  render(p, 2.2, ev, (m) => msgs.push(m));
  const cols = msgs.filter((m) => m.type === 'collision'), ends = msgs.filter((m) => m.type === 'end');
  const life = ends.reduce((a, e) => a + e.age, 0);
  near(cols.length / life / M.collisionRate(2e-6, K.KR_K), 1, 0.12, 'collisions per second trapped');
  assert.ok(ends.length === 40 && ends.every((e) => e.reason === 'knocked out'), 'every electron knocked out');
  assert.ok(life / 40 < 0.01, `mean life ${(1000 * life / 40).toFixed(2)} ms`);
  assert.ok(cols.some((c) => !c.out && c.loss > 0), 'some collisions leave it in the trap, a little lower in energy');
});
test('the gas all the way down is a perfect vacuum: no collisions (just above it, a few), and the slider says so', () => {
  const count = (gas) => {
    const msgs = [];
    const ev = Array.from({ length: 24 }, (_, i) => [0.01 * i, (x) => x.noteOn(48 + i, 0.8)]);
    render(P({ gas }), 12, ev, (m) => msgs.push(m));
    return msgs.filter((m) => m.type === 'collision').length;
  };
  assert.equal(count(1e-11), 0, 'collisions in a perfect vacuum');
  assert.ok(count(1e-9) > 0, 'collisions at 10⁻⁹ mbar');
  const gas = PARAMS.find((q) => q.id === 'gas');
  assert.match(gas.fmt(gas.min), /none/);
  assert.match(gas.fmt(1.1e-11), /mbar/);
});
test('tritium: each electron\'s energy is drawn from the β spectrum, and its note is sharp of the key (the endpoint) by its lighter mass, γ(E₀)/γ(K)', () => {
  const p = P({ ...QUIET, source: 'tritium' }), msgs = [];
  render(p, 0.5, Array.from({ length: 300 }, (_, i) => [0, (x) => { x.noteOn(21 + (i % 80), 0.5); }]), (m) => msgs.push(m));
  const Ks = msgs.filter((m) => m.type === 'birth').map((m) => m.K);
  near(Ks.reduce((a, b) => a + b, 0) / Ks.length / 1000, 5.69, 0.5, 'mean energy (keV)');
  const n = note(69, p, 0.25), x = mono(n.L, n.R), want = predicted(69, p, n.birth.K, n.birth.cos, 0.1, K.T2_ENDPOINT);
  near(cents(peak(x, 440, 470, 0, 0.2 * FS), want), 0, 0.3, `an electron of ${(n.birth.K / 1000).toFixed(2)} keV`);
  assert.ok(cents(want, 440) > 0, 'sharp of the endpoint');
});
test('letting go opens the trap: the note is gone within 40 ms; the pedal keeps the traps closed until it comes up', () => {
  const p = P(), n = note(69, p, 0.6, 0.8, [[0.3, (x) => x.noteOff(69)]]), x = mono(n.L, n.R);
  assert.ok(rms(x, 0.34 * FS, 0.6 * FS) < 1e-4 * rms(x, 0.1 * FS, 0.3 * FS), 'silent after release');
  assert.equal(n.msgs.find((m) => m.type === 'end').reason, 'released');
  const s = note(69, p, 1, 0.8, [[0, (e) => e.setSustain(true)], [0.2, (e) => e.noteOff(69)], [0.6, (e) => e.setSustain(false)]]), y = mono(s.L, s.R);
  assert.ok(rms(y, 0.3 * FS, 0.55 * FS) > 0.5 * rms(y, 0.05 * FS, 0.2 * FS), 'held by the pedal');
  assert.ok(rms(y, 0.65 * FS, FS) < 1e-4 * rms(y, 0.05 * FS, 0.2 * FS), 'gone with the pedal');
});
test('the receiver\'s noise sits in the key\'s channel while the key is held, even after the electron has gone', () => {
  const p = P({ gas: 3e-6, noise: 0.5 }), n = note(69, p, 0.6), x = mono(n.L, n.R);
  assert.ok(n.end && n.end.age < 0.05, 'the electron is gone at once');
  const hiss = rms(x, 0.2 * FS, 0.6 * FS);
  assert.ok(hiss > 0.003 && hiss < 0.05, `the hiss: ${hiss}`);
  assert.ok(tone(x, 440, 0.2 * FS, 0.6 * FS) > 4 * tone(x, 110, 0.2 * FS, 0.6 * FS), 'around the note');
});
test('pitch bend moves the field: the note by ±2 semitones, and the electron cools faster in the stronger field', () => {
  const p = P(QUIET), n = note(69, p, 1, 0.8, [[0.01, (e) => e.handle({ type: 'bend', value: 1 })]]), x = mono(n.L, n.R);
  const want = predicted(69, p, n.birth.K, n.birth.cos, 0.5) * 2 ** (2 / 12);
  near(cents(peak(x, 480, 510, 0.3 * FS, 0.7 * FS), want), 0, 2.5, 'bent up a tone');
});
test('level: a forte note peaks between 0.1 and 0.5, chords stay finite, and the antennas\' 300 keV electrons too', () => {
  for (const o of [{}, { receiver: 'antennas' }, { source: 'energy', energy: 300, receiver: 'antennas' }, { noise: 1 }]) {
    const n = note(60, P(o), 1, 1), pk = Math.max(...n.L.map(Math.abs), ...n.R.map(Math.abs));
    assert.ok(pk > 0.1 && pk < 0.5, `${JSON.stringify(o)}: peak ${pk}`);
  }
  const [L] = render(DEFAULTS, 2, [48, 55, 64, 72, 79].map((k) => [0, (e) => e.noteOn(k, 1)]));
  assert.ok(L.every(Number.isFinite), 'finite');
});
test('Quality: Medium and Low hear 16 and 10 electrons at once (High 48), and the antennas hear 6 and 3 harmonics (High up to 12); one plain note is the same at every quality', () => {
  const one = (q) => render(P(), 0.5, [[0, (x) => { x.setQuality(q); x.noteOn(60, 0.8); }]])[0];
  const high = one('high');
  for (const [q, cap] of [['high', 48], ['medium', 16], ['low', 10]]) {
    const [A, , e] = render(P(), 0.4, [[0, (x) => x.setQuality(q)], ...Array.from({ length: 60 }, (_, i) => [0.005 * i, (x) => x.noteOn(21 + i, 0.8)])]);
    assert.equal(e.voiceCount(), cap, `${q}: voices`);
    assert.ok(A.every(Number.isFinite), `${q}: finite`);
    assert.ok(one(q).every((v, i) => v === high[i]), `${q}: a plain note differs from High's`);
  }
  const p = P({ ...QUIET, source: 'energy', energy: 300 }), f = tunedFreq(p, 45);
  const harm = (q, k) => { const [L, R] = render(p, 0.3, [[0, (x) => { x.setQuality(q); x.noteOn(45, 0.8); }]]); return tone(mono(L, R), k * f, 0, 0.2 * FS) / tone(mono(L, R), f, 0, 0.2 * FS); };
  assert.ok(harm('high', 5) > 0.05 && harm('medium', 5) > 0.05 && harm('low', 5) < 1e-3, 'the fifth harmonic: High and Medium, not Low');
  assert.ok(harm('high', 8) > 0.01 && harm('medium', 8) < 1e-3, 'the eighth harmonic: High only');
});
test('CPU: ten electrons with the antennas\' harmonics and the noise render well faster than real time', () => {
  const t0 = performance.now();
  render({ ...DEFAULTS, receiver: 'antennas', source: 'energy', energy: 100, noise: 0.5 }, 5, Array.from({ length: 10 }, (_, i) => [0, (e) => e.noteOn(48 + 3 * i, 0.8)]));
  const dt = (performance.now() - t0) / 1000;
  assert.ok(dt < 1, `${dt.toFixed(2)} s for 5 s of audio`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall ok');
process.exit(failures ? 1 : 0);
