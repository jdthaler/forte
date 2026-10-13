// Black-hole keyboard checks. Run: node test/blackhole-tests.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solveQNM, trackQNM, separationConstant, SCHWARZSCHILD, C } from '../blackhole/src/qnm.js';
import { QNMBank, keyVoice, swsh, uFromSpin, keyFreq, excitation } from '../blackhole/src/ringdown-model.js';
import { RingdownEngine } from '../blackhole/src/ringdown-engine.js';
import { DEFAULTS } from '../blackhole/src/ringdown-params.js';

let failures = 0;
function test(name, fn) { try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const close = (z, re, im, tol) => Math.abs(z.re - re) < tol && Math.abs(z.im - im) < tol;
const bank = new QNMBank(JSON.parse(readFileSync(new URL('../blackhole/data/qnm-table.json', import.meta.url))));

console.log('Leaver continued fractions');
test('Schwarzschild modes l = 2–4, n = 0–2 match the literature to 1e-6', () => {
  for (const l of [2, 3, 4]) for (let n = 0; n <= 2; n++) {
    const g = SCHWARZSCHILD[l][n];
    const r = solveQNM({ l, m: 1, n, a: 0, guess: C.cx(g.re * 1.03, g.im * 0.96) });
    assert.ok(close(r.omega, g.re, g.im, 1.5e-6), `(${l},${n}) ${r.omega.re} ${r.omega.im}`);
  }
});
test('Kerr (2,2,0): a = 0.9 → 0.671613 − 0.064869i (Berti et al.)', () => {
  const tr = trackQNM(2, 2, 0, [0, 0.3, 0.6, 0.8, 0.9]);
  assert.ok(close(tr[4].omega, 0.671613, -0.064869, 2e-6), JSON.stringify(tr[4].omega));
});
test('spheroidal eigenvalue: dA/dc at c = 0 equals −2s²m/(l(l+1))', () => {
  for (const [l, m] of [[2, 2], [3, 2], [4, -3]]) {
    const A = separationConstant(C.cx(1e-5), l, m, -2);
    const slope = (A.re - (l * (l + 1) - 2)) / 1e-5, expect = (-2 * 4 * m) / (l * (l + 1));
    assert.ok(Math.abs(slope - expect) < 1e-3, `(${l},${m}) ${slope} vs ${expect}`);
  }
});
test('near extremality the l = m modes approach Hod: ω → mΩ_H − 2πiT_H(n + ½)', () => {
  const spins = [0, 0.5, 0.8, 0.9, 0.95, 0.99, 0.995, 0.999, 0.9995, 0.9999, 0.99995, 0.99999, 0.999995, 0.999999];
  for (const [l, n] of [[2, 0], [3, 0], [2, 1]]) {
    const p = trackQNM(l, l, n, spins).at(-1), a = p.a;
    const rp = 1 + Math.sqrt(1 - a * a), OmH = a / (2 * rp), kT = Math.sqrt(1 - a * a) / (2 * rp);
    assert.ok(Math.abs(p.omega.re / (l * OmH) - 1) < 2e-4, `(${l},${l},${n}) re`);
    assert.ok(Math.abs(-p.omega.im / (kT * (n + 0.5)) - 1) < 2e-3, `(${l},${l},${n}) im`);
  }
});
test('continued-fraction depth is converged (N vs 2N) at a = 1 − 10⁻⁵, overtone 2', () => {
  const a = 1 - 1e-5, w = bank.omega(2, 2, 2, a);
  const r1 = solveQNM({ l: 2, m: 2, n: 2, a, guess: C.cx(w.re, w.im) });
  const r2 = solveQNM({ l: 2, m: 2, n: 2, a, guess: C.cx(w.re, w.im), N: 2 * r1.depth });
  assert.ok(C.abs(C.sub(r1.omega, r2.omega)) < 1e-9);
});

console.log('table and harmonics');
test('table interpolation matches fresh solves (< 0.1 ¢)', () => {
  for (const [l, m, n, a] of [[2, 2, 0, 0.42], [4, 4, 1, 0.97], [2, -2, 0, 0.88], [3, 2, 0, 0.99993]]) {
    const w = bank.omega(l, m, n, a), ex = solveQNM({ l, m, n, a, guess: C.cx(w.re, w.im) }).omega;
    assert.ok(Math.abs(w.re / ex.re - 1) < 5e-5 && Math.abs(w.im / ex.im - 1) < 2e-4, `(${l},${m},${n}) a=${a}`);
  }
});
test('l = m modes become a harmonic series 2 : 3 : 4 as a → 1', () => {
  const a = 1 - 1e-6, f2 = bank.omega(2, 2, 0, a).re;
  assert.ok(Math.abs(bank.omega(3, 3, 0, a).re / f2 - 1.5) < 1e-3 && Math.abs(bank.omega(4, 4, 0, a).re / f2 - 2) < 1e-3);
});
test('spin-weighted spherical harmonics: closed forms and unit norm', () => {
  const th = 0.7;
  assert.ok(Math.abs(swsh(-2, 2, 2, th) - Math.sqrt(5 / (64 * Math.PI)) * (1 + Math.cos(th)) ** 2) < 1e-12);
  assert.ok(Math.abs(swsh(-2, 2, 0, th) - Math.sqrt(15 / (32 * Math.PI)) * Math.sin(th) ** 2) < 1e-12);
  for (const [l, m] of [[3, 1], [4, -4], [4, 2]]) {
    let s = 0;
    for (let i = 0; i < 2000; i++) { const t = (Math.PI * (i + 0.5)) / 2000; s += swsh(-2, l, m, t) ** 2 * Math.sin(t) * (Math.PI / 2000) * 2 * Math.PI; }
    assert.ok(Math.abs(s - 1) < 1e-5, `(${l},${m}) norm ${s}`);
  }
});

console.log('merger excitation and sound');
test('equal masses switch off odd-m modes; lopsided mergers switch them on', () => {
  const eq = excitation({ massRatio: 1 }).base, lop = excitation({ massRatio: 8 }).base;
  assert.equal(eq['2,1'], 0); assert.equal(eq['3,3'], 0);
  assert.ok(lop['3,3'] > 0.2 * lop['2,2']);
});
test('face-on: circular polarisation (C₊ = C×); edge-on: h× vanishes for (2,2)', () => {
  const v0 = keyVoice(60, { ...DEFAULTS, inclination: 0 }, bank, 48000).modes.find((m) => m.l === 2 && m.m === 2 && m.n === 0);
  assert.ok(Math.abs(v0.cpr - v0.cxr) < 1e-12 && Math.abs(v0.cpi - v0.cxi) < 1e-12);
  const v90 = keyVoice(60, { ...DEFAULTS, inclination: 90, massRatio: 1 }, bank, 48000).modes.find((m) => m.l === 2 && m.m === 2 && m.n === 0);
  assert.ok(Math.hypot(v90.cxr, v90.cxi) < 1e-12 * Math.hypot(v90.cpr, v90.cpi) + 1e-15);
});
test('each key is tuned on its (2,2,0) mode; rendered pitch and decay match', () => {
  const P = { ...DEFAULTS, spinU: uFromSpin(0.999), massRatio: 1, overtones: 0, inclination: 0 };
  const v = keyVoice(57, P, bank, 48000);
  const m220 = v.modes.find((m) => m.l === 2 && m.m === 2 && m.n === 0);
  assert.ok(Math.abs(m220.f / keyFreq(57) - 1) < 1e-9);
  v.modes = [m220];
  const e = new RingdownEngine(48000); e.noteOn(v, 1);
  const n = 48000 * 0.3, L = new Float32Array(n), R = new Float32Array(n), bL = new Float32Array(128), bR = new Float32Array(128);
  for (let s = 0; s < n; s += 128) { e.process(bL, bR, 128); L.set(bL.subarray(0, Math.min(128, n - s)), s); }
  const zc = []; for (let i = 1; i < n; i++) if (L[i - 1] < 0 && L[i] >= 0) zc.push(i - 1 + L[i - 1] / (L[i - 1] - L[i]));
  const f = (48000 * (zc.length - 1)) / (zc.at(-1) - zc[0]);
  assert.ok(Math.abs(f / m220.f - 1) < 1e-4, `f ${f}`);
  const rms = (a, b) => Math.sqrt(L.slice(a, b).reduce((s, x) => s + x * x, 0) / (b - a));
  const gamma = Math.log(rms(2400, 4800) / rms(9600, 12000)) / 0.15;
  assert.ok(Math.abs(gamma / m220.gamma - 1) < 0.02, `γ ${gamma} vs ${m220.gamma}`);
});
test('inspiral chirps up and hands over to the ringdown', () => {
  const v = keyVoice(57, { ...DEFAULTS, inspiral: true, inspiralOct: 2 }, bank, 48000);
  const e = new RingdownEngine(48000); e.noteOn(v, 1);
  const L = new Float32Array(128), R = new Float32Array(128);
  let fPrev = 0, mono = true, ringAt = null;
  for (let s = 0; s < 48000 * 2 && !ringAt; s += 128) {
    e.process(L, R, 128);
    const c = e.voices[0].chirp;
    if (c.stage < 3) { if (c.f < fPrev - 1e-9) mono = false; fPrev = c.f; }
    if (e.voices[0].ring) ringAt = s;
  }
  assert.ok(mono && ringAt > 0);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
