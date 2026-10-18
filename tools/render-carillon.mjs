// Render Carillon demos, each isolating one physical effect, to examples/carillon/*.wav
// Usage: node tools/render-carillon.mjs        (then node tools/encode-examples.mjs carillon)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../carillon/src/carillon-instrument.js';
import { wasmModel } from '../carillon/src/carillon-wasm.js';
import { keyFreq } from '../shared/dsp.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const CarillonEngine = await loadEngine(INSTRUMENT);
const { bellOf, struckPartials, strikeNote } = await wasmModel();

const FS = 48000, SLUG = 'carillon', TAU = 2 * Math.PI;
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => ({ ...DEFAULTS, ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (params, seconds, events) => { const e = new CarillonEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const N = { C3: 48, D3: 50, E3: 52, F3: 53, G3: 55, A3: 57, B3: 59, C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83, C6: 84 };
// a phrase: [[beat, key, velocity] …] at `bpm`
const phrase = (t0, bpm, notes) => notes.map(([b, k, v = 0.7]) => [t0 + (b * 60) / bpm, 'on', typeof k === 'string' ? N[k] : k, v]);

// 1. Ode to Joy (Beethoven, Symphony No. 9; public domain), in a carillon setting: the tune in the
//    middle register, a bass bell on the strong beats, a tremolo on the last note as carillonneurs play it.
const ode = (() => {
  const tune = ['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4', 'E4', 'D4', 'D4', null,
    'E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4', 'D4', 'C4', 'C4'];
  const ev = [];
  let b = 0;
  tune.forEach((n, i) => {
    if (!n) { b += 1; return; }
    const dotted = i === 12 || i === 28, len = dotted ? 1.5 : i === 13 || i === 29 ? 0.5 : 1;
    ev.push([b, N[n] + 12, 0.75]);
    b += len;
  });
  const bass = [[0, 'C4'], [2, 'G3'], [4, 'C4'], [6, 'G3'], [8, 'A3'], [10, 'E3'], [12, 'G3'], [14, 'G3'], [16, 'C4'], [18, 'G3'], [20, 'C4'], [22, 'G3'], [24, 'F3'], [26, 'G3'], [28, 'C3']];
  for (const [bb, k] of bass) ev.push([bb, N[k], 0.55]);
  // closing tremolo on C5 and the octave
  for (let i = 0; i < 6; i++) ev.push([30 + i / 4, i % 2 ? N.C5 + 12 : N.C5, 0.45 + 0.04 * i]);
  ev.push([31.5, N.C4, 0.7], [31.5, N.E4 + 12, 0.6], [31.5, N.G4 + 12, 0.6]);
  return phrase(0.2, 150, ev);
})();

const chord = (t, keys, v = 0.7) => keys.map((k) => [t, 'on', N[k] ?? k, v]);
const arp = (t, keys, dt, v = 0.7) => keys.map((k, i) => [t + i * dt, 'on', N[k] ?? k, v]);
const tune2 = (t) => arp(t, ['C5', 'E5', 'G5', 'C6'], 0.32).concat(chord(t + 1.6, ['C4', 'E4', 'G4', 'C5']));

// 3. a G4 bell; then only its nominal, superquint and octave nominal (none of them at the strike
//    note, yet it is still heard); then a sine at the strike note the estimator finds.
function strikeDemo() {
  const key = N.G4, b = bellOf(key, 'minor'), sn = strikeNote(struckPartials(b, P())).f;
  const bell = play(P(), 3.2, [[0.1, 'on', key, 0.8]]);
  const noLow = play(P({ only: ['nominal', 'superquint', 'octnom'] }), 3.2, [[0.1, 'on', key, 0.8]]);
  const n = Math.round(2 * FS), sine = [new Float64Array(n), new Float64Array(n)];
  let pk = 0;
  for (const v of bell[0]) pk = Math.max(pk, Math.abs(v));
  for (let i = 0; i < n; i++) { const t = i / FS, env = Math.min(1, t / 0.02) * Math.min(1, (2 - t) / 0.2); sine[0][i] = sine[1][i] = 0.25 * pk * env * Math.sin(TAU * sn * t); }
  console.log(`  strike note of G4: ${sn.toFixed(2)} Hz (key ${keyFreq(key).toFixed(2)} Hz)`);
  return cat(bell, noLow, sine);
}

const demos = [
  ['01-ode-to-joy-on-the-carillon', () => play(P(), 15.5, ode), 0.2],
  ['02-minor-third-bells-then-major-third-bells', () => cat(play(P(), 5, tune2(0.2)), play(P({ profile: 'major' }), 5, tune2(0.2))), 0.15],
  ['03-a-bell-then-only-its-nominal-group-then-a-sine-at-its-strike-note', strikeDemo, 0.1],
  ['04-uneven-bell-struck-on-its-axis-then-between-the-axes', () => cat(
    play(preset('The same bells struck on an axis'), 5.5, [[0.1, 'on', N.C5, 0.8]]),
    play(preset('Warbling bells'), 5.5, [[0.1, 'on', N.C5, 0.8]])), 0.1],
  ['05-iron-clapper-then-soft-insert', () => cat(play(P(), 4.5, arp(0.1, ['C5', 'E5', 'G5', 'C6'], 0.5, 0.8)), play(preset('Soft clapper'), 4.5, arp(0.1, ['C5', 'E5', 'G5', 'C6'], 0.5, 0.8))), 0.15],
  ['06-tuned-bells-then-historic-untuned-bells', () => cat(play(P(), 5.5, tune2(0.2)), play(preset('Historic'), 5.5, tune2(0.2))), 0.15],
  ['07-under-the-tower-then-across-the-town-square', () => cat(
    play(preset('Under the tower'), 5, tune2(0.2)).map((x) => x.map((v) => v * 0.33)),
    play(preset('Across the town square'), 5, tune2(0.2)).map((x) => x.map((v) => v * 10))), 0.2],
];

for (const [name, fn, room] of demos) saveExample(SLUG, name, await withRoom(fn(), room, FS), FS);
