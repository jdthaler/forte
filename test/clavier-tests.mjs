// Tangent clavier checks. Run: node test/clavier-tests.mjs
//
// First the model against independent physics (a finite-difference string,
// the full-length string, circuit algebra, measured values from a D6), then
// the engine against the model (pitch, sawtooth, pressure, tension
// modulation, mute, release, pickups, tone filter), then level, stability and
// CPU. Both are the C++ (native/instruments/clavier), built as WebAssembly: the
// model through clavier-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT } from '../clavier/src/clavier-instrument.js';
import { wasmModel } from '../clavier/src/clavier-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { DEFAULTS, GROUPS, PRESETS, LO, HI, KEY_MIN, KEY_MAX, STRENGTH, MUTE_R } from '../clavier/src/clavier-params.js';
import { symEig } from '../shared/linalg.js';
import { keyFreq } from '../shared/dsp.js';

const ClavierEngine = await loadEngine(INSTRUMENT);
const { stringDesign, keyModel, releasedFreqs, pickupWeight, pickupX, pickupMix, pressureCents, toneResponse } = await wasmModel();

// What the checks compare against, stated here rather than read from the model:
// the inharmonicity measured on a D6, and its tone networks and pickup source resistance
// (Gabrielli et al. 2013, Table 1 and Table 3).
const MEASURED_B = [[29, 5e-4], [34, 2e-4], [50, 9e-5], [51, 1e-4], [78, 9e-5], [88, 8e-5]];
const TABS = ['soft', 'medium', 'treble', 'brilliant'], PICKUP_R = 1e4;
// A pinned stiff string's pitch for a tension change dT: f ∝ √(T + π²EI/L²).
const tensionCents = (S, dT) => 600 * Math.log2((S.T + dT + (Math.PI ** 2 * S.EI) / (S.L * S.L)) / (S.T + (Math.PI ** 2 * S.EI) / (S.L * S.L)));
// Kirchhoff–Carrier for one mode of amplitude A: a Duffing oscillator, Δω/ω = 3 EA k² A² / 32 T.
const duffingShift = (S, n, A) => { const k = (n * Math.PI) / S.L; return (3 * S.EA * k * k * A * A) / (32 * S.T); };

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  const t0 = performance.now();
  try { fn(); console.log('  ok  ', name, `(${((performance.now() - t0) / 1000).toFixed(1)} s)`); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);

// Run an engine through events, in 128-sample blocks like the AudioWorklet.
// events: [t, 'on', key, vel] | [t, 'off', key] | [t, 'msg', {...}] | [t, 'sus', bool] | [t, 'params', P]
function render(params, sec, events, setup) {
  const e = new ClavierEngine(FS);
  e.setParams(params);
  const n = Math.round(sec * FS), out = new Float64Array(n), bl = 128, L = new Float32Array(bl), R = new Float32Array(bl);
  const ev = events.map(([t, ...r]) => [Math.round(t * FS), ...r]).sort((a, b) => a[0] - b[0]);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j][0] <= s) {
      const [, type, a, b] = ev[j++];
      if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a); else if (type === 'sus') e.setSustain(a); else if (type === 'params') e.setParams(a); else e.handle(a);
    }
    if (setup) setup(e, s);
    e.process(L, R, bl);
    out.set(L.subarray(0, Math.min(bl, n - s)), s);
  }
  out.engine = e;
  return out;
}
const note = (key, params, vel, sec, setup) => render(params, sec, [[0, 'on', key, vel]], setup);
// Amplitude at f in x[a, b) (Hann-windowed Goertzel), and a peak search around f.
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return (4 * Math.hypot(re, im)) / (b - a);
}
function peakFreq(x, f, a, b, span = 40) {
  let best = f, bv = -1;
  for (let i = -24; i <= 24; i++) { const g = f * 2 ** ((span * i) / 24 / 1200); const v = tone(x, g, a, b); if (v > bv) { bv = v; best = g; } }
  let lo = best * 2 ** (-span / 24 / 1200), hi = best * 2 ** (span / 24 / 1200);
  for (let i = 0; i < 30; i++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (tone(x, m1, a, b) < tone(x, m2, a, b)) lo = m1; else hi = m2; }
  return (lo + hi) / 2;
}
const sec = (t) => Math.round(t * FS);

console.log('physics');

test('scale: inharmonicity within ×2 of a measured D6, and no string above 65 % of its breaking stress', () => {
  for (const [key, B] of MEASURED_B) {
    const S = stringDesign(key, DEFAULTS);
    assert.ok(S.B / B > 0.5 && S.B / B < 2, `key ${key}: B = ${S.B.toExponential(2)}, measured ${B.toExponential(1)}`);
  }
  for (let k = LO; k <= HI; k++) {
    const S = stringDesign(k, DEFAULTS);
    assert.ok(S.stress < 0.65 * STRENGTH && S.T > 0, `key ${k}: ${(S.stress / 1e6).toFixed(0)} MPa`);
    assert.equal(S.wound, k <= 51); // first 23 strings wound (F1–D♯3)
  }
});

