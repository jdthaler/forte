// Render Singing Dunes demos, each isolating one physical effect, to examples/dunes/*.wav
// Usage: node tools/render-dunes.mjs [prefix…]   (then node tools/encode-examples.mjs dunes)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../dunes/src/dunes-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const DunesEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'dunes';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => P({ ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (params, seconds, events) => { const e = new DunesEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const note = (t, key, dur, vel = 0.85) => [[t, 'on', key, vel], [t + dur, 'off', key]];
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// params changed over time: [t, overrides] → events, each on top of base
const changes = (base, list) => list.map(([t, o]) => [t, 'params', P({ ...base, ...o })]);

// A face letting go in waves: overlapping avalanches on the notes real dunes sing, C2 to A♭2.
function chorus() {
  const ev = [...note(0.05, 43, 5.5, 0.85), ...note(1.6, 36, 6, 0.8), ...note(3.4, 40, 5, 0.9), ...note(6.2, 44, 4.5, 0.85), ...note(7.4, 38, 4, 0.8)];
  return play(P(), 13.5, ev);
}

// One key at three speeds: a slide below the threshold only rumbles, one just past it finds its
// step slowly, and a fast one sings at once.
const threshold = () => cat(...[0.35, 0.53, 0.9].map((v) => play(P(), 4.6, note(0.05, 45, 3.6, v))));

// The same sand down the keys: coarse to fine, each grain size its note (Sand Mountain's 340 µm
// near C♯2, Tarfaya's 160 µm near G♯2).
const grains = () => play(P(), 12.5, [37, 39, 41, 43, 44, 46].flatMap((k, i) => note(0.05 + 1.9 * i, k, 1.8)));

// One held avalanche as the sand is sorted worse: very well (0.3 φ), moderately (0.6 φ), poorly (1.2 φ).
const sorting = () => play(P(), 13, [...note(0.05, 45, 12.2), ...changes({}, [[4.2, { sorting: 0.6 }], [8.4, { sorting: 1.2 }]])]);

// One held avalanche as the sand takes up water: dry, 0.15 %, 0.3 %.
const water = () => play(P(), 13, [...note(0.05, 43, 12.2), ...changes({}, [[4.2, { damp: 0.15 }], [8.4, { damp: 0.3 }]])]);

// A soft avalanche that only hisses, pushed (the mod wheel) until it sings, then let go.
function push() {
  const ev = note(0.05, 41, 8.5, 0.4);
  for (let i = 1; i <= 24; i++) ev.push([1.5 + i * 0.2, 'params', P({ push: Math.min(1, i / 16) })]);
  return play(P(), 10.5, ev);
}

// Long collisions, then the usual, then short: a hum, a boom, a buzz.
const collisions = () => cat(...[0.45, 0.25, 0.12].map((contact) => play(P({ contact }), 3.6, note(0.05, 40, 2.8))));

// The same three avalanches through the other theory: a layered dune's waveguide, then a leaky one.
const layer = () => cat(play(preset('A layered dune'), 6, [...note(0.05, 43, 2.4), ...note(2.8, 43, 2.4, 0.4)]), play(preset('A leaky layer'), 3.4, note(0.05, 43, 2.4)));

// Let go: the song holds as the sand slows, breaks up, and stops; then a long avalanche, slow to stop.
const stopping = () => cat(play(P(), 3.6, note(0.05, 42, 2)), play(preset('A long avalanche'), 6, note(0.05, 42, 2)));

const demos = [
  ['01-a-face-letting-go', chorus],
  ['02-below-at-and-past-the-threshold', threshold],
  ['03-coarse-to-fine-sand', grains],
  ['04-worse-and-worse-sorted', sorting],
  ['05-the-sand-gets-damp', water],
  ['06-pushing-more-sand-down', push],
  ['07-long-usual-and-short-collisions', collisions],
  ['08-the-layered-dune-then-a-leaky-one', layer],
  ['09-coming-to-rest', stopping],
];

const only = process.argv.slice(2);
for (const [name, fn] of demos) if (!only.length || only.some((p) => name.startsWith(p))) saveExample(SLUG, name, await withRoom(fn(), DEFAULTS.room, FS), FS);
