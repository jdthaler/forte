// Render tangent-clavier demos, each isolating one physical effect, to examples/clavier/*.wav
// Usage: node tools/render-clavier.mjs        (then node tools/encode-examples.mjs clavier)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../clavier/src/clavier-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const ClavierEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'clavier';
const preset = (name, o = {}) => ({ ...DEFAULTS, ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (P, seconds, events) => { const e = new ClavierEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// Scale a part to a given RMS (the player's volume knob between A/B takes).
const level = ([L, R], rms = 0.08) => { let s = 0; for (const v of L) s += v * v; const g = rms / Math.sqrt(s / L.length); return [L.map((v) => v * g), R.map((v) => v * g)]; };

// A step sequencer in sixteenths: [step, keys, length in steps, velocity]. Short notes
// (a quarter step) are ghost notes: the key is let go at once and the yarn chokes it.
function seq(t0, bpm, steps) {
  const st = 60 / bpm / 4, ev = [];
  for (const [i, keys, len, vel] of steps) for (const k of [].concat(keys)) ev.push([t0 + i * st, 'on', k, vel], [t0 + (i + len) * st - 0.004, 'off', k]);
  return ev;
}
const G = 0.25, ACC = 0.95, MID = 0.7, GH = 0.4;
// E minor, one bar: a left-hand line round E3 with ghost notes…
const LINE = [[0, 52, 1.5, ACC], [2, 52, G, GH], [3, 55, 1, MID], [4, 52, G, GH], [5, 57, 1, ACC], [7, 55, G, GH],
  [8, 52, 1, MID], [9, 50, G, GH], [10, 52, 1.5, ACC], [12, 55, G, GH], [13, 59, 1, MID], [14, 57, G, GH], [15, 55, 1, MID]];
// …and right-hand stabs on the off-beats
const STABS = [[6, [64, 67, 71], 0.6, MID], [14, [64, 67, 71], 0.6, MID]];
const STABS2 = [[6, [69, 72, 76], 0.6, MID], [11, [67, 71, 74], G, GH], [14, [66, 69, 74], 1.2, ACC]];
const shift = (steps, d) => steps.map(([i, ...r]) => [i + d, ...r]);
const BAR = 16;

const demos = [
  // 01: the riff, both pickups, medium + treble
  ['01-funky-riff-in-e-minor', () => play(DEFAULTS, 8.7, seq(0.05, 100, [
    ...LINE, ...shift(LINE, BAR), ...shift(STABS, BAR), ...shift(LINE, 2 * BAR), ...shift(STABS2, 2 * BAR),
    [3 * BAR, [40, 52], 6, ACC], [3 * BAR, [64, 67, 71], 6, MID],
  ]))],
  // 02: one bar through each pickup setting (levels matched)
  ['02-pickups-lower-upper-in-phase-out-of-phase', () => cat(...['lower', 'upper', 'sum', 'diff'].map((sel) =>
    level(play({ ...DEFAULTS, pickup: sel }, 2.45, seq(0.03, 110, LINE)))))],
  // 03: one bar through each tone tab alone (levels matched)
  ['03-tone-tabs-soft-medium-treble-brilliant', () => cat(...['soft', 'medium', 'treble', 'brilliant'].map((tab) =>
    level(play({ ...DEFAULTS, medium: false, treble: false, [tab]: true }, 2.45, seq(0.03, 110, LINE)))))],
  // 04: aftertouch: a held D4 pressed in a 5.5 Hz vibrato, then pushed slowly up and back
  ['04-aftertouch-vibrato-then-slow-press', () => {
    const ev = [[0.05, 'on', 62, 0.7], [6.3, 'off', 62]];
    for (let t = 0.8; t < 3.4; t += 0.01) ev.push([t, 'msg', { type: 'pressure', key: 62, value: 0.35 * Math.min(1, (t - 0.8) / 0.6) * (1 - Math.cos(2 * Math.PI * 5.5 * (t - 0.8))) }]);
    for (let t = 3.6; t < 6.0; t += 0.01) ev.push([t, 'msg', { type: 'pressure', key: 62, value: Math.sin((Math.PI * (t - 3.6)) / 2.4) }]);
    return play(DEFAULTS, 6.8, ev);
  }],
  // 05: the riff open, then with the felt mute bar on, then the mute pedal on alternate beats
  ['05-mute-bar-off-on-then-pedalled', () => play(DEFAULTS, 7.8, [
    ...seq(0.05, 100, [...LINE, ...shift(LINE, BAR), ...shift(LINE, 2 * BAR)]),
    [2.45, 'sus', true], [4.85, 'sus', false], [5.45, 'sus', true], [6.05, 'sus', false], [6.65, 'sus', true], [7.25, 'sus', false],
  ])],
  // 06: staccato bass with the yarn, then without: each release rings on three semitones down
  ['06-release-thunk-with-yarn-then-without', () => {
    const notes = (t0) => [40, 43, 45, 47, 40].flatMap((k, i) => [[t0 + 0.55 * i, 'on', k, 0.8], [t0 + 0.55 * i + 0.22, 'off', k]]);
    return cat(play(DEFAULTS, 3.0, notes(0.05)), play({ ...DEFAULTS, yarn: 25 }, 3.4, notes(0.05)));
  }],
  // 07: A3 from pianissimo to fortissimo: the tangent's carry time sets the brightness
  ['07-velocity-pp-to-ff-brightness', () => play(DEFAULTS, 5.2, [0.08, 0.2, 0.35, 0.55, 0.75, 1].flatMap((v, i) => [[0.05 + 0.85 * i, 'on', 57, v], [0.05 + 0.85 * i + 0.6, 'off', 57]]))],
  // 08: F1 at full velocity with tension modulation, then without: the pitch glides down as it decays
  ['08-bass-ff-tension-glide-then-none', () => cat(
    play({ ...DEFAULTS, pickup: 'lower' }, 2.8, [[0.05, 'on', 29, 1], [2.5, 'off', 29], [0.05, 'on', 41, 1], [2.5, 'off', 41]]),
    play({ ...DEFAULTS, pickup: 'lower', kc: false }, 2.8, [[0.05, 'on', 29, 1], [2.5, 'off', 29], [0.05, 'on', 41, 1], [2.5, 'off', 41]]))],
];

const only = process.argv.slice(2);
for (const [name, fn] of demos) if (!only.length || only.some((o) => name.startsWith(o))) saveExample(SLUG, name, await withRoom(fn(), 0.2, FS), FS);
