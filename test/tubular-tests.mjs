// Tubular bells checks. Run: node test/tubular-tests.mjs
//
// The physics against independent results (Cowper's limits, the Bessel functions' integrals, a
// finite-element tube, the 2-D cylinder's radiation, Euler–Bernoulli's free bar), then the engine
// against the model. Both are the C++ (native/instruments/tubular), built as WebAssembly.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS, KEY_LO, KEY_HI } from '../tubular/src/tubular-instrument.js';
import { wasmModel } from '../tubular/src/tubular-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';
import { genEig } from '../shared/linalg.js';

const TubularEngine = await loadEngine(INSTRUMENT);
const model = await wasmModel();

const FS = 48000, TAU = 2 * Math.PI;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);

// Render notes through the engine in 128-sample blocks, like the AudioWorklet: events [t, 'on'|'off'|'sus', key, vel].
function render(params, sec, events, { quality, data } = {}) {
  const e = new TubularEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float32Array(n), R = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = [...events].sort((a, b) => a[0] - b[0]);
  for (let s = 0; s < n; s += bl) {
    while (ev.length && ev[0][0] * FS <= s) {
      const [, type, key, vel] = ev.shift();
      if (type === 'on') e.noteOn(key, vel, data?.(key)); else if (type === 'off') e.noteOff(key); else e.setSustain(!!key);
    }
    e.process(bL, bR, bl);
    const m = Math.min(bl, n - s);
    L.set(bL.subarray(0, m), s); R.set(bR.subarray(0, m), s);
  }
  return { L, R, e };
}
const one = (key, params, vel, sec, opts) => render(params, sec, [[0, 'on', key, vel]], opts);
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b) {
  const w = (TAU * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((TAU * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// The strongest frequency within ±20 ¢ of f0 in x[a, b) (golden-section search on tone).
function peak(x, f0, a, b) {
  let lo = f0 * 2 ** (-20 / 1200), hi = f0 * 2 ** (20 / 1200);
  for (let i = 0; i < 50; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
const C4 = model.tube(60, P()), F5 = model.tube(77, P());

console.log('physics');
test('Cowper’s shear coefficient: 6(1+ν)/(7+6ν) for a solid circle, 2(1+ν)/(4+3ν) for a thin tube', () => {
  for (const nu of [0.29, 0.33, 0.375]) {
    assert.ok(Math.abs(model.kappa(nu, 0) - (6 * (1 + nu)) / (7 + 6 * nu)) < 1e-12);
    assert.ok(Math.abs(model.kappa(nu, 1) - (2 * (1 + nu)) / (4 + 3 * nu)) < 1e-12);
  }
  assert.ok(Math.abs(C4.section.kappa - 0.538) < 0.001, `${C4.section.kappa}`);
});
test('Bessel functions match their integrals (J: Bessel’s; Y: the Schläfli integral)', () => {
  const quad = (f, a, b, n = 40000) => { let s = 0; const h = (b - a) / n; for (let i = 0; i < n; i++) s += f(a + (i + 0.5) * h); return s * h; };
  for (const x of [0.05, 0.5, 1, 3.7, 9, 15, 19.5]) {
    const J = (n) => quad((t) => Math.cos(n * t - x * Math.sin(t)), 0, Math.PI) / Math.PI;
    const Y = (n) => quad((t) => Math.sin(x * Math.sin(t) - n * t), 0, Math.PI) / Math.PI - quad((t) => (Math.exp(n * t) + (n % 2 ? -1 : 1) * Math.exp(-n * t)) * Math.exp(-x * Math.sinh(t)), 0, 12, 40000) / Math.PI;
    [J(0), J(1), Y(0), Y(1)].forEach((v, i) => assert.ok(Math.abs(model.bessel(i, x) - v) < 2e-7 * Math.max(1, Math.abs(v)), `which ${i} at ${x}: ${model.bessel(i, x)} vs ${v}`));
  }
});
test('fat-cylinder factor: 1 for a thin one, 2/(πx³) for a fat one', () => {
  assert.ok(Math.abs(model.fat(0.01) - 1) < 1e-3, `${model.fat(0.01)}`);
  for (const x of [40, 80]) assert.ok(Math.abs(model.fat(x) / (2 / (Math.PI * x ** 3)) - 1) < 0.05, `${x}: ${model.fat(x)}`);
});
test('a slender tube without its cap is Euler–Bernoulli’s free bar (cos βL cosh βL = 1)', () => {
  const L = 4, f = model.freqs('brass', 20, 1, 0, L, 1, 2000, 4);
  f.forEach((fi, n) => {
    const fe = model.euler('brass', 20, 1, L, n), b = model.BETA_L[n];
    assert.ok(Math.abs(Math.cos(b) * Math.cosh(b) - 1) < 1e-6 * Math.cosh(b));
    assert.ok(fi < fe && fi > fe * 0.997, `mode ${n + 1}: ${fi} vs ${fe}`); // shear and rotary inertia only lower it, a little
  });
});
// A Timoshenko beam by finite elements: linear w and ψ, one-point shear (no locking), consistent
// mass, the cap a lumped mass and inertia on the top node; Richardson-extrapolated in the mesh.
function feFreqs(T, ne, count) {
  const s = T.section, L = T.L, h = L / ne, n = 2 * (ne + 1), K = new Float64Array(n * n), M = new Float64Array(n * n);
  const EI = s.E * s.I, kGA = s.kappa * s.G * s.A, rA = s.rho * s.A, rI = s.rho * s.I;
  const add = (A, i, j, v) => { A[i * n + j] += v; };
  for (let e = 0; e < ne; e++) {
    const d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3]; // w₁ ψ₁ w₂ ψ₂
    // bending: EI ∫ψ′²; shear at the midpoint: κGA h (w′ − ψ)², w′ = (w₂ − w₁)/h, ψ = (ψ₁ + ψ₂)/2
    const B = [-1 / h, -0.5, 1 / h, -0.5];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) add(K, d[a], d[b], kGA * h * B[a] * B[b]);
    for (const [a, b, v] of [[1, 1, 1], [1, 3, -1], [3, 1, -1], [3, 3, 1]]) add(K, d[a], d[b], (EI / h) * v);
    for (const [a, b, c] of [[0, 0, 2], [0, 2, 1], [2, 0, 1], [2, 2, 2]]) add(M, d[a], d[b], ((rA * h) / 6) * c);
    for (const [a, b, c] of [[1, 1, 2], [1, 3, 1], [3, 1, 1], [3, 3, 2]]) add(M, d[a], d[b], ((rI * h) / 6) * c);
  }
  add(M, n - 2, n - 2, s.mc); add(M, n - 1, n - 1, s.Jc);
  const { lambda } = genEig(K, M, n, 0);
  return Array.from(lambda).filter((l) => l > 1).slice(0, count).map((l) => Math.sqrt(l) / TAU);
}
test('the capped tube’s modes agree with a finite-element tube (C4, A4 with no cap, a 400 g cap at F5)', () => {
  for (const T of [C4, model.tube(69, P({ cap: 0 })), model.tube(77, P({ cap: 400 }))]) {
    const a = feFreqs(T, 90, 8), b = feFreqs(T, 180, 8);
    b.forEach((fb, i) => {
      const fx = fb + (fb - a[i]) / 3; // the error goes as h²
      assert.ok(Math.abs(cents(T.modes[i].f, fx)) < 0.5, `key ${T.key} mode ${i + 1}: ${T.modes[i].f.toFixed(3)} vs ${fx.toFixed(3)} Hz`);
    });
  }
});
test('mode shapes: free at the bottom, unit modal mass with the cap, orthogonal', () => {
  const T = C4, s = T.section, L = T.L, N = 4000, at = (i, x) => model.modeAt(60, P(), i, x);
  for (const i of [0, 3, 5, 12]) {
    const e = 1e-6 * L, w0 = at(i, 0), w1 = at(i, e), w2 = at(i, 2 * e);
    const shear = (w1.w - w0.w) / e - w0.psi, moment = (w1.psi - w0.psi) / e;
    assert.ok(Math.abs(shear) < 1e-4 * Math.abs(w0.w * 10), `mode ${i + 1} shear at the bottom ${shear}`);
    assert.ok(Math.abs(moment) < 1e-3 * Math.abs(w0.psi) + 1e-4, `mode ${i + 1} moment at the bottom ${moment} (${w2.psi})`);
  }
  for (const [m, n] of [[0, 0], [3, 3], [5, 5], [0, 3], [3, 5], [4, 12]]) {
    let sum = 0;
    for (let q = 0; q <= N; q++) {
      const x = (L * q) / N, a = at(m, x), b = at(n, x), wgt = q === 0 || q === N ? 1 : q % 2 ? 4 : 2;
      sum += wgt * s.rho * (s.A * a.w * b.w + s.I * a.psi * b.psi);
    }
    const top = [at(m, L), at(n, L)];
    sum = (sum * L) / (3 * N) + s.mc * top[0].w * top[1].w + s.Jc * top[0].psi * top[1].psi;
    assert.ok(Math.abs(sum - (m === n ? 1 : 0)) < 1e-6, `⟨${m + 1}, ${n + 1}⟩ = ${sum}`);
  }
});
test('the closed-form transform ∫w e^{iκx} dx matches quadrature of the shape', () => {
  const L = C4.L, N = 20000;
  for (const [i, kappa] of [[3, 0], [3, 9.6], [6, 15], [20, 80]]) {
    let re = 0, im = 0;
    for (let q = 0; q < N; q++) { const x = (L * (q + 0.5)) / N, w = model.modeAt(60, P(), i, x).w; re += w * Math.cos(kappa * x); im += w * Math.sin(kappa * x); }
    re *= L / N; im *= L / N;
    const [r2, i2] = model.transform(60, P(), i, kappa);
    assert.ok(Math.hypot(r2 - re, i2 - im) < 1e-5 * Math.hypot(re, im) + 1e-9, `mode ${i + 1}, κ ${kappa}: ${r2},${i2} vs ${re},${im}`);
  }
});
test('radiation: a high mode of a long tube loses energy as the 2-D cylinder does, (π²/2)ρck³a⁴(1 − β²/k²) per length', () => {
  const T = model.tube(36, P()), s = T.section, rho0 = model.RHO_AIR, c = model.C_AIR;
  for (const m of T.modes.filter((m) => m.f > 2500 && m.f < 6000)) {
    // a standing bending wave of wavenumber β < k radiates at the angle cos θ = β/k, where the
    // dipole's sin²θ is 1 − β²/k²
    const k = (TAU * m.f) / c, R = ((Math.PI ** 2) / 2) * rho0 * c * k ** 3 * s.a ** 4 * model.fat(k * s.a) * (1 - (m.beta / k) ** 2);
    const ww = m.w.reduce((t, v, j) => t + v * v * (j === 0 || j === T.NX - 1 ? 0.5 : 1), 0) * (T.L / (T.NX - 1));
    const sigma = (R * ww) / 2;
    assert.ok(Math.abs(m.sigRad / sigma - 1) < 0.05, `mode ${m.n} at ${m.f.toFixed(0)} Hz: ${m.sigRad} vs ${sigma}`);
  }
});
test('below coincidence (≈ 404 Hz) the modes barely radiate; above, they do', () => {
  const s = C4.section, fc = (model.C_AIR ** 2 / TAU) * Math.sqrt((s.rho * s.A) / (s.E * s.I));
  assert.ok(Math.abs(fc - 404) < 2, `${fc}`);
  const [m1, m2, m3, m4, , m6] = C4.modes;
  assert.ok(6.91 / m3.sigRad > 3600 && 6.91 / m2.sigRad > 3600 && 6.91 / m1.sigRad > 3600, 'modes 1–3 take over an hour to radiate their energy');
  assert.ok(6.91 / m6.sigRad < 30 && m4.sigRad < m6.sigRad / 10, `modes 4 and 6: ${6.91 / m4.sigRad} s, ${6.91 / m6.sigRad} s`);
});

console.log('tuning');
test('every tube is cut so that mode 4 is an octave above its key, for every metal, section and cap', () => {
  for (const o of [{}, { material: 'aluminium', cap: 0 }, { material: 'steel', diameter: 63.5, wall: 4, cap: 400 }, { diameter: 20, wall: 0.5, cap: 400 }]) {
    for (let k = 21; k <= 108; k += o.material ? 7 : 1) {
      const T = model.tube(k, P(o));
      assert.ok(Math.abs(cents(T.modes[3].f, 2 * keyFreq(k))) < 0.01, `${JSON.stringify(o)} key ${k}: ${T.modes[3].f} vs ${2 * keyFreq(k)}`);
    }
  }
});
test('modes 4, 5 and 6 lie near 2 : 3 : 4 of the strike note across the orchestral set', () => {
  for (let k = KEY_LO; k <= KEY_HI; k++) {
    const T = model.tube(k, P()), s0 = T.f4 / 2;
    assert.ok(Math.abs(cents(T.modes[4].f / s0, 3)) < 70 && Math.abs(cents(T.modes[5].f / s0, 4)) < 70, `key ${k}: ${T.modes[4].f / s0}, ${T.modes[5].f / s0}`);
  }
  // a thin bar's (2n + 1)² ratios, 81 : 121 : 169, for a slender tube with no cap
  const T = model.tube(24, P({ cap: 0, diameter: 20, wall: 1 }));
  assert.ok(Math.abs(T.modes[4].f / T.modes[3].f / (121 / 81) - 1) < 0.003 && Math.abs(T.modes[5].f / T.modes[3].f / (169 / 81) - 1) < 0.004, `${T.modes[4].f / T.modes[3].f} ${T.modes[5].f / T.modes[3].f}`);
});
test('a cap lowers the low modes most: mode 1 falls against mode 4, modes 5 and 6 rise', () => {
  for (const k of [60, 77]) {
    const r = (cap) => { const m = model.tube(k, P({ cap })).modes; return [m[0].f / m[3].f, m[4].f / m[3].f, m[5].f / m[3].f]; };
    const [a, b, c] = [r(0), r(120), r(400)];
    assert.ok(a[0] > b[0] && b[0] > c[0], `mode 1: ${a[0]} ${b[0]} ${c[0]}`);
    assert.ok(a[1] < b[1] && b[1] < c[1] && a[2] < b[2] && a[2] < c[2], `modes 5, 6: ${a.slice(1)} ${b.slice(1)} ${c.slice(1)}`);
  }
});
test('aluminium tubes are longer than brass for the same note', () => {
  assert.ok(model.tube(60, P({ material: 'aluminium' })).L > C4.L * 1.1);
});

console.log('engine');
test('the engine rings at the model’s modes 4–6, and plays no line at the strike note', () => {
  const { L } = one(64, P({ pedalLock: true }), 0.8, 2.5), T = model.tube(64, P()), a = Math.round(0.3 * FS), b = Math.round(2.4 * FS);
  for (const i of [3, 4, 5]) { const f = peak(L, T.modes[i].f, a, b); assert.ok(Math.abs(cents(f, T.modes[i].f)) < 1, `mode ${i + 1}: ${f} vs ${T.modes[i].f}`); }
  assert.ok(tone(L, T.f4 / 2, a, b) < 0.03 * tone(L, T.modes[3].f, a, b), 'a line at the strike note');
});
test('each mode decays at the model’s rate (the metal and the radiation)', () => {
  const T = model.tube(64, P()), { L } = one(64, P({ pedalLock: true }), 0.8, 4.2), w = Math.round(0.4 * FS);
  for (const i of [3, 5, 6]) {
    const m = T.modes[i], a1 = tone(L, m.f, Math.round(0.5 * FS), Math.round(0.5 * FS) + w), a2 = tone(L, m.f, Math.round(3.5 * FS), Math.round(3.5 * FS) + w);
    const sigma = Math.log(a1 / a2) / 3, want = m.sigRad + Math.PI * m.f * DEFAULTS.eta;
    assert.ok(Math.abs(sigma / want - 1) < 0.1, `mode ${i + 1}: σ ${sigma} vs ${want}`);
  }
});
test('the mallet: a Hertzian contact of about a millisecond, shorter and brighter for a harder face', () => {
  const contact = (o) => { const { e } = one(64, P({ pedalLock: true, ...o }), 0.8, 0.1); return e.voices[0].lastContactMs; };
  const soft = contact({ hardness: 150 }), raw = contact({}), hard = contact({ hardness: 30000 });
  assert.ok(raw > 0.6 && raw < 1.6, `rawhide ${raw} ms`);
  assert.ok(soft > raw * 1.5 && hard < raw / 1.5, `${soft} ${raw} ${hard}`);
  const bright = (o) => { const { L } = one(64, P({ pedalLock: true, ...o }), 0.8, 0.3); const T = model.tube(64, P()); return tone(L, T.modes[9].f, 0, 0.3 * FS) / tone(L, T.modes[3].f, 0, 0.3 * FS); };
  assert.ok(bright({ hardness: 30000 }) > 4 * bright({ hardness: 150 }));
});
test('MPE slide: a note’s own mallet face', () => {
  const T = model.tube(64, P()), go = (slide) => {
    const e = new TubularEngine(FS); e.setParams(P({ pedalLock: true }));
    if (slide) e.handle({ type: 'slide', key: 64, value: 30000 });
    e.noteOn(64, 0.8);
    const n = 0.3 * FS, L = new Float32Array(n), bl = 128, a = new Float32Array(bl), b = new Float32Array(bl);
    for (let s = 0; s < n; s += bl) { e.process(a, b, bl); L.set(a.subarray(0, Math.min(bl, n - s)), s); }
    return tone(L, T.modes[9].f, 0, n) / tone(L, T.modes[3].f, 0, n);
  };
  assert.ok(go(true) > 2 * go(false));
});
test('striking lower down: a mode with its node at the mallet drops out', () => {
  const T = C4, j = T.modes[4].w.reduce((best, v, q) => (q > T.NX / 2 && Math.abs(v) < Math.abs(T.modes[4].w[best]) ? q : best), T.NX - 1);
  const strike = 1 - j / (T.NX - 1);
  const r = (s) => { const { L } = one(60, P({ pedalLock: true, strike: s }), 0.8, 1); return tone(L, T.modes[4].f, 0.2 * FS, FS) / tone(L, T.modes[3].f, 0.2 * FS, FS); };
  assert.ok(r(strike) < 0.2 * r(0), `mode 5 at its node (${(100 * strike).toFixed(1)} %): ${r(strike)} vs ${r(0)}`);
});
test('the damper bar: a released key is damped, unless the pedal is down or held', () => {
  const tail = (o, events) => { const { L } = render(P(o), 2, events); return rms(L, 1.5 * FS, 2 * FS) / rms(L, 0.05 * FS, 0.3 * FS); };
  const off = [[0, 'on', 64, 0.8], [0.4, 'off', 64]];
  const damped = tail({}, off), pedal = tail({}, [[0, 'sus', 1], ...off]), lock = tail({ pedalLock: true }, off), held = tail({}, [[0, 'on', 64, 0.8]]);
  assert.ok(damped < 0.01, `damped ${damped}`);
  assert.ok(pedal > 0.2 && lock > 0.2 && held > 0.2, `${pedal} ${lock} ${held}`);
  const { e } = render(P(), 3, off);
  assert.equal(e.voices.length, 0, 'the damped tube’s voice ends');
});
test('stereo from the frame: a low tube reaches the left microphone first, a high one the right; the level stays at every distance', () => {
  const lr = (k, o = {}) => { const { L, R } = one(k, P({ pedalLock: true, ...o }), 0.8, 1); return { L, R }; };
  const onset = (x) => { let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v)); return x.findIndex((v) => Math.abs(v) > 0.2 * pk); };
  for (const [k, sign] of [[48, 1], [89, -1]]) {
    const { L, R } = lr(k, { fullRange: true }), lag = onset(R) - onset(L);
    assert.ok(sign * lag > 10, `key ${k}: the right channel ${lag} samples after the left`);
    assert.ok(sign * (rms(L) - rms(R)) > 0, `key ${k}: ${rms(L)} ${rms(R)}`);
  }
  const level = (o) => { const { L, R } = lr(64, o); return Math.hypot(rms(L), rms(R)); }, base = level({});
  for (const d of [0.8, 12]) { const v = level({ distance: d }); assert.ok(Math.abs(20 * Math.log10(v / base)) < 6, `${d} m: ${(20 * Math.log10(v / base)).toFixed(1)} dB`); }
});
test('level: one forte note peaks in 0.05–0.8, no NaN, louder for harder strokes, over all 88 keys', () => {
  for (let k = 21; k <= 108; k += 3) {
    const { L, R } = one(k, P({ pedalLock: true, fullRange: true }), 1, 0.5);
    let pk = 0; for (let i = 0; i < L.length; i++) { assert.ok(Number.isFinite(L[i]) && Number.isFinite(R[i]), `NaN at key ${k}`); pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
    assert.ok(pk > 0.05 && pk < 0.8, `key ${k}: peak ${pk}`);
  }
  assert.ok(rms(one(64, P(), 1, 0.5).L) > 3 * rms(one(64, P(), 0.3, 0.5).L));
});
test('a tube the page sends with the note plays the same as the engine’s own', () => {
  const a = one(66, P({ pedalLock: true }), 0.8, 0.5).L, b = one(66, P({ pedalLock: true }), 0.8, 0.5, { data: (k) => model.voiceData(k, P()) }).L;
  for (let i = 0; i < a.length; i += 97) assert.equal(a[i], b[i]);
});
test('every preset plays', () => {
  for (const pr of PRESETS) { const { L } = one(64, P(pr.p), 0.8, 0.4); assert.ok(rms(L) > 1e-3 && Number.isFinite(rms(L)), pr.name); }
});
test('Quality: Medium and Low keep fewer modes and fewer tubes, the same strike note', () => {
  const count = (q) => { const { e } = one(52, P({ pedalLock: true, fullRange: true }), 0.8, 0.05, { quality: q }); return e.voices[0].sounding; };
  const [hi, med, lo] = ['high', 'medium', 'low'].map(count);
  assert.ok(hi > med && med > lo && lo >= 6, `${hi} ${med} ${lo}`);
  const voices = (q) => render(P({ pedalLock: true, fullRange: true }), 0.6, Array.from({ length: 30 }, (_, i) => [0.015 * i, 'on', 40 + i, 0.6]), { quality: q }).e.voices.filter((v) => !v.fading).length;
  assert.ok(voices('high') <= 24 && voices('medium') <= 14 && voices('low') <= 8, `${voices('high')} ${voices('medium')} ${voices('low')}`);
  const T = model.tube(64, P()), f = (q) => peak(one(64, P({ pedalLock: true }), 0.8, 1.5, { quality: q }).L, T.modes[3].f, 0.3 * FS, 1.4 * FS);
  assert.ok(Math.abs(cents(f('low'), f('high'))) < 0.5);
});
test('CPU: ten ringing tubes render faster than 5× real time', () => {
  const t0 = performance.now();
  render(P({ pedalLock: true }), 4, Array.from({ length: 10 }, (_, i) => [0.01 * i, 'on', 60 + i, 0.8]));
  const ms = performance.now() - t0;
  assert.ok(ms < 4000 / 5, `${ms.toFixed(0)} ms for 4 s`);
});

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nall passed');
