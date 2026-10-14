// Render Bubble Organ demos, each isolating one physical effect, to examples/bubbles/*.wav
// Usage: node tools/render-bubbles.mjs        (then node tools/encode-examples.mjs bubbles)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { BubbleEngine } from '../bubbles/src/bubbles-engine.js';
import { DEFAULTS } from '../bubbles/src/bubbles-params.js';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const FS = 48000, SLUG = 'bubbles';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (p, seconds, events, seed = 0x5eed) => { const e = new BubbleEngine(FS, seed); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const note = (t, k, vel, len) => [[t, 'on', k, vel], [t + len, 'off', k]];
const notes = (t0, dt, keys, vel, len = 0.05) => keys.flatMap((k, i) => note(t0 + i * dt, k, vel, len));
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

// 01: a tune over a held bass brook: taps are single bubbles, held notes are brooks
function tune() {
  const ev = [];
  const mel = [[0.2, 76], [0.5, 79], [0.8, 84], [1.25, 83], [1.55, 79], [1.85, 76], [2.3, 74], [2.6, 76], [2.9, 79], [3.5, 81],
    [4.2, 77], [4.5, 81], [4.8, 86], [5.25, 84], [5.55, 81], [5.85, 77], [6.3, 76], [6.6, 79], [6.9, 84], [7.5, 88], [8.1, 91]];
  for (const [t, k] of mel) ev.push(...note(t, k, 0.6 + 0.2 * Math.sin(3 * t), 0.06));
  ev.push(...note(0.0, 60, 0.7, 4.0), ...note(0.0, 67, 0.45, 2.1), ...note(2.1, 64, 0.45, 1.9));
  ev.push(...note(4.0, 65, 0.7, 4.0), ...note(4.0, 72, 0.45, 2.1), ...note(6.1, 69, 0.45, 1.9));
  ev.push(...note(8.05, 60, 0.75, 1.2), ...note(8.1, 64, 0.5, 1.1), ...note(8.15, 67, 0.5, 1.0));
  return play(P({ rate: 4, spread: 1 }), 10, ev);
}

// the same phrase (a rising arpeggio and two held brooks) under different conditions
const phrase = (vel = 0.75) => [...notes(0.1, 0.22, [57, 64, 69, 76, 81, 88, 93, 100], vel), ...note(2.0, 62, vel, 0.9), ...note(2.0, 86, vel, 0.9)];

const demos = [
  ['01-a-tune-over-two-brooks', tune],
  // pitch ∝ √p₀: 1 atm at 30 cm, then 20 m down (+9 semitones), then a quarter atmosphere (about −12)
  ['02-surface-then-20-m-down-then-quarter-atmosphere', () => cat(play(P(), 3.2, phrase()), play(P({ depth: 20 }), 3.2, phrase()), play(P({ pressure: 0.25 }), 3.2, phrase()))],
  // air, helium (up 1.3 semitones in the bass, half a semitone at the top, and duller), argon (up 1.4–1.5 throughout), SF₆ (two down)
  ['03-air-helium-argon-then-sf6', () => cat(...['air', 'helium', 'argon', 'sf6'].map((gas) => play(P({ gas }), 2.4, notes(0.1, 0.25, [57, 69, 81, 93, 105], 0.8))))],
  // water, then glycerol: the treble only thuds, the bass still rings
  ['04-water-then-glycerol', () => cat(play(P(), 3.2, phrase()), play(P({ liquid: 'glycerol' }), 3.2, phrase()))],
  // the biggest bubbles 1 m down (a few cents flat as they rise) and then 10 cm down (rising in pitch as they near the surface)
  ['05-deep-then-shallow-bubbles-rise-in-pitch', () => cat(
    play(P({ depth: 1 }), 3.5, [...note(0.1, 57, 0.9, 0.05), ...note(1.2, 59, 0.9, 0.05), ...note(2.3, 62, 0.9, 0.05)]),
    play(P({ depth: 0.1 }), 3.5, [...note(0.1, 57, 0.9, 0.05), ...note(1.2, 59, 0.9, 0.05), ...note(2.3, 62, 0.9, 0.05)]))],
  // the neck snapping in 50 µs, then in 1 ms: too slow to ring the small bubbles
  ['06-quick-neck-snap-then-slow', () => cat(play(P(), 2.6, notes(0.1, 0.2, [60, 67, 72, 79, 84, 91, 96, 103], 0.9)), play(P({ snap: 1 }), 2.6, notes(0.1, 0.2, [60, 67, 72, 79, 84, 91, 96, 103], 0.9)))],
  // one held key: even bubbles of one size, then a Poisson torrent with a 6 % size spread
  ['07-metronome-then-torrent', () => cat(play(P({ rate: 4, irregular: 0, spread: 0 }), 3, note(0.05, 74, 0.7, 2.6)), play(P({ rate: 30, irregular: 1, spread: 6 }), 3.5, note(0.05, 74, 0.7, 3.0)))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
