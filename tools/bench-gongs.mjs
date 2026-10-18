// Real-time load of the gong engine, block by block, as the AudioWorklet sees it.
// Usage: node tools/bench-gongs.mjs [fs]
//
// Each scenario plays a 16-note melody, one note every 0.25 s, then rings for
// 2 s. Reported: the mean load (time / real time), and the worst and 99th-
// percentile single 128-sample block as a fraction of its budget (2.67 ms at
// 48 kHz). Also the cost of constructing the engine and of the first noteOn.

import { INSTRUMENT, DEFAULTS } from '../gongs/src/gongs-instrument.js';
import { loadEngine } from './engine.mjs';

const GongEngine = await loadEngine(INSTRUMENT);

const FS = +process.argv[2] || 48000, N = 128, budget = (1000 * N) / FS;
const MID = [60, 62, 64, 65, 67, 69, 71, 72, 74, 72, 71, 69, 67, 65, 64, 62];
const WIDE = [36, 48, 55, 60, 64, 67, 72, 76, 84, 79, 72, 67, 60, 55, 48, 43];
const scenarios = [
  ['ff melody, pedal held', MID, 1, true],
  ['ff wide melody, pedal held', WIDE, 1, true],
  ['mf melody, no pedal', MID, 0.6, false],
  ['ff melody, no pedal', MID, 1, false],
];

export function bench(keys, vel, pedal, P = DEFAULTS) {
  const e = new GongEngine(FS);
  e.setParams(P);
  e.setSustain(pedal);
  const L = new Float32Array(N), R = new Float32Array(N), times = [];
  const step = Math.round((0.25 * FS) / N), total = Math.round(((keys.length * 0.25 + 2) * FS) / N);
  let on = 0;
  for (let b = 0; b < total; b++) {
    const t0 = performance.now();
    if (b % step === 0 && b / step < keys.length) {
      const k = keys[b / step];
      const t1 = performance.now(); e.noteOn(k, vel); on = Math.max(on, performance.now() - t1);
      if (!pedal) e.noteOff(keys[b / step - 1] ?? -1);
    }
    e.process(L, R, N);
    times.push(performance.now() - t0);
  }
  const sorted = times.slice().sort((a, b) => a - b), sum = times.reduce((a, b) => a + b, 0);
  return { mean: sum / (times.length * budget), max: sorted[sorted.length - 1] / budget, p99: sorted[Math.floor(0.99 * sorted.length)] / budget, noteOn: on, voices: e.voiceCount() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let t = performance.now();
  const e = new GongEngine(FS);
  const ctor = performance.now() - t;
  e.setParams(DEFAULTS);
  t = performance.now(); e.noteOn(60, 1); const first = performance.now() - t;
  console.log(`fs ${FS}: constructor ${ctor.toFixed(1)} ms, first noteOn ${first.toFixed(1)} ms`);
  for (const [name, keys, vel, pedal] of scenarios) {
    const r = bench(keys, vel, pedal);
    console.log(`${name.padEnd(28)} mean ${(100 * r.mean).toFixed(1).padStart(5)} %   worst block ${(100 * r.max).toFixed(0).padStart(4)} %   p99 ${(100 * r.p99).toFixed(0).padStart(3)} %   slowest noteOn ${r.noteOn.toFixed(2)} ms`);
  }
}
