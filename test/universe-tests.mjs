// Early Universe checks. Run: node test/universe-tests.mjs
//
// The model (the C++, through universe-wasm.js) is checked against independent physics: the
// Friedmann equation and the universe's age and sound horizon integrated here, Saha's equation and
// the lag behind it that Peebles found, Planck's measured recombination, sound horizon, damping
// scale and equality, the exact potentials of a radiation-dominated universe and the 9/10 of the
// matter era (Kodama & Sasaki), the sound waves' phase and their (1 + R)^(−1/4) adiabatic
// invariant, and Silk's damping integrated here. Then the advertised effects of each ingredient,
// and the engine against the model: pitch, the harmonics' levels, the clock, the light streaming
// away, the pedal, the page's offer, level, voices and Quality.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../universe/src/universe-instrument.js';
import { wasmModel } from '../universe/src/universe-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';

const Engine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });

// Render through the engine in 128-sample blocks like the AudioWorklet; events [t, fn(engine)].
function render(params, sec, events = [], quality) {
  const e = new Engine(FS);
  if (quality) e.setQuality(quality);
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
const note = (key, params, sec, vel = 0.8, more = [], quality) => render(params, sec, [[0, (e) => e.noteOn(key, vel)], ...more], quality);
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
const simpson = (f, a, b, n = 4000) => { const h = (b - a) / n; let s = f(a) + f(b); for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return (s * h) / 3; };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (± ${tol})`);
const rel = (a, b, tol, what) => assert.ok(Math.abs(a / b - 1) <= tol, `${what}: ${a} vs ${b} (± ${(100 * tol).toFixed(2)} %)`);

// Our constants, written out here: c/H₁₀₀ in Mpc, the photons for T = 2.7255 K, one neutrino's share
const C_H = 2997.92458, OG = (7.565733e-16 * 2.7255 ** 4) / (1.87834e-26 * 299792458 ** 2), NU = (7 / 8) * (4 / 11) ** (4 / 3);
const MPC = 3.0856775814913673e22, YEAR = 3.15576e7, H100 = 1e5 / MPC;
const omegas = (o) => { const orad = OG * (1 + NU * o.neutrinos), om = o.baryons + o.darkMatter; return { orad, om }; };
// the ℓ(ℓ+1)-free amplitude of a harmonic as the engine plays it: |sky + i·Doppler| · m^((n_s − 2)/2)
const heard = (u, m, j = M.NT - 1, tilt = DEFAULTS.tilt) => Math.hypot(u.sky[m - 1][j], u.doppler[m - 1][j]) * m ** ((tilt - 2) / 2);
const U0 = M.universe(DEFAULTS);

console.log('physics');
test('expansion: a(τ) solves Friedmann\'s equation, (da/dτ)² = (ω_m a + ω_r)/(c/H₁₀₀)², and equality is at z = ω_m/ω_r − 1', () => {
  const b = M.background(DEFAULTS), { orad, om } = omegas(DEFAULTS);
  for (const tau of [1, 30, 112, 280, 600]) {
    const h = 1e-4 * tau, da = (M.a(tau + h) - M.a(tau - h)) / (2 * h);
    rel(da * da, (om * M.a(tau) + orad) / C_H ** 2, 1e-5, `τ = ${tau}`);
  }
  rel(b.zEq, om / orad - 1, 1e-5, 'z_eq');
});
test('age and sound horizon: ∫ da/(aH) and ∫ c_s da/(a²H), integrated here, at recombination', () => {
  const b = M.background(DEFAULTS), { orad, om } = omegas(DEFAULTS), aS = 1 / (1 + b.zStar);
  const E = (a) => Math.sqrt(om * a + orad); // a² H / H₁₀₀
  const age = simpson((a) => a / E(a), 0, aS) / H100 / YEAR;
  const R = (a) => (0.75 * DEFAULTS.baryons / OG) * a, rs = simpson((a) => C_H / Math.sqrt(3 * (1 + R(a))) / E(a), 0, aS);
  rel(b.ageStar, age, 1e-4, 'age (years)');
  rel(b.rsStar, rs, 1e-4, 'r_s* (Mpc)');
  near(b.ageStar / 1000, 372, 10, 'age (thousand years)');
});
test('recombination: Saha\'s equation while it is slow (z = 1650–1800), then Peebles\'s bottleneck holds hydrogen ionised long after Saha would', () => {
  const b = M.background(DEFAULTS), nH0 = ((1 - DEFAULTS.helium) * DEFAULTS.baryons * 1.87834e-26) / 1.6735575e-27;
  const saha = (z) => { // hydrogen alone: x²/(1 − x) = (2π m_e kT/h²)^(3/2) e^(−13.6 eV/kT) / n_H
    const T = 2.7255 * (1 + z), s = (2.414683e21 * T ** 1.5 * Math.exp(-13.605693 / (8.617333262e-5 * T))) / (nH0 * (1 + z) ** 3);
    return (-s + Math.sqrt(s * s + 4 * s)) / 2;
  };
  for (const z of [1650, 1700, 1800]) rel(M.xe(z), saha(z), 0.01, `x_e at z = ${z}`);
  assert.ok(M.xe(1200) > 3 * saha(1200), `z = 1200: ${M.xe(1200)} against Saha's ${saha(1200)}`);
  near(M.xe(2000), 1, 0.01, 'z = 2000: hydrogen ionised, helium\'s last electron gone');
  assert.ok(M.xe(250) > 1e-4 && M.xe(250) < 1e-3, `freeze-out: ${M.xe(250)}`);
});
test('Planck 2018 (TT,TE,EE+lowE+lensing): z* = 1089.92, r_s* = 144.43 Mpc, k_D = 0.14087 Mpc⁻¹, z_eq = 3402, from its ω_b, ω_c', () => {
  const b = M.background(DEFAULTS);
  rel(b.zStar, 1089.92, 0.001, 'z*');
  rel(b.rsStar, 144.43, 0.002, 'r_s*');
  rel(b.kdStar, 0.14087, 0.005, 'k_D');
  rel(b.zEq, 3402, 0.01, 'z_eq');
  // and Hu & Sugiyama's (1996) fit to z* across cosmologies, good to about 1 %
  for (const o of [DEFAULTS, P({ baryons: 0.01, darkMatter: 0.3 }), P({ baryons: 0.05, darkMatter: 0.06 })]) {
    const ob = o.baryons, om = o.baryons + o.darkMatter, g1 = (0.0783 * ob ** -0.238) / (1 + 39.5 * ob ** 0.763), g2 = 0.56 / (1 + 21.1 * ob ** 1.81);
    rel(M.background(o).zStar, 1048 * (1 + 0.00124 * ob ** -0.738) * (1 + g1 * om ** g2), 0.015, `z* for ω_b ${ob}, ω_m ${om.toFixed(3)}`);
  }
});
test('gravity, radiation only: φ = 3φ₀ (sin x − x cos x)/x³, x = kτ/√3 (no neutrinos, almost no matter)', () => {
  M.background({ baryons: 1e-7, darkMatter: 1e-7, neutrinos: 0, helium: 0.245 });
  const k = 0.1, ts = [0.5, 5, 10, 20, 35, 60, 100], o = M.evolve(k, [1e-3, ...ts], { damp: false }), phi0 = o[0].phi;
  ts.forEach((tau, i) => {
    const x = (k * tau) / Math.sqrt(3), want = (3 * phi0 * (Math.sin(x) - x * Math.cos(x))) / x ** 3;
    near(o[i + 1].phi, want, 2e-3 * Math.abs(phi0), `kτ = ${k * tau}`);
  });
});
test('gravity, into the matter era: a wave outside the horizon keeps 9/10 of its potential, as Kodama and Sasaki\'s exact solution says on the way', () => {
  const b = M.background({ baryons: 0.001, darkMatter: 0.14, neutrinos: 0, helium: 0.245 }), aeq = 1 / (1 + b.zEq);
  const ts = [0.3, 0.5, 1, 2, 4, 10, 30].map((y) => M.tauOf(y * aeq)), o = M.evolve(1e-5, [1e-4, ...ts], { damp: false });
  ts.forEach((tau, i) => {
    const y = M.a(tau) / aeq, want = (16 * Math.sqrt(1 + y) + 9 * y ** 3 + 2 * y * y - 8 * y - 16) / (10 * y ** 3);
    near(o[i + 1].phi / o[0].phi, want, 2e-3, `a/a_eq = ${y.toFixed(2)}`);
  });
});
test('sound: a short wave oscillates as cos k r_s(τ), r_s integrated here, its amplitude falling as (1 + R)^(−1/4)', () => {
  const b = M.background(P({ neutrinos: 0 })), k = 30 * (Math.PI / b.rsStar), aR = (0.75 * DEFAULTS.baryons) / OG;
  const ts = Array.from({ length: 900 }, (_, i) => 40 + ((b.tauStar - 40) * i) / 899), o = M.evolve(k, ts, { damp: false });
  const rs = (tau) => simpson((t) => 1 / Math.sqrt(3 * (1 + aR * M.a(t))), 0, tau, 400);
  // the oscillating part, Θ₀ + (1 + R)ψ (gravity holds the fluid's zero point at −(1 + R)ψ)
  const osc = o.map((x, i) => x.plasma + (1 + aR * M.a(ts[i])) * x.psi);
  // its zeros, where k r_s is a half-odd multiple of π, give or take the small phase the
  // radiation era's driving leaves (it settles once gravity has decayed inside the horizon)
  const late = [];
  let zeros = 0;
  for (let i = 1; i < ts.length; i++) {
    const a = osc[i - 1], c = osc[i];
    if (a * c >= 0) continue;
    const tz = ts[i - 1] + ((ts[i] - ts[i - 1]) * a) / (a - c), ph = k * rs(tz) / Math.PI - 0.5, off = ph - Math.round(ph);
    near(off, 0, 0.07, `zero at τ = ${tz.toFixed(1)}: k r_s/π − ½ off a whole number`);
    if (tz > 150) late.push(off);
    zeros++;
  }
  assert.ok(zeros > 20, `${zeros} zeros`);
  near(Math.max(...late) - Math.min(...late), 0, 0.01, 'the phase, settled');
  // the envelope, early and late
  const env = (i0, i1) => Math.max(...osc.slice(i0, i1).map(Math.abs));
  const R1 = aR * M.a(ts[40]), R2 = aR * M.a(ts[860]);
  rel(env(820, 900) / env(0, 80), ((1 + R1) / (1 + R2)) ** 0.25, 0.02, 'amplitude ratio');
});
test('Silk damping: the diffusion takes exp(−k²/k_D²) off a wave, k_D⁻² = ∫ [R²/(1+R) + 16/15] dτ / 6(1+R)κ\' integrated here', () => {
  const b = M.background(DEFAULTS), aR = (0.75 * DEFAULTS.baryons) / OG;
  const kd2 = simpson((tau) => { const R = aR * M.a(tau); return (R * R / (1 + R) + 16 / 15) / (6 * (1 + R) * M.opacity(tau)); }, 1e-3, b.tauStar, 20000);
  rel(1 / Math.sqrt(kd2), b.kdStar, 0.005, 'k_D');
  for (const m of [3, 5, 7]) {
    const k = (m * Math.PI) / b.rsStar, ts = [b.tauStar];
    const [d] = M.evolve(k, ts), [u] = M.evolve(k, ts, { damp: false });
    // the oscillating part, Θ₀ + (1 + R)ψ, at recombination, where this harmonic is at a crest
    const R = aR * M.a(b.tauStar), osc = (x) => x.plasma + (1 + R) * x.psi;
    rel(osc(d) / osc(u), Math.exp(-k * k * kd2), 0.04, `harmonic ${m}`);
  }
});

