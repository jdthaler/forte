// Render short organ demos, each isolating one physical effect, to examples/organ/*.wav
// Usage: node tools/render-organ.mjs

import { mkdirSync } from 'node:fs';
import { OrganEngine } from '../organ/src/organ-engine.js';
import { buildGenerator } from '../organ/src/tonewheels.js';
import { DEFAULTS, PRESETS } from '../organ/src/organ-params.js';
import { roomIR } from '../shared/impulses.js';
import { convolve, writeWav, FS_SHIM } from './audio-util.mjs';

const FS = 48000;
const reg = (s) => s.replace(/\s/g, '').split('').map(Number);
const preset = (i) => ({ ...DEFAULTS, ...PRESETS[i].p });

// events: [time, 'down'|'up', key] or [time, 'set', {params}]
function render(P0, seconds, events) {
  const e = new OrganEngine(FS);
  let P = { ...P0 };
  e.setParams(P);
  e.configure(buildGenerator(P, FS));
  const n = Math.round(seconds * FS), L = new Float64Array(n), R = new Float64Array(n);
  const bl = 64, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, type, x]) => ({ s: Math.round(t * FS), type, x })).sort((a, b) => a.s - b.s);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j].s <= s) {
      const { type, x } = ev[j++];
      if (type === 'down') e.keyDown(x); else if (type === 'up') e.keyUp(x);
      else {
        const gen = Object.keys(x).some((k) => ['tuning', 'mains', 'wheelHarm', 'crosstalk', 'leakage'].includes(k));
        P = { ...P, ...x }; e.setParams(x);
        if (gen) e.configure(buildGenerator(P, FS));
      }
    }
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; R[s + i] = bR[i]; }
  }
  return [L, R];
}
const chord = (t0, t1, keys) => keys.flatMap((k) => [[t0, 'down', k], [t1, 'up', k]]);

const room = roomIR(FS_SHIM(FS), 1.8);
const unit = (d) => { let e = 0; for (const v of d) e += v * v; return d.map((v) => v / Math.sqrt(e)); };
const RN = [unit(room.getChannelData(0)), unit(room.getChannelData(1))];
function finish(out, roomAmt = 0.2) {
  return out.map((x, ch) => {
    const r = convolve(x, RN[ch]);
    return x.map((v, i) => v + 0.6 * roomAmt * r[i]);
  });
}

const demos = [
  ['01-jazz-comping-perc-3rd-leslie-slow', () => {
    const P = preset(0);
    const ev = [
      ...chord(0.0, 0.45, [50, 53, 57, 60]), ...chord(0.6, 1.0, [50, 53, 57, 60]),
      ...chord(1.2, 2.3, [55, 59, 62, 65]), // legato line on top: percussion does not re-trigger
      [1.5, 'down', 69], [1.8, 'up', 69], [1.75, 'down', 67], [2.1, 'up', 67],
      ...chord(2.5, 4.2, [48, 52, 55, 59, 62]),
      ...chord(4.5, 4.75, [72]), ...chord(4.8, 5.05, [74]), ...chord(5.1, 5.35, [76]), ...chord(5.4, 6.5, [79]),
    ];
    return finish(render(P, 7.5, ev));
  }],
  ['02-full-organ-leslie-slow-fast-slow', () => {
    const P = { ...preset(1), leslie: 'slow' };
    return finish(render(P, 10, [...chord(0.1, 9.0, [48, 55, 60, 64, 67]), [2.5, 'set', { leslie: 'fast' }], [6.0, 'set', { leslie: 'slow' }]]));
  }],
  ['03-motor-switched-off-mid-chord', () => {
    const P = { ...preset(0), percOn: false };
    return finish(render(P, 9, [...chord(0.1, 8.8, [48, 55, 60, 64]), [2.0, 'set', { motor: false }]]));
  }],
  ['04-tuning-real-gears-then-ideal-harmonics', () => {
    const base = { ...preset(8), drawbars: reg('888888888') };
    const a = render(base, 3.6, chord(0.1, 3.2, [48, 52, 55, 60]));
    const b = render({ ...base, tuning: 'harmonic' }, 3.6, chord(0.1, 3.2, [48, 52, 55, 60]));
    return finish([0, 1].map((c) => Float64Array.from([...a[c], ...b[c]])), 0.1);
  }],
  ['05-key-click-hard-contacts-then-click-filter', () => {
    const P = { ...preset(6), drawbars: reg('008800000'), bounce: 1, spread: 2 };
    const notes = [48, 52, 55, 60, 55, 52, 48];
    const ev = notes.flatMap((k, i) => [[0.1 + 0.3 * i, 'down', k], [0.3 + 0.3 * i, 'up', k]]);
    const ev2 = notes.flatMap((k, i) => [[2.6 + 0.3 * i, 'down', k], [2.8 + 0.3 * i, 'up', k]]);
    return finish(render(P, 5, [...ev, [2.4, 'set', { contactTime: 1500, bounce: 0 }], ...ev2]), 0.1);
  }],
  ['06-scanner-vibrato-V3-then-chorus-C3', () => {
    const P = { ...preset(6), drawbars: reg('008600000'), vib: 'V3', leslieOn: false };
    return finish(render(P, 7, [...chord(0.1, 3.1, [60, 64, 67]), [3.3, 'set', { vib: 'C3' }], ...chord(3.5, 6.6, [60, 64, 67])]));
  }],
  ['07-rock-grind-overdrive', () => {
    const P = preset(4);
    const ev = [...chord(0.0, 0.9, [43, 50, 55]), ...chord(1.0, 1.4, [46, 53, 58]), ...chord(1.5, 1.9, [48, 55, 60]), ...chord(2.0, 3.6, [43, 50, 55, 62]), [2.6, 'set', { leslie: 'fast' }]];
    return finish(render(P, 5, ev));
  }],
  ['08-mains-50Hz-on-a-60Hz-organ', () => {
    const P = { ...preset(3) };
    return finish(render(P, 6, [...chord(0.1, 2.4, [48, 55, 60, 64]), [2.6, 'set', { mains: 50 }], ...chord(2.8, 5.6, [48, 55, 60, 64])]));
  }],
];

mkdirSync(new URL('../examples/organ/', import.meta.url), { recursive: true });
for (const [name, fn] of demos) {
  const t0 = performance.now();
  const out = fn();
  let pk = 0;
  for (const ch of out) for (const v of ch) pk = Math.max(pk, Math.abs(v));
  writeWav(new URL(`../examples/organ/${name}.wav`, import.meta.url), out, 0.7 / pk, FS);
  console.log(`examples/organ/${name}.wav  peak-normalised  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}
