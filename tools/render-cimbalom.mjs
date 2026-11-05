// Render cimbalom demos, each isolating one physical effect, to examples/cimbalom/*.wav
// Usage: node tools/render-cimbalom.mjs        (then node tools/encode-examples.mjs cimbalom)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS } from '../cimbalom/src/cimbalom-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const CimbalomEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'cimbalom';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (p, seconds, events) => { const e = new CimbalomEngine(FS); e.setParams(p); const out = renderEngine(e, seconds, events, FS); e.destroy?.(); return out; };
// a line: [key, beats] at a tempo, each note held a little short of the next
const line = (t0, beat, notes, vel, hold = 0.9) => {
  const ev = [];
  let t = t0;
  for (const [k, b] of notes) { if (k) ev.push([t, 'on', k, vel], [t + b * beat * hold, 'off', k]); t += b * beat; }
  return ev;
};
const chord = (t, keys, vel, len) => keys.flatMap((k) => [[t, 'on', k, vel], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

// a verbunkos-like phrase in D minor with the raised fourth, ending on a tremolo
const TUNE = [[62, 0.5], [65, 0.5], [69, 0.5], [74, 0.5], [73, 0.25], [74, 0.25], [73, 0.25], [70, 0.25], [69, 1],
  [68, 0.25], [69, 0.25], [70, 0.25], [69, 0.25], [68, 0.25], [65, 0.25], [64, 0.25], [62, 0.25], [61, 0.5], [64, 0.5], [62, 2.5]];
const B = 0.42;
const csardas = (p) => play(p, 9.5, [
  ...line(0.1, B, TUNE.slice(0, -1), 0.75),
  [0.1 + 9.5 * B, 'params', { ...p, roll: 13 }], [0.1 + 9.5 * B, 'on', 62, 0.7], [0.1 + 9.5 * B, 'on', 69, 0.6], [0.1 + 12 * B, 'off', 62], [0.1 + 12 * B, 'off', 69],
  ...chord(0.1, [38, 45, 50], 0.6, 4 * B), ...chord(0.1 + 4 * B, [45, 52, 57], 0.55, 4 * B), ...chord(0.1 + 8 * B, [45, 49, 55], 0.5, 1.4 * B), ...chord(0.1 + 9.5 * B, [38, 45, 50], 0.55, 2.5 * B),
]);
// a reel on the dulcimer: D major, its strings undamped
const REEL = [62, 66, 69, 74, 73, 69, 66, 69, 71, 67, 64, 67, 69, 66, 62, 66, 62, 66, 69, 74, 76, 74, 73, 71, 69, 71, 69, 66, 64, 62, 62, 0];
const reel = () => play(P({ build: 'dulcimer', head: 'wood', dampers: 'none', strike: 0.1, detune: 1.5 }), 7.5, [
  ...line(0.1, 0.17, REEL.map((k) => [k, 1]), 0.7, 1.4),
  ...[0, 8, 16, 24].flatMap((b, i) => chord(0.1 + b * 0.17, i === 1 ? [43, 55] : i === 3 ? [45, 57] : [50, 57], 0.55, 0.3)),
]);

const demos = [
  ['01-a-czardas-phrase-and-tremolo', () => csardas(P())],
  ['02-cotton-leather-bare-wood', () => cat(...['cotton', 'leather', 'wood'].map((head) => play(P({ head }), 2.2, [...chord(0.1, [57, 64], 0.8, 1.6), [0.6, 'on', 69, 0.85], [1.9, 'off', 69]])))],
  ['03-unisons-in-tune-then-mistuned', () => cat(
    play(P({ detune: 0, dampers: 'none', sympathy: 0 }), 6, [[0.1, 'on', 60, 0.8]]),
    play(P({ detune: 6, dampers: 'none', sympathy: 0 }), 6, [[0.1, 'on', 60, 0.8]]))],
  ['04-middle-then-near-the-bridge', () => cat(...[0.5, 0.12, 0.04].map((strike) => play(P({ strike }), 2.4, line(0.1, 0.4, [[55, 1], [62, 1], [67, 2]], 0.8))))],
  ['05-hammered-dulcimer-reel', reel],
  ['06-dampers-then-the-pedal-up', () => {
    const prog = (t) => [...chord(t, [48, 52, 55, 60], 0.8, 0.7), ...chord(t + 0.9, [53, 57, 60, 65], 0.8, 0.7), ...chord(t + 1.8, [55, 59, 62, 67], 0.85, 1.6)];
    return cat(play(P(), 4.2, prog(0.1)), play(P(), 5, [[0, 'sus', true], ...prog(0.1)]));
  }],
  ['07-tremolo', () => play(P({ roll: 12 }), 7, [...chord(0.1, [45, 57], 0.65, 2.6), ...chord(3, [50, 62, 65, 69], 0.6, 3.4)])],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