test('stiff string: the partials match a finite-difference solve of μü = T u″ − EI u⁗ (pinned), Richardson-extrapolated', () => {
  // the FD matrix knows nothing of sines or of the closed form; its O(h²) error is removed by two grids
  const fd = (S, n) => {
    const h = S.L / (n + 1), a = S.T / (h * h), b = S.EI / h ** 4, V = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) {
      // pinned ends (u = u″ = 0): the ghost point beyond each end mirrors with a sign flip
      const add = (j, v) => { if (j >= 0 && j < n) V[i][j] += v; else if (j === -2) V[i][0] -= v; else if (j === n + 1) V[i][n - 1] -= v; };
      add(i, 2 * a + 6 * b); add(i - 1, -a - 4 * b); add(i + 1, -a - 4 * b); add(i - 2, b); add(i + 2, b);
    }
    return Array.from(symEig(V, n)).sort((x, y) => x - y).map((l) => Math.sqrt(l / S.mu) / (2 * Math.PI));
  };
  for (const key of [29, 45, 69]) {
    const { S, modes } = keyModel(key, DEFAULTS, FS), f1 = fd(S, 99), f2 = fd(S, 199);
    for (const m of [1, 2, 5, 10]) {
      const f = (4 * f2[m - 1] - f1[m - 1]) / 3, fm = modes[m - 1].f;
      assert.ok(Math.abs(cents(f, fm)) < 0.2, `key ${key} mode ${m}: FD ${f.toFixed(3)} vs ${fm.toFixed(3)} Hz`);
    }
  }
});

test('released string: the coupled component modes give the full-length pitch, 3 semitones down', () => {
  for (const key of [29, 46, 64, 84]) {
    const S = stringDesign(key, DEFAULTS), f = releasedFreqs(key, DEFAULTS, 2);
    // full length L + Ln at the rest tension T0, with stiffness: the textbook pinned stiff string
    const Lt = S.L + S.Ln, k = Math.PI / Lt, ideal = Math.sqrt((S.T0 * k * k + S.EI * k ** 4) / S.mu) / (2 * Math.PI);
    assert.ok(Math.abs(cents(f[0], ideal)) < 8, `key ${key}: ${f[0].toFixed(2)} Hz vs full string ${ideal.toFixed(2)} Hz`);
    assert.ok(Math.abs(cents(ideal, S.f0) + 300 + cents(S.T, S.T0) / 2) < 6, `key ${key}: ${cents(ideal, S.f0).toFixed(1)} ¢`);
    assert.ok(Math.abs(S.Ln / S.L - (2 ** 0.25 - 1)) < 1e-12); // the nonspeaking length: 3 semitones
  }
});

test('tone tabs: the one-biquad formula equals the parallel networks, for all 15 combinations', () => {
  for (let mask = 1; mask < 16; mask++) {
    const Q = P(); TABS.forEach((t, i) => { Q[t] = !!(mask & (1 << i)); });
    for (const f of [50, 300, 1000, 1641, 4000, 12000]) {
      const w = 2 * Math.PI * f;
      // complex admittance of the selected networks, H = 1/(1 + R_p Y)
      let yr = 0, yi = 0;
      if (Q.soft) { yr += 1 / 30e3; yi += w * 0.1e-6; }
      if (Q.medium) { yr += 1 / 10e3; yi += w * 15e-9; }
      if (Q.treble) { yi += w * 4.7e-9 - 1 / (w * 2); }
      if (Q.brilliant) { yi += -1 / (w * 0.6); }
      const H = 1 / Math.hypot(1 + PICKUP_R * yr, PICKUP_R * yi);
      assert.ok(Math.abs(toneResponse(f, Q) - H) < 1e-9 * (1 + H), `mask ${mask} @ ${f} Hz`);
    }
  }
  // treble alone: unit-gain band-pass at 1/2π√(LC) = 1.64 kHz; brilliant alone: high-pass, −3 dB at R_p/2πL
  const only = (t) => P(Object.fromEntries(TABS.map((u) => [u, u === t])));
  assert.ok(Math.abs(toneResponse(1 / (2 * Math.PI * Math.sqrt(2 * 4.7e-9)), only('treble')) - 1) < 1e-9);
  assert.ok(Math.abs(toneResponse(PICKUP_R / (2 * Math.PI * 0.6), only('brilliant')) - Math.SQRT1_2) < 1e-9);
  assert.equal(toneResponse(1000, only(null)), 0);
});

test('pickup: a mode with a node over the pole is silent; the pole width averages the high ones', () => {
  const L = 0.5;
  for (const n of [2, 5, 9]) assert.ok(Math.abs(pickupWeight(n, L / n, L)) < 1e-12);
  // the aperture: sin(u)/u, u = nπw/2L
  assert.ok(Math.abs(pickupWeight(1, L / 2, L) - 1) < 1e-3);
  assert.ok(pickupWeight(61, L / 122, L) < 0.75);
  const X = pickupX(60, DEFAULTS);
  assert.ok(X.upper < X.lower && X.lower < 0.5 * stringDesign(60, DEFAULTS).L);
  assert.deepEqual(pickupMix('diff'), [1, -1]);
});

