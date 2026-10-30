// Render Hydrogen Lamp demos, each isolating one physical effect, to examples/hydrogen/*.wav
// Usage: node tools/render-hydrogen.mjs        (then node tools/encode-examples.mjs hydrogen)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../hydrogen/src/hydrogen-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const HydrogenEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'hydrogen';
const preset = (i, o = {}) => ({ ...DEFAULTS, ...PRESETS[i].p, ...o });
const play = (P, seconds, events) => { const e = new HydrogenEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const chord = (t, keys, vel, len) => keys.flatMap((k, i) => [[t + 0.03 * i, 'on', k, vel], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// a parameter swept while a chord holds: the engine's setParams every 20 ms, on a log scale
const sweep = (P, id, from, to, t0, t1) => { const n = Math.round((t1 - t0) / 0.02); return Array.from({ length: n + 1 }, (_, i) => [t0 + i * 0.02, 'params', { ...P, [id]: from * (to / from) ** (i / n) }]); };
// the pitch wheel (a redshift) from one value to another
const bend = (from, to, t0, t1) => { const n = Math.round((t1 - t0) / 0.02); return Array.from({ length: n + 1 }, (_, i) => [t0 + i * 0.02, 'wheel', { type: 'bend', value: from + ((to - from) * i) / n }]); };

const demos = [
  // the lamp as it glows: chords, each key's Hα on its note, Hβ a sharp fourth above, Hγ and Hδ higher
  ['01-balmer-chords', () => play(preset(0), 10, [
    ...chord(0.1, [45, 52, 57], 0.8, 2.2), ...chord(2.5, [41, 48, 53], 0.75, 2.2),
    ...chord(4.9, [43, 50, 55], 0.75, 2.2), ...chord(7.3, [45, 52, 57], 0.8, 2.2),
  ])],
  // one key, a laser lifting every atom to 12p: the lines light one after another down the cascade
  ['02-the-cascade-from-12p', () => play(preset(6, { slowmo: 1e8 }), 8, chord(0.1, [45], 0.9, 5.5))],
  // a discharge, then a nebula: electrons striking the atoms from below, then caught from above
  ['03-discharge-then-nebula', () => cat(...[0, 1].map((i) => play(preset(i), 4, chord(0.1, [45, 52, 57, 64], 0.8, 2.8))))],
  // the same chord through the visible, the ultraviolet and the infrared windows
  ['04-visible-ultraviolet-infrared', () => cat(...['visible', 'ultraviolet', 'infrared'].map((window) => play(preset(4, { window }), 3.2, chord(0.1, [33, 40, 45], 0.8, 2.3))))],
  // a chord as the plasma grows denser: the ions' fields smear the lines (Stark), the high ones first
  ['05-denser-and-denser', () => { const P = preset(0); return play(P, 8, [...chord(0.1, [45, 52, 57], 0.8, 7.4), ...sweep(P, 'density', 1e8, 1e17, 1, 7)]); }],
  // the real fine structure, then α twelve times larger: each line splits, and its parts beat
  ['06-fine-structure-1x-then-12x', () => cat(...[1, 12].map((alphaScale) => play(preset(8, { alphaScale }), 4.5, chord(0.1, [69], 0.9, 3.8))))],
  // the lamp flying away from you: every line redshifted together, then back
  ['07-redshift', () => play(preset(0), 6, [...chord(0.1, [45, 52, 57], 0.8, 5.4), ...bend(0, -1, 1.5, 3), ...bend(-1, 0, 3.5, 5)])],
  // less slow motion, then more: quick, rough lines, then slow, pure ones
  ['08-quick-then-pure', () => cat(play(preset(9), 3.5, notes(0.1, 0.4, [57, 60, 64, 69, 64, 60], 0.8, 0.35)), play(preset(10), 5, chord(0.1, [57, 64], 0.8, 3.5)))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