console.log('the ingredients');
const levels = (o, n = 8) => { const u = M.universe(P(o)); return Array.from({ length: n }, (_, m) => heard(u, m + 1)); };
test('baryons: more load the fluid, so the odd harmonics (compressions) ring louder than the even ones', () => {
  // the third and fifth harmonics against their neighbours (the damping takes a steady slope off)
  const contrast = (L) => Math.sqrt(L[2] / Math.sqrt(L[1] * L[3]) * (L[4] / Math.sqrt(L[3] * L[5])));
  const lo = contrast(levels({ baryons: 0.01 })), mid = contrast(levels({})), hi = contrast(levels({ baryons: 0.06 }));
  assert.ok(lo < mid && mid < hi && hi > 1.4, `odd over even: ${lo.toFixed(2)}, ${mid.toFixed(2)}, ${hi.toFixed(2)}`);
});
test('baryons: more electrons to scatter off, so the light diffuses less and the upper harmonics last', () => {
  const a = levels({ baryons: 0.005 }, 10), b = levels({ baryons: 0.03 }, 10);
  assert.ok(b[8] > 3 * a[8], `harmonic 9: ${a[8].toExponential(2)} → ${b[8].toExponential(2)}`);
});
test('dark matter: less of it, a later equality, and the harmonics are driven louder, the lower ones most; more of it, a quieter fundamental', () => {
  const lo = levels({ darkMatter: 0.04 }), mid = levels({}), hi = levels({ darkMatter: 0.45 });
  for (const m of [0, 1, 2]) assert.ok(lo[m] > mid[m], `harmonic ${m + 1}: ${lo[m]} vs ${mid[m]}`);
  assert.ok(lo[1] / mid[1] > lo[5] / mid[5], 'the lower ones most');
  assert.ok(hi[0] < 0.9 * mid[0], `fundamental: ${hi[0]} vs ${mid[0]}`);
});
test('neutrinos: more radiation drives the waves harder, and the free-streaming neutrinos damp the upper ones a little', () => {
  const a = levels({}, 9), b = levels({ neutrinos: 6 }, 9);
  assert.ok(b[1] > 1.03 * a[1], `harmonic 2: ${a[1]} → ${b[1]}`);
  assert.ok(b[7] < 0.95 * a[7], `harmonic 8: ${a[7]} → ${b[7]}`);
});
test('helium: more of it leaves fewer free electrons, so the light diffuses further and the upper harmonics fade', () => {
  const a = levels({ helium: 0.1 }, 10), b = levels({ helium: 0.45 }, 10);
  assert.ok(b[8] < 0.8 * a[8] && Math.abs(b[0] / a[0] - 1) < 0.02, `harmonic 9 ${a[8]} → ${b[8]}; fundamental ${a[0]} → ${b[0]}`);
});
test('the beginning: every wave outside the horizon starts at the same temperature, ψ/2, and the adiabatic ψ = 20/(15 + 4R_ν)', () => {
  const Rn = (NU * DEFAULTS.neutrinos) / (1 + NU * DEFAULTS.neutrinos), psi = 20 / (15 + 4 * Rn);
  for (let m = 1; m <= M.HARMONICS; m++) near(U0.sky[m - 1][0], psi / 2, 1e-3, `harmonic ${m}`);
});