console.log('engine');

test('tuning: every key settles within ±3 ¢ of equal temperament (A440), held at the tuning force', () => {
  let worst = 0, wk = 0;
  for (let k = LO; k <= HI; k++) {
    const x = note(k, P(), 0.3, 2.2), f0 = keyFreq(k);
    const f = peakFreq(x, f0, sec(1.4), sec(2.2));
    const c = cents(f, f0);
    if (Math.abs(c) > Math.abs(worst)) { worst = c; wk = k; }
  }
  assert.ok(Math.abs(worst) < 3, `worst key ${wk}: ${worst.toFixed(2)} ¢`);
  console.log(`        worst ${worst.toFixed(2)} ¢ (key ${wk})`);
});

test('the keyboard\'s tuning: at A = 415 Hz in ¼-comma meantone (root C), C4, E4 and A4 settle within ±3 ¢ of 440·2^((m−69)/12)·415/440, C4 +10.26 ¢ and E4 −3.42 ¢ from equal temperament, A4 on the standard; a key struck again after the tuning changes is restrung to it', () => {
  const T = { pitch: 415, temperament: 'meantone', tuningRoot: 0 }, target = (k, off) => keyFreq(k) * (415 / 440) * 2 ** (off / 1200);
  for (const [k, off] of [[60, 10.26], [64, -3.42], [69, 0]]) {
    const x = note(k, P(T), 0.3, 2.2), f = target(k, off), c = cents(peakFreq(x, f, sec(1.4), sec(2.2)), f);
    assert.ok(Math.abs(c) < 3, `key ${k}: ${c.toFixed(2)} ¢ from its target`);
  }
  const x = render(P(), 2.4, [[0, 'on', 64, 0.3], [0.1, 'params', P(T)], [0.2, 'on', 64, 0.3]]), f = target(64, -3.42), c = cents(peakFreq(x, f, sec(1.6), sec(2.4)), f);
  assert.ok(Math.abs(c) < 3, `struck again: ${c.toFixed(2)} ¢ from its target`);
});

test('past F1–E6 (Full range): the scale carried on, A0 to C8, below 65 % of breaking, pulling well under the key\'s 4 N, on pitch and sounding', () => {
  for (let k = KEY_MIN; k <= KEY_MAX; k++) {
    if (k >= LO && k <= HI) continue;
    const S = stringDesign(k, DEFAULTS); // above E6 a lighter wire (0.008″) keeps the pull down: T ∝ d²
    assert.ok(S.stress < 0.65 * STRENGTH && S.T > 0 && S.pull < 0.8 * 4, `key ${k}: ${(S.stress / 1e6).toFixed(0)} MPa, pull ${S.pull.toFixed(2)} N`);
  }
  // on pitch (the slack bass strings without their tension glide, which is A0's widest: 8 ¢ at mf), and a forte note still sounding at 0.05–0.25 s
  for (const k of [KEY_MIN, 25, 92, 100, 104, KEY_MAX]) {
    const x = note(k, P({ kc: k > HI }), 0.3, 1), f0 = keyFreq(k), c = cents(peakFreq(x, f0, sec(0.2), sec(1)), f0);
    const y = note(k, P(), 1, 0.25);
    let e = 0; for (let i = sec(0.05); i < sec(0.25); i++) e += y[i] ** 2;
    const db = 10 * Math.log10(e / sec(0.2));
    assert.ok(Math.abs(c) < 3 && db > -45, `key ${k}: ${c.toFixed(2)} ¢, ${db.toFixed(1)} dB at 0.05–0.25 s`);
  }
  for (const o of [{}, { gap: 2, press: 20 }, { press: 0.5 }]) for (const k of [KEY_MIN, KEY_MAX]) { // the widest swing, the hardest and lightest key
    const x = note(k, P(o), 1, 0.5);
    let pk = 0; for (const y of x) { assert.ok(Number.isFinite(y), `key ${k} ${JSON.stringify(o)}: NaN`); pk = Math.max(pk, Math.abs(y)); }
    assert.ok(pk < 0.6, `key ${k} ${JSON.stringify(o)}: peak ${pk.toFixed(2)}`);
  }
});

test('the strike leaves a sawtooth: n·|q_n| = 2g/π below the carry-time cutoff', () => {
  const Q = P(), x = note(46, Q, 1, 0.01), v = x.engine.byKey.get(46), g = Q.gap * 1e-3;
  for (const i of [0, 1, 2, 4, 7]) {
    const m = v.mdl.modes[i], w = 2 * Math.PI * m.f, A = Math.hypot(v.q[i], (v.q[i] - v.q1[i]) * FS / w);
    assert.ok(Math.abs((m.n * A) / ((2 * g) / Math.PI) - 1) < 0.08, `mode ${m.n}: n|q| = ${(m.n * A * 1e3).toFixed(3)} mm`);
  }
});

