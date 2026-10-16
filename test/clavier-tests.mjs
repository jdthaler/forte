// Tangent clavier checks. Run: node test/clavier-tests.mjs
//
// First the model against independent physics (a finite-difference string,
// the full-length string, circuit algebra, measured values from a D6), then
// the engine against the model (pitch, sawtooth, pressure, tension
// modulation, mute, release, pickups), then level, stability and CPU.

import assert from 'node:assert/strict';
import {
  stringDesign, speakingFreq, gauge, releasedFreqs, pickupWeight, pickupX, pickupMix,
  toneAnalog, toneResponse, toneBiquad, TONE_NET, PICKUP_R, MEASURED_B, STEEL, NONSPEAK, duffingShift,
  pressureCents, sigma1, tensionCents, LO, HI, MUTE_R,
} from '../clavier/src/clavier-model.js';
import { INSTRUMENT } from '../clavier/src/clavier-instrument.js';
import { loadEngine } from '../tools/engine.mjs';
import { DEFAULTS, GROUPS, PRESETS } from '../clavier/src/clavier-params.js';
import { symEig } from '../shared/linalg.js';
import { keyFreq } from '../shared/dsp.js';

const ClavierEngine = await loadEngine(INSTRUMENT); // JavaScript, or WebAssembly with FORTE_ENGINE=wasm

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
    assert.ok(S.stress < 0.65 * STEEL.strength && S.T > 0, `key ${k}: ${(S.stress / 1e6).toFixed(0)} MPa`);
    assert.equal(gauge(k).wound, k <= 51); // first 23 strings wound (F1–D♯3)
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
    const S = stringDesign(key, DEFAULTS), f1 = fd(S, 99), f2 = fd(S, 199);
    for (const m of [1, 2, 5, 10]) {
      const f = (4 * f2[m - 1] - f1[m - 1]) / 3;
      assert.ok(Math.abs(cents(f, speakingFreq(m, S))) < 0.2, `key ${key} mode ${m}: FD ${f.toFixed(3)} vs ${speakingFreq(m, S).toFixed(3)} Hz`);
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
  }
  assert.ok(Math.abs(NONSPEAK - (2 ** 0.25 - 1)) < 1e-12);
});

