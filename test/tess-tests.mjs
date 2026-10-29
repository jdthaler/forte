// TESS checks. Run: node test/tess-tests.mjs
//
// The physics against what is known independently (the overlap of two discs, the small-planet
// limit, Kepler's law against the published orbits of TESS's planets, Winn's transit duration,
// TESS's noise floor), then the engine against the model. Both are the C++
// (native/instruments/tess), built as WebAssembly: the model's functions through tess-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../tess/src/tess-instrument.js';
import { wasmModel } from '../tess/src/tess-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq, keyPan } from '../shared/dsp.js';
import { tunedFreq } from '../shared/tuning.js';

const TessEngine = await loadEngine(INSTRUMENT);
const model = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });

// Render one note through the engine, 128-sample blocks like the AudioWorklet, at a Quality
// ('high', 'medium' or 'low'; High unless given).
function render(key, params, vel, sec, quality, both = false) {
  const e = new TessEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  e.noteOn(key, vel);
  const n = Math.round(sec * FS), L = new Float32Array(n), R = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  for (let s = 0; s < n; s += bl) { e.process(bL, bR, bl); L.set(bL.subarray(0, Math.min(bl, n - s)), s); R.set(bR.subarray(0, Math.min(bl, n - s)), s); }
  return both ? [L, R] : L;
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

const quiet = (o = {}) => P({ noise: false, ...o });
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const preset = (name) => P(PRESETS.find((p) => p.name.startsWith(name)).p);
const R_SUN = 6.957e8, AU = 1.495978707e11;
const maxStep = (x, a, b) => { let m = 0; for (let i = Math.max(1, a); i < b; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1])); return m; };

