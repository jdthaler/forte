// Render kalimba demos, each isolating one physical effect, to examples/kalimba/*.wav
// Usage: node tools/render-kalimba.mjs        (then node tools/encode-examples.mjs kalimba)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../kalimba/src/kalimba-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const KalimbaEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'kalimba';
const preset = (i, o = {}) => ({ ...DEFAULTS, ...PRESETS[i].p, ...o });
const play = (P, seconds, events) => { const e = new KalimbaEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// a slight unevenness in time and touch, as two thumbs play
const thumbs = (t0, dt, keys, vel) => keys.flatMap((k, i) => (k ? [[t0 + i * dt + 0.012 * Math.sin(i * 2.3), 'on', k, vel * (i % 2 ? 0.85 : 1) * (1 + 0.08 * Math.sin(i * 1.7))], [t0 + i * dt + dt * 0.9, 'off', k]] : []));

const demos = [
  // a tune for two thumbs: a C-major pattern over a moving bass, the tines left to ring
  ['01-two-thumbs', () => play(preset(0), 10.5, thumbs(0.1, 0.24, [
    60, 76, 67, 72, 64, 79, 67, 72, 57, 76, 64, 72, 60, 74, 69, 72,
    53, 74, 69, 72, 57, 77, 65, 72, 55, 74, 67, 71, 59, 79, 67, 74,
    60, 76, 67, 72, 64, 79, 72, 84, 0, 0, 60, 0, 0, 0, 0, 0,
  ], 0.75))],
  // the thumbnail flicks off at once, the soft flesh rolls off slowly: the overtones go
  ['02-nail-then-flesh', () => cat(
    play(preset(1), 2.6, notes(0.1, 0.5, [60, 64, 67, 72], 0.8, 0.45)),
    play(preset(0, { thumb: 3 }), 2.6, notes(0.1, 0.5, [60, 64, 67, 72], 0.8, 0.45)))],
  // the back segment sets the overtone: clamped at the bridge (6.27), the default (5.6), equal lengths (9th harmonic)
  ['03-overtone-set-by-the-back-length', () => cat(
    play(preset(5, { thumb: 0.1 }), 2.2, notes(0.1, 0.6, [60, 67, 72], 0.8, 0.5)),
    play(preset(0, { thumb: 0.1 }), 2.2, notes(0.1, 0.6, [60, 67, 72], 0.8, 0.5)),
    play(preset(6, { thumb: 0.1 }), 2.2, notes(0.1, 0.6, [60, 67, 72], 0.8, 0.5)))],
  // a finger slides over the sound hole and off again while the low tines ring: the wah
  ['04-wah-over-the-sound-hole', () => {
    const P = preset(0), ev = [...notes(0.1, 1.2, [60, 62, 64, 60], 0.85, 1.1)];
    for (let i = 0; i <= 120; i++) { const t = 0.1 + i * 0.04; ev.push([t, 'params', { ...P, cover: 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 1.2) }]); }
    return play(P, 5.2, ev);
  }],
  // the same phrase on an mbira with bottle caps, soft (they lie still) then loud (they rattle)
  ['05-bottle-caps-soft-then-loud', () => cat(
    play(preset(3), 2.6, notes(0.1, 0.3, [60, 64, 67, 72, 67, 64, 60], 0.1, 0.28)),
    play(preset(3), 2.6, notes(0.1, 0.3, [60, 64, 67, 72, 67, 64, 60], 1, 0.28)))],
  // a bass box: long thick tongues and a big box
  ['06-marimbula-bass', () => play(preset(4), 6, thumbs(0.1, 0.38, [36, 43, 40, 43, 38, 43, 41, 45, 36, 43, 40, 43, 31, 0, 36], 0.9))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
