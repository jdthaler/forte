// Render Chladni Plate demos, each isolating one physical effect, to examples/chladni/*.wav
// Usage: node tools/render-chladni.mjs        (then node tools/encode-examples.mjs chladni)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../chladni/src/chladni-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const ChladniPlateEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'chladni';
const preset = (i, o = {}) => ({ ...DEFAULTS, ...PRESETS[i].p, ...o });
const play = (P, seconds, events) => { const e = new ChladniPlateEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

const demos = [
  // a slow tune on the diagonals, each plate bowed while its key is held and ringing on under the pedal
  ['01-bowed-plates-tune', () => play(preset(0), 11, [
    [0, 'sus', true],
    ...notes(0.1, 0.9, [64, 67, 69, 72, 71, 69, 67, 64], 0.65, 0.8),
    [7.3, 'on', 57, 0.6], [7.3, 'on', 64, 0.6], [7.3, 'on', 69, 0.6], [9.5, 'off', 57], [9.5, 'off', 64], [9.5, 'off', 69],
    [10.2, 'sus', false],
  ])],
  // the finger on a nodal line, then lifted: a lower mode takes the bow
  ['02-finger-on-then-lifted', () => cat(
    play(preset(0), 2.2, notes(0.1, 1.6, [69], 0.6)),
    play(preset(0, { finger: false }), 2.2, notes(0.1, 1.6, [69], 0.6)))],
  // the bow set down further along the edge (the mod wheel up): a rival mode takes it, at its own pitch
  ['03-bow-moved-along-the-edge', () => cat(...[0, 0.7, 0, 0.7].map((shift) => play(preset(0, { shift }), 1.6, notes(0.05, 1.3, [69], 0.7))))],
  // one key, C5, re-cut for figure after figure: same pitch, different plates and sounds
  ['04-five-figures-on-one-key', () => cat(...[1, 2, 4, 6, 8].map((figure) => play(preset(0, { figure }), 1.6, notes(0.05, 1.3, [72], 0.6))))],
  // at the threshold the note swells in slowly; well above it the bow speaks at once
  ['05-light-bow-then-firm', () => cat(
    play(preset(0, { force: 1.3 }), 3, notes(0.1, 2.6, [64], 0.4)),
    play(preset(0, { force: 4 }), 3, notes(0.1, 2.6, [64], 0.7)))],
  // Chladni's glass plates, bowed in the bass and treble
  ['06-glass-plates', () => play(preset(4), 8, [[0, 'sus', true], ...notes(0.1, 1.2, [45, 52, 57, 64, 69, 76], 0.6, 1.0), [7.5, 'sus', false]])],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