console.log('physics');
test('a dark disc on a uniform star blocks the two discs\' overlap (the lens area) over π', () => {
  const lens = (z, k) => {
    if (z >= 1 + k) return 0;
    if (z <= Math.abs(1 - k)) return Math.PI * Math.min(1, k) ** 2;
    const a = Math.acos((z * z + k * k - 1) / (2 * z * k)), b = Math.acos((z * z + 1 - k * k) / (2 * z));
    return k * k * a + b - 0.5 * Math.sqrt((-z + k + 1) * (z + k - 1) * (z - k + 1) * (z + k + 1));
  };
  for (const k of [0.01, 0.1, 0.5, 2, 7.28]) for (const f of [0, 0.3, 0.7, 0.95, 0.99, 1.02]) {
    const z = f * (1 + k), want = lens(z, k) / Math.PI, got = model.blocked(z, k, 0, 0);
    assert.ok(Math.abs(got - want) < 2e-4 * Math.max(want, k * k, 1e-3), `k ${k}, z ${z.toFixed(3)}: ${got} vs ${want}`);
  }
});
test('a small planet blocks k² times the intensity under it, over the disc\'s mean: k² I(z) / (1 − u₁/3 − u₂/6)', () => {
  const u1 = 0.34, u2 = 0.24, k = 0.005;
  for (const z of [0, 0.4, 0.8, 0.95]) {
    const mu = Math.sqrt(1 - z * z), I = 1 - u1 * (1 - mu) - u2 * (1 - mu) ** 2;
    const want = (k * k * I) / (1 - u1 / 3 - u2 / 6), got = model.blocked(z, k, u1, u2);
    assert.ok(Math.abs(got / want - 1) < 3e-3, `z ${z}: ${got} vs ${want}`);
  }
  assert.equal(model.blocked(0.5, 2, u1, u2) > 0.999999, true, 'a planet bigger than the star hides all of it');
});
test('limb darkening: Claret (2017)\'s TESS-band coefficients at the four tabulated stars, interpolated between', () => {
  for (const [t, u1, u2] of [[3216, 0.12, 0.53], [4910, 0.43, 0.21], [5743, 0.34, 0.24], [6230, 0.31, 0.25]]) {
    const ld = model.limbDarkening(t);
    assert.ok(Math.abs(ld.u1 - u1) < 1e-12 && Math.abs(ld.u2 - u2) < 1e-12, `${t} K`);
  }
  const ld = model.limbDarkening(6000);
  assert.ok(ld.u1 < 0.34 && ld.u1 > 0.31 && ld.u2 > 0.24 && ld.u2 < 0.25);
});
test('Kepler\'s third law: a one-year planet round the Sun orbits at 1 au (215.03 R☉)', () => {
  const o = model.orbit(69, preset('The Earth'));
  assert.ok(Math.abs(o.aR * R_SUN / AU - 1) < 1e-3, `${(o.aR * R_SUN / AU).toFixed(5)} au`);
  assert.ok(Math.abs(o.period - 365.256 * 86400) < 1, 'its year');
});
test('TESS\'s planets, each put on A4 by its preset, where their discoverers found them: a/R★ and Rp/R★ within 3 % (4 % for WD 1856)', () => {
  // Huang et al. 2018; Vanderspek et al. 2019; Gilbert et al. 2020; Vanderburg et al. 2020 (NASA Exoplanet Archive)
  for (const [name, aR, k] of [['π Mensae', 13.38, 0.01703], ['LHS 3844', 7.109, 0.0641], ['TOI-700', 84.0, 0.0260], ['WD 1856', 336, 7.28]]) {
    const o = model.orbit(69, preset(name));
    // (WD 1856's fitted a/R★ is 3.6 % above Kepler's from its mass and radius, within their errors)
    assert.ok(Math.abs(o.aR / aR - 1) < (name === 'WD 1856' ? 0.04 : 0.03), `${name}: a/R★ ${o.aR.toFixed(3)} vs ${aR}`);
    assert.ok(Math.abs(o.k / k - 1) < 0.03, `${name}: Rp/R★ ${o.k.toFixed(4)} vs ${k}`);
  }
});
test('the transit lasts Winn (2010)\'s T₁₄ = (P/π) asin(√((1 + k)² − b²) / (a sin i)), on every octave', () => {
  for (const key of [21, 45, 69, 93]) for (const impact of [0, 0.5, 0.9]) {
    const o = model.orbit(key, P({ impact })), si = Math.sqrt(1 - o.cosi ** 2);
    const want = (o.period / Math.PI) * Math.asin(Math.sqrt((1 + o.k) ** 2 - o.b ** 2) / (o.aR * si));
    assert.ok(Math.abs(2 * o.phiT * o.period / want - 1) < 1e-9, `key ${key}, b ${impact}`);
  }
  assert.equal(model.orbit(69, P({ impact: 1.05 })).phiT, 0, 'past grazing it misses');
});
test('TESS\'s noise: 1.04×10⁴ photons a second from T = 10; bright stars reach the 60 ppm-in-an-hour floor', () => {
  assert.ok(Math.abs(model.photons(10) / 1.0447e4 - 1) < 1e-3, `${model.photons(10)}`);
  const bright = model.noise(4, 3600);
  assert.ok(bright > 60e-6 && bright < 66e-6, `T = 4: ${(bright * 1e6).toFixed(1)} ppm`);
  const t10 = model.noise(10, 3600), t14 = model.noise(14, 3600);
  assert.ok(t10 > 150e-6 && t10 < 250e-6, `T = 10: ${(t10 * 1e6).toFixed(0)} ppm in an hour`);
  assert.ok(Math.abs(model.noise(12, 7200) / model.noise(12, 1800) - 0.5) < 1e-9, 'white: √t');
  assert.ok(t14 > 5 * t10, 'fainter is noisier');
});
test('the light curve\'s Fourier series: c₀ is the mean dip, and the series sums back to the dip at mid-transit', () => {
  for (const key of [33, 69, 96]) {
    const p = P(), o = model.orbit(key, p), H = 2047, c = model.harmonics(key, p, H);
    const N = 20000, ph = Array.from({ length: N }, (_, i) => -0.5 + (i + 0.5) / N), d = model.dips(key, p, ph);
    const mean = d.reduce((s, x) => s + x, 0) / N;
    assert.ok(Math.abs(c[0] / mean - 1) < 2e-3, `key ${key}: c₀ ${c[0]} vs ${mean}`);
    const sum = c[0] + 2 * c.slice(1).reduce((s, x) => s + x, 0);
    assert.ok(Math.abs(sum / o.depth - 1) < 0.02, `key ${key}: ${sum} vs depth ${o.depth}`);
  }
});