test('velocity: the carry time g/v low-passes the strike, so harder is brighter', () => {
  const hi = (x) => { const f0 = keyFreq(57); let s = 0; for (let n = 12; n <= 30; n++) s += tone(x, n * f0, sec(0.02), sec(0.12)) ** 2; return s; };
  const lo = (x) => tone(x, keyFreq(57), sec(0.02), sec(0.12)) ** 2;
  const soft = note(57, P(), 0.1, 0.13), hard = note(57, P(), 1, 0.13);
  const r = 10 * Math.log10((hi(hard) / lo(hard)) / (hi(soft) / lo(soft)));
  assert.ok(r > 8, `ff/pp high-partial gain ${r.toFixed(1)} dB`);
});

test('partials follow the stiff-string series f_n = n f₁ √((1+Bn²)/(1+B)) (F1, B ≈ 5·10⁻⁴)', () => {
  const { S, modes } = keyModel(29, DEFAULTS, FS), x = note(29, P({ kc: false }), 0.6, 1.2);
  for (const n of [2, 4, 8, 12]) {
    const fm = modes[n - 1].f, want = n * S.f0 * Math.sqrt((1 + S.B * n * n) / (1 + S.B)), f = peakFreq(x, fm, sec(0.3), sec(1.2), 20);
    assert.ok(Math.abs(cents(fm, want)) < 1e-6, `model partial ${n}: ${fm} vs ${want} Hz`);
    assert.ok(Math.abs(cents(f, fm)) < 1, `partial ${n}: ${cents(f, fm).toFixed(2)} ¢ off; harmonic would be ${cents(n * S.f0, fm).toFixed(1)} ¢`);
  }
});

test('held fundamental decays at the model rate (T60 from the sustain setting)', () => {
  const Q = P({ t60: 6 }), k = 45, f0 = keyFreq(k), x = note(k, Q, 0.5, 2.2), W = sec(0.4);
  const db = 20 * Math.log10(tone(x, f0, sec(1.8), sec(1.8) + W) / tone(x, f0, sec(0.4), sec(0.4) + W));
  const want = -20 * Math.log10(Math.E) * keyModel(k, Q, FS).modes[0].sigma * 1.4;
  assert.ok(Math.abs(db - want) < 0.6, `${db.toFixed(2)} dB in 1.4 s; model ${want.toFixed(2)} dB`);
});

test('anvil statics: a held key presses the stud with its force minus the string\'s pull T·g(1/L + 1/Ln)', () => {
  for (const key of [33, 60, 86]) {
    const S = stringDesign(key, DEFAULTS);
    let Fa = 0, c = 0;
    note(key, P({ press: 5 }), 0.5, 0.6, (e, s) => { if (s > sec(0.4)) { Fa += e.byKey.get(key).Fa; c++; } });
    const want = 5 - S.pull;
    assert.ok(Math.abs(Fa / c - want) < 0.05 * want + 0.02, `key ${key}: ${(Fa / c).toFixed(3)} N vs ${want.toFixed(3)} N`);
  }
});

test('key pressure: the pitch rises as ΔT = EA·ΔL/L with the wrap ΔL = δ²/2a (aftertouch and slider agree)', () => {
  for (const key of [40, 60, 84]) {
    const f0 = keyFreq(key), a = sec(0.5), b = sec(1.0);
    const base = peakFreq(note(key, P(), 0.3, 1.0), f0, a, b);
    const hard = peakFreq(note(key, P({ press: 16 }), 0.3, 1.0), f0 * 1.02, a, b, 80);
    const at = peakFreq(render(P(), 1.0, [[0, 'on', key, 0.3], [0.05, 'msg', { type: 'pressure', value: 1, key }]]), f0 * 1.02, a, b, 80);
    const want = pressureCents(key, 16, DEFAULTS);
    console.log(`        key ${key}: +${cents(hard, base).toFixed(1)} ¢ at 16 N (theory ${want.toFixed(1)} ¢)`);
    assert.ok(Math.abs(cents(hard, base) - want) < 0.06 * want + 0.5, `key ${key}: ${cents(hard, base).toFixed(2)} ¢ vs theory ${want.toFixed(2)} ¢`);
    assert.ok(Math.abs(cents(at, hard)) < 0.5, `aftertouch ${cents(at, base).toFixed(2)} ¢`);
    assert.ok(want > 15 && want < 90, `${want.toFixed(1)} ¢ at 16 N`);
  }
});

// A note's own bend (MPE): its key pressed as the wheel would press it, so up to the wheel's 2 semitones.
const noteBend = (key, st) => ({ type: 'noteBend', key, value: 2 ** (st / 12) });
const near = (x, y, tol) => { let d = 0, pk = 0; for (let i = 0; i < x.length; i++) { d = Math.max(d, Math.abs(x[i] - y[i])); pk = Math.max(pk, Math.abs(y[i])); } assert.ok(d < tol * pk, `differs by ${(d / pk).toExponential(2)} of the peak`); };
const same = (x, y, what) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) assert.fail(`${what}: sample ${i} differs`); };

