// Render marimba and xylophone demos, each isolating one physical effect, to examples/marimba/*.wav
// Usage: node tools/render-marimba.mjs        (then node tools/encode-examples.mjs marimba)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../marimba/src/marimba-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const MarimbaEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'marimba';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => ({ ...DEFAULTS, ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (p, seconds, events) => { const e = new MarimbaEngine(FS); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const chord = (t, keys, vel, len, spread = 0.01) => keys.flatMap((k, i) => [[t + i * spread, 'on', k, vel], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

// 01: a chorale, each chord held and rolled, a few plain strokes between (F – Dm – B♭ – C – F)
function chorale() {
  const ev = [];
  const chords = [[53, 60, 65, 69], [50, 57, 62, 65], [46, 58, 62, 65], [48, 55, 64, 67], [41, 57, 60, 65]];
  chords.forEach((ch, i) => {
    const t = 0.1 + 2.2 * i, len = i === 4 ? 3.2 : 1.9;
    ev.push(...chord(t, ch, 0.55, len, 0.02));
    if (i < 4) ev.push(...notes(t + 1.95, 0.12, [ch[3] + 2], 0.5, 0.1));
  });
  return play(preset('Marimba rolled'), 12.6, ev);
}

const demos = [
  ['01-rolled-chorale', chorale],
  // a run on xylophone bars (tuned to a twelfth) with hard mallets, then the same mallets on marimba bars (two octaves)
  ['02-xylophone-then-marimba-bars', () => {
    const ph = notes(0.1, 0.13, [72, 74, 76, 77, 79, 81, 83, 84, 88, 91, 96], 0.7, 0.12);
    return cat(play(preset('Xylophone: hard'), 2.6, ph), play(preset('Xylophone: hard', { kind: 'marimba' }), 2.6, ph));
  }],
  // a low phrase with its tubes, then the bars alone: the fundamental drops by over 10 dB and rings longer
  ['03-with-resonators-then-without', () => {
    const ph = notes(0.1, 0.45, [36, 43, 48, 52, 55], 0.7, 0.4);
    return cat(play(P(), 3.6, ph), play(P({ tubes: false }), 3.6, ph));
  }],
  // a xylophone's tubes centred under the bars (mode 2 can't drive them), then off centre: the twelfth sings
  ['04-xylophone-tubes-centred-then-off-centre', () => {
    const ph = notes(0.1, 0.5, [69, 76, 81], 0.7, 0.4);
    return cat(play(preset('Xylophone, tubes off', { offset: 0 }), 2.4, ph), play(preset('Xylophone, tubes off'), 2.4, ph));
  }],
  // soft yarn, then hard plastic mallets, on the same arpeggio
  ['05-soft-yarn-then-hard-plastic-mallets', () => {
    const ph = notes(0.1, 0.28, [60, 64, 67, 72, 76], 0.75, 0.25);
    return cat(play(preset('Soft yarn'), 2.6, ph), play(P({ hardness: 12000, mass: 12 }), 2.6, ph));
  }],
  // tuned 1 : 4 : 10 bars, then plain bars (1 : 2.76 : 5.40), struck near the end so the overtones speak
  ['06-tuned-bars-then-plain-bars', () => {
    const ph = notes(0.1, 0.4, [53, 57, 60, 65], 0.7, 0.35);
    return cat(play(P({ strike: 0.1, hardness: 1500 }), 2.6, ph), play(P({ strike: 0.1, hardness: 1500, depth: 0 }), 2.6, ph));
  }],
  // one low bar with its tube at 25 mm, then pressed to 6 mm: bar and tube trade energy and beat
  ['07-tube-close-bar-and-tube-beat', () => {
    const ph = notes(0.1, 1, [41], 0.75, 0.3);
    return cat(play(P(), 3.2, ph), play(P({ gap: 6 }), 3.2, ph));
  }],
  // one held note, the roll swelling with the mod wheel from slow to fast
  ['08-roll-swells', () => play(P({ roll: 0.2, rollRate: 8 }), 5, [[0.1, 'on', 64, 0.5],
    [1.3, 'params', P({ roll: 0.45, rollRate: 12 })], [2.5, 'params', P({ roll: 0.75, rollRate: 16 })], [3.8, 'off', 64]])],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
