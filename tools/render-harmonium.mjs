// Render Free-Reed Organ demos, each isolating one physical effect, to examples/harmonium/*.wav
// Usage: node tools/render-harmonium.mjs        (then node tools/encode-examples.mjs harmonium)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { HarmoniumEngine } from '../harmonium/src/harmonium-engine.js';
import { DEFAULTS } from '../harmonium/src/harmonium-params.js';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const FS = 48000, SLUG = 'harmonium';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (p, seconds, events, seed = 1) => { const e = new HarmoniumEngine(FS, seed); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const note = (t, k, vel, len) => [[t, 'on', k, vel], [t + len, 'off', k]];
const chord = (t, keys, len, vel = 0.7) => keys.flatMap((k) => note(t, k, vel, len));
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// a knob swept from a to b between t0 and t1 (params events every 20 ms)
const sweep = (base, id, a, b, t0, t1, log = true) => {
  const ev = [];
  for (let t = t0; t <= t1 + 1e-9; t += 0.02) { const u = (t - t0) / (t1 - t0); ev.push([t, 'params', { ...base, [id]: log ? a * (b / a) ** u : a + (b - a) * u }]); }
  return ev;
};

// 01: "Old Hundredth" (Louis Bourgeois, Genevan Psalter, 1551), first line, in four parts,
// on the 8′ with a voix céleste tuned 5 ¢ sharp: the harmonium as it is usually heard.
function hymn() {
  const S = [67, 67, 66, 64, 62, 67, 69, 71], A = [62, 62, 62, 60, 59, 62, 62, 62], T = [59, 59, 57, 55, 55, 59, 54, 55], B = [43, 43, 50, 48, 43, 52, 50, 43];
  const ev = [], beat = 0.78;
  for (let i = 0; i < 8; i++) {
    const t = 0.1 + i * beat, len = i === 7 ? 2.2 : beat - 0.06;
    for (const v of [S, A, T, B]) ev.push(...note(t, v[i], 0.7, len));
  }
  return play(P({ musette: 'two', detune: 5 }), 9.5, ev);
}

const demos = [
  ['01-old-hundredth-on-the-8-foot-and-voix-celeste', hymn],
  // A4 alone, then with one reed 12 ¢ sharp (beats at 3.1 per second), then three reeds (±12 ¢)
  ['02-one-reed-then-musette-of-two-then-three', () => cat(
    play(P(), 2.6, note(0.05, 69, 0.7, 2.3)), play(P({ musette: 'two' }), 2.6, note(0.05, 69, 0.7, 2.3)), play(P({ musette: 'three' }), 2.6, note(0.05, 69, 0.7, 2.3)))],
  // a held chord through the expression stop while the wind rises from 120 to 2500 Pa: slow and
  // soft near the thresholds, then louder, brighter and a few cents flatter
  ['03-wind-rising-from-a-whisper-to-full', () => {
    const base = P({ expression: true, pressure: 120 });
    return play(base, 8, [...chord(0.05, [48, 55, 64, 72, 79], 7.6), ...sweep(base, 'pressure', 120, 2500, 0.3, 6.8)]);
  }],
  // the same rising arpeggio with a slow key (the pallet opens in 30 ms), a fast one (3 ms), and with percussion
  ['04-slow-key-fast-key-then-percussion', () => {
    const arp = (vel) => [48, 52, 55, 60, 64, 67].flatMap((k, i) => note(0.05 + i * 0.22, k, vel, 0.2));
    return cat(play(P(), 1.8, arp(0.1)), play(P(), 1.8, arp(1)), play(P({ percussion: true }), 1.8, arp(1)));
  }],
  // a chord pumped at 1.2 strokes a second: through the reservoir, then through the expression stop
  ['05-pumped-through-the-reservoir-then-the-expression-stop', () => cat(
    play(P({ pump: 1.2 }), 4, chord(0.05, [53, 57, 60, 65], 3.7)), play(P({ pump: 1.2, expression: true }), 4, chord(0.05, [53, 57, 60, 65], 3.7)))],
  // an accordion musette (three reeds, 15 ¢) in the open, then sounding through the cassotto
  ['06-accordion-musette-open-then-in-the-cassotto', () => {
    const tune = [[0, 76, 0.4], [0.45, 74, 0.2], [0.7, 72, 0.4], [1.15, 71, 0.2], [1.4, 72, 0.9], [2.4, 69, 0.4], [2.85, 72, 0.9]];
    const ev = [...tune.flatMap(([t, k, l]) => note(0.05 + t, k, 0.8, l)), ...chord(0.05, [45, 52, 57], 1.3), ...chord(1.45, [45, 52, 57], 0.8), ...chord(2.4, [41, 48, 57], 1.3)];
    const acc = { musette: 'three', detune: 15, expression: true };
    return cat(play(P(acc), 4.2, ev), play(P({ ...acc, cassotto: true }), 4.2, ev));
  }],
  // a cadence on the 8′, then with the 16′ added, then full: 16′, 8′ and 4′
  ['07-eight-foot-then-with-sixteen-then-full-organ', () => {
    const cad = [...chord(0.05, [48, 60, 64, 67], 0.9), ...chord(1.0, [53, 60, 65, 69], 0.9), ...chord(1.95, [55, 59, 62, 67], 0.9)];
    return cat(play(P(), 3.2, cad), play(P({ bourdon: true }), 3.2, cad), play(P({ bourdon: true, piccolo: true }), 3.2, cad));
  }],
  // the same arpeggio at a gentle 150 Pa (the reeds speak late and soft, the top barely), then at 800 Pa
  ['08-gentle-wind-near-threshold-then-normal', () => {
    const arp = [48, 55, 60, 67, 72, 79, 84, 91].flatMap((k, i) => note(0.05 + i * 0.25, k, 0.7, 3.6 - i * 0.25));
    return cat(play(P({ pressure: 150 }), 4.2, arp), play(P(), 4.2, arp));
  }],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
