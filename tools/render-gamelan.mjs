// Render gamelan demos, each isolating one physical effect, to examples/gamelan/*.wav
// Usage: node tools/render-gamelan.mjs        (then node tools/encode-examples.mjs gamelan)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../gamelan/src/gamelan-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const GamelanEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'gamelan';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => ({ ...DEFAULTS, ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (p, seconds, events) => { const e = new GamelanEngine(FS); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const mix = (...parts) => [0, 1].map((c) => { const n = Math.max(...parts.map((p) => p[c].length)), x = new Float64Array(n); for (const p of parts) p[c].forEach((v, i) => { x[i] += v; }); return x; });

// 01: a gangsa pair's melody in pélog, its notes doubled an octave below on a slower beat, and a gong to close
function melody() {
  const beat = 0.3, tune = [76, 74, 72, 74, 76, 79, 76, 74, 72, 71, 72, 74, 76, 74, 72, 67, 69, 72, 74, 72];
  const hi = tune.flatMap((k, i) => [[0.1 + i * beat, 'on', k, i % 4 === 0 ? 0.75 : 0.6]]);
  const lo = tune.filter((_, i) => i % 2 === 0).flatMap((k, i) => [[0.1 + 2 * i * beat, 'on', k - 12, 0.65]]);
  const end = 0.1 + tune.length * beat;
  return mix(play(P(), end + 3.5, hi), play(P(), end + 3.5, lo), play(preset('Gong ageng'), end + 3.5, [[end, 'on', 33, 0.9]]));
}

const demos = [
  ['01-a-gangsa-pair-in-pelog', melody],
  // the same A4, one bar, then the pair 6 Hz apart
  ['02-one-bar-then-the-pair', () => cat(play(P({ ombak: 0, damping: 'ring' }), 3, [[0.1, 'on', 69, 0.8]]), play(P({ ombak: 6, damping: 'ring' }), 3.5, [[0.1, 'on', 69, 0.8]]))],
  // A2, A4, A6 at 6 Hz: the pulse keeps its pace
  ['03-the-same-beat-low-to-high', () => cat(...[45, 69, 93].map((k) => play(P({ ombak: 6, damping: 'ring' }), 2.4, [[0.1, 'on', k, 0.8]])))],
  // a phrase stopped by the damping hand, then left to ring
  ['04-the-damping-hand-then-ringing', () => {
    const ph = notes(0.1, 0.32, [72, 74, 76, 79, 76, 74, 72, 74], 0.7, 0.3);
    return cat(play(P(), 3.4, ph), play(P({ damping: 'ring' }), 4, ph));
  }],
  // a saron's E4 struck at the centre, then near the end and off its axis
  ['05-saron-centre-then-off-axis', () => cat(play(preset('Javanese saron', { along: 0, across: 0, damping: 'ring' }), 2.5, [[0.1, 'on', 64, 0.9]]), play(preset('Javanese saron', { along: 0.6, across: 0.8, damping: 'ring' }), 3, [[0.1, 'on', 64, 0.9]]))],
  // a gong ageng with its curved face (the harmonic beats with the second round mode), then flat
  ['06-gong-ageng-throbs-then-a-flat-one', () => cat(play(preset('Gong ageng'), 6, [[0.1, 'on', 33, 1]]), play(preset('Gong ageng', { curvature: 0 }), 6, [[0.1, 'on', 33, 1]]))],
  // the whole gamelan: the melody in octaves on demung and saron, kempul and gong below
  ['07-the-whole-gamelan', () => {
    const beat = 0.42, tune = [69, 67, 64, 62, 64, 67, 69, 72];
    const ev = [...tune.flatMap((k, i) => [[0.1 + i * beat, 'on', k, 0.7], [0.1 + i * beat + 0.005, 'on', k + 12, 0.55]]),
      [0.1 + 3 * beat, 'on', 40, 0.7], [0.1 + 7 * beat, 'on', 36, 0.7], [0.1 + 7 * beat, 'on', 24, 1]];
    return play(preset('The whole gamelan'), 0.1 + 8 * beat + 4, ev);
  }],
  // a paired bonang (reyong) struck on the boss, then out on the face
  ['08-paired-bonang-boss-then-face', () => {
    const ph = notes(0.1, 0.35, [72, 74, 76, 79, 76], 0.75, 0.3);
    return cat(play(preset('Paired bonang'), 3, ph), play(preset('Paired bonang', { gongStrike: 0.8 }), 3.2, ph));
  }],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
