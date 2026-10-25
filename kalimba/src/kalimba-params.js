// kalimba-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const ms = (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} ms`;
const thumb = (v) => (v < 0.3 ? 'thumbnail' : v < 1.5 ? 'nail and flesh' : 'flesh');

export const GROUPS = [
  {
    title: 'Tines',
    params: [
      { id: 'back', label: 'Back length (clamp to bridge)', min: 0, max: 1.5, def: 1.12, step: 0.01, fmt: (v) => (v === 0 ? 'none: clamped at the bridge' : `${(v * 100).toFixed(0)} % of the front`),
        hint: 'Each tine is clamped under a bar, rests on the bridge and is free at the tip. The part behind the bridge vibrates too, and its length relative to the front sets the overtones: clamped right at the bridge, the first overtone is 6.27 times the fundamental; at the default it is 5.6, in the 5.3–5.9 Chapman measured on a kalimba; equal lengths put the third mode on exactly the 9th harmonic. Applies to the next pluck.' },
      { id: 'thick', label: 'Tine thickness', min: 0.6, max: 2.5, def: 1.2, step: 0.05, fmt: (v) => `${v.toFixed(2)} mm`,
        hint: 'Spring steel, 5 mm wide. A thicker tine is cut longer for the same note and is stiffer: the thumb’s 3 mm push takes more force, and puts more into the box (up to the 8 N a thumb gives, which the short treble tines need anyway). Thicker tines sound louder in the bass and set the caps buzzing sooner.' },
      { id: 't60', label: 'Ring time (C4 fundamental)', min: 0.5, max: 30, def: 6, log: true, fmt: (v) => `${v < 10 ? v.toFixed(1) : v.toFixed(0)} s`,
        hint: 'Time for C4’s fundamental to fall 60 dB, with nothing touching the tine.' },
      { id: 'damping', label: 'Damping vs frequency', min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `σ ∝ f^${v.toFixed(2)}`,
        hint: 'How much faster higher frequencies die, across the modes of one tine and from tine to tine: the overtones fade within a fraction of a second while the fundamental sings on.' },
      { id: 'fullRange', label: 'Full range (A0–C8)', type: 'checkbox', def: false,
        hint: 'Opens the keys beyond C4–E6, the span of a 17-tine kalimba: tines of the same steel, cut longer down to A0 (a bass box’s tongues) and shorter up to C8.' },
    ],
  },
  {
    title: 'Thumb',
    params: [
      { id: 'pluck', label: 'Pluck point', min: 0.3, max: 1, def: 0.9, step: 0.005, fmt: (v) => `${(v * 100).toFixed(1)} % of the front from the bridge`,
        hint: 'Where the thumb pushes the tine down. Near the tip the fundamental dominates; closer to the bridge the overtones speak more. On a mode’s node it stays silent.' },
      { id: 'thumb', label: 'Release', min: 0.05, max: 5, def: 0.6, log: true, fmt: (v) => `${ms(v)} (${thumb(v)})`,
        hint: 'How long the thumb takes to let go. A nail flicks off at once and every mode rings: a bright ping. Soft flesh rolls off slowly and cannot reach modes above about 1.5 / release time.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2) },
      { id: 'ring', label: 'Let the tines ring', perform: true, strip: true, type: 'checkbox', def: true,
        hint: 'A kalimba has no dampers: every tine rings until it dies away. Off, releasing a key lays a fingertip on its tine (unless Space or the pedal is down).' },
    ],
  },
  {
    title: 'Box',
    params: [
      { id: 'box', label: 'Box size (volume)', min: 0.2, max: 30, def: 0.88, log: true, fmt: (v) => `${v < 10 ? v.toFixed(2) : v.toFixed(1)} L`,
        hint: 'The hollow box under the tines, its top and walls scaled with it. A bigger box has a lower top and a lower air resonance: more body under the low notes.' },
      { id: 'hole', label: 'Sound hole', min: 0, max: 100, def: 25, step: 1, fmt: (v) => (v === 0 ? 'none' : `${v.toFixed(0)} mm across`),
        hint: 'The air in the hole bounces on the air in the box (a Helmholtz resonator) and pairs with the top’s first mode: two resonances, the lower one boosting the low tines. Smaller holes tune it down.' },
      { id: 'cover', label: 'Hole covered', perform: true, min: 0, max: 1, def: 0, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %`,
        hint: 'A finger over the hole, as kalimba players do for a wah: covering it tunes the air resonance down until it vanishes and the top alone is left. The mod wheel moves it.' },
      { id: 'buzz', label: 'Buzzers (bottle caps)', min: 0, max: 8, def: 0, step: 1, fmt: (v) => (v === 0 ? 'none' : `${v.toFixed(0)} cap${v === 1 ? '' : 's'}`),
        hint: 'Loose caps on the top, as on an mbira. A cap stays put until the top under it accelerates downward faster than gravity; then it flies, lands and rattles. Soft notes leave them silent; loud ones buzz.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.25, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Box kalimba', p: {} },
  { name: 'Thumbnail ping', p: { thumb: 0.08 } },
  { name: 'Soft thumb, hole half covered', p: { thumb: 2.5, cover: 0.5 } },
  { name: 'Mbira with bottle caps', p: { buzz: 5, box: 6, hole: 90, thick: 1.4, t60: 8 } },
  { name: 'Marimbula (bass box)', p: { box: 25, hole: 90, thick: 2.5, t60: 10, fullRange: true } },
  { name: 'Clamped at the bridge (6.27)', p: { back: 0 } },
  { name: 'Back as long as the front (9th harmonic)', p: { back: 1 } },
  { name: 'Plucked on the first overtone’s node', p: { pluck: 0.71 } },
];