test('a note\'s own bend presses its key as the wheel would (a semitone: half its 12 N), and that key alone', () => {
  for (const [key, other] of [[40, 52], [72, 65]]) {
    const f0 = keyFreq(key), a = sec(0.5), b = sec(1.0);
    for (const st of [1, 2]) { // before the note-on, and while it sounds
      near(render(P(), 1, [[0, 'msg', noteBend(key, st)], [0, 'on', key, 0.3]]), render(P(), 1, [[0, 'msg', { type: 'bend', value: st / 2 }], [0, 'on', key, 0.3]]), 1e-6);
      near(render(P(), 1, [[0, 'on', key, 0.3], [0.3, 'msg', noteBend(key, st)]]), render(P(), 1, [[0, 'on', key, 0.3], [0.3, 'msg', { type: 'bend', value: st / 2 }]]), 1e-6);
    }
    // all the way: the pitch of 16 N, as the key-pressure test measures it against ΔT = EA·ΔL/L
    const base = peakFreq(note(key, P(), 0.3, 1.0), f0, a, b);
    const bent = peakFreq(render(P(), 1, [[0, 'on', key, 0.3], [0.05, 'msg', noteBend(key, 48)]]), f0 * 1.02, a, b, 80);
    const hard = peakFreq(note(key, P({ press: 16 }), 0.3, 1.0), f0 * 1.02, a, b, 80);
    assert.ok(Math.abs(cents(bent, hard)) < 0.5 && cents(bent, base) > 15, `key ${key}: +${cents(bent, base).toFixed(1)} ¢ bent, +${cents(hard, base).toFixed(1)} ¢ at 16 N`);
    // the other key held beside it keeps its pitch: the chord is the bent note and the other one, apart
    const chord = render(P(), 1, [[0, 'on', key, 0.3], [0, 'on', other, 0.3], [0.05, 'msg', noteBend(key, 2)]]);
    const apart = [render(P(), 1, [[0, 'on', key, 0.3], [0.05, 'msg', { type: 'bend', value: 1 }]]), note(other, P(), 0.3, 1)];
    near(chord, chord.map((_, i) => apart[0][i] + apart[1][i]), 1e-5);
  }
});

test('a note\'s own bend down, or back to 1, leaves the output bit-identical; down takes the wheel\'s press off that key', () => {
  const key = 60, ev = [[0, 'on', key, 0.5], [0, 'on', 67, 0.5], [0.3, 'off', 67]];
  same(render(P(), 0.6, [[0, 'msg', noteBend(key, 1.5)], [0, 'msg', noteBend(key, 0)], ...ev, [0.2, 'msg', noteBend(67, 1.5)], [0.2, 'msg', noteBend(67, 0)], [0.25, 'msg', noteBend(key, 0)], [0.1, 'msg', { type: 'bend', value: 0.3 }]]),
    render(P(), 0.6, [...ev, [0.1, 'msg', { type: 'bend', value: 0.3 }]]), 'bent and back');
  same(render(P(), 0.6, [...ev, [0.1, 'msg', noteBend(key, -48)], [0.2, 'msg', noteBend(67, -1)]]), render(P(), 0.6, ev), 'bent down');
  // the wheel at half, the key two semitones down: as if the wheel had left it alone
  const solo = [[0, 'on', key, 0.5]];
  same(render(P(), 0.6, [...solo, [0, 'msg', noteBend(key, -2)], [0.1, 'msg', { type: 'bend', value: 0.5 }]]), render(P(), 0.6, solo), 'the wheel undone');
});

test('stability: ± 48 semitones of each note\'s own bend, swept every block on chords, with the wheel and releases, at 44.1, 48 and 96 kHz', () => {
  for (const fs of [44100, 48000, 96000]) for (const o of [{}, { press: 20, tip: 1, keyMass: 40 }, { press: 0.5, tipLoss: 0.1, kc: true }]) {
    const e = new ClavierEngine(fs);
    e.setParams(P(o));
    const keys = [29, 41, 60, 72, 88], L = new Float32Array(128), R = new Float32Array(128);
    let pk = 0;
    for (let b = 0, n = Math.round(0.6 * fs / 128); b < n; b++) {
      if (b === 0) for (const k of keys) e.noteOn(k, 1);
      if (b === Math.round(n / 2)) { e.noteOff(41); e.noteOn(41, 0.6); e.handle({ type: 'bend', value: 1 }); }
      keys.forEach((k, i) => e.handle(noteBend(k, 48 * Math.sin(b / (3 + i)))));
      e.process(L, R, 128);
      for (const y of L) { assert.ok(Number.isFinite(y), `${fs} Hz ${JSON.stringify(o)}: NaN`); pk = Math.max(pk, Math.abs(y)); }
    }
    assert.ok(pk / 10 ** (P(o).gain / 20) < 1.5, `${fs} Hz ${JSON.stringify(o)}: peak ${pk.toFixed(2)}`);
  }
});

