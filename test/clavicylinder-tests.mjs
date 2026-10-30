// Clavicylinder checks. Run: node test/clavicylinder-tests.mjs
//
// First the bars' physics against independent results (the free–free beam's eigenvalues and
// shapes, Euler–Bernoulli's length for a note, the rubbed point's motion, linear stability of
// the friction), then the engine against the model and against what Chladni wrote of his
// instrument. Both are the C++ (native/instruments/clavicylinder), built as WebAssembly: the
// model's functions through clavicylinder-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, GROUPS, PRESETS } from '../clavicylinder/src/clavicylinder-instrument.js';
import { wasmModel } from '../clavicylinder/src/clavicylinder-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';

const ClavicylinderEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();
const [KEY_LO, KEY_HI] = INSTRUMENT.compass.keys; // C2–F6, Chladni's compass

const FS = 48000, PI = Math.PI, E_IRON = 200e9, RHO = 7700;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const near = (x, y, tol, what) => assert.ok(Math.abs(x - y) <= tol, `${what}: ${x} vs ${y}`);

// Run the engine through events ([t, 'on', key, vel] | [t, 'off', key] | [t, 'params', P] |
// [t, 'pressure', value, key]), in 128-sample blocks; hook(e, sample) after every block.
function run(params, events, sec, { hook, quality } = {}) {
  const e = new ClavicylinderEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float32Array(n), R = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, type, a, b]) => ({ s: Math.round(t * FS), type, a, b })).sort((x, y) => x.s - y.s);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j].s <= s) {
      const { type, a, b } = ev[j++];
      if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a); else if (type === 'params') e.setParams(a); else e.handle({ type: 'pressure', value: a, key: b });
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
// Frequency of the strongest line within ±30 ¢ of f0 in [a, b): Goertzel scan, parabolic peak.
function peakFreq(x, a, b, f0) {
  const c = []; for (let k = -60; k <= 60; k++) c.push(Math.log(tone(x, f0 * 2 ** (k / 2400), a, b) + 1e-30));
  let i = 1; for (let k = 1; k < c.length - 1; k++) if (c[k] > c[i]) i = k;
  const d = (0.5 * (c[i - 1] - c[i + 1])) / (c[i - 1] - 2 * c[i] + c[i + 1]);
  return f0 * 2 ** ((i - 60 + d) / 2400);
}
const rms = (x, a, b) => { let s = 0; for (let i = Math.round(a); i < Math.round(b); i++) s += x[i] * x[i]; return Math.sqrt(s / (Math.round(b) - Math.round(a))); };
const peak = (L, R) => { let p = 0; for (let i = 0; i < L.length; i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i])); return p; };
const dB = (r) => 20 * Math.log10(r);
// Seconds to come within 6 dB of the held level (peak envelope in 10 ms windows).
function onset(L, R) {
  const W = 480, env = [];
  for (let i = 0; i + W <= L.length; i += W) { let p = 0; for (let j = i; j < i + W; j++) p = Math.max(p, Math.abs(L[j]), Math.abs(R[j])); env.push(p); }
  const full = Math.max(...env.slice(-30));
  return (env.findIndex((p) => p > 0.5 * full) * W) / FS;
}
// The force at which a key starts to speak, from linear stability (as the page's info): the
// friction's fall at the glass's speed, μ′(V), feeds the lowest mode a negative damping
// N|μ′|c₁²/(2m) against its loss σ₁.
function threshold(key, params) {
  const b = M.bar(key, params), f = M.friction(params.wet, params.grip, b.L), V = 2 * PI * M.CYL_R * params.speed, x = V / f.v0, m1 = b.modes[0];
  const slope = (2 * f.dmu * x) / (f.v0 * (1 + x * x) ** 2) - f.beta;
  return { N: (2 * m1.sigma * b.m) / (slope * m1.c * m1.c), b };
}

