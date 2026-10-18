// Render Storage Ring demos, each isolating one physical effect, to examples/ring/*.wav
// Usage: node tools/render-ring.mjs        (then node tools/encode-examples.mjs ring)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../ring/src/ring-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const StorageRingEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'ring';
const preset = (i, o = {}) => ({ ...DEFAULTS, ...PRESETS[i].p, ...o });
const play = (P, seconds, events) => { const e = new StorageRingEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const press = (t, key, value) => [t, 'handle', { type: 'pressure', key, value }];

const demos = [
  // a slow chord progression: each chord re-injects, and the betatron sidebands pulse at 4 Hz
  ['01-kicked-chords-recohering', () => play(preset(0), 9, [
    ...[48, 55, 64, 71].flatMap((k) => [[0.1, 'on', k, 0.6], [2.1, 'off', k]]),
    ...[45, 52, 60, 67].flatMap((k) => [[2.3, 'on', k, 0.6], [4.3, 'off', k]]),
    ...[41, 48, 57, 64].flatMap((k) => [[4.5, 'on', k, 0.6], [6.5, 'off', k]]),
    ...[43, 50, 59, 67].flatMap((k) => [[6.7, 'on', k, 0.6], [8.6, 'off', k]]),
  ])],
  // the same note, clean, then kicked: the bare bunch train, then the sidebands that fade and return
  ['02-clean-then-kicked', () => cat(
    play(preset(1), 2.5, notes(0.1, 2.2, [57], 0.7, 2.2)),
    play(preset(0), 2.5, notes(0.1, 2.2, [57], 0.7, 2.2)))],
  // the difference signal: only the oscillation, recohering every synchrotron period
  ['03-difference-signal-recoherence', () => play(preset(2), 6, notes(0.1, 1.5, [52, 59, 64, 71], 0.8, 1.4))],
  // chromaticity off, octupoles on: the sidebands slide and fade for good
  ['04-octupoles-filament-for-good', () => play(preset(3), 6, notes(0.1, 1.5, [52, 59, 64, 71], 0.8, 1.4))],
  // pressing harder raises the RF voltage: faster vibrato and recoherence, a shorter, brighter bunch
  ['05-pressure-raises-the-rf', () => play(preset(0, { phase: 2.5 }), 5, [[0.1, 'on', 60, 0.7], press(1.2, 60, 0.5), press(2.2, 60, 1), press(3.4, 60, 0), [4.6, 'off', 60]])],
  // long bunch and slow RF: soft, with a slow swell of sidebands
  ['06-long-bunch-slow-rf', () => play(preset(4), 6, notes(0.1, 1.4, [45, 52, 57, 64], 0.7, 1.3))],
  // short lifetime: the beam is lost while the key is down, a plucked ring
  ['07-short-lifetime-plucked', () => play(preset(6), 5, notes(0.1, 0.35, [60, 64, 67, 72, 76, 79, 84, 79, 76, 72, 67, 64], 0.7, 0.3))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.2, FS), FS);
