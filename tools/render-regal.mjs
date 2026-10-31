// Render Regal demos, each isolating one physical effect, to examples/regal/*.wav
// Usage: node tools/render-regal.mjs        (then node tools/encode-examples.mjs regal)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS } from '../regal/src/regal-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const FS = 48000, SLUG = 'regal';
const RegalEngine = await loadEngine(INSTRUMENT);
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (p, seconds, events) => { const e = new RegalEngine(FS); e.setParams(p); const out = renderEngine(e, seconds, events, FS); e.destroy(); return out; };
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

// 01: a galliard of our own in G Dorian (B♭, and F♯ at the cadences), in triple time, on the 8′ and
// 4′: a tune over block chords, as a continuo regal would play it.
function galliard() {
  const q = 0.36, s = (b) => 0.3 + b * q;
  const tune = [
    [0, 67, 2], [2, 70, 1], [3, 69, 2], [5, 67, 1], [6, 66, 2], [8, 67, 1], [9, 69, 3],
    [12, 70, 2], [14, 72, 1], [15, 74, 2], [17, 72, 1], [18, 70, 1], [19, 69, 1], [20, 70, 1], [21, 67, 3],
  ].map(([b, k, l]) => [s(b), k, l * q - 0.05]);
  const chords = [
    [0, [43, 55, 58, 62], 3], [3, [48, 55, 60, 63], 3], [6, [50, 57, 62, 66], 3], [9, [41, 53, 57, 60], 3],
    [12, [46, 53, 58, 62], 3], [15, [43, 55, 58, 62], 3], [18, [50, 54, 57, 62], 3], [21, [43, 50, 55, 58], 3],
  ];
  const ev = [...line(tune, 0.75), ...chords.flatMap(([b, keys, l]) => chord(s(b), keys, l * q - 0.06, 0.65))];
  return play(P({ regal4: true }), s(24) + 1, ev);
}

const phrase = [[0, 55, 0.4], [0.45, 59, 0.4], [0.9, 62, 0.4], [1.35, 67, 0.9]];
const demos = [
  ['01-a-galliard-on-the-8-and-4-foot', galliard],
  // one phrase through each resonator shape: the cylinders' nasal buzz, the funnels' open brass, the
  // capped balls' muffled hum, and the bare shallots' raw rasp
  ['02-cylinders-funnels-apples-and-bare-shallots', () => cat(
    play(P(), 2.6, line(phrase)), play(P({ resonator: 'funnel' }), 2.6, line(phrase)),
    play(P({ resonator: 'apple' }), 2.6, line(phrase)), play(P({ resonator: 'none' }), 2.6, line(phrase)))],
  // a held chord while the weight on the bellows goes from 450 to 950 Pa and back: louder and
  // brassier (the reeds retuned as it moves)
  ['03-the-wind-rises', () => {
    const base = P({ pressure: 450, bellows: 'blower' });
    return play(base, 8, [...chord(0.1, [48, 55, 60, 64], 7.3), ...sweep(base, 'pressure', 1, 3.5, 450, 950), ...sweep(base, 'pressure', 4.5, 7, 950, 450)]);
  }],
  // the same chords on bare brass shallots, then on leathered ones: the slap, then a padded close
  ['04-brass-then-leathered-shallots', () => {
    const ev = [...chord(0.05, [50, 57, 62, 65], 1.1), ...chord(1.25, [48, 55, 60, 64], 1.1), ...chord(2.45, [43, 55, 59, 62], 1.6)];
    return cat(play(P(), 4.4, ev), play(P({ facing: 'leather' }), 4.4, ev));
  }],
  // a slow phrase with the tremulant drawn: the wind, and every reed, pulsing
  ['05-the-tremulant', () => play(P({ tremulant: true }), 6.5, [
    ...line([[0.1, 62, 1.4], [1.6, 65, 1.4], [3.1, 64, 1.4], [4.6, 62, 1.5]], 0.7),
    ...chord(0.1, [50, 57], 6),
  ])],
  // the Sordun, 8′ and 4′ on a big chord held long enough for the first bellows to run out and the
  // calcant's other to take over: the wind rises as a bellows sinks, and shakes at the change
  ['06-the-full-regal-and-a-bellows-change', () => play(P({ regal16: true, regal4: true }), 7, chord(0.1, [43, 50, 55, 59, 62, 67], 6.2, 0.75))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
