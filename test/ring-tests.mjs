// Storage ring checks. Run: node test/ring-tests.mjs
//
// The decoherence formulas (the C++ model, through ring-wasm.js) are checked against particles tracked turn by turn,
// the form factor against a sampled Gaussian; then the engine against the model: pitch, the
// harmonics' roll-off, the sidebands, recoherence, the RF voltage, the pickups, the beam's end.

import assert from 'node:assert/strict';
import { PICKUP_SIGMA, PRESS_GAIN, REF_KEY } from '../ring/src/ring-model.js';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../ring/src/ring-instrument.js';
import { wasmModel } from '../ring/src/ring-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';

const StorageRingEngine = await loadEngine(INSTRUMENT);
const Model = await wasmModel();
const { ringOf, detuning, chromatic, formFactor } = Model;

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const QUIET = { octupole: 0.1, damping: 20, lifetime: 600 }; // the effects a test is not about, out of the way
// deterministic Gaussian numbers
function gauss(seed) {
  let s = seed >>> 0;
  const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

// Render through the engine in 128-sample blocks like the AudioWorklet; events [t, fn(engine)].
function render(params, sec, events) {
  const e = new StorageRingEngine(FS);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float32Array(n), R = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = [...events].sort((a, b) => a[0] - b[0]);
  for (let s = 0; s < n; s += bl) {
    while (ev.length && ev[0][0] * FS <= s) ev.shift()[1](e);
    e.process(bL, bR, bl);
    const m = Math.min(bl, n - s);
    L.set(bL.subarray(0, m), s); R.set(bR.subarray(0, m), s);
  }
  return [L, R];
}
const note = (key, params, sec, vel = 0.8, more = []) => render(params, sec, [[0, (e) => e.noteOn(key, vel)], ...more]);
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const diff = ([L, R]) => L.map((v, i) => v - R[i]);
const sum = ([L, R]) => L.map((v, i) => v + R[i]);
const db = (r) => 20 * Math.log10(r);

console.log('physics');
test('amplitude detuning: the Meller formula is what 40 000 tracked particles do', () => {
  const g = gauss(7), M = 40000, Z = 2.5, mu = 4e-4, q = 0.31;
  const parts = Array.from({ length: M }, () => { const x = g() + Z, p = g(); return { x, p, Q: q + mu * (x * x + p * p) }; });
  for (const N of [50, 200, 500, 1200]) {
    let cx = 0;
    for (const s of parts) { const ph = 2 * Math.PI * s.Q * N; cx += s.x * Math.cos(ph) - s.p * Math.sin(ph); } // z·e^{+i2πQN}
    cx /= M;
    const d = detuning(4 * Math.PI * mu * N, Z), model = Z * d.amp * Math.cos(2 * Math.PI * q * N + d.phase);
    assert.ok(Math.abs(cx - model) < 0.02 * Z, `N = ${N}: tracked ${cx.toFixed(4)}, formula ${model.toFixed(4)}`);
  }
});
test('chromaticity: tracked particles decohere and recohere every synchrotron period', () => {
  const g = gauss(11), M = 20000, Qs = 0.01, chroma = 10, sd = 1e-3, q = 0.31, D = (chroma * sd) / Qs;
  const parts = Array.from({ length: M }, () => ({ a: sd * g(), b: sd * g(), ph: 0 }));
  let N = 0;
  for (const target of [25, 50, 75, 100]) {
    for (; N < target; N++) for (const s of parts) { // δ swings at Qs; the tune follows it
      const c = Math.cos(2 * Math.PI * Qs * N), si = Math.sin(2 * Math.PI * Qs * N);
      s.ph += 2 * Math.PI * (q + chroma * (s.a * c + s.b * si));
    }
    let re = 0, im = 0;
    for (const s of parts) { re += Math.cos(s.ph); im += Math.sin(s.ph); }
    const tracked = Math.hypot(re, im) / M, model = chromatic(D, 2 * Math.PI * Qs * N);
    assert.ok(Math.abs(tracked - model) < 0.02, `N = ${N}: tracked ${tracked.toFixed(4)}, formula ${model.toFixed(4)}`);
  }
  assert.ok(chromatic(D, 2 * Math.PI) > 0.9999 && chromatic(D, Math.PI) < Math.exp(-2 * D * D) * 1.0001, 'full recoherence at 1/Qs turns, deepest at half way');
});
test('form factor: a sampled Gaussian bunch has exp(−(2πnσ)²/2) harmonics', () => {
  const T = 4800, sigma = 0.03, s = sigma * T;
  for (const n of [1, 3, 6, 10]) {
    let re = 0, dc = 0;
    for (let i = 0; i < T; i++) { const u = ((i + T / 2) % T) - T / 2, g = Math.exp(-(u * u) / (2 * s * s)); re += g * Math.cos((2 * Math.PI * n * u) / T); dc += g; }
    assert.ok(Math.abs(re / dc - formFactor(n, sigma)) < 1e-9, `n = ${n}`);
  }
});
test('RF voltage: fs ∝ √V, the bunch shortens as V^(−¼), and σt·σδ (the emittance) stays put', () => {
  const a = ringOf(60, P(), 0), b = ringOf(60, P(), 1), V = 1 + PRESS_GAIN;
  assert.ok(Math.abs(b.fsyn / a.fsyn - Math.sqrt(V)) < 1e-12);
  assert.ok(Math.abs(b.sigma / a.sigma - V ** -0.25) < 1e-12);
  assert.ok(Math.abs((b.sigma * b.sigmaDelta) / (a.sigma * a.sigmaDelta) - 1) < 1e-12);
});
test('the lattice scales with the ring: the dephasing D = Q′σδ/Qs is the same on every key', () => {
  const D = ringOf(REF_KEY, P()).D;
  for (const k of [21, 36, 48, 72, 96, 108]) assert.ok(Math.abs(ringOf(k, P()).D / D - 1) < 1e-12, `${k}`);
  assert.ok(Math.abs(ringOf(48, P()).chroma / P().chroma - 2) < 1e-12, 'an octave down, twice the cells and twice the chromaticity');
});

console.log('engine');
test('every key is on pitch: the pulse train repeats at f_rev', () => {
  for (const k of [21, 24, 36, 50, 60, 69, 84, 96, 108]) {
    const f = keyFreq(k), [L] = note(k, P({ kick: 0, phase: 0, pickup: 'single' }), 1.2), a = 4800, b = 4800 + 32768;
    let best = 0, bestC = 0;
    for (let c = -8; c <= 8; c += 0.25) { const v = tone(L, 2 * f * 2 ** (c / 1200), a, b); if (v > best) { best = v; bestC = c; } }
    assert.ok(Math.abs(bestC) <= 0.5, `${k}: ${bestC} cents`);
  }
});
test('the keyboard\'s tuning: f_rev is 440·2^((m−69)/12)·415/440 at A = 415 Hz, and in ¼-comma meantone on C E4 lies 3.42 ¢ flat of equal temperament, C4 10.26 ¢ sharp, A4 on 440 Hz; the pulse train repeats there; the lattice stays the key\'s', () => {
  const cents = (a, b) => 1200 * Math.log2(a / b), mt = P({ temperament: 'meantone' });
  for (const k of [36, 64, 96]) assert.ok(Math.abs(ringOf(k, P({ pitch: 415 })).frev / ((keyFreq(k) * 415) / 440) - 1) < 1e-12, `${k} at 415 Hz`);
  for (const [k, want] of [[64, -3.42], [60, 10.26], [69, 0]]) { const c = cents(ringOf(k, mt).frev, keyFreq(k)); assert.ok(Math.abs(c - want) < 0.01, `${k} in meantone: ${c.toFixed(3)} ¢`); }
  assert.equal(ringOf(48, mt).chroma, ringOf(48, P()).chroma, 'the same cells');
  for (const [k, p] of [[50, P({ pitch: 415 })], [64, mt], [60, mt]]) {
    const f = ringOf(k, p).frev, [L] = note(k, { ...p, kick: 0, phase: 0, pickup: 'single' }, 1.2), a = 4800, b = 4800 + 32768;
    let best = 0, bestC = 0;
    for (let c = -8; c <= 8; c += 0.25) { const v = tone(L, 2 * f * 2 ** (c / 1200), a, b); if (v > best) { best = v; bestC = c; } }
    assert.ok(Math.abs(bestC) <= 0.5, `${k}: ${bestC} cents from the tuned pitch`);
  }
});
test('the harmonics roll off as the bunch\'s form factor through the button\'s high-pass', () => {
  const Pp = P({ kick: 0, phase: 0, pickup: 'single', bunch: 0.05, cutoff: 60 }), k = 57, f = keyFreq(k);
  const [L] = note(k, Pp, 1), a = 4800, b = 4800 + 32768;
  const sig = Math.hypot(Pp.bunch, PICKUP_SIGMA * f), hp = (n) => (n * f) / Math.hypot(n * f, Pp.cutoff);
  const h1 = tone(L, f, a, b);
  for (const n of [2, 3, 5, 7]) {
    const got = tone(L, n * f, a, b) / h1, want = (formFactor(n, sig) * hp(n)) / (formFactor(1, sig) * hp(1));
    assert.ok(Math.abs(db(got / want)) < 0.5, `harmonic ${n}: ${db(got).toFixed(2)} dB, model ${db(want).toFixed(2)} dB`);
  }
});
test('a kick puts betatron sidebands at (n ± Q)·f_rev; a clean injection has none', () => {
  const k = 60, f = keyFreq(k), q = DEFAULTS.tune, a = 480, b = 480 + 4096;
  const kicked = note(k, P({ ...QUIET, pickup: 'single', chroma: 0 }), 0.2)[0], clean = note(k, P({ ...QUIET, pickup: 'single', kick: 0, chroma: 0 }), 0.2)[0];
  for (const s of [1 - q, 1 + q, 2 + q]) {
    assert.ok(tone(kicked, s * f, a, b) > 30 * tone(clean, s * f, a, b), `sideband ${s.toFixed(2)}`);
  }
  const m = (1 + q) * f, line = tone(kicked, m, a, b);
  assert.ok(line > 10 * tone(kicked, m * 1.12, a, b), 'a line, not a smear');
});
test('two buttons: the sum hears the bunch, the difference only its oscillation', () => {
  const k = 60, f = keyFreq(k), q = DEFAULTS.tune, a = 480, b = 480 + 4096, x = note(k, P({ ...QUIET, chroma: 0 }), 0.2);
  const S = sum(x), Dd = diff(x);
  assert.ok(tone(S, f, a, b) > 100 * tone(Dd, f, a, b), 'the harmonic is common to both');
  assert.ok(tone(Dd, (1 + q) * f, a, b) > 100 * tone(S, (1 + q) * f, a, b), 'the sideband is in their difference');
});
test('chromaticity: the difference signal fades and recoheres at the synchrotron period, as deep as exp(−2D²)', () => {
  const Pp = P({ ...QUIET, pickup: 'delta', phase: 0, chroma: 14 }), k = 60, r = ringOf(k, Pp), Ts = 1 / r.fsyn;
  const [L] = note(k, Pp, 1.5 * Ts + 0.05), W = Math.round(0.006 * FS), at = (t) => rms(L, Math.round(t * FS) - W, Math.round(t * FS) + W);
  const depth = db(at(0.5 * Ts) / at(Ts)), want = db(chromatic(r.D, Math.PI));
  assert.ok(Math.abs(depth - want) < 3, `${depth.toFixed(1)} dB at half a period; model ${want.toFixed(1)} dB`);
  assert.ok(at(Ts) > 0.8 * at(0.05 * Ts), 'back at full strength one period on');
});
test('pressure raises the RF voltage: the recoherence comes √(1+3) times as often', () => {
  const Pp = P({ ...QUIET, pickup: 'delta', phase: 0, chroma: 30 }), k = 60, T0 = 1 / ringOf(k, Pp).fsyn, T1 = T0 / Math.sqrt(1 + PRESS_GAIN);
  const pressed = note(k, Pp, T0 + 0.05, 0.8, [[0, (e) => e.handle({ type: 'pressure', value: 1, key: k })]])[0];
  const W = Math.round(0.004 * FS), at = (x, t) => rms(x, Math.round(t * FS) - W, Math.round(t * FS) + W);
  assert.ok(at(pressed, T1) > 5 * at(pressed, 0.5 * T1), 'recoheres at the faster period');
  const plain = note(k, Pp, T0 + 0.05)[0];
  assert.ok(at(plain, T1) < 0.2 * at(plain, T0), 'and without pressure, not then');
});
test('amplitude detuning: a bigger kick filaments faster, and it never comes back', () => {
  const Pp = P({ pickup: 'delta', phase: 0, chroma: 0, damping: 20, octupole: 4 }), k = 60, W = 2400;
  const loss = (kick) => { const [L] = note(k, { ...Pp, kick }, 1.2); return rms(L, 2400 + 48000, 2400 + 48000 + W) / rms(L, 2400, 2400 + W); };
  const small = loss(1), big = loss(4);
  assert.ok(big < 0.1 * small, `kept ${small.toFixed(4)} of a 1σ kick, ${big.toFixed(4)} of a 4σ kick after 1 s`);
  const r = ringOf(k, Pp), env = (t) => Model.centroid(r.frev * t, k, Pp, 4).env, model = env(1.075) / env(0.075);
  assert.ok(Math.abs(db(big / model)) < 1, `the 4σ kick keeps ${big.toFixed(4)}; model ${model.toFixed(4)}`);
});
test('the injection phase error is a vibrato at the synchrotron frequency, damped in τx/2', () => {
  const Pp = P({ kick: 0, pickup: 'single', phase: 3, bunch: 0.03, damping: 0.6 }), k = 60, f = keyFreq(k), r = ringOf(k, Pp);
  const [L] = note(k, Pp, 2.2);
  const peakAt = (t0) => { // the pitch of harmonic 3 in a short window: cents off at the swing's ends
    let best = 0, bc = 0; const a = Math.round(t0 * FS), b = a + 1024;
    for (let c = -30; c <= 30; c += 1) { const v = tone(L, 3 * f * 2 ** (c / 1200), a, b); if (v > best) { best = v; bc = c; } }
    return bc;
  };
  const swing = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => peakAt(0.1 + (i * 0.125) / r.fsyn));
  assert.ok(Math.max(...swing) - Math.min(...swing) >= 2, `early swing ${swing.join(' ')} cents`);
  const late = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => peakAt(1.9 + (i * 0.04) / r.fsyn * 3));
  assert.ok(Math.max(...late) - Math.min(...late) < Math.max(...swing) - Math.min(...swing), `damped: late swing ${late.join(' ')} cents`);
});
test('a longer bunch is a softer note: the spectral centroid falls', () => {
  const k = 60, f = keyFreq(k), a = 4800, b = 4800 + 16384;
  const centroidOf = (bunch) => { const [L] = note(k, P({ kick: 0, phase: 0, pickup: 'single', bunch }), 0.5); let s = 0, w = 0; for (let n = 1; n * f < 15000; n++) { const v = tone(L, n * f, a, b); s += n * v; w += v; } return s / w; };
  const short = centroidOf(0.01), long = centroidOf(0.06);
  assert.ok(short > 2.5 * long, `centroid harmonic ${short.toFixed(1)} (1 %) vs ${long.toFixed(1)} (6 %)`);
});
test('letting go closes the scrapers; the pedal keeps the beam stored', () => {
  const Pp = P(), k = 60, off = [[0.3, (e) => e.noteOff(k)]];
  const [L] = note(k, Pp, 1.5, 0.8, off);
  assert.ok(rms(L, 1.2 * FS, 1.5 * FS) < 1e-4 * rms(L, 0.1 * FS, 0.3 * FS), 'gone after release');
  const [S] = note(k, Pp, 1.2, 0.8, [[0, (e) => e.setSustain(true)], ...off]);
  assert.ok(rms(S, 0.9 * FS, 1.2 * FS) > 0.5 * rms(S, 0.1 * FS, 0.3 * FS), 'still stored with the pedal down');
  const e = new StorageRingEngine(FS); e.setParams(Pp); e.noteOn(k, 0.8); e.noteOff(k);
  const bl = new Float32Array(128), br = new Float32Array(128);
  for (let i = 0; i < 375; i++) e.process(bl, br, 128);
  assert.equal(e.voiceCount(), 0, 'and the voice is freed');
});
test('velocity is the bunch charge: twice the charge, twice the signal', () => {
  const Pp = P({ pickup: 'single' }), a = 4800, b = 4800 + 9600;
  const r = rms(note(60, Pp, 0.4, 0.8)[0], a, b) / rms(note(60, Pp, 0.4, 0.4)[0], a, b);
  assert.ok(Math.abs(r - 2) < 0.01, `${r}`);
});
test('output level is sane in every preset (peak 0.02 – 1.2, no NaN)', () => {
  for (const pr of PRESETS) {
    let pk = 0;
    for (const k of [21, 36, 60, 96, 108]) for (const x of note(k, P(pr.p), 0.4, 1)) for (const v of x) { assert.ok(Number.isFinite(v), `${pr.name}: NaN`); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk > 0.02 && pk < 1.2, `${pr.name}: peak ${pk}`);
  }
});
test('the difference signal is in units of the kick: as loud whatever the kick and beam size, near the other pickups, and under the limiter', () => {
  const peak = (o) => { let pk = 0; for (const x of note(60, P(o), 0.3, 1)) for (const v of x) pk = Math.max(pk, Math.abs(v)); return pk; };
  const d = peak({ pickup: 'delta' }), pair = peak({});
  for (const o of [{ kick: 1.5 }, { kick: 6 }, { size: 0.02 }, { size: 0.25 }]) assert.ok(Math.abs(db(peak({ pickup: 'delta', ...o }) / d)) < 1, `${JSON.stringify(o)}: ${db(peak({ pickup: 'delta', ...o }) / d).toFixed(1)} dB`);
  assert.ok(db(d / pair) > 0 && db(d / pair) < 8, `difference ${db(d / pair).toFixed(1)} dB against two buttons`);
  assert.ok(d * DEFAULTS.volume < 0.71, `peak ${d}: into the limiter (−3 dB)`);
});
test('CPU: ten rings render far faster than real time', () => {
  const e = new StorageRingEngine(FS); e.setParams(P({ bunch: 0.15 }));
  for (let k = 40; k < 90; k += 5) e.noteOn(k, 0.8);
  const L = new Float32Array(128), R = new Float32Array(128), t0 = performance.now();
  for (let i = 0; i < 375 * 2; i++) e.process(L, R, 128);
  const ms = performance.now() - t0;
  assert.ok(ms < 400, `${ms.toFixed(0)} ms for 2 s of audio`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
