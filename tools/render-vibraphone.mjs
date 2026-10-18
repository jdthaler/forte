// Render vibraphone demos, each isolating one physical effect, to examples/vibraphone/*.wav
// Usage: node tools/render-vibraphone.mjs        (then node tools/encode-examples.mjs vibraphone)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../vibraphone/src/vibraphone-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const VibraphoneEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'vibraphone';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => ({ ...DEFAULTS, ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (p, seconds, events) => { const e = new VibraphoneEngine(FS); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const chord = (t, keys, vel, len, spread = 0.012) => keys.flatMap((k, i) => [[t + i * spread, 'on', k, vel], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

// 01: a ballad, slow motor, the pedal held through each chord (Fmaj9 – Em7 – Dm9 – G9sus – Cmaj9)
function ballad() {
  const ev = [];
  const bars = [[53, 64, 69, 72], [55, 62, 64, 71], [53, 60, 64, 69], [55, 60, 65, 69]];
  const mel = [[76, 79, 81], [74, 76, 79], [72, 76, 77], [71, 72, 74]];
  bars.forEach((ch, i) => {
    const t = 0.15 + 2.1 * i;
    ev.push([t - 0.02, 'sus', true], [t + 2.05, 'sus', false], ...chord(t, ch, 0.42, 0.3));
    mel[i].forEach((k, j) => ev.push([t + 0.55 + 0.45 * j, 'on', k, j === 2 ? 0.58 : 0.5], [t + 0.75 + 0.45 * j, 'off', k]));
  });
  ev.push([8.53, 'sus', true], ...chord(8.55, [60, 64, 67, 71, 74], 0.45, 0.4), [9.55, 'sus', false]);
  return play(P({ speed: 1.6 }), 10, ev);
}

const demos = [
  ['01-ballad-slow-motor-pedal-down', ballad],
  // the same held chord: motor off (discs open), then the shaft spins up to 2.5 rev/s (a 5 Hz tremolo)
  ['02-motor-off-then-on-held-chord', () => play(P({ motor: 'open' }), 9,
    [[0, 'sus', true], ...chord(0.1, [57, 60, 64, 67], 0.6, 0.2), [3.3, 'params', P({ motor: 'run', speed: 2.5 })], [8.5, 'sus', false]])],
  // a phrase over the tubes, then the same phrase with the tubes taken away
  ['03-with-resonators-then-without', () => {
    const ph = [[0, 'sus', true], ...notes(0.1, 0.32, [60, 64, 67, 71, 72], 0.6, 0.3), [3.1, 'sus', false]];
    return cat(play(P({ motor: 'open' }), 3.6, ph), play(P({ motor: 'open', tubes: false }), 3.6, ph));
  }],
  // tuned 1 : 4 : 10 bars, then plain bars (1 : 2.76 : 5.40), struck near the end so the partials speak
  ['04-tuned-bars-then-plain-bars', () => {
    const ph = [[0, 'sus', true], ...notes(0.1, 0.4, [65, 69, 72, 77], 0.7, 0.35), [2.9, 'sus', false]];
    return cat(play(P({ motor: 'open', strike: 0.1 }), 3.4, ph), play(P({ motor: 'open', strike: 0.1, depth: 0 }), 3.4, ph));
  }],
  // one low bar with its tube at the usual 30 mm, then pressed to 6 mm: bar and tube trade energy, beating at ~9 Hz
  ['05-tube-close-bar-and-tube-beat', () => cat(
    play(P({ motor: 'open' }), 3.5, [[0, 'sus', true], [0.1, 'on', 53, 0.7], [0.3, 'off', 53], [3.0, 'sus', false]]),
    play(P({ motor: 'open', gap: 6 }), 3.5, [[0, 'sus', true], [0.1, 'on', 53, 0.7], [0.3, 'off', 53], [3.0, 'sus', false]]))],
  // the discs set 40° apart along the shaft, and the accidentals' shaft 90° behind: the chord shimmers
  ['06-discs-aligned-then-twisted', () => {
    const ch = [[0, 'sus', true], ...chord(0.6, [55, 59, 62, 66, 69], 0.6, 0.3), [3.7, 'sus', false]];
    return cat(play(P({ speed: 1.5 }), 4.2, ch), play(P({ speed: 1.5, twist: 40, shaft2: 90 }), 4.2, ch));
  }],
  // soft yarn, then hard cord mallets, on the same arpeggio
  ['07-soft-yarn-then-hard-cord-mallets', () => {
    const ph = [[0, 'sus', true], ...notes(0.1, 0.3, [72, 76, 79, 84, 88], 0.75, 0.25), [2.7, 'sus', false]];
    return cat(play(P({ motor: 'open', hardness: 80 }), 3.2, ph), play(P({ motor: 'open', hardness: 6000, mass: 9 }), 3.2, ph));
  }],
  // struck at the centre (mode 2 silent), then at the end (every mode), then on mode 1's node (no fundamental)
  ['08-centre-end-and-node-strikes', () => {
    const ph = [[0, 'sus', true], [0.1, 'on', 62, 0.7], [0.3, 'off', 62], [1.0, 'on', 69, 0.7], [1.2, 'off', 69], [1.75, 'sus', false]];
    return cat(play(P({ motor: 'open', strike: 0.5, across: 0 }), 2.2, ph), play(P({ motor: 'open', strike: 0.03 }), 2.2, ph), play(P({ motor: 'open', strike: 0.205, across: 0 }), 2.2, ph));
  }],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
