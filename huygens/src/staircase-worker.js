// staircase-worker.js — maps where two oscillators lock, for the current
// circuit: the devil's staircase at the current coupling, and the Arnold
// tongues over a range of couplings. Each point is a short simulation of
// C4 plus a second oscillator at a given natural interval.

import { NeonEngine } from './neon-engine.js';
import { nearestRatio } from './tuning.js';

const FS = 24000;                  // plenty for locking; 2× faster
const F0 = 261.6256;

function simulate(P, cents, kick) {
  const e = new NeonEngine(FS);
  e.setParams({ ...P, kick, pitchHold: 0, drift: 0, attack: 0.001 });
  e.noteOn(60, { f: F0 });
  e.noteOn(61, { f: F0 * 2 ** (cents / 1200) });
  const L = new Float32Array(256), R = new Float32Array(256);
  for (let s = 0; s < 0.5 * FS; s += 256) e.process(L, R, 256);
  const [a, b] = e.report(0.3);
  if (!a.f || !b.f) return null;
  return 1200 * Math.log2(b.f / a.f);
}

let job = 0;
self.onmessage = async (ev) => {
  const { P, step = 2, rows = 24, kmax = 0.15, full = true } = ev.data;
  const my = ++job;
  const xs = [];
  for (let c = 0; c <= 1200; c += step) xs.push(c);
  // 1) staircase at the current coupling
  const stair = new Float64Array(xs.length);
  xs.forEach((c, i) => { stair[i] = simulate(P, c, P.kick) ?? NaN; });
  self.postMessage({ type: 'stair', job: my, xs, ys: stair });
  if (!full) return;
  // 2) tongue map, row by row (coarser in x)
  const tx = xs.filter((_, i) => i % 2 === 0);
  for (let r = 0; r < rows; r++) {
    if (my !== job) return;
    const kick = (kmax * (r + 0.5)) / rows;
    const row = tx.map((c) => {
      const m = simulate(P, c, kick);
      if (m === null) return 0;
      const nr = nearestRatio(2 ** (m / 1200), 8);
      return Math.abs(nr.cents) < 0.6 ? nr.p * 100 + nr.q : 0;   // encode p:q, 0 = not locked
    });
    self.postMessage({ type: 'row', job: my, r, rows, kick, xs: tx, row });
    await new Promise((res) => setTimeout(res, 0));                // let a newer job in
  }
};
