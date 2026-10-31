// Render Ondes Martenot demos, each isolating one physical effect, to examples/ondes/*.wav
// Usage: node tools/render-ondes.mjs [prefix…]   (then node tools/encode-examples.mjs ondes)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../ondes/src/ondes-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const OndesEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'ondes';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => P({ ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (params, seconds, events) => { const e = new OndesEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const note = (t, key, dur, vel = 0.7) => [[t, 'on', key, vel], [t + dur, 'off', key]];
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// The keyboard's vibrato growing in on a long note: the finger rocks the key wider (the mod wheel).
const swellVibrato = (params, t0, t1, depth) => {
  const ev = [];
  for (let t = t0; t < t1; t += 0.05) ev.push([t, 'params', { ...params, vibrato: depth * Math.min(1, (t - t0) / 0.8) }]);
  ev.push([t1, 'params', { ...params, vibrato: 0 }]);
  return ev;
};

// A slow melody on the ribbon: the ring slides between legato notes, and the long ones bloom with
// the keyboard's vibrato; principal, palme and a touch of the tam-tam.
function melody() {
  const p = P({ mode: 'ribbon', glide: 0.16, dM: 0.25, dPalme: 0.4 });
  const B = 0.45, line = [[64, 2], [67, 1], [71, 1], [69, 3], [67, 1], [66, 2], [62, 2], [64, 5]];
  const ev = [];
  let beat = 0;
  for (const [k, beats] of line) {
    ev.push([beat * B, 'on', k, 0.75]);
    if (beats >= 2) ev.push(...swellVibrato(p, beat * B + 0.3, (beat + beats) * B - 0.02, 14));
    beat += beats;
    ev.push([beat * B + 0.05, 'off', k]); // the next key goes down just before this one lifts: a slide
  }
  return play(p, beat * B + 2, ev);
}

// One phrase through each diffuseur alone: the principal, the springs, the tam-tam, the palme.
function diffuseurs() {
  const phrase = (o) => play(P({ dP: 0, dPalme: 0, ...o }), 3.4, [57, 60, 64, 69].flatMap((k, i) => note(0.05 + 0.4 * i, k, 0.36, 0.8)));
  return cat(phrase({ dP: 1 }), phrase({ dR: 1, dP: 0.3 }), phrase({ dM: 1 }), phrase({ dPalme: 1, dP: 0.3 }));
}

// One held A3 through the drawer's timbres in turn: O, C, g, G, N, then O with the octaviant.
function drawer() {
  const off = { tO: false, tC: false, tg: false, tG: false, tN: false, octave: 0, dPalme: 0 };
  const steps = [{ tO: true }, { tC: true }, { tg: true }, { tG: true }, { tN: true, width: 0.12 }, { tO: true, octave: 0.7 }];
  const ev = note(0, 57, 8.8, 0.75);
  steps.forEach((s, i) => ev.push([1.45 * i + 0.01, 'params', P({ ...off, ...s })]));
  return play(P({ ...off, tO: true }), 9.5, ev);
}

// Low notes without pull, then with the oscillators pulling hard (25 Hz): the same pitches, buzzier.
function pulling() {
  const line = (pull) => play(P({ pull, balance: 0.1, dPalme: 0 }), 3.6, [21, 28, 33, 40].flatMap((k, i) => note(0.05 + 0.85 * i, k, 0.8, 0.85)));
  return cat(line(0), line(25));
}

// The left hand on the intensity key: a held note pressed in softly, leaned on (aftertouch), let off.
function intensity() {
  const ev = note(0, 62, 6.4, 0.15);
  for (let t = 0.5; t <= 6; t += 0.02) ev.push([t, 'msg', { type: 'pressure', value: Math.sin((Math.PI * (t - 0.5)) / 5.5) ** 2 }]);
  return play(P({ mode: 'ribbon' }), 7.2, ev);
}

// Chords on the keys, an ondes for each, through the tam-tam: its halo rings on between them.
const chords = () => play(preset('Métallique', { dP: 0.4 }), 8, [[48, 55, 64], [45, 52, 60], [41, 48, 57], [43, 50, 59]].flatMap((c, i) => c.flatMap((k) => note(0.05 + 1.8 * i, k, 1.3, 0.7))));

// Warming up: a slow line with the drift on; the low notes wander most in cents.
const drift = () => play(preset('Warming up'), 8, [[45, 0], [52, 1.9], [57, 3.8], [33, 5.7]].flatMap(([k, t]) => note(t, k, 1.8, 0.75)));

// The souffle's breath with the petit gambe, through the springs: their chirps ring after each note.
const souffle = () => play(preset('Petit gambe', { dR: 0.9, dP: 0.5, dPalme: 0 }), 6, [60, 67, 72, 65].flatMap((k, i) => note(0.05 + 1.3 * i, k, 0.5, 0.8)));

const demos = [
  ['01-a-ribbon-melody-with-vibrato', melody],
  ['02-principal-springs-tam-tam-palme', diffuseurs],
  ['03-the-drawer-o-c-g-g-n-8', drawer],
  ['04-low-notes-without-and-with-pulling', pulling],
  ['05-the-intensity-key-pressed-and-let-off', intensity],
  ['06-chords-through-the-tam-tam', chords],
  ['07-warming-up-thermal-drift', drift],
  ['08-souffle-and-gambe-through-the-springs', souffle],
];

const only = process.argv.slice(2);
for (const [name, fn] of demos) if (!only.length || only.some((p) => name.startsWith(p))) saveExample(SLUG, name, await withRoom(fn(), 0.3, FS), FS);
