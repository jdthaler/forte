// Render Collider Showers demos, each isolating one physical effect, to examples/showers/*.wav
// Usage: node tools/render-showers.mjs        (then node tools/encode-examples.mjs showers)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../showers/src/showers-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const ColliderShowersEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'showers';
const preset = (i, o = {}) => ({ ...DEFAULTS, ...PRESETS[i].p, ...o });
const play = (P, seconds, events) => { const e = new ColliderShowersEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const chord = (t, keys, vel, len) => keys.flatMap((k, i) => [[t + 0.03 * i, 'on', k, vel], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const press = (t, key, value) => [t, 'handle', { type: 'pressure', key, value }];
const phrase = [60, 64, 67, 72, 67, 64];

const demos = [
  // CMS's crystals and 50 GeV electrons: a slow progression with the pedal held
  ['01-cms-crystals-with-the-pedal', () => play(preset(0), 11, [
    [0, 'sus', true],
    ...chord(0.1, [48, 55, 64, 72], 0.7, 2.4), ...chord(2.6, [45, 52, 60, 69], 0.65, 2.4),
    ...chord(5.1, [41, 48, 57, 65, 72], 0.65, 2.4), ...chord(7.6, [43, 50, 59, 67, 74], 0.7, 2.6),
    [10.4, 'sus', false],
  ])],
  // the same phrase at 2 GeV, where showers peak near the front face, then at 3 TeV, near the middle
  ['02-shallow-showers-then-deep-ones', () => cat(
    play(preset(3), 4, notes(0.1, 0.55, phrase, 0.8, 0.5)),
    play(preset(4), 4, notes(0.1, 0.55, phrase, 0.8, 0.5)))],
  // one key, harder each time: more energy, a deeper shower, a louder and darker note
  ['03-harder-is-deeper', () => play(preset(0, { energy: 400 }), 7, notes(0.1, 0.85, [57, 57, 57, 57, 57, 57, 57, 57], 0, 0.8)
    .map((e, i) => (e[1] === 'on' ? [e[0], 'on', e[2], 0.12 + 0.125 * (i / 2)] : e)))],
  // electrons, photons (each converting somewhere new), then pions (no two alike)
  ['04-electrons-photons-pions', () => cat(...[0, 1, 2].map((i) => play(preset(i), 3.4, notes(0.1, 0.4, [62, 62, 62, 62, 62, 62, 62], 0.8, 0.35)))) ],
  // the impact point: on the axis, off it (the crystal bends), and on the crack between two crystals
  ['05-on-the-axis-off-it-and-on-the-crack', () => cat(...[0, 0.25, 0.5].map((offset) => play(preset(0, { offset }), 3, notes(0.1, 0.7, [55, 62, 67], 0.8, 0.65))))],
  // held chords with pile-up: soft photons keep landing, and key pressure brings more
  ['06-pile-up-held-chords', () => play(preset(9), 8, [
    ...chord(0.1, [48, 55, 64], 0.7, 3.4),
    [0.2, 'on', 72, 0.7], press(1.0, 72, 0.3), press(2.0, 72, 1), press(3.0, 72, 0),
    [3.5, 'off', 72],
    ...chord(4.0, [45, 52, 60, 67], 0.7, 3.4),
  ])],
  // narrow crystals: each shower spreads into the crystals a semitone either side
  ['07-narrow-crystals-the-shower-spreads', () => cat(
    play(preset(0), 3, notes(0.1, 0.45, [60, 62, 64, 65, 67, 69], 0.8, 0.4)),
    play(preset(7), 3.5, notes(0.1, 0.45, [60, 62, 64, 65, 67, 69], 0.8, 0.4)))],
  // the piezo on the side, then the accelerometer on the back face, off the axis: the bending goes
  ['08-piezo-then-accelerometer', () => cat(...['piezo', 'accel'].map((sensor) => play(preset(5, { sensor }), 3.4, notes(0.1, 0.8, [52, 59, 64, 71], 0.8, 0.75))))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
