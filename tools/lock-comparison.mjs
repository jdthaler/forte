// Why the Huygens keyboard uses relaxation oscillators: the same experiment —
// C4 with an equal-tempered fifth (−2.0 ¢ from 3:2) or major third
// (+13.7 ¢ from 5:4), coupled through a shared medium — run on three kinds of
// self-oscillator. Prints how far each interval stays from just intonation.
// Usage: node tools/lock-comparison.mjs        (takes ~1 minute)

import { stringModel } from '../huygens/experiments/bowed-string.js';
import { SyncEngine } from '../huygens/experiments/bowed-engine.js';
import { PipeEngine } from '../huygens/experiments/reed-pipe-engine.js';
import { NeonEngine } from '../huygens/src/neon-engine.js';
import { keyFreq } from '../huygens/src/tuning.js';

const FS = 48000, c = (r) => 1200 * Math.log2(r);
const pairs = [[67, 1.5, 'fifth'], [64, 1.25, 'major third']];
function measure(make, sec = 2.5) {
  const { e, report } = make();
  const L = new Float32Array(128), R = new Float32Array(128);
  for (let s = 0; s < sec * FS; s += 128) e.process(L, R, 128);
  const r = report(e);
  return r[0].f && r[1].f ? r[1].f / r[0].f : NaN;
}
const fmt = (x) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(2)} ¢` : 'stopped');

console.log('\nBowed strings on a shared resistive bridge (string Q ~ 1000)');
const sBase = { tuning: 'et', tonic: 0, mistune: 0, inharm: 0, bowPos: 0.11, maxFreq: 12000, loss: 1, mus: 0.8, mud: 0.3 };
for (const coupling of [0, 0.3, 0.5]) {
  const row = pairs.map(([k, ratio, name]) => `${name} ${fmt(c(measure(() => {
    const e = new SyncEngine(FS); e.setParams({ pressure: 0.8 });
    for (const key of [60, k]) e.noteOn(key, { ...stringModel(key, { ...sBase, coupling }, FS), version: 1 }, 0.2);
    return { e, report: (x) => x.report(1.0) };
  }) / ratio))}`);
  console.log(`  bridge damping ${stringModel(60, { ...sBase, coupling }, FS).sigmaBridge.toFixed(0).padStart(3)} s⁻¹   ${row.join('   ')}`);
}

console.log('\nReed pipes on a shared windchest (pipe Q ~ 20)');
const pipe = (f) => { const freq = [], Q = [], A = [], rad = []; for (let n = 1; n * f < 6000; n++) { freq.push(n * f); Q.push(20 * Math.sqrt(n)); A.push(40 / Math.sqrt(n)); rad.push(n); } return { n: freq.length, freq, Q, A, rad, f1: f, fTarget: f, version: 1 }; };
for (const kappa of [0, 300, 1000]) {
  const row = pairs.map(([k, ratio, name]) => `${name} ${fmt(c(measure(() => {
    const e = new PipeEngine(FS); e.setParams({ kappa });
    for (const key of [60, k]) e.noteOn(key, pipe(keyFreq(key)));
    return { e, report: (x) => x.report(1.0) };
  }) / ratio))}`);
  console.log(`  chest κ ${String(kappa).padStart(4)} s⁻¹       ${row.join('   ')}`);
}

console.log('\nNeon relaxation oscillators, pulse-coupled (no resonator)');
for (const kick of [0, 0.01, 0.03]) {
  const row = pairs.map(([k, ratio, name]) => `${name} ${fmt(c(measure(() => {
    const e = new NeonEngine(FS); e.setParams({ kick, pitchHold: 0 });
    for (const key of [60, k]) e.noteOn(key, { f: keyFreq(key) });
    return { e, report: (x) => x.report(1.0) };
  }) / ratio))}`);
  console.log(`  kick ${(kick * 100).toFixed(0).padStart(2)} %             ${row.join('   ')}`);
}
console.log('\nLocked = 0.00 ¢. Adler: lock range ≈ (injection)/(2Q) — the resonator’s Q sets how hard an oscillator is to pull.');
