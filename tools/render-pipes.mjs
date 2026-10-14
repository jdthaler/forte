// Render Pipe Organ demos, each isolating one physical effect, to examples/pipes/*.wav
// Usage: node tools/render-pipes.mjs        (then node tools/encode-examples.mjs pipes)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { PipeEngine } from '../pipes/src/pipes-engine.js';
import { DEFAULTS } from '../pipes/src/pipes-params.js';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const FS = 48000, SLUG = 'pipes';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (p, seconds, events, seed = 1) => { const e = new PipeEngine(FS, seed); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const note = (t, k, vel, len) => [[t, 'on', k, vel], [t + len, 'off', k]];
const chord = (t, keys, len, vel = 0.8) => keys.flatMap((k) => note(t, k, vel, len));
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// a melody: [[start, key, length]…]
const line = (notes, vel = 0.8, t0 = 0) => notes.flatMap(([t, k, l]) => note(t0 + t, k, vel, l));
// a knob swept from a to b between t0 and t1 (params events every 20 ms), log or linear
const sweep = (base, id, pts) => {
  const ev = [];
  for (let i = 1; i < pts.length; i++) {
    const [t0, a] = pts[i - 1], [t1, b] = pts[i];
    for (let t = t0; t <= t1 + 1e-9; t += 0.02) { const u = (t - t0) / (t1 - t0); ev.push([t, 'params', { ...base, [id]: a * (b / a) ** u }]); }
  }
  return ev;
};

// 01: the opening gestures of the Toccata in D minor, BWV 565 (attributed to J. S. Bach), on the
// plenum (Principal 8′, Octave 4′, Mixture), played with a quick touch: each gesture an octave lower,
// then a D minor chord over the low D.
function toccata() {
  const A5 = 81, G5 = 79, F5 = 77, E5 = 76, D5 = 74, Cs5 = 73;
  const ev = [];
  let t = 0.1;
  const mordent = (k, hold) => { ev.push(...line([[t, k, 0.1], [t + 0.1, k - 2, 0.1], [t + 0.2, k, hold]], 1)); t += 0.2 + hold + 0.25; };
  const run = (ks, last, step = 0.13) => { ks.forEach((k, i) => ev.push(...note(t + i * step, k, 1, step * 0.92))); t += ks.length * step; ev.push(...note(t, last, 1, 1.0)); t += 1.15; };
  mordent(A5, 0.45); run([G5, F5, E5, D5, Cs5], D5);
  mordent(A5 - 12, 0.4); run([E5 - 12, F5 - 12, Cs5 - 12], D5 - 12, 0.2);
  mordent(A5 - 24, 0.35); run([G5 - 24, F5 - 24, E5 - 24, D5 - 24, Cs5 - 24], D5 - 24);
  ev.push(...chord(t, [38, 50, 53, 57, 62, 65, 69], 1.5, 1));
  return play(P({ octave: true, mixture: true }), t + 1.95, ev);
}

const phrase = [[0, 60, 0.45], [0.5, 64, 0.45], [1.0, 67, 0.45], [1.5, 72, 0.9]];
const demos = [
  ['01-toccata-in-d-minor-opening-on-the-plenum', toccata],
  // the same phrase on each stop alone: the open Principal, the stopped Gedackt (odd harmonics only,
  // hollow), the Octave 4′ an octave up, the Mixture's octaves and fifths
  ['02-principal-gedackt-octave-and-mixture-in-turn', () => cat(
    play(P(), 2.45, line(phrase)), play(P({ principal: false, gedackt: true }), 2.45, line(phrase)),
    play(P({ principal: false, octave: true }), 2.45, line(phrase)), play(P({ principal: false, mixture: true }), 2.45, line(phrase)))],
  // c, g, c¹ with the pallet slammed open (1.5 ms: the upper modes speak first, the chiff), then
  // opened slowly (60 ms: the pipe swells in on its fundamental)
  ['03-a-fast-pallet-then-a-slow-one-the-chiff', () => {
    const notes = line([[0.05, 48, 0.7], [0.85, 55, 0.7], [1.65, 60, 0.9]], 0.7);
    return cat(play(P({ rise: 1.5 }), 2.9, notes), play(P({ rise: 60 }), 2.9, notes));
  }],
  // c¹ held on the Principal, its mouth cut low (×0.7), while the wind rises from 250 to 3000 Pa and
  // falls back: at about 2 kPa the pipe jumps to its octave, and it drops back only near 300 Pa
  ['04-the-wind-rises-the-pipe-overblows-and-drops-back-late', () => {
    const base = P({ cutup: 0.7, pressure: 250 });
    return play(base, 9.5, [...note(0.05, 60, 0.7, 9.2), ...sweep(base, 'pressure', [[0.6, 250], [4.6, 3000], [8.9, 250]])]);
  }],
  // a held c¹, then a big chord on Principal, Octave and Gedackt: a steady wind barely moves; a
  // flexible one sags, dips and breathes at its own 5.5 Hz as the trunk's air catches up
  ['05-a-big-chord-on-a-steady-wind-then-a-flexible-one', () => {
    const ev = [...note(0.05, 60, 0.8, 3.7), ...chord(1.0, [36, 48, 55, 64, 67, 72, 76, 79], 2.7, 1)];
    const st = { octave: true, gedackt: true };
    return cat(play(P({ ...st, wind: 0 }), 4.2, ev), play(P({ ...st, wind: 1 }), 4.2, ev));
  }],
  // a phrase on the Gedackt, then with the tremulant's valve beating 5.5 times a second
  ['06-gedackt-then-with-the-tremulant', () => {
    const tune = [[0, 72, 0.4], [0.45, 71, 0.4], [0.9, 69, 0.4], [1.35, 67, 0.9], [2.3, 69, 0.4], [2.75, 71, 0.4], [3.2, 72, 1.0]];
    const bass = [[0, 60, 1.3], [1.35, 59, 0.9], [2.3, 57, 0.9], [3.2, 55, 1.0]];
    const ev = [...line(tune), ...line(bass), ...line([[0, 64, 4.2]])];
    return cat(play(P({ principal: false, gedackt: true }), 4.6, ev), play(P({ principal: false, gedackt: true, tremulant: true }), 4.6, ev));
  }],
  // the same arpeggio with the mouths cut high (×1.5: round, slow, a little flat), as voiced, and low
  // (×0.8: bright and chiffy, close to overblowing)
  ['07-cut-up-high-then-as-voiced-then-low', () => {
    const arp = line([[0.05, 48, 2.3], [0.35, 55, 2.0], [0.65, 64, 1.7], [0.95, 72, 1.4]]);
    return cat(play(P({ cutup: 1.5 }), 2.8, arp), play(P(), 2.8, arp), play(P({ cutup: 0.8 }), 2.8, arp));
  }],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.55, FS), FS);