test('tension modulation: one mode of amplitude A shifts by the Duffing value 3EAk²A²/32T', () => {
  const key = 57, S = stringDesign(key, DEFAULTS), Q = P({ t60: 40, hf: 0, kc: true });
  const run = (A) => {
    const x = note(key, Q, 0.3, 1.0, (e, s) => {
      if (s !== sec(0.05) - (sec(0.05) % 128)) return;
      // replace the strike's ringing by mode 1 alone, at amplitude A (the pinch stays put)
      const v = e.byKey.get(key), w = 2 * Math.PI * v.mdl.modes[0].f / FS;
      v.q.fill(0); v.q1.fill(0); v.q[0] = A; v.q1[0] = A * Math.cos(w);
      v.C1 = v.c[0] * A; v.C0 = v.c[0] * A * Math.cos(w); v.Q = v.w[0] * A * A + (v.s * v.s) / S.L;
    });
    return peakFreq(x, S.f0, sec(0.1), sec(0.6), 15);
  };
  // the mode decays a little over the window: use its mean square amplitude there
  const A = 2e-3, sg = keyModel(key, Q, FS).modes[0].sigma, t0 = (sec(0.05) - (sec(0.05) % 128)) / FS;
  let ms = 0; for (let t = 0.1; t < 0.6; t += 0.001) ms += Math.exp(-2 * sg * (t - t0)) * (0.5 - 0.5 * Math.cos((2 * Math.PI * (t - 0.1)) / 0.5)) / 250;
  const dc = cents(run(A), run(1e-5)), want = 1200 * Math.log2(1 + duffingShift(S, 1, A * Math.sqrt(ms)));
  assert.ok(Math.abs(dc - want) < 0.15 * want, `${dc.toFixed(2)} ¢ vs Duffing ${want.toFixed(2)} ¢`);
});

test('mute felt: weak felt adds the first-order damping R sin²(kx)/μL to the fundamental', () => {
  const key = 57, { S, modes } = keyModel(key, DEFAULTS, FS), f0 = keyFreq(key), W = sec(0.25);
  const dec = (o) => { const x = note(key, P({ t60: 30, ...o }), 0.4, 1.0); return Math.log(tone(x, f0, sec(0.2), sec(0.2) + W) / tone(x, f0, sec(0.7), sec(0.7) + W)) / 0.5; };
  const m = 0.1, xm = 15, R = MUTE_R * m, phi = Math.sin((Math.PI * xm * 1e-3) / S.L);
  const want = (R * phi * phi) / (S.mu * S.L), got = dec({ muteOn: true, mute: m, muteX: xm }) - dec({});
  assert.ok(Math.abs(got - want) < 0.12 * want, `Δσ = ${got.toFixed(2)} s⁻¹ vs ${want.toFixed(2)} s⁻¹`);
  // a full mute kills the twang: the 5th partial falls 30 dB below the open string's within 0.3 s
  const open = note(key, P(), 0.7, 0.4), muted = note(key, P({ muteOn: true, mute: 1 }), 0.7, 0.4);
  const p5 = (x) => tone(x, modes[4].f, sec(0.25), sec(0.4)) / tone(x, f0, sec(0.25), sec(0.4));
  assert.ok(20 * Math.log10(p5(muted) / p5(open)) < -30);
});

test('release: the yarn stops the note within 0.2 s; without yarn it rings on at the full-length pitch', () => {
  const key = 46, f0 = keyFreq(key);
  const x = render(P(), 0.9, [[0, 'on', key, 0.7], [0.5, 'off', key]]);
  let pre = 0, post = 0;
  for (let i = sec(0.4); i < sec(0.5); i++) pre = Math.max(pre, Math.abs(x[i]));
  for (let i = sec(0.7); i < sec(0.9); i++) post = Math.max(post, Math.abs(x[i]));
  assert.ok(20 * Math.log10(post / pre) < -40, `${(20 * Math.log10(post / pre)).toFixed(1)} dB`);
  assert.equal(x.engine.voiceCount(), 0);
  const y = render(P({ yarn: 20 }), 1.2, [[0, 'on', key, 0.7], [0.3, 'off', key]]);
  const fr = releasedFreqs(key, P({ yarn: 20 }), 1)[0], f = peakFreq(y, fr, sec(0.45), sec(1.2), 60);
  assert.ok(Math.abs(cents(f, fr)) < 4, `${f.toFixed(2)} Hz vs ${fr.toFixed(2)} Hz`);
  assert.ok(Math.abs(cents(f, f0) + 300) < 25, `${cents(f, f0).toFixed(1)} ¢ below the held pitch`);
  // the open string sits 307–320 ¢ below the held note, not 300 (it relaxes to T₀): what the page shows
  for (const k of [29, 41, 53, 65, 77, 88]) {
    const c = cents(releasedFreqs(k, DEFAULTS, 1)[0], keyFreq(k));
    assert.ok(c < -305 && c > -322, `key ${k}: released ${c.toFixed(1)} ¢`);
  }
});

