// Render Hydraulis demos, each isolating one physical effect, to examples/hydraulis/*.wav
// Usage: node tools/render-hydraulis.mjs        (then node tools/encode-examples.mjs hydraulis)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS } from '../hydraulis/src/hydraulis-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const FS = 48000, SLUG = 'hydraulis';
const HydraulisEngine = await loadEngine(INSTRUMENT);
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (p, seconds, events) => { const e = new HydraulisEngine(FS); e.setParams(p); const out = renderEngine(e, seconds, events, FS); e.destroy(); return out; };
const note = (t, k, vel, len) => [[t, 'on', k, vel], [t + len, 'off', k]];
const chord = (t, keys, len, vel = 0.7) => keys.flatMap((k) => note(t, k, vel, len));
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// a melody: [[start, key, length]…]
const line = (notes, vel = 0.7, t0 = 0) => notes.flatMap(([t, k, l]) => note(t0 + t, k, vel, l));
// a knob moved from a to b between t0 and t1 (params events every 20 ms)
const sweep = (base, id, t0, t1, a, b) => {
  const ev = [];
  for (let t = t0; t <= t1 + 1e-9; t += 0.02) ev.push([t, 'params', { ...base, [id]: a + (b - a) * ((t - t0) / (t1 - t0)) }]);
  return ev;
};

// 01: a tune of our own in the Mixolydian mode on G (the white keys from G), over a held G,
// on the open and stopped ranks: the wind breathing with the pump strokes under it.
function tune() {
  const q = 0.42;
  const melody = [
    [0, 67, 1], [1, 71, 1], [2, 74, 2], [4, 72, 1], [5, 71, 1], [6, 69, 2],
    [8, 71, 1], [9, 72, 1], [10, 74, 1], [11, 76, 1], [12, 74, 3],
    [15, 72, 1], [16, 71, 1], [17, 69, 1], [18, 71, 1], [19, 67, 4],
  ].map(([t, k, l]) => [0.3 + t * q, k, l * q - 0.04]);
  const drone = [[0.3, 55, 23 * q], [0.3, 62, 10 * q], [0.3 + 12 * q, 60, 3 * q], [0.3 + 15 * q, 62, 8 * q]];
  return play(P({ stopped: true }), 0.3 + 23 * q + 1.2, [...line(melody), ...line(drone, 0.6)]);
}

const phrase = [[0, 67, 0.45], [0.5, 71, 0.45], [1.0, 74, 0.45], [1.5, 79, 0.9]];
const demos = [
  ['01-a-tune-in-the-mixolydian-mode-over-a-drone', tune],
  // the same phrase on each rank alone: the open bronze pipes, the stopped ones (odd harmonics,
  // hollow), the stopped rank an octave below, and the one an octave above
  ['02-open-stopped-octave-below-and-octave-above-in-turn', () => cat(
    play(P(), 2.6, line(phrase)), play(P({ open: false, stopped: true }), 2.6, line(phrase)),
    play(P({ open: false, low: true }), 2.6, line(phrase)), play(P({ open: false, high: true }), 2.6, line(phrase)))],
  // a chord on all four ranks held while the pumpers tire: the wind sags and the pipes droop and
  // thin; then they work hard again and the bowl fills
  ['03-tired-pumpers-the-wind-sags-then-they-pump-hard', () => {
    const base = P({ stopped: true, low: true, high: true, effort: 0.7 });
    return play(base, 10, [...chord(0.1, [55, 62, 67, 71], 9.3), ...sweep(base, 'effort', 1.5, 3, 0.7, 0.1), ...sweep(base, 'effort', 6.5, 7, 0.1, 1)]);
  }],
  // a held note while the pumpers work flat out: the bowl overfills and air gurgles out under its
  // rim, each bubble ringing at its own Minnaert pitch
  ['04-eager-pumpers-the-bowl-overflows-and-gurgles', () => play(P({ effort: 1, gurgle: 2 }), 6, [...note(0.1, 62, 0.7, 5.4), ...note(0.1, 67, 0.7, 5.4)])],
  // the same notes with the slides slammed across (3 ms: the jets speak at once, with a chiff),
  // then eased across (40 ms: the notes swell in)
  ['05-quick-slides-then-slow-ones', () => {
    const notes = line([[0.05, 55, 0.6], [0.75, 62, 0.6], [1.45, 67, 0.6], [2.15, 74, 0.9]], 0.7);
    return cat(play(P({ push: 3 }), 3.4, notes), play(P({ push: 40 }), 3.4, notes));
  }],
  // a held chord on one pump, worked slowly (Hero): each stroke a swell; then on two in turn
  // (Vitruvius): steadier
  ['06-one-pump-then-two-in-turn', () => {
    const ev = chord(0.1, [60, 64, 67], 5.2);
    return cat(play(P({ stopped: true, pumps: 'one', effort: 0.3 }), 5.8, ev), play(P({ stopped: true, pumps: 'two', effort: 0.55 }), 5.8, ev));
  }],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.5, FS), FS);
