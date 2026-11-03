// Render Birdsong demos, each isolating one physical effect, to examples/birdsong/*.wav
// Usage: node tools/render-birdsong.mjs [prefix…]   (then node tools/encode-examples.mjs birdsong)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../birdsong/src/birdsong-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const BirdsongEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'birdsong';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => P({ ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (params, seconds, events) => { const e = new BirdsongEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const note = (t, key, dur, vel = 0.7) => [[t, 'on', key, vel], [t + dur, 'off', key]];
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const mix = (...parts) => { const n = Math.max(...parts.map((p) => p[0].length)); return [0, 1].map((c) => { const o = new Float64Array(n); for (const p of parts) p[c].forEach((v, i) => { o[i] += v; }); return o; }); };

// A morning in the garden: a whistled phrase, a canary's trill over it, a bird answering with
// downsweeps, another with a warble: four birds, each its own engine (its own gestures).
function chorus() {
  const whistle = play(P({ inhale: 0.03 }), 9, [[84, 0.3, 0.9], [88, 1.3, 0.5], [86, 1.9, 0.5], [83, 2.5, 1.2], [91, 5.6, 0.7], [88, 6.4, 1.4]].flatMap(([k, t, d]) => note(t, k, d, 0.75)));
  const trill = play(preset('Canary trill', { rate: 16, duty: 0.5 }), 9, [...note(1.4, 93, 1.6, 0.6), ...note(4.2, 96, 1.2, 0.55)]);
  const down = play(preset('Downsweeps', { rate: 6 }), 9, [...note(3.2, 90, 1.4, 0.7), ...note(7.2, 89, 1.1, 0.65)]);
  const warble = play(preset('Warble', { rate: 11 }), 9, note(5.0, 81, 1.5, 0.6));
  return mix(whistle, trill, down, warble);
}

// The same three notes started through a Hopf bifurcation (pure, growing from nothing), then through
// a saddle-node (born at zero frequency: clicks running up into a buzz).
function onsets() {
  const phrase = (p) => play(p, 3.4, [[67, 0.1], [72, 1.2], [76, 2.3]].flatMap(([k, t]) => note(t, k, 0.9, 0.8)));
  return cat(phrase(P()), phrase(preset('Zebra finch')));
}

// A slow breath through the saddle-node onset: soft notes click and buzz, harder ones fill out.
const clicks = () => play(preset('Zebra finch', { inhale: 0.12, exhale: 0.08 }), 7.5, [[48, 0.1, 0.25], [48, 2.1, 0.55], [48, 4.1, 1]].flatMap(([k, t, v]) => note(t, k, 1.6, v)));

// A canary's trill with a mini-breath a syllable, then faster and faster: 8, 15, then 25 a second.
function trills() {
  const p = preset('Canary trill');
  const ev = [...note(0.1, 90, 1.8, 0.8), [2.1, 'params', { ...p, rate: 15, duty: 0.5 }], ...note(2.2, 90, 1.8, 0.8), [4.1, 'params', { ...p, rate: 25, duty: 0.5, inhale: 0.004, exhale: 0.006 }], ...note(4.2, 90, 2, 0.8)];
  return play({ ...p, rate: 8 }, 7, ev);
}

// The tension moving through each syllable: upsweeps, downsweeps, then a warble.
function sweeps() {
  const run3 = (p, k) => play(p, 3, note(0.1, k, 2.6, 0.85));
  return cat(run3(preset('Upsweeps'), 84), run3(preset('Downsweeps'), 88), run3(preset('Warble'), 86));
}

// A zebra finch's buzz through a fixed mouth, then the same labia with the mouth tuned to the note.
function mouth() {
  const phrase = (p) => play(p, 3.6, [[55, 0.1], [62, 1.2], [67, 2.3]].flatMap(([k, t]) => note(t, k, 1, 0.8)));
  return cat(phrase(preset('Zebra finch')), phrase(preset('Zebra finch', { track: true })));
}

// Pitch from the breath: a slow breath slides up into the note; leaning on the key (aftertouch)
// sharpens it, letting off flattens it back.
function breath() {
  const ev = note(0.1, 81, 5.6, 0.5);
  for (let t = 2; t <= 5.5; t += 0.02) ev.push([t, 'msg', { type: 'pressure', value: Math.sin((Math.PI * (t - 2)) / 3.5) ** 2, key: 81 }]);
  return play(P({ inhale: 0.25 }), 6.5, ev);
}

// One held note while the tension slides across the corner at ¼ and back: a Hopf whistle turns into a
// saddle-node buzz (its pitch kept by the retuning) and back.
function corner() {
  const ev = note(0.1, 72, 7.6, 0.8);
  const base = P({ track: false, oec: 3000, q: 1.5, drive: 0.05 });
  for (let t = 0.6; t <= 7; t += 0.05) { const u = (t - 0.6) / 6.4, tension = 0.7 - 0.8 * Math.sin(Math.PI * u); ev.push([t, 'params', { ...base, tension }]); }
  return play(base, 8.5, ev);
}

const demos = [
  ['01-a-morning-in-the-garden', chorus],
  ['02-hopf-then-saddle-node-onsets', onsets],
  ['03-born-at-zero-frequency', clicks],
  ['04-canary-trills-faster-and-faster', trills],
  ['05-upsweeps-downsweeps-warble', sweeps],
  ['06-fixed-mouth-then-tuned', mouth],
  ['07-pitch-rises-with-the-breath', breath],
  ['08-tension-across-the-corner', corner],
];

const only = process.argv.slice(2);
for (const [name, fn] of demos) if (!only.length || only.some((p) => name.startsWith(p))) saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
