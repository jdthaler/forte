// Render celesta demos, each isolating one physical effect, to examples/celesta/*.wav
// Usage: node tools/render-celesta.mjs        (then node tools/encode-examples.mjs celesta)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../celesta/src/celesta-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const CelestaEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'celesta';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => ({ ...DEFAULTS, ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (p, seconds, events) => { const e = new CelestaEngine(FS); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

// 01: a little waltz in the celesta's own compass, the pedal changed with each bar: a bass note
// and a chord under a tune an octave and more above (C – Am – Dm7 – G7 – C)
function waltz() {
  const ev = [], beat = 0.36;
  const bars = [[60, [64, 67, 72]], [69, [72, 76, 81]], [62, [65, 69, 72]], [67, [71, 74, 77]], [60, [64, 67, 72]]];
  const tune = [[88, 91, 96], [93, 91, 88], [89, 93, 98], [95, 93, 91], [96]];
  bars.forEach(([bass, ch], i) => {
    const t = 0.15 + 3 * beat * i;
    ev.push([t - 0.01, 'sus', true], [t + 3 * beat - 0.04, 'sus', false]);
    ev.push([t, 'on', bass, 0.5], [t + 0.2, 'off', bass]);
    for (const b of [1, 2]) for (const k of ch) ev.push([t + b * beat, 'on', k, 0.32], [t + b * beat + 0.15, 'off', k]);
    tune[i].forEach((k, j) => ev.push([t + j * beat + 0.01, 'on', k, j === 0 ? 0.7 : 0.55], [t + j * beat + 0.25, 'off', k]));
  });
  const end = 0.15 + 3 * beat * 4;
  ev.push([end + 3 * beat - 0.04, 'sus', true], [end + 2.2, 'sus', false]);
  return play(P(), end + 2.6, ev);
}

const demos = [
  ['01-waltz-pedal-each-bar', waltz],
  // a phrase over the boxes, then the same phrase with the boxes taken away: the bars alone are faint
  ['02-with-boxes-then-without', () => {
    const ph = [[0, 'sus', true], ...notes(0.1, 0.3, [72, 76, 79, 84, 79, 76], 0.7, 0.25), [2.4, 'sus', false]];
    return cat(play(P(), 2.8, ph), play(P({ boxes: false }), 2.8, ph));
  }],
  // one C5 bar at the usual 12 mm above its box, then pressed to 2.5 mm: bar and box trade energy and beat
  ['03-box-close-bar-and-box-beat', () => {
    const ph = [[0, 'sus', true], [0.1, 'on', 72, 0.7], [0.3, 'off', 72], [2.6, 'sus', false]];
    return cat(play(P(), 3, ph), play(P({ gap: 2.5 }), 3, ph));
  }],
  // soft felt hammers, then the keyboard glockenspiel: hard hammers, thicker bars, no boxes
  ['04-soft-felt-then-keyboard-glockenspiel', () => {
    const ph = [[0, 'sus', true], ...notes(0.1, 0.28, [79, 84, 88, 91, 96, 91, 88], 0.7, 0.2), [2.5, 'sus', false]];
    return cat(play(P({ hardness: 60 }), 3, ph), play(preset('Keyboard glockenspiel'), 3, ph));
  }],
  // the dampers: short notes with every damper down, then the same with the pedal lifting them
  ['05-dampers-then-pedal', () => {
    const ph = notes(0.1, 0.22, [72, 74, 76, 77, 79, 81, 83, 84], 0.6, 0.12);
    return cat(play(P(), 2.4, ph), play(P(), 2.4, [[0, 'sus', true], ...ph, [2.2, 'sus', false]]));
  }],
  // struck at the centre (mode 2 silent), near the end (every mode speaks), and on mode 1's node (the fundamental drops out)
  ['06-centre-end-and-node-strikes', () => {
    const ph = [[0, 'sus', true], [0.1, 'on', 67, 0.75], [0.3, 'off', 67], [0.9, 'on', 74, 0.75], [1.1, 'off', 74], [1.7, 'sus', false]];
    return cat(play(P({ strike: 0.5, across: 0 }), 2, ph), play(P({ strike: 0.05, hardness: 500 }), 2, ph), play(P({ strike: 0.224, across: 0, hardness: 500 }), 2, ph));
  }],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
