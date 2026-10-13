// Precompute Kerr QNM frequencies for the ringdown keyboard.
// Usage: node tools/qnm-table.mjs   → ringdown/data/qnm-table.json
//
// Grid in u = −log10(1 − a): dense from Schwarzschild (u = 0) to
// a = 1 − 10⁻⁶ (u = 6). Each mode is tracked continuously in spin.

import { writeFileSync } from 'node:fs';
import { trackQNM } from '../ringdown/src/qnm.js';

const us = [];
for (let a = 0; a < 0.9 - 1e-9; a += 0.025) us.push(-Math.log10(1 - a));
for (let u = 1; u <= 6 + 1e-9; u += 1 / 16) us.push(u);
const spins = us.map((u) => 1 - 10 ** -u);

const modes = [];
const t0 = performance.now();
for (let l = 2; l <= 4; l++) {
  for (let m = -l; m <= l; m++) {
    for (let n = 0; n <= 2; n++) {
      const tr = trackQNM(l, m, n, spins);
      const bad = tr.filter((p) => !p.ok).length;
      modes.push({
        l, m, n, bad,
        re: tr.map((p) => +p.omega.re.toPrecision(8)),
        im: tr.map((p) => +p.omega.im.toPrecision(8)),
      });
      process.stdout.write(`(${l},${m},${n})${bad ? `!${bad}` : ''} `);
    }
  }
}
console.log(`\n${modes.length} modes × ${spins.length} spins in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
writeFileSync(new URL('../ringdown/data/qnm-table.json', import.meta.url), JSON.stringify({
  note: 'Kerr gravitational QNMs (s = -2), M omega with M = 1, by Leaver continued fractions. u = -log10(1 - a).',
  u: us.map((u) => +u.toPrecision(8)), modes,
}));
