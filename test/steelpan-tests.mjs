// Steel Pan checks. Run: node test/steelpan-tests.mjs
//
// The physics against independent results (a simply supported plate's modes, Hertz contact,
// the secular growth of a 1 : 2 internal resonance, conservation of energy, the layout's shared
// partials), then the engine against the model. Both are the C++ (native/instruments/steelpan),
// built as WebAssembly: the model's functions through steelpan-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS, GROUPS, KEY_LO, KEY_HI } from '../steelpan/src/steelpan-instrument.js';
import { wasmModel } from '../steelpan/src/steelpan-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';

const SteelPanEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const dB = (x) => 20 * Math.log10(Math.max(x, 1e-12));

// Play events [[t, 'on'|'off'|'pressure'|'sustain', key, value]] through an engine in 128-sample
// blocks; `watch(e, t)` is called after each block.
function play(params, sec, events, { fs = FS, watch } = {}) {
  const e = new SteelPanEngine(fs);
  e.setParams(params);
  const n = Math.round(sec * fs), L = new Float32Array(n), R = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = [...events].sort((a, b) => a[0] - b[0]);
  let k = 0;
  for (let s = 0; s < n; s += bl) {
    for (; k < ev.length && ev[k][0] * fs <= s; k++) {
      const [, what, key, v] = ev[k];
      if (what === 'on') e.noteOn(key, v); else if (what === 'off') e.noteOff(key);
      else if (what === 'sustain') e.setSustain(v); else if (what === 'pressure') e.handle({ type: 'pressure', key, value: v });
    }
    e.process(bL, bR, bl);
    L.set(bL.subarray(0, Math.min(bl, n - s)), s); R.set(bR.subarray(0, Math.min(bl, n - s)), s);
    watch?.(e, (s + bl) / fs);
  }
  return { L, R, e };
}
const render = (key, params, vel, sec) => play(params, sec, [[0, 'on', key, vel]]).L;
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b, fs = FS) {
  const w = (2 * Math.PI * f) / fs; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };

// A clean note for the physics: linear unless asked, no neighbours, no tuner's errors.
const LIN = { rise: 0, coupling: 0, accuracy: 0, letRing: true };

