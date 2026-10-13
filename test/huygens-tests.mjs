// Huygens keyboard checks. Run: node test/huygens-tests.mjs
import assert from 'node:assert/strict';
import { NeonEngine } from '../huygens/src/neon-engine.js';
import { tunedFreq, keyFreq, nearestRatio } from '../huygens/src/tuning.js';
import { DEFAULTS } from '../huygens/src/sync-params.js';

const FS = 48000;
let failures = 0;
function test(name, fn) { try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const c = (r) => 1200 * Math.log2(r);

function run(keys, eng, sec = 2.5, P = DEFAULTS) {
  const e = new NeonEngine(FS);
  e.setParams({ pitchHold: 0, ...eng });
  for (const k of keys) e.noteOn(k, { f: tunedFreq(k, P) });
  const L = new Float32Array(128), R = new Float32Array(128);
  let pk = 0, finite = true;
  for (let s = 0; s < sec * FS; s += 128) {
    e.process(L, R, 128);
    for (const v of L) { if (!Number.isFinite(v)) finite = false; pk = Math.max(pk, Math.abs(v)); }
  }
  return { f: e.report(1.0).map((o) => o.f), pk, finite, e };
}

console.log('oscillators');
test('analytic firing times: an uncoupled oscillator plays its design pitch exactly', () => {
  for (const k of [36, 60, 96]) {
    const { f } = run([k], { kick: 0 });
    assert.ok(Math.abs(c(f[0] / keyFreq(k))) < 0.01, `${k}: ${c(f[0] / keyFreq(k))} ¢`);
  }
});
test('uncoupled ET intervals keep their ET values', () => {
  const { f } = run([60, 64, 67], { kick: 0 });
  assert.ok(Math.abs(c(f[1] / f[0]) - 400) < 0.05 && Math.abs(c(f[2] / f[0]) - 700) < 0.05);
});

console.log('locking');
test('pulse coupling locks simple ratios: fifth, major third, harmonic seventh', () => {
  const lock = (k2, p, q, kick) => { const { f } = run([60, k2], { kick }); return c(f[1] / f[0] / (p / q)); };
  assert.ok(Math.abs(lock(67, 3, 2, 0.02)) < 0.3, 'fifth');
  assert.ok(Math.abs(lock(64, 5, 4, 0.06)) < 0.3, 'third');
  assert.ok(Math.abs(lock(70, 7, 4, 0.1)) < 0.4, 'harmonic seventh');
});
test('minor second stays apart at 4% and merges into a unison at 6%; the ET tritone finds 7:5', () => {
  const { f } = run([60, 61], { kick: 0.04 });
  const nr = nearestRatio(f[1] / f[0], 9);
  assert.ok(Math.abs(nr.cents) > 1, `minor second sits ${nr.cents.toFixed(2)} ¢ from ${nr.p}:${nr.q}`);
  const m = run([60, 61], { kick: 0.06 }).f;
  assert.ok(Math.abs(c(m[1] / m[0])) < 0.3, 'unison capture');
  const t = run([60, 66], { kick: 0.08 }).f;
  assert.ok(Math.abs(c(t[1] / t[0] / 1.4)) < 0.3, 'septimal tritone');
});
test('weak coupling captures fifths before thirds (tongue width falls with ratio complexity)', () => {
  const { f: a } = run([60, 67], { kick: 0.015 });
  const { f: b } = run([60, 64], { kick: 0.015 });
  assert.ok(Math.abs(c(a[1] / a[0] / 1.5)) < 0.3);
  assert.ok(Math.abs(c(b[1] / b[0] / 1.25)) > 5);
});
test('mistuned keys are captured anyway', () => {
  const P = { ...DEFAULTS, mistune: 25 };
  const { f } = run([60, 64, 67], { kick: 0.08 }, 3, P);
  assert.ok(Math.abs(c(f[1] / f[0] / 1.25)) < 0.4 && Math.abs(c(f[2] / f[0] / 1.5)) < 0.4, `${c(f[1] / f[0] / 1.25)}, ${c(f[2] / f[0] / 1.5)}`);
});
test('pitch-hold servo keeps a locked chord at pitch; intervals stay locked', () => {
  const free = run([60, 64, 67, 70], { kick: 0.09, pitchHold: 0 }, 3);
  const held = run([60, 64, 67, 70], { kick: 0.09, pitchHold: 1 }, 3);
  const mean = (f) => [60, 64, 67, 70].reduce((s, k, i) => s + c(f[i] / keyFreq(k)), 0) / 4;
  assert.ok(mean(free.f) > 10 && Math.abs(mean(held.f)) < 2, `free ${mean(free.f).toFixed(1)} ¢, held ${mean(held.f).toFixed(1)} ¢`);
  assert.ok(Math.abs(c(held.f[1] / held.f[0] / 1.25)) < 0.4);
  console.log(`        4:5:6:7 chord: ${mean(free.f).toFixed(1)} ¢ sharp without the servo, ${mean(held.f).toFixed(1)} ¢ with it`);
});

console.log('robustness');
test('finite output and sane level across settings', () => {
  for (const eng of [{ kick: 0.15, rSrc: 200e3 }, { kick: 0, vNom: 400 }, { kick: 0.1, vNom: 100, vStrike: 95, vExt: 85, drift: 20, driftRate: 2 }]) {
    const r = run([36, 48, 55, 60, 64, 67, 70, 72, 84, 96], eng, 0.8);
    assert.ok(r.finite && r.pk < 5, JSON.stringify(eng));
  }
});
test('performance: 24 oscillators', () => {
  const e = new NeonEngine(FS); e.setParams({ kick: 0.08 });
  for (let i = 0; i < 24; i++) e.noteOn(36 + 2 * i, { f: keyFreq(36 + 2 * i) });
  const L = new Float32Array(128), R = new Float32Array(128);
  for (let i = 0; i < 50; i++) e.process(L, R, 128);
  const blocks = 2000, t0 = performance.now();
  for (let i = 0; i < blocks; i++) e.process(L, R, 128);
  const ms = performance.now() - t0, audio = (blocks * 128 * 1000) / FS;
  console.log(`        ${(100 * ms / audio).toFixed(1)} % of one core`);
  assert.ok(ms < 0.4 * audio);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
