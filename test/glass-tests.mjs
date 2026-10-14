// Glass armonica checks. Run: node test/glass-tests.mjs
//
// First the shell, friction and radiation physics against independent results
// (Rayleigh's inextensional field, the ring limit, the hemispherical-resonator
// gyro's Bryan factor, closed-form limits), then the engine against the model.

import assert from 'node:assert/strict';
import {
  rayleigh, rayleighField, ringRatio, ringBryan, bowl, bowlRadius, freeLines, waterLoad, radiationEff, liquidJ,
  speakingThreshold, regulation, transport, pulpDamping, KEY_LO, KEY_HI, REF,
} from '../glass/src/glass-model.js';
import { ArmonicaEngine } from '../glass/src/glass-engine.js';
import { DEFAULTS, GROUPS, PRESETS } from '../glass/src/glass-params.js';
import { keyFreq } from '../shared/dsp.js';

const FS = 48000, PI = Math.PI;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const near = (x, y, tol, what) => assert.ok(Math.abs(x - y) <= tol, `${what}: ${x} vs ${y}`);

// Run the engine through events ([t, 'on', key, vel] | [t, 'off', key] | [t, 'params', P] | [t, 'msg', m]),
// in 128-sample blocks; hook(e, sample) after every block.
function run(params, events, sec, hook) {
  const e = new ArmonicaEngine(FS);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float32Array(n), R = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, type, a, b]) => ({ s: Math.round(t * FS), type, a, b })).sort((x, y) => x.s - y.s);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j].s <= s) {
      const { type, a, b } = ev[j++];
      if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a); else if (type === 'params') e.setParams(a); else e.handle(a);
    }
    e.process(bL, bR, bl);
    L.set(bL.subarray(0, Math.min(bl, n - s)), s); R.set(bR.subarray(0, Math.min(bl, n - s)), s);
    hook?.(e, s);
  }
  return { L, R, e };
}
const hold = (key, vel, sec, params) => run(params, [[0, 'on', key, vel]], sec);
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b) {
  a = Math.round(a); b = Math.round(b); const w = (2 * PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// Frequency of the strongest line within ±30 ¢ of f0 in [a, b): Goertzel scan, parabolic peak.
function peakFreq(x, a, b, f0) {
  a = Math.round(a); b = Math.round(b);
  const c = []; for (let k = -60; k <= 60; k++) c.push(Math.log(tone(x, f0 * 2 ** (k / 2400), a, b) + 1e-30));
  let i = 1; for (let k = 1; k < c.length - 1; k++) if (c[k] > c[i]) i = k;
  const d = (0.5 * (c[i - 1] - c[i + 1])) / (c[i - 1] - 2 * c[i] + c[i + 1]);
  return f0 * 2 ** ((i - 60 + d) / 2400);
}
// Pitch track: frequency of each group of `per` cycles, in cents re f.
function pitchTrack(x, a, b, f, per) {
  const zc = [];
  for (let i = a + 1; i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) zc.push(i - 1 + -x[i - 1] / (x[i] - x[i - 1]));
  const out = [];
  for (let i = per; i < zc.length; i += per) out.push({ t: zc[i] / FS, c: cents((per * FS) / (zc[i] - zc[i - per]), f) });
  return out;
}
// Strongest frequency of a slow modulation (Hz) in a sampled series.
function modFreq(y, rate, lo, hi) {
  const mean = y.reduce((s, v) => s + v, 0) / y.length;
  let best = 0, bf = 0;
  for (let f = lo; f <= hi; f += 0.01) {
    let re = 0, im = 0;
    y.forEach((v, i) => { re += (v - mean) * Math.cos((2 * PI * f * i) / rate); im += (v - mean) * Math.sin((2 * PI * f * i) / rate); });
    if (Math.hypot(re, im) > best) { best = Math.hypot(re, im); bf = f; }
  }
  return bf;
}
const peak = (...xs) => xs.reduce((p, x) => x.reduce((q, v) => Math.max(q, Math.abs(v)), p), 0);
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const QUIET = { split: 0, treadle: 0 }; // a perfect bowl on an even spindle

console.log('shell');
test("Rayleigh's field stretches nothing, and its bending is a pure twist (κθ + κφ = 0)", () => {
  const d = 1e-5, f = (n, th, ph) => rayleighField(n, th, ph);
  for (const n of [2, 3, 5]) for (const [th, ph] of [[0.4, 0.3], [0.9, 1.7], [1.4, 2.9]]) {
    const D = (g, dth, dph) => (k) => (g(n, th + dth * d, ph + dph * d)[k] - g(n, th - dth * d, ph - dph * d)[k]) / (2 * d);
    const z = f(n, th, ph), dT = D(f, 1, 0), dP = D(f, 0, 1), s = Math.sin(th), ct = Math.cos(th) / s;
    const eT = dT('u') + z.w, eP = dP('v') / s + z.u * ct + z.w, g = dP('u') / s + dT('v') - z.v * ct;
    const scale = n * Math.tan(th / 2) ** n;
    for (const e of [eT, eP, g]) assert.ok(Math.abs(e) < 1e-7 * scale, `n=${n}: strain ${e}`);
    // rotations of the normal, then curvature changes (unit sphere)
    const beta = (n2, t2, p2) => { const q = f(n2, t2, p2), h = 1e-5;
      const wT = (f(n2, t2 + h, p2).w - f(n2, t2 - h, p2).w) / (2 * h), wP = (f(n2, t2, p2 + h).w - f(n2, t2, p2 - h).w) / (2 * h);
      return { bt: q.u - wT, bp: q.v - wP / Math.sin(t2) }; };
    const h2 = 1e-4, b0 = beta(n, th, ph);
    const kT = (beta(n, th + h2, ph).bt - beta(n, th - h2, ph).bt) / (2 * h2);
    const kP = (beta(n, th, ph + h2).bp - beta(n, th, ph - h2).bp) / (2 * h2) / s + b0.bt * ct;
    const exact = (n * (n * n - 1) * Math.tan(th / 2) ** n * Math.cos(n * ph)) / (s * s);
    assert.ok(Math.abs(kT + kP) < 1e-4 * Math.abs(exact) + 1e-6, `n=${n}: κθ+κφ = ${kT + kP}`);
    assert.ok(Math.abs(kT - exact) < 1e-4 * Math.abs(exact) + 1e-6, `n=${n}: κθ ${kT} vs ${exact}`);
  }
});
test('mass integral I₂ = ∫(u² + v² + w²) over the hemisphere, and I₁ in closed form', () => {
  for (const n of [2, 3, 4]) {
    let s = 0, s1 = 0; const N = 4000;
    for (let i = 0; i < N; i++) {
      const th = ((i + 0.5) / N) * (PI / 2), t = Math.tan(th / 2) ** n;
      s += t * t * (2 * Math.sin(th) ** 2 + (n + Math.cos(th)) ** 2) * Math.sin(th) * (PI / 2 / N);
      s1 += (t * t) / Math.sin(th) ** 3 * (PI / 2 / N);
    }
    near(rayleigh(n).I2, s, 1e-5 * s, `I₂(${n})`);
    near(rayleigh(n).I1, s1, 2e-4 * s1, `I₁(${n})`);
  }
});
test('hemisphere mode ratios 1 : 2.81 : 5.43 : 8.84 sit within 1 % of the thin ring (Rayleigh) 1 : 2.83 : 5.42 : 8.77', () => {
  near(ringRatio(3), 2 * Math.SQRT2, 1e-12, 'ring n=3 is 2√2');
  const r = (n) => rayleigh(n).lambda / rayleigh(2).lambda;
  [[3, 2.8102], [4, 5.4316], [5, 8.8387]].forEach(([n, x]) => { near(r(n), x, 5e-4, `hemisphere n=${n}`); assert.ok(Math.abs(r(n) / ringRatio(n) - 1) < 0.01, `n=${n} vs ring`); });
  console.log(`        hemisphere ${[2, 3, 4, 5, 6].map((n) => r(n).toFixed(3)).join(' : ')} · ring ${[2, 3, 4, 5, 6].map((n) => ringRatio(n).toFixed(3)).join(' : ')}`);
});
test("Bryan's factor: 2/(n²+1) = 0.4 for a ring (Bryan 1890), 0.277 for the hemisphere (the HRG value)", () => {
  // the same Coriolis integral, ∫ ẑ·(x_c × x_s) / ∫|x_c|², for a ring: w = cos nφ, v = −sin(nφ)/n (rotated pair)
  for (const n of [2, 3, 4]) {
    let num = 0, den = 0; const N = 720;
    for (let i = 0; i < N; i++) {
      const p = (2 * PI * i) / N, wc = Math.cos(n * p), vc = -Math.sin(n * p) / n, ws = Math.sin(n * p), vs = Math.cos(n * p) / n;
      num += wc * vs - vc * ws; den += wc * wc + vc * vc;
    }
    near(num / den / n, ringBryan(n), 1e-9, `ring n=${n}`);
  }
  near(rayleigh(2).bryan, 0.277, 5e-4, 'hemisphere n=2');
  assert.ok(rayleigh(3).bryan < ringBryan(3) && rayleigh(3).bryan > 0.15, `n=3: ${rayleigh(3).bryan}`);
});
test("Franklin's bowls, 9 in to 3 in across, come out with his 'tenth of an inch' walls when tuned", () => {
  near(2 * bowlRadius(55) / 0.0254, 9, 1e-9, 'G3'); near(2 * bowlRadius(91) / 0.0254, 3, 1e-9, 'G6');
  let sum = 0;
  for (let k = KEY_LO; k <= KEY_HI; k++) {
    const b = bowl(k, REF);
    assert.ok(b.h > 1.7e-3 && b.h < 2.9e-3, `${k}: h = ${(b.h * 1e3).toFixed(2)} mm`);
    near(b.modes[0].f, keyFreq(k), 1e-9 * keyFreq(k), `${k} pitch`);
    sum += b.h;
  }
  const mean = sum / (KEY_HI - KEY_LO + 1);
  near(mean, 0.1 * 0.0254, 0.1 * 0.00254, 'mean wall vs 2.54 mm');
  console.log(`        walls ${(bowl(KEY_LO, REF).h * 1e3).toFixed(2)}–${(bowl(79, REF).h * 1e3).toFixed(2)}–${(bowl(KEY_HI, REF).h * 1e3).toFixed(2)} mm, mean ${(mean * 1e3).toFixed(2)} mm (Franklin: ~2.5 mm at the brim)`);
});

console.log('water, radiation, friction');
test('water: shallow water is felt as d^(n+3) (the mode lives at the rim); a full bowl drops ~an octave, like Jundt et al.\'s wine glass', () => {
  const s = Math.log(liquidJ(2, 0.2) / liquidJ(2, 0.1)) / Math.log(2);
  near(s, 2 * 2 + 6, 0.05, 'J ∝ θ^(2n+6)'); // d ∝ θ² for small θ ⇒ Λ ∝ d^(n+3)
  const b = bowl(69, REF), drop = cents(b.modes[0].f / Math.sqrt(1 + waterLoad(2, b.a, b.h, 1)), b.modes[0].f);
  assert.ok(drop < -1000 && drop > -1600, `full bowl: ${drop.toFixed(0)} ¢ (Jundt et al.: 890 → 410 Hz = −1340 ¢)`);
  console.log(`        A4 bowl: ¼ full ${cents(bowl(69, P({ water: 0.25 })).modes[0].f, 440).toFixed(0)} ¢, ½ ${cents(bowl(69, P({ water: 0.5 })).modes[0].f, 440).toFixed(0)} ¢, ¾ ${cents(bowl(69, P({ water: 0.75 })).modes[0].f, 440).toFixed(0)} ¢, full ${drop.toFixed(0)} ¢`);
});
test('radiation efficiency: (ka)ⁿ⁺¹/((n+1)(2n−1)!!) for a small bowl, 1 for a large one', () => {
  for (const [n, df] of [[2, 3], [3, 15], [4, 105]]) {
    near(radiationEff(n, 0.05) / (0.05 ** (n + 1) / ((n + 1) * df)), 1, 2e-3, `n=${n} small`);
    near(radiationEff(n, 200), 1, 0.01, `n=${n} large`);
  }
});
test('speaking threshold: linear stability (glass loss + Bryan drain) predicts where the engine starts to grow', () => {
  const key = 69, Nc = speakingThreshold(key, P(QUIET)), m = bowl(key, P(QUIET)).modes[0];
  const need = m.sigma + transport(m, DEFAULTS.speed) ** 2 / (m.sigma + (pulpDamping(Nc) * 4) / (2 * m.M));
  const growth = (mult) => { // seed the pattern, then watch the (2,0) tone grow or die
    const params = P({ ...QUIET, press: (mult * Nc) / regulation(key) / 1.08, rough: 0 });
    const { L } = run(params, [[0, 'on', key, 0.6]], 2.2, (e, s) => {
      const v = e.voices[0];
      if (s === 0) { v.Nn = v.Nreg * params.press * 1.08; v.qs[0] = 3e-7; v.qs1[0] = 3e-7 * Math.cos((2 * PI * m.f) / FS); }
    });
    return Math.log(tone(L, m.f, 1.6 * FS, 2.2 * FS) / tone(L, m.f, 0.4 * FS, FS)) / 1.2;
  };
  const r = [0.8, 0.95, 1.05, 1.6].map(growth);
  assert.ok(r[0] < 0 && r[1] < 0 && r[2] > 0 && r[3] > 0, `growth ${r.map((x) => x.toFixed(2)).join(', ')} s⁻¹`);
  near(r[0], -0.2 * need, 0.2 * 0.2 * need, 'decay at 0.8×');
  near(r[3], 0.6 * need, 0.25 * 0.6 * need, 'growth at 1.6×');
  console.log(`        A4 speaks above ${Nc.toFixed(2)} N; growth at 0.8/0.95/1.05/1.6×: ${r.map((x) => x.toFixed(2)).join(' / ')} s⁻¹ (theory ${[-0.2, -0.05, 0.05, 0.6].map((x) => (x * need).toFixed(2)).join(' / ')})`);
});

console.log('engine');
test('tuning: every bowl F3–A6 speaks within ±3 ¢ of 12-TET (perfect bowls)', () => {
  let worst = 0, wk = 0;
  for (let k = KEY_LO; k <= KEY_HI; k++) {
    const { L, R } = hold(k, 0.6, 1.6, P(QUIET)), x = k > 73 ? R : L;
    const c = cents(peakFreq(x, 0.9 * FS, 1.6 * FS, keyFreq(k)), keyFreq(k));
    if (Math.abs(c) > Math.abs(worst)) { worst = c; wk = k; }
  }
  assert.ok(Math.abs(worst) < 3, `worst ${worst.toFixed(2)} ¢ at ${wk}`);
  console.log(`        worst ${worst.toFixed(2)} ¢ (key ${wk})`);
});
test('the bowl speaks after a physical delay (0.15–0.8 s), later still when touched lightly', () => {
  const onset = (key, vel) => { // time to come within 6 dB of the final level
    const { L, R } = hold(key, vel, 2.5, P(QUIET)), x = key > 73 ? R : L, fin = rms(x, 2 * FS, 2.5 * FS);
    for (let s = 0; s < 2 * FS; s += 480) if (rms(x, s, s + 480) > 0.5 * fin) return s / FS;
    return Infinity;
  };
  const g3 = onset(55, 0.6), a4 = onset(69, 0.6), g6 = onset(91, 0.6), soft = onset(69, 0.15), hard = onset(69, 1);
  for (const [k, t] of [['G3', g3], ['A4', a4], ['G6', g6]]) assert.ok(t > 0.15 && t < 0.8, `${k} speaks after ${t} s`);
  assert.ok(soft > 1.5 * a4 && a4 > hard, `A4 soft ${soft}, mid ${a4}, hard ${hard}`);
  console.log(`        to −6 dB: G3 ${g3.toFixed(2)} s, A4 ${a4.toFixed(2)} s, G6 ${g6.toFixed(2)} s; A4 soft ${soft.toFixed(2)} s, hard ${hard.toFixed(2)} s`);
});
test('stick–slip: once the bowl speaks, the skin sticks once per cycle', () => {
  for (const key of [57, 69, 81]) {
    let onsets = 0, prev = false, n = 0; // the engine records the slip speed of the focused bowl every sample
    run(P(QUIET), [[0, 'on', key, 0.6]], 1.4, (e, s) => {
      if (s < 1.2 * FS) return;
      for (let i = 0; i < 128; i++) { const st = e.trS[(e.tw - 128 + i + 1024) % 1024] === 0; if (st && !prev) onsets++; prev = st; n++; }
    });
    const perCycle = onsets / ((n / FS) * keyFreq(key));
    assert.ok(Math.abs(perCycle - 1) < 0.05, `${key}: ${perCycle.toFixed(3)} sticks per cycle`);
  }
});
test('a split doublet turning under the finger warbles: ±split/2 at 2n× the rotation rate', () => {
  const key = 72, f = keyFreq(key);
  const track = (o) => { const { L } = hold(key, 0.6, 4, P({ treadle: 0, ...o })); return pitchTrack(L, 1.5 * FS, 4 * FS, f, 10); };
  const flat = track({ split: 0 }), wob = track({ split: 16, speed: 0.5 });
  const sw = (tr) => { const c = tr.map((p) => p.c).sort((a, b) => a - b); return 0.5 * (c[Math.floor(0.97 * c.length)] - c[Math.floor(0.03 * c.length)]); };
  const rate = modFreq(wob.map((p) => p.c), f / 10, 0.5, 6);
  assert.ok(sw(flat) < 1, `perfect bowl wobbles ±${sw(flat).toFixed(2)} ¢`);
  near(sw(wob), 8, 2, 'swing ±split/2 (¢)');
  near(rate, 4 * 0.5, 0.1, 'warble rate (Hz)');
  console.log(`        16 ¢ split at 0.5 rev/s: ±${sw(wob).toFixed(1)} ¢ at ${rate.toFixed(2)} Hz`);
});
test('Bryan: once the finger lifts, the free pattern precesses at (1 − B)Ω; a fixed ear hears 2n(1 − B)·f_rot', () => {
  const key = 69, rot = 0.5, { L } = run(P({ ...QUIET, speed: rot }), [[0, 'on', key, 0.6], [1.0, 'off', key]], 6);
  // log envelope with the glass's exponential decay fitted out, then its main modulation
  const env = []; for (let s = 1.5 * FS; s + 1920 <= 6 * FS; s += 960) env.push(Math.log(tone(L, 440, s, s + 1920)));
  const N = env.length, xm = (N - 1) / 2, ym = env.reduce((a, y) => a + y, 0) / N;
  const sl = env.reduce((a, y, i) => a + (i - xm) * (y - ym), 0) / env.reduce((a, _, i) => a + (i - xm) ** 2, 0);
  const fm = modFreq(env.map((y, i) => y - sl * i), FS / 960, 0.5, 3), m = bowl(key, P(QUIET)).modes[0];
  const lines = freeLines(m, rot).filter((l) => l.w > 0.5).map((l) => l.f);
  near(fm, Math.abs(lines[1] - lines[0]), 0.05, 'beat (Hz)');
  near(fm, 4 * (1 - 0.277) * rot, 0.05, 'beat vs 2n(1−B)f_rot');
  assert.ok(Math.abs(fm - 4 * (1 - ringBryan(2)) * rot) > 0.15, 'a ring\'s Bryan factor would be audibly different');
  console.log(`        A4 at ${rot} rev/s: ${fm.toFixed(2)} Hz (hemisphere ${(4 * (1 - 0.277) * rot).toFixed(2)}, ring ${(4 * (1 - ringBryan(2)) * rot).toFixed(2)})`);
});
test('free ringing decays at the glass loss rate, with or without spin (Coriolis step conserves energy)', () => {
  for (const speed of [0.25, 1.5]) {
    const E = []; run(P({ ...QUIET, speed }), [[0, 'on', 76, 1], [0.6, 'off', 76]], 3, (e, s) => {
      const v = e.voices[0]; if (!v || s < 0.8 * FS || s % 9600) return; // every 0.2 s once the finger is off
      const w = 2 * PI * v.b.modes[0].f, vc = (v.qc[0] - v.qc1[0]) * FS, vs = (v.qs[0] - v.qs1[0]) * FS;
      E.push(v.qc[0] ** 2 + v.qs[0] ** 2 + (vc * vc + vs * vs) / (w * w));
    });
    const sig = -Math.log(E[E.length - 1] / E[0]) / (2 * (E.length - 1) * 0.2), want = bowl(76, P(QUIET)).modes[0].sigma;
    near(sig, want, 0.03 * want, `σ at ${speed} rev/s`);
  }
});
test('water lowers the bowl by the predicted amount (no retuning)', () => {
  for (const water of [0.5, 0.7]) {
    const { L } = hold(64, 0.6, 2, P({ ...QUIET, water })), want = bowl(64, P({ water })).modes[0].f;
    near(cents(peakFreq(L, FS, 2 * FS, want), want), 0, 3, `water ${water}`);
    assert.ok(want < keyFreq(64) * 0.995, 'it went flat');
  }
});
test('dry fingers do not speak, they whisper (the ridges catch more); wet fingers sing', () => {
  const look = (wet) => { const { L, R } = hold(69, 0.6, 2, P({ wet })); return { lvl: rms(L, 1.5 * FS, 2 * FS) + rms(R, 1.5 * FS, 2 * FS), n2: tone(L, 440, 1.5 * FS, 2 * FS) }; };
  const dry = look(0.05), wet = look(0.85);
  assert.ok(wet.n2 > 100 * dry.n2, `(2,0): wet/dry ${(20 * Math.log10(wet.n2 / dry.n2)).toFixed(1)} dB`);
  assert.ok(wet.lvl > 10 * dry.lvl, `wet/dry ${(20 * Math.log10(wet.lvl / dry.lvl)).toFixed(1)} dB`);
  assert.ok(20 * Math.log10(dry.lvl / 2) > -60, `dry: ${(20 * Math.log10(dry.lvl / 2)).toFixed(1)} dBFS, too faint to hear`); // was −63 for a triad
  console.log(`        A4: dry ${(20 * Math.log10(dry.lvl / 2)).toFixed(1)} dBFS, wet ${(20 * Math.log10(wet.lvl / 2)).toFixed(1)} dBFS`);
});
test('pressure window: too light is silent, the middle sings (2,0), pressing hard squeals in higher modes', () => {
  const key = 64, b = bowl(key, P(QUIET));
  const look = (press, vel) => {
    const { L } = hold(key, vel, 2, P({ ...QUIET, press })), a = 1.2 * FS, z = 2 * FS;
    return { lvl: rms(L, a, z), n2: tone(L, b.modes[0].f, a, z), hi: Math.max(tone(L, b.modes[1].f, a, z), tone(L, b.modes[2].f, a, z)) };
  };
  const light = look(0.4, 0.6), mid = look(6, 0.6), hard = look(20, 1);
  assert.ok(mid.lvl > 100 * light.lvl, 'light touch is silent');
  assert.ok(mid.n2 > 30 * mid.hi, `normal touch: (2,0) ${(20 * Math.log10(mid.n2 / mid.hi)).toFixed(0)} dB over higher modes`);
  assert.ok(hard.hi / hard.n2 > 100 * (mid.hi / mid.n2), `hard: higher modes ${(20 * Math.log10(hard.hi / hard.n2)).toFixed(0)} dB re (2,0)`);
  console.log(`        E4: higher modes ${(20 * Math.log10(mid.hi / mid.n2)).toFixed(0)} dB re (2,0) at normal touch, ${(20 * Math.log10(hard.hi / hard.n2)).toFixed(0)} dB pressing hard`);
});
test('MIDI aftertouch presses harder: a too-light note speaks when pressure arrives', () => {
  const params = P({ ...QUIET, press: 1.1 }), key = 72; // 0.92× threshold until pressed, then 1.85×
  const quiet = hold(key, 0.3, 3.5, params), pressed = run(params, [[0, 'on', key, 0.3], [0.2, 'msg', { type: 'pressure', value: 1, key: null }]], 3.5);
  const a = rms(quiet.L, 3 * FS, 3.5 * FS), b = rms(pressed.L, 3 * FS, 3.5 * FS);
  assert.ok(b > 10 * a, `${(20 * Math.log10(b / a)).toFixed(1)} dB louder`);
});

console.log('safety');
test('output level: a forte note peaks 0.08–0.6 anywhere on the keyboard', () => {
  for (const k of [53, 60, 69, 79, 88, 93]) { const { L, R } = hold(k, 1, 1.5, P()); const p = peak(L, R); assert.ok(p > 0.08 && p < 0.6, `${k}: ${p}`); }
});
test('every preset, played at the computer keys\' touch, peaks below 0.6 (the squeal preset was 1.6)', () => {
  for (const pr of PRESETS) for (const k of [53, 60, 67, 81]) {
    const { L, R } = hold(k, DEFAULTS.velocity, 2.5, P(pr.p)), p = peak(L, R);
    assert.ok(p < 0.6, `${pr.name}, key ${k}: ${p.toFixed(2)}`);
  }
});
test('speaking time (to within 6 dB of full): 0.4–0.8 s at mid velocity, 0.85–1.6 s for a light touch', () => {
  const onset = (key, vel) => {
    const { L, R } = hold(key, vel, 3, P()), x = L.map((v, i) => Math.abs(v) + Math.abs(R[i])), W = 960;
    const env = []; for (let i = 0; i + W <= x.length; i += W) { let p = 0; for (let j = i; j < i + W; j++) p = Math.max(p, x[j]); env.push(p); }
    const full = Math.max(...env.slice(-25));
    return env.findIndex((p) => p > 0.5 * full) * (W / FS);
  };
  const mid = [53, 67, 81, 93].map((k) => onset(k, 0.6)), soft = [53, 67, 81, 93].map((k) => onset(k, 0.2));
  for (const t of mid) assert.ok(t > 0.4 && t < 0.8, `velocity 0.6: ${mid.map((x) => x.toFixed(2)).join(', ')} s`);
  for (const t of soft) assert.ok(t > 0.85 && t < 1.6, `velocity 0.2: ${soft.map((x) => x.toFixed(2)).join(', ')} s`);
  console.log(`        F3, G4, A5, A6: ${mid.map((x) => x.toFixed(2)).join(' / ')} s at 0.6; ${soft.map((x) => x.toFixed(2)).join(' / ')} s at 0.2`);
});
test('every parameter at its min and max: finite, bounded, and silent after a release', () => {
  const ids = GROUPS.flatMap((g) => g.params).filter((p) => p.type !== 'select' && p.type !== 'checkbox');
  for (const p of ids) for (const val of [p.min, p.max]) {
    const params = P({ [p.id]: val, loss: p.id === 'loss' ? val : 3e-3 });
    const { L, R, e } = run(params, [[0, 'on', 55, 1], [0, 'on', 72, 1], [0, 'on', 91, 1], [0.8, 'off', 55], [0.8, 'off', 72], [0.8, 'off', 91]], 1.4);
    for (let i = 0; i < L.length; i++) if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) throw new Error(`${p.id}=${val}: NaN at ${i}`);
    assert.ok(peak(L, R) < 3, `${p.id}=${val}: peak ${peak(L, R)}`);
    void e;
  }
  const { e } = run(P({ loss: 3e-3 }), [[0, 'on', 60, 1], [0.5, 'off', 60]], 6);
  assert.equal(e.voiceCount(), 0, 'voice retired after ringing out');
});
test('no clicks: onsets and releases are smooth (largest step < 3 × typical slope)', () => {
  const { L } = run(P(), [[0.05, 'on', 69, 1], [1.0, 'off', 69], [1.3, 'on', 76, 1], [1.8, 'off', 76]], 2.4);
  const d = []; for (let i = 1; i < L.length; i++) d.push(Math.abs(L[i] - L[i - 1]));
  for (const [t0, t1] of [[0.04, 0.2], [0.95, 1.1], [1.29, 1.45], [1.75, 1.9]]) {
    const seg = d.slice(t0 * FS, t1 * FS), mx = Math.max(...seg), typ = Math.max(...d.slice(0.6 * FS, 0.9 * FS));
    assert.ok(mx < 3 * typ, `${t0}–${t1} s: step ${mx.toExponential(2)} vs steady ${typ.toExponential(2)}`);
  }
});
test('CPU: 10 bowls rubbed at once render well under real time', () => {
  const keys = [55, 59, 62, 65, 69, 72, 76, 79, 84, 88], t0 = performance.now();
  run(P(), keys.map((k) => [0, 'on', k, 0.7]), 3);
  const frac = (performance.now() - t0) / 1000 / 3;
  assert.ok(frac < 0.3, `${(frac * 100).toFixed(1)} % of real time`);
  console.log(`        10 voices: ${(frac * 100).toFixed(1)} % of real time`);
});

void transport;
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
