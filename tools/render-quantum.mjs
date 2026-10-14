// Render Quantum Keyboard demos, each isolating one physical effect, to examples/quantum/*.wav
// Usage: node tools/render-quantum.mjs        (then node tools/encode-examples.mjs quantum)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { QuantumEngine } from '../quantum/src/quantum-engine.js';
import { DEFAULTS } from '../quantum/src/quantum-params.js';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const FS = 48000, SLUG = 'quantum';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
// render, then fade the last `fade` seconds (so concatenated segments end cleanly)
const play = (p, seconds, events, fade = 0.08) => {
  const e = new QuantumEngine(FS); e.setParams(p);
  const out = renderEngine(e, seconds, events, FS), n = out[0].length, m = Math.round(fade * FS);
  for (const ch of out) for (let i = 0; i < m; i++) ch[n - m + i] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / m);
  return out;
};
const held = (t, key, len, vel = 0.8) => [[t, 'on', key, vel], [t + len, 'off', key]];
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const gap = (s) => [new Float64Array(Math.round(s * FS)), new Float64Array(Math.round(s * FS))];

// 01: a phrase at 84 BPM in the Morse well, T_rev = 2 beats. Each note comes back on
// every beat (T_rev/2), an octave up on the off-beats (T_rev/4) and a twelfth up on
// the triplets (T_rev/3, T_rev/6), while it fades with T₁.
const BEAT = 60 / 84;
const phrase = [ // [beat, key, beats held]
  [0, 45, 4], [0, 57, 2.5], [1, 64, 1.5], [2, 60, 2], [3, 62, 1],
  [4, 41, 4], [4, 57, 2.5], [5, 65, 1.5], [6, 64, 1.2], [7, 60, 1],
  [8, 48, 4], [8, 55, 2], [9, 64, 1.5], [10, 67, 2], [10, 72, 2],
];
const melody = (p, vel = 0.75) => phrase.filter(([b]) => b < p).flatMap(([b, k, len]) => held(b * BEAT, k, len * BEAT, k < 50 ? 0.55 : vel));
const MORSE = { potential: 'morse', bpm: 84, T1: 3, release: 0.4 };

const demos = [
  ['01-a-phrase-whose-notes-return-on-the-beat-morse-well', () => play(P(MORSE), 10, melody(12), 1)],
  // one A3, T_rev = 4 beats at 90 BPM = 2.67 s: box (odd harmonics only, silent at T/4) then Morse (octave at T/4)
  ['02-one-note-fractional-revivals-square-well-then-morse', () => cat(
    play(P({ beats: 4, T1: 12 }), 3.3, held(0.05, 57, 3.2, 0.9)), gap(0.2),
    play(P({ potential: 'morse', beats: 4, T1: 12 }), 3.3, held(0.05, 57, 3.2, 0.9)))],
  ['03-harmonic-oscillator-never-dephases-then-square-well', () => cat(
    play(P({ potential: 'harmonic', T1: 8 }), 3, held(0.05, 52, 2.9, 0.8)), gap(0.2),
    play(P({ T1: 8 }), 3, held(0.05, 52, 2.9, 0.8)))],
  // hydrogen n̄ = 44, σ = 1.3 on C3: T_rev = 0.23 s, super-revival at T_sr/6 = 1.25 s
  ['04-rydberg-atom-fast-revivals-and-super-revivals', () => play(P({ potential: 'hydrogen', lock: false, nbar: 44, sigma: 1.3, detector: 'x', T1: 30 }), 7, held(0.05, 48, 6.9, 0.9), 0.3)],
  ['05-same-phrase-coherent-then-dephased-tphi-0p3s', () => cat(
    play(P(MORSE), 4.9, melody(4), 0.5), gap(0.2), play(P({ ...MORSE, dephase: 1 / 0.3 }), 4.9, melody(4), 0.5))],
  // fixed n̄ = 150: T_rev = 2n̄/f, so C–E–G–C revive at rates 4 : 5 : 6 : 8 (times 1/4 : 1/5 : 1/6 : 1/8)
  ['06-fixed-nbar-chord-revives-in-polyrhythm', () => play(P({ lock: false, nbar: 150, T1: 6, detector: 'v' }), 8, [60, 64, 67, 72].flatMap((k) => held(0.05, k, 7.9, 0.6)), 0.3)],
  ['07-level-spread-three-levels-then-sigma-2-then-sigma-4', () => cat(
    play(P({ sigma: 0.6, T1: 6 }), 3, held(0.05, 57, 2.9, 0.8)), gap(0.2),
    play(P({ sigma: 2, T1: 6 }), 3, held(0.05, 57, 2.9, 0.8)), gap(0.2),
    play(P({ sigma: 4, T1: 6 }), 3, held(0.05, 57, 2.9, 0.8)))],
  ['08-detectors-electrode-coil-antenna', () => cat(
    play(P({ detector: 'x', T1: 6 }), 2.7, held(0.05, 50, 2.6, 0.8)), gap(0.15),
    play(P({ detector: 'v', T1: 6 }), 2.7, held(0.05, 50, 2.6, 0.8)), gap(0.15),
    play(P({ detector: 'a', T1: 6 }), 2.7, held(0.05, 50, 2.6, 0.8)))],
];

export { demos };
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const only = process.argv[2]; // optional prefix, e.g. 04
  for (const [name, fn] of demos) {
    if (only && !name.startsWith(only)) continue;
    saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
  }
}
