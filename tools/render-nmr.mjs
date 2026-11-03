// Render NMR Spin Echo demos, each isolating one physical effect, to examples/nmr/*.wav
// Usage: node tools/render-nmr.mjs        (then node tools/encode-examples.mjs nmr)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../nmr/src/nmr-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const NmrEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'nmr';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => P({ ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (params, seconds, events) => { const e = new NmrEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const note = (t, key, dur, vel = 0.85) => [[t, 'on', key, vel], [t + dur, 'off', key]];
const chord = (t, keys, dur, vel = 0.8) => keys.flatMap((k) => note(t, k, dur, vel));
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

const demos = [
  // ethanol chords, each held with the echo train: every chord comes back on each pulse
  ['01-ethanol-chords-with-an-echo-train', () => {
    const ev = [];
    [[45, 52], [41, 48], [43, 50], [40, 47]].forEach((c, i) => { ev.push(...chord(i * 2.4, c, 2.3)); ev.push([i * 2.4 + 0.12, 'sus', true], [i * 2.4 + 2.2, 'sus', false]); });
    return play(P({ train: true, spacing: 0.35, shim: 10, t2: 3, t1: 3 }), 10.4, ev);
  }],
  // the same phrase on three molecules: water's one line, ethanol's chord, ethyl acetate's
  ['02-water-then-ethanol-then-ethyl-acetate', () => {
    const phrase = [57, 60, 64, 62].flatMap((k, i) => note(0.05 + 0.6 * i, k, 0.55));
    return cat(...['water', 'ethanol', 'ethylAcetate'].map((sample) => play(P({ sample, acquire: 'ring', shim: 3 }), 3, phrase)));
  }],
  // Hahn's echo: a held note fades, the pedal's π pulse at 0.4 s brings it back at 0.8 s; then at 0.8 s, back at 1.6 s
  ['03-hahns-echo-pulse-at-0.4-then-0.8-s', () => cat(
    play(preset('Hahn'), 2.2, [...note(0.05, 60, 2), [0.45, 'sus', true], [0.6, 'sus', false]]),
    play(preset('Hahn'), 2.6, [...note(0.05, 60, 2.4), [0.85, 'sus', true], [1, 'sus', false]]))],
  // a perfect shim: ethanol's multiplets beat at their J couplings
  ['04-the-couplings-beat', () => play(preset('Perfect shim'), 6, [...note(0.05, 57, 3), ...note(3.1, 45, 2.8)])],
  // an echo train on water: one pulse after another, every echo weaker by T₂ alone
  ['05-an-echo-train-on-water', () => play(preset('Echo train', { sample: 'water' }), 5, [...chord(0.05, [48, 55], 4.8), [0.2, 'sus', true], [4.7, 'sus', false]])],
  // saturation: repeated 90° pulses with a long T₁ fade away; repeated 25° pulses keep sounding
  ['06-saturation-90-degree-then-25-degree-pulses', () => {
    const ev = [0, 1, 2, 3, 4, 5].flatMap((i) => note(0.05 + 0.5 * i, 64, 0.45, 1));
    return cat(play(preset('Saturated'), 3.2, ev), play(preset('Saturated', { flip: 25 }), 3.2, ev));
  }],
  // weak magnets lean: ethanol low on the keyboard, second order, then high, first order
  ['07-weak-magnets-lean-then-strong-ones', () => play(preset('Perfect shim'), 7, [...note(0.05, 21, 3.3), ...note(3.5, 81, 3.3)])],
  // a gradient: sinc fades; with a poor shim, diffusion takes the later echoes of a single π pulse
  ['08-a-gradient-and-diffusion', () => cat(
    play(preset('A gradient'), 2.5, [...chord(0.05, [50, 57], 2.3)]),
    play(preset('Diffusion steals'), 2, [...note(0.05, 72, 1.8), [0.15, 'sus', true], [0.3, 'sus', false]]),
    play(preset('Diffusion steals'), 2, [...note(0.05, 72, 1.8), [0.45, 'sus', true], [0.6, 'sus', false]]))],
];

const only = process.argv.slice(2);
for (const [name, fn] of demos) if (!only.length || only.some((p) => name.startsWith(p))) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
