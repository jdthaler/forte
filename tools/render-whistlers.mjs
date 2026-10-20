// Render Whistlers demos, each isolating one physical effect, to examples/whistlers/*.wav
// Usage: node tools/render-whistlers.mjs        (then node tools/encode-examples.mjs whistlers)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../whistlers/src/whistlers-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const WhistlersEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'whistlers';
const preset = (i, o = {}) => ({ ...DEFAULTS, ...PRESETS[i].p, ...o });
const play = (P, seconds, events) => { const e = new WhistlersEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const press = (t, key, value) => [t, 'handle', { type: 'pressure', key, value }];

const demos = [
  // a slow tune with the pedal down: the middle of the keyboard, lines eight to twelve Earth radii out
  ['01-a-night-of-whistlers', () => play(preset(0), 12, [
    [0, 'sus', true],
    ...notes(0.1, 0.9, [72, 76, 79, 84, 81, 77, 74, 79, 76, 72], 0.75, 0.6),
    [9.2, 'on', 60, 0.7], [9.25, 'on', 67, 0.6], [9.3, 'on', 76, 0.6],
    [11.5, 'sus', false],
  ])],
  // a scale up the top of the keyboard: quick whistlers in the thin trough, then, past the
  // plasmapause, long slow ones in the plasmasphere
  ['02-across-the-plasmapause', () => play(preset(0), 9, notes(0.1, 0.6, [96, 98, 100, 101, 103, 105, 107, 108], 0.8, 0.5).concat([[0, 'sus', true]]))],
  // one stroke and its echoes, each later, slower and fainter
  ['03-an-echo-train', () => play(preset(4, { release: 6 }), 8, [[0.1, 'on', 100, 0.85], [7.5, 'off', 100]])],
  // the same stroke heard at the line's far end (one hop), then near the lightning (two hops)
  ['04-far-end-then-near-the-lightning', () => cat(
    play(preset(0, { travel: true, echo: 0.5 }), 4, [[0, 'on', 98, 0.85], [3.5, 'off', 98]]),
    play(preset(5, { travel: true }), 4, [[0, 'on', 98, 0.85], [3.5, 'off', 98]]))],
  // one duct, then five: a multi-path whistler
  ['05-one-duct-then-five', () => cat(
    play(preset(0), 4, notes(0.1, 1.2, [79, 84, 88], 0.8, 1)),
    play(preset(3), 4.5, notes(0.1, 1.2, [79, 84, 88], 0.8, 1)))],
  // with the real travel time: the crack at once, the whistler after its trip along the line
  ['06-the-crack-then-the-whistler', () => play(preset(6), 7, [[0.1, 'on', 100, 0.85], [2.2, 'on', 96, 0.85], [4.2, 'on', 93, 0.85], [6.5, 'off', 100], [6.5, 'off', 96], [6.5, 'off', 93]])],
  // tweeks: strokes 500 km away (clicks), then 7000 km away (long pings onto 1.76 kHz)
  ['07-tweeks-near-then-far', () => cat(...[500, 7000].map((distance) => play(preset(9, { distance, release: 0.3 }), 3, notes(0.1, 0.45, [86, 86, 86, 86, 86, 86], 0.8, 0.15))))],
  // dawn chorus: held keys, the hot electrons' rising elements, more as the keys are pressed
  ['08-dawn-chorus', () => play(preset(8), 9, [
    [0.1, 'on', 84, 0.7], [0.15, 'on', 91, 0.6],
    press(2, 84, 0.4), press(4, 84, 1), press(4, 91, 1), press(6, 84, 0), press(6, 91, 0),
    [7.5, 'off', 84], [7.5, 'off', 91],
  ])],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
