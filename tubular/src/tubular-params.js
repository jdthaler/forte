// tubular-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const sci = (v) => { const e = Math.floor(Math.log10(v)), m = v / 10 ** e; return `${m.toFixed(1)}×10${String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])}`; };
const face = (v) => (v < 300 ? 'leather-wrapped' : v < 3000 ? 'rawhide' : v < 15000 ? 'plastic' : 'brass');

export const GROUPS = [
  {
    title: 'Tubes',
    params: [
      { id: 'material', label: 'Tube metal', type: 'select', def: 'brass',
        options: [['brass', 'Brass (cartridge brass, 70/30)'], ['aluminium', 'Aluminium (6061 alloy)'], ['steel', 'Steel']],
        hint: 'What the tubes are drawn from. Each tube is cut to the length that puts its strike note on pitch, so a lighter, stiffer metal (aluminium) gives longer tubes; the overtones keep nearly the same ratios. Applies to the next strike.' },
      { id: 'diameter', label: 'Tube diameter', min: 20, max: 76, def: 38.1, step: 0.1, fmt: (v) => `${v.toFixed(1)} mm (${(v / 25.4).toFixed(2)} in)`,
        hint: 'The outside diameter, the same for every tube (1½ inches on most orchestral sets). A fatter tube is stiffer, so it is cut longer; it pushes more air, and its high modes reach the air better: a fuller, louder, shorter-lived shimmer. Applies to the next strike.' },
      { id: 'wall', label: 'Wall thickness', min: 0.5, max: 5, def: 1.6, step: 0.05, fmt: (v) => `${v.toFixed(2)} mm`,
        hint: 'A thicker wall makes a heavier tube: the air drains its energy more slowly, so it rings longer, and shear lowers its high modes a little more. Applies to the next strike.' },
      { id: 'cap', label: 'Top cap', min: 0, max: 400, def: 120, step: 1, fmt: (v) => (v < 0.5 ? 'none: an open tube' : `${v.toFixed(0)} g`),
        hint: 'The brass plug and striking ring at the top of each tube, where the mallet lands. A mass at one end lowers every mode, the low ones most, so modes 5 and 6 rise against mode 4: towards 3 and 4 times the strike note at the top of the set, a little past them at the bottom. Applies to the next strike.' },
      { id: 'eta', label: 'Internal friction η', min: 1e-5, max: 3e-3, def: 1e-4, log: true, fmt: sci,
        hint: 'The metal’s loss factor. Brass loses little; what shortens the upper modes is mostly the sound they radiate. Higher: every mode dies sooner, the low ones most.' },
      { id: 'fullRange', label: 'Full range (A0–C8)', type: 'checkbox', def: false,
        hint: 'Opens the keys beyond the orchestral C4–F5 set of 18 tubes: the same tube cut longer and longer (5 m at A0) or shorter (40 cm at C8).' },
    ],
  },
  {
    title: 'Mallet',
    params: [
      { id: 'hardness', label: 'Mallet face', perform: true, min: 50, max: 50000, def: 1500, log: true, fmt: (v) => `${v.toFixed(0)} N at 1 mm (${face(v)})`,
        hint: 'The face’s force when squashed by 1 mm (F = Kδ^1.5). A rawhide mallet is the orchestra’s; a harder face leaves the cap sooner and reaches more of the high, inharmonic modes: a brighter clang. A softer one keeps to the strike note’s modes.' },
      { id: 'mass', label: 'Mallet mass', min: 50, max: 600, def: 220, step: 1, fmt: (v) => `${v.toFixed(0)} g`,
        hint: 'A heavier mallet stays on the tube longer: a darker, rounder note, and louder for the same speed.' },
      { id: 'strike', label: 'Strike point', perform: true, min: 0, max: 0.5, def: 0, step: 0.005, fmt: (v) => (v < 0.0025 ? 'the cap' : `${(v * 100).toFixed(1)} % down the tube`),
        hint: 'Where the mallet lands, from the top. Players strike the cap, where every mode moves; lower down, each mode sounds as much as it moves there, and the ones with a node at the mallet drop out.' },
      { id: 'speedMax', label: 'Mallet speed at full velocity', min: 0.5, max: 6, def: 3, step: 0.1, fmt: (v) => `${v.toFixed(1)} m/s`,
        hint: 'The mallet’s speed for velocity 1. Faster strikes squash the face further and stiffen it: louder and brighter, not just louder.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.6, step: 0.01, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    title: 'Damper',
    params: [
      { id: 'damp', label: 'Damper felt', min: 0.05, max: 3, def: 0.4, log: true, fmt: (v) => `T₆₀ ${v < 1 ? v.toFixed(2) : v.toFixed(1)} s`,
        hint: 'The felt-lined bar on the frame that presses on every tube near its top, unless the pedal is down: how fast it stops the strike note. Space or the pedal lifts it; a held key also keeps it off its own tube.' },
      { id: 'pedalLock', label: 'Pedal held down (nothing damped)', pedal: true, perform: true, strip: true, type: 'checkbox', def: false,
        hint: 'Every tube rings until it dies away by itself, as when the player keeps a foot on the pedal.' },
    ],
  },
  {
    title: 'Listening',
    params: [
      { id: 'distance', label: 'Listening distance', min: 0.5, max: 15, def: 3, log: true, fmt: (v) => `${v.toFixed(1)} m`,
        hint: 'How far in front of the frame the two microphones stand (70 cm apart, a little below the caps). Close to it, each stretch of a tube reaches them by its own path and the low modes, whose two halves would cancel far off, are heard; far off, the air leaves mostly the modes that radiate. The level is kept the same. Applies to the next strike.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.3, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Orchestral chimes: brass tubes, rawhide mallet', p: {} },
  { name: 'Pedal down: every tube rings', p: { pedalLock: true } },
  { name: 'Plastic mallet: a brighter clang', p: { hardness: 9000, mass: 160 } },
  { name: 'Leather-wrapped mallet: the strike note alone', p: { hardness: 150, mass: 300 } },
  { name: 'No cap: an open tube', p: { cap: 0 } },
  { name: 'Heavy cap: the overtones lifted', p: { cap: 400 } },
  { name: 'Struck a third of the way down', p: { strike: 0.33 } },
  { name: 'Aluminium tubes', p: { material: 'aluminium' } },
  { name: 'Wide tubes, 2½ inches', p: { diameter: 63.5, wall: 2 } },
  { name: 'Thin walls, 0.8 mm', p: { wall: 0.8 } },
  { name: 'Close up: the player’s ears', p: { distance: 0.8 } },
  { name: 'Far off: twelve metres away', p: { distance: 12 } },
];
