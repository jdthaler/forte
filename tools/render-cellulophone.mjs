// Render Cellulophone demos, each isolating one physical effect, to examples/cellulophone/*.wav
// Usage: node tools/render-cellulophone.mjs [prefix…]   (then node tools/encode-examples.mjs cellulophone)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../cellulophone/src/cellulophone-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const CellulophoneEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'cellulophone';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => P({ ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (params, seconds, events) => { const e = new CellulophoneEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const note = (t, key, dur, vel = 0.8) => [[t, 'on', key, vel], [t + dur, 'off', key]];
const chord = (t, keys, dur, vel = 0.7) => keys.flatMap((k) => note(t, k, dur, vel));
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

// A slow hymn-like phrase over held chords, on the flute screens of the 54-slot disc (its few cents
// out of tune included).
function hymn(params) {
  const B = 0.55, ev = [];
  const melody = [[72, 1], [74, 1], [76, 2], [74, 1], [72, 1], [71, 2], [72, 1], [76, 1], [79, 2], [77, 1], [76, 1], [74, 2], [72, 4]];
  let beat = 0;
  for (const [k, d] of melody) { ev.push(...note(beat * B, k, d * B - 0.05, 0.85)); beat += d; }
  [[48, 55, 64], [53, 57, 65], [55, 59, 62], [48, 55, 64], [53, 60, 65], [55, 59, 65], [48, 55, 64]].forEach((c, i) => ev.push(...chord(i * 3 * B, c, (i === 6 ? 4 : 3) * B - 0.06, 0.55)));
  return play(params, beat * B + 1.2, ev);
}

// One held A3 as the stops bring in the screens one after another: sine, flûte, clarinette,
// hautbois, trompe de chasse, violon, voix humaine.
function screens() {
  const ev = note(0, 57, 13.6), order = ['sine', 'flute', 'clarinet', 'oboe', 'horn', 'violin', 'voix'];
  order.forEach((s, i) => { if (i) ev.push([2 * i, 'params', P({ screen: s })]); });
  return play(P({ screen: 'sine' }), 14.3, ev);
}

// A major chord on Toulon's 54-slot disc, then on one sixteen times as fine: the coarse disc's
// rounding makes the thirds beat.
function tuning() {
  const ev = [...chord(0.05, [50, 54, 57, 62], 3.2, 0.75), ...chord(3.6, [52, 56, 59, 64], 3.2, 0.75)];
  return cat(play(P({ screen: 'violin' }), 7.2, ev), play(P({ screen: 'violin', disc: '864' }), 7.2, ev));
}

// The same phrase through narrow slots, the default ones and wide ones: the slot averages the
// screen, so the wider it is the fewer harmonics and the more light.
function slots() {
  const phrase = [48, 52, 55, 60, 64, 60, 55, 52].flatMap((k, i) => note(0.05 + 0.3 * i, k, 0.28, 0.8));
  return cat(...[0.025, 0.06, 0.3].map((slot) => play(P({ screen: 'oboe', slot }), 2.8, phrase)));
}

// A held chord, the keys pushed back slowly and forward again (the mod wheel): the slit narrows
// the light into short flashes.
function push() {
  const ev = chord(0, [45, 52, 57, 61], 7.6, 0.8);
  for (let i = 1; i <= 30; i++) { const t = i * 0.25, p = Math.sin((Math.PI * i) / 30); ev.push([t, 'params', P({ screen: 'oboe', push: p })]); }
  return play(P({ screen: 'oboe' }), 8.2, ev);
}

// The hunting horn's call with its tremolo screen.
const horn = () => play(preset('Trompe de chasse'), 6.6, [[60, 0.5], [65, 0.5], [69, 0.5], [72, 1.5], [69, 0.5], [72, 0.5], [77, 2]].reduce((acc, [k, d]) => { acc.ev.push(...note(acc.t, k, d - 0.05, 0.9)); acc.t += d; return acc; }, { t: 0.05, ev: [] }).ev);

// A piano phrase with the damping arcs: each note's light narrows away in a straight line.
const piano = () => play(preset('Piano'), 7, [60, 64, 67, 72, 71, 67, 62, 65, 69, 72].flatMap((k, i) => note(0.05 + 0.45 * i, k, 2.4, 0.85)));

// Chords on batteries, then on the Paris mains (a 100 Hz hum with every note), then through a
// selenium cell (slow, and growling where notes share a cell).
function light() {
  const ev = [...chord(0.05, [48, 55, 64], 1.6, 0.8), ...[60, 64, 67, 72].flatMap((k, i) => note(1.8 + 0.18 * i, k, 0.16, 0.8))];
  return cat(...[{}, { lamp: '50' }, { cell: 'selenium' }].map((o) => play(P(o), 2.8, ev)));
}

// A screen for each octave: an arpeggio up the keyboard changes timbre at every disc.
const octaves = () => play(preset('Eight timbres'), 7.5, [33, 40, 45, 52, 57, 64, 69, 76, 81, 88, 93, 100].flatMap((k, i) => note(0.05 + 0.4 * i, k, 2.4, 0.8)));

const demos = [
  ['01-a-hymn-on-the-flute-screens', () => hymn(P())],
  ['02-the-screens-one-after-another', screens],
  ['03-whole-slots-then-a-fine-disc', tuning],
  ['04-narrow-then-usual-then-wide-slots', slots],
  ['05-pushing-the-keys-back', push],
  ['06-hunting-horn-with-tremolo', horn],
  ['07-the-damping-arcs', piano],
  ['08-battery-mains-then-selenium', light],
  ['09-a-screen-for-each-octave', octaves],
];

const only = process.argv.slice(2);
for (const [name, fn] of demos) if (!only.length || only.some((p) => name.startsWith(p))) saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
