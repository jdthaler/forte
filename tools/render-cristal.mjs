// Render Cristal Baschet demos, each isolating one physical effect, to examples/cristal/*.wav
// Usage: node tools/render-cristal.mjs [prefix…]   (then node tools/encode-examples.mjs cristal)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../cristal/src/cristal-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const CristalEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'cristal';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => P({ ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (params, seconds, events) => { const e = new CristalEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const note = (t, key, dur, vel = 0.6) => [[t, 'on', key, vel], [t + dur, 'off', key]];
const chord = (t, keys, dur, vel = 0.6, roll = 0.12) => keys.flatMap((k, i) => note(t + i * roll, k, dur - i * roll, vel));
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// params changed over time: [t, overrides] → events, each on top of base
const changes = (base, list) => list.map(([t, o]) => [t, 'params', P({ ...base, ...o })]);

// Slow chords, the fingers stroking back and forth, a melody above them: what the cristal is played for.
function chorale() {
  const ev = [
    ...chord(0.05, [48, 55, 64], 4.2), ...note(1.2, 72, 1.9, 0.55), ...note(3.1, 71, 1.2, 0.55),
    ...chord(4.3, [45, 52, 60], 4.2), ...note(4.4, 72, 2.2, 0.55), ...note(6.6, 76, 1.8, 0.6),
    ...chord(8.6, [41, 53, 57], 4), ...note(8.7, 74, 2, 0.55), ...note(10.7, 72, 1.8, 0.55),
    ...chord(12.7, [43, 50, 59, 67], 4.6, 0.6, 0.15), ...note(12.9, 71, 4.4, 0.5),
  ];
  return play(P(), 19, ev);
}

// One key pressed just under the threshold (only the slide's hiss), just over (the note grows
// slowly from nothing), and ten times over (there at once).
const threshold = () => cat(...[0.8, 2.5, 10].map((press) => play(P({ press }), 4.4, note(0.05, 64, 3.4))));

// The stroke is the loudness: one held note stroked at 5, 10 and 20 cm/s.
const strokes = () => play(P(), 13, [...note(0.05, 62, 12), ...changes({}, [[0.05, { stroke: 0.05 }], [4.2, { stroke: 0.1 }], [8.4, { stroke: 0.2 }]])]);

// Pressing far too hard: the default, then 120 times the threshold, the tone rough and crackling.
const hard = () => cat(play(P(), 4.2, note(0.05, 55, 3.4)), play(preset('Pressing too hard'), 4.6, note(0.05, 55, 3.8)));

// Wet fingers, then dry ones: dry skin hardly lets go, and the rod barely sings.
const wet = () => cat(play(P(), 3.8, note(0.05, 67, 3)), play(preset('Dry fingers'), 3.8, note(0.05, 67, 3)));

// The same chord through the bare collector, the cones, the flame, then the cones and flame together.
const radiators = () => cat(...['bare', 'cones', 'flame', 'both'].map((radiator) => play(P({ radiator, whiskers: 0 }), 3.6, chord(0.05, [48, 60, 67, 76], 2.8))));

// High notes with the whiskers still, then swaying: their sympathetic ring sweeps in and out.
const whiskers = () => cat(...[0, 1].map((sway) => play(P({ sway }), 6.2, chord(0.05, [84, 88, 91], 5.2, 0.6, 0.2))));

// One long note, back and forth (the tone dips as the finger turns), toward you (it lifts and lands
// again), and one endless stroke.
const turns = () => cat(...['back', 'down', 'endless'].map((strokes) => play(P({ strokes }), 5.6, note(0.05, 57, 4.8))));

const demos = [
  ['01-slow-chords-and-a-melody', chorale],
  ['02-under-just-over-and-well-over-the-threshold', threshold],
  ['03-slow-usual-and-fast-strokes', strokes],
  ['04-pressing-far-too-hard', hard],
  ['05-wet-then-dry-fingers', wet],
  ['06-bare-collector-cones-flame-and-both', radiators],
  ['07-whiskers-still-then-swaying', whiskers],
  ['08-back-and-forth-toward-you-and-endless', turns],
];

const only = process.argv.slice(2);
for (const [name, fn] of demos) if (!only.length || only.some((p) => name.startsWith(p))) saveExample(SLUG, name, await withRoom(fn(), DEFAULTS.room, FS), FS);
