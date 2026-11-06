// Render Musical Saw demos, each isolating one physical effect, to examples/saw/*.wav
// Usage: node tools/render-saw.mjs [prefix…]   (then node tools/encode-examples.mjs saw)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../saw/src/saw-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const SawEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'saw';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => P({ ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (params, seconds, events) => { const e = new SawEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const note = (t, key, dur, vel = 0.7) => [[t, 'on', key, vel], [t + dur, 'off', key]];
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

// A slow tune on one saw: each key goes down just before the last lifts, so the bend slides the
// note there, the saw's swoop; the knee's vibrato blooms on the long notes.
function tune() {
  const p = preset('One saw', { glide: 0.18 });
  const B = 0.5, line = [[64, 2], [69, 2], [72, 1], [71, 1], [69, 2], [76, 3], [74, 1], [72, 1], [71, 1], [69, 4]];
  const ev = [];
  let beat = 0;
  for (const [k, beats] of line) {
    ev.push([beat * B, 'on', k, 0.65]);
    beat += beats;
    ev.push([beat * B + 0.06, 'off', k]);
  }
  return play(p, beat * B + 2.5, ev);
}

// Two settings of one note or phrase, the second after a pause
const pair = (a, b, events, seconds) => cat(play(a, seconds, events), play(b, seconds, events));

const demos = [
  ['01-a-slow-tune-sliding-on-one-saw', tune],
  ['02-a-saw-for-every-key-bowed-chords', () => play(P(), 9, [
    ...note(0.1, 57, 2.6, 0.6), ...note(0.4, 64, 2.3, 0.6), ...note(0.7, 69, 2.0, 0.6),
    ...note(3.4, 60, 2.6, 0.6), ...note(3.7, 67, 2.3, 0.6), ...note(4.0, 72, 2.0, 0.6)])],
  ['03-struck-with-a-felt-mallet', () => play(preset('Struck'), 8, [
    ...[60, 64, 67, 72, 76].flatMap((k, i) => note(0.1 + i * 0.6, k, 3.2 - i * 0.6, 0.75)), ...note(3.8, 69, 3.5, 0.8)])],
  ['04-bent-into-an-s-then-a-j', () => pair(preset('Struck'), preset('Struck', { shape: 'J' }), [...note(0.1, 67, 2.6, 0.8)], 3.2)],
  ['05-a-tight-bend-then-a-loose-one', () => pair(preset('Struck'), preset('Struck', { bend: 2 }), [...note(0.1, 67, 2.6, 0.8)], 3.2)],
  ['06-on-the-sweet-spot-then-5-cm-off', () => cat(
    play(P(), 3.2, note(0.1, 69, 2.6, 0.6)), play(P({ place: 5 }), 3.2, note(0.1, 69, 2.6, 0.6)),
    play(P({ place: 5 }), 3.5, note(0.1, 84, 2.6, 0.6)))],
  ['07-a-still-knee-then-a-shaking-one', () => pair(P({ vibrato: 0 }), P({ vibrato: 30, vibRate: 5 }), note(0.1, 67, 3.2, 0.6), 4)],
  ['08-pressing-harder-until-the-bow-bites', () => cat(
    play(P({ force: 1.7 }), 3, note(0.1, 64, 2.4, 0.5)), play(P(), 3, note(0.1, 64, 2.4, 0.5)),
    play(preset('Pressing too hard'), 3, note(0.1, 64, 2.4, 0.8)))],
];

const only = process.argv.slice(2);
for (const [name, fn] of demos) {
  if (only.length && !only.some((o) => name.startsWith(o))) continue;
  saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
  console.log(name);
}
