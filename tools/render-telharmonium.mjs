// Render Telharmonium demos, each isolating one physical effect, to examples/telharmonium/*.wav
// Usage: node tools/render-telharmonium.mjs [prefix…]   (then node tools/encode-examples.mjs telharmonium)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../telharmonium/src/telharmonium-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const TelharmoniumEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'telharmonium';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => P({ ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (params, seconds, events) => { const e = new TelharmoniumEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const note = (t, key, dur, vel = 0.8) => [[t, 'on', key, vel], [t + dur, 'off', key]];
const chord = (t, keys, dur, vel = 0.7) => keys.flatMap((k) => note(t, k, dur, vel));
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const stops = (m, a) => Object.fromEntries(a.map((v, i) => [`${m}${i + 1}`, v]));

// A tune on Manual II over chords on Manual I, as the Hall's players gave it: the melody's buses
// voiced for flute and oboe, the accompaniment a softer ground tone.
function tune() {
  const B = 0.5, ev = [];
  const melody = [[67, 1], [72, 1], [71, 0.5], [69, 0.5], [67, 1], [64, 1], [65, 0.5], [67, 0.5], [69, 2], [67, 1], [65, 1], [64, 1], [62, 1], [60, 3]];
  let beat = 0;
  for (const [k, d] of melody) { ev.push(...note(beat * B, k, d * B - 0.04, 0.85)); beat += d; }
  const bars = [[48, 52, 55], [48, 53, 57], [43, 50, 53], [48, 52, 55]];
  bars.forEach((c, i) => ev.push(...chord(i * 4 * B, c, 4 * B - 0.05, 0.6)));
  return play(P(), beat * B + 1.5, ev);
}

// One held C4, the melody's stops drawn one at a time: the ground tone, then its octave, twelfth,
// fifteenth … up to the eighth harmonic, a new one each second.
function drawbars() {
  const levels = [8, 0, 0, 0, 0, 0, 0, 0], full = [8, 8, 7, 7, 6, 6, 5, 5], ev = note(0, 60, 8.6);
  for (let i = 1; i < 8; i++) { levels[i] = full[i]; ev.push([i, 'params', P({ ...stops('m', levels), tooth: 0 })]); }
  return play(P({ ...stops('m', levels.map((v, i) => (i ? 0 : v))), tooth: 0 }), 9.5, ev);
}

// A dominant seventh tempered, then in Pierce's intonation: the E a just 5:4 and the B♭ a 7:4 off
// the C's own shaft, so the beating stops.
function pierce() {
  const ev = chord(0.05, [60, 64, 67, 70], 3, 0.8);
  return cat(play(P(), 3.8, ev), play(P({ intonation: 'pierce' }), 3.8, ev));
}

// Robbing: a held G4, then one note after another on the same buses; each takes its share of
// their current and the G grows quieter, as Cahill's listeners heard.
function robbing() {
  const ev = note(0, 67, 6.4, 0.9);
  [72, 76, 79, 84].forEach((k, i) => ev.push(...note(1.2 * (i + 1), k, 6.4 - 1.2 * (i + 1), 0.9)));
  return play(preset('Robbing'), 7.2, ev);
}

// The same phrase in the Hall, down Broadway to the Café Martin, 25 km down a city cable, and
// 160 km of open wire on poles.
function lines() {
  const phrase = [60, 64, 67, 72, 76, 72, 67, 64].flatMap((k, i) => note(0.05 + 0.25 * i, k, 0.24, 0.8));
  return cat(...[{}, { distance: 2 }, { distance: 25 }, { cable: 'open', distance: 160 }].map((o) => play(P(o), 2.4, phrase)));
}

// A big chord on a struggling motor: the shafts sag flat under the load and come back as the notes
// let go.
function motor() {
  const ev = note(0, 72, 7.5, 0.8);
  ev.push(...chord(1.5, [36, 43, 48, 52, 55, 60, 64, 67], 3.5, 1));
  return play(preset('A struggling motor', { ...stops('a', [8, 8, 7, 7, 6, 6, 5, 5]), ...stops('m', [8, 8, 7, 7, 6, 6, 5, 5]) }), 8.5, ev);
}

// A bass line with no ground tone on the buses: the receivers' magnets square the flux and make
// it, the phantom low note Hope-Jones heard (Weidenaar, p. 104).
const resultant = () => play(preset('Harmonics without'), 6.5, [36, 36, 43, 41, 40, 38, 35, 36].flatMap((k, i) => note(0.05 + 0.7 * i, k, 0.62, 0.9)));

// Short notes with a long L/R: every relay's closing leaves its winding's offset to die away, the
// thump the 1906 listeners complained of.
const thumps = () => play(preset('Heavy thumps'), 4.5, [36, 40, 43, 48, 43, 40, 36].flatMap((k, i) => note(0.05 + 0.55 * i, k, 0.22, 0.9)));

const demos = [
  ['01-a-tune-in-telharmonic-hall', tune],
  ['02-the-stops-drawn-one-by-one', drawbars],
  ['03-tempered-then-pierce-just', pierce],
  ['04-robbing-as-notes-are-added', robbing],
  ['05-hall-then-2km-25km-160km', lines],
  ['06-the-motor-sags-under-a-chord', motor],
  ['07-a-bass-with-no-ground-tone', resultant],
  ['08-the-relays-thumps', thumps],
];

const only = process.argv.slice(2);
for (const [name, fn] of demos) if (!only.length || only.some((p) => name.startsWith(p))) saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
