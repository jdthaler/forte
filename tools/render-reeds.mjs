// Render reed-piano demos, each isolating one physical effect, to examples/reeds/*.wav
// Usage: node tools/render-reeds.mjs        (then node tools/encode-examples.mjs reeds)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT } from '../reeds/src/reeds-instrument.js';
import { loadEngine } from './engine.mjs';
import { DEFAULTS, PRESETS } from '../reeds/src/reeds-params.js';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const FS = 48000, SLUG = 'reeds';
const ReedEngine = await loadEngine(INSTRUMENT);
const preset = (name, o = {}) => ({ ...DEFAULTS, ...PRESETS.find((p) => p.name === name).p, ...o });
const P = (o = {}) => ({ ...DEFAULTS, ...o });
// Render one take; the last 40 ms fade out so that takes can be joined A/B without a click.
const play = (p, seconds, events) => {
  const e = new ReedEngine(FS); e.setParams(p);
  const out = renderEngine(e, seconds, events, FS), n = out[0].length, nf = Math.round(0.04 * FS);
  e.destroy();
  for (const x of out) for (let i = 0; i < nf; i++) x[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / nf);
  return out;
};
const chord = (t0, t1, keys, vel) => keys.flatMap((k, i) => [[t0 + 0.012 * i, 'on', k, vel * (1 - 0.04 * i)], [t1, 'off', k]]);
// a broken chord: key i starts at t0 + i·dt; all are released together at t0 + (n−1)·dt + hold
const line = (t0, dt, keys, vel, len = dt * 0.9) => keys.flatMap((k, i) => (k ? [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]] : []));
const arp = (t0, dt, keys, vel, hold) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + (keys.length - 1) * dt + hold, 'off', k]]);
const cut = (events, t) => events.filter((e) => e[1] !== 'on' || e[0] < t).map((e) => (e[1] === 'off' ? [Math.min(e[0], t), ...e.slice(1)] : e));
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

// A soul-ballad phrase: rootless voicings in the left hand, a fill on top.
function phrase(t = 0, v = 1) {
  const b = 0.6; // one beat at 100 bpm
  return [
    ...chord(t, t + 2 * b, [52, 55, 59, 62], 0.55 * v), ...chord(t, t + 3.6 * b, [40], 0.7 * v),            // Em9
    ...chord(t + 2.5 * b, t + 4 * b, [52, 55, 59, 62], 0.45 * v),
    ...chord(t + 4 * b, t + 6 * b, [50, 53, 57, 60], 0.6 * v), ...chord(t + 4 * b, t + 7.6 * b, [38], 0.7 * v), // Dm9
    ...chord(t + 6.5 * b, t + 8 * b, [50, 53, 57, 60], 0.5 * v),
    ...line(t + 0.5 * b, 0.5 * b, [71, 74, 76, 79, 76, 74, 71, 0], 0.62 * v),
    ...chord(t + 8 * b, t + 12.5 * b, [48, 52, 55, 59, 62], 0.7 * v), ...chord(t + 8 * b, t + 12.5 * b, [36], 0.8 * v), // Cmaj9
    ...line(t + 8.5 * b, 0.5 * b, [79, 76, 74, 72, 74, 71], 0.7 * v), [t + 11.5 * b, 'on', 76, 0.85 * v], [t + 12.5 * b, 'off', 76],
  ];
}

const demos = [
  ['01-soul-ballad-tremolo-through-the-speakers', () => play(P({ tremDepth: 0.45 }), 9, phrase(0.1))],
  ['02-same-note-pp-to-ff-the-bark-grows', () => play(P({ output: 'direct' }), 7.2,
    [0.08, 0.18, 0.32, 0.5, 0.75, 1].flatMap((v, i) => [[0.05 + 1.2 * i, 'on', 57, v], [1.05 + 1.2 * i, 'off', 57]]))],
  ['03-reed-centred-in-the-slot-then-off-centre-then-riding-high', () => cat(
    play(P({ output: 'direct', offset: 0 }), 2.6, arp(0.05, 0.4, [45, 52, 57, 64], 0.75, 0.9)),
    play(P({ output: 'direct' }), 2.6, arp(0.05, 0.4, [45, 52, 57, 64], 0.75, 0.9)),
    play(P({ output: 'direct', offset: 1.2 }), 2.6, arp(0.05, 0.4, [45, 52, 57, 64], 0.75, 0.9)))],
  ['04-solder-light-then-heavy-same-pitch', () => cat(
    play(preset('Light solder (long reeds, more bark)', { output: 'direct' }), 4, [...arp(0.05, 0.25, [45, 52, 57, 61, 64, 69], 0.8, 0.6), ...chord(2.0, 3.5, [57], 0.9)]),
    play(preset('Heavy solder (short reeds, sweet, short sustain)', { output: 'direct' }), 4, [...arp(0.05, 0.25, [45, 52, 57, 61, 64, 69], 0.8, 0.6), ...chord(2.0, 3.5, [57], 0.9)]))],
  ['05-tremolo-photocell-on-a-held-chord', () => play(preset('Tremolo through the speakers', { tremDepth: 0.8 }), 7.5,
    [...chord(0.1, 3.6, [53, 57, 60, 64], 0.75), ...chord(0.1, 3.6, [41], 0.8), ...chord(3.8, 7.2, [55, 59, 62, 65], 0.75), ...chord(3.8, 7.2, [43], 0.8)])],
  ['06-direct-out-then-built-in-speakers', () => cat(play(P({ output: 'direct' }), 4.6, cut(phrase(0.1), 4.1)), play(P(), 4.6, cut(phrase(0.1), 4.1)))],
  ['07-feed-resistor-22-megohm-then-1-megohm-constant-charge-vs-voltage', () => cat(
    play(P({ output: 'direct' }), 3.5, arp(0.05, 0.4, [33, 40, 45, 52, 57], 0.8, 1.2)),
    play(P({ output: 'direct', rbias: 1 }), 3.5, arp(0.05, 0.4, [33, 40, 45, 52, 57], 0.8, 1.2)))],
];

for (const [name, fn] of demos) {
  const t0 = performance.now();
  saveExample(SLUG, name, await withRoom(fn(), 0.2, FS), FS);
  console.log(`   (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}
