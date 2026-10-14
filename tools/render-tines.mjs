// Render tine-piano demos, each isolating one physical effect, to examples/tines/*.wav
// Usage: node tools/render-tines.mjs

import { mkdirSync } from 'node:fs';
import { computeKey } from '../tines/src/tine.js';
import { RhodesEngine } from '../tines/src/rhodes-engine.js';
import { DEFAULTS, PRESETS } from '../tines/src/rhodes-params.js';
import { roomIR } from '../shared/impulses.js';
import { convolve, writeWav, FS_SHIM, webAudioIR } from './audio-util.mjs';

const FS = 48000;
const preset = (i) => ({ ...DEFAULTS, ...PRESETS[i].p });

// events: [t, 'on', key, vel] | [t, 'off', key] | [t, 'sus', bool]
function render(P, seconds, events) {
  const e = new RhodesEngine(FS);
  e.setParams(P);
  const data = new Map();
  const vd = (k) => { if (!data.has(k)) data.set(k, { ...computeKey(k, P, FS).voice, version: 1 }); return data.get(k); };
  const n = Math.round(seconds * FS), L = new Float64Array(n), R = new Float64Array(n);
  const bl = 64, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, type, a, b]) => ({ s: Math.round(t * FS), type, a, b })).sort((x, y) => x.s - y.s);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j].s <= s) {
      const { type, a, b } = ev[j++];
      if (type === 'on') e.noteOn(a, vd(a), b); else if (type === 'off') e.noteOff(a); else e.setSustain(a);
    }
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; R[s + i] = bR[i]; }
  }
  return [L, R];
}
const chord = (t0, t1, keys, vel) => keys.flatMap((k) => [[t0, 'on', k, vel], [t1, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

const room = roomIR(FS_SHIM(FS), 1.8);
const RN = webAudioIR(room, FS); // as the page's ConvolverNode scales it
const finish = (out, amt = 0.2) => out.map((x, ch) => { const r = convolve(x, RN[ch]); return x.map((v, i) => v + 0.6 * amt * r[i]); });

const demos = [
  ['01-stage-piano-phrase', () => finish(render(preset(0), 9, [
    ...chord(0.0, 1.4, [48, 52, 55, 59], 1.6), ...chord(0.0, 1.4, [36], 2.0),
    ...chord(1.5, 2.9, [50, 53, 57, 60], 1.8), ...chord(1.5, 2.9, [38], 2.2),
    ...chord(3.0, 4.4, [55, 59, 62, 65], 2.4), ...chord(3.0, 4.4, [43], 2.6),
    [4.6, 'on', 72, 1.2], [4.9, 'off', 72], [4.9, 'on', 76, 1.6], [5.2, 'off', 76], [5.2, 'on', 79, 2.2], [5.5, 'off', 79], [5.5, 'on', 83, 3.2], [7.5, 'off', 83],
    ...chord(5.5, 8.2, [48, 52, 55, 59], 2.0), ...chord(5.5, 8.2, [36], 2.4),
  ]))],
  ['02-same-note-pp-to-ff-pickup-bark', () => finish(render(preset(0), 7, [0.3, 0.6, 1.2, 2.4, 4.0, 5.0].flatMap((v, i) => [[0.05 + 1.1 * i, 'on', 57, v], [1.0 + 1.1 * i, 'off', 57]])))],
  ['03-pickup-voicing-centred-then-off-centre', () => finish(cat(
    render({ ...DEFAULTS, offset: 0 }, 2.2, chord(0.05, 2.0, [57], 2.5)),
    render({ ...DEFAULTS, offset: 0.4 }, 2.2, chord(0.05, 2.0, [57], 2.5)),
    render({ ...DEFAULTS, offset: 0.9 }, 2.2, chord(0.05, 2.0, [57], 2.5))))],
  ['04-tone-bar-matched-then-removed', () => finish(cat(
    render(preset(0), 5, chord(0.05, 4.8, [69], 2.2)),
    render(preset(5), 3, chord(0.05, 2.8, [69], 2.2))))],
  ['05-tone-bar-detuned-40-cents', () => finish(render(preset(6), 5, chord(0.05, 4.8, [69], 2.2)))],
  ['06-strike-point-default-then-at-clamp', () => finish(cat(
    render(preset(0), 2.4, [0.05, 0.6, 1.15].flatMap((t, i) => [[t, 'on', [64, 69, 76][i], 2.2], [t + 0.5, 'off', [64, 69, 76][i]]])),
    render(preset(4), 2.4, [0.05, 0.6, 1.15].flatMap((t, i) => [[t, 'on', [64, 69, 76][i], 2.2], [t + 0.5, 'off', [64, 69, 76][i]]]))))],
  ['07-suitcase-stereo-vibrato', () => finish(render(preset(8), 7, [...chord(0.1, 3.2, [53, 57, 60, 64], 1.8), ...chord(3.4, 6.5, [55, 59, 62, 65], 1.8), ...chord(0.1, 6.5, [41], 2.2)]))],
];

mkdirSync(new URL('../examples/tines/', import.meta.url), { recursive: true });
for (const [name, fn] of demos) {
  const t0 = performance.now();
  const out = fn();
  let pk = 0;
  for (const ch of out) for (const v of ch) pk = Math.max(pk, Math.abs(v));
  writeWav(new URL(`../examples/tines/${name}.wav`, import.meta.url), out, 0.7 / pk, FS);
  console.log(`examples/tines/${name}.wav  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}
