// Render Spring Keyboard demos, each isolating one physical effect, to examples/springs/*.wav
// Usage: node tools/render-springs.mjs        (then node tools/encode-examples.mjs springs)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../springs/src/springs-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const SpringEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'springs';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => ({ ...DEFAULTS, ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (p, seconds, events) => { const e = new SpringEngine(FS); e.setParams(p); return renderEngine(e, seconds, events, FS); };
// notes: [time, key, length, velocity]
const notes = (list) => list.flatMap(([t, k, len, v = 0.7]) => [[t, 'on', k, v], [t + len, 'off', k, 0.5]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const rest = (s) => [new Float64Array(Math.round(s * FS)), new Float64Array(Math.round(s * FS))];

// 1. A tune: a walking bass on the big springs under a melody on the small ones, two springs a key.
function tune() {
  const b = 0.3, ev = [];
  const bass = [36, 43, 48, 43, 41, 48, 53, 48, 39, 46, 51, 46, 43, 50, 55, 50];
  bass.forEach((k, i) => ev.push([i * b, k, b * 0.9, 0.75]));
  const mel = [[0, 72, 2], [2, 74, 1], [3, 75, 1], [4, 77, 2], [6, 75, 1], [7, 74, 1], [8, 72, 1], [9, 70, 1], [10, 67, 2], [12, 74, 1], [13, 72, 1], [14, 71, 2]];
  for (const [s, k, d] of mel) ev.push([s * b, k, d * b * 0.95, 0.6]);
  ev.push([16 * b, 36, 1.6, 0.75], [16 * b, 60, 1.6, 0.5], [16 * b, 67, 1.6, 0.5], [16 * b, 72, 1.6, 0.55]);
  return play(P(), 16 * b + 2.2, notes(ev));
}

const demos = [
  ['01-a-tune-on-the-springs', tune],
  // 2. One spring, nearly lossless, struck at C2, C3 and C4: the echoes repeat at the note, and each is a chirp rising to F_C
  ['02-one-spring-struck-at-c2-c3-and-c4', () => play(P({ springs: 1, endLoss: 0.02, eta: 8e-5 }), 6.5, notes([[0.1, 36, 2.2, 0.9], [2.4, 48, 1.9, 0.9], [4.5, 60, 1.8, 0.9]]))],
  // 3. The same phrase on one, two and three springs a key: the echoes blur into a wash
  ['03-one-then-two-then-three-springs', () => {
    const ph = notes([[0.1, 43, 0.6, 0.8], [0.4, 50, 0.6, 0.7], [0.7, 55, 0.6, 0.7], [1.0, 59, 1.2, 0.7]]);
    return cat(play(P({ springs: 1, spread: 3 }), 2.6, ph), play(P({ springs: 2, spread: 3 }), 2.6, ph), play(P({ springs: 3, spread: 3 }), 2.8, ph));
  }],
  // 4. Low damping (light beads on stiff mounts), then Hammond's oil bath
  ['04-light-mounts-then-an-oil-bath', () => {
    const ph = notes([[0.1, 48, 2.5, 0.8], [0.6, 55, 2, 0.7], [1.1, 60, 1.5, 0.7]]);
    return cat(play(preset('Light beads'), 3.6, ph), play(preset('Hammond'), 2.4, ph));
  }],
  // 5. Wider and wider coils on one key (C3): F_C comes down from 4.3 kHz to 530 Hz, and the chirps with it
  ['05-the-coil-widens-and-the-chirps-come-down', () => {
    const ev = [];
    [0.7, 0.85, 1, 1.25, 1.5, 1.8, 2].forEach((c, i) => { ev.push([0.9 * i, 'params', P({ springs: 1, coil: c, endLoss: 0.03 })], [0.9 * i + 0.001, 'on', 48, 0.85], [0.9 * i + 0.8, 'off', 48, 0.5]); });
    return play(P({ springs: 1 }), 6.9, ev);
  }],
  // 6. Soft mallet, then a hard tap: only the low echoes, then the chirps up to F_C
  ['06-soft-mallet-then-hard-tap', () => {
    const ph = notes([[0.1, 45, 1.2, 0.8], [0.5, 52, 1, 0.75], [0.9, 57, 0.9, 0.75]]);
    return cat(play(P({ mallet: 2.5 }), 2.4, ph), play(P({ mallet: 0.08 }), 2.4, ph));
  }],
  // 7. The Slinky: wide slack coils whose F_C is below hearing; every echo a falling whistle
  ['07-slinky-whistles', () => play(preset('Slinky'), 8, notes([[0.1, 48, 3, 0.9], [3.2, 60, 2.4, 0.9], [5.6, 67, 2.3, 0.9]]))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.15, FS), FS);