console.log('engine');
test('every key sounds its planet\'s year, sped up: the fundamental on the note (within 0.5 ¢), in the keyboard\'s tuning too', () => {
  for (const [k, o] of [[33, {}], [57, {}], [69, {}], [81, {}], [69, { pitch: 415 }], [60, { temperament: 'meantone' }]]) {
    const f = tunedFreq(P(o), k), x = render(k, quiet(o), 0.7, 1), a = 9600, b = a + 32768;
    assert.ok(Math.abs(cents(peak(x, f, a, b), f)) < 0.5, `${k}: ${cents(peak(x, f, a, b), f).toFixed(2)} ¢`);
  }
});
test('the sound is the light curve: its harmonics in the model\'s proportions (within 0.3 dB)', () => {
  for (const k of [45, 57]) {
    const p = quiet(), c = model.harmonics(k, p, 8), f = keyFreq(k), x = render(k, p, 0.7, 1.2), a = 9600, b = a + 40000;
    for (let n = 2; n <= 5; n++) {
      const got = 20 * Math.log10(tone(x, n * f, a, b) / tone(x, f, a, b)), want = 20 * Math.log10(Math.abs(c[n] / c[1]));
      assert.ok(Math.abs(got - want) < 0.3, `key ${k}, harmonic ${n}: ${got.toFixed(2)} dB vs ${want.toFixed(2)}`);
    }
  }
});
test('the dip plays at the full scale: a 1.22 % dip at 1 % full scale peaks near 0.2 × 1.22 × velocity', () => {
  const x = render(45, quiet(), 1, 1), o = model.orbit(45, P());
  let lo = Infinity, hi = -Infinity;
  for (let i = 24000; i < x.length; i++) { lo = Math.min(lo, x[i]); hi = Math.max(hi, x[i]); }
  const [gl] = keyPan(45), want = (0.2 * o.depth / 0.01) * gl;
  assert.ok(Math.abs((hi - lo) / want - 1) < 0.08, `${(hi - lo).toFixed(4)} peak to peak vs ${want.toFixed(4)}`);
});
test('toward the edge the dips are shorter and shallower: quieter, buzzier; a planet that misses plays only the hiss', () => {
  const k = 45, f = keyFreq(k), a = 9600, b = a + 32768;
  const bright = (x) => tone(x, 32 * f, a, b) / tone(x, f, a, b);
  const centre = render(k, quiet({ impact: 0 }), 0.7, 1), graze = render(k, quiet({ impact: 0.9 }), 0.7, 1);
  assert.ok(bright(graze) > 2 * bright(centre), `32nd harmonic: ${bright(graze).toFixed(3)} vs ${bright(centre).toFixed(3)}`);
  assert.ok(rms(graze, a) < 0.3 * rms(centre, a), 'quieter');
  assert.ok(rms(render(k, quiet({ impact: 1.05 }), 0.7, 0.5)) < 1e-6, 'a miss is silent without noise');
});
test('the hiss is TESS\'s photon noise at the star\'s brightness, played at the speed-up', () => {
  for (const [vel, tmag] of [[1, 9], [0.3, 12]]) {
    const p = P({ impact: 1.1, tmag }), [L, Rr] = render(69, p, vel, 1, undefined, true);
    const o = model.orbit(69, p), sigma = model.noise(tmag - 2.5 * Math.log10(vel), o.speedup / FS), gain = (0.2 * vel) / p.scale;
    const got = Math.hypot(rms(L, 4800), rms(Rr, 4800)), want = gain * sigma;
    assert.ok(Math.abs(got / want - 1) < 0.05, `vel ${vel}, T ${tmag}: ${got.toExponential(3)} vs ${want.toExponential(3)}`);
  }
});
test('a harder key is a brighter star: the dips grow as the velocity, the hiss only as its square root (nearly)', () => {
  const sig = (v) => rms(render(57, quiet(), v, 1), 9600), hiss = (v) => rms(render(57, P({ impact: 1.1, tmag: 10 }), v, 1), 9600);
  assert.ok(Math.abs(sig(1) / sig(0.25) - 4) < 0.05, `signal ×${(sig(1) / sig(0.25)).toFixed(3)}`);
  const r = hiss(1) / hiss(0.25);
  assert.ok(r > 1.6 && r < 2.1, `hiss ×${r.toFixed(3)} (√4 = 2, less where the sky\'s and the cameras\' noise count)`);
});
test('a let-go planet finishes the dip it is in and stops while the light is steady: no click, silent after', () => {
  for (const k of [33, 57, 69]) {
    const e = new TessEngine(FS); e.setParams(quiet()); e.noteOn(k, 1);
    const bL = new Float32Array(128), bR = new Float32Array(128), out = [];
    for (let b = 0; b < 100; b++) { e.process(bL, bR, 128); out.push(...bL); }
    e.noteOff(k);
    for (let b = 0; b < 200; b++) { e.process(bL, bR, 128); out.push(...bL); }
    assert.equal(e.voiceCount(), 0, `key ${k}: voices left`);
    // the band-limited dip's own steepest step, while it plays, against every step from the start to the end
    const steady = maxStep(out, 4800, 100 * 128), jump = maxStep(out, 0, out.length);
    assert.ok(jump < 1.05 * steady + 1e-3, `key ${k}: a step of ${jump.toFixed(4)}, the dip's own ${steady.toFixed(4)}`);
    assert.ok(Math.abs(out[out.length - 1]) < 2e-3, `key ${k}: ${out[out.length - 1]} at the end`);
  }
});
test('Space keeps TESS watching: a let-go planet plays on until the pedal comes up', () => {
  const e = new TessEngine(FS), bL = new Float32Array(128), bR = new Float32Array(128);
  e.setParams(quiet()); e.setSustain(true); e.noteOn(60, 0.7); e.noteOff(60);
  for (let b = 0; b < 200; b++) e.process(bL, bR, 128);
  assert.equal(e.voiceCount(), 1);
  e.setSustain(false);
  for (let b = 0; b < 100; b++) e.process(bL, bR, 128);
  assert.equal(e.voiceCount(), 0);
});
test('every preset, and the extremes, on every octave: finite, and a chord stays under 1', () => {
  const sets = [...PRESETS.map((p) => P(p.p)), P({ starRadius: 0.01, starMass: 3, planetRadius: 25 }), P({ starRadius: 3, starMass: 0.08, planetRadius: 0.3, tmag: 17 }), P({ periodA4: 0.05 }), P({ periodA4: 400, scale: 1e-5 })];
  for (const p of sets) {
    const e = new TessEngine(FS), bL = new Float32Array(128), bR = new Float32Array(128);
    e.setParams(p);
    for (const k of [21, 45, 69, 93, 108]) e.noteOn(k, 0.7);
    for (let b = 0; b < 200; b++) { e.process(bL, bR, 128); assert.ok(bL.every(Number.isFinite) && bR.every(Number.isFinite), 'NaN'); }
  }
  let pk = 0;
  const e = new TessEngine(FS), bL = new Float32Array(128), bR = new Float32Array(128);
  e.setParams(P());
  for (const k of [48, 52, 55, 60]) e.noteOn(k, 1);
  for (let b = 0; b < 400; b++) { e.process(bL, bR, 128); for (const v of bL) pk = Math.max(pk, Math.abs(v)); }
  assert.ok(pk > 0.05 && pk < 1, `peak ${pk}`);
});
test('a change of parameters while playing glides through a crossfade: no step', () => {
  const e = new TessEngine(FS), bL = new Float32Array(128), bR = new Float32Array(128), out = [];
  e.setParams(quiet()); e.noteOn(57, 1);
  for (let b = 0; b < 200; b++) { if (b % 10 === 0) e.setParams(quiet({ impact: (b / 200) * 0.95 })); e.process(bL, bR, 128); out.push(...bL); }
  const jump = maxStep(out, 4800, out.length), steady = maxStep(render(57, quiet(), 1, 1), 4800, 48000);
  assert.ok(jump < 1.05 * steady, `step ${jump.toFixed(4)}, the central dip's own ${steady.toFixed(4)}`);
});
test('CPU: ten planets with their noise render 20 times faster than real time', () => {
  const e = new TessEngine(FS), bL = new Float32Array(128), bR = new Float32Array(128);
  e.setParams(P());
  for (let i = 0; i < 10; i++) e.noteOn(36 + 5 * i, 0.7);
  const t0 = performance.now();
  for (let b = 0; b < 375 * 2; b++) e.process(bL, bR, 128);
  const ms = performance.now() - t0;
  assert.ok(ms < 100, `${ms.toFixed(0)} ms for 2 s`);
});

