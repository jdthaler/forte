// Render Early Universe demos, each isolating one physical effect, to examples/universe/*.wav
// Usage: node tools/render-universe.mjs        (then node tools/encode-examples.mjs universe)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../universe/src/universe-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const EarlyUniverseEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'universe';
const preset = (i, o = {}) => ({ ...DEFAULTS, ...PRESETS[i].p, ...o });
const play = (P, seconds, events) => { const e = new EarlyUniverseEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const chord = (t, keys, vel, len) => keys.flatMap((k, i) => [[t + 0.03 * i, 'on', k, vel], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const phrase = [48, 55, 60, 64, 67, 72];

const demos = [
  // our universe: chords that grow through the first 370,000 years, with the pedal held
  ['01-our-universe-with-the-pedal', () => play(preset(0), 12, [
    [0, 'sus', true],
    ...chord(0.1, [48, 55, 64, 72], 0.75, 2.8), ...chord(3, [45, 52, 60, 69], 0.7, 2.8),
    ...chord(5.9, [41, 48, 57, 65, 72], 0.7, 2.8), ...chord(8.8, [43, 50, 59, 67, 74], 0.75, 2.4),
    [11.0, 'sus', false],
  ])],
  // hardly any baryons, then a universe heavy with them: the odd harmonics, the compressions, ring out
  ['02-few-baryons-then-many', () => cat(...[1, 2].map((i) => play(preset(i, { recombination: 0.8 }), 5, notes(0.1, 0.75, phrase, 0.8, 1.4))))],
  // little dark matter, where radiation drives the waves, then much, where its wells hold them
  ['03-little-dark-matter-then-much', () => cat(...[3, 4].map((i) => play(preset(i, { recombination: 0.8 }), 5, notes(0.1, 0.75, phrase, 0.8, 1.4))))],
  // one held note, recombination slowed to ten seconds: the harmonics come up one after another
  ['04-a-slow-universe', () => play(preset(10), 13, [[0.1, 'on', 45, 0.8], [11.2, 'off', 45]])],
  // listening from the sky, then from inside the plasma, where the light streams away by itself
  ['05-the-sky-then-inside-the-plasma', () => cat(...[0, 8].map((i) => play(preset(i, { recombination: 1 }), 4.5, chord(0.1, [50, 57, 62, 66], 0.75, 2.6))))],
  // helium-rich: fewer free electrons, the light diffuses further and the upper harmonics fade
  ['06-our-helium-then-more', () => cat(...[0, 6].map((i) => play(preset(i, { recombination: 0.8 }), 4.5, notes(0.1, 0.6, [60, 64, 67, 72], 0.8, 1.6))))],
  // the tilt: scale-invariant ripples, then ours, a little redder
  ['07-scale-invariant-then-ours', () => cat(...[7, 0].map((i) => play(preset(i, { recombination: 0.8 }), 4.5, chord(0.1, [43, 55, 62, 71], 0.75, 2.6))))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
