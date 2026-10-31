// Render CUORE demos, each isolating one physical effect, to examples/cuore/*.wav
// Usage: node tools/render-cuore.mjs        (then node tools/encode-examples.mjs cuore)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../cuore/src/cuore-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const CuoreEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'cuore';
const preset = (i, o = {}) => ({ ...DEFAULTS, ...PRESETS[i].p, ...o });
const play = (P, seconds, events) => { const e = new CuoreEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const chord = (t, keys, vel, len) => keys.flatMap((k, i) => [[t + 0.02 * i, 'on', k, vel], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// a parameter swept while a chord holds: the engine's setParams every 20 ms
const sweep = (P, id, from, to, t0, t1) => { const n = Math.round((t1 - t0) / 0.02); return Array.from({ length: n + 1 }, (_, i) => [t0 + i * 0.02, 'params', { ...P, [id]: from + ((to - from) * i) / n }]); };

const demos = [
  // a chord progression on crystals at 10 mK, each note a heater firing at its rate
  ['01-chords-at-ten-millikelvin', () => play(preset(0), 10, [
    ...chord(0.1, [45, 52, 57, 61, 64], 0.8, 2.3), ...chord(2.5, [42, 49, 54, 57, 61], 0.75, 2.3),
    ...chord(4.9, [38, 45, 50, 54, 57], 0.75, 2.3), ...chord(7.3, [40, 47, 52, 56, 59], 0.8, 2.4),
  ])],
  // the heat sink warms from 10 to 13 mK under a held chord, and back: the note fades and darkens
  ['02-the-heat-sink-warms', () => { const P = preset(0); return play(P, 7, [...chord(0.1, [45, 52, 57], 0.8, 6.6), ...sweep(P, 'tbase', 10, 13, 0.8, 3.6), ...sweep(P, 'tbase', 13, 10, 3.7, 6.4)]); }],
  // one key from the bottom of the keyboard to the top: the pulses stand apart, then pile up
  ['03-low-keys-buzz-high-keys-round', () => play(preset(0), 6, notes(0.1, 0.45, [21, 33, 45, 57, 69, 81, 93, 105], 0.8, 0.42))],
  // big pulses: soft, then hard; the hard notes saturate the thermistor and come out mellower
  ['04-big-pulses-saturate', () => cat(...[0.1, 1].map((v) => play(preset(4), 2.8, notes(0.1, 0.32, [57, 60, 64, 69, 64, 60, 57], v, 0.3))))],
  // colder (8 mK, hot electrons) and warmer (12.5 mK): the same phrase
  ['05-colder-then-warmer', () => cat(...[3, 2].map((i) => play(preset(i), 2.8, notes(0.1, 0.32, [57, 60, 64, 69, 64, 60, 57], 0.8, 0.3))))],
  // Cuoricino's 3 cm crystal: less heat capacity, quicker pulses, a brighter note
  ['06-cuoricino-small-crystal', () => play(preset(5), 4, chord(0.1, [48, 55, 60, 64], 0.8, 3.6))],
  // the real heater rate: a pulse every 300 s on A4, so every note is a train of clicks
  ['07-the-real-heater-clicks', () => play(preset(1), 4, notes(0.1, 0.45, [45, 52, 57, 64, 69, 64, 57, 52], 0.8, 0.42))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
