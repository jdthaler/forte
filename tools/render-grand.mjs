// Render electric-grand demos, each isolating one physical effect, to examples/grand/*.wav
// Usage: node tools/render-grand.mjs        (then node tools/encode-examples.mjs grand)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS } from '../grand/src/grand-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const GrandEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'grand';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (p, seconds, events) => { const e = new GrandEngine(FS); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const chord = (t, keys, vel, len, roll = 0.012) => keys.flatMap((k, i) => [[t + i * roll, 'on', k, vel], [t + len, 'off', k]]);
// Join A/B parts; a 30 ms fade at each part's end hides the cut through the damped tail.
const fade = (x) => { const n = Math.round(0.03 * FS); for (let i = 0; i < n; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n); return x; };
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...fade(p[c])])));

// An original ballad phrase: pedalled chords over the short, wound bass strings.
function ballad() {
  const ev = [], bar = 2.0;
  const prog = [
    { bass: [36, 43], rh: [64, 67, 71, 74], mel: [[0, 79], [0.75, 76], [1.25, 74]] },  // Cmaj9
    { bass: [33, 45], rh: [60, 64, 67, 72], mel: [[0, 76], [0.75, 79], [1.25, 81]] },  // Am7
    { bass: [38, 50], rh: [60, 65, 69, 72], mel: [[0, 77], [0.75, 76], [1.25, 74]] },  // Dm9
    { bass: [31, 43], rh: [62, 65, 67, 71], mel: [[0, 74], [1.0, 71]] },              // G13sus
  ];
  prog.forEach((c, i) => {
    const t = 0.1 + i * bar;
    ev.push([t - 0.03, 'sus', false], [t + 0.05, 'sus', true]); // pedal change just after the new chord
    ev.push(...chord(t, c.bass, 0.72, bar - 0.1, 0.02), ...chord(t + 0.04, c.rh, 0.5, bar - 0.15, 0.025));
    for (const [dt, k] of c.mel) ev.push([t + dt, 'on', k, 0.78], [t + dt + 0.45, 'off', k]);
  });
  const t = 0.1 + 4 * bar;
  ev.push([t - 0.03, 'sus', false], [t + 0.05, 'sus', true]);
  ev.push(...chord(t, [36, 48], 0.75, 1.6, 0.02), ...chord(t + 0.05, [64, 67, 71, 76], 0.55, 1.6, 0.04), [t + 0.25, 'on', 84, 0.7], [t + 1.6, 'off', 84]);
  ev.push([t + 1.7, 'sus', false]);
  return play(P(), 10, ev);
}

const C = [48, 55, 64];
const demos = [
  ['01-cp70-ballad', ballad],
  ['02-piezo-then-soundboard-piezo-then-microphone', () => cat(
    play(P(), 3, chord(0.05, C, 0.7, 2.6)),
    play(P({ mount: 'board', listen: 0 }), 3, chord(0.05, C, 0.7, 2.6)),
    play(P({ mount: 'board', listen: 1 }), 3, chord(0.05, C, 0.7, 2.6)))],
  ['03-bass-short-cp70-strings-then-concert-grand-strings', () => cat(
    play(P(), 4, [...chord(0.05, [28], 0.8, 1.9), ...chord(2.0, [33, 40], 0.8, 1.8)]),
    play(P({ scale: 'concert', stringing: 'grand' }), 4, [...chord(0.05, [28], 0.8, 1.9), ...chord(2.0, [33, 40], 0.8, 1.8)]))],
  ['04-weinreich-one-string-then-two-strings-on-a-soundboard', () => cat(
    play(P({ mount: 'board', listen: 0, stringing: 'single', tilt: 0 }), 4.5, [[0.05, 'on', 60, 0.8], [4.3, 'off', 60]]),
    play(P({ mount: 'board', listen: 0, detune: 1.5, tilt: 10 }), 4.5, [[0.05, 'on', 60, 0.8], [4.3, 'off', 60]]))],
  ['05-strike-at-one-eighth-then-middle-then-near-the-end', () => cat(
    play(P(), 2.5, chord(0.05, [48], 0.75, 2.2)),
    play(P({ strike: 0.5 }), 2.5, chord(0.05, [48], 0.75, 2.2)),
    play(P({ strike: 0.04 }), 2.5, chord(0.05, [48], 0.75, 2.2)))],
  ['06-preamp-flat-then-stage-eq-then-low-impedance', () => {
    const riff = [...chord(0.05, [40, 52], 0.7, 0.5), ...chord(0.6, [59, 64, 68], 0.6, 0.5), ...chord(1.2, [40, 52], 0.65, 0.4), ...chord(1.65, [57, 62, 66], 0.6, 1.0)];
    return cat(play(P(), 3, riff), play(P({ bass: 4, mid: -5, treble: 7 }), 3, riff), play(P({ rIn: 22 }), 3, riff));
  }],
  ['07-unisons-in-tune-then-honky-tonk', () => cat(
    play(P({ detune: 0.3 }), 3.5, chord(0.05, [57, 64, 69, 73], 0.65, 3.2)),
    play(P({ detune: 10 }), 3.5, chord(0.05, [57, 64, 69, 73], 0.65, 3.2)))],
  ['08-stereo-tremolo-slow-then-fast', () => {
    const phrase = [...chord(0.05, [45, 57], 0.6, 2.9), ...chord(0.08, [64, 67, 72], 0.55, 2.9, 0.03), ...chord(1.5, [76], 0.65, 1.4)];
    return cat(play(P({ tremDepth: 0.6, tremRate: 3 }), 3.3, phrase), play(P({ tremDepth: 0.6, tremRate: 7 }), 3.3, phrase));
  }],
];

const only = process.argv[2];
for (const [name, fn] of demos) if (!only || name.startsWith(only)) saveExample(SLUG, name, await withRoom(fn(), 0.12, FS), FS);