console.log('physics');
test('simply supported plate: ω ∝ (i/a)² + (j/b)², so at a/b = √2 modes (1,1), (2,1), (1,2) are 1 : 2 : 3', () => {
  for (const r of [1, 1.3, 2]) for (const [i, j] of [[2, 1], [1, 2], [3, 1], [2, 2], [3, 3]]) {
    const a = r, b = 1, w = (m, n) => (m / a) ** 2 + (n / b) ** 2; // Leissa, Vibration of Plates, eq. 4.21
    assert.ok(Math.abs(M.plateRatio(i, j, r) - w(i, j) / w(1, 1)) < 1e-12, `(${i},${j}) at r = ${r}`);
  }
  const r = Math.SQRT2;
  assert.ok(Math.abs(M.plateRatio(2, 1, r) - 2) < 1e-12 && Math.abs(M.plateRatio(1, 2, r) - 3) < 1e-12);
  assert.ok(Math.abs(M.plateRatio(2, 2, 1.7) - 4) < 1e-12, '(2,2) is always the double octave');
});
test('mode shapes: orthonormal half-sines; a centre strike leaves every mode with an even index silent', () => {
  const N = 120;
  for (const [a, b] of [[[1, 1], [1, 1]], [[1, 1], [2, 1]], [[2, 1], [1, 2]], [[2, 1], [2, 1]], [[3, 1], [1, 3]]]) {
    let s = 0;
    for (let u = 0; u < N; u++) for (let v = 0; v < N; v++) { const x = -1 + (2 * u + 1) / N, y = -1 + (2 * v + 1) / N; s += M.shape(...a, x, y) * M.shape(...b, x, y); }
    s *= 4 / (N * N); // ∫∫ over [−1, 1]², which is 1 for a product of two half-sines squared
    assert.ok(Math.abs(s - (a.join() === b.join() ? 1 : 0)) < 1e-6, `<${a}|${b}> = ${s}`);
  }
  for (const [i, j] of [[2, 1], [1, 2], [2, 2], [4, 1]]) assert.ok(Math.abs(M.shape(i, j, 0, 0)) < 1e-12);
  assert.ok(Math.abs(M.shape(1, 1, 0, 0) - 1) < 1e-12);
});
test('tuning: the tuner puts the octave and twelfth (or double octave) on target; untuned, the plate decides', () => {
  for (const key of [33, 60, 90]) {
    const f1 = keyFreq(key);
    let m = M.noteModes(key, P({ accuracy: 0 }));
    assert.ok(Math.abs(cents(m[0].f, f1)) < 1e-9 && Math.abs(cents(m[1].f, 2 * f1)) < 1e-9 && Math.abs(cents(m[2].f, 3 * f1)) < 1e-9, `${key}: 1 : 2 : 3`);
    m = M.noteModes(key, P({ accuracy: 0, tuning: 'double' }));
    assert.ok(Math.abs(cents(m[2].f, 4 * f1)) < 1e-9, `${key}: 1 : 2 : 4`);
    m = M.noteModes(key, P({ tuning: 'raw', aspect: 1.3 }));
    assert.ok(Math.abs(m[1].f / f1 - (4 + 1.69) / 2.69) < 1e-9 && Math.abs(m[2].f / f1 - (1 + 4 * 1.69) / 2.69) < 1e-9, `${key}: as sunk`);
    m = M.noteModes(key, P({ accuracy: 5 }));
    assert.ok(Math.abs(cents(m[1].f, 2 * f1)) <= 5 + 1e-9 && Math.abs(cents(m[2].f, 3 * f1)) <= 5 + 1e-9, `${key}: within ±5 ¢`);
  }
});
test('every key\'s fundamental is on equal-tempered pitch (A0–C8), and its modes are listed tuned three first', () => {
  for (let key = 21; key <= 108; key++) {
    const m = M.noteModes(key, P());
    assert.ok(Math.abs(cents(m[0].f, keyFreq(key))) < 1e-9, `${key}`);
    assert.deepEqual(m.slice(0, 3).map((x) => [x.i, x.j]), [[1, 1], [2, 1], [1, 2]]);
    for (let i = 4; i < m.length; i++) assert.ok(m[i].f >= m[i - 1].f && m[i].f < 18000);
  }
});
test('the keyboard\'s tuning moves each note, and the pan\'s own tuning stays over it: at A = 415 Hz, and in ¼-comma meantone (E4 −3.42 ¢, C4 +10.26 ¢), 1 : 2 : 3 (or 1 : 2 : 4) on the tuned note, which sounds there (within 0.5 ¢)', () => {
  for (const [key, o, c] of [[69, { pitch: 415 }, cents(415, 440)], [64, { temperament: 'meantone' }, -3.42], [60, { temperament: 'meantone' }, 10.26]]) {
    const f1 = keyFreq(key) * 2 ** (c / 1200);
    let m = M.noteModes(key, P({ accuracy: 0, ...o }));
    assert.ok(Math.abs(cents(m[0].f, f1)) < 0.01 && Math.abs(m[1].f / m[0].f - 2) < 1e-12 && Math.abs(m[2].f / m[0].f - 3) < 1e-12, `${key}: 1 : 2 : 3`);
    m = M.noteModes(key, P({ accuracy: 0, tuning: 'double', ...o }));
    assert.ok(Math.abs(m[2].f / m[0].f - 4) < 1e-12, `${key}: 1 : 2 : 4`);
    const x = render(key, P({ ...LIN, ...o }), 0.7, 0.6), a = 4800, b = 4800 + 16384;
    let lo = f1 * 2 ** (-10 / 1200), hi = f1 * 2 ** (10 / 1200); // the strongest frequency within ±10 ¢ (golden section)
    for (let it = 0; it < 40; it++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
    assert.ok(Math.abs(cents((lo + hi) / 2, f1)) < 0.5, `${key}: sounds ${cents((lo + hi) / 2, f1).toFixed(2)} ¢ from its tuned note`);
  }
});
test('Hertz contact: the stick\'s contact time goes as v^(−1/5); a half-sine pulse has its first zero at 1.5/τ', () => {
  const f1 = keyFreq(60), t1 = M.contact(0.7, f1, 1), t2 = M.contact(0.7, f1, 1 / 32);
  assert.ok(Math.abs(t1 - 0.7e-3) < 1e-12 && Math.abs(t2 / t1 - 2) < 1e-9, `${t1}, ${t2}`);
  assert.ok(Math.abs(M.contact(0.7, 4 * f1, 1) / t1 - 0.5) < 1e-9, 'a note two octaves up is stiffer: half the contact');
  const tau = 1e-3;
  assert.ok(M.pulse(1.5 / tau, tau) < 1e-9 && Math.abs(M.pulse(1, tau) - 1) < 1e-5 && Math.abs(M.pulse(0.5 / tau, tau) - Math.PI / 4) < 1e-9);
});
test('the skirt: a short one loses the low partials (front and back cancel), a long one passes them', () => {
  assert.ok(Math.abs(M.skirt(33, 1) - 0.86) < 1e-12 && Math.abs(M.skirt(90, 1) - 0.14) < 1e-12, 'bass 86 cm, tenor 14 cm');
  // the back's path is the skirt and the drum's radius (28 cm) longer: |1 − e^(−ikd)| / 2 ≈ kd / 2
  const L = 0.14, d = L + 0.28, k = (f) => (2 * Math.PI * f * d) / 343;
  assert.ok(Math.abs(M.radiation(20, L) / (k(20) / 2) - 1) < 0.01, 'small kd: a dipole, ∝ f');
  assert.ok(M.radiation(20000, L) > 0.99, 'large kd: everything');
  for (let f = 50; f < 5000; f *= 1.3) assert.ok(M.radiation(f * 1.3, L) > M.radiation(f, L));
});
test('fourths and fifths: C4\'s neighbours share its partials; chromatic neighbours share none', () => {
  const nb = M.neighbours(60, 'fifths').map((n) => n.key).sort((a, b) => a - b);
  assert.deepEqual(nb, [53, 55, 65, 67, 72, 48, 77, 79].sort((a, b) => a - b));
  const shared = (layout) => {
    let best = 0;
    const own = M.noteModes(60, P({ accuracy: 0 })).slice(0, 3).map((m) => m.f);
    for (const { key } of M.neighbours(60, layout)) for (const m of M.noteModes(key, P({ accuracy: 0 })).slice(0, 3))
      for (const f of own) if (Math.abs(cents(m.f, f)) < 5) best++;
    return best;
  };
  // G4's octave and G5 on C4's twelfth (−2 ¢: the equal-tempered fifth), C5 on its octave, C3's
  // octave on its fundamental, F3's twelfth on its octave
  assert.ok(shared('fifths') === 5, `fifths: ${shared('fifths')} shared partials`);
  const g4 = M.noteModes(67, P({ accuracy: 0 }))[1].f, c4 = M.noteModes(60, P({ accuracy: 0 }))[2].f;
  assert.ok(Math.abs(cents(g4, c4) + 1.955) < 0.01, `G4's octave vs C4's twelfth: ${cents(g4, c4).toFixed(3)} ¢`);
  assert.equal(shared('chromatic'), 2, 'chromatic: only the octave rings (C3, C5)');
});

console.log('the dome (nonlinear)');
// The note's tuned modes, sample by sample (displacements in thicknesses), for a note struck at
// the centre: the octave and the third partial get nothing from the stick.
function trace(params, key, vel, sec) {
  const e = new SteelPanEngine(FS);
  e.setParams(params);
  e.noteOn(key, vel);
  const n = Math.round(sec * FS), x = [[], [], []], a = new Float32Array(1), b = new Float32Array(1);
  for (let s = 0; s < n; s++) { for (let p = 0; p < 3; p++) x[p].push(e.displacement(key, p)); e.process(a, b, 1); }
  return { x, e };
}
const CENTRE = { ...LIN, along: 0, across: 0, t60: 8, damping: 0 };
test('flat notes stay linear: struck at the centre, no octave appears', () => {
  const { x } = trace(P(CENTRE), 60, 1, 0.1);
  const a0 = Math.max(...x[0].map(Math.abs)), a1 = Math.max(...x[1].map(Math.abs));
  assert.ok(a1 < 1e-12 * a0, `octave ${a1} vs fundamental ${a0}`);
});
test('a 1 : 2 internal resonance: the octave grows as g a² t / 4ω₂ (the secular term), so ∝ a²', () => {
  const rise = 3, g = M.kRise * rise, w0 = 2 * Math.PI * keyFreq(60), w1 = 2 * w0, t = 0.008;
  for (const vel of [0.05, 0.1]) {
    const { x, e } = trace(P({ ...CENTRE, rise }), 60, vel, t);
    void e;
    const a = Math.max(...x[0].slice(0, 200).map(Math.abs));
    // x₂'' + ω₂² x₂ = −g ω₁² x₁² with x₁ = a cos ω₁t: resonant forcing g ω₁² a²/2 at ω₂ = 2ω₁
    const want = (g * w0 * w0 * a * a * t) / (4 * w1);
    const got = Math.max(...x[1].slice(-Math.round(FS / keyFreq(60))).map(Math.abs));
    assert.ok(Math.abs(got / want - 1) < 0.05, `vel ${vel}: octave ${got.toExponential(3)}, theory ${want.toExponential(3)}`);
  }
});
test('the dome exchanges energy, it does not make it: Σ ½(ẋ² + ω²x²) + V conserved (times e^(2σt))', () => {
  const params = P({ ...CENTRE, rise: 6, along: 0.3, across: 0.2 }), key = 60;
  const { x } = trace(params, key, 1, 0.07);
  const m = M.noteModes(key, params), w = m.slice(0, 3).map((q) => 2 * Math.PI * q.f), sigma = m[0].sigma;
  const g = M.kRise * params.rise * w[0] * w[0], gam = M.kHarden;
  const energy = (n) => {
    const X = [0, 1, 2].map((p) => x[p][n]), V = [0, 1, 2].map((p) => ((x[p][n + 1] - x[p][n - 1]) * FS) / 2);
    const Q = X[0] ** 2 + (w[1] / w[0]) ** 2 * X[1] ** 2 + (w[2] / w[0]) ** 2 * X[2] ** 2;
    let E = g * (X[0] ** 2 * X[1] + X[0] * X[1] * X[2] + X[1] ** 2 * X[2]) + 0.25 * gam * w[0] ** 2 * Q * Q;
    for (let p = 0; p < 3; p++) E += 0.5 * (V[p] ** 2 + w[p] ** 2 * X[p] ** 2);
    return E * Math.exp((2 * sigma * n) / FS);
  };
  // averaged over a period of the fundamental (the damping's ripple)
  const per = Math.round(FS / keyFreq(key)), avg = (n) => { let s = 0; for (let i = 0; i < per; i++) s += energy(n + i); return s / per; };
  const E0 = avg(10), share = (n, p) => 0.5 * w[p] ** 2 * Math.max(...x[p].slice(n, n + per).map((v) => v * v));
  for (const n of [600, 1200, 2000, 2800]) assert.ok(Math.abs(avg(n) / E0 - 1) < 0.01, `t = ${(n / FS * 1000).toFixed(1)} ms: E/E0 = ${(avg(n) / E0).toFixed(4)}`);
  assert.ok(share(2000, 1) > 2 * share(10, 1), 'and the octave really took energy from the fundamental');
});
test('the harder the stroke, the brighter: the octave\'s share of the sound grows with velocity (and only with a dome)', () => {
  const key = 60, f = keyFreq(key), a = Math.round(0.03 * FS), b = Math.round(0.15 * FS);
  const share = (o, vel) => { const x = render(key, P({ ...CENTRE, ...o }), vel, 0.16); return dB(tone(x, 2 * f, a, b) / tone(x, f, a, b)); };
  const domed = share({ rise: 3 }, 0.8) - share({ rise: 3 }, 0.1), flat = share({ rise: 0 }, 0.8) - share({ rise: 0 }, 0.1);
  assert.ok(domed > 15, `domed: octave +${domed.toFixed(1)} dB relative to the fundamental`);
  assert.ok(Math.abs(flat) < 1, `flat: ${flat.toFixed(2)} dB`);
});

console.log('engine');
test('the sound is on the model\'s modes: fundamental, octave, twelfth', () => {
  for (const key of [45, 69]) {
    const x = render(key, P({ ...LIN }), 0.7, 1), f1 = keyFreq(key), a = 4800, b = 4800 + 16384;
    assert.ok(tone(x, f1, a, b) > 30 * tone(x, f1 * 1.06, a, b), `${key}: fundamental stands out`);
    for (const r of [2, 3]) assert.ok(tone(x, r * f1, a, b) > 10 * tone(x, r * f1 * 1.03, a, b), `${key}: partial ${r}`);
  }
});
test('decay: the fundamental falls 60 dB in the ring time, which goes as 1/√f', () => {
  for (const key of [48, 72]) {
    const t60 = M.ringTime(key, 2), x = render(key, P({ ...LIN, t60: 2, along: 0, across: 0 }), 0.5, 1.4), f = keyFreq(key), W = 8192;
    const db = dB(tone(x, f, 4800 + FS, 4800 + FS + W) / tone(x, f, 4800, 4800 + W));
    assert.ok(Math.abs(db - -60 / t60) < 0.7, `${key}: ${db.toFixed(2)} dB in 1 s; T60 ${t60.toFixed(2)} s means ${(-60 / t60).toFixed(2)}`);
  }
  assert.ok(Math.abs(M.ringTime(72, 2) / M.ringTime(48, 2) - 0.5) < 1e-9);
});
test('neighbours sing along in fourths and fifths, not when laid out chromatically', () => {
  const along = (layout) => {
    let best = 0, who = 0;
    play(P({ letRing: true, layout, coupling: 0.004 }), 0.5, [[0, 'on', 60, 0.8]], { watch: (e) => {
      for (const { key } of M.neighbours(60, layout)) for (let p = 0; p < 3; p++) { const a = e.amplitude(key, p); if (a > best) { best = a; who = key; } }
    } });
    return { best, who };
  };
  const f = along('fifths'), c = along('chromatic');
  assert.ok(f.best > 0.01, `fifths: neighbour ${f.who} reaches ${f.best.toExponential(2)} h`);
  // chromatic: C5 and C3 (radial) still share the octave; the ring's own neighbours share nothing
  const ring = (layout) => { let best = 0; play(P({ letRing: true, layout, coupling: 0.004 }), 0.5, [[0, 'on', 60, 0.8]], { watch: (e) => { for (const k of layout === 'fifths' ? [55, 67] : [59, 61]) for (let p = 0; p < 3; p++) best = Math.max(best, e.amplitude(k, p)); } }); return best; };
  assert.ok(dB(ring('fifths') / Math.max(ring('chromatic'), 1e-12)) > 30, `ring neighbours: fifths ${ring('fifths').toExponential(2)}, chromatic ${ring('chromatic').toExponential(2)}`);
});
test('a hand on the note: key-up mutes it; Let notes ring and the sustain pedal keep it', () => {
  const key = 60, ev = [[0, 'on', key, 0.7], [0.2, 'off', key]], a = Math.round(0.21 * FS), b = Math.round(0.6 * FS), c = Math.round(0.7 * FS);
  const drop = (o, extra = []) => { const x = play(P(o), 0.7, [...ev, ...extra]).L; return dB(rms(x, b, c) / rms(x, a, a + 2400)); };
  assert.ok(drop({}) < -45, `muted: ${drop({}).toFixed(1)} dB`);
  assert.ok(drop({ letRing: true }) > -25, `let ring: ${drop({ letRing: true }).toFixed(1)} dB`);
  assert.ok(drop({}, [[0, 'sustain', 0, true]]) > -25, 'sustain pedal');
});
test('a roll: while the key is down the sticks keep striking; leaning on the key (aftertouch) rolls it too', () => {
  const key = 64, ev = [[0, 'on', key, 0.7]], early = (x) => rms(x, 0, 4800), late = (x) => rms(x, Math.round(1.4 * FS), Math.round(1.5 * FS));
  const still = play(P({ letRing: true }), 1.5, ev).L, rolled = play(P({ letRing: true, roll: 0.6 }), 1.5, ev).L;
  const pressed = play(P({ letRing: true }), 1.5, [...ev, [0.05, 'pressure', key, 0.6]]).L;
  assert.ok(dB(late(still) / early(still)) < -30, `no roll: ${dB(late(still) / early(still)).toFixed(1)} dB after 1.4 s`);
  assert.ok(dB(late(rolled) / early(rolled)) > -12, `roll: ${dB(late(rolled) / early(rolled)).toFixed(1)} dB`);
  assert.ok(dB(late(pressed) / early(pressed)) > -12, `aftertouch: ${dB(late(pressed) / early(pressed)).toFixed(1)} dB`);
  const released = play(P({ letRing: true, roll: 0.6 }), 1.5, [...ev, [0.5, 'off', key]]).L;
  assert.ok(dB(late(released) / early(released)) < -20, 'and stops with the key');
});
test('the compass is the steel band\'s, six bass to high tenor (A1–F♯6), with Full range opening A0–C8', () => {
  assert.deepEqual(INSTRUMENT.compass.keys, [33, 90]);
  assert.equal(KEY_LO, 33); assert.equal(KEY_HI, 90);
  assert.deepEqual(INSTRUMENT.range, [21, 108]);
  assert.ok(GROUPS.flatMap((g) => g.params).find((p) => p.id === 'fullRange').def === false);
});
test('output level is sane on every key (peak 0.02 – 1 at full velocity), and no NaN', () => {
  let pk = 0, lo = 1;
  for (let key = 21; key <= 108; key += 3) {
    let p = 0;
    for (const v of render(key, P(), 1, 0.25)) { assert.ok(Number.isFinite(v)); p = Math.max(p, Math.abs(v)); }
    pk = Math.max(pk, p); lo = Math.min(lo, p);
  }
  assert.ok(pk < 1 && lo > 0.01, `peaks ${lo.toFixed(3)} – ${pk.toFixed(3)}`);
});
test('extreme settings at 44.1 and 48 kHz: every preset and corners, chords and rolls, stay finite and bounded', () => {
  let s = 7;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const ps = GROUPS.flatMap((g) => g.params).filter((p) => p.min !== undefined && p.id !== 'volume');
  const combos = [...PRESETS.map((p) => p.p), ...Array.from({ length: 10 }, () => Object.fromEntries(ps.map((p) => [p.id, rnd() < 0.5 ? p.min : p.max])))];
  for (const fs of [44100, 48000]) for (const o of combos) {
    const tuning = ['twelfth', 'double', 'raw'][Math.floor(rnd() * 3)], layout = rnd() < 0.5 ? 'fifths' : 'chromatic';
    const { L, e } = play(P({ tuning, layout, ...o }), 0.5, [[0, 'on', 21, 1], [0, 'on', 60, 1], [0, 'on', 67, 1], [0, 'on', 108, 1], [0.1, 'on', 60, 1], [0.15, 'off', 60]], { fs });
    let pk = 0;
    for (const v of L) { assert.ok(Number.isFinite(v), JSON.stringify(o)); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk < 4, `peak ${pk} for ${JSON.stringify(o)}`);
    void e;
  }
});
test('silence after Panic, and the notes go to sleep once rung out', () => {
  const { L, e } = play(P({ letRing: true }), 0.3, [[0, 'on', 60, 1], [0, 'on', 64, 1]]);
  e.allNotesOff();
  const a = new Float32Array(128), b = new Float32Array(128);
  e.process(a, b, 128);
  assert.ok(a.every((v) => v === 0) && e.voiceCount() === 0 && L.length);
  const short = play(P({ t60: 0.2 }), 3, [[0, 'on', 72, 0.5], [0.05, 'off', 72]]).e;
  assert.ok(!short.active(72) && !short.active(79), 'asleep');
});
test('CPU: 10 notes and their neighbours render faster than 5× real time', () => {
  const keys = [48, 52, 55, 60, 64, 67, 71, 72, 76, 79], sec = 2;
  const t0 = performance.now();
  play(P({ letRing: true }), sec, keys.map((k, i) => [i * 0.01, 'on', k, 0.8]));
  const ms = performance.now() - t0;
  assert.ok(ms < (1000 * sec) / 5, `${ms.toFixed(0)} ms for ${sec} s`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
