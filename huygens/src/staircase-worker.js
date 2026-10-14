// staircase-worker.js — maps where two lamps lock, for the current circuit:
// the devil's staircase at the current coupling, and the Arnold tongues over a
// range of couplings, for C4 plus a second lamp at every natural interval
// (each point from staircase.js).

import { stairPoint, exactMap } from './staircase.js';
import { deltaOf } from './sync-theory.js';

let job = 0;
self.onmessage = async (ev) => {
  const { P, step = 2, rows = 24, kmax = 0.15, full = true } = ev.data;
  const my = ++job;
  const xs = [];
  for (let c = 0; c <= 1200; c += step) xs.push(c);
  // 1) staircase at the current coupling
  const stair = Float64Array.from(xs, (c) => stairPoint(P, c, P.kick)[0]);
  self.postMessage({ type: 'stair', job: my, xs, ys: stair, exact: exactMap(P), delta: deltaOf(P.kick, P.vNom, P.vStrike, P.vExt) });
  if (!full) return;
  // 2) tongue map, row by row (coarser in x)
  const tx = xs.filter((_, i) => i % 2 === 0);
  for (let r = 0; r < rows; r++) {
    if (my !== job) return;
    const kick = (kmax * (r + 0.5)) / rows;
    const row = tx.map((c) => stairPoint(P, c, kick)[1]);
    self.postMessage({ type: 'row', job: my, r, rows, kick, xs: tx, row });
    await new Promise((res) => setTimeout(res, 0));                // let a newer job in
  }
};
