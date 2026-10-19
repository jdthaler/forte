// Render RF Cavity Bells demos, each isolating one physical effect, to examples/cavity/*.wav
// Usage: node tools/render-cavity.mjs        (then node tools/encode-examples.mjs cavity)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../cavity/src/cavity-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const CavityBellsEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'cavity';
const preset = (i, o = {}) => ({ ...DEFAULTS, ...PRESETS[i].p, ...o });
const play = (P, seconds, events) => { const e = new CavityBellsEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const chord = (t, keys, vel, len) => keys.flatMap((k, i) => [[t + 0.04 * i, 'on', k, vel], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const press = (t, key, value) => [t, 'handle', { type: 'pressure', key, value }];

const demos = [
  // TESLA's cavities, rung by single bunches: a slow chord progression, with the pedal held
  ['01-bells-at-two-kelvin', () => play(preset(0), 10, [
    [0, 'sus', true],
    ...chord(0.1, [48, 55, 64, 72], 0.7, 2.2), ...chord(2.4, [45, 52, 60, 69], 0.65, 2.2),
    ...chord(4.7, [41, 48, 57, 65], 0.65, 2.2), ...chord(7.0, [43, 50, 59, 67, 74], 0.7, 2.5),
    [9.6, 'sus', false],
  ])],
  // the same notes in step (β = 1), then out of step (β = 0.8): the passband's modes beat
  ['02-in-step-then-out-of-step', () => cat(
    play(preset(0, { offset: 0.05 }), 3.5, notes(0.1, 0.9, [57, 64, 69], 0.8, 0.85)),
    play(preset(3), 3.5, notes(0.1, 0.9, [57, 64, 69], 0.8, 0.85)))],
  // a long bunch on the axis, then a short one off it: the higher-order modes, the bell's partials
  ['03-long-bunch-then-short-and-offset', () => cat(
    play(preset(0, { bunch: 0.2, offset: 0 }), 3, notes(0.1, 0.7, [60, 67, 72], 0.8, 0.65)),
    play(preset(5), 3, notes(0.1, 0.7, [60, 67, 72], 0.8, 0.65)))],
  // held keys with a bunch train: each mode builds up as the beam loads it, then rings out
  ['04-beam-loading-held-notes', () => play(preset(0, { current: 0.7 }), 8, [
    ...chord(0.1, [48, 55], 0.6, 3.4), ...chord(3.8, [52, 59, 64], 0.6, 3.4),
  ])],
  // a train that builds the field past the quench field: it collapses, recovers and builds again
  ['05-quench-and-recover', () => play(preset(7), 7, [[0.1, 'on', 55, 0.8], [6.2, 'off', 55]])],
  // warmer and warmer helium: 2 K, 4.2 K, 6 K, then above Tc only a click
  ['06-warming-the-helium', () => cat(...[2, 4.2, 6, 10].map((temp) => play(preset(0, { temp }), 1.8, notes(0.1, 0.4, [60, 67], 0.8, 1.6))))],
  // Lorentz-force detuning: hard strikes start flat and rise to pitch, the walls wobbling
  ['07-lorentz-detuning-hard-strikes', () => play(preset(8), 7, notes(0.1, 1.6, [52, 57, 64, 69], 1, 1.5))],
  // one pillbox cell, then nine coupled cells: one mode per band, then a passband of nine
  ['08-one-cell-then-nine', () => cat(
    play(preset(1, { beta: 0.85 }), 3, notes(0.1, 0.8, [55, 62, 67], 0.8, 0.75)),
    play(preset(0, { beta: 0.85 }), 3, notes(0.1, 0.8, [55, 62, 67], 0.8, 0.75)))],
  // key pressure as beam current: a held note swells and fades as the key is pressed
  ['09-pressure-is-beam-current', () => play(preset(0), 6, [[0.1, 'on', 64, 0.7], press(0.8, 64, 0.4), press(1.8, 64, 1), press(3.2, 64, 0.2), press(4.0, 64, 0), [4.8, 'off', 64]])],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
