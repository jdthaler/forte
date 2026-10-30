// Render Trautonium demos, each isolating one physical effect, to examples/trautonium/*.wav
// Usage: node tools/render-trautonium.mjs [prefix…]   (then node tools/encode-examples.mjs trautonium)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../trautonium/src/trautonium-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const TrautoniumEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'trautonium';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => P({ ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (params, seconds, events) => { const e = new TrautoniumEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const note = (t, key, dur, vel = 0.7) => [[t, 'on', key, vel], [t + dur, 'off', key]];
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// A finger's vibrato on the wire from t0 to t1: a slow wobble of the bend (in wheel units, ±2 semitones),
// growing in after the note settles.
const vibrato = (t0, t1, depth = 0.06, rate = 5.5) => {
  const ev = [];
  for (let t = t0; t < t1; t += 0.01) ev.push([t, 'msg', { type: 'bend', value: depth * Math.min(1, (t - t0) / 0.4) * Math.sin(2 * Math.PI * rate * (t - t0)) }]);
  ev.push([t1, 'msg', { type: 'bend', value: 0 }]);
  return ev;
};

// A slow melody on one wire, as Sala played it: the finger slides between legato notes and
// leans into the long ones with a vibrato.
function melody() {
  const B = 0.42, line = [[57, 2], [60, 1], [64, 1], [62, 3], [60, 1], [59, 2], [55, 2], [57, 4]];
  const ev = [];
  let beat = 0;
  for (const [k, beats] of line) {
    ev.push([beat * B, 'on', k, 0.8]);
    if (beats >= 2) ev.push(...vibrato(beat * B + 0.25, (beat + beats) * B - 0.02));
    beat += beats;
    ev.push([beat * B + 0.06, 'off', k]); // the next key goes down just before this one lifts: a slide
  }
  return play(P({ mode: 'wire', glide: 0.12, sub1: 0.35, f1: 650 }), beat * B + 1.5, ev);
}

// One held C3, the dividers switched into the mixture one at a time: ÷2, ÷3, ÷4, ÷5 (the undertones).
function undertones() {
  const ev = note(0, 48, 7.5, 0.8), levels = { sub1: 0, sub2: 0, sub3: 0, sub4: 0 };
  [1, 2, 3, 4].forEach((i) => { levels[`sub${i}`] = 0.7 - 0.1 * i; ev.push([1.4 * i, 'params', P({ ...levels, master: 0.8 })]); });
  return play(P({ master: 0.8 }), 8.5, ev);
}

// The same phrase through three settings of the circuits: the bare lamp, "oo", "ee".
function vowels() {
  const phrase = (p) => play(p, 2.6, [48, 52, 55, 60].flatMap((k, i) => note(0.05 + 0.5 * i, k, 0.45)));
  return cat(phrase(preset('The bare lamp')), phrase(preset('Vowel “oo”')), phrase(preset('Vowel “ee”')));
}

// The fixed circuits under a slide: one wire from C2 up to C5 and back, the vowel staying put.
function slide() {
  const ev = [[0, 'on', 36, 0.8], [0.6, 'on', 72, 0.8], [3.2, 'off', 72], [5.6, 'off', 36]];
  return play(P({ mode: 'wire', glide: 2.2, q1: 14, q2: 14, f1: 700, f2: 1800, dry: 0.1 }), 6.5, ev);
}

// The undertone chord, then the sync turned down until the dividers slip (beating, flat), then up
// until ÷4 and ÷5 fire a flash early.
function sync() {
  const mix = preset('Mixtur');
  const ev = note(0, 55, 8.5, 0.8);
  ev.push([2.5, 'params', { ...mix, sync: 0.004 }], [5.5, 'params', { ...mix, sync: 0.25 }]);
  return play(mix, 9.5, ev);
}

// The low keys with ÷24 alone: each of its flashes rings the circuits, a beat of wings.
const wings = () => play(preset('Wing beats'), 7, [...note(0, 33, 3.2, 0.9), ...note(3.4, 28, 3.3, 0.9)]);

// Aftertouch on one held note: pressed in softly, leaned on, let off (the rail's pressure sensor).
function pressure() {
  const ev = note(0, 62, 6, 0.25);
  for (let t = 0.5; t <= 5.5; t += 0.02) ev.push([t, 'msg', { type: 'pressure', value: Math.sin((Math.PI * (t - 0.5)) / 5) ** 2 }]);
  return play(preset('Vowel “oo”'), 7, ev);
}

// A bass line on the subharmonic bass: the master an octave above the ÷2 and two above the ÷4.
const bass = () => play(preset('Subharmonic bass'), 6, [48, 48, 55, 53, 51, 50, 46, 48].flatMap((k, i) => note(0.05 + 0.62 * i, k, 0.5, 0.85)));

const demos = [
  ['01-a-slow-melody-on-one-wire', melody],
  ['02-the-undertones-switched-in', undertones],
  ['03-bare-lamp-then-oo-then-ee', vowels],
  ['04-sliding-under-fixed-formants', slide],
  ['05-sync-in-step-slipping-then-early', sync],
  ['06-wing-beats-from-24', wings],
  ['07-pressing-in-and-letting-off', pressure],
  ['08-subharmonic-bass', bass],
];

const only = process.argv.slice(2);
for (const [name, fn] of demos) if (!only.length || only.some((p) => name.startsWith(p))) saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
