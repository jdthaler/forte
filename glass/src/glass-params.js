// glass-params.js — the knobs. Every parameter has a physical meaning and a
// unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pct = (v) => `${(v * 100).toFixed(0)} %`;

export const GROUPS = [
  {
    title: 'Finger',
    params: [
      { id: 'press', label: 'Finger pressure', perform: true, min: 0.1, max: 20, def: 6, log: true, fmt: (v) => `${v.toFixed(1)} × speaking threshold`, hint: 'Normal force, as a multiple of each bowl\'s threshold (velocity scales it 0.6–1.4×). Below 1 the skin just slides; above, the bowl swells in faster the harder you press; far above, the skin squeals in the higher modes. MIDI aftertouch presses harder.' },
      { id: 'wet', label: 'Skin moisture', perform: true, min: 0, max: 1, def: 0.85, step: 0.01, fmt: (v) => `${v < 0.25 ? 'dry' : v < 0.6 ? 'damp' : 'wet'} · ${pct(v)}`, hint: 'Wet skin on clean glass grabs: its friction falls steeply with slip speed. Dry fingers only whisper.' },
      { id: 'v0', label: 'Stribeck speed v₀', min: 0.05, max: 2, def: 0.5, log: true, fmt: (v) => `${(v * 100).toFixed(0)} cm/s`, hint: 'Slip speed over which wet-skin friction falls from static to sliding. The rims move at 10–40 cm/s.' },
      { id: 'rough', label: 'Skin ridges (friction noise)', min: 0, max: 0.1, def: 0.02, step: 0.001, fmt: pct, hint: 'Random friction from fingerprint ridges passing the rim: a breath of hiss, and the seed each note grows from. For wet skin; drier ridges catch more (up to 6×).' },
      { id: 'velocity', label: 'Velocity (computer keys)', min: 0.05, max: 1, def: 0.6, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'How firmly the finger lands.' },
    ],
  },
  {
    title: 'Spindle',
    params: [
      { id: 'speed', label: 'Treadle speed', perform: true, min: 0.1, max: 3, def: 0.5, log: true, fmt: (v) => `${v.toFixed(2)} rev/s · ${(v * 60).toFixed(0)} rpm`, hint: 'Rim speed under the finger (how loud a bowl can sing) and the warble rate. Too fast and the big bowls cannot hold their pattern still.' },
      { id: 'treadle', label: 'Treadle unevenness', min: 0, max: 0.3, def: 0.06, step: 0.005, fmt: pct, hint: 'Speed swing once per turn from the foot\'s push, smoothed by the flywheel.' },
    ],
  },
  {
    title: 'Glass',
    params: [
      { id: 'split', label: 'Doublet split (irregularity)', min: 0, max: 40, def: 12, step: 0.1, fmt: (v) => `${v.toFixed(1)} ¢`, hint: 'Uneven walls split each mode in two. Turning under the finger, the bowl offers it each in turn: a warble of ±half the split at 4× the rotation rate.' },
      { id: 'loss', label: 'Glass loss factor', min: 3e-5, max: 3e-3, def: 4e-4, log: true, fmt: (v) => `η = ${(v * 1e4).toFixed(1)}·10⁻⁴ (Q ${(1 / v).toFixed(0)})`, hint: 'Internal friction of the glass: how long a bowl rings after the finger lifts.' },
      { id: 'water', label: 'Water in the bowls', min: 0, max: 0.8, def: 0, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of the depth`, hint: 'Liquid moving with the wall lowers every bowl (French 1983), most when filled near the rim. Nothing retunes. Very full bowls jump to the (3,0) mode.' },
      { id: 'fullRange', label: 'Full range (A0–C8)', type: 'checkbox', def: false,
        hint: 'Opens the keys beyond the F3–A6 compass: Franklin’s scale of bowls carried on, down to a 15-inch bowl at A0 and up to a 1.7-inch one at C8, each walled to sound its note.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.3, step: 0.01, fmt: pct },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Franklin\'s armonica', p: {} },
  { name: 'Perfect bowls, even treadle (no warble)', p: { split: 0, treadle: 0 } },
  { name: 'Lazy treadle (slow warble)', p: { speed: 0.25 } },
  { name: 'Fast treadle (big bowls struggle)', p: { speed: 1.2 } },
  { name: 'Badly blown bowls (deep warble)', p: { split: 30 } },
  { name: 'Dry fingers (no grip)', p: { wet: 0.1 } },
  { name: 'Pressing hard (the skin squeals)', p: { press: 10 } },
  { name: 'Bowls half full of water', p: { water: 0.5 } },
  { name: 'Lead crystal (rings for ages)', p: { loss: 1e-4 } },
];
