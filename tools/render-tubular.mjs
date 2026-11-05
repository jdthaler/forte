// Render tubular bells demos, each isolating one physical effect, to examples/tubular/*.wav
// Usage: node tools/render-tubular.mjs        (then node tools/encode-examples.mjs tubular)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../tubular/src/tubular-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const TubularEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'tubular';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => ({ ...DEFAULTS, ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (p, seconds, events) => { const e = new TubularEngine(FS); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const chord = (t, keys, vel, len, spread = 0.015) => keys.flatMap((k, i) => [[t + i * spread, 'on', k, vel], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

// 01: the Westminster quarters, as a clock tower's hour chimes them (changes 2–5, in F), the pedal
// down so every tube rings on, then the hour struck three times on the lowest tube
function westminster() {
  const [A, G, F, C] = [69, 67, 65, 60];
  const changes = [[F, A, G, C], [F, G, A, F], [A, F, G, C], [C, G, A, F]];
  const ev = [[0, 'sus', true]];
  let t = 0.15;
  for (const ch of changes) {
    ch.forEach((k, i) => ev.push([t + 0.62 * i, 'on', k, i === 3 ? 0.62 : 0.55], [t + 0.62 * i + 0.2, 'off', k]));
    t += 0.62 * 3 + 1.55;
  }
  t += 0.6;
  for (let i = 0; i < 3; i++) ev.push([t + 2.4 * i, 'on', C, 0.75], [t + 2.4 * i + 0.2, 'off', C]);
  ev.push([t + 7.6, 'sus', false]);
  return play(P(), t + 8.2, ev);
}

const demos = [
  ['01-westminster-quarters-and-the-hour', westminster],
  // a hard mallet on one tube: the clang of the high modes is gone in a second or two, and the
  // strike note (modes 4–6) hums on
  ['02-the-clang-fades-the-strike-note-hums', () => play(P({ hardness: 9000, mass: 160 }), 9,
    [[0, 'sus', true], [0.1, 'on', 74, 0.8], [0.3, 'off', 74], [8.6, 'sus', false]])],
  // the same tube struck with rawhide, then a leather-wrapped mallet, then brass
  ['03-rawhide-leather-then-brass-mallets', () => {
    const ph = [[0, 'sus', true], [0.1, 'on', 72, 0.8], [0.3, 'off', 72], [3.0, 'sus', false]];
    return cat(play(P(), 3.4, ph), play(P({ hardness: 150, mass: 300 }), 3.4, ph), play(P({ hardness: 30000, mass: 150 }), 3.4, ph));
  }],
  // chords with the damper bar on every tube whose key is up, then the pedal down: they overlap
  ['04-damper-bar-then-pedal-down', () => {
    const ev = [...chord(0.1, [60, 64, 67], 0.6, 1.0), ...chord(1.6, [62, 65, 69], 0.6, 1.0), ...chord(3.1, [60, 64, 67, 72], 0.6, 1.2)];
    ev.push([4.9, 'sus', true], ...chord(5.0, [60, 64, 67], 0.6, 0.3), ...chord(6.5, [62, 65, 69], 0.6, 0.3), ...chord(8.0, [60, 64, 67, 72], 0.6, 0.3), [11.6, 'sus', false]);
    return play(P(), 12.2, ev);
  }],
  // the top tube open, then with a 400 g cap: modes 5 and 6 rise against mode 4
  ['05-open-tube-then-heavy-cap', () => {
    const ph = [[0, 'sus', true], ...notes(0.1, 0.9, [77, 72, 77], 0.7, 0.2), [3.6, 'sus', false]];
    return cat(play(preset('No cap'), 4, ph), play(preset('Heavy cap'), 4, ph));
  }],
  // a phrase on brass tubes, then on aluminium ones (longer for the same notes, and lighter)
  ['06-brass-then-aluminium-tubes', () => {
    const ph = [[0, 'sus', true], ...notes(0.1, 0.55, [65, 69, 72, 77, 72], 0.6, 0.2), [3.9, 'sus', false]];
    return cat(play(P(), 4.3, ph), play(preset('Aluminium'), 4.3, ph));
  }],
  // struck on the cap, then a third of the way down the tube, where some modes have their nodes
  ['07-on-the-cap-then-a-third-down', () => {
    const ph = [[0, 'sus', true], ...notes(0.1, 1.1, [64, 67], 0.7, 0.2), [3.1, 'sus', false]];
    return cat(play(P(), 3.5, ph), play(preset('Struck a third'), 3.5, ph));
  }],
  // the player's ears, then twelve metres off: the low tubes left and the high ones right up close
  ['08-close-up-then-far-off', () => {
    const ph = [[0, 'sus', true], ...notes(0.1, 0.4, [60, 64, 67, 72, 76], 0.6, 0.2), [3.6, 'sus', false]];
    return cat(play(preset('Close up'), 4, ph), play(preset('Far off'), 4, ph));
  }],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
