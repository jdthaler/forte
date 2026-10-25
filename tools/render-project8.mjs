// Render Project 8 demos, each isolating one physical effect, to examples/project8/*.wav
// Usage: node tools/render-project8.mjs        (then node tools/encode-examples.mjs project8)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../project8/src/project8-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const Project8Engine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'project8';
const preset = (i, o = {}) => ({ ...DEFAULTS, ...PRESETS[i].p, ...o });
const play = (P, seconds, events) => { const e = new Project8Engine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const chord = (t, keys, vel, len) => keys.flatMap((k, i) => [[t + 0.04 * i, 'on', k, vel], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const tune = [69, 72, 76, 74, 72, 71, 72, 69];

const demos = [
  // krypton electrons in a Phase II trap, chords held: every one radiates, and so climbs sharp
  ['01-krypton-chords-climbing', () => play(preset(0), 12, [
    ...chord(0.1, [57, 64, 69, 72], 0.75, 2.8), ...chord(3, [53, 60, 65, 69], 0.7, 2.8),
    ...chord(5.9, [55, 62, 67, 71], 0.7, 2.8), ...chord(8.8, [57, 64, 69, 73], 0.75, 2.6),
  ])],
  // one electron, the key held, until its pitch angle has opened past the trap's and it leaves
  ['02-one-electron-radiates-out', () => play(preset(0), 7.5, [[0.1, 'on', 64, 0.8], [7.2, 'off', 64]])],
  // the same tune as the gas rises: a vacuum, then a collision every few tenths of a second (each a
  // jump in pitch), then every few milliseconds, then Phase II's, every fifth of a millisecond
  ['03-the-gas-rising', () => cat(...[1e-11, 3e-9, 1e-7, 2e-6].map((gas) => play(preset(0, { gas }), 3.2, notes(0.1, 0.4, tune.slice(0, 7), 0.8, 0.38))))],
  // tritium: every key a different electron off the β spectrum, sharp of its key by its neutrino
  ['04-tritium-electrons', () => play(preset(2), 6, notes(0.1, 0.35, [60, 60, 60, 60, 67, 67, 67, 67, 72, 72, 72, 72], 0.75, 0.3))],
  // the waveguide's carrier, then the antenna ring's harmonics
  ['05-waveguide-then-antennas', () => cat(...[0, 3].map((i) => play(preset(i), 4, chord(0.1, [52, 59, 64, 68], 0.75, 3.3))))],
  // a deep trap (wide bounces, a Doppler vibrato), then a long one (slow bounces)
  ['06-deep-trap-then-long-trap', () => cat(...[4, 5].map((i) => play(preset(i), 4.5, notes(0.1, 1.4, [62, 69, 74], 0.8, 1.3))))],
  // 3 tesla: ten times the radiated power, so chirps ten times as fast and electrons gone in half a second
  ['07-three-tesla', () => play(preset(6), 6, notes(0.1, 0.7, tune, 0.8, 0.65))],
  // 300 keV: relativistic electrons, the antennas' harmonics bright
  ['08-relativistic-electrons', () => play(preset(7), 6, notes(0.1, 0.6, [45, 52, 57, 61, 64, 69], 0.8, 2))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
