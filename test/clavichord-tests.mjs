// Clavichord checks. Run: node test/clavichord-tests.mjs
//
// First the strings' physics against independent results (Mersenne–Taylor with stiffness, the
// stretch of a string held up at a point, the tangent's force balance, a damper's share of a
// partial, the projection integrals), then the engine against the model and against what the
// clavichord is known for: the tangent holding the note, pressure tuning and Bebung, fretted
// pairs, the listing's silence. Both are the C++ (native/instruments/clavichord), built as
// WebAssembly: the model's functions through clavichord-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../clavichord/src/clavichord-instrument.js';
import { wasmModel } from '../clavichord/src/clavichord-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';

const ClavichordEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();
const [KEY_LO, KEY_HI] = INSTRUMENT.compass.keys;

const FS = 48000, PI = Math.PI;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);

// Run the engine through events ([t, 'on', key, vel] | [t, 'off', key, rel] | [t, 'pressure',
// value, key] | [t, 'slide', value, key]), in 128-sample blocks; hook(e, sample) after each block.
function run(params, events, sec, { hook, quality } = {}) {
  const e = new ClavichordEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float32Array(n), R = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, type, a, b]) => ({ s: Math.round(t * FS), type, a, b })).sort((x, y) => x.s - y.s);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j].s <= s) {
      const { type, a, b } = ev[j++];
      if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a, b ?? -1); else e.handle({ type, value: a, key: b });
    }
    e.process(bL, bR, bl);
    L.set(bL.subarray(0, Math.min(bl, n - s)), s); R.set(bR.subarray(0, Math.min(bl, n - s)), s);
    hook?.(e, s);
  }
  return { L, R, e };
}
const hold = (key, vel, sec, params = P(), opts) => run(params, [[0, 'on', key, vel]], sec, opts);
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b) {
  a = Math.round(a); b = Math.round(b); const w = (2 * PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// Frequency of the strongest line within ±40 ¢ of f0 in [a, b): Goertzel scan, parabolic peak.
function peakFreq(x, a, b, f0) {
  const c = []; for (let k = -80; k <= 80; k++) c.push(Math.log(tone(x, f0 * 2 ** (k / 2400), a, b) + 1e-30));
  let i = 1; for (let k = 1; k < c.length - 1; k++) if (c[k] > c[i]) i = k;
  const d = (0.5 * (c[i - 1] - c[i + 1])) / (c[i - 1] - 2 * c[i] + c[i + 1]);
  return f0 * 2 ** ((i - 80 + d) / 2400);
}
const rms = (x, a, b) => { let s = 0; a = Math.round(a); b = Math.round(b); for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const peakOf = (x, a = 0, b = x.length) => { let p = 0; for (let i = Math.round(a); i < Math.round(b); i++) p = Math.max(p, Math.abs(x[i])); return p; };
const dB = (r) => 20 * Math.log10(r);
// Simpson's rule, for the integrals checked against their closed forms.
function quad(f, a, b, n = 4000) { const h = (b - a) / n; let s = f(a) + f(b); for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h); return (s * h) / 3; }

console.log('physics');
test('fretting: C–C♯, E♭–E, F–F♯, G–G♯ and B♭–B share strings, D and A have their own; unfretted, every key its own', () => {
  const pairs = [[0, 1], [3, 4], [5, 6], [7, 8], [10, 11]], free = [2, 9];
  for (const o of [48, 60, 72]) {
    for (const [a, b] of pairs) { assert.equal(M.courseOf(o + a, true), o + a); assert.equal(M.courseOf(o + b, true), o + a); }
    for (const a of free) { assert.equal(M.courseOf(o + a, true), o + a); assert.notEqual(M.courseOf(o + a + 1, true), o + a); }
    for (let k = 0; k < 12; k++) assert.equal(M.courseOf(o + k, false), o + k);
  }
  const c = M.course(61, P({ fretting: 'fretted' }));
  assert.equal(c.course, 60); assert.equal(c.keys, 2);
  // the upper tangent a tempered semitone nearer the bridge along the same string
  assert.ok(Math.abs(c.L / M.course(60, P({ fretting: 'fretted' })).L - 2 ** (-1 / 12)) < 1e-9);
});
test('the scale: Pythagorean (L ∝ 1/f) in the treble, folded in the bass to at most 1.3 m; every string well under its breaking stress', () => {
  near(M.scaleLength(84) / M.scaleLength(72), 0.5, 0.01, 'c³/c² length');
  near(M.scaleLength(72), 0.26, 1e-9, 'c²');
  for (let k = KEY_LO; k <= KEY_HI; k++) {
    assert.ok(M.scaleLength(k) <= 1.3, `${k}: ${M.scaleLength(k)}`);
    for (const s of M.course(k, P({ octave: true })).strings) {
      const limit = s.brass ? 500e6 : 750e6; // hard brass breaks near 600 MPa, the period's iron near 1 GPa
      assert.ok(s.stress < limit, `${k}: ${(s.stress / 1e6).toFixed(0)} MPa ${s.brass ? 'brass' : 'iron'}`);
    }
  }
});
function near(x, y, tol, what) { assert.ok(Math.abs(x - y) <= tol, `${what}: ${x} vs ${y}`); }
test('each partial: Mersenne–Taylor with the wire\'s stiffness, f_n = (n/2L)√(T/μ)·√(1 + Bn²), B = π²EI/TL²', () => {
  for (const k of [29, 48, 60, 72, 89]) {
    const c = M.course(k, P()), s = c.strings[0], T = s.Tnom + 0; // nominal touch: T = Tnom
    const EI = (s.EA * s.d * s.d) / 16, B = (PI * PI * EI) / (T * c.L * c.L);
    near(B / s.B, 1, 1e-9, `${k}: B`);
    const parts = M.partials(k, 0, P());
    for (const n of [1, 2, 5, 9]) {
      if (n > parts.length) continue;
      const f = (n / (2 * c.L)) * Math.sqrt(T / s.mu) * Math.sqrt(1 + B * n * n);
      assert.ok(Math.abs(cents(parts[n - 1].f, f)) < 0.01, `${k} partial ${n}: ${parts[n - 1].f} vs ${f}`);
    }
  }
});
test('pressing: the tangent rests where the strings\' pull balances the finger, F = ΣT·z(1/L + 1/a), each stretched by z²(1/L + 1/a)/2', () => {
  for (const k of [36, 60, 84]) for (const F of [0.3, 0.8, 2]) {
    const c = M.course(k, P()), z = M.restHeight(k, P(), F), g = 1 / c.L + 1 / c.a;
    let pull = 0;
    for (const s of c.strings) pull += (s.T0 + (s.EA / c.l) * 0.5 * z * z * g) * z * g;
    near(pull / F, 1, 1e-6, `${k} at ${F} N`);
  }
  // tuned at the nominal touch: there, the strings are at the tension that gives the note
  for (const k of [36, 60, 84]) {
    const c = M.course(k, P()), s = c.strings[0], z = c.z, T = s.T0 + (s.EA / c.l) * 0.5 * z * z * (1 / c.L + 1 / c.a);
    near(T / s.Tnom, 1, 1e-6, `${k}: tension at the default touch`);
  }
});
test('pressure tuning: harder is sharper, by ½·ΔT/T, most in the slack bass and the short treble', () => {
  for (const k of [36, 60, 84]) {
    const c = M.course(k, P()), s = c.strings[0], g = 1 / c.L + 1 / c.a;
    const T = (F) => { const z = M.restHeight(k, P(), F); return s.T0 + (s.EA / c.l) * 0.5 * z * z * g; };
    for (const F of [0.4, 1.6]) {
      const expect = 600 * Math.log2(T(F) / T(0.8)); // f ∝ √T (the wire's own stiffness changes nothing here)
      near(M.cents(k, P(), F), expect, 0.02, `${k} at ${F} N`);
    }
    assert.ok(M.cents(k, P(), 1.6) > 1 && M.cents(k, P(), 0.4) < -0.5, `${k}: ${M.cents(k, P(), 1.6)} ¢`);
  }
  assert.ok(M.cents(36, P(), 1.6) > M.cents(60, P(), 1.6) && M.cents(84, P(), 1.6) > M.cents(60, P(), 1.6), 'the tenor least');
});
test('the listing\'s damping of a partial: σ∞ times the share of its energy in the cloth, 1 − sin(2βw)/2βw', () => {
  const l = 0.8, w = 0.07;
  for (const j of [1, 3, 10]) {
    const b = (j * PI) / l, share = quad((X) => Math.sin(b * X) ** 2, l - w, l) / quad((X) => Math.sin(b * X) ** 2, 0, l);
    near(M.listingSigma(b, w, 1) / 400, (share * l) / w, 1e-6, `j = ${j}`);
  }
  near(M.listingSigma(PI / 0.3, 0.05, 2) / M.listingSigma(PI / 0.3, 0.05, 1), 2, 1e-9, 'scales with the cloth');
});
test('projections: ∫ sin·sin and ∫ line·sin in closed form agree with quadrature (incl. a = b)', () => {
  for (const [a, ph, b, ps, x0, x1] of [[3, 0, 5, 0.3, 0.1, 0.7], [7, -1, 7, 0, 0, 0.45], [2, 0.4, 11, -0.6, 0.2, 0.9]]) {
    near(M.sinSin(a, ph, b, ps, x0, x1), quad((X) => Math.sin(a * X + ph) * Math.sin(b * X + ps), x0, x1), 1e-9, `${a},${b}`);
    near(M.linSin(0.7, -0.2, b, ps, x0, x1), quad((X) => (0.7 * X - 0.2) * Math.sin(b * X + ps), x0, x1), 1e-9, `line on ${b}`);
  }
});
test('the soundboard: plate modes from a few hundred hertz, its admittance positive (it only takes energy)', () => {
  const b = M.boardModes();
  assert.ok(b[0].f > 150 && b[0].f < 400, `first mode ${b[0].f}`);
  for (const f of [50, 200, 500, 1000, 3000, 8000]) for (const k of [36, 60, 84]) assert.ok(M.admittance(k, f).re > 0, `${k} at ${f}`);
});

console.log('engine');
test('in tune across the compass at the default touch (within 2 ¢), the tangent\'s give tuned out', () => {
  for (const k of [KEY_LO, 36, 43, 48, 55, 60, 67, 72, 79, 84, KEY_HI]) {
    const f = keyFreq(k), { L } = hold(k, 0.6, 1.2, P({ detune: 0 })), got = peakFreq(L, 0.4 * FS, 1.2 * FS, f);
    assert.ok(Math.abs(cents(got, f)) < 2, `${k}: ${cents(got, f).toFixed(2)} ¢`);
  }
});
test('the keyboard\'s tuning: A = 415 Hz and ¼-comma meantone move the notes by their cents', () => {
  for (const [k, o, c] of [[69, { pitch: 415 }, cents(415, 440)], [64, { temperament: 'meantone' }, -3.42], [60, { temperament: 'meantone' }, 10.26]]) {
    const f = keyFreq(k) * 2 ** (c / 1200), { L } = hold(k, 0.6, 1.2, P({ detune: 0, ...o }));
    assert.ok(Math.abs(cents(peakFreq(L, 0.4 * FS, 1.2 * FS, f), f)) < 1, `${k}`);
  }
});
test('the tangent settles where the model says, and stays on the strings while the key is down', () => {
  for (const k of [36, 60, 84]) {
    const { e } = hold(k, 0.6, 0.6), v = e.voices[0];
    assert.equal(v.phase, 'held');
    near(v.z / M.restHeight(k, P(), DEFAULTS.press), 1, 0.01, `${k}: tangent height`);
    near(v.T / M.course(k, P()).strings[0].Tnom, 1, 1e-4, `${k}: tension`);
  }
});
test('pressing harder sounds sharper, as the model says (within 1.5 ¢), and lighter flatter', () => {
  for (const [k, press] of [[48, 2], [60, 0.35], [72, 2], [84, 0.35]]) {
    const f = keyFreq(k) * 2 ** (M.cents(k, P(), press) / 1200), { L } = hold(k, 0.6, 1.2, P({ detune: 0, press }));
    const got = cents(peakFreq(L, 0.4 * FS, 1.2 * FS, keyFreq(k)), keyFreq(k));
    near(got, M.cents(k, P(), press), 1.5, `${k} at ${press} N`);
    assert.ok(press > 1 ? got > 2 : got < -1, `${k}: ${got.toFixed(2)} ¢`);
  }
});
test('aftertouch presses the key harder: sharper, up to the key bed', () => {
  const pitch = (pr) => cents(peakFreq(run(P({ detune: 0 }), [[0, 'on', 72, 0.6], [0.05, 'pressure', pr, 72]], 1.2).L, 0.4 * FS, 1.2 * FS, keyFreq(72)), keyFreq(72));
  const a = pitch(0), b = pitch(0.3), c = pitch(1);
  assert.ok(b > a + 2 && c > b, `${a.toFixed(2)}, ${b.toFixed(2)}, ${c.toFixed(2)} ¢`);
  const { e } = run(P(), [[0, 'on', 72, 0.6], [0.05, 'pressure', 1, -1]], 0.6); // channel pressure too
  assert.ok(e.voices[0].z > M.restHeight(72, P(), 0.8) * 1.3, 'channel pressure lifts the tangent');
});
test('Bebung: the pitch wavers at its rate, with the depth the wheel gives', () => {
  const rate = 5, track = (beb) => {
    const ts = [];
    run(P({ bebung: beb, rate }), [[0, 'on', 72, 0.6]], 2, { hook: (e, s) => { if (s > 0.6 * FS) ts.push(e.voices[0].T); } });
    return ts;
  };
  const still = track(0), shaky = track(0.6);
  const spread = (ts) => 600 * Math.log2(Math.max(...ts) / Math.min(...ts));
  assert.ok(spread(still) < 0.05, `no Bebung: ${spread(still)} ¢`);
  assert.ok(spread(shaky) > 3, `Bebung: ${spread(shaky).toFixed(2)} ¢ peak to peak`);
  // its period, from the tension's upward crossings of its mean
  const m = shaky.reduce((a, b) => a + b, 0) / shaky.length, ups = [];
  for (let i = 1; i < shaky.length; i++) if (shaky[i - 1] < m && shaky[i] >= m) ups.push(i);
  const period = ((ups.at(-1) - ups[0]) / (ups.length - 1)) * (128 / FS);
  near(period, 1 / rate, 0.01, 'period (s)');
  // MPE's slide gives one note its own
  const own = [];
  run(P(), [[0, 'slide', 0.6, 72], [0, 'on', 72, 0.6]], 1.5, { hook: (e, s) => { if (s > 0.6 * FS) own.push(e.voices[0].T); } });
  assert.ok(spread(own) > 3, `slide: ${spread(own)}`);
});
test('a heavier key and finger push the strings further: the note starts sharper and settles', () => {
  const over = (mass) => { let mx = 0; const { e } = run(P({ mass }), [[0, 'on', 60, 0.9]], 0.4, { hook: (e) => { mx = Math.max(mx, e.voices[0].T); } }); return [mx / e.voices[0].T, e.voices[0].T]; };
  const [light, Tl] = over(6), [heavy, Th] = over(36);
  assert.ok(heavy > light && heavy > 1.002, `peak tension ×${light.toFixed(4)} (6 g), ×${heavy.toFixed(4)} (36 g)`);
  near(Th / Tl, 1, 1e-3, 'both settle at the same tension');
});
test('velocity: the brass tangent starts every partial at once; faster is louder and brighter', () => {
  // measured at the strings' own partials (stiffness stretches them above n·f)
  const k = 48, fp = M.partials(k, 0, P()).map((m) => m.f), at = (v) => hold(k, v, 0.5).L;
  const soft = at(0.2), hard = at(0.9);
  const lo = (x) => tone(x, fp[0], 0.02 * FS, 0.3 * FS), hi = (x) => tone(x, fp[7], 0.02 * FS, 0.3 * FS) + tone(x, fp[8], 0.02 * FS, 0.3 * FS);
  assert.ok(dB(rms(hard, 0, 0.3 * FS) / rms(soft, 0, 0.3 * FS)) > 8, 'louder');
  assert.ok(hi(hard) / lo(hard) > 1.2 * (hi(soft) / lo(soft)), 'brighter');
  assert.ok(hi(soft) > 0.01 * lo(soft), 'even a soft stroke has its upper partials');
});
test('the note holds while the key does, and the listing stops the string within a fraction of a second of the release', () => {
  const k = 60, { L, e } = run(P(), [[0, 'on', k, 0.6], [1.5, 'off', k]], 2.4);
  const held = rms(L, 1.3 * FS, 1.5 * FS), after = rms(L, 1.9 * FS, 2.1 * FS);
  assert.ok(held > 1e-3 * rms(L, 0, 0.2 * FS), 'still sounding after 1.3 s');
  assert.ok(dB(after / held) < -40, `0.4 s after the release: ${dB(after / held).toFixed(1)} dB`);
  assert.equal(e.voiceCount(), 0, 'and the voice is gone');
  // the release itself is a soft knock, well under the stroke
  assert.ok(peakOf(L, 1.5 * FS, 1.6 * FS) < 0.5 * peakOf(L, 0, 0.1 * FS), 'release under the stroke');
});
test('without the listing the afterlength rings, and the release takes far longer', () => {
  const k = 60, ev = [[0, 'on', k, 0.6], [1, 'off', k]];
  const wet = run(P(), ev, 1.6).L, bare = run(P({ listing: 0.03 }), ev, 1.6).L;
  assert.ok(dB(rms(bare, 1.3 * FS, 1.5 * FS) / rms(wet, 1.3 * FS, 1.5 * FS)) > 20, 'release');
  // the afterlength's own pitch, c/2a, sounds along with the note while it is held
  const c = M.course(k, P()), fa = M.partials(k, 0, P({ listing: 0.03 }), 'after')[0].f;
  assert.ok(Math.abs(fa - Math.sqrt(c.strings[0].Tnom / c.strings[0].mu) / (2 * c.a)) / fa < 0.01, 'afterlength pitch');
  const near0 = (x) => tone(x, fa, 0.05 * FS, 0.5 * FS) / tone(x, fa * 1.07, 0.05 * FS, 0.5 * FS);
  assert.ok(near0(bare) > 3 * near0(wet), `afterlength line: ${near0(bare).toFixed(1)} vs ${near0(wet).toFixed(1)}`);
});
test('fretted: the upper key of a pair stops the lower note and sounds its own; let it go and the lower speaks again', () => {
  const fr = P({ fretting: 'fretted', detune: 0 }), f0 = keyFreq(60), f1 = keyFreq(61);
  const { L } = run(fr, [[0, 'on', 60, 0.6], [0.6, 'on', 61, 0.6], [1.6, 'off', 61]], 2.6);
  assert.ok(tone(L, f0, 0.1 * FS, 0.6 * FS) > 30 * tone(L, f1, 0.1 * FS, 0.6 * FS), 'C4 first');
  assert.ok(tone(L, f1, 0.8 * FS, 1.6 * FS) > 100 * tone(L, f0, 0.8 * FS, 1.6 * FS), 'C♯4 alone once its tangent is down');
  assert.ok(Math.abs(cents(peakFreq(L, 0.8 * FS, 1.6 * FS, f1), f1)) < 2, 'C♯4 in tune on the shared string');
  assert.ok(tone(L, f0, 1.7 * FS, 2.6 * FS) > 30 * tone(L, f1, 1.7 * FS, 2.6 * FS), 'C4 again');
  // unfretted, both sound together
  const both = run(P({ detune: 0 }), [[0, 'on', 60, 0.6], [0.6, 'on', 61, 0.6]], 1.6).L;
  assert.ok(tone(both, f0, 0.8 * FS, 1.6 * FS) > 0.2 * tone(both, f1, 0.8 * FS, 1.6 * FS), 'unfretted: C4 rings on');
  // D and A are free: D–E♭ sound together even fretted
  const de = run(fr, [[0, 'on', 62, 0.6], [0.3, 'on', 63, 0.6]], 1).L;
  assert.ok(tone(de, keyFreq(62), 0.4 * FS, FS) > 0.2 * tone(de, keyFreq(63), 0.4 * FS, FS), 'D4 with E♭4');
});
test('4′ strings in the bass: the octave (2nd partial) grows; none above e', () => {
  const k = 36, f = keyFreq(k), ratio = (o) => { const { L } = hold(k, 0.6, 0.8, P({ octave: o, detune: 0 })); return tone(L, 2 * f, 0.1 * FS, 0.8 * FS) / tone(L, f, 0.1 * FS, 0.8 * FS); };
  assert.ok(ratio(true) > 1.5 * ratio(false), `${ratio(true).toFixed(2)} vs ${ratio(false).toFixed(2)}`);
  assert.equal(M.course(36, P({ octave: true })).strings.length, 3);
  assert.equal(M.course(M.OCTAVE_TOP + 1, P({ octave: true })).strings.length, 2);
  near(M.course(36, P({ octave: true })).strings[2].f0 / M.course(36, P({ octave: true })).strings[0].f0, 2, 0.01, 'an octave up');
});
test('the pair: two strings, the detune apart', () => {
  const c = M.course(60, P({ detune: 4 }));
  assert.equal(c.strings.length, 2);
  const d = cents(c.strings[0].f0, c.strings[1].f0);
  assert.ok(d > 2 && d < 6.5, `${d}`);
  near(cents(M.course(60, P({ detune: 0 })).strings[0].f0, M.course(60, P({ detune: 0 })).strings[1].f0), 0, 1e-9, 'none');
});
test('without the soundboard: the bridge force, still the note, its board resonances gone', () => {
  const k = 60, f = keyFreq(k), on = hold(k, 0.6, 0.8).L, off = hold(k, 0.6, 0.8, P({ soundboard: false })).L;
  assert.ok(rms(off, 0, 0.8 * FS) > 0.1 * rms(on, 0, 0.8 * FS), 'audible');
  assert.ok(Math.abs(cents(peakFreq(off, 0.3 * FS, 0.8 * FS, f), f)) < 2, 'on pitch');
});
test('every key from A0 to C8 plays, with no NaN; in tune (within 3 ¢) from FF up', () => {
  for (let k = 21; k <= 108; k += 3) {
    // the deep bass over a longer window, to resolve its fundamental from the 2nd partial's leakage
    const f = keyFreq(k), sec = k < 36 ? 2 : 0.7, { L } = hold(k, 0.6, sec, P({ detune: 0 }));
    assert.ok(L.every(Number.isFinite), `${k}: NaN`);
    assert.ok(rms(L, 0.1 * FS, sec * FS) > 1e-4, `${k}: sounds (${rms(L, 0.1 * FS, sec * FS).toExponential(1)})`);
    // below FF the tangent's give takes the fundamental (the tangent bounces on the strings near it)
    if (k < KEY_LO) continue;
    const c = cents(peakFreq(L, 0.2 * FS, sec * FS, f), f);
    assert.ok(Math.abs(c) < 3, `${k}: ${c.toFixed(2)} ¢`);
  }
});
test('output level is sane: a note peaks 0.02–0.6, a ten-note chord under 1', () => {
  let pk = 0;
  for (const k of [29, 41, 53, 60, 72, 84, 89]) pk = Math.max(pk, peakOf(hold(k, 1, 0.3).L));
  assert.ok(pk > 0.02 && pk < 0.6, `peak ${pk}`);
  const chord = run(P(), [36, 43, 48, 52, 55, 60, 64, 67, 72, 76].map((k) => [0, 'on', k, 1]), 0.5);
  assert.ok(peakOf(chord.L) < 1 && peakOf(chord.R) < 1, `chord ${peakOf(chord.L)}`);
});
test('every preset plays', () => {
  for (const pr of PRESETS) {
    const { L } = hold(60, 0.7, 0.4, P(pr.p));
    assert.ok(L.every(Number.isFinite) && rms(L, 0, L.length) > 1e-4, pr.name);
  }
});
test('CPU: ten held bass notes render faster than 3× real time', () => {
  const t0 = performance.now();
  run(P(), [29, 31, 33, 34, 36, 38, 40, 41, 43, 45].map((k) => [0, 'on', k, 0.7]), 2);
  const ms = performance.now() - t0;
  assert.ok(ms < 2000 / 3, `${ms.toFixed(0)} ms for 2 s`);
});

// What the Quality setting trims (README): fewer courses at once, fewer partials, counted.
test('Quality: Medium and Low sound fewer courses at once and fewer partials; a note keeps its pitch and level', () => {
  for (const [quality, cap] of [['high', 20], ['medium', 14], ['low', 9]]) {
    const { e } = run(P(), Array.from({ length: 24 }, (_, i) => [0.02 * i, 'on', 36 + 2 * i, 0.6]), 1, { quality });
    assert.equal(e.voices.filter((v) => v.fade === 1).length, cap, `${quality}: courses`);
  }
  const N = (quality) => hold(36, 0.6, 0.05, P(), { quality }).e.voices[0].N;
  assert.ok(N('high') === 96 && N('medium') <= 48 && N('low') <= 28, `${N('high')}, ${N('medium')}, ${N('low')}`);
  for (const k of [36, 60, 84]) {
    const f = keyFreq(k), hi = hold(k, 0.6, 0.8).L;
    for (const quality of ['medium', 'low']) {
      const x = hold(k, 0.6, 0.8, P(), { quality }).L, c = cents(peakFreq(x, 0.2 * FS, 0.8 * FS, f), peakFreq(hi, 0.2 * FS, 0.8 * FS, f)), d = dB(rms(x, 0, x.length) / rms(hi, 0, hi.length));
      assert.ok(Math.abs(c) < 0.2 && Math.abs(d) < 1.5, `key ${k} at ${quality}: ${c.toFixed(3)} ¢, ${d.toFixed(2)} dB`);
    }
  }
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
