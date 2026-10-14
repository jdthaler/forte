// sync-params.js — knobs for the Huygens keyboard.
//
// kind: 'engine' → audio thread; 'tune' → recompute each key's design
// frequency; 'mix' → Web Audio graph.

import { PC } from './tuning.js';

const cents = (v) => `${v.toFixed(1)} ¢`;

export const GROUPS = [
  {
    id: 'coupling', title: 'Coupling',
    params: [
      { id: 'kick', label: 'Pulse coupling', perform: true, kind: 'engine', min: 0, max: 0.15, step: 0.001, def: 0.055,
        fmt: (v) => (v === 0 ? 'off' : `${(v * 100).toFixed(1)} % of swing`),
        hint: 'How far a lamp’s discharge lifts the voltage across the others (shared cathode resistor). Minor sixths need 5.2 %, but above 4.6 % a bare semitone merges into one pitch. ↑/↓ or MIDI mod wheel.' },
      { id: 'rSrc', label: 'Rail-sag coupling', kind: 'engine', min: 0, max: 200e3, step: 1000, def: 0,
        fmt: (v) => (v === 0 ? 'off' : `${(v / 1000).toFixed(0)} kΩ`),
        hint: 'Slow coupling through the shared supply’s source resistance. Weak — compare it with the pulses.' },
      { id: 'pitchHold', label: 'Pitch-hold supply servo', kind: 'engine', type: 'checkbox', def: true,
        hint: 'Pulses only advance lamps, so locked chords run sharp. The servo trims the supply voltage, which scales every period equally.' },
    ],
  },
  {
    id: 'tuning', title: 'Design tuning',
    params: [
      { id: 'tuning', label: 'Tuned to', perform: true, kind: 'tune', type: 'select', def: 'et',
        options: [['et', 'Equal temperament'], ['just', '5-limit just (fixed tonic)']] },
      { id: 'tonic', label: 'Just tonic', perform: true, kind: 'tune', type: 'select', def: 0, options: PC.map((n, i) => [i, n]), showIf: (P) => P.tuning === 'just' },
      { id: 'mistune', label: 'Random mistuning', kind: 'tune', min: 0, max: 40, step: 0.5, def: 0, fmt: cents,
        hint: 'Each key off by a fixed random amount. Coupling captures them anyway.' },
      { id: 'drift', label: 'Resistor drift', kind: 'engine', min: 0, max: 20, step: 0.5, def: 0, fmt: cents,
        hint: 'Slow random wander of each oscillator. Locked chords ride it out together.' },
      { id: 'driftRate', label: 'Drift rate', kind: 'engine', min: 0.05, max: 2, def: 0.25, log: true, fmt: (v) => `${v.toFixed(2)} Hz` },
    ],
  },
  {
    id: 'circuit', title: 'Oscillator circuit',
    params: [
      { id: 'vNom', label: 'Supply voltage', kind: 'engine', min: 100, max: 400, step: 1, def: 150, fmt: (v) => `${v.toFixed(0)} V`,
        hint: 'Higher supply → straighter ramp (more sawtooth-like).' },
      { id: 'vStrike', label: 'Lamp striking voltage', kind: 'engine', min: 70, max: 110, step: 0.5, def: 90, fmt: (v) => `${v.toFixed(1)} V` },
      { id: 'vExt', label: 'Lamp extinction voltage', kind: 'engine', min: 40, max: 85, step: 0.5, def: 60, fmt: (v) => `${v.toFixed(1)} V` },
      { id: 'attack', label: 'Key attack', perform: true, kind: 'engine', min: 0.001, max: 0.3, def: 0.004, log: true, fmt: (v) => `${(v * 1000).toFixed(0)} ms` },
      { id: 'release', label: 'Key release', perform: true, kind: 'engine', min: 0.005, max: 1, def: 0.03, log: true, fmt: (v) => `${(v * 1000).toFixed(0)} ms` },
    ],
  },
  {
    id: 'sound', title: 'Sound',
    params: [
      { id: 'tone', label: 'Tone (low-pass)', perform: true, kind: 'mix', min: 300, max: 16000, def: 2500, log: true, fmt: (v) => `${(v / 1000).toFixed(1)} kHz` },
      { id: 'body', label: 'Resonant body', kind: 'mix', min: 0, max: 1, step: 0.01, def: 0.5, fmt: (v) => v.toFixed(2) },
      { id: 'room', label: 'Room', perform: true, kind: 'mix', min: 0, max: 1, step: 0.01, def: 0.3, fmt: (v) => v.toFixed(2) },
      { id: 'width', label: 'Stereo spread', kind: 'engine', min: 0, max: 1, step: 0.01, def: 0.5, fmt: (v) => v.toFixed(2) },
      { id: 'volume', label: 'Volume', perform: true, kind: 'mix', min: 0, max: 2, step: 0.01, def: 0.7, fmt: (v) => v.toFixed(2) },
    ],
  },
];

export const ALL_PARAMS = GROUPS.flatMap((g) => g.params);
export const DEFAULTS = Object.fromEntries(ALL_PARAMS.map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Default (5.5%): triads lock just in every voicing; bare semitones merge', p: {} },
  { name: 'Uncoupled: plain equal temperament', p: { kick: 0 } },
  { name: 'Barely coupled (1%): octaves, fifths, fourths lock; thirds beat', p: { kick: 0.01 } },
  { name: 'Weaker (4.5%): semitones stay apart, minor sixths miss 8:5', p: { kick: 0.045 } },
  { name: 'Strong (7%): minor 7th → 7:4, semitones merge', p: { kick: 0.07 } },
  { name: 'Very strong (11%): minor 6ths collapse into fifths', p: { kick: 0.11 } },
  { name: 'Badly tuned, rescued by coupling', p: { mistune: 25, kick: 0.06 } },
  { name: 'Drifting resistors, held together', p: { drift: 12, driftRate: 0.4, kick: 0.05 } },
  { name: 'Just-tuned in C, no coupling (compare)', p: { tuning: 'just', tonic: 0, kick: 0 } },
  { name: 'Rail sag only (slow, weak coupling)', p: { kick: 0, rSrc: 150e3 } },
];