test('tension glide (Kirchhoff–Carrier) on F1: 14 ¢ sharp at ff, about 9 at mf and 4 at pp, down to ≤ 2 ¢ after 2 s', () => {
  const glide = (vel) => {
    const out = [];
    note(29, P(), vel, 2.0, (e, s) => { if ([sec(0.01), sec(2.0) - 128].some((t) => s === t - (t % 128))) { const v = e.byKey.get(29); out.push(tensionCents(v.S, v.kcGain * (v.Q - (v.s * v.s) / v.S.L))); } });
    return out;
  };
  const ff = glide(1), mf = glide(0.3), pp = glide(0.05);
  assert.ok(ff[0] > 11 && ff[0] < 17, `ff starts ${ff[0].toFixed(1)} ¢`);
  assert.ok(mf[0] > 6 && mf[0] < 11, `mf (0.3) starts ${mf[0].toFixed(1)} ¢`);
  assert.ok(pp[0] > 2 && pp[0] < 6, `pp (0.05) starts ${pp[0].toFixed(1)} ¢`);
  for (const g of [ff, mf, pp]) assert.ok(g[1] < 2, `after 2 s: ${g[1].toFixed(2)} ¢`);
  console.log(`        F1 starts ${ff[0].toFixed(1)} / ${mf[0].toFixed(1)} / ${pp[0].toFixed(1)} ¢ sharp at velocity 1 / 0.3 / 0.05`);
});

test('a held note keeps its pitch when the tip sliders move (the next note gets the new tip)', () => {
  const key = 60, f0 = keyFreq(key);
  for (const [id, val] of [['tip', 0.6], ['tip', 0.05], ['wrap', 1.5], ['wrap', 10]]) {
    const x = render(P(), 2.0, [[0, 'on', key, 0.5], [0.8, 'params', P({ [id]: val })]]);
    const before = peakFreq(x, f0, sec(0.3), sec(0.8), 80), after = peakFreq(x, f0, sec(1.2), sec(2.0), 80);
    assert.ok(Math.abs(cents(after, before)) < 0.5, `${id} → ${val}: ${cents(after, before).toFixed(2)} ¢`);
  }
});

test('the amplifier gain glides: a jump of the knob mid-note leaves no step in the output', () => {
  const Q = P({ soft: true, medium: false, treble: false }); // a smooth (low-passed) signal, where a step would show
  const x = render(Q, 1.4, [[0, 'on', 33, 0.7], [1.0, 'params', { ...Q, gain: 12 }]]);
  const d2 = (a, b) => { let m = 0; for (let i = sec(a) + 2; i < sec(b); i++) m = Math.max(m, Math.abs(x[i] - 2 * x[i - 1] + x[i - 2])); return m; };
  const g = 10 ** (12 / 20), steady = d2(0.7, 1.0);
  assert.ok(d2(0.99, 1.4) < 1.5 * g * steady, `2nd difference ${d2(0.99, 1.4).toExponential(2)} vs ${(g * steady).toExponential(2)} (steady × the new gain)`);
});

test('pickup switches: out of phase, the fundamental drops by the model\'s |W_A − W_B| / |W_A + W_B|', () => {
  const key = 40, { S, modes } = keyModel(key, DEFAULTS, FS), X = pickupX(key, DEFAULTS);
  const wl = pickupWeight(1, X.lower, S.L), wu = pickupWeight(1, X.upper, S.L);
  const f1 = (sel) => tone(note(key, P({ pickup: sel, field: 10 }), 0.5, 0.5), S.f0, sec(0.1), sec(0.5));
  const got = 20 * Math.log10(f1('diff') / f1('sum')), want = 20 * Math.log10(Math.abs(wl - wu) / Math.abs(wl + wu));
  assert.ok(Math.abs(got - want) < 1, `${got.toFixed(2)} dB vs ${want.toFixed(2)} dB`);
  // lower pickup on the 5th partial's node: that partial vanishes
  const xl = S.L / 5, x = note(key, P({ pickup: 'lower', xLower: xl * 100 - (60 - key) * 0.1525, field: 10 }), 0.6, 0.5);
  const a = (n) => tone(x, modes[n - 1].f, sec(0.1), sec(0.5));
  assert.ok(20 * Math.log10(a(5) / Math.min(a(4), a(6))) < -25, `5th ${a(5).toExponential(2)} vs ${a(4).toExponential(2)}, ${a(6).toExponential(2)}`);
});

