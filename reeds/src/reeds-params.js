// reeds-params.js — the knobs. Every parameter has a physical meaning and a
// unit; the hint says what it does to the sound.

import { HAMMER_VMAX } from './reeds-model.js';

const mm = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} mm`;
const pct = (v) => `${(v * 100).toFixed(0)} %`;

export const GROUPS = [
  {
    title: 'Reed and hammer',
    params: [
      { id: 'solder', label: 'Solder mass', min: 0.05, max: 5, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)}`, hint: 'The tuning blob at the tip. The reed is re-cut to stay in pitch: a heavier blob makes a shorter, stiffer reed that the hammer swings less (quieter, less bark), pushes the overtones up and hides them from the pickup, and shortens the sustain. Applies to new notes.' },
      { id: 'strike', label: 'Strike point', min: 0.1, max: 0.9, def: 0.4, step: 0.005, fmt: (v) => `${(v * 100).toFixed(1)} % of length`, hint: 'Measured from the clamp. Nearer the tip: a bigger swing, more bark. Near the clamp: a small swing with relatively more overtone. On an overtone\'s node: that overtone is left out. Applies to new notes.' },
      { id: 'hardness', label: 'Hammer felt hardness', min: 0.1, max: 10, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)}`, hint: 'Harder felt: shorter contact, brighter attack, more overtone. Applies to new notes.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, min: 0.05, max: 1, def: 0.6, step: 0.01, fmt: (v) => `${v.toFixed(2)}  (${(HAMMER_VMAX * v).toFixed(1)} m/s)` },
    ],
  },
  {
    title: 'Electrostatic pickup',
    params: [
      { id: 'offset', label: 'Reed height in the slot', min: -2, max: 2, def: 0.3, step: 0.01, fmt: mm, hint: 'Rest height of the reed above the comb\'s mid-plane. Off-centre the swing is lopsided on C(y): even harmonics, the bark. Centred, C(y) is symmetric: the fundamental cancels and the octave remains.' },
      { id: 'gap', label: 'Gap to the comb', min: 0.1, max: 1.5, def: 0.3, log: true, fmt: (v) => `${v.toFixed(2)} mm`, hint: 'Side clearance between reed and slot. Narrower is much louder (C level with the comb grows ×6 from 1.5 to 0.1 mm) and drives the preamp harder; the shape of C(y), and so the bark, changes little.' },
      { id: 'bias', label: 'Comb voltage', min: 10, max: 600, def: 150, log: true, fmt: (v) => `${v.toFixed(0)} V`, hint: 'Signal ∝ V. The field also pulls on the reed, a spring −½V²C″, but it is weak: 0.02 ¢ at 150 V, under half a cent at 600 V. Near 1.5 kV a 0.3 mm air gap would arc.' },
      { id: 'rbias', label: 'Feed resistor', min: 0.2, max: 200, def: 22, log: true, fmt: (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(0)} MΩ`, hint: 'With C₀ = 200 pF it sets the node\'s corner 1/2πRC₀. Large R: constant charge, output follows C(y). Small R: constant voltage, output follows dC/dt (thin bass, edgy top).' },
    ],
  },
  {
    title: 'Preamp, tremolo and speakers',
    params: [
      { id: 'drive', label: 'Preamp drive', perform: true, min: 0, max: 1, def: 0.35, step: 0.01, fmt: pct, hint: 'How hard the pickup signal pushes the preamp transistor. It clips softly and asymmetrically: grit on hard chords.' },
      { id: 'tremDepth', label: 'Tremolo depth', perform: true, min: 0, max: 1, def: 0, step: 0.01, fmt: pct, hint: 'An oscillator lights an LED; a photocell beside it shunts the preamp signal. Fast to light, slow to go dark: a lopsided throb.' },
      { id: 'tremRate', label: 'Tremolo rate', perform: true, min: 2, max: 10, def: 5.6, step: 0.05, fmt: (v) => `${v.toFixed(2)} Hz` },
      { id: 'output', label: 'Output', perform: true, type: 'select', def: 'speaker', options: [['speaker', 'Built-in speakers (two 4"×8")'], ['direct', 'Direct out (preamp)']], hint: 'The small open-backed speakers drop the lowest fundamentals and add a cone break-up peak near 2.6 kHz.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.2, step: 0.01, fmt: pct },
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: '200A as voiced', p: {} },
  { name: 'Tremolo through the speakers', p: { tremDepth: 0.65 } },
  { name: 'Direct out, clean', p: { output: 'direct', drive: 0.1 } },
  { name: 'Reed centred in the slot (octave)', p: { offset: 0 } },
  { name: 'Reed riding high (thin, clean)', p: { offset: 1.2 } },
  { name: 'Heavy solder (short reeds, sweet, short sustain)', p: { solder: 3 } },
  { name: 'Light solder (long reeds, more bark)', p: { solder: 0.15 } },
  { name: 'Constant-voltage pickup (1 MΩ feed)', p: { rbias: 1 } },
  { name: 'Barking: tight gap, pushed preamp', p: { gap: 0.18, offset: 0.25, drive: 0.8, hardness: 2 } },
];
