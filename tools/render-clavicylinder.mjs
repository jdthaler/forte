// Render clavicylinder demos, each isolating one physical effect, to examples/clavicylinder/*.wav
// Usage: node tools/render-clavicylinder.mjs [prefix…]   (then node tools/encode-examples.mjs clavicylinder)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS } from '../clavicylinder/src/clavicylinder-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const ClavicylinderEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'clavicylinder';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (params, seconds, events) => { const e = new ClavicylinderEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const note = (t, key, dur, vel = 0.5) => [[t, 'on', key, vel], [t + dur, 'off', key]];
// One continuous performance in which a parameter changes between notes.
const ab = (pa, pb, tSwitch, seconds, events) => play(pa, seconds, [...events, [tSwitch, 'params', pb]]);

// A slow chorale in F, the kind of piece Chladni played on his tours: four voices held and
// moved together, the keys let go just before the next chord so each bar's ring is heard.
function chorale() {
  const B = 0.9, ev = [];
  const chord = (beat, keys, beats, vel = 0.45) => keys.forEach((k) => ev.push(...note(beat * B, k, beats * B - 0.05, vel)));
  const seq = [
    [[41, 57, 60, 69], 2], [[46, 58, 62, 70], 1], [[48, 57, 64, 72], 1],
    [[50, 57, 65, 74], 2], [[46, 58, 65, 74], 1], [[48, 58, 64, 72], 1],
    [[41, 57, 65, 72], 1], [[43, 58, 62, 70], 1], [[48, 55, 64, 70], 1], [[48, 55, 64, 72], 1],
    [[41, 53, 60, 69], 3.5],
  ];
  let beat = 0;
  for (const [keys, beats] of seq) { chord(beat, keys, beats); beat += beats; }
  return play(P(), beat * B + 2.5, ev);
}

// The key pressure swept on one held bar: silent below the threshold, a swell as it passes it,
// little more once it sings, and the note fading away as the pressure is let off (smorzando).
function pressure() {
  const T = 10, ev = note(0, 67, T, 0.5), lo = 0.03, hi = 3;
  for (let t = 0; t <= T; t += 0.05) {
    const u = t < T / 2 ? t / (T / 2) : 2 - t / (T / 2);
    ev.push([t, 'params', P({ press: lo * (hi / lo) ** u })]);
  }
  return play(P({ press: lo }), T + 1.5, ev);
}

const demos = [
  ['01-chorale-in-f', chorale],
  ['02-pressure-swell-and-smorzando', pressure],
  ['03-gentle-keys-swell-firm-keys-speak', () => {
    const run = (t, vel) => [60, 64, 67, 72].flatMap((k, i) => note(t + 0.7 * i, k, 0.6, vel));
    return play(P({ press: 0.4 }), 7, [...run(0, 0.08), ...run(3.4, 1)]);
  }],
  ['04-trills-and-runs', () => { // the Institut: prompt speech, trills possible
    const ev = [];
    for (let i = 0; i < 16; i++) ev.push(...note(0.1 + 0.11 * i, i % 2 ? 74 : 72, 0.1, 0.7));
    [72, 74, 76, 77, 79, 81, 83, 84, 83, 81, 79, 77, 76, 74, 72].forEach((k, i) => ev.push(...note(2.2 + 0.14 * i, k, 0.13, 0.7)));
    ev.push(...note(4.4, 60, 1.6, 0.5), ...note(4.4, 64, 1.6, 0.5), ...note(4.4, 72, 1.6, 0.6));
    return play(P(), 7, ev);
  }],
  ['05-cords-on-the-nodes-then-off', () => ab(P(), P({ cords: -0.092 }), 2.8, 6.5, [...note(0, 60, 2.4), ...note(3.2, 60, 2.6)])],
  ['06-damp-cloth-then-soaked', () => {
    const run = (t) => [48, 60, 67, 72, 79, 84, 88].flatMap((k, i) => note(t + 0.45 * i, k, 0.4, 0.6));
    return ab(P(), P({ wet: 0.95 }), 3.4, 7.2, [...run(0), ...run(3.6)]);
  }],
  ['07-compass-c2-to-f6', () => {
    const keys = [36, 40, 43, 48, 52, 55, 60, 64, 67, 72, 76, 79, 84, 88, 89];
    return play(P(), 7.5, keys.flatMap((k, i) => note(0.05 + 0.4 * i, k, 0.38, 0.6)));
  }],
];

const only = process.argv.slice(2);
// Released bars ring on for seconds, so each file ends with a short fade.
const fadeOut = (out, sec = 0.5) => { const m = Math.round(sec * FS); for (const x of out) for (let i = 0; i < m; i++) x[x.length - m + i] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / m); return out; };
for (const [name, fn] of demos) if (!only.length || only.some((o) => name.startsWith(o))) saveExample(SLUG, name, fadeOut(await withRoom(fn(), 0.3, FS)), FS);
