// Render TESS demos, each isolating one physical effect, to examples/tess/*.wav
// Usage: node tools/render-tess.mjs        (then node tools/encode-examples.mjs tess)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../tess/src/tess-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const TessEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'tess';
const preset = (i, o = {}) => ({ ...DEFAULTS, ...PRESETS[i].p, ...o });
const play = (P, seconds, events) => { const e = new TessEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const chord = (t, keys, vel, len) => keys.flatMap((k, i) => [[t + 0.03 * i, 'on', k, vel], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// a parameter swept while a chord holds: the engine's setParams every 20 ms
const sweep = (P, id, from, to, t0, t1) => { const n = Math.round((t1 - t0) / 0.02); return Array.from({ length: n + 1 }, (_, i) => [t0 + i * 0.02, 'params', { ...P, [id]: from + ((to - from) * i) / n }]); };

const demos = [
  // hot Jupiters round Sun-like stars, a chord progression: each note a planet whose year is its period
  ['01-hot-jupiter-chords', () => play(preset(0), 10, [
    ...chord(0.1, [45, 52, 57, 61], 0.8, 2.3), ...chord(2.5, [42, 49, 54, 57], 0.75, 2.3),
    ...chord(4.9, [38, 45, 50, 54], 0.75, 2.3), ...chord(7.3, [40, 47, 52, 56], 0.8, 2.4),
  ])],
  // one chord as the planets' path moves from the star's centre to its edge, and off it
  ['02-the-path-moves-to-the-edge', () => { const P = preset(0); return play(P, 7, [...chord(0.1, [45, 52, 57], 0.8, 6.6), ...sweep(P, 'impact', 0, 1.06, 0.8, 6.2)]); }],
  // the same tune with an Earth, a Neptune and a Jupiter: the dip, and the note, grow as the planet's area
  ['03-earth-neptune-jupiter', () => cat(...[1, 3.86, 11.21].map((planetRadius) => play(preset(0, { planetRadius, scale: 1e-3 }), 2.6, notes(0.1, 0.3, [57, 60, 64, 69, 64, 60], 0.8, 0.28))))],
  // a bright star, then a faint one: the photon noise rises as the light falls
  ['04-bright-star-then-faint', () => cat(...[6, 13].map((tmag) => play(preset(0, { tmag }), 3, chord(0.1, [48, 55, 60, 64], 0.8, 2.6))))],
  // π Mensae c, TESS's first planet, on A4: a super-Earth's small dip against a bright star
  ['05-pi-mensae-c', () => play(preset(1), 5, notes(0.1, 0.55, [57, 64, 69, 73, 76, 69, 64, 57], 0.8, 0.5))],
  // LHS 3844 b round a red dwarf: a small star, so a rocky planet's dip is deep
  ['06-lhs-3844-b-red-dwarf', () => play(preset(2), 5, notes(0.1, 0.55, [57, 60, 64, 69, 72, 69, 64, 60], 0.8, 0.5))],
  // WD 1856+534 b: a giant planet seven times its white dwarf's size, grazing it, through a faint star's noise
  ['07-white-dwarf-giant', () => play(preset(4), 5, chord(0.1, [45, 52, 57, 64], 0.9, 4.5))],
  // keys a fifth apart are periods in the ratio 3 : 2, like the resonant chains TESS has found
  ['08-resonant-fifths', () => play(preset(0), 6, [45, 52, 59, 66].flatMap((k, i) => [[0.1 + 0.9 * i, 'on', k, 0.75], [5.5, 'off', k]]))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
