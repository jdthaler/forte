// Render Singing Arc demos, each isolating one physical effect, to examples/arc/*.wav
// Usage: node tools/render-arc.mjs        (then node tools/encode-examples.mjs arc)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS } from '../arc/src/arc-instrument.js';
import { KEY_LO, KEY_HI, tuneKey } from '../arc/src/arc-model.js';
import { wasmModel } from '../arc/src/arc-wasm.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const ArcEngine = await loadEngine(INSTRUMENT);
const { capFor } = await wasmModel();

const FS = 48000, SLUG = 'arc';
// each demo's capacitor bank, cut for its parameters as the page cuts it (P.table)
const keyCaps = (p) => ({ key: tuneKey(p), lo: KEY_LO, caps: Float64Array.from({ length: KEY_HI - KEY_LO + 1 }, (_, i) => capFor(KEY_LO + i, p)) });
const P = (o = {}) => { const p = { ...DEFAULTS, ...o }; return { ...p, table: keyCaps(p) }; };
const play = (p, seconds, events) => { const e = new ArcEngine(FS, 11); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// a parameter swept along a curve, sent every 20 ms (the capacitors stay as they were cut)
const sweep = (p, seconds, id, f) => { const ev = []; for (let t = 0; t < seconds; t += 0.02) ev.push([t, 'params', { ...p, [id]: f(t) }]); return ev; };
// a melody of [key, beats] at `bpm`, each key let go a moment before the next (one arc: keys held
// together would put their capacitors in parallel)
function tune(notes, bpm, t0 = 0.1, gap = 0.04) {
  const ev = []; let t = t0;
  for (const [k, beats] of notes) { const d = (60 / bpm) * beats; if (k) ev.push([t, 'on', k, 1], [t + d - gap, 'off', k]); t += d; }
  return { ev, end: t };
}

const G4 = 67, A4 = 69, B4 = 71, C5 = 72, D5 = 74, E5 = 76, Fs4 = 66;
const demos = [
  // Duddell played "God Save the Queen" on his arc at the Institution of Electrical Engineers in 1900:
  // its first phrase, on one arc
  ['01-god-save-the-queen-on-one-arc', () => {
    const { ev, end } = tune([[G4, 1], [G4, 1], [A4, 1], [Fs4, 1.5], [G4, 0.5], [A4, 1], [B4, 1], [B4, 1], [C5, 1], [B4, 1.5], [A4, 0.5], [G4, 1], [A4, 1], [G4, 1], [Fs4, 1], [G4, 3]], 96);
    return play(P(), end + 0.6, ev);
  }],
  // one key held while the rheostat lets more and more current through, 1.6 → 20 A: the falling curve
  // flattens (R_d = −B/I²); past 7 A the arc starts to hiss; a silent arc could not start above 12 A, but
  // this one is singing and holds on (the arc is bistable) to the top of the range, where it dies and
  // leaves only the hiss
  ['02-arc-current-raised-singing-then-hissing', () => {
    const p = P({ current: 1.6 }), T = 11.5;
    return play(p, T, [[0.05, 'on', 64, 1], [T - 0.3, 'off', 64], ...sweep(p, T, 'current', (t) => 1.6 * (20 / 1.6) ** Math.min(1, t / (T - 1.5)))]);
  }],
  // one arc: C5 alone, then E5 too (the capacitors add and the pitch drops below both), E5 let go,
  // then G4, with D5 added and let go
  ['03-two-keys-on-one-arc-capacitors-in-parallel', () => play(P(), 8.4, [
    [0.05, 'on', 72, 1], [1.3, 'on', 76, 1], [2.6, 'off', 76], [3.9, 'off', 72],
    [4.3, 'on', 67, 1], [5.5, 'on', 74, 1], [6.7, 'off', 74], [8.0, 'off', 67],
  ])],
  // the same arpeggio with a 4 mH coil and big capacitors (fast, bright), then an 80 mH coil and small ones
  // (slow, pure): the L/C ratio, the same notes
  ['04-small-coil-then-big-coil', () => {
    const { ev, end } = tune([[60, 1], [64, 1], [67, 1], [72, 2], [67, 1], [64, 1], [60, 2]], 132);
    return cat(play(P({ coil: 4 }), end + 0.4, ev), play(P({ coil: 80 }), end + 0.4, ev));
  }],
  // a scale up from G4 to C6 with the default column (τ = 26 µs), then a slow one (150 µs): the slow arc
  // stops looking negative above ≈ 840 Hz, so the top notes stay silent
  ['05-a-slow-column-cannot-sing-the-top-notes', () => {
    const { ev, end } = tune([[67, 1], [69, 1], [71, 1], [72, 1], [74, 1], [76, 1], [77, 1], [79, 1], [81, 1], [83, 1], [84, 2]], 150);
    return cat(play(P(), end + 0.3, ev), play(P({ tau: 150 }), end + 0.3, ev));
  }],
  // the first kind (the current never stops) and then the second (re-strike voltage 2.2 × the burning
  // voltage: the column goes out and re-strikes every cycle, and the note buzzes)
  ['06-first-kind-then-second-kind', () => {
    const ev = [[0.05, 'on', 60, 1], [2.6, 'off', 60], [2.9, 'on', 67, 1], [4.4, 'off', 67]];
    return cat(play(P(), 4.7, ev), play(P({ restrike: 2.2 }), 4.7, ev));
  }],
  // six arc lamps, a key each: a cadence
  ['07-six-arcs-in-chords', () => {
    const p = P({ mode: 'poly', arcs: 6 }), ch = (t0, t1, ks) => ks.flatMap((k) => [[t0, 'on', k, 1], [t1, 'off', k]]);
    return play(p, 8.4, [...ch(0.05, 2, [48, 55, 64, 72]), ...ch(2, 4, [53, 60, 69, 72]), ...ch(4, 6, [55, 62, 67, 71, 74]), ...ch(6, 8, [48, 55, 64, 67, 72, 76])]);
  }],
  // Simon's talking arc: a singer at the microphone, coupled into the arc through a transformer; the arc
  // turns the current into sound and sings the vowels back
  ['08-the-talking-arc', () => {
    const { ev, end } = tune([[55, 2], [57, 1], [59, 1], [60, 3], [0, 0.5], [62, 1], [59, 1], [55, 3]], 70, 0.1, 0.12);
    return play(P({ mode: 'talk' }), end + 0.5, ev);
  }],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
