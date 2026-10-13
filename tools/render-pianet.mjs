// Render sticky-pad piano demos, each isolating one physical effect, to examples/pianet/*.wav
// Usage: node tools/render-pianet.mjs        (then node tools/encode-examples.mjs pianet)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { PianetEngine } from '../pianet/src/pianet-engine.js';
import { DEFAULTS, PRESETS } from '../pianet/src/pianet-params.js';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const FS = 48000, SLUG = 'pianet';
const preset = (i, o = {}) => ({ ...DEFAULTS, ...PRESETS[i].p, ...o });
const play = (P, seconds, events) => { const e = new PianetEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const chord = (t, keys, vel, len) => keys.flatMap((k) => [[t, 'on', k, vel], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

// An original moody phrase in A minor, 120 bpm: a held bass, staccato off-beat
// chords (the pads choke them: the Pianet "plink") and a melody on top.
const B = 60 / 120;
function phrase(t0 = 0.15, vel = 1) {
  const ev = [];
  const v = (x) => Math.min(1, x * vel);
  const bars = [
    { bass: [45, 52], ch: [57, 60, 64] }, // Am
    { bass: [41, 48], ch: [57, 60, 65] }, // F
    { bass: [38, 50], ch: [57, 62, 65] }, // Dm
    { bass: [40, 47], ch: [56, 59, 64] }, // E
  ];
  bars.forEach((b, i) => {
    const t = t0 + i * 4 * B;
    ev.push(...chord(t, b.bass, v(0.62), 3.6 * B));
    for (const off of [0.5, 1.5, 2.5, 3.5]) ev.push(...chord(t + off * B, b.ch, v(off === 1.5 ? 0.55 : 0.45), 0.16 * B));
  });
  const mel = [ // [beat, key, length in beats, velocity]
    [0, 76, 1, 0.8], [1, 72, 0.5, 0.6], [1.5, 74, 0.5, 0.65], [2, 76, 1, 0.75], [3, 69, 1, 0.6],
    [4, 77, 1.5, 0.85], [5.5, 76, 0.5, 0.6], [6, 72, 2, 0.7],
    [8, 74, 0.5, 0.7], [8.5, 76, 0.5, 0.7], [9, 77, 1, 0.8], [10, 81, 1, 0.95], [11, 77, 1, 0.7],
    [12, 76, 1, 0.85], [13, 74, 0.5, 0.65], [13.5, 72, 0.5, 0.6], [14, 71, 1.4, 0.75], [15.5, 68, 0.4, 0.55],
  ];
  for (const [b, k, len, vv] of mel) ev.push([t0 + b * B, 'on', k, v(vv)], [t0 + (b + len) * B - 0.03, 'off', k]);
  ev.push(...chord(t0 + 16 * B, [45, 57, 64, 69, 72], v(0.7), 1.2));
  return ev;
}
const PHRASE_LEN = 0.15 + 16 * B + 1.7;
const short = (t0, bars = 2) => [ // the phrase's first bars, for A/B comparisons
  ...chord(t0, [45], 0.6, 3.6 * B), ...[0.5, 1.5, 2.5, 3.5].flatMap((o) => chord(t0 + o * B, [57, 60, 64], 0.5, 0.16 * B)),
  [t0, 'on', 76, 0.8], [t0 + B - 0.03, 'off', 76], [t0 + 2 * B, 'on', 72, 0.7], [t0 + 4 * B - 0.03, 'off', 72],
  ...(bars < 2 ? [] : [
    ...chord(t0 + 4 * B, [41], 0.6, 3.6 * B), ...[4.5, 5.5, 6.5, 7.5].flatMap((o) => chord(t0 + o * B, [57, 60, 65], 0.5, 0.16 * B)),
    [t0 + 4 * B, 'on', 77, 0.85], [t0 + 6 * B - 0.03, 'off', 77], [t0 + 6 * B, 'on', 76, 0.7], [t0 + 8 * B, 'off', 76]]),
];
const SHORT_LEN = (bars = 2) => 4 * bars * B + 0.7;

const demos = [
  ['01-moody-minor-phrase', () => play(preset(0), PHRASE_LEN, phrase())],
  ['02-key-speed-3-to-40-cm-per-s-rate-dependent-tack', () => play(preset(0), 6.2,
    [0.05, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1].flatMap((vel, i) => [...chord(0.1 + 0.75 * i, [57], vel, 0.5), ...chord(0.1 + 0.75 * i, [64], vel, 0.5)]))],
  ['03-fresh-pads-then-aged-then-nearly-dead', () => cat(...[0.25, 0.04, 0.012].map((tack) => play(preset(0, { tack }), SHORT_LEN(1), short(0.1, 1))))],
  ['04-magnetic-pickup-T-then-electrostatic-N', () => cat(play(preset(0), SHORT_LEN(), short(0.1)), play(preset(1), SHORT_LEN(), short(0.1)))],
  ['05-staccato-chokes-then-the-same-with-sustain', () => {
    const stabs = (t0) => [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => chord(t0 + i * 0.3, i < 4 ? [48, 55, 60, 63] : [46, 53, 58, 62], 0.75, 0.08));
    return cat(play(preset(0), 2.9, stabs(0.1)), play(preset(0), 3.6, [[0, 'sus', true], ...stabs(0.1), [3.0, 'sus', false]]));
  }],
  ['06-plate-edge-level-then-raised-odd-then-even-harmonics', () => cat(
    play(preset(6), 3.2, notes(0.1, 0.75, [45, 52, 57, 64], 0.75, 0.65)), play(preset(1), 3.2, notes(0.1, 0.75, [45, 52, 57, 64], 0.75, 0.65)))],
  ['07-light-then-heavy-solder-tips', () => cat(
    play(preset(0, { tipMass: 0.25 }), 3.4, notes(0.1, 0.8, [48, 55, 60, 67], 0.8, 0.7)), play(preset(0, { tipMass: 3 }), 3.4, notes(0.1, 0.8, [48, 55, 60, 67], 0.8, 0.7)))],
  ['08-phrase-through-a-valve-combo', () => play(preset(9), PHRASE_LEN, phrase())],
];

const only = process.argv.slice(2);
for (const [name, fn] of demos) if (!only.length || only.some((o) => name.startsWith(o))) saveExample(SLUG, name, await withRoom(fn(), 0.2, FS), FS);
