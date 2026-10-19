// Tine piano checks. Run: node test/tines-tests.mjs
// The model and the engine are the C++ (native/instruments/tines), built as WebAssembly: the
// model's functions through tines-wasm.js, the engine through loadEngine.
import assert from 'node:assert/strict';
import { KEY_LO, KEY_HI, KEY_MIN, KEY_MAX } from '../tines/src/tine.js';
import { DEFAULTS } from '../tines/src/rhodes-params.js';
import { INSTRUMENT } from '../tines/src/tines-instrument.js';
import { wasmModel } from '../tines/src/tines-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';

const TinesEngine = await loadEngine(INSTRUMENT);
const { keyModel } = await wasmModel(); // a key's model; .packed is its voice data for the engine

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);

function render(key, params, vel, sec, eng = {}) {
  const k = keyModel(key, params, FS);
  const e = new TinesEngine(FS);
  e.setParams({ ...params, ...eng });
  const v = e.noteOn(key, vel, k.packed);
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
  // without the spring the tine is a bare steel cantilever (E = 200 GPa, ρ = 7850 kg/m³)
  const { info: i, tine } = keyModel(40, P({ springMass: 0 }), FS);
  const exact = ((1.8751 ** 2) / (2 * Math.PI)) * Math.sqrt((2.0e11 * i.d * i.d) / (16 * 7850)) / i.L ** 2;
  assert.ok(Math.abs(i.f1tine / exact - 1) < 1e-4, `f₁ ${i.f1tine} Hz, Euler–Bernoulli ${exact} Hz`);
  assert.ok(Math.abs(i.f1tine / keyFreq(40) - 1) < 1e-4, 'the length is solved to tune the key');
  [6.2669, 17.5475, 34.3861].forEach((r, n) => assert.ok(Math.abs(i.tineRatios[n + 1] - r) < 2e-3 * r, `mode ${n + 2}: ${i.tineRatios[n + 1]}`));
  assert.ok(Math.abs(i.mt / ((7850 * Math.PI * i.d * i.d * i.L) / 4) - 1) < 1e-9, 'the rigid mass is the tine’s');
  // mode 1 carries 61.3 % of the tine's mass (modal effective mass, Γ₁²/mt)
  assert.ok(i.ms === 0 && Math.abs(tine.Gamma[0] ** 2 / i.mt - 0.6131) < 1e-3, `Γ₁²/mt = ${tine.Gamma[0] ** 2 / i.mt}`);
});
test('every key, A0–C8: the sustaining fork mode sits on pitch', () => {
  for (let m = KEY_MIN; m <= KEY_MAX; m++) {
    const k = keyModel(m, P(), FS), f0 = keyFreq(m);
    // among modes within a semitone, the longest-ringing one is the note
    const near = k.modes.filter((x) => Math.abs(cents(x.f, f0)) < 100);
    const best = near.reduce((a, b) => (b.sigma < a.sigma ? b : a));
    assert.ok(Math.abs(cents(best.f, f0)) < 0.5, `${m}: ${cents(best.f, f0)} ¢`);
  }
});
test('the keyboard’s tuning: at A = 415 Hz the fork mode sits at 415/440 of the key’s pitch; in ¼-comma meantone E4 −3.42 ¢, C4 +10.26 ¢', () => {
  // ¼-comma meantone on C, A kept: E a fifth's narrowing (q − 700) from equal temperament, C 2100 − 3q
  const q = 1200 * Math.log2(3 / 2) - 300 * Math.log2(81 / 80);
  for (const [o, m, want] of [[{ pitch: 415 }, 64, cents(415, 440)], [{ pitch: 415 }, 69, cents(415, 440)], [{ temperament: 'meantone' }, 64, q - 700], [{ temperament: 'meantone' }, 60, 2100 - 3 * q]]) {
    const k = keyModel(m, P(o), FS), f0 = keyFreq(m) * 2 ** (want / 1200);
    assert.ok(Math.abs(cents(k.info.f0, f0)) < 1e-9, `${JSON.stringify(o)} ${m}: target ${k.info.f0} Hz`);
    const best = k.modes.filter((x) => Math.abs(cents(x.f, f0)) < 100).reduce((a, b) => (b.sigma < a.sigma ? b : a));
    assert.ok(Math.abs(cents(best.f, f0)) < 0.5, `${JSON.stringify(o)} ${m}: ${cents(best.f, f0)} ¢`);
  }
});
test('tone bar: matched bar keeps the block still → long sustain; no bar → short', () => {
  const t60 = (o) => {
    const k = keyModel(69, P(o), FS), f0 = keyFreq(69);
    const md = k.modes.filter((x) => Math.abs(cents(x.f, f0)) < 30).sort((a, b) => b.tineFrac - a.tineFrac)[0];
    return 6.91 / md.sigma;
  };
  const withBar = t60({}), noBar = t60({ barMass: 0.01 }), detuned = t60({ barTune: 40 });
  assert.ok(noBar < 0.2 * withBar && detuned < withBar, `with ${withBar.toFixed(1)} s, none ${noBar.toFixed(2)} s, detuned ${detuned.toFixed(1)} s`);
  console.log(`        A4 sustain T60: matched bar ${withBar.toFixed(1)} s · bar +40 ¢ ${detuned.toFixed(1)} s · no bar ${noBar.toFixed(2)} s`);
});

