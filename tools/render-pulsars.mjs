// Render the Pulsars' demos, each isolating one physical effect, to examples/pulsars/*.wav
// Usage: node tools/render-pulsars.mjs        (then node tools/encode-examples.mjs pulsars)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS } from '../pulsars/src/pulsars-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const PulsarsEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'pulsars';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (p, seconds, events) => { const e = new PulsarsEngine(FS); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const chord = (t, keys, vel, len) => keys.flatMap((k) => [[t, 'on', k, vel], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// a parameter swept from a to b over [t0, t1], in steps
const sweep = (base, id, a, b, t0, t1, steps = 40, log = true) => Array.from({ length: steps + 1 }, (_, i) => {
  const u = i / steps, v = log ? a * (b / a) ** u : a + (b - a) * u;
  return [t0 + u * (t1 - t0), 'params', { ...base, [id]: v }];
});

const demos = [
  // a slow progression on millisecond pulsars, held
  ['01-millisecond-pulsars-in-chords', () => play(P(), 9, [
    ...chord(0.1, [45, 52, 57, 64], 0.7, 2.2), ...chord(2.3, [43, 50, 59, 62], 0.7, 2.2),
    ...chord(4.5, [41, 48, 57, 65], 0.7, 2.2), ...chord(6.7, [40, 47, 56, 64], 0.75, 2.1)])],
  // one pole, then the magnetic axis tipped over: the interpulse lifts the note an octave
  ['02-the-interpulse-an-octave-up', () => {
    const base = P({ sightline: 0.15, core: 0.6 });
    return play(base, 7, [...chord(0.1, [43], 0.8, 6.6), ...sweep(base, 'alpha', 30, 89, 1.5, 5.5, 40, false)]);
  }],
  // the sightline from the beam's middle (a triple pulse) out to its edge (one narrow pulse)
  ['03-sightline-triple-to-single', () => {
    const base = P({ height: 60, core: 0.5 });
    return play(base, 7, [...chord(0.1, [38, 45], 0.8, 6.6), ...sweep(base, 'sightline', 0, 0.95, 1, 5.5, 40, false)]);
  }],
  // no dedispersion: the DM up, the pulses smear away (top first); then a filterbank, coherent
  ['04-dispersion-smears-then-dedispersion', () => {
    const none = P({ dedisp: 'none', dm: 0.5 });
    return cat(
      play(none, 5, [...chord(0.1, [48, 55, 60], 0.8, 4.6), ...sweep(none, 'dm', 0.5, 8, 1, 4)]),
      play(P({ dedisp: 'filterbank', dm: 8 }), 2.5, chord(0.1, [48, 55, 60], 0.8, 2.2)),
      play(P({ dedisp: 'coherent', dm: 8 }), 2.5, chord(0.1, [48, 55, 60], 0.8, 2.2)));
  }],
  // undedispersed at 300 MHz: each note starts on the left and sweeps to the right
  ['05-the-sweep-down-the-band', () => play(P({ dedisp: 'none', dm: 0.4, freq: 300, bandwidth: 0.4 }), 6, notes(0.1, 1.2, [33, 36, 40, 43, 45], 0.8, 1))],
  // LOFAR at 150 MHz: scattering tails take the top off; then the same at 1.4 GHz
  ['06-scattering-at-150-mhz-then-1400', () => {
    const lofar = P({ freq: 150, dm: 35, dedisp: 'coherent', bandwidth: 0.3 });
    return cat(play(lofar, 3.5, notes(0.1, 0.8, [60, 64, 67, 72], 0.8, 0.7)), play({ ...lofar, freq: 1400 }, 3.5, notes(0.1, 0.8, [60, 64, 67, 72], 0.8, 0.7)));
  }],
  // single pulses: smooth, then flickering
  ['07-single-pulses-smooth-then-flickering', () => cat(
    play(P({ jitter: 0, height: 60 }), 3, chord(0.1, [40, 47], 0.8, 2.7)),
    play(P({ jitter: 1.4, height: 60 }), 3, chord(0.1, [40, 47], 0.8, 2.7)))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.2, FS), FS);
