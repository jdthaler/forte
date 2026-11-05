// Marimba and Xylophone checks: the bars against beam theory and their tuning, the tubes against
// the stopped pipe, then the engine against the model (pitch, partials, decay, the tubes, the
// mallet, the roll), level, Quality and CPU.
// Run: node test/marimba-tests.mjs
//
// Both are the C++ (native/instruments/marimba), built as WebAssembly: the model's functions
// through marimba-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, COMPASS, TARGETS, KEY_MIN, KEY_MAX } from '../marimba/src/marimba-instrument.js';
import { wasmModel } from '../marimba/src/marimba-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';

const MarimbaEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const C_AIR = 343.2;

// Render through the engine, 128-sample blocks like the AudioWorklet. events: [t, fn(e)].
function run(params, sec, events = [], quality, data) {
  const e = new MarimbaEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float64Array(n), ch = [new Float64Array(n), new Float64Array(n)], bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, f]) => [Math.round(t * FS), f]).sort((a, b) => a[0] - b[0]);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j][0] <= s) ev[j++][1](e);
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i] + bR[i]; ch[0][s + i] = bL[i]; ch[1][s + i] = bR[i]; }
  }
  // L: both channels summed, for the analyses; peak: the louder channel's
  let peak = 0;
  for (const c of ch) for (const v of c) peak = Math.max(peak, Math.abs(v));
  return { L, e, peak };
}
const note = (key, params, vel = 0.7, sec = 2, quality) => run(params, sec, [[0, (e) => e.noteOn(key, vel)]], quality).L;
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// The strongest frequency within ±40 ¢ of f0 in x[a, b) (golden-section search on tone).
function peak(x, f0, a, b) {
  let lo = f0 * 2 ** (-40 / 1200), hi = f0 * 2 ** (40 / 1200);
  for (let i = 0; i < 40; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const dB = (r) => 20 * Math.log10(r);

console.log('the bars');
test('a slender plain bar rings where Euler–Bernoulli says: f₁ = (β₁L)² h √(E/12ρ) / 2πL², and its overtones at 2.756 and 5.404 × f₁', () => {
  // the A0 marimba bar, plain: 2.4 m long and 24 mm thick, slender enough that shear hardly counts
  const B = M.barModel('marimba', KEY_MIN, 0), g = B.geom, E = 22e9, rho = 1025;
  const f1 = (4.730040745 ** 2 * g.h0 * Math.sqrt(E / (12 * rho))) / (2 * Math.PI * g.L ** 2);
  assert.ok(Math.abs(cents(B.modes[0].f, f1)) < 3, `f₁ ${B.modes[0].f.toFixed(3)} Hz against ${f1.toFixed(3)} Hz`);
  assert.ok(Math.abs(B.modes[1].ratio / 2.7565 - 1) < 0.01 && Math.abs(B.modes[2].ratio / 5.4039 - 1) < 0.02, `${B.modes[1].ratio}, ${B.modes[2].ratio}`);
});
test('wood is soft in shear: a short, thick plain bar falls further below the slender ratios than an aluminium one would', () => {
  // the C7 bar plain: h/L about 0.1; Timoshenko's correction to mode n grows as (n h/L)² (1 + E/κG), and E/κG is 15.6 for this rosewood, 3.2 for aluminium
  const B = M.barModel('marimba', 96, 0), hl = B.geom.h0 / B.geom.L;
  assert.ok(hl > 0.05, `h/L ${hl}`);
  assert.ok(B.modes[1].ratio < 2.6 && B.modes[2].ratio < 4.8, `${B.modes[1].ratio.toFixed(3)}, ${B.modes[2].ratio.toFixed(3)}`);
});
test('every bar of both kinds is tuned: the marimba’s at 1 : 4 : 10, the xylophone’s at 1 : 3, each on its key, to 0.01 ¢', () => {
  for (const kind of ['marimba', 'xylophone']) for (let k = KEY_MIN; k <= KEY_MAX; k += 1) {
    const B = M.barModel(kind, k);
    assert.ok(Math.abs(cents(B.modes[0].f, keyFreq(k))) < 0.01, `${kind} ${k}: f₁ ${cents(B.modes[0].f, keyFreq(k))} ¢`);
    TARGETS[kind].forEach((r, i) => { assert.ok(Math.abs(cents(B.modes[i].ratio, r)) < 0.01, `${kind} ${k}: mode ${i + 1} ${B.modes[i].ratio}`); });
  }
});
test('the xylophone’s third mode, left where its short cut puts it, lands near 6 × f₁ (two octaves and a fifth: 1 : 3 : 6)', () => {
  for (let k = COMPASS.xylophone[0]; k <= COMPASS.xylophone[1]; k += 4) {
    const r = M.barModel('xylophone', k).modes[2].ratio;
    assert.ok(r > 5.3 && r < 7, `${k}: ${r.toFixed(2)}`);
  }
});
test('the cut makes the marimba bar shorter than a plain bar on the same pitch, and the xylophone’s much less so', () => {
  for (const [kind, lo, hi] of [['marimba', 0.45, 0.8], ['xylophone', 0.75, 0.98]]) {
    const k = kind === 'marimba' ? 48 : 72, r = M.barModel(kind, k).geom.L / M.barModel(kind, k, 0).geom.L;
    assert.ok(r > lo && r < hi, `${kind}: ${r.toFixed(3)}`);
  }
});
test('the cords hang at mode 1’s nodes, about 22 % from each end', () => {
  for (const k of [36, 60, 96]) {
    const B = M.barModel('marimba', k);
    assert.equal(B.nodes.length, 2);
    for (const x of B.nodes) { const u = Math.min(x, B.geom.L - x) / B.geom.L; assert.ok(u > 0.17 && u < 0.25, `${k}: ${u}`); }
  }
});

console.log('the tubes');
test('a stopped tube: with the bar held, its first resonance is the bar’s pitch and its second exactly three times it (odd harmonics only)', () => {
  for (const [kind, k] of [['marimba', 48], ['xylophone', 77]]) {
    const B = M.barModel(kind, k), T = M.tube(B, { gap: 0.025 });
    assert.ok(Math.abs(cents(T.modes[0].ft, B.modes[0].f)) < 1e-3, `${T.modes[0].ft} vs ${B.modes[0].f}`);
    assert.ok(Math.abs(T.modes[1].ft / T.modes[0].ft - 3) < 1e-9);
  }
});
test('its length is a quarter wavelength less the open end’s correction (0.61 a) and the gap’s: within 5 % of λ/4 − 0.61a', () => {
  for (const k of [36, 60, 84]) {
    const B = M.barModel('marimba', k), T = M.tube(B, { gap: 0.025 }), q = C_AIR / (4 * B.modes[0].f) - 0.61 * T.a;
    assert.ok(T.length < q && T.length > 0.95 * q - 0.01, `${k}: ${T.length} vs ${q}`);
  }
});
test('mode 2 rocks the bar about its centre: it pushes no air into a centred mouth, and more the further off centre the mouth sits', () => {
  const B = M.barModel('xylophone', 77);
  const k = [0, 0.1, 0.2].map((offset) => M.tube(B, { gap: 0.025, offset }).modes[1].kappa);
  assert.ok(k[0] < 1e-9, `centred: κ₂ ${k[0]}`);
  assert.ok(k[1] > 1e-4 && k[2] > k[1], `${k}`);
  // mode 1's coupling hardly moves: it is broad over the mouth
  const k1 = [0, 0.1].map((offset) => M.tube(B, { gap: 0.025, offset }).modes[0].kappa);
  assert.ok(k1[1] / k1[0] > 0.8, `${k1}`);
});
test('the gap: closer, more of the bar’s air goes into the tube (κ grows)', () => {
  const B = M.barModel('marimba', 60), k = [6, 12, 25, 50].map((g) => M.tube(B, { gap: g / 1000 }).modes[0].kappa);
  for (let i = 1; i < k.length; i++) assert.ok(k[i] < k[i - 1], `${k}`);
});

console.log('the engine');
test('pitch: the engine’s fundamental within 3 ¢ of the key, marimba and xylophone, tubes on and off', () => {
  for (const [kind, keys] of [['marimba', [36, 55, 72, 90]], ['xylophone', [65, 79, 96]]]) for (const k of keys) for (const tubes of [true, false]) {
    const x = note(k, P({ kind, tubes }), 0.6, 1.0), f = peak(x, keyFreq(k), 0.2 * FS, 1.0 * FS);
    assert.ok(Math.abs(cents(f, keyFreq(k))) < 3, `${kind} ${k} tubes ${tubes}: ${cents(f, keyFreq(k)).toFixed(2)} ¢`);
  }
});
test('the partials the cut tunes are there: the marimba’s at 4 f₁ (and 10 f₁), the xylophone’s at 3 f₁', () => {
  const xm = note(48, P({ strike: 0.15, hardness: 3000 }), 0.8, 0.5), f0 = keyFreq(48);
  for (const r of [4, 10]) assert.ok(Math.abs(cents(peak(xm, r * f0, 0.01 * FS, 0.25 * FS), r * f0)) < 5, `marimba ${r}`);
  const xx = note(72, P({ kind: 'xylophone', strike: 0.15, hardness: 3000 }), 0.8, 0.5), g0 = keyFreq(72);
  assert.ok(Math.abs(cents(peak(xx, 3 * g0, 0.01 * FS, 0.2 * FS), 3 * g0)) < 5);
});
test('the tube makes the fundamental louder (> 10 dB at C3 and C4) and the note shorter', () => {
  for (const k of [48, 60]) {
    const on = note(k, P(), 0.6, 2), off = note(k, P({ tubes: false }), 0.6, 2), f = keyFreq(k);
    const gain = dB(tone(on, f, 0.05 * FS, 0.3 * FS) / tone(off, f, 0.05 * FS, 0.3 * FS));
    assert.ok(gain > 10, `${k}: +${gain.toFixed(1)} dB`);
    const fall = (x) => dB(tone(x, f, 0.05 * FS, 0.3 * FS) / tone(x, f, 1.2 * FS, 1.45 * FS));
    assert.ok(fall(on) > fall(off), `${k}: falls ${fall(on).toFixed(1)} dB with the tube, ${fall(off).toFixed(1)} without`);
  }
});
test('the bar alone decays as the model says: mode 1 at σ = πfη + the cords + radiation (to 10 %)', () => {
  for (const k of [48, 72]) {
    const B = M.barModel('marimba', k), m = B.modes[0], sigma = Math.PI * m.f * DEFAULTS.eta + m.sigSup + m.sigRad;
    const x = note(k, P({ tubes: false }), 0.6, 1.2), f = keyFreq(k), t1 = 0.2, t2 = 0.8, w = 0.15;
    const a1 = tone(x, f, t1 * FS, (t1 + w) * FS), a2 = tone(x, f, t2 * FS, (t2 + w) * FS), got = Math.log(a1 / a2) / (t2 - t1);
    assert.ok(Math.abs(got / sigma - 1) < 0.1, `${k}: σ ${got.toFixed(2)} against ${sigma.toFixed(2)} s⁻¹`);
  }
});
test('wood: ten times the internal friction, a much shorter note', () => {
  const f = keyFreq(60), fall = (eta) => { const x = note(60, P({ eta }), 0.6, 1); return dB(tone(x, f, 0.05 * FS, 0.2 * FS) / tone(x, f, 0.6 * FS, 0.75 * FS)); };
  assert.ok(fall(0.02) > fall(0.002) + 10, `${fall(0.02)} vs ${fall(0.002)}`);
});
test('a harder mallet leaves sooner and wakes the upper partials: 10 f₁ against f₁ rises by > 10 dB', () => {
  const f = keyFreq(48), ratio = (h) => { const x = note(48, P({ hardness: h, strike: 0.15 }), 0.7, 0.3); return dB(tone(x, 10 * f, 0, 0.1 * FS) / tone(x, f, 0, 0.1 * FS)); };
  assert.ok(ratio(10000) > ratio(100) + 10, `${ratio(10000)} vs ${ratio(100)}`);
});
test('the xylophone’s tube mouth moved off centre takes up the twelfth: its 3 f₁ partial dies faster', () => {
  const k = 77, f = 3 * keyFreq(k), fall = (offset) => { const x = note(k, P({ kind: 'xylophone', offset, strike: 0.15, gap: 10 }), 0.8, 0.6); return dB(tone(x, f, 0.01 * FS, 0.1 * FS) / tone(x, f, 0.3 * FS, 0.4 * FS)); };
  assert.ok(fall(0.2) > fall(0) + 2, `off centre ${fall(0.2).toFixed(1)} dB, centred ${fall(0).toFixed(1)} dB`);
});
test('no dampers: letting go of a key changes nothing', () => {
  const held = run(P(), 1.5, [[0, (e) => e.noteOn(60, 0.6)]]).L;
  const let_ = run(P(), 1.5, [[0, (e) => e.noteOn(60, 0.6)], [0.1, (e) => e.noteOff(60)]]).L;
  for (let i = 0; i < held.length; i += 97) assert.equal(let_[i], held[i]);
});
test('the roll: a held key is struck again at the roll speed and keeps sounding; let go, it dies away', () => {
  const r = run(P({ roll: 0.6, rollRate: 12 }), 3, [[0, (e) => e.noteOn(60, 0.6)], [2, (e) => e.noteOff(60)]]).L;
  const plain = note(60, P(), 0.6, 3);
  assert.ok(dB(rms(r, 1.5 * FS, 1.9 * FS) / rms(r, 0, 0.3 * FS)) > -15, 'rolled, it lasts');
  assert.ok(dB(rms(plain, 1.5 * FS, 1.9 * FS) / rms(plain, 0, 0.3 * FS)) < -35, 'unrolled, it has died');
  assert.ok(rms(r, 2.8 * FS, 2.95 * FS) < 0.05 * rms(r, 1.5 * FS, 1.9 * FS), 'let go, it dies away');
  // the strokes: 12 a second, a little uneven, for 2 s
  const { e } = run(P({ roll: 0.6, rollRate: 12 }), 1.0, [[0, (e) => e.noteOn(60, 0.6)]]);
  const n = e.voices[0].strokes;
  assert.ok(n >= 12 && n <= 13, `${n} strokes in a second`);
});
test('leaning on a key (aftertouch) or its own MPE slide rolls it alone', () => {
  for (const msg of [{ type: 'pressure', value: 0.7, key: 60 }, { type: 'slide', value: 0.7, key: 60 }]) {
    const r = run(P(), 2, [[0, (e) => { e.noteOn(60, 0.6); e.noteOn(67, 0.6); }], [0.05, (e) => e.handle(msg)]]).L;
    const f = keyFreq(60), g = keyFreq(67);
    assert.ok(dB(tone(r, f, 1.5 * FS, 1.9 * FS) / tone(r, f, 0, 0.3 * FS)) > -15, `${msg.type}: C4 rolls`);
    assert.ok(dB(tone(r, g, 1.5 * FS, 1.9 * FS) / tone(r, g, 0, 0.3 * FS)) < -30, `${msg.type}: G4 does not`);
  }
});
test('the page’s bar data (noteData) plays exactly as the bar the engine builds itself', () => {
  for (const kind of ['marimba', 'xylophone']) {
    const p = P({ kind }), d = M.voiceData(70, p);
    const a = run(p, 0.3, [[0, (e) => e.noteOn(70, 0.6)]]).L, b = run(p, 0.3, [[0, (e) => e.noteOn(70, 0.6, d)]]).L;
    for (let i = 0; i < a.length; i += 31) assert.equal(b[i], a[i]);
  }
});
test('level: a forte note peaks at 0.1–0.5 across both compasses; a 4-note forte chord and a 6-note mf chord stay under 1; no NaN; silence after', () => {
  for (const [kind, keys] of [['marimba', [36, 48, 60, 72, 84]], ['xylophone', [65, 77, 89, 101]]]) for (const k of keys) {
    const { L, peak: pk } = run(P({ kind, hardness: kind === 'xylophone' ? 12000 : 300 }), 0.5, [[0, (e) => e.noteOn(k, 1)]]);
    for (const v of L) assert.ok(Number.isFinite(v));
    assert.ok(pk > 0.1 && pk < 0.5, `${kind} ${k}: ${pk.toFixed(3)}`);
  }
  const c4 = run(P(), 1.5, [[0, (e) => [60, 64, 67, 72].forEach((k) => e.noteOn(k, 1))]]).peak;
  const { e, peak: c6 } = run(P(), 8, [[0, (e) => [48, 55, 60, 64, 67, 72].forEach((k) => e.noteOn(k, 0.8))]]);
  assert.ok(c4 < 1 && c6 < 1, `chords ${c4.toFixed(3)}, ${c6.toFixed(3)}`);
  assert.equal(e.voices.length, 0, 'every bar let go');
});
test('Quality: Medium and Low let 12 and 8 bars ring at once; a bar keeps its pitch and level', () => {
  for (const [q, cap] of [['high', 16], ['medium', 12], ['low', 8]]) {
    const { e } = run(P({ eta: 0.0012 }), 1.25, [...Array(20)].map((_, i) => [0.06 * i, (e) => e.noteOn(48 + i, 0.6)]), q);
    const live = e.voices.filter((v) => !v.fading).length;
    assert.ok(live <= cap && live >= cap - 1, `${q}: ${live}`);
  }
  const hi = note(60, P(), 0.6, 0.5, 'high'), lo = note(60, P(), 0.6, 0.5, 'low'), f = keyFreq(60);
  assert.ok(Math.abs(dB(rms(lo, 0, 0.5 * FS) / rms(hi, 0, 0.5 * FS))) < 0.5);
  assert.ok(Math.abs(cents(peak(lo, f, 0.1 * FS, 0.5 * FS), f)) < 2);
});
test('CPU: 10 sounding bars at 48 kHz in well under 30 % of real time', () => {
  const e = new MarimbaEngine(FS);
  e.setParams(P({ eta: 0.0012 }));
  const bl = 128, L = new Float32Array(bl), R = new Float32Array(bl);
  for (let i = 0; i < 10; i++) { e.noteOn(48 + 2 * i, 0.6); e.process(L, R, bl); }
  const t0 = performance.now(), n = Math.round((2 * FS) / bl);
  for (let i = 0; i < n; i++) e.process(L, R, bl);
  const share = (performance.now() - t0) / 1000 / 2;
  console.log(`         ${(100 * share).toFixed(1)} % of real time for 10 voices`);
  assert.ok(share < 0.3);
});

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nall passed');