console.log('physics');
test('free–free beam: βL solves cos βL cosh βL = 1, and the modes run 1 : 2.756 : 5.404 : 8.933 (Rayleigh)', () => {
  for (const b of M.BETA_L) assert.ok(Math.abs(Math.cos(b) * Math.cosh(b) - 1) < 1e-4 * Math.cosh(b), `${b}`);
  [1, 2.7565, 5.4039, 8.9330].forEach((r, n) => near((M.BETA_L[n] / M.BETA_L[0]) ** 2, r, 2e-3, `mode ${n + 1}`));
});
test('mode shapes are orthonormal on [0, 1], with the free end at ±2 and the slope their derivative', () => {
  const N = 4000;
  for (let m = 0; m < 4; m++) {
    for (let n = 0; n < 4; n++) {
      let s = 0;
      for (let i = 0; i < N; i++) { const x = (i + 0.5) / N; s += M.modeShape(m, x) * M.modeShape(n, x); }
      near(s / N, m === n ? 1 : 0, 1e-3, `<${m}|${n}>`);
    }
    near(Math.abs(M.modeShape(m, 1)), 2, 1e-6, `mode ${m + 1} at the end`);
    const h = 1e-5, x = 0.37;
    near(M.modeSlope(m, x), (M.modeShape(m, x + h) - M.modeShape(m, x - h)) / (2 * h), 1e-4 * M.BETA_L[m] ** 2, `mode ${m + 1} slope`);
  }
});
test('the cords sit on the lowest mode\'s nodes, 22.4 % from each end', () => {
  near(M.NODE, 0.22416, 1e-5, 'node');
  assert.ok(Math.abs(M.modeShape(0, M.NODE)) < 1e-5 && Math.abs(M.modeShape(0, 1 - M.NODE)) < 1e-5);
});
test('Euler–Bernoulli: each bar\'s length puts its lowest mode on the note (f = (βL)²/2πL² · h√(E/12ρ)); middle C is about 21 cm of 2.3 mm iron', () => {
  for (const key of [36, 48, 60, 72, 84, 89]) {
    const b = M.bar(key, P()), f = (M.BETA_L[0] ** 2 / (2 * PI * b.L * b.L)) * b.h * Math.sqrt(E_IRON / (12 * RHO));
    near(cents(f, b.fbar), 0, 0.01, `key ${key}: the free bar`);
    near(b.m, RHO * M.WIDTH * b.h * b.L, 1e-9, `key ${key}: mass`);
    assert.ok(Math.abs(cents(b.fbar, keyFreq(key))) < 20, `key ${key}: filed within 20 ¢ of its note (${cents(b.fbar, keyFreq(key)).toFixed(1)} ¢)`);
  }
  const c4 = M.bar(60, P());
  assert.ok(c4.L > 0.19 && c4.L < 0.23, `C4: ${(c4.L * 100).toFixed(1)} cm`);
  const thick = M.bar(60, P({ thick: 4 }));
  near(thick.L / c4.L, Math.sqrt((4 / 2.3) * (c4.fbar / thick.fbar)), 1e-5, 'L ∝ √(h/f)');
});
test('the rubbed point: a post at ⅜ of the length from the back below E4, the bent end above; the friction drives mode 1 along its own motion', () => {
  for (const key of [36, 60, 63]) { const b = M.bar(key, P()); assert.ok(b.post && Math.abs(b.xc - 5 / 8) < 1e-12, `key ${key}`); }
  for (const key of [64, 72, 89]) { const b = M.bar(key, P()); assert.ok(!b.post && b.xc === 1, `key ${key}`); }
  for (const key of [48, 72]) {
    const b = M.bar(key, P()), m1 = b.modes[0];
    near(Math.hypot(b.tx, b.ty), 1, 1e-12, 'unit direction');
    // mode 1's motion at the rubbed point: (−arm/L·φ′, φ), all along the friction (the lever's
    // own resonance, far above, takes off a little)
    const hx = (-b.arm / b.L) * M.modeSlope(0, b.xc), hy = M.modeShape(0, b.xc);
    near(m1.c, Math.hypot(hx, hy), 1e-3 * Math.hypot(hx, hy), `key ${key}: c₁`);
    near(m1.cn, 0, 1e-3, `key ${key}: none across`);
    near(b.meff, b.m / (hx * hx + hy * hy), 1e-9 * b.meff, `key ${key}: the rubbed point's mass`);
  }
  assert.equal(M.bar(72, P({ build: 1 })).post, true, 'posts all the way up');
  assert.equal(M.bar(48, P({ build: 2 })).post, false, 'bent ends all the way down');
});
test('regulation: each key presses as hard as its bar needs, its rubbed mass × note^0.7 over middle C\'s', () => {
  for (const key of [36, 48, 72, 84]) {
    const want = (M.rubbedMass(key, 0, M.H0) / M.rubbedMass(60, 0, M.H0)) * (keyFreq(key) / keyFreq(60)) ** 0.7;
    near(M.bar(key, P()).reg, want, 1e-9 * want, `key ${key}`);
  }
  near(M.bar(60, P()).reg, 1, 1e-12, 'middle C');
});
test('loss: σₙ = π fₙ η from the ring time at middle C, plus the cords\' dashpots where they hold the bar', () => {
  const b = M.bar(60, P()), eta = 6.9078 / DEFAULTS.t60 / (PI * keyFreq(60));
  for (const m of b.modes) assert.ok(m.sigma >= PI * m.f * eta * 0.999, `${m.f.toFixed(0)} Hz`);
  near(b.modes[0].sigma, PI * b.modes[0].f * eta, 1e-4 * b.modes[0].sigma, 'on the nodes the cords do not damp mode 1');
  const off = M.bar(60, P({ cords: -0.05 }));
  assert.ok(off.modes[0].sigma > 1.5 * b.modes[0].sigma, 'off the nodes they do');
  const free2 = M.bar(60, P({ cords: -0.092 }));
  assert.ok(free2.modes[1].sigma < 1.2 * PI * free2.modes[1].f * eta, 'on mode 2\'s nodes, mode 2 rings free');
});
test('friction: soaked cloth loses its grab, the small treble strips first; soap lowers it and pumice sharpens it', () => {
  const big = M.bar(48, P()).L, small = M.bar(86, P()).L;
  const d = (wet, grip, L) => M.friction(wet, grip, L).dmu;
  assert.ok(d(0.95, 0, small) < 0.15 * d(0.45, 0, small), 'treble, soaked');
  assert.ok(d(0.95, 0, big) > 2 * d(0.95, 0, small), 'the bass keeps more');
  assert.ok(d(0.45, -0.7, big) < d(0.45, 0, big) && d(0.45, 0.8, big) > d(0.45, 0, big), 'soap, pumice');
});

