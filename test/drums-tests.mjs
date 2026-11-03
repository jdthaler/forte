// Timpani and Tabla checks. Run: node test/drums-tests.mjs
//
// The physics against the literature (Bessel zeros, Ramakrishna and Sondhi's composite head as
// Sathej and Adhikari computed it, Raman's measured dayan, Rayleigh's fifth and octave on the
// timpani, the plane-wave limit of air loading), then the engine against the model. Both are the
// C++ (native/instruments/drums), built as WebAssembly.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS } from '../drums/src/drums-instrument.js';
import { wasmModel } from '../drums/src/drums-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';

const DrumEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const find = (k, m, n) => k.modes.find((x) => x.m === m && x.n === n);

// Render through the engine in 128-sample blocks, as the AudioWorklet does. events: [{ at, fn(e) }].
function render(params, sec, events, { quality, fs = FS } = {}) {
  const e = new DrumEngine(fs);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  const n = Math.round(sec * fs), L = new Float32Array(n), R = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = [...events].sort((a, b) => a.at - b.at);
  let next = 0;
  for (let s = 0; s < n; s += bl) {
    while (next < ev.length && ev[next].at * fs <= s) ev[next++].fn(e);
    e.process(bL, bR, bl);
    L.set(bL.subarray(0, Math.min(bl, n - s)), s); R.set(bR.subarray(0, Math.min(bl, n - s)), s);
  }
  return { L, R, e };
}
const hit = (key, vel = 0.7, at = 0) => ({ at, fn: (e) => e.noteOn(key, vel) });
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// The strongest frequency within ±c ¢ of f0 in x[a, b) (golden-section search on tone).
function peak(x, f0, a, b, c = 30) {
  let lo = f0 * 2 ** (-c / 1200), hi = f0 * 2 ** (c / 1200);
  for (let i = 0; i < 50; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };

console.log('physics');
test('Bessel zeros: j01, j11, j21, j02, j94 to 1e-7', () => {
  for (const [m, i, j] of [[0, 1, 2.404825558], [1, 1, 3.831705970], [2, 1, 5.135622302], [0, 2, 5.520078110], [9, 4, 24.23388526]]) assert.ok(Math.abs(M.besselZero(m, i) - j) < 1e-7, `j${m}${i} = ${M.besselZero(m, i)}`);
});
test('in a vacuum a bare head plays the Bessel ratios exactly', () => {
  const k = M.keyDrum(50, P({ air: 0 }));
  for (const md of k.modes) {
    const want = M.besselZero(md.m, md.n) / M.besselZero(1, 1);
    assert.ok(Math.abs(md.f / k.f0 / want - 1) < 1e-6, `(${md.m},${md.n}) ${md.f / k.f0} vs ${want}`);
    assert.ok(Math.abs(md.sigmaAir) < 1e-12, 'no air, no radiation');
  }
});
test('a composite head matches Sathej and Adhikari’s modes for it (density 3.125², radius 0.4)', () => {
  // their Table I, composite column, over half the (1,1): within 0.2 % below and 0.6 % above (their
  // values are numerical too, and the Ritz solve here is an upper bound on the exact head's)
  const want = [[0, 1, 1.0309], [2, 1, 3.0412], [0, 2, 3.1546], [3, 1, 4.0928], [1, 2, 4.2268], [0, 3, 4.9794], [4, 1, 5.1134], [2, 2, 5.3093]];
  const k = M.composite(3.125 ** 2, 0.4, 0.07, 2000, P({ air: 0 })), f11 = find(k, 1, 1).f;
  for (const [m, n, r] of want) {
    const got = (2 * find(k, m, n).f) / f11;
    assert.ok(got / r - 1 > -2e-3 && got / r - 1 < 6e-3, `(${m},${n}) ${got.toFixed(4)} vs ${r}`);
  }
});
test('the dayan’s syahi puts nine modes within 45 ¢ of Raman’s measured harmonics (20 ¢ rms)', () => {
  // Raman's measurements over half the (1,1), as Sathej and Adhikari tabulate them
  const want = [[0, 1, 1.03], [2, 1, 3], [0, 2, 3], [3, 1, 4], [1, 2, 4], [0, 3, 5.04], [4, 1, 5.03], [2, 2, 5.08]];
  const k = M.keyDrum(61, P({ drum: 1 })), f11 = find(k, 1, 1).f;
  let ss = 0;
  for (const [m, n, r] of want) {
    const c = cents((2 * find(k, m, n).f) / f11, r);
    ss += c * c;
    assert.ok(Math.abs(c) < 45, `(${m},${n}) ${c.toFixed(0)} ¢`);
  }
  assert.ok(Math.sqrt(ss / 9) < 20, `rms ${Math.sqrt(ss / 9).toFixed(1)} ¢`);
});
test('without its syahi the dayan is inharmonic (its (0,1) over 600 ¢ off half the (1,1))', () => {
  const k = M.keyDrum(61, P({ drum: 1, syahi: 0 }));
  assert.ok(Math.abs(cents((2 * find(k, 0, 1).f) / find(k, 1, 1).f, 1)) > 600);
});
test('timpani: the air puts the overtones near a fifth and an octave (Rayleigh), from 1.34 and 1.67', () => {
  for (const head of [1, 2]) {
    const k = M.keyDrum(50, P({ head })), r = (m) => find(k, m, 1).f / k.f0;
    assert.ok(r(2) > 1.47 && r(2) < 1.57, `(2,1) ${r(2)}`);
    assert.ok(r(3) > 1.94 && r(3) < 2.08, `(3,1) ${r(3)}`);
    assert.ok(r(4) > 2.38 && r(4) < 2.58, `(4,1) ${r(4)}`);
  }
});
test('the kettle’s air is a spring for the (0,1) mode: it rises above the open head’s', () => {
  const kettle = find(M.keyDrum(50, P()), 0, 1).f, open = find(M.keyDrum(50, P({ under: 1 })), 0, 1).f;
  assert.ok(kettle > 1.8 * open, `${kettle} vs ${open}`);
});
test('air loading in its plane-wave limit: a fine mode, open both sides, is lowered by √(1 + 2ρ/σk)', () => {
  // the (9,1) mode is far subsonic (k a = 13.4, k₀a < 1): the air on each side rides along to a depth 1/k
  const T = 3000, a = 0.33, vac = find(M.drumAt(0, a, T, P({ air: 0 })), 9, 1).f, air = find(M.drumAt(0, a, T, P({ under: 1 })), 9, 1).f;
  const k = M.besselZero(9, 1) / a, want = 1 / Math.sqrt(1 + (2 * 1.2) / (0.262 * k));
  assert.ok(Math.abs(air / vac / want - 1) < 0.03, `${air / vac} vs ${want}`);
});
test('radiation: the round (0,1) mode loses its energy to sound tenfold faster than the (1,1)', () => {
  const k = M.keyDrum(50, P());
  assert.ok(find(k, 0, 1).sigmaAir > 10 * find(k, 1, 1).sigmaAir);
  assert.ok(find(k, 0, 1).sigmaAir > 0.9 * find(k, 0, 1).sigma, 'the (0,1) mode is the air’s');
});

console.log('tuning');
test('every key’s principal sounds its note, on every drum', () => {
  for (const drum of [0, 1, 2]) for (let key = 21; key <= 108; key += 7) {
    const k = M.keyDrum(key, P({ drum }));
    assert.ok(Math.abs(cents(k.f0, keyFreq(key))) < 0.01, `drum ${drum} key ${key}: ${k.f0}`);
  }
});
test('the engine sounds the timpani’s (1,1) and (2,1) where the model has them', () => {
  const k = M.keyDrum(45, P()), { L } = render(P(), 1.5, [hit(45)]);
  for (const md of [find(k, 1, 1), find(k, 2, 1)]) {
    const f = peak(L, md.f, 4800, 4800 + 32768);
    assert.ok(Math.abs(cents(f, md.f)) < 3, `(${md.m},${md.n}) ${f} vs ${md.f}`);
  }
});

console.log('strokes');
test('struck at the centre, the timpani’s (1,1) is gone (a node), the (0,1) remains', () => {
  const k = M.keyDrum(50, P()), f11 = find(k, 1, 1).f, f01 = find(k, 0, 1).f;
  const edge = render(P(), 0.6, [hit(50)]).L, centre = render(P({ strike: 0 }), 0.6, [hit(50)]).L;
  assert.ok(tone(centre, f11, 0, 24000) < 0.02 * tone(edge, f11, 0, 24000), 'the principal vanishes');
  assert.ok(tone(centre, f01, 0, 4800) > 0.5 * tone(edge, f01, 0, 4800), 'the thud stays');
});
test('Na: a finger on the syahi’s edge kills the fundamental and spares the second harmonic', () => {
  const k = M.keyDrum(61, P({ drum: 1 })), f1 = find(k, 0, 1).f, f2 = find(k, 1, 1).f;
  const open = render(P({ drum: 1, strike: 0.92 }), 0.8, [hit(61)]).L, na = render(P({ drum: 1, strike: 0.92, rest: true, restAt: 0.5 }), 0.8, [hit(61)]).L;
  const a = 0.15 * FS, b = 0.65 * FS;
  assert.ok(tone(na, f1, a, b) < 0.1 * tone(open, f1, a, b), `fundamental ${tone(na, f1, a, b) / tone(open, f1, a, b)}`);
  assert.ok(tone(na, f2, a, b) > 0.3 * tone(open, f2, a, b), `harmonic ${tone(na, f2, a, b) / tone(open, f2, a, b)}`);
});
test('a closed stroke (the hand stays) is a dry slap: 30 dB down after 0.2 s', () => {
  const open = render(P({ drum: 1 }), 0.4, [hit(61)]).L, te = render(P({ drum: 1, stays: true }), 0.4, [hit(61)]).L;
  assert.ok(rms(te, 0.25 * FS, 0.4 * FS) < 0.03 * rms(open, 0.25 * FS, 0.4 * FS));
});
test('a soft felt mallet is darker than wood: less above 1.5 kHz for the same note', () => {
  const hi = (x) => { let s = 0; for (let f = 1500; f < 6000; f += 50) s += tone(x, f, 0, 4800) ** 2; return s; };
  const lo = (x) => tone(x, M.keyDrum(50, P()).f0, 0, 4800) ** 2;
  const soft = render(P({ beater: 1 }), 0.2, [hit(50)]).L, wood = render(P({ beater: 3 }), 0.2, [hit(50)]).L;
  assert.ok(hi(soft) / lo(soft) < 0.1 * (hi(wood) / lo(wood)));
});

console.log('tension');
test('the pedal: full pitch bend moves the principal by the pedal’s range', () => {
  const k = M.keyDrum(45, P()), f = find(k, 1, 1).f;
  const { L } = render(P({ pedal: 2 }), 1.2, [{ at: 0, fn: (e) => e.handle({ type: 'bend', value: 1 }) }, hit(45, 0.5, 0.05)]);
  const got = peak(L, f * 2 ** (2 / 12), 0.2 * FS, 0.2 * FS + 32768);
  assert.ok(Math.abs(cents(got, f) - 200) < 3, `${cents(got, f)} ¢`);
});
test('the heel: pressing in raises every mode by √(1 + E·h·δ²/2a²T)', () => {
  const k = M.keyDrum(48, P({ drum: 2 })), f = find(k, 0, 1).f, d = 0.01;
  const want = Math.sqrt(1 + (k.Eh * d * d) / (2 * k.a * k.a * k.T));
  const { L } = render(P({ drum: 2, push: 10 }), 1.2, [{ at: 0, fn: (e) => e.handle({ type: 'pressure', value: 1 }) }, hit(48, 0.3, 0.1)]);
  const got = peak(L, f * want, 0.3 * FS, 0.3 * FS + 32768, 40);
  assert.ok(Math.abs(cents(got, f * want)) < 4, `${cents(got, f)} ¢ vs ${cents(want, 1)} ¢`);
  assert.ok(cents(want, 1) > 150, 'a loose bayan bends by more than a semitone');
});
test('a hard stroke starts sharp and glides down as the head’s stretch relaxes', () => {
  const k = M.keyDrum(43, P({ drum: 2 })), f = find(k, 0, 1).f;
  const { L } = render(P({ drum: 2, beater: 3, push: 0 }), 1.2, [hit(43, 1)]);
  const early = peak(L, f, 0, 8192, 60), late = peak(L, f, 0.6 * FS, 0.6 * FS + 16384, 60);
  assert.ok(cents(early, late) > 0.5, `${cents(early, late).toFixed(2)} ¢`);
  assert.ok(Math.abs(cents(late, f)) < 3, `settles on the model's pitch: ${cents(late, f)} ¢`);
});

console.log('engine');
test('a forte note peaks between 0.05 and 1, with no NaN, and the drum stops once it has died', () => {
  for (const [drum, key] of [[0, 21], [0, 50], [0, 108], [1, 61], [2, 48]]) {
    const { L, e } = render(P({ drum }), 8, [hit(key, 1)]);
    let pk = 0;
    for (const v of L) { assert.ok(Number.isFinite(v)); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk > 0.05 && pk < 1, `drum ${drum} key ${key}: ${pk}`);
    if (key > 30) assert.equal(e.voices.length, 0, `drum ${drum} key ${key} still sounds`);
  }
});
test('extreme settings at 44.1 kHz stay finite', () => {
  for (const o of [{ air: 3, depth: 0.25, size: 0.6, beater: 3 }, { air: 0, loss: 0.1, size: 1.6, head: 1 }, { drum: 1, syahi: 2, size: 0.6, beater: 3, push: 20 }, { drum: 2, under: 1, mic: 0, loss: 10 }]) {
    const { L } = render(P(o), 0.5, [hit(21, 1), hit(64, 1), hit(108, 1), { at: 0.1, fn: (e) => e.handle({ type: 'pressure', value: 1 }) }, { at: 0.2, fn: (e) => e.handle({ type: 'bend', value: -1 }) }], { fs: 44100 });
    for (const v of L) assert.ok(Number.isFinite(v) && Math.abs(v) < 4, JSON.stringify(o));
  }
});
test('striking a ringing drum again strikes the same head (one voice)', () => {
  const { e } = render(P(), 0.5, [hit(50), hit(50, 0.7, 0.2)]);
  assert.equal(e.voices.length, 1);
});
test('Let it ring off: releasing the key lays a hand on the head', () => {
  const ring = render(P(), 1, [hit(50), { at: 0.2, fn: (e) => e.noteOff(50) }]).L;
  const damp = render(P({ ring: false, hand: 0.1 }), 1, [hit(50), { at: 0.2, fn: (e) => e.noteOff(50) }]).L;
  assert.ok(rms(damp, 0.6 * FS, FS) < 0.01 * rms(ring, 0.6 * FS, FS));
});
test('a drum the page offers sounds the same as one the engine builds', () => {
  const a = render(P({ drum: 1 }), 0.3, [hit(61)]).L;
  const b = render(P({ drum: 1 }), 0.3, [{ at: 0, fn: (e) => e.noteOn(61, 0.7, M.noteData(61, P({ drum: 1 }))) }]).L;
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-6, `sample ${i}`);
});
test('Quality: Medium and Low play fewer modes and fewer drums, at the same pitch', () => {
  for (const [q, modes, max] of [['high', 40, 32], ['medium', 26, 16], ['low', 14, 8]]) {
    const ev = Array.from({ length: 40 }, (_, i) => hit(40 + i, 0.5, i * 0.005));
    const { e } = render(P(), 0.4, ev, { quality: q });
    assert.ok(e.voices.length <= max + 1, `${q}: ${e.voices.length}`);
    assert.equal(e.voices[0].modes, modes);
  }
  const f = M.keyDrum(45, P()).f0, x = render(P(), 1, [hit(45)], { quality: 'low' }).L;
  assert.ok(Math.abs(cents(peak(x, f, 4800, 4800 + 32768), f)) < 3);
});
test('CPU: ten drums render at least 8× faster than real time', () => {
  const e = new DrumEngine(FS);
  e.setParams(P());
  for (let i = 0; i < 10; i++) e.noteOn(40 + 2 * i, 0.8, M.noteData(40 + 2 * i, P()));
  const bL = new Float32Array(128), bR = new Float32Array(128), t0 = performance.now(), sec = 2;
  for (let s = 0; s < sec * FS; s += 128) e.process(bL, bR, 128);
  const t = (performance.now() - t0) / 1000;
  assert.ok(t < sec / 8, `${(sec / t).toFixed(1)}× real time`);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
