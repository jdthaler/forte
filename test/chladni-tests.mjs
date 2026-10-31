// Chladni Plate checks. Run: node test/chladni-tests.mjs
//
// The plate's modes against Leissa's free square plate and the square's symmetry, the clamp and
// the scaling of each key's plate against the closed forms of Kirchhoff's plate, the speaking
// threshold of linear stability against the engine's stick and slip, then the engine: every
// figure and every key on its note, the fingers and the bow choosing the mode, harmonics, the
// release, level, expression and Quality. Model and engine are the C++
// (native/instruments/chladni), built as WebAssembly.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS } from '../chladni/src/chladni-instrument.js';
import { FIGURES } from '../chladni/src/chladni-params.js';
import { wasmModel } from '../chladni/src/chladni-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';

const ChladniEngine = await loadEngine(INSTRUMENT);
const phys = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);

// One note through the engine, 128-sample blocks like the AudioWorklet: held for `hold` seconds
// (the whole render unless given), at a Quality.
function render(key, params, { vel = 0.6, sec = 1.5, hold = sec, quality, sustain = false, each } = {}) {
  const e = new ChladniEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  if (sustain) e.setSustain(true);
  e.noteOn(key, vel);
  const n = Math.round(sec * FS), L = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  for (let s = 0; s < n; s += bl) {
    if (s <= hold * FS && s + bl > hold * FS) e.noteOff(key);
    each?.(e, s);
    e.process(bL, bR, bl);
    L.set(bL.subarray(0, Math.min(bl, n - s)), s);
  }
  return { x: L, e };
}
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel), in the signal's units.
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return (4 * Math.hypot(re, im)) / (b - a);
}
// The strongest frequency over the last half second, searched from 0.15 to 14 × f0 in 0.6 % steps,
// then refined (golden section).
function dominant(x, f0) {
  const b = x.length, a = b - FS / 2;
  let best = 0, fb = f0;
  for (let r = 0.15; r < 14; r *= 1.006) { const m = tone(x, f0 * r, a, b); if (m > best) { best = m; fb = f0 * r; } }
  let lo = fb / 1.006, hi = fb * 1.006;
  for (let i = 0; i < 30; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };

console.log('the plate');
// A. W. Leissa, The free vibration of rectangular plates, J. Sound Vib. 31 (1973) 257–293
// (doi:10.1016/S0022-460X(73)80371-2): the completely free square plate at ν = 0.3,
// λ = ω a² √(ρh/D) for its lowest modes (a pair where two are listed).
test('free square plate (ν = 0.3) matches Leissa (1973): λ = 13.469, 19.596, 24.270, 34.801 ×2, 61.093 ×2, 63.687 (within 0.05 %)', () => {
  const pl = phys.solve(0.3, false);
  const want = [13.4689, 19.5961, 24.2702, 34.8010, 34.8010, 61.0932, 61.0932, 63.6870];
  want.forEach((l, n) => {
    const got = 4 * pl.lambda(n); // Λ is on the half side: λ = 4Λ
    assert.ok(Math.abs(got / l - 1) < 5e-4, `mode ${n + 1}: λ ${got.toFixed(4)}, Leissa ${l}`);
  });
});
test('the square\'s symmetry: modes odd across one centre line and even across the other come in equal pairs (to 1e-9)', () => {
  for (const clamped of [false, true]) {
    const pl = phys.solve(0.34, clamped);
    const odd = (b) => Array.from({ length: pl.count }, (_, n) => n).filter((n) => pl.block(n) === b).map((n) => pl.lambda(n));
    const a = odd(1), b = odd(2);
    for (let i = 0; i < Math.min(a.length, b.length, 12); i++) assert.ok(Math.abs(a[i] / b[i] - 1) < 1e-9, `${clamped ? 'clamped' : 'free'} pair ${i}: ${a[i]} vs ${b[i]}`);
  }
});
test('modes are orthonormal: ∫∫ φm φn dA = 4 δmn over the plate (side 2)', () => {
  const id = 1, N = 160, h = 2 / N;
  for (const [m, n] of [[0, 0], [3, 3], [4, 4], [12, 12], [0, 1], [2, 4], [4, 7], [3, 10]]) {
    let s = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = -1 + (i + 0.5) * h, y = -1 + (j + 0.5) * h; s += phys.shape(id, m, x, y) * phys.shape(id, n, x, y) * h * h; }
    assert.ok(Math.abs(s - (m === n ? 4 : 0)) < 0.02, `<${m}|${n}> = ${s.toFixed(4)}`);
  }
});
test('the clamp\'s leather holds the plate nearly still over its disc (under 8 % of each figure\'s peak), and a soft clamp leaves the free plate', () => {
  const id = 1, R = 2 * phys.CLAMP;
  for (let f = 0; f < FIGURES.length; f++) {
    const n = phys.spots(id, f).mode;
    let peak = 0, inside = 0;
    for (let j = 0; j <= 40; j++) for (let i = 0; i <= 40; i++) peak = Math.max(peak, Math.abs(phys.shape(id, n, -1 + i / 20, -1 + j / 20)));
    for (let k = 0; k < 64; k++) { const r = (R * (k % 8)) / 8, t = (2 * Math.PI * k) / 64; inside = Math.max(inside, Math.abs(phys.shape(id, n, r * Math.cos(t), r * Math.sin(t)))); }
    assert.ok(inside < 0.08 * peak, `${FIGURES[f]}: ${(inside / peak * 100).toFixed(1)} % of its peak over the clamp`);
  }
  const soft = phys.solve(0.3, true, 1e-6), free = phys.solve(0.3, false);
  // the soft clamp's plate also has the rigid motions on its pads, just above zero: skip them
  const s = Array.from({ length: soft.count }, (_, n) => soft.lambda(n)).filter((l) => l > 1);
  for (let n = 0; n < 5; n++) assert.ok(Math.abs(s[n] / free.lambda(n) - 1) < 1e-4, `mode ${n + 1}: ${s[n]} vs ${free.lambda(n)}`);
});
test('a stiffer clamp raises every mode that moves the centre, and leaves the doubly odd ones (still at the centre) nearly alone', () => {
  const a = phys.solve(0.34, true, 2e4), b = phys.solve(0.34, true, 2e5);
  const by = (pl, blk) => Array.from({ length: pl.count }, (_, n) => n).filter((n) => pl.block(n) === blk).map((n) => pl.lambda(n));
  for (const blk of [0, 1]) by(a, blk).slice(0, 4).forEach((l, i) => assert.ok(by(b, blk)[i] >= l - 1e-9, `block ${blk} mode ${i}`));
  by(a, 3).slice(0, 2).forEach((l, i) => assert.ok(Math.abs(by(b, 3)[i] / l - 1) < 0.02, `doubly odd mode ${i}: ${l} → ${by(b, 3)[i]}`));
});
test('each key\'s plate is cut to its note: ω = Λ c / (a/2)², c = h √(E / 12ρ(1−ν²)) (brass, 1.5 mm, the diagonals at A4 ≈ 10.5 cm)', () => {
  const brass = { E: 100e9, rho: 8500, nu: 0.34 }, glass = { E: 70e9, rho: 2500, nu: 0.22 };
  for (const [mat, M, h] of [[0, brass, 1.5], [1, glass, 3]]) {
    for (const [key, fig] of [[69, 2], [33, 1], [96, 8]]) {
      const Q = P({ material: mat, thickness: h, figure: fig }), kp = phys.keyPlate(key, Q), id = phys.plateId(Q);
      const L = phys.modes(id)[kp.target].lambda, c = (h / 1000) * Math.sqrt(M.E / (12 * M.rho * (1 - M.nu ** 2)));
      const f = (L * c) / ((kp.side / 2) ** 2 * 2 * Math.PI);
      assert.ok(Math.abs(cents(f, keyFreq(key))) < 1e-6, `${key}: ${f} Hz`);
      assert.ok(Math.abs(kp.mass / (M.rho * (h / 1000) * kp.side ** 2) - 1) < 1e-12, 'mass');
      assert.ok(Math.abs(cents(kp.f[kp.target], keyFreq(key))) < 1e-6, 'the figure\'s mode is the note');
    }
  }
  const a4 = phys.keyPlate(69, P());
  assert.ok(Math.abs(a4.side - 0.1048) < 0.001, `${a4.side}`);
});

