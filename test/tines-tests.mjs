// Tine piano checks. Run: node test/tines-tests.mjs
import assert from 'node:assert/strict';
import { cantilever, computeKey, keyFreq, KEY_LO, KEY_HI } from '../tines/src/tine.js';
import { RhodesEngine } from '../tines/src/rhodes-engine.js';
import { DEFAULTS } from '../tines/src/rhodes-params.js';

const FS = 48000;
let failures = 0;
function test(name, fn) { try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);

function render(key, params, vel, sec, eng = {}) {
  const k = computeKey(key, params, FS);
  const e = new RhodesEngine(FS);
  e.setParams({ ...params, ...eng });
  const v = e.noteOn(key, { ...k.voice, version: 1 }, vel);
  const n = Math.round(sec * FS), L = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  for (let s = 0; s < n; s += bl) { e.process(bL, bR, bl); L.set(bL.subarray(0, Math.min(bl, n - s)), s); }
  return { L, k, v, e };
}
function goertzel(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
const DRY = { drive: 0, cable: 100, tone: 20000, tremDepth: 0 };

console.log('mechanics');
test('FEM cantilever: f₁ and overtone ratios match Euler–Bernoulli', () => {
  const c = cantilever({ L: 0.05, d: 1.9e-3, ms: 0, s: 0, nModes: 4 });
  const exact = ((1.8751 ** 2) / (2 * Math.PI)) * Math.sqrt(c.EI / c.mu) / 0.05 ** 2;
  assert.ok(Math.abs(c.omega[0] / (2 * Math.PI) / exact - 1) < 1e-4);
  [6.2669, 17.5475, 34.3861].forEach((r, i) => assert.ok(Math.abs(c.omega[i + 1] / c.omega[0] - r) < 2e-3 * r, `mode ${i + 2}`));
  assert.ok(Math.abs(c.Gamma[0] ** 2 / c.mt - 0.6131) < 1e-3);
});
test('every key: the sustaining fork mode sits on pitch', () => {
  for (let m = KEY_LO; m <= KEY_HI; m++) {
    const k = computeKey(m, P(), FS), f0 = keyFreq(m);
    // among modes within a semitone, the longest-ringing one is the note
    const near = k.modes.filter((x) => Math.abs(cents(x.f, f0)) < 100);
    const best = near.reduce((a, b) => (b.sigma < a.sigma ? b : a));
    assert.ok(Math.abs(cents(best.f, f0)) < 0.5, `${m}: ${cents(best.f, f0)} ¢`);
  }
});
test('tone bar: matched bar keeps the block still → long sustain; no bar → short', () => {
  const t60 = (o) => {
    const k = computeKey(69, P(o), FS), f0 = keyFreq(69);
    const md = k.modes.filter((x) => Math.abs(cents(x.f, f0)) < 30).sort((a, b) => b.tineFrac - a.tineFrac)[0];
    return 6.91 / md.sigma;
  };
  const withBar = t60({}), noBar = t60({ barMass: 0.01 }), detuned = t60({ barTune: 40 });
  assert.ok(noBar < 0.2 * withBar && detuned < withBar, `with ${withBar.toFixed(1)} s, none ${noBar.toFixed(2)} s, detuned ${detuned.toFixed(1)} s`);
  console.log(`        A4 sustain T60: matched bar ${withBar.toFixed(1)} s · bar +40 ¢ ${detuned.toFixed(1)} s · no bar ${noBar.toFixed(2)} s`);
});

console.log('engine');
test('A4 plays 440 Hz and is finite', () => {
  const { L } = render(69, P(), 1.8, 1.2, DRY);
  let best = 0, bf = 0;
  for (let f = 437; f <= 443; f += 0.05) { const g = goertzel(L, f, 0.2 * FS, 1.2 * FS); if (g > best) { best = g; bf = f; } }
  assert.ok(Math.abs(cents(bf, 440)) < 2, `f=${bf}`);
  for (const s of L) assert.ok(Number.isFinite(s));
});
test('pickup: harder strikes swing further into the nonlinearity (more 2nd harmonic)', () => {
  const h2 = (vel) => { const { L } = render(57, P(), vel, 0.8, DRY); return 20 * Math.log10(goertzel(L, 440, 0.2 * FS, 0.7 * FS) / goertzel(L, 220, 0.2 * FS, 0.7 * FS)); };
  const soft = h2(0.4), hard = h2(4);
  assert.ok(hard > soft + 15, `2nd harmonic: soft ${soft.toFixed(1)} dB, hard ${hard.toFixed(1)} dB`);
  console.log(`        A3 2nd harmonic re fundamental: soft ${soft.toFixed(1)} dB → hard ${hard.toFixed(1)} dB`);
});
test('pickup: a centred tine outputs the octave, not the fundamental', () => {
  const { L } = render(57, P({ offset: 0 }), 1.8, 0.8, DRY);
  const f1 = goertzel(L, 220, 0.2 * FS, 0.7 * FS), f2 = goertzel(L, 440, 0.2 * FS, 0.7 * FS);
  assert.ok(f2 > 30 * f1, `octave/fundamental ${(f2 / f1).toFixed(1)}`);
});
test('dampers stop the note on release; sustain pedal keeps it', () => {
  const level = (sustain) => {
    const k = computeKey(60, P(), FS), e = new RhodesEngine(FS);
    e.setParams(P());
    e.setSustain(sustain);
    e.noteOn(60, { ...k.voice, version: 1 }, 2);
    const bl = 128, L = new Float32Array(bl), R = new Float32Array(bl);
    for (let i = 0; i < 0.3 * FS / bl; i++) e.process(L, R, bl);
    e.noteOff(60);
    let s = 0;
    for (let i = 0; i < 0.5 * FS / bl; i++) e.process(L, R, bl);
    for (let i = 0; i < 0.1 * FS / bl; i++) { e.process(L, R, bl); for (const v of L) s += v * v; }
    return Math.sqrt(s);
  };
  assert.ok(level(true) > 30 * level(false));
});
test('stable across extremes', () => {
  const cases = [P({ gap: 0.4, poleRadius: 0.3, offset: 1.2, drive: 1, hardness: 10, tipExp: 1 }), P({ barMass: 0.01, blockMass: 5, mountDamp: 2, mountRatio: 3 }),
    P({ tineDiameter: 2.8, springMass: 1.5, springPos: 1, strike: 40, hysteresis: 1e-3, hardness: 0.1 }), P({ barMass: 60, barTune: -100, mountDamp: 0.02, tremDepth: 1 })];
  for (const c of cases) for (const key of [KEY_LO, 60, KEY_HI]) {
    const { L } = render(key, c, 5, 0.4);
    for (const s of L) assert.ok(Number.isFinite(s) && Math.abs(s) < 20);
  }
});

console.log('performance');
test('20 sounding keys', () => {
  const e = new RhodesEngine(FS); e.setParams(P());
  for (let i = 0; i < 20; i++) { const key = 36 + 3 * i; e.noteOn(key, { ...computeKey(key, P(), FS).voice, version: 1 }, 2); }
  const bl = 128, L = new Float32Array(bl), R = new Float32Array(bl);
  for (let i = 0; i < 50; i++) e.process(L, R, bl);
  const blocks = 2000, t0 = performance.now();
  for (let i = 0; i < blocks; i++) e.process(L, R, bl);
  const ms = performance.now() - t0, audio = (blocks * bl * 1000) / FS;
  console.log(`        ${(100 * ms / audio).toFixed(1)} % of one core`);
  assert.ok(ms < 0.4 * audio);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
