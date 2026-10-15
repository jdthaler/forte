// Render Star Keyboard demos, each isolating one physical effect, to examples/stars/*.wav
// Usage: node tools/render-stars.mjs        (then node tools/encode-examples.mjs stars)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { StarEngine } from '../stars/src/stars-engine.js';
import { DEFAULTS } from '../stars/src/stars-params.js';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const FS = 48000, SLUG = 'stars';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (p, seconds, events) => { const e = new StarEngine(FS); e.setParams(p); return renderEngine(e, seconds, events, FS); };
// notes: [time, key, length, velocity]
const notes = (list) => list.flatMap(([t, k, len, v = 0.7]) => [[t, 'on', k, v], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const rest = (s) => [new Float64Array(Math.round(s * FS)), new Float64Array(Math.round(s * FS))];

// 1. A slow chord progression on the subgiants and Sun-like dwarfs, over red-giant basses.
function progression() {
  const chords = [
    [38, 62, 65, 69, 72, 76],   // Dm9
    [43, 62, 65, 67, 71, 76],   // G13
    [36, 60, 64, 67, 71, 74],   // Cmaj9
    [41, 60, 64, 69, 71, 79],   // Fmaj7♯11
  ];
  const ev = [], len = 2.5;
  chords.forEach((c, i) => c.forEach((k, j) => ev.push([0.1 + i * len + 0.06 * j, k, i === chords.length - 1 ? len + 0.6 : len - 0.1, j ? 0.6 : 0.75])));
  return play(P(), 0.1 + chords.length * len + 1.8, notes(ev));
}

const demos = [
  ['01-a-slow-chord-progression', progression],
  // 2. The Sun itself (G6) held, then released: the convection stops and the modes ring down, 14 dB a second
  ['02-the-sun-held-then-released', () => play(P(), 6.5, notes([[0.1, 91, 4.2, 0.8]]))],
  // 3. Down the track, one key an octave: a Sun-like dwarf (C7), the Sun's neighbours, subgiants, red giants (C2)
  ['03-a-walk-down-the-track-from-dwarf-to-red-giant', () => play(P(), 12, notes([[0.1, 96, 1.6], [1.8, 84, 1.6], [3.5, 72, 1.8], [5.4, 60, 1.9], [7.4, 48, 2], [9.5, 36, 2.1, 0.8]]))],
  // 4. Rotation: the same Sun-like star (C6) turning at the Sun's rate, then 25 times faster: its multiplets split and beat
  ['04-rotation-slow-then-fast', () => cat(play(P({ spin: 1 }), 4.6, notes([[0.1, 84, 4, 0.8]])), rest(0.3), play(P({ spin: 25 }), 4.6, notes([[0.1, 84, 4, 0.8]])))],
  // 5. Inclination: a fast rotator seen pole-on (only m = 0: single lines), then equator-on (the split outer components)
  ['05-inclination-pole-on-then-equator-on', () => cat(play(P({ spin: 20, incl: 0 }), 4.6, notes([[0.1, 79, 4, 0.8]])), rest(0.3), play(P({ spin: 20, incl: 90 }), 4.6, notes([[0.1, 79, 4, 0.8]])))],
  // 6. A red giant struck by a flare, with the convection off (linewidths × 2.5, so it happens within the demo): the p-like
  //    modes die away and, after about five seconds, the core's narrower g-dominated mixed modes ring on alone
  ['06-a-red-giant-rings-in-its-mixed-modes', () => play(P({ driving: 0, flare: 2.2, damping: 2.5 }), 11, [[0.1, 'on', 41, 0.9], [0.3, 'off', 41]])],
  // 7. δ Scuti on A3: three radial modes and a few nonradial ones grow and hold steady; then a Sun-like star on the same key breathes
  ['07-delta-scuti-against-a-solar-like-star', () => cat(play(P({ family: 'dscuti', spin: 20 }), 5, notes([[0.1, 57, 4.2, 0.75]])), rest(0.3), play(P(), 5, notes([[0.1, 57, 4.2, 0.75]])))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
