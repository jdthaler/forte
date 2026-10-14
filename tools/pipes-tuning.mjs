// Tune the Pipe Organ's pipes in the engine: blow each pipe alone at the default wind and voicing
// (48 kHz), measure how far it sounds from the frequency the linear analysis promised, and write the
// correction as a function of frequency to pipes/src/tuning-table.js, as a voicer tunes a pipe by
// cutting it. Three passes, starting from the table already there.
// Usage: node tools/pipes-tuning.mjs

import { writeFileSync } from 'node:fs';
import { PipeEngine, OS_FREQ } from '../pipes/src/pipes-engine.js';
import { DEFAULTS } from '../pipes/src/pipes-params.js';
import { TUNING } from '../pipes/src/tuning-table.js';
import { pipeModel, pipeFreq, F_MAX, KEY_LO, KEY_HI, RANKS } from '../pipes/src/pipes-model.js';

const FS = 48000, TAU = 2 * Math.PI;
// sounding frequency of x near f over [a, b): phase advance of the demodulated signal, over 64
// samples (unambiguous within ±375 Hz), then 512, then the whole span
function freqAt(x, f, a, b) {
  const m = 2048, ph = (s, fr) => { const w = (TAU * fr) / FS; let re = 0, im = 0; for (let i = s; i < s + m; i++) { const h = 0.5 - 0.5 * Math.cos((TAU * (i - s)) / m); re += h * x[i] * Math.cos(w * i); im -= h * x[i] * Math.sin(w * i); } return Math.atan2(im, re); };
  const wrap = (d) => d - TAU * Math.round(d / TAU);
  let fr = f;
  for (const lag of [64, 512, b - m - a]) fr += (wrap(ph(a + lag, fr) - ph(a, fr)) * FS) / (TAU * lag);
  return fr;
}
// One pipe sounding f, alone, on the Principal's slot of a key (the engine's models for that key are
// replaced by this one pipe).
function measure(f, stopped) {
  const e = new PipeEngine(FS);
  const P = { ...DEFAULTS, principal: true, octave: false, gedackt: false, mixture: false, noise: 0 };
  e.setParams(P);
  const R = pipeModel(f, stopped, P, { tune: TUNING.lookup(f, stopped) });
  e.modelsFor = () => [R, R, R, R, R, R];
  e.noteOn(60, 0.7);
  const n = Math.round(1.6 * FS), L = new Float64Array(n), bL = new Float32Array(128), bR = new Float32Array(128);
  for (let s = 0; s < n; s += 128) { e.process(bL, bR, 128); for (let i = 0; i < 128 && s + i < n; i++) L[s + i] = bL[i]; }
  return freqAt(L, f, Math.round(0.9 * FS), n);
}

const grid = { open: [], stopped: [] };
for (const [kind, lo, hi] of [['open', 60, 7000], ['stopped', 60, 1500]]) {
  for (let x = Math.log2(lo); x <= Math.log2(hi) + 1e-9; x += 1 / 6) grid[kind].push(x);
  // steps in the model: from OS_FREQ up the engine runs a pipe at twice the rate, and a mode drops out
  // where it would pass F_MAX: tune both sides of each step
  const steps = [OS_FREQ];
  for (let n = 1; n <= 12; n++) steps.push(F_MAX / (kind === 'stopped' ? 2 * n - 1 : n));
  for (const fb of steps) if (fb > lo && fb < hi) grid[kind].push(Math.log2(fb) - 1e-4, Math.log2(fb) + 1e-4);
  // and above 2 kHz, where the tuning bends between the steps, every pipe the organ has
  if (kind === 'open') for (let k = KEY_LO; k <= KEY_HI; k++) for (let r = 0; r < RANKS.length; r++) if (!RANKS[r].stopped && pipeFreq(k, r) > 2000) grid[kind].push(Math.log2(pipeFreq(k, r)));
  grid[kind] = [...new Set(grid[kind].map((x) => +x.toFixed(6)))].sort((a, b) => a - b);
}
for (let pass = 0; pass < 3; pass++) {
  const next = { open: [], stopped: [] };
  for (const kind of ['open', 'stopped']) {
    for (const x of grid[kind]) {
      const f = 2 ** x, fm = measure(f, kind === 'stopped');
      const t = TUNING.lookup(f, kind === 'stopped') * (f / fm);
      next[kind].push([+x.toFixed(6), +t.toFixed(7)]);
      if (pass === 2) console.log(kind, f.toFixed(1), 'Hz', (1200 * Math.log2(fm / f)).toFixed(2), '¢ before this pass, tune', t.toFixed(5));
    }
  }
  TUNING.table.open = next.open; TUNING.table.stopped = next.stopped;
}
const body = `// tuning-table.js — how far each pipe sounds from what the linear analysis predicts, measured in the
// engine at the default wind and voicing (48 kHz) by tools/pipes-tuning.mjs, which writes this file.
// The model multiplies the pipe's resonance by \`tune\` so that it sounds its note. Rows: [log2 f, tune].
const T = {
  open: ${JSON.stringify(TUNING.table.open)},
  stopped: ${JSON.stringify(TUNING.table.stopped)},
};
export const TUNING = {
  table: T,
  lookup(f, stopped) {
    const t = stopped ? T.stopped : T.open;
    if (!t.length) return 1;
    const x = Math.log2(f);
    if (x <= t[0][0]) return t[0][1];
    for (let i = 1; i < t.length; i++) if (x <= t[i][0]) { const [x0, y0] = t[i - 1], [x1, y1] = t[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
    return t[t.length - 1][1];
  },
};
`;
writeFileSync(new URL('../pipes/src/tuning-table.js', import.meta.url), body);
console.log('wrote pipes/src/tuning-table.js');