console.log('the bow');
// Linear stability: from rest the bow's friction feeds the figure's mode a negative damping
// N |μ′(V)| φb² / 2m, which must outrun its loss σ. The engine integrates stick and slip.
test('the figure speaks above the threshold of linear stability and not below it (0.7 × stays silent, 1.6 × grows)', () => {
  for (const key of [57, 69, 81]) {
    const quiet = render(key, P({ force: 0.7 }), { sec: 3 }).x, sings = render(key, P({ force: 1.6 }), { sec: 3 }).x;
    const q = rms(quiet, quiet.length - FS / 2), s = rms(sings, sings.length - FS / 2);
    assert.ok(q < 2e-4, `key ${key} at 0.7 ×: rms ${q}`);
    assert.ok(s > 30 * q && s > 2e-3, `key ${key} at 1.6 ×: rms ${s}`);
  }
});
// The bow pulls a note a few cents off its plate's own pitch (BOW_PULL ¢ at most at the defaults), as a
// bow pulls a string: its friction acts on the plate as a load while the hair sticks.
const BOW_PULL = 6;
test(`every figure speaks on its note at A4 (the bow and the fingers where it wants them; within ${BOW_PULL} ¢)`, () => {
  for (let f = 0; f < FIGURES.length; f++) {
    const x = render(69, P({ figure: f })).x, d = dominant(x, 440);
    assert.ok(Math.abs(cents(d, 440)) < BOW_PULL, `${FIGURES[f]}: ${d.toFixed(2)} Hz`);
  }
});
test('every key, A0 to C8, speaks on its note at the defaults (within 3 ¢)', () => {
  for (let key = 21; key <= 108; key += 7) {
    const f0 = keyFreq(key), x = render(key, P(), { sec: key < 40 ? 2.5 : 1.5 }).x, d = dominant(x, f0);
    assert.ok(Math.abs(cents(d, f0)) < 3, `key ${key}: ${d.toFixed(2)} Hz for ${f0.toFixed(2)}`);
  }
});
test('the keyboard\'s tuning: at A = 415 Hz the plates are cut to it and sound there (the bow\'s pull aside, within 0.5 ¢)', () => {
  const d = dominant(render(69, P({ pitch: 415 })).x, 415), d0 = dominant(render(69, P()).x, 440);
  assert.ok(Math.abs(cents(d, 415) - cents(d0, 440)) < 0.5, `${d} at 415, ${d0} at 440`);
});
test('stick and slip make true harmonics of the figure (2 f and 3 f within 0.5 ¢), not the plate\'s overtones', () => {
  const x = render(69, P({ figure: 4 })).x, b = x.length, a = b - FS / 2, f = dominant(x, 440);
  for (const k of [2, 3]) {
    let lo = f * k * 0.995, hi = f * k * 1.005;
    for (let i = 0; i < 40; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
    assert.ok(Math.abs(cents((lo + hi) / 2, f * k)) < 0.5, `${k} f: ${((lo + hi) / 2).toFixed(2)} for ${f.toFixed(2)}`);
    assert.ok(tone(x, f * k, a, b) > 1e-3 * tone(x, f, a, b), `${k} f is there`);
  }
});
test('lift the fingers and a rival mode of the plate takes the bow (the diagonals give way to a lower mode)', () => {
  const id = 1, lam = phys.modes(id).map((m) => m.lambda), t = phys.spots(id, 2).mode;
  const x = render(69, P({ finger: false })).x, d = dominant(x, 440);
  assert.ok(Math.abs(cents(d, 440)) > 50, `still the diagonals: ${d}`);
  const ratio = d / 440, nearest = Math.min(...lam.map((l) => Math.abs(cents(ratio, l / lam[t]))));
  assert.ok(nearest < 3, `${d.toFixed(1)} Hz is a mode of the plate (${nearest.toFixed(2)} ¢ from one)`);
});
test('the bow shifted along the edge makes another mode of the plate speak', () => {
  const id = 1, lam = phys.modes(id).map((m) => m.lambda), t = phys.spots(id, 2).mode;
  const x = render(69, P({ shift: 0.7 })).x, d = dominant(x, 440), ratio = d / 440;
  assert.ok(Math.abs(cents(d, 440)) > 50, `still the diagonals: ${d}`);
  assert.ok(Math.min(...lam.map((l) => Math.abs(cents(ratio, l / lam[t])))) < 3, `${d.toFixed(1)} Hz is a mode of the plate`);
});
test('a firmer key speaks sooner', () => {
  const t = (vel) => { const x = render(69, P(), { vel, sec: 1.5 }).x, end = rms(x, x.length - 4800); for (let i = 0; i + 960 < x.length; i += 960) if (rms(x, i, i + 960) > 0.5 * end) return i / FS; return 9; };
  const soft = t(0.3), firm = t(1);
  assert.ok(firm < soft && firm < 0.5, `firm ${firm.toFixed(2)} s, soft ${soft.toFixed(2)} s`);
});
test('aftertouch presses the bow harder, and an MPE slide moves one note\'s bow along its edge', () => {
  const { e } = render(69, P(), { sec: 0.2 });
  const n0 = e.voices[0].N;
  e.handle({ type: 'pressure', value: 1, key: 69 });
  const bl = new Float32Array(128);
  for (let i = 0; i < 40; i++) e.process(bl, bl, 128);
  assert.ok(e.voices[0].N > 1.8 * n0, `N ${n0} → ${e.voices[0].N}`);
  const s0 = e.voices[0].s;
  e.handle({ type: 'slide', value: 1, key: 69 });
  for (let i = 0; i < 80; i++) e.process(bl, bl, 128);
  const want = phys.pathShift(s0, 1); // a bow pushed past the corner comes back along the other edge
  assert.ok(Math.abs(e.voices[0].s - want) < 0.02 && Math.abs(want - s0) > 0.4, `bow ${s0} → ${e.voices[0].s} (${want})`);
});

console.log('the release');
test('let go, a hand stops the plate (silent within 3 × Hand on release); with the pedal it rings on in the Ring time (T60 within 10 %)', () => {
  const hand = render(69, P({ hand: 0.3 }), { sec: 2.6, hold: 1.5 }).x;
  assert.ok(rms(hand, Math.round(2.4 * FS)) < 1e-4, `${rms(hand, Math.round(2.4 * FS))}`);
  const ring = 1.2, x = render(69, P({ ring }), { sec: 3, hold: 1.5, sustain: true }).x;
  const a = Math.round(1.7 * FS), W = 8192, db = 20 * Math.log10(tone(x, 440, a + FS / 2, a + FS / 2 + W) / tone(x, 440, a, a + W));
  const t60 = (-60 / db) * 0.5;
  assert.ok(Math.abs(t60 / ring - 1) < 0.1, `T60 ${t60.toFixed(2)} s`);
});
test('output is sane: no NaN, peak 0.02 – 1 at the defaults, silent before the bow and after the hand', () => {
  let pk = 0;
  for (const key of [21, 45, 69, 93, 108]) for (const f of [2, 5]) {
    const x = render(key, P({ figure: f }), { vel: 1, sec: key < 40 ? 3 : 2, hold: key < 40 ? 2.5 : 1.5 }).x;
    for (const v of x) { assert.ok(Number.isFinite(v)); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(rms(x, x.length - 2400) < 1e-3, `key ${key} still sounds after the hand`);
  }
  assert.ok(pk > 0.02 && pk < 1, `peak ${pk}`);
});

console.log('Quality');
test('Quality: Medium plays 24 modes a plate and Low 12 (more when the figure is higher), at most 24 and 12 plates; the note keeps its pitch', () => {
  const high = dominant(render(69, P()).x, 440);
  for (const [quality, M, cap] of [['high', 64, 88], ['medium', 24, 24], ['low', 12, 12]]) {
    const { x, e } = render(69, P(), { quality });
    assert.equal(e.voices[0].M, Math.min(M, phys.keyPlate(69, P()).count), quality);
    assert.ok(Math.abs(cents(dominant(x, 440), high)) < 1, `${quality}: pitch ${dominant(x, 440)} for ${high} at High`);
    const f = render(69, P({ figure: 9 }), { quality, sec: 0.1 }).e.voices[0];
    assert.ok(f.M > f.target + 4, `${quality}: the figure's mode is played (${f.M} modes, figure's ${f.target})`);
    const e2 = new ChladniEngine(FS), bl = new Float32Array(128);
    e2.setQuality(quality); e2.setParams(P()); e2.setSustain(true);
    for (let k = 21; k <= 108; k++) { e2.noteOn(k, 0.6); e2.noteOff(k); e2.process(bl, bl, 128); }
    assert.ok(e2.voiceCount() <= cap, `${quality}: ${e2.voiceCount()} plates`);
  }
});
test('CPU: ten bowed plates run well under real time (under 30 % of a core)', () => {
  const e = new ChladniEngine(FS), bl = new Float32Array(128), br = new Float32Array(128);
  e.setParams(P());
  for (const k of [48, 52, 55, 60, 64, 67, 72, 76, 79, 84]) e.noteOn(k, 0.7);
  for (let i = 0; i < 50; i++) e.process(bl, br, 128);
  const t = performance.now();
  for (let i = 0; i < 375; i++) e.process(bl, br, 128);
  const load = (performance.now() - t) / 1000;
  assert.ok(load < 0.3, `${(load * 100).toFixed(0)} % of real time`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
