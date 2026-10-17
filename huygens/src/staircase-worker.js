// staircase-worker.js — maps where two lamps lock, for the current circuit:
// the devil's staircase at the current coupling, and the Arnold tongues over a
// range of couplings, for C4 plus a second lamp at every natural interval
// (each point from staircase.js). With `wasm` it takes the WebAssembly model (huygens-wasm.js),
// as the page's views do once it has loaded.

import { stairPoint, exactMap } from './staircase.js';
import { deltaOf } from './sync-theory.js';

let job = 0, wasm = null;
self.onmessage = async (ev) => {
  const { P, step = 2, rows = 24, kmax = 0.15, full = true } = ev.data;
  const my = ++job;
  let model;
  if (ev.data.wasm) {
    try { model = await (wasm ??= import('./huygens-wasm.js').then((m) => m.wasmModel())); } catch (err) { console.warn(`huygens: the lock map's WebAssembly did not load (${err.message})`); }
    if (my !== job) return;
  }
  const xs = [];
  for (let c = 0; c <= 1200; c += step) xs.push(c);
  // 1) staircase at the current coupling
  const stair = Float64Array.from(xs, (c) => stairPoint(P, c, P.kick, model)[0]);
  self.postMessage({ type: 'stair', job: my, xs, ys: stair, exact: exactMap(P), delta: (model ?? { deltaOf }).deltaOf(P.kick, P.vNom, P.vStrike, P.vExt), engine: model ? 'wasm' : 'js' });
  if (!full) return;
  // 2) tongue map, row by row (coarser in x)
  const tx = xs.filter((_, i) => i % 2 === 0);
  for (let r = 0; r < rows; r++) {
    if (my !== job) return;
    const kick = (kmax * (r + 0.5)) / rows;
    const row = tx.map((c) => stairPoint(P, c, kick, model)[1]);
    self.postMessage({ type: 'row', job: my, r, rows, kick, xs: tx, row });
    await new Promise((res) => setTimeout(res, 0));                // let a newer job in
  }
};
