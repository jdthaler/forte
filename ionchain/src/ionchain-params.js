// ionchain-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pct = (v) => `${(v * 100).toFixed(0)} %`;
const time = (v) => (v < 1 ? `${(v * 1000).toFixed(v < 0.01 ? 1 : 0)} ms` : `${v.toFixed(v < 10 ? 2 : 1)} s`);
const deg = (v) => `${v.toFixed(0)}°`;

export const GROUPS = [
  {
    title: 'Crystal',
    params: [
      { id: 'ions', label: 'Ions in the trap', perform: true, min: 1, max: 20, def: 5, step: 1, fmt: (v) => (v === 1 ? '1 ion' : `${v.toFixed(0)} ions`), hint: 'How many ions the trap holds. They push apart until the trap\'s pull balances their repulsion, and ring as a whole: one ion is a pure tone, two add the breathing mode at √3, three a mode at √(29/5), and every ion added one more mode above the rest. The key is the trap\'s axial frequency, so the chain\'s centre of mass is always the note.' },
      { id: 'aniso', label: 'Radial pull (ω_x / ω_z)', perform: true, min: 0.6, max: 20, def: 8, log: true, fmt: (v) => `ω_x = ${v.toFixed(v < 10 ? 2 : 1)} ω_z`, hint: 'How much harder the trap\'s radio-frequency field holds the ions toward the axis than the end electrodes hold them along it. Strong, and the ions sit in a line; weaker than the line\'s own push (2.5 ω_z for five ions, 3.8 for eight, 8.4 for twenty) and it buckles into a zigzag, whose modes mix the two directions: new tones appear and the old ones bend. The mod wheel weakens it from here, down to 0.6 ω_z.' },
    ],
  },
  {
    title: 'Laser kick',
    params: [
      { id: 'beam', label: 'Beam on the chain (centre to end)', perform: true, min: -1, max: 1, def: 1, step: 0.01, fmt: (v) => (Math.abs(v) < 0.005 ? 'the centre' : `${(Math.abs(v) * 100).toFixed(0)} % to the ${v > 0 ? 'right' : 'left'} end`), hint: 'Where the laser pulse crosses the chain, from its centre (0) to an end ion (±1). A pulse on one ion rings every mode that moves it: an end ion moves in all of them, the centre ion only in the symmetric ones (the centre of mass, the third mode, the fifth …), so the even ones fall silent. With an even number of ions the centre falls between two, and a narrow beam misses both.' },
      { id: 'waist', label: 'Beam waist (ion spacings)', min: 0.05, max: 20, def: 0.25, log: true, fmt: (v) => `${v.toFixed(v < 1 ? 2 : 1)} spacings`, hint: 'The beam\'s radius, in the ions\' mean spacing. Narrow, it pushes one ion; wide, it pushes them all alike, which rings only the centre of mass, since a push that is the same on every ion moves the chain as a whole (the trap is harmonic, so its centre of mass is a mode of its own, Kohn\'s theorem). The pulse gives the chain the same push however many ions it lights.' },
      { id: 'angle', label: 'Beam angle to the axis', perform: true, min: 0, max: 90, def: 30, step: 1, fmt: deg, hint: 'The direction of the push. Along the axis (0°) the beam runs down the whole line and pushes every ion alike: only the centre of mass rings. Across it (90°) the push is radial, and the radial modes, near ω_x, ring instead, heard only by an electrode off the axis or once the chain is a zigzag.' },
      { id: 'pulse', label: 'Pulse length (in the trap)', min: 0.01, max: 20, def: 0.05, log: true, fmt: (v) => `${v.toFixed(v < 1 ? 2 : 1)} µs`, hint: 'How long the pulse pushes, in the trap\'s own time (heard 1000 times longer). A pulse short against a mode\'s period kicks it fully; one that lasts half a period or more pushes and pulls it back and leaves it nearly still. Longer pulses keep the low modes and drop the high ones, as a soft mallet does.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'How hard the computer keys kick. The chain is linear for small kicks, so this is how loud, not what you hear.' },
    ],
  },
  {
    title: 'Electrodes',
    params: [
      { id: 'distance', label: 'Electrode distance (× the chain)', min: 1.15, max: 100, def: 2, log: true, fmt: (v) => `${v.toFixed(v < 10 ? 2 : 0)} × the chain`, hint: 'How far the two pickup electrodes are from the trap\'s centre, in the farthest ion\'s distance from it. The current an ion\'s motion drives in an electrode follows the field the electrode would make at the ion (Shockley–Ramo): far away that field is the same on every ion and only the centre of mass is heard, a pure tone, as in real traps whose endcaps are hundreds of µm away. Close, the field grows toward the nearer end and the other modes come in.' },
      { id: 'side', label: 'Electrode angle off the axis', min: 0, max: 90, def: 0, step: 1, fmt: deg, hint: 'Where the electrodes sit: on the axis beyond the ends (0°, the endcaps) or beside the chain\'s middle (90°). On the axis they hear the motion along it; beside it, the radial modes, and of the axial ones only those that tilt the chain, not its centre of mass. Each electrode is a channel: left and right.' },
      { id: 'resist', label: 'Resistive cooling (one ion)', min: 0.5, max: 120, def: 20, log: true, fmt: time, hint: 'The image current flows through the amplifier\'s resistor, which takes energy from the motion it hears (Wineland and Dehmelt): this is the time it would take one ion\'s motion to fall by e. Modes the electrodes hear well die fastest, and N ions moving together N times faster; modes they cannot hear ring on while the key is held.' },
    ],
  },
  {
    title: 'Cooling',
    params: [
      { id: 'cool', label: 'Laser cooling (key up)', min: 0.01, max: 5, def: 0.3, log: true, fmt: time, hint: 'When the key comes up the cooling laser comes on and Doppler cooling slows every ion it lights: the time for its motion to fall by e. While a key is held, or Space or the pedal holds it, the cooling stays off.' },
      { id: 'coolOn', label: 'Cooling beam on', type: 'select', def: 'all', options: [['all', 'Every ion'], ['end', 'The end ion only (sympathetic cooling)']], hint: 'Cool every ion, or only the end one, as when one ion of another species cools the rest. Then each mode cools as much as it moves that ion, so modes in which the end ion barely moves ring on long after the others.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.25, step: 0.01, fmt: pct },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Five calcium ions, the end one kicked', p: {} },
  { name: 'One ion: a pure tone', p: { ions: 1 } },
  { name: 'Two ions: 1 and √3', p: { ions: 2 } },
  { name: 'Three ions: 1, √3 and √(29/5)', p: { ions: 3 } },
  { name: 'The centre ion kicked: the even modes fall silent', p: { ions: 7, beam: 0 } },
  { name: 'A beam along the axis: the centre of mass alone', p: { angle: 0 } },
  { name: 'Far electrodes, as in a real trap: the centre of mass alone', p: { distance: 60 } },
  { name: 'Twelve ions, a long pulse', p: { ions: 12, pulse: 1 } },
  { name: 'Twenty ions', p: { ions: 20, aniso: 12, distance: 1.4 } },
  { name: 'A zigzag of eight ions', p: { ions: 8, aniso: 3.2, angle: 50 } },
  { name: 'Electrodes beside the chain: the radial modes', p: { side: 90, angle: 75, aniso: 3 } },
  { name: 'Sympathetic cooling: only the end ion cooled', p: { ions: 8, coolOn: 'end', cool: 0.15 } },
];