test('tone tabs in the output: one biquad, the analogue networks bilinear-transformed (prewarped at 1 kHz)', () => {
  // the networks act after the strings, so two settings differ in the output by their two responses alone
  const key = 41, { modes } = keyModel(key, DEFAULTS, FS), Q = P({ kc: false, field: 10 });
  const A = { ...Q, soft: false, medium: true, treble: true, brilliant: false }, B = { ...Q, soft: false, medium: true, treble: false, brilliant: false };
  const xa = note(key, A, 0.7, 0.6), xb = note(key, B, 0.7, 0.6);
  // the bilinear transform maps the digital frequency f to the analogue K·tan(πf/fs)/2π
  const K = (2 * Math.PI * 1000) / Math.tan((Math.PI * 1000) / FS), warp = (f) => (K * Math.tan((Math.PI * f) / FS)) / (2 * Math.PI);
  for (const m of modes.filter((x) => [1, 3, 8, 15, 30, 60].includes(x.n) && x.f < 8000)) {
    const got = 20 * Math.log10(tone(xa, m.f, sec(0.1), sec(0.6)) / tone(xb, m.f, sec(0.1), sec(0.6)));
    const want = 20 * Math.log10(toneResponse(warp(m.f), A) / toneResponse(warp(m.f), B));
    assert.ok(Math.abs(got - want) < 0.1, `partial ${m.n} (${m.f.toFixed(0)} Hz): ${got.toFixed(2)} vs ${want.toFixed(2)} dB`);
    // and the digital filter follows the analogue one below 6 kHz
    if (m.f < 6000) assert.ok(Math.abs(20 * Math.log10(toneResponse(warp(m.f), A) / toneResponse(m.f, A))) < 0.6, `${m.f.toFixed(0)} Hz`);
  }
});

test('level: a forte note peaks at 0.1–0.5 with the default voicing; presets stay below 1', () => {
  let lo = 1, hi = 0;
  for (const k of [29, 41, 53, 60, 72, 88]) {
    const x = note(k, P(), 1, 0.3);
    let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
    lo = Math.min(lo, pk); hi = Math.max(hi, pk);
  }
  assert.ok(lo > 0.1 && hi < 0.5, `peaks ${lo.toFixed(3)}…${hi.toFixed(3)}`);
  for (const pr of PRESETS) {
    const x = render({ ...DEFAULTS, ...pr.p }, 0.4, [[0, 'on', 36, 1], [0, 'on', 60, 1], [0, 'on', 84, 1]]);
    let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
    assert.ok(pk > 0.05 && pk < 1, `${pr.name}: ${pk.toFixed(3)}`);
  }
});

test('stability: every parameter at its min and max, with aftertouch, wheel, mute pedal and releases', () => {
  const ev = [[0, 'on', 29, 1], [0.01, 'on', 60, 1], [0.02, 'on', 88, 1], [0.05, 'on', 45, 0.05],
    [0.2, 'msg', { type: 'pressure', value: 1, key: null }], [0.3, 'msg', { type: 'bend', value: 1 }], [0.35, 'sus', true],
    [0.45, 'off', 29], [0.45, 'off', 60], [0.45, 'off', 88], [0.45, 'off', 45], [0.5, 'on', 72, 0.6], [0.55, 'sus', false], [0.6, 'off', 72]];
  for (const p of GROUPS.flatMap((g) => g.params).filter((p) => p.id !== 'fullRange')) {
    const vals = p.type === 'checkbox' ? [false, true] : p.type === 'select' ? p.options.map((o) => o[0]) : [p.min, p.max];
    for (const v of vals) {
      const Q = P({ [p.id]: v }), x = render(Q, 0.9, ev);
      let pk = 0; for (const y of x) { assert.ok(Number.isFinite(y), `${p.id} = ${v}: NaN`); pk = Math.max(pk, Math.abs(y)); }
      assert.ok(pk / 10 ** (Q.gain / 20) < 1.5, `${p.id} = ${v}: peak ${pk.toFixed(2)}`);
    }
  }
});

test('level at the extremes: the gap no longer sets the loudness, and the pickups\' field stays bounded', () => {
  const pk = (o, key) => { const x = note(key, P(o), 1, 0.4); let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p; };
  for (const key of [29, 45]) {
    const base = pk({}, key);
    for (const o of [{ gap: 2 }, { gap: 0.2 }, { gap: 2, field: 0.5 }, { gap: 2, field: 0.5, pickup: 'lower', keyMass: 40, press: 20 }]) {
      const p = pk(o, key);
      assert.ok(p < 0.5 && p > 0.3 * base, `key ${key} ${JSON.stringify(o)}: peak ${p.toFixed(2)} (default ${base.toFixed(2)})`); // were up to 1.4 and 49
    }
  }
});

test('CPU: 10 bass voices (the most modes) render well under real time', () => {
  const keys = [29, 31, 33, 34, 36, 38, 40, 41, 43, 45];
  render(P(), 0.3, keys.map((k) => [0, 'on', k, 0.8])); // warm up the JIT
  const t0 = performance.now();
  render(P(), 2, keys.map((k) => [0, 'on', k, 0.8]));
  const load = (performance.now() - t0) / 2000;
  console.log(`        ${(100 * load).toFixed(1)} % of real time`);
  assert.ok(load < 0.3, `${(100 * load).toFixed(1)} %`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
