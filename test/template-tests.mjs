// Template instrument checks — also the pattern for a new instrument's tests.
// Run: node test/template-tests.mjs
//
// Test the physics against something independent (a textbook result, a
// published measurement, a conservation law), then test that the engine
// produces what the model says. Both are the C++ (native/instruments/template),
// built as WebAssembly: the model's functions through template-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS } from '../docs/template/src/template-instrument.js';
import { wasmModel } from '../docs/template/src/template-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';
import { tunedFreq } from '../shared/tuning.js';

const TemplateEngine = await loadEngine(INSTRUMENT);
const { BETA_L, modeShape, keyModes } = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });

// Render one note through the engine, 128-sample blocks like the AudioWorklet.
function render(key, params, vel, sec) {
  const e = new TemplateEngine(FS);
  e.setParams(params);
  e.noteOn(key, vel);
  const n = Math.round(sec * FS), L = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  for (let s = 0; s < n; s += bl) { e.process(bL, bR, bl); L.set(bL.subarray(0, Math.min(bl, n - s)), s); }
  return L;
}
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// The strongest frequency within ±20 ¢ of f0 in x[a, b) (golden-section search on tone).
function peak(x, f0, a, b) {
  let lo = f0 * 2 ** (-20 / 1200), hi = f0 * 2 ** (20 / 1200);
  for (let i = 0; i < 40; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const cents = (a, b) => 1200 * Math.log2(a / b);

console.log('physics');
test('free–free beam: βL solves cos βL cosh βL = 1', () => {
  for (const b of BETA_L) assert.ok(Math.abs(Math.cos(b) * Math.cosh(b) - 1) < 1e-4 * Math.cosh(b), `${b}`);
});
test('mode shapes are orthonormal on [0, 1]', () => {
  const N = 4000;
  for (let m = 0; m < 4; m++) for (let n = 0; n < 4; n++) {
    let s = 0;
    for (let i = 0; i < N; i++) { const x = (i + 0.5) / N; s += modeShape(m, x) * modeShape(n, x); }
    assert.ok(Math.abs(s / N - (m === n ? 1 : 0)) < 1e-3, `<${m}|${n}> = ${s / N}`);
  }
});
test('mode 1 has its nodes at 22.4 % and 77.6 % of the length', () => {
  assert.ok(Math.abs(modeShape(0, 0.2242)) < 2e-3);
  assert.ok(Math.abs(modeShape(0, 0.7758)) < 2e-3);
});
test('half-sine pulse: flat at low f, first zero at f = 1.5/τ', () => {
  const strike = 0.1, short = keyModes(60, P({ strike, mallet: 0.05 }))[0];
  assert.ok(Math.abs(short.amp / modeShape(0, strike) - 1) < 1e-3, 'a short pulse reaches mode 1 fully');
  const f2 = keyModes(60, P())[1].f, tuned = keyModes(60, P({ strike, mallet: (1000 * 1.5) / f2 }))[1];
  assert.ok(Math.abs(tuned.amp) < 1e-6 * Math.abs(modeShape(1, strike)), `mode 2 at the pulse's first zero: ${tuned.amp}`);
});

console.log('engine');
test('the sound is at the model\'s mode frequencies, on pitch', () => {
  const x = render(69, P(), 0.7, 1);
  const f1 = keyFreq(69), a = 4800, b = 4800 + 16384;
  assert.ok(tone(x, f1, a, b) > 20 * tone(x, f1 * 1.06, a, b), 'fundamental stands out');
  const m2 = keyModes(69, P())[1].f;
  assert.ok(Math.abs(m2 / f1 - 2.7565) < 1e-3);
  assert.ok(tone(x, m2, a, b) > 10 * tone(x, m2 * 1.03, a, b), 'mode 2 present');
});
test('the keyboard\'s tuning: at A = 415 Hz, and in ¼-comma meantone (E4 −3.42 ¢, C4 +10.26 ¢), the bar is tuned to the note and sounds there (within 0.5 ¢)', () => {
  for (const [k, o, c] of [[69, { pitch: 415 }, cents(415, 440)], [64, { temperament: 'meantone' }, -3.42], [60, { temperament: 'meantone' }, 10.26]]) {
    const f = keyFreq(k) * 2 ** (c / 1200);
    assert.ok(Math.abs(cents(keyModes(k, P(o))[0].f, f)) < 0.01, `${k}: the model's fundamental`);
    assert.ok(Math.abs(cents(tunedFreq(P(o), k), f)) < 0.01, `${k}: shared/tuning.js agrees`);
    const x = render(k, P(o), 0.7, 1), a = 4800, b = 4800 + 16384;
    assert.ok(Math.abs(cents(peak(x, f, a, b), f)) < 0.5, `${k}: sounds ${cents(peak(x, f, a, b), f).toFixed(2)} ¢ from its note`);
  }
});
test('decay matches the T60 parameter', () => {
  const x = render(57, P({ t60: 2, damping: 1 }), 0.7, 2.2), f = keyFreq(57), W = 8192;
  const db = 20 * Math.log10(tone(x, f, 4800 + FS, 4800 + FS + W) / tone(x, f, 4800, 4800 + W));
  assert.ok(Math.abs(db - -30) < 0.5, `${db.toFixed(2)} dB in 1 s; T60 = 2 s means −30 dB`);
});
test('striking on mode 1\'s node silences the fundamental', () => {
  const on = render(60, P({ strike: 0.2242 }), 0.7, 0.5), off = render(60, P({ strike: 0.1 }), 0.7, 0.5);
  const f = keyFreq(60);
  assert.ok(tone(on, f, 0, 16384) < 0.01 * tone(off, f, 0, 16384));
});
test('output level is sane (peak 0.02 – 1 at full velocity)', () => {
  let pk = 0;
  for (const k of [21, 36, 60, 84, 96, 108]) for (const v of render(k, P(), 1, 0.3)) pk = Math.max(pk, Math.abs(v));
  assert.ok(pk > 0.02 && pk < 1, `peak ${pk}`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
