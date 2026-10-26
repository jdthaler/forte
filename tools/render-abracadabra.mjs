// Render ABRACADABRA demos, each isolating one physical effect, to examples/abracadabra/*.wav
// Usage: node tools/render-abracadabra.mjs        (then node tools/encode-examples.mjs abracadabra)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../abracadabra/src/abracadabra-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const AbracadabraEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'abracadabra';
const preset = (i, o = {}) => ({ ...DEFAULTS, ...PRESETS[i].p, ...o });
const play = (P, seconds, events) => { const e = new AbracadabraEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const chord = (t, keys, vel, len) => keys.flatMap((k, i) => [[t + 0.03 * i, 'on', k, vel], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const phrase = [60, 64, 67, 72, 67, 64];

const demos = [
  // chords held: every axion's tone swells and fades on its own as its halo's waves drift
  ['01-axion-chords-swelling', () => play(preset(0), 10, [
    ...chord(0.1, [48, 55, 64, 71], 0.85, 3.1), ...chord(3.3, [45, 52, 60, 67], 0.85, 3.1), ...chord(6.5, [41, 53, 60, 69], 0.85, 3.3),
  ])],
  // one key held for ten seconds: its field's amplitude wanders, Rayleigh-distributed, about once a second
  ['02-one-axion-wandering', () => play(preset(0), 10, [[0.1, 'on', 69, 0.9], [9.8, 'off', 69]])],
  // the same phrase as the coupling falls: clear, then fainter in the SQUID's hiss, then lost at the CAST limit
  ['03-coupling-falling-into-the-noise', () => cat(...[5e-7, 6e-8, 1.5e-8, 6.6e-11].map((coupling) => play(preset(0, { coupling }), 2.4, notes(0.05, 0.35, phrase, 0.9, 0.33))))],
  // an axion at the CAST limit: ABRACADABRA-10 cm hears only noise; a meter-scale toroid at 5 T hears it
  ['04-a-meter-scale-toroid-hears-it', () => cat(...[1, 2].map((i) => play(preset(i), 4, chord(0.1, [57, 64, 69], 0.9, 3.6))))],
  // a cold halo (steady tones), the Milky Way's, then a galaxy cluster's (a band of noise)
  ['05-cold-then-milky-way-then-hot-halo', () => cat(...[40, 220, 1200].map((halo) => play(preset(0, { halo }), 3, chord(0.1, [60, 67, 76], 0.85, 2.7))))],
  // a cold stream beside the halo: a second line that beats against the first
  ['06-a-stream-beating', () => play(preset(3, { streamSpeed: 700 }), 7, chord(0.1, [57, 64, 73], 0.85, 6.6))],
  // a slow magnet: each note charges up over a second and a half
  ['07-a-slow-magnet', () => play(preset(6), 8, notes(0.1, 1.9, [55, 62, 67, 74], 0.9, 1.8))],
  // the low keys hold their field for half a minute; the high keys flicker in a tenth of a second
  ['08-low-keys-steady-high-keys-flicker', () => cat(play(preset(0), 4, [[0.1, 'on', 33, 1], [3.7, 'off', 33]]), play(preset(0), 4, [[0.1, 'on', 96, 0.9], [3.7, 'off', 96]]))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
