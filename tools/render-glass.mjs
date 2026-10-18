// Render glass-armonica demos, each isolating one physical effect, to examples/glass/*.wav
// Usage: node tools/render-glass.mjs        (then node tools/encode-examples.mjs glass)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS } from '../glass/src/glass-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const ArmonicaEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'glass';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (params, seconds, events) => { const e = new ArmonicaEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const note = (t, key, dur, vel = 0.6) => [[t, 'on', key, vel], [t + dur, 'off', key]];

// An adagio in C in the manner of Mozart's armonica pieces: held chords under a
// slow melody. The fingers go down a little early, as a player does, because
// the bowls take a moment to speak; released bowls keep ringing.
function adagio() {
  const B = 0.86, early = 0.18, ev = [];
  const at = (beat, keys, beats, vel) => keys.forEach((k) => ev.push(...note(Math.max(0, beat * B - early), k, beats * B, vel)));
  at(0, [60, 64, 67], 3.9, 0.45);                  // C
  at(0, [76], 1, 0.7); at(1, [79], 1, 0.7); at(2, [84], 1.5, 0.75); at(3.5, [83], 0.6, 0.7);
  at(4, [57, 65, 72], 1.9, 0.45);                  // F/A
  at(4, [81], 1, 0.75); at(5, [77], 1, 0.7);
  at(6, [55, 65, 71], 1.9, 0.45);                  // G7
  at(6, [79], 0.5, 0.7); at(6.5, [77], 0.5, 0.65); at(7, [74], 1, 0.7);
  at(8, [60, 64, 67], 2.4, 0.45); at(8, [72, 76], 2.4, 0.65); // C
  return play(P(), 10, ev);
}

// One continuous performance in which a parameter changes between notes
// (the spindle's flywheel takes half a second to follow the treadle).
const ab = (pa, pb, tSwitch, seconds, events) => play(pa, seconds, [...events, [tSwitch, 'params', pb]]);
const triad = (t, dur) => [72, 76, 79].flatMap((k) => note(t, k, dur, 0.7));

const demos = [
  ['01-adagio-in-c-held-chords', adagio],
  ['02-treadle-slow-then-fast-warble', () => ab(P({ speed: 0.3, split: 16 }), P({ speed: 1.2, split: 16 }), 3.9, 9,
    [...note(0, 79, 3.5, 0.7), ...note(4.6, 79, 3.6, 0.7)])],
  ['03-perfect-bowl-then-split-doublet', () => ab(P({ split: 0, treadle: 0 }), P({ split: 25, treadle: 0 }), 3.9, 9,
    [...note(0, 69, 3.5, 0.7), ...note(4.4, 69, 3.8, 0.7)])],
  ['04-finger-pressure-silent-speaking-squealing', () => {
    const ev = note(0, 72, 8.8, 0.6);
    for (let t = 0; t <= 8.8; t += 0.05) ev.push([t, 'params', P({ press: 0.5 * 60 ** (t / 8.8) })]);
    return play(P({ press: 0.5 }), 9.6, ev);
  }],
  ['05-water-poured-into-a-ringing-bowl', () => { // touch, pour while it rings (it glides down), touch again
    const ev = [...note(0, 67, 2.2, 0.7), ...note(5.6, 67, 2.6, 0.7)];
    for (let t = 2.6; t <= 5.2; t += 0.02) ev.push([t, 'params', P({ water: 0.64 * Math.sin((0.5 * Math.PI * (t - 2.6)) / 2.6) })]);
    return play(P(), 9.5, ev);
  }],
  ['06-dry-fingers-then-wet', () => ab(P({ wet: 0.08 }), P({ wet: 0.85 }), 3.4, 8.5, [...triad(0, 3), ...triad(3.6, 3.4)])],
  ['07-finger-lifted-free-bowl-precesses', () => play(P({ split: 0, treadle: 0 }), 9, [...note(0, 69, 2, 0.8), ...note(0, 76, 2, 0.7)])],
];

const only = process.argv.slice(2);
// Bowls ring for many seconds after the finger lifts, so each file ends with a short fade.
const fadeOut = (out, sec = 0.5) => { const m = Math.round(sec * FS); for (const x of out) for (let i = 0; i < m; i++) x[x.length - m + i] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / m); return out; };
for (const [name, fn] of demos) if (!only.length || only.some((o) => name.startsWith(o))) saveExample(SLUG, name, fadeOut(await withRoom(fn(), 0.3, FS)), FS);
