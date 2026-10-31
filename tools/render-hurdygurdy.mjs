// Render Hurdy-Gurdy demos, each isolating one physical effect, to examples/hurdygurdy/*.wav
// Usage: node tools/render-hurdygurdy.mjs [prefix…]   (then node tools/encode-examples.mjs hurdygurdy)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../hurdygurdy/src/hurdygurdy-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const HurdyGurdyEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'hurdygurdy';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => P({ ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (params, seconds, events) => { const e = new HurdyGurdyEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const G4 = 67, A4 = 69, B4 = 71, C5 = 72, D5 = 74, E5 = 76, F5 = 77, Fs5 = 78, G5 = 79, A5 = 81;

// A tune as a player fingers it: each key goes down a moment before the last lets go (the
// tangents pass the note on), the crank turning throughout. line: [key, beats] (0: no key, the
// open G4). Returns the events and the length in seconds.
function tune(line, B, t0 = 0.4, vel = 0.5) {
  const ev = [];
  let t = t0, last = null;
  for (const [k, beats] of line) {
    if (k) ev.push([t - 0.01, 'on', k, vel]);
    if (last) ev.push([t + 0.01, 'off', last]);
    last = k || null;
    t += beats * B;
  }
  if (last) ev.push([t, 'off', last]);
  return { ev, end: t };
}
// The coup de poignet on chosen beats: the wrist jerks the crank (as Space or the pedal does).
const coups = (times, len = 0.07) => times.flatMap((t) => [[t, 'sus', true], [t + len, 'sus', false]]);

// A bourrée in G, two to the bar: the drones under it, a coup on every beat for the buzz.
function bourree() {
  const B = 0.21; // an eighth
  const A = [[D5, 2], [B4, 1], [G4, 1], [A4, 1], [B4, 1], [C5, 1], [A4, 1], [B4, 2], [G4, 1], [B4, 1], [D5, 1], [C5, 1], [B4, 1], [A4, 1],
    [D5, 2], [B4, 1], [G4, 1], [A4, 1], [B4, 1], [C5, 1], [E5, 1], [D5, 1], [C5, 1], [B4, 1], [A4, 1], [G4, 4]];
  const Bp = [[G5, 2], [Fs5, 1], [E5, 1], [D5, 1], [E5, 1], [Fs5, 1], [D5, 1], [G5, 2], [D5, 1], [B4, 1], [C5, 1], [B4, 1], [A4, 1], [D5, 1],
    [G5, 2], [Fs5, 1], [E5, 1], [D5, 1], [C5, 1], [B4, 1], [A4, 1], [B4, 1], [G4, 1], [A4, 1], [B4, 1], [G4, 4]];
  const { ev, end } = tune([...A, ...Bp], B, 0.6);
  const beats = [];
  for (let t = 0.6; t < end - 0.1; t += 2 * B) beats.push(t - 0.02);
  return play(P({ keep: true }), end + 1.4, [...ev, ...coups(beats), [end + 0.3, 'params', P()]]);
}

// The wheel alone: the drones (gros bourdon, mouche, trompette) as the hand spins it up, then
// the chanterelles open, then a phrase on top.
function drones() {
  const { ev, end } = tune([[0, 4], [B4, 2], [C5, 1], [D5, 3], [C5, 1], [B4, 1], [A4, 2], [G4, 4]], 0.3, 4.2);
  return play(P({ chanterelles: false, keep: true, tirant: 8 }), end + 1.6,
    [[2.2, 'params', P({ keep: true, tirant: 8 })], ...ev, [end + 0.2, 'params', P({ tirant: 8 })]]);
}

// Une traînée: the crank speeded up from 0.8 to 2.4 turns a second on one held D5 and back.
// The chien lifts once the wheel's drag beats the tirant, a buzz that grows and fades with speed.
function trainee() {
  const ev = [[0, 'on', D5, 0.5], [9, 'off', D5]];
  for (let t = 0; t <= 8.5; t += 0.05) {
    const x = Math.min(1, Math.max(0, t < 4.5 ? (t - 1) / 3.2 : (7.8 - t) / 2.6));
    ev.push([t, 'params', P({ crank: 0.8 * 3 ** x })]);
  }
  return play(P({ crank: 0.8 }), 10, ev);
}

// The rhythm of the hand: one held G5, the crank at 1.2 turns a second, with one, two, three,
// then four coups a turn.
function rhythms() {
  const ev = [[0, 'on', G5, 0.5], [13.6, 'off', G5]];
  ['one', 'two', 'three', 'four'].forEach((c, i) => ev.push([0.2 + 3.4 * i, 'params', P({ coups: c })]));
  return play(P({ coups: 'one' }), 14.6, ev);
}

// Sec, then gras: the same phrase with the tirant tight (only hard coups lift the chien: a dry
// crack) and then loose (the slightest surge buzzes, fat and long).
function secGras() {
  const line = [[G5, 2], [Fs5, 1], [E5, 1], [D5, 2], [B4, 2], [C5, 1], [D5, 1], [E5, 1], [C5, 1], [D5, 4]];
  const phrase = (p) => { const { ev, end } = tune(line, 0.24, 0.3); return play(p, end + 1.2, ev); };
  return cat(phrase(preset('Sec')), phrase(preset('Gras')));
}

// The tangents to the top: a scale up the two octaves from the open G4 to G6, and down again.
function scale() {
  const up = [G4, A4, B4, C5, D5, E5, Fs5, G5, A5, 83, 84, 86, 88, 90, 91];
  const { ev, end } = tune([...up, ...up.slice(0, -1).reverse()].map((k) => [k, 1]), 0.22, 0.4);
  return play(P({ trompette: false }), end + 1.4, ev);
}

// Drones in C: the trompette down to C4, the petit bourdon on, a tune in C with the buzz on
// accents struck hard.
function inC() {
  const line = [[C5, 2], [E5, 1], [G5, 1], [F5, 2], [E5, 1], [D5, 1], [E5, 2], [C5, 2], [D5, 2], [G4, 2],
    [C5, 2], [E5, 1], [G5, 1], [A5, 2], [G5, 1], [F5, 1], [E5, 2], [D5, 2], [C5, 4]];
  const B = 0.24, { ev, end } = tune(line, B, 0.4);
  // the first note of each bar struck hard (a coup with it), the rest softly
  for (const e of ev) if (e[1] === 'on') e[3] = Math.round((e[0] + 0.01 - 0.4) / B) % 4 === 0 ? 0.95 : 0.45;
  return play(preset('Drones in C', { keep: true }), end + 1.4, [...ev, [end + 0.2, 'params', preset('Drones in C')]]);
}

const demos = [
  ['01-a-bourree-with-a-coup-on-each-beat', bourree],
  ['02-the-drones-then-the-chanterelles', drones],
  ['03-une-trainee-faster-until-it-buzzes', trainee],
  ['04-one-two-three-four-coups-a-turn', rhythms],
  ['05-sec-then-gras', secGras],
  ['06-the-tangents-up-two-octaves', scale],
  ['07-drones-in-c-accents-struck-hard', inC],
];

const only = process.argv.slice(2);
for (const [name, fn] of demos) if (!only.length || only.some((p) => name.startsWith(p))) saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
