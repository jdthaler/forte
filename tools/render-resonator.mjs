// Render Magnetic Resonator Piano demos, each isolating one physical effect, to examples/resonator/*.wav
// Usage: node tools/render-resonator.mjs        (then node tools/encode-examples.mjs resonator)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS } from '../resonator/src/resonator-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const ResonatorEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'resonator';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (params, seconds, events) => { const e = new ResonatorEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const note = (t, key, dur, vel = 0.7) => [[t, 'on', key, vel], [t + dur, 'off', key]];
const chord = (t, keys, dur, vel) => keys.flatMap((k) => note(t, k, dur, vel));
// a parameter swept from a to b over [t0, t1]
const sweep = (base, id, a, b, t0, t1) => Array.from({ length: 41 }, (_, i) => [t0 + ((t1 - t0) * i) / 40, 'params', { ...base, [id]: a + ((b - a) * i) / 40 }]);

const demos = [
  // Chords that grow out of silence and hold, the bass under them taking its time.
  ['01-chords-grown-from-silence', () => play(P({ attack: 0.6 }), 11, [
    ...chord(0, [36, 55, 60, 64], 3.2, 0.7), ...chord(3.3, [41, 57, 60, 65], 3.2, 0.7), ...chord(6.6, [43, 55, 62, 67, 71], 3.6, 0.75)])],
  // The same phrase struck, first as a plain piano (the coils off), then with them sustaining it.
  ['02-struck-then-sustained-by-the-coils', () => {
    const phrase = (t) => [...note(t, 60, 1.6), ...note(t + 0.4, 64, 1.2), ...note(t + 0.8, 67, 0.8), ...note(t + 1.2, 72, 2.4)];
    return play(P({ hammer: 0.6, drive: 0, attack: 0.05 }), 9, [...phrase(0.1), [4.4, 'params', P({ hammer: 0.6, drive: 0.5, attack: 0.05 })], ...phrase(4.5)]);
  }],
  // C3 held four times: the fundamental, then the 2nd, 3rd and 4th partials alone.
  ['03-one-string-four-harmonics', () => play(P({ wave: 'sine', drive: 0.9, attack: 0.1 }), 10, [
    ...note(0, 48, 2.3), [2.45, 'params', P({ harmonic: '2', wave: 'sine', drive: 0.9, attack: 0.1 })], ...note(2.5, 48, 2.3),
    [4.95, 'params', P({ harmonic: '3', wave: 'sine', drive: 0.9, attack: 0.1 })], ...note(5, 48, 2.3),
    [7.45, 'params', P({ harmonic: '4', wave: 'sine', drive: 0.9, attack: 0.1 })], ...note(7.5, 48, 2.3)])],
  // A bass string swells for seconds; a treble one speaks almost at once.
  ['04-the-bass-takes-seconds', () => play(P({ attack: 0.02 }), 9, [...note(0, 36, 5.5, 0.9), ...note(6, 84, 2.5, 0.9)])],
  // Brightness swept up and back on a held chord: the drive's harmonics, each on its sharp partial.
  ['05-brightness-on-the-wheel', () => { const b = P({ attack: 0.3 }); return play({ ...b, bright: 0 }, 8, [...chord(0, [48, 55, 64], 7.5, 0.8), ...sweep(b, 'bright', 0, 1, 1.5, 4.5), ...sweep(b, 'bright', 1, 0, 4.6, 7)]); }],
  // Open loop at the keyboard's pitch against detuned unisons (they beat), then locked to the string.
  ['06-open-loop-then-locked', () => play(P({ loop: 'open', unison: 2.5, attack: 0.2 }), 8, [...note(0, 57, 3.6, 0.8), [3.9, 'params', P({ loop: 'pll', unison: 2.5, attack: 0.2 })], ...note(4, 57, 3.6, 0.8)])],
  // The phase turned away from the calibrated best on a held note: weaker past 90°, gone by 180°.
  ['07-phase-turned-away', () => { const b = P({ attack: 0.05 }); return play(b, 9, [...note(0, 62, 8.5, 0.9), ...sweep(b, 'phase', 0, 180, 3, 7)]); }],
];

const only = process.argv.slice(2);
for (const [name, fn] of demos) if (!only.length || only.some((p) => name.startsWith(p))) saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
