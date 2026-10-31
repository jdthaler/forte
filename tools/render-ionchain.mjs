// Render Ion Chain demos, each isolating one physical effect, to examples/ionchain/*.wav
// Usage: node tools/render-ionchain.mjs [prefix…]   (then node tools/encode-examples.mjs ionchain)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../ionchain/src/ionchain-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const IonChainEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'ionchain';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => P({ ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (params, seconds, events) => { const e = new IonChainEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
const note = (t, key, dur, vel = 0.7) => [[t, 'on', key, vel], [t + dur, 'off', key]];
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

// A slow chorale of five-ion chains: bells whose partials are the crystal's modes.
function chorale() {
  const B = 0.8, chords = [[48, 55, 64, 72], [45, 57, 64, 69], [41, 53, 60, 69], [43, 55, 62, 71], [48, 55, 64, 76]];
  const ev = chords.flatMap((ch, i) => ch.flatMap((k, j) => note(i * B + 0.03 * j, k, i === chords.length - 1 ? 2.4 : B * 0.9, 0.55 + 0.1 * (j === 3))));
  return play(P(), chords.length * B + 3, ev);
}

// One key, A3, as the trap holds one, two, three, five and twelve ions.
const counts = () => cat(...[1, 2, 3, 5, 12].map((ions) => play(P({ ions, distance: 1.5 }), 1.6, note(0.02, 57, 1.0, 0.8))));

// Seven ions: the end ion kicked, then the centre one, whose kick leaves the even modes still.
const where = () => cat(...[1, 0].map((beam) => play(P({ ions: 7, beam, distance: 1.5 }), 2.2, note(0.02, 52, 1.6, 0.8))));

// The same struck note as the electrodes move from close to far: the upper modes fade until only
// the centre of mass, a pure tone, is left.
function distance() {
  const ev = [];
  [1.2, 1.5, 2, 3, 6, 40].forEach((d, i) => { ev.push([i * 1.1, 'params', P({ distance: d })], ...note(i * 1.1 + 0.01, 55, 0.9, 0.8)); });
  return play(P({ distance: 1.2 }), 7.5, ev);
}

// Six ions held ringing (the pedal down) while the radial pull is weakened through the zigzag
// transition and back: the crystal buckles, its modes mix and new lines appear.
function zigzag() {
  const base = P({ ions: 6, angle: 50, resist: 60 }), ev = [[0, 'sus', true], ...note(0.02, 50, 0.1, 0.9), ...note(0.03, 57, 0.1, 0.7)];
  for (let t = 0.5; t <= 6.5; t += 0.02) {
    const u = (t - 0.5) / 6, a = 8 * (1.6 / 8) ** (u < 0.5 ? 2 * u : 2 - 2 * u);
    ev.push([t, 'params', { ...base, aniso: a }]);
  }
  ev.push([3.5, 'on', 50, 0.6], [3.5, 'off', 50], [7.2, 'sus', false]);
  return play(base, 8.5, ev);
}

// A chord let go: cooled on every ion it stops at once; cooled only through the end ion, the
// modes in which the end ion barely moves ring on.
const cooling = () => cat(...['all', 'end'].map((coolOn) => play(P({ ions: 8, coolOn, cool: 0.15 }), 3, [48, 55, 60, 64].flatMap((k) => note(0.02, k, 0.9, 0.8)))));

// A beam along the axis, which pushes every ion alike (only the centre of mass), then one across
// the end ion.
const beam = () => cat(...[0, 40].map((angle) => play(P({ angle }), 2.2, [57, 64].flatMap((k) => note(0.02, k, 1.5, 0.8)))));

// Twenty ions: a long crystal, its modes climbing to 11.9 times the note.
const twenty = () => play(preset('Twenty ions'), 5, [36, 43, 48, 55].flatMap((k, i) => note(0.02 + 0.6 * i, k, 2.6 - 0.6 * i, 0.7)));

const demos = [
  ['01-a-chorale-of-ion-chains', chorale],
  ['02-one-two-three-five-twelve-ions', counts],
  ['03-end-ion-then-centre-ion-kicked', where],
  ['04-electrodes-near-to-far', distance],
  ['05-into-the-zigzag-and-back', zigzag],
  ['06-cooled-everywhere-then-through-one-ion', cooling],
  ['07-beam-along-the-axis-then-across', beam],
  ['08-twenty-ions', twenty],
];

const only = process.argv.slice(2);
for (const [name, fn] of demos) if (!only.length || only.some((p) => name.startsWith(p))) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