console.log('engine');
test('linear stability predicts where a bar starts: silent at half the threshold, singing at twice it', () => {
  const res = [];
  for (const key of [48, 60, 72, 84]) {
    const { N, b } = threshold(key, P()), at = (fac) => { const { L, R } = hold(key, 0.5, 4, P({ press: (fac * N) / b.reg })); return dB(rms(L, 3.6 * FS, 4 * FS) + rms(R, 3.6 * FS, 4 * FS)); };
    const lo = at(0.5), hi = at(2);
    assert.ok(hi - lo > 20, `key ${key}: ${lo.toFixed(0)} dB at ½×, ${hi.toFixed(0)} dB at 2×`);
    res.push(`${key}: ${(N * 1000 / 9.81).toFixed(0)} g, ${(hi - lo).toFixed(0)} dB`);
  }
  console.log(`        ${res.join('; ')}`);
});
test('tuning: every bar C2–F6 sings within ±5 ¢ of 12-TET at the defaults', () => {
  let worst = 0;
  for (let key = KEY_LO; key <= KEY_HI; key += 3) {
    const { L } = hold(key, 0.5, 1.2), f = keyFreq(key), c = cents(peakFreq(L, 0.6 * FS, 1.2 * FS, f), f);
    assert.ok(Math.abs(c) < 5, `key ${key}: ${c.toFixed(1)} ¢`);
    worst = Math.max(worst, Math.abs(c));
  }
  console.log(`        worst ${worst.toFixed(1)} ¢`);
});
test('Full range: A0–B1 and F♯6–C8 speak too, within ±12 ¢', () => {
  for (const key of [21, 28, 33, 92, 100, 108]) {
    const { L, R } = hold(key, 0.5, 1.5, P({ fullRange: true })), f = keyFreq(key);
    assert.ok(peak(L, R) > 0.01, `key ${key} speaks: ${peak(L, R)}`);
    const c = cents(peakFreq(L, 0.9 * FS, 1.5 * FS, f), f);
    assert.ok(Math.abs(c) < 12, `key ${key}: ${c.toFixed(1)} ¢`);
  }
});
test('the keyboard\'s tuning: at A = 415 Hz the bars are cut to it', () => {
  const p = P({ pitch: 415 }), { L } = hold(69, 0.5, 1.2, p), c = cents(peakFreq(L, 0.6 * FS, 1.2 * FS, 415), 415);
  assert.ok(Math.abs(c) < 5, `${c.toFixed(1)} ¢`);
});
test('prompt speech (Institut, 1808): within 0.4 s at the defaults, a tenth of a second in the treble', () => {
  const t = [36, 48, 60, 72, 84, 89].map((k) => { const { L, R } = hold(k, 0.5, 2); return onset(L, R); });
  t.forEach((x, i) => assert.ok(x < (i < 3 ? 0.4 : 0.1), `${t.map((y) => y.toFixed(2)).join(', ')} s`));
  console.log(`        C2 C3 C4 C5 C6 F6: ${t.map((y) => y.toFixed(2)).join(' / ')} s`);
});
test('a gentle key swells in, a firm one speaks at once', () => {
  for (const key of [48, 72]) {
    const at = (vel) => { const { L, R } = hold(key, vel, 3, P({ press: 0.4 })); return onset(L, R); };
    const soft = at(0.1), firm = at(1);
    assert.ok(soft > 2 * firm && soft > 0.3, `key ${key}: ${soft.toFixed(2)} s vs ${firm.toFixed(2)} s`);
  }
});
test('stick–slip: once a bar sings, the cloth sticks to the glass once a cycle', () => {
  const key = 60, f = keyFreq(key);
  const { e } = hold(key, 0.5, 1.5);
  const tr = e.trS, tw = e.tw, n = tr.length, V = e.cylinder.W * M.CYL_R;
  let runs = 0, stuck = 0, prev = false;
  for (let i = 0; i < n; i++) { const s = Math.abs(tr[(tw + i) % n]) < 1e-6 * V; if (s) stuck++; if (s && !prev) runs++; prev = s; }
  const cycles = (n / FS) * f;
  assert.ok(Math.abs(runs - cycles) <= 1.5, `${runs} sticks in ${cycles.toFixed(1)} cycles`);
  assert.ok(stuck / n > 0.2 && stuck / n < 0.95, `stuck ${(100 * stuck / n).toFixed(0)} %`);
});
test('the friction makes harmonics of the note; the bar\'s own overtones (2.76×, 5.40×) stay far below them', () => {
  for (const key of [48, 72]) {
    const { L } = hold(key, 0.5, 1.5), b = M.bar(key, P()), f = keyFreq(key), a = 0.8 * FS, z = 1.5 * FS;
    const h1 = tone(L, f, a, z), h2 = tone(L, 2 * f, a, z), m2 = tone(L, b.modes[1].f, a, z);
    assert.ok(h2 > 0.005 * h1, `key ${key}: 2nd harmonic ${dB(h2 / h1).toFixed(0)} dB`);
    assert.ok(m2 < 0.03 * h1 && m2 < h2, `key ${key}: mode 2 ${dB(m2 / h1).toFixed(0)} dB`);
  }
});
test('cords on the second mode\'s nodes free the overtone, which takes over (Chladni\'s “unbearable” fault)', () => {
  const key = 60, b = M.bar(key, P({ cords: -0.092 })), f = keyFreq(key);
  const { L } = hold(key, 0.5, 2, P({ cords: -0.092 })), a = 1.2 * FS, z = 2 * FS;
  assert.ok(tone(L, b.modes[1].f, a, z) > 3 * tone(L, f, a, z), `mode 2 over the note: ${dB(tone(L, b.modes[1].f, a, z) / tone(L, f, a, z)).toFixed(0)} dB`);
});
test('soaked cloth: the high bars do not speak at all, the low ones still do (Chladni)', () => {
  const p = P({ wet: 0.95 });
  for (const key of [84, 89]) { const { L, R } = hold(key, 0.5, 2, p); assert.ok(rms(L, 1.5 * FS, 2 * FS) + rms(R, 1.5 * FS, 2 * FS) < 3e-3, `key ${key}: ${rms(L, 1.5 * FS, 2 * FS)}`); }
  for (const key of [36, 60]) { const { L } = hold(key, 0.5, 2, p); assert.ok(rms(L, 1.5 * FS, 2 * FS) > 0.01, `key ${key}`); }
});
test('letting the key off fades the note away (smorzando): it rings down at the bar\'s σ₁ once off the glass', () => {
  const key = 60, b = M.bar(key, P());
  const { L } = run(P(), [[0, 'on', key, 0.5], [1, 'off', key]], 3);
  const r1 = rms(L, 1.4 * FS, 1.6 * FS), r2 = rms(L, 2.4 * FS, 2.6 * FS), sigma = Math.log(r1 / r2);
  near(sigma, b.modes[0].sigma, 0.15 * b.modes[0].sigma, 'decay rate (1/s)');
});
test('aftertouch presses harder: a key too light to speak sings when pressure arrives', () => {
  const key = 84, { N, b } = threshold(key, P()), p = P({ press: (0.7 * N) / b.reg });
  const { L } = run(p, [[0, 'on', key, 0.5], [0.8, 'pressure', 1, key]], 2.5);
  assert.ok(rms(L, 2 * FS, 2.5 * FS) > 10 * rms(L, 0.4 * FS, 0.8 * FS), `${rms(L, 0.4 * FS, 0.8 * FS)} → ${rms(L, 2 * FS, 2.5 * FS)}`);
});
test('the cylinder: a light flywheel lets a ten-bar chord slow it, a heavy one hardly; the foot brings it back', () => {
  const keys = [48, 52, 55, 60, 64, 67, 72, 76, 79, 84], slow = {};
  for (const fly of [0.4, 10]) {
    let least = Infinity;
    const { e } = run(P({ flywheel: fly }), keys.map((k) => [0, 'on', k, 0.7]), 4, { hook: (e) => { least = Math.min(least, e.cylinder.W); } });
    slow[fly] = { dip: 1 - least / (2 * PI * DEFAULTS.speed), end: e.cylinder.W / (2 * PI * DEFAULTS.speed) };
  }
  assert.ok(slow[0.4].dip > 2 * slow[10].dip && slow[0.4].dip > 0.02, `light ${(100 * slow[0.4].dip).toFixed(2)} %, heavy ${(100 * slow[10].dip).toFixed(2)} %`);
  near(slow[0.4].end, 1, 0.05, 'back to speed');
});