console.log('engine');
test('A4 plays 440 Hz and is finite; at A = 415 Hz, 415 Hz', () => {
  for (const a4 of [440, 415]) {
    const { L } = render(69, P({ pitch: a4 }), 1.8, 1.2, DRY);
    let best = 0, bf = 0;
    for (let f = a4 - 3; f <= a4 + 3; f += 0.05) { const g = goertzel(L, f, 0.2 * FS, 1.2 * FS); if (g > best) { best = g; bf = f; } }
    assert.ok(Math.abs(cents(bf, a4)) < 2, `f=${bf}`);
    for (const s of L) assert.ok(Number.isFinite(s));
  }
});
test('the 88-key range\'s ends: A0 and C8 play on pitch (A0 heard through its pickup harmonics), finite, C8 within 12 dB of E7', () => {
  const level = (L) => { let s = 0; for (let i = 0; i < 0.2 * FS; i++) s += L[i] ** 2; return 10 * Math.log10(s / (0.2 * FS)); };
  const e7 = level(render(KEY_HI, P(), 2.5, 0.2).L);
  for (const [key, h] of [[KEY_MIN, 2], [KEY_MAX, 1]]) {
    const { L } = render(key, P(), 2.5, 1.2), f = h * keyFreq(key);
    let best = 0, bf = 0;
    for (let c = -20; c <= 20; c += 0.5) { const g = goertzel(L, f * 2 ** (c / 1200), 0.1 * FS, 1.1 * FS); if (g > best) { best = g; bf = c; } }
    const db = level(L);
    assert.ok(Math.abs(bf) < 3 && db > e7 - 12 && L.every(Number.isFinite), `key ${key}: ${bf} ¢, ${db.toFixed(1)} dB (E7 ${e7.toFixed(1)} dB)`);
  }
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
    const k = keyModel(60, P(), FS), e = new TinesEngine(FS);
    e.setParams(P());
    e.setSustain(sustain);
    e.noteOn(60, 2, k.packed);
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
test('voice stealing never takes a chord that has just been struck', () => {
  const e = new TinesEngine(FS); e.setParams(P()); e.setSustain(true);
  const vd = (k) => keyModel(k, P(), FS).packed;
  const bl = 128, L = new Float32Array(bl), R = new Float32Array(bl);
  for (let k = KEY_LO; k < KEY_LO + 40; k++) { e.noteOn(k, 1.8, vd(k)); for (let i = 0; i < 4; i++) e.process(L, R, bl); }
  const chord = [72, 76, 79, 84].map((k) => e.noteOn(k, 1.8, vd(k)));
  assert.ok(chord.every((v) => !v.killing), `killed: ${chord.filter((v) => v.killing).map((v) => v.key)}`);
  e.process(L, R, bl);
  assert.ok(e.voices.filter((v) => !v.killing).length <= e.p.maxVoices, 'the limit holds once the chord has sounded');
});
test('long blocks (the page’s pickup-waveform view asks for up to 3500 samples) stay finite', () => {
  for (const key of [KEY_LO, 33, 45]) {
    const k = keyModel(key, P(), FS), e = new TinesEngine(FS);
    e.setParams({ ...P(), ...DRY });
    e.noteOn(key, 1.8, k.packed);
    const n = Math.round((3 / k.info.f0) * FS), L = new Float32Array(n), R = new Float32Array(n);
    e.process(L, R, Math.round(0.02 * FS));
    e.process(L, R, n);
    let pk = 0;
    for (const s of L) { assert.ok(Number.isFinite(s), `key ${key}, ${n} samples`); pk = Math.max(pk, Math.abs(s)); }
    assert.ok(pk > 1e-4, `key ${key}: silent`);
  }
});
// strongest 3rd-difference spike just after a change, re that signal's RMS before it
function clickAfter(change, keys = [52, 55]) {
  const e = new TinesEngine(FS); e.setParams(P());
  for (const key of keys) e.noteOn(key, 1.8, keyModel(key, P(), FS).packed);
  const n = FS, x = new Float64Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl), at = 24064;
  for (let s = 0; s < n; s += bl) { if (s === at) change(e); e.process(bL, bR, bl); for (let i = 0; i < bl; i++) x[s + i] = bL[i]; }
  const d3 = (i) => x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3];
  let pk = 0, e2 = 0, c = 0;
  for (let i = at - 192; i < at + 192; i++) pk = Math.max(pk, Math.abs(d3(i)));
  for (let i = at - 2300; i < at - 400; i++) { e2 += d3(i) ** 2; c++; }
  return { ratio: pk / Math.sqrt(e2 / c), x };
}
test('live controls glide: speaker, amp drive, vibrato depth and harp make no click', () => {
  for (const [name, ch] of [['speaker 6 → 2 kHz', { tone: 2000 }], ['drive 0.15 → 0.8', { drive: 0.8 }], ['vibrato depth 0 → 0.8', { tremDepth: 0.8 }], ['cable 1 → 5 nF', { cable: 5000 }], ['drive → 0', { drive: 0 }]]) {
    const { ratio } = clickAfter((e) => e.setParams(ch));
    assert.ok(ratio < 8, `${name}: spike ${ratio.toFixed(1)}× the background`);
  }
});
test('pickup voicing is live: centring a ringing tine trades its fundamental for the octave, without a click', () => {
  const g = (x, f, a, b) => goertzel(x, f, a, b);
  const { ratio, x } = clickAfter((e) => e.setParams({ offset: 0 }), [57]);
  assert.ok(ratio < 8, `spike ${ratio.toFixed(1)}×`);
  const before = g(x, 220, 0.2 * FS, 0.5 * FS) / g(x, 440, 0.2 * FS, 0.5 * FS);
  const after = g(x, 220, 0.6 * FS, 0.9 * FS) / g(x, 440, 0.6 * FS, 0.9 * FS);
  assert.ok(before > 1 && after < 0.1, `fundamental / octave: ${before.toFixed(2)} before, ${after.toFixed(3)} after`);
  // and a gap change reaches every sounding voice
  const e = new TinesEngine(FS); e.setParams(P());
  const v = e.noteOn(60, 1.8, keyModel(60, P(), FS).packed);
  e.setParams({ gap: 0.6 });
  const L = new Float32Array(128), R = new Float32Array(128);
  for (let i = 0; i < 100; i++) e.process(L, R, 128);
  assert.ok(Math.abs(v.wid / keyModel(60, P({ gap: 0.6 }), FS).voice.pickup.wid - 1) < 1e-6);
});
test('stable across extremes', () => {
  const cases = [P({ gap: 0.4, poleRadius: 0.3, offset: 1.2, drive: 1, hardness: 10, tipExp: 1 }), P({ barMass: 0.01, blockMass: 5, mountDamp: 2, mountRatio: 3 }),
    P({ tineDiameter: 2.8, springMass: 1.5, springPos: 1, strike: 40, hysteresis: 1e-3, hardness: 0.1 }), P({ barMass: 60, barTune: -100, mountDamp: 0.02, tremDepth: 1 })];
  for (const c of cases) for (const key of [KEY_MIN, KEY_LO, 60, KEY_HI, KEY_MAX]) {
    const { L } = render(key, c, 5, 0.4);
    for (const s of L) assert.ok(Number.isFinite(s) && Math.abs(s) < 20);
  }
});

console.log('performance');
test('CPU: 20 sounding keys render in under 40 % of one core', () => {
  const e = new TinesEngine(FS); e.setParams(P());
  for (let i = 0; i < 20; i++) { const key = 36 + 3 * i; e.noteOn(key, 2, keyModel(key, P(), FS).packed); }
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
