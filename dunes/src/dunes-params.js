// dunes-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pct = (v) => `${(v * 100).toFixed(0)} %`;
// Folk and Ward's (1957) words for a sand's sorting, by its spread in φ units
export const SORTING_WORDS = [[0.35, 'very well sorted'], [0.5, 'well sorted'], [0.71, 'moderately well sorted'], [1, 'moderately sorted'], [2, 'poorly sorted'], [Infinity, 'very poorly sorted']];
export const sortingWord = (v) => SORTING_WORDS.find(([top]) => v < top)[1];

export const GROUPS = [
  {
    title: 'What sets the pitch',
    params: [
      { id: 'theory', label: 'Theory', type: 'select', def: 'grains', perform: true,
        options: [['grains', 'The grains, in step (Douady, Andreotti)'], ['layer', 'The dune\'s layer, a waveguide (Vriend, Hunt)']],
        hint: 'How dunes sing is still argued over, so this plays both sides. Grains: the avalanche\'s sheared grains collide 0.4·√(g/d) times a second, and above a threshold the flowing layer\'s own vibration pulls them into step, so the note is set by the grain size d (each key is a sand). Layer: the avalanche\'s grains rattle at random, and a dry loose layer over firmer sand traps the waves and rings at its depth\'s note (each key is a layer depth), with no threshold.' },
      { id: 'layerQ', label: 'Layer Q (how well it traps)', min: 5, max: 100, def: 30, log: true, fmt: (v) => v.toFixed(v < 10 ? 1 : 0),
        showIf: (P) => P.theory === 'layer',
        hint: 'How well the layer keeps its waves as they bounce between the dune\'s surface and the firmer sand below: they leak away, down to 1/e, in Q/π cycles. High is a clear note; low is a breathy, wide drone.' },
    ],
  },
  {
    title: 'Sand',
    params: [
      { id: 'sorting', label: 'Sorting (grain-size spread)', min: 0.1, max: 1.5, def: 0.3, step: 0.01, fmt: (v) => `${v.toFixed(2)} φ, ${sortingWord(v)}`,
        hint: 'How much the grains\' sizes spread, as geologists measure it (Folk and Ward\'s σ in φ, log₂ units of size). Smaller grains shear faster, so a spread of sizes is a spread of the grains\' own frequencies, which the avalanche must pull into step. Singing dunes are very well sorted; a poorly sorted sand only roars, unless it is sieved.' },
      { id: 'damp', label: 'Water in the sand', min: 0, max: 1, def: 0, step: 0.01, fmt: (v) => (v < 0.005 ? 'bone dry' : `${v.toFixed(2)} % by weight`),
        hint: 'Dunes fall silent after rain. Water bridges between the grains make them stick and soak up their collisions, so the coupling that pulls them into step weakens (by e for every 0.15 % in this model, our choice of scale) and the threshold climbs out of reach. The hiss of the sliding sand quietens too.' },
      { id: 'contact', label: 'Collision length', min: 0.1, max: 0.5, def: 0.25, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of a cycle`,
        hint: 'How long each push between sliding grain layers lasts, as a fraction of the cycle. Short pushes are a train of knocks, rich in harmonics: a buzzing boom. Long ones are close to a sine: a pure hum, like a cello\'s open string far away.' },
    ],
  },
  {
    title: 'Avalanche',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.8, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'How hard the computer keys go down: how fast the avalanche runs.' },
      { id: 'speed', label: 'Avalanche speed (full velocity)', min: 0.1, max: 2.5, def: 1, step: 0.01, fmt: (v) => `${v.toFixed(2)} m/s`,
        hint: 'How fast the sand slides down the slip face on a key struck as hard as it goes (the velocity squared takes a share of it). People sliding down Dumont Dunes on their seats ran avalanches at 1 to 2 m/s. In the grains\' theory a dune\'s sand starts to sing only above a speed: 0.23 m/s in the field at Tarfaya, Morocco, here for the default sand.' },
      { id: 'push', label: 'Push (more sand)', min: 0, max: 1, def: 0, step: 0.01, perform: true, strip: true, fmt: pct,
        hint: 'Pushing more sand down the face (the mod wheel; aftertouch on one key, MPE slide too): the avalanche runs up toward its full speed whatever the velocity, so a soft note that only hissed crosses the threshold and starts to sing.' },
      { id: 'stop', label: 'Stopping time', min: 0.1, max: 3, def: 0.5, step: 0.01, fmt: (v) => `${v.toFixed(2)} s`,
        hint: 'How long the avalanche takes to come to rest once the key is up. As it slows, the coupling falls below the threshold and the grains fall out of step: the song breaks up into a rumble before it stops.' },
      { id: 'hiss', label: 'Sliding hiss', min: 0, max: 1, def: 0.3, step: 0.01, fmt: pct,
        hint: 'The rustle of the sliding sand: grains knocking at random, too short and too many to make a note. It grows with the avalanche\'s speed.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.15, step: 0.01, fmt: pct },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Desert sand, very well sorted: in step', p: {} },
  { name: 'A slow slide, at the threshold', p: { speed: 0.4 } },
  { name: 'Moderately sorted: a rougher song', p: { sorting: 0.6 } },
  { name: 'Poorly sorted: it only roars', p: { sorting: 1.2 } },
  { name: 'Damp after rain: the song dies', p: { damp: 0.3 } },
  { name: 'Short collisions: a buzzing boom', p: { contact: 0.12 } },
  { name: 'Long collisions: a pure hum', p: { contact: 0.45 } },
  { name: 'A long avalanche, slow to stop', p: { stop: 2.5 } },
  { name: 'A layered dune (Vriend): the waveguide sings', p: { theory: 'layer' } },
  { name: 'A leaky layer: a breathy drone', p: { theory: 'layer', layerQ: 8 } },
  { name: 'No hiss: only the song', p: { hiss: 0 } },
];