console.log('safety');
test('output level: a held note peaks 0.03–0.6 anywhere on the keyboard, at any velocity', () => {
  for (const key of [21, 36, 48, 60, 72, 84, 89, 108]) for (const vel of [0.1, 1]) {
    const { L, R } = hold(key, vel, 1.5, P({ fullRange: true })), p = peak(L, R);
    assert.ok(p > 0.03 && p < 0.6, `key ${key}, velocity ${vel}: ${p.toFixed(3)}`);
  }
});
test('every preset, played at the computer keys\' touch, peaks below 0.6', () => {
  for (const pr of PRESETS) for (const k of [40, 60, 67, 81]) {
    const { L, R } = hold(k, DEFAULTS.velocity, 2, P(pr.p)), p = peak(L, R);
    assert.ok(p < 0.6, `${pr.name}, key ${k}: ${p.toFixed(2)}`);
  }
});
test('every parameter at its min and max: finite, bounded, and silent after a release', () => {
  const ids = GROUPS.flatMap((g) => g.params).filter((p) => p.type !== 'select' && p.type !== 'checkbox' && p.min !== undefined);
  for (const p of ids) for (const val of [p.min, p.max]) {
    const { L, R } = run(P({ [p.id]: val }), [[0, 'on', 40, 1], [0, 'on', 64, 1], [0, 'on', 88, 1], [0.8, 'off', 40], [0.8, 'off', 64], [0.8, 'off', 88]], 1.2);
    for (let i = 0; i < L.length; i++) if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) throw new Error(`${p.id}=${val}: NaN at ${i}`);
    assert.ok(peak(L, R) < 2, `${p.id}=${val}: peak ${peak(L, R)}`);
  }
  for (const build of [1, 2]) { const { L, R } = hold(72, 1, 1, P({ build })); assert.ok(peak(L, R) < 0.6, `build ${build}`); }
  const { e } = run(P({ t60: 0.5 }), [[0, 'on', 60, 1], [0.5, 'off', 60]], 4);
  assert.equal(e.voiceCount(), 0, 'voice retired after ringing out');
});
test('no clicks: onsets and releases are smooth (largest step < 3 × the held note\'s)', () => {
  const { L } = run(P(), [[0.05, 'on', 69, 1], [1.0, 'off', 69], [1.3, 'on', 76, 1], [1.8, 'off', 76]], 2.4);
  const d = []; for (let i = 1; i < L.length; i++) d.push(Math.abs(L[i] - L[i - 1]));
  const typ = Math.max(...d.slice(0.6 * FS, 0.9 * FS));
  for (const [t0, t1] of [[0.04, 0.2], [0.95, 1.1], [1.29, 1.45], [1.75, 1.9]]) {
    const mx = Math.max(...d.slice(t0 * FS, t1 * FS));
    assert.ok(mx < 3 * typ, `${t0}–${t1} s: step ${mx.toExponential(2)} vs held ${typ.toExponential(2)}`);
  }
});
test('Quality: Medium and Low play 4 and 2 modes and let fewer released bars ring (24, 12), never a held one; a bar keeps its pitch (1 ¢) and level (1.5 dB)', () => {
  const first = Array.from({ length: 14 }, (_, i) => 48 + 2 * i), then = first.map((k) => k + 1);
  const ev = [...first.map((k) => [0, 'on', k, 0.7]), ...first.map((k) => [0.8, 'off', k]), ...then.map((k, i) => [1 + 0.02 * i, 'on', k, 0.7])];
  const res = [];
  for (const [quality, cap, modes] of [['high', 88, 8], ['medium', 24, 4], ['low', 12, 2]]) {
    let most = 0;
    const { L, e } = run(P(), ev, 1.6, { quality, hook: (e) => { most = Math.max(most, e.voiceCount()); } }), v = e.voices;
    for (const x of L) assert.ok(Number.isFinite(x), `${quality}: not finite`);
    assert.ok(most <= Math.max(cap, 14) + 1, `${quality}: ${most} bars at once`);
    assert.equal(v.filter((x) => x.touch).length, 14, `${quality}: every held bar sounds`);
    for (const x of v) assert.ok(x.N <= modes, `${quality}: key ${x.key} plays ${x.N} modes`);
    res.push(`${quality} ${most} bars`);
  }
  for (const key of [40, 60, 72, 86]) {
    const hi = hold(key, 0.6, 1.5).L, f = keyFreq(key), f0 = peakFreq(hi, 0.9 * FS, 1.5 * FS, f), l0 = rms(hi, 0.9 * FS, 1.5 * FS);
    for (const quality of ['medium', 'low']) {
      const x = hold(key, 0.6, 1.5, P(), { quality }).L;
      const c = cents(peakFreq(x, 0.9 * FS, 1.5 * FS, f), f0), d = dB(rms(x, 0.9 * FS, 1.5 * FS) / l0);
      assert.ok(Math.abs(c) < 1, `${quality}, key ${key}: ${c.toFixed(2)} ¢ from High`);
      assert.ok(Math.abs(d) < 1.5, `${quality}, key ${key}: ${d.toFixed(2)} dB from High`);
      if (key === 60) res.push(`${quality} C4 ${c.toFixed(2)} ¢ ${d.toFixed(2)} dB`);
    }
  }
  console.log(`        ${res.join('; ')}`);
});
test('CPU: 10 bars held at once render well under real time', () => {
  const keys = [48, 52, 55, 60, 64, 67, 72, 76, 79, 84], t0 = performance.now();
  run(P(), keys.map((k) => [0, 'on', k, 0.7]), 3);
  const frac = (performance.now() - t0) / 1000 / 3;
  assert.ok(frac < 0.3, `${(frac * 100).toFixed(1)} % of real time`);
  console.log(`        10 voices: ${(frac * 100).toFixed(1)} % of real time`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
