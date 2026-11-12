// Render the Breit-Wigner Keyboard's demos, each isolating one physical effect, to examples/breitwigner/*.wav
// Usage: node tools/render-breitwigner.mjs        (then node tools/encode-examples.mjs breitwigner)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../breitwigner/src/breitwigner-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const BreitWignerEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'breitwigner';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (word, o = {}) => ({ ...DEFAULTS, ...PRESETS.find((q) => q.name.startsWith(word)).p, ...o });
const play = (p, seconds, events) => { const e = new BreitWignerEngine(FS); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const chord = (t, keys, vel, len) => keys.flatMap((k) => [[t, 'on', k, vel], [t + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// a note's own bend (a boost) from one frequency ratio to another over [t0, t1]
const boost = (key, a, b, t0, t1, n = Math.round((t1 - t0) / 0.01)) => Array.from({ length: n + 1 }, (_, i) => [t0 + ((t1 - t0) * i) / n, 'msg', { type: 'noteBend', key, value: a * (b / a) ** (i / n) }]);

const PHRASE = [57, 60, 64, 69]; // A3 C4 E4 A4

const demos = [
  // the default, a φ meson's 0.42 %: soft mallet notes, each a single decaying sine
  ['01-one-state-a-soft-mallet', () => play(P(), 9, [
    ...notes(0.1, 0.36, [57, 64, 69, 72, 76, 72, 69, 64], 0.7, 0.34), ...notes(3.0, 0.36, [53, 60, 65, 69, 72, 69, 65, 60], 0.7, 0.34),
    ...notes(5.9, 0.36, [55, 62, 67, 71], 0.75, 0.34), ...chord(7.35, [45, 57, 64, 69], 0.8, 1.2)])],
  // the same phrase as a ρ, a Δ, a Z, an ω, a φ and a J/ψ: from thuds to tones that ring on
  ['02-wide-is-short-narrow-is-long', () => cat(
    ...['ρ', 'Δ', 'Z', 'ω', 'φ'].map((w) => play(preset(w), 1.9, notes(0.1, 0.4, PHRASE, 0.85, 0.38))),
    play(preset('J/ψ'), 4.5, notes(0.1, 0.4, PHRASE, 0.6, 2.4)))],
  // four octaves of one Γ/M: each lives the same number of turns, so the bass lasts longest
  ['03-the-same-width-on-four-octaves', () => play(P({ width: 0.002 }), 8, [[0, 'sus', true], ...notes(0.1, 0.9, [45, 57, 69, 81], 0.8, 0.5), ...notes(4.2, 0.45, [81, 69, 57, 45], 0.8, 0.3)])],
  // a long note let go: the key-up channel opens and it dies in a quarter of a second; then with
  // the pedal down, which keeps the channel shut until the pedal comes up
  ['04-letting-go-opens-a-second-channel', () => play(P({ width: 0.0003, release: 3 }), 9.5, [
    ...chord(0.1, [60], 0.8, 2), ...chord(3.2, [67], 0.8, 0.8), [3.6, 'sus', true], [6.2, 'sus', false],
    ...chord(7, [60, 67, 72], 0.7, 0.3), ...chord(7.9, [60, 67, 72], 0.7, 0.3)])],
  // the Z born on the real axis (a sine, from nothing), then at its peak (a cosine: a click)
  ['05-born-as-a-sine-then-at-its-peak', () => cat(
    play(preset('Z'), 3.2, notes(0.1, 0.7, [45, 57, 69, 81], 0.9, 0.6)),
    play(preset('Z', { phase: 90 }), 3.2, notes(0.1, 0.7, [45, 57, 69, 81], 0.9, 0.6)))],
  // Sargent's rule, Γ ∝ M⁵: each octave up is 32 times wider
  ['06-sargents-rule-bass-rings-treble-ticks', () => play(preset('Sargent'), 10, [[0, 'sus', true],
    ...notes(0.1, 0.6, [33, 45, 57, 69, 81, 93], 0.8, 0.4), ...notes(4.2, 0.3, [93, 88, 84, 81, 76, 72, 69, 64, 60, 57, 52, 48, 45], 0.7, 0.2), [8.6, 'sus', false]])],
  // a boost: the same note at rest, then bent up an octave as it rings (γ = 2: sharper, and living twice as long)
  ['07-a-boost-sharper-and-longer-lived', () => cat(
    play(P({ width: 0.0015 }), 3.2, [[0, 'sus', true], ...chord(0.1, [57], 0.9, 1)]),
    play(P({ width: 0.0015 }), 5.5, [[0, 'sus', true], ...chord(0.1, [57], 0.9, 1), ...boost(57, 1, 2, 0.4, 1.6)]))],
  // the pedal down: every state lives out its own lifetime
  ['08-a-harp-with-the-pedal-down', () => play(P({ width: 0.0015 }), 11, [[0, 'sus', true],
    ...notes(0.1, 0.3, [50, 57, 62, 66, 69, 74, 78, 81, 86], 0.7, 0.25), ...notes(3.4, 0.3, [55, 59, 62, 67, 71, 74, 79], 0.6, 0.25),
    ...notes(5.9, 0.3, [57, 61, 64, 69, 73, 76, 81], 0.6, 0.25), ...chord(8.3, [38, 50, 62, 66, 69, 74], 0.7, 0.5), [10.2, 'sus', false]])],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