test('tone tabs: the one-biquad formula equals the parallel networks, for all 15 combinations', () => {
  const tabs = Object.keys(TONE_NET);
  for (let mask = 1; mask < 16; mask++) {
    const Q = {}; tabs.forEach((t, i) => { Q[t] = !!(mask & (1 << i)); });
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
  const tre = { treble: true }, bri = { brilliant: true };
  assert.ok(Math.abs(toneResponse(1 / (2 * Math.PI * Math.sqrt(2 * 4.7e-9)), tre) - 1) < 1e-9);
  assert.ok(Math.abs(toneResponse(PICKUP_R / (2 * Math.PI * 0.6), bri) - Math.SQRT1_2) < 1e-9);
  assert.equal(toneAnalog({}).any, false);
  // the digital filter follows the analogue one below 6 kHz
  const q = toneBiquad({ medium: true, treble: true }, FS);
  for (const f of [100, 500, 1000, 3000, 6000]) {
    const w = (2 * Math.PI * f) / FS, zr = Math.cos(w), zi = -Math.sin(w), z2r = Math.cos(2 * w), z2i = -Math.sin(2 * w);
    const nr = q.b0 + q.b1 * zr + q.b2 * z2r, ni = q.b1 * zi + q.b2 * z2i, dr = 1 + q.a1 * zr + q.a2 * z2r, di = q.a1 * zi + q.a2 * z2i;
    const Hd = Math.hypot(nr, ni) / Math.hypot(dr, di), Ha = toneResponse(f, { medium: true, treble: true });
    assert.ok(Math.abs(20 * Math.log10(Hd / Ha)) < 0.6, `${f} Hz: ${(20 * Math.log10(Hd / Ha)).toFixed(2)} dB`);
  }
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
  const S = stringDesign(29, DEFAULTS), x = note(29, P({ kc: false }), 0.6, 1.2);
  for (const n of [2, 4, 8, 12]) {
    const fm = speakingFreq(n, S), f = peakFreq(x, fm, sec(0.3), sec(1.2), 20);
    assert.ok(Math.abs(cents(f, fm)) < 1, `partial ${n}: ${cents(f, fm).toFixed(2)} ¢ off; harmonic would be ${cents(n * S.f0, fm).toFixed(1)} ¢`);
  }
});

test('held fundamental decays at the model rate (T60 from the sustain setting)', () => {
  const Q = P({ t60: 6 }), k = 45, f0 = keyFreq(k), x = note(k, Q, 0.5, 2.2), W = sec(0.4);
  const db = 20 * Math.log10(tone(x, f0, sec(1.8), sec(1.8) + W) / tone(x, f0, sec(0.4), sec(0.4) + W));
  const want = -20 * Math.log10(Math.E) * sigma1(f0, Q) * 1.4;
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
  const A = 2e-3, sg = sigma1(S.f0, Q), t0 = (sec(0.05) - (sec(0.05) % 128)) / FS;
  let ms = 0; for (let t = 0.1; t < 0.6; t += 0.001) ms += Math.exp(-2 * sg * (t - t0)) * (0.5 - 0.5 * Math.cos((2 * Math.PI * (t - 0.1)) / 0.5)) / 250;
  const dc = cents(run(A), run(1e-5)), want = 1200 * Math.log2(1 + duffingShift(S, 1, A * Math.sqrt(ms)));
  assert.ok(Math.abs(dc - want) < 0.15 * want, `${dc.toFixed(2)} ¢ vs Duffing ${want.toFixed(2)} ¢`);
});

test('mute felt: weak felt adds the first-order damping R sin²(kx)/μL to the fundamental', () => {
  const key = 57, S = stringDesign(key, DEFAULTS), f0 = keyFreq(key), W = sec(0.25);
  const dec = (o) => { const x = note(key, P({ t60: 30, ...o }), 0.4, 1.0); return Math.log(tone(x, f0, sec(0.2), sec(0.2) + W) / tone(x, f0, sec(0.7), sec(0.7) + W)) / 0.5; };
  const m = 0.1, xm = 15, R = MUTE_R * m, phi = Math.sin((Math.PI * xm * 1e-3) / S.L);
  const want = (R * phi * phi) / (S.mu * S.L), got = dec({ muteOn: true, mute: m, muteX: xm }) - dec({});
  assert.ok(Math.abs(got - want) < 0.12 * want, `Δσ = ${got.toFixed(2)} s⁻¹ vs ${want.toFixed(2)} s⁻¹`);
  // a full mute kills the twang: the 5th partial falls 30 dB below the open string's within 0.3 s
  const open = note(key, P(), 0.7, 0.4), muted = note(key, P({ muteOn: true, mute: 1 }), 0.7, 0.4);
  const p5 = (x) => tone(x, speakingFreq(5, S), sec(0.25), sec(0.4)) / tone(x, f0, sec(0.25), sec(0.4));
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
  const key = 40, S = stringDesign(key, DEFAULTS), X = pickupX(key, DEFAULTS);
  const wl = pickupWeight(1, X.lower, S.L), wu = pickupWeight(1, X.upper, S.L);
  const f1 = (sel) => tone(note(key, P({ pickup: sel, field: 10 }), 0.5, 0.5), S.f0, sec(0.1), sec(0.5));
  const got = 20 * Math.log10(f1('diff') / f1('sum')), want = 20 * Math.log10(Math.abs(wl - wu) / Math.abs(wl + wu));
  assert.ok(Math.abs(got - want) < 1, `${got.toFixed(2)} dB vs ${want.toFixed(2)} dB`);
  // lower pickup on the 5th partial's node: that partial vanishes
  const xl = S.L / 5, x = note(key, P({ pickup: 'lower', xLower: xl * 100 - (60 - key) * 0.1525, field: 10 }), 0.6, 0.5);
  const a = (n) => tone(x, speakingFreq(n, S), sec(0.1), sec(0.5));
  assert.ok(20 * Math.log10(a(5) / Math.min(a(4), a(6))) < -25, `5th ${a(5).toExponential(2)} vs ${a(4).toExponential(2)}, ${a(6).toExponential(2)}`);
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
  for (const p of GROUPS.flatMap((g) => g.params)) {
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
