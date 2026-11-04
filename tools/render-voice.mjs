// Render Singing Voice demos, each isolating one physical effect, to examples/voice/*.wav
// Usage: node tools/render-voice.mjs [prefix…]   (then node tools/encode-examples.mjs voice)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../voice/src/voice-instrument.js';
import { DAISY } from '../voice/src/voice-tour.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const VoiceEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'voice';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => P({ ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (params, seconds, events) => { const e = new VoiceEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const note = (t, key, dur, vel = 0.65) => [[t, 'on', key, vel], [t + dur, 'off', key]];
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (n) => { const m = /^([A-G])(#?)(-?\d)$/.exec(n); return 12 * (+m[3] + 1) + NAMES[m[1]] + (m[2] ? 1 : 0); };
// params changed at times: [[t, { … }], …], each on top of the base
const changes = (base, list) => list.map(([t, o]) => [t, 'params', { ...base, ...o }]);

// "Daisy Bell", each syllable's vowel set as it starts, the notes held to just before the next.
function daisy(params, beat = 0.4, shift = 0) {
  const ev = [];
  let t = 0.1;
  for (const [n, beats, vowel] of DAISY) {
    ev.push([t - 0.005, 'params', { ...params, vowel }], ...note(t, midi(n) + shift, beats * beat * 0.93));
    t += beats * beat;
  }
  return play(params, t + 1, ev);
}

// One low A held while the tract moves through the vowels and back.
function vowels() {
  const base = P({ vibrato: 15 }), order = [2, 1, 0, 1, 2, 3, 4, 3, 2];
  return play(base, order.length * 1.3 + 1, [...note(0.05, 45, order.length * 1.3), ...changes(base, order.map((v, i) => [i * 1.3, { vowel: v }]))]);
}

// The same D3 with the lungs pushing harder: 4, 9, then 22 cm of water.
function breath() {
  const base = P({ vibrato: 0, jitter: 2, pressure: 4 });
  return play(base, 10, [...note(0.05, 50, 9), ...changes(base, [[3, { pressure: 9 }], [6, { pressure: 22 }]])]);
}

// An F3, the folds held apart a little (breathy), far apart (a whisper), then squeezed (pressed).
function folds() {
  const base = P({ vibrato: 10 });
  return play(base, 13, [...note(0.05, 53, 12), ...changes(base, [[3, { gap: 8 }], [6, { gap: 26, pressure: 6 }], [9, { gap: -2, pressure: 14 }]])]);
}

// A G3 with the larynx tube at its usual width, then narrowed: the singer's formant.
const formant = () => cat(
  play(P({ vowel: 2.3 }), 3, note(0.05, 55, 2.6, 0.7)),
  play(P({ vowel: 2.3, larynx: 0.45 }), 3.5, note(0.05, 55, 2.9, 0.7)));

// A soprano's ee: C5 E5 G5 C6, the jaw kept shut (formant tuning off), then opening.
function soprano() {
  const run = (on) => play(preset('Soprano', { vowel: 4, tuning: on }), 6, ['C5', 'E5', 'G5', 'A5'].flatMap((n, i) => note(0.05 + i * 1.3, midi(n), 1.2)));
  return cat(run(false), run(true));
}

// A four-part chord, then the same phrase from bass to child: the tract shortens and every
// formant rises with it.
const chord = () => play(P(), 5, [[50, 0], [54, 0.4], [57, 0.8], [62, 1.2]].flatMap(([k, t]) => note(t, k, 4.4 - t, 0.6)));
function singers() {
  const phrase = (name, shift) => play(preset(name), 3.2, [['D3', 0], ['F#3', 0.5], ['A3', 1], ['D4', 1.5]].flatMap(([n, t]) => note(0.05 + t, midi(n) + shift, t === 1.5 ? 1.2 : 0.47)));
  return cat(phrase('Bass', -5), phrase('Baritone', 0), phrase('Tenor', 5), phrase('Alto', 12), phrase('Soprano', 17), phrase('Child', 19));
}

const demos = [
  ['01-daisy-bell', () => daisy(P())],
  ['02-the-vowels-from-ah-to-oo-to-ee', vowels],
  ['03-a-chord-of-four-singers', chord],
  ['04-soft-then-harder-breath', breath],
  ['05-breathy-whisper-then-pressed', folds],
  ['06-the-singers-formant', formant],
  ['07-a-sopranos-high-ee-jaw-shut-then-open', soprano],
  ['08-bass-to-child', singers],
  ['09-daisy-bell-as-in-1961', () => daisy(preset('Straight tone'), 0.42)],
];

const only = process.argv.slice(2);
for (const [name, fn] of demos) {
  if (only.length && !only.some((p) => name.startsWith(p))) continue;
  saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
}
