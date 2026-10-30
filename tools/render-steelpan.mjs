// Render steel pan demos, each isolating one physical effect, to examples/steelpan/*.wav
// Usage: node tools/render-steelpan.mjs        (then node tools/encode-examples.mjs steelpan)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../steelpan/src/steelpan-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const SteelPanEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'steelpan';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => ({ ...DEFAULTS, ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (p, seconds, events) => { const e = new SteelPanEngine(FS); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

// 01: a calypso tune on the tenor over a strummed double-second part, notes left to ring
function calypso() {
  const ev = [], beat = 0.27;
  const tune = [[72, 1], [72, 0.5], [74, 0.5], [76, 1], [72, 1], [79, 1.5], [77, 0.5], [76, 1], [74, 1],
    [77, 1], [77, 0.5], [79, 0.5], [81, 1], [77, 1], [76, 1.5], [74, 0.5], [72, 2]];
  let t = 0.1;
  tune.forEach(([k, d], i) => { ev.push([t, 'on', k, i % 4 === 0 ? 0.8 : 0.62], [t + d * beat * 0.9, 'off', k]); t += d * beat; });
  const strum = [[60, 64, 67], [60, 64, 67], [59, 62, 67], [60, 64, 67], [60, 65, 69], [60, 65, 69], [59, 62, 67], [60, 64, 67]];
  strum.forEach((ch, i) => [0, 1.5, 2.5].forEach((off) => ch.forEach((k, j) => ev.push([0.1 + (4 * i + off) * beat + 0.01 * j, 'on', k, off ? 0.42 : 0.5], [0.1 + (4 * i + off + 0.8) * beat, 'off', k]))));
  [48, 48, 43, 48, 53, 53, 43, 48].forEach((k, i) => ev.push([0.1 + 4 * i * beat, 'on', k, 0.7], [0.1 + (4 * i + 3) * beat, 'off', k]));
  return play(P({ letRing: true }), 10, ev);
}

const demos = [
  ['01-calypso-tenor-and-double-second', calypso],
  // one note, struck softly, then harder and harder: the dome pumps the octave out of the fundamental
  ['02-soft-to-hard-strokes-the-octave-blooms', () => play(P({ letRing: true }), 6, [0.15, 0.35, 0.6, 1].flatMap((v, i) => [[0.1 + 1.4 * i, 'on', 64, v], [0.1 + 1.4 * i + 1.2, 'off', 64]]))],
  // the same hard phrase on flat notes, then on high domes
  ['03-flat-notes-then-high-domes', () => {
    const ph = notes(0.1, 0.45, [64, 67, 72, 71, 67], 0.95, 0.4);
    return cat(play(P({ rise: 0 }), 2.8, ph), play(P({ rise: 6 }), 2.8, ph));
  }],
  // tuned to octave and twelfth, then the note areas as the hammer left them (untuned)
  ['04-tuned-then-untuned-as-sunk', () => {
    const ph = notes(0.1, 0.4, [60, 64, 67, 72, 67, 64, 60], 0.7, 0.38);
    return cat(play(P(), 3.2, ph), play(preset('Untuned'), 3.2, ph));
  }],
  // C4 struck and its hand lifted at once, ringing for three seconds: fourths and fifths (G4 and
  // G5 take up its twelfth, C5 its octave), then a chromatic layout, where only the octave rings on
  ['05-neighbours-ring-along-fifths-then-chromatic', () => {
    const ph = [[0.1, 'on', 60, 0.9], [0.2, 'off', 60]];
    return cat(play(P({ letRing: true, coupling: 0.006 }), 3, ph), play(P({ letRing: true, coupling: 0.006, layout: 'chromatic' }), 3, ph));
  }],
  // a rolled chord, the roll swelling with the mod wheel
  ['06-rolled-chord', () => play(preset('Rolled', { roll: 0.3 }), 5, [
    ...[67, 71, 74].flatMap((k) => [[0.1, 'on', k, 0.6], [3.6, 'off', k]]),
    [1.3, 'params', preset('Rolled', { roll: 0.55 })], [2.4, 'params', preset('Rolled', { roll: 0.8 })]])],
  // a six-bass line with the drums cut to a tenor's skirt, then with their whole 86 cm
  ['07-bass-short-skirt-then-full-drum', () => {
    const ph = notes(0.1, 0.5, [36, 40, 43, 41, 36], 0.85, 0.48);
    return cat(play(preset('Six bass', { skirt: 0.25 }), 3, ph), play(preset('Six bass'), 3, ph));
  }],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