console.log('the engine');
const T1 = 0.5; // a short history for the tests
const FAST = P({ recombination: T1 });
test('tuning: every key\'s fundamental is its note, and its harmonics whole multiples', () => {
  for (let key = 21; key <= 108; key += 1) {
    const [L] = note(key, P({ recombination: 0.1 }), 0.55), f = keyFreq(key);
    const got = peak(L, f, 0.2 * FS, 0.55 * FS, 0.004);
    near(cents(got, f), 0, 0.5, `key ${key}`);
    if (key % 12 === 0 && 3 * f < 20000) near(cents(peak(L, 3 * f, 0.2 * FS, 0.55 * FS, 0.004), 3 * f), 0, 0.5, `key ${key}, harmonic 3`);
  }
});
test('engine against model: after recombination the harmonics sound at |sky + i·Doppler| · m^((n_s − 2)/2), the Doppler shift in quadrature', () => {
  for (const o of [{}, { doppler: false }, { baryons: 0.06 }]) {
    const p = P({ ...o, recombination: T1 }), u = M.universe(p), [L, R] = note(57, p, 1.4, 0.8), f = keyFreq(57);
    const want = (m) => (o.doppler === false ? Math.abs(u.sky[m - 1][M.NT - 1]) * m ** ((p.tilt - 2) / 2) : heard(u, m));
    const got = (m) => tone(L, m * f, 0.7 * FS, 1.4 * FS) + tone(R, m * f, 0.7 * FS, 1.4 * FS);
    for (let m = 2; m <= 7; m++) rel(got(m) / got(1), want(m) / want(1), 0.02, `${JSON.stringify(o)} harmonic ${m}`);
  }
});
test('the clock: halfway to recombination the harmonics stand as the model has them halfway', () => {
  const p = P({ recombination: 8 }), [L] = note(57, p, 4.1), f = keyFreq(57), j = (M.NT - 1) / 2;
  const at = (m) => Math.hypot((U0.sky[m - 1][Math.floor(j)] + U0.sky[m - 1][Math.ceil(j)]) / 2, (U0.doppler[m - 1][Math.floor(j)] + U0.doppler[m - 1][Math.ceil(j)]) / 2) * m ** ((p.tilt - 2) / 2);
  const got = (m) => tone(L, m * f, 3.95 * FS, 4.05 * FS);
  for (const m of [2, 3, 4]) rel(got(m) / got(1), at(m) / at(1), 0.05, `harmonic ${m}`);
});
test('tilt: n_s scales harmonic m by m^(Δn_s/2), and the mod wheel\'s tilt changes a sounding note', () => {
  const f = keyFreq(48), a = note(48, P({ recombination: T1, tilt: 0.9 }), 1.2)[0], b = note(48, P({ recombination: T1, tilt: 1.1 }), 1.2)[0];
  for (const m of [2, 4, 6]) rel((tone(b, m * f, 0.7 * FS, 1.2 * FS) / tone(b, f, 0.7 * FS, 1.2 * FS)) / (tone(a, m * f, 0.7 * FS, 1.2 * FS) / tone(a, f, 0.7 * FS, 1.2 * FS)), m ** 0.1, 0.01, `harmonic ${m}`);
  const [L] = note(48, P({ recombination: T1, tilt: 0.9 }), 1.2, 0.8, [[0.8, (e) => e.setParams(P({ recombination: T1, tilt: 1.1 }))]]);
  rel(tone(L, 6 * f, 0.9 * FS, 1.2 * FS) / tone(L, f, 0.9 * FS, 1.2 * FS), tone(b, 6 * f, 0.9 * FS, 1.2 * FS) / tone(b, f, 0.9 * FS, 1.2 * FS), 0.01, 'retilted');
});
test('the sky holds the pattern while the key is held; let go, and the light streams away: the fundamental falls silent after the release time (j₀(π) = 0)', () => {
  const rel_ = 0.4, f = keyFreq(57), [L, , e] = note(57, P({ recombination: 0.3, release: rel_ }), 0.8 + 6 * rel_ + 0.2, 0.8, [[0.8, (x) => x.noteOff(57)]]);
  const held1 = tone(L, f, 0.35 * FS, 0.55 * FS), held2 = tone(L, f, 0.6 * FS, 0.8 * FS);
  rel(held2, held1, 0.01, 'held: frozen');
  assert.ok(tone(L, f, (0.8 + rel_ - 0.03) * FS, (0.8 + rel_ + 0.03) * FS) < 0.12 * held1, 'silent at its first zero');
  assert.ok(tone(L, f, (0.8 + 1.43 * rel_ - 0.03) * FS, (0.8 + 1.43 * rel_ + 0.03) * FS) > 0.12 * held1 * 0.5, 'and back, weaker (j₀\'s next lobe)');
  assert.equal(e.voiceCount(), 0, 'the note has ended (six release times: j₀\'s sixth zero)');
});
test('inside the plasma: once recombination frees the light, the note fades by itself while the key is held', () => {
  const [L, , e] = note(57, P({ recombination: T1, listener: 'plasma' }), 2.6);
  const rms = (a, b) => { let s = 0; for (let i = a * FS; i < b * FS; i++) s += L[i] * L[i]; return Math.sqrt(s / ((b - a) * FS)); };
  assert.ok(rms(0.85, 1.0) < 0.3 * rms(0.4, 0.5), `${rms(0.4, 0.5)} → ${rms(0.85, 1.0)}`);
  assert.equal(e.voiceCount(), 0, 'it ends');
});
test('the pedal keeps a released note sounding; lifting it lets the light go', () => {
  const f = keyFreq(60), [L, , e] = note(60, P({ recombination: 0.3, release: 0.2 }), 1.2 + 6 * 0.2 + 0.2, 0.8, [[0, (x) => x.setSustain(true)], [0.5, (x) => x.noteOff(60)], [1.2, (x) => x.setSustain(false)]]);
  rel(tone(L, f, 0.9 * FS, 1.15 * FS), tone(L, f, 0.35 * FS, 0.5 * FS), 0.01, 'held by the pedal');
  assert.equal(e.voiceCount(), 0);
});
test('the page\'s offer: a note given the page\'s universe sounds bit for bit as one that builds its own; an offer for other parameters is refused', () => {
  const p = P({ recombination: T1, baryons: 0.031 }), offer = M.universe(p).offer, other = M.universe(P({ baryons: 0.04 })).offer;
  const run = (data) => render(p, 0.8, [[0, (e) => e.noteOn(62, 0.8, data)]])[0];
  const a = run(undefined), b = run(offer), c = run(other);
  assert.ok(a.every((v, i) => v === b[i]), 'offered');
  assert.ok(a.every((v, i) => v === c[i]), 'refused');
});
test('level: a forte note peaks between 0.1 and 0.5; chords and every preset stay finite; silence after release', () => {
  const [L] = note(60, P({ recombination: T1 }), 1.5, 1);
  const pk = Math.max(...L.map(Math.abs));
  assert.ok(pk > 0.1 && pk < 0.5, `peak ${pk}`);
  for (const pr of PRESETS) {
    const p = P({ ...pr.p, recombination: Math.min(pr.p.recombination ?? 1, 1), release: 0.2 });
    const keys = [36, 48, 55, 64, 72, 84, 96, 108], ev = keys.flatMap((k) => [[0, (e) => e.noteOn(k, 1)], [1.2, (e) => e.noteOff(k)]]);
    const [A, , e] = render(p, 2.6, ev);
    assert.ok(A.every(Number.isFinite), `${pr.name}: finite`);
    const top = Math.max(...A.map(Math.abs));
    assert.ok(top < 2, `${pr.name}: chord peak ${top}`);
    assert.ok(Math.max(...A.slice(-0.2 * FS).map(Math.abs)) < 1e-6 && e.voiceCount() === 0, `${pr.name}: silent after`);
  }
});
test('voices: a key struck again lets its old note go, and fast playing never runs past the voice limit', () => {
  const ev = [];
  for (let i = 0; i < 120; i++) ev.push([i * 0.01, (e) => e.noteOn(40 + (i % 50), 0.7)]);
  let most = 0;
  const [, , e] = render(P({ recombination: 1 }), 1.5, [...ev, ...Array.from({ length: 30 }, (_, i) => [0.05 * i, (x) => { most = Math.max(most, x.voiceCount()); }])]);
  assert.ok(most <= 64 && e.voiceCount() <= 33, `most ${most}, at the end ${e.voiceCount()}`);
});
test('Quality: Medium plays 16 harmonics and 20 voices, Low 10 and 12 (High 24 and 32); the harmonics it keeps sound the same', () => {
  const f = keyFreq(40), at = (q) => note(40, FAST, 1.2, 0.8, [], q)[0];
  const H = at('high'), Me = at('medium'), Lo = at('low');
  const lv = (x, m) => tone(x, m * f, 0.7 * FS, 1.2 * FS);
  for (const m of [1, 5, 9]) { rel(lv(Me, m), lv(H, m), 1e-6, `medium, harmonic ${m}`); rel(lv(Lo, m), lv(H, m), 1e-6, `low, harmonic ${m}`); }
  assert.ok(lv(H, 13) > 1e-5 && lv(Me, 13) > 1e-5 && lv(Lo, 13) < 1e-7 && lv(Me, 18) < 1e-7 && lv(H, 18) > 1e-7, 'harmonics 13 and 18');
  for (const [q, n] of [['high', 30], ['medium', 20], ['low', 12]]) {
    const ev = Array.from({ length: 30 }, (_, i) => [0.001 * i, (e) => e.noteOn(36 + i, 0.6)]);
    const [, , e] = render(FAST, 0.2, ev, q);
    assert.equal(e.voiceCount(), n, q);
  }
});
test('CPU: ten held voices render well faster than real time', () => {
  const t0 = performance.now();
  render(P({ recombination: 2 }), 5, Array.from({ length: 10 }, (_, i) => [0.05 * i, (e) => e.noteOn(36 + 4 * i, 0.7)]));
  const x = 5000 / (performance.now() - t0);
  assert.ok(x > 8, `${x.toFixed(1)}× real time`);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