// What the Quality setting trims (the README says it): fewer planets at once, and the light
// curve's harmonics cut at 12 kHz (Medium) or 8 kHz (Low) instead of 20 kHz.
test('Quality: past 24 planets at Medium and 12 at Low the oldest ends; harmonics stop at 12 and 8 kHz; the note keeps its pitch and level', () => {
  const bL = new Float32Array(128), bR = new Float32Array(128);
  for (const [quality, cap] of [['high', 36], ['medium', 24], ['low', 12]]) {
    const e = new TessEngine(FS);
    e.setQuality(quality); e.setParams(quiet()); e.setSustain(true);
    for (let i = 0; i < 36; i++) { e.noteOn(36 + i, 0.7); for (let b = 0; b < 4; b++) e.process(bL, bR, 128); }
    for (let b = 0; b < 100; b++) e.process(bL, bR, 128);
    assert.equal(e.voiceCount(), cap, `${quality}: planets playing`);
  }
  const k = 33, f = keyFreq(k), hi = render(k, quiet(), 0.7, 0.6);
  for (const [quality, top] of [['medium', 12000], ['low', 8000]]) {
    const x = render(k, quiet(), 0.7, 0.6, quality), a = 4800, b = a + 16384;
    const n = Math.floor(top / f) + 2;
    assert.ok(tone(x, n * f, a, b) < 1e-3 * tone(hi, n * f, a, b) + 1e-9, `${quality}: harmonic ${n} (${(n * f).toFixed(0)} Hz) is gone`);
    const c = cents(peak(x, f, a, b), peak(hi, f, a, b)), d = 20 * Math.log10(rms(x, a) / rms(hi, a));
    assert.ok(Math.abs(c) < 0.1 && Math.abs(d) < 1.5, `${quality}: ${c.toFixed(3)} ¢, ${d.toFixed(2)} dB`);
  }
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
