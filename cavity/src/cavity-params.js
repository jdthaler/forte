// cavity-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound. The cavities are scaled to sound: a key's accelerating mode is its
// note, and every key's cavity stands for a 1.3 GHz TESLA cavity, so its losses, couplers and the
// niobium's surface resistance are that cavity's.

import { VENUE } from '../../shared/chain.js';

const pct = (d) => (v) => `${(v * 100).toFixed(d)} %`;
const sec = (v) => (v < 1 ? `${(v * 1000).toFixed(0)} ms` : `${v.toFixed(v < 10 ? 2 : 1)} s`);
const sci = (v) => {
  let e = Math.floor(Math.log10(v)), m = (v / 10 ** e).toFixed(1);
  if (m === '10.0') { e++; m = '1.0'; } // 9.97×10⁸ reads 1.0×10⁹
  return `${m}×10${String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])}`;
};

export const GROUPS = [
  {
    title: 'Beam',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'The bunch charge the computer keys send through the cavity (a MIDI keyboard\'s velocity does the same). The field it leaves grows with the charge.' },
      { id: 'bunch', label: 'Bunch length', perform: true, min: 0.005, max: 0.3, def: 0.06, log: true, fmt: pct(1),
        hint: 'The bunch\'s rms length as a share of an RF period. A Gaussian bunch reaches mode f with exp(−(2π f σ)²/2): short bunches ring the higher-order modes, the bell\'s upper partials; long ones only the accelerating mode.' },
      { id: 'offset', label: 'Beam offset', perform: true, min: 0, max: 0.6, def: 0.15, step: 0.005, fmt: pct(1),
        hint: 'How far off the axis the bunch passes, as a share of the cell\'s radius. On the axis it rings only the monopole modes; off it, the dipole modes (TM110, TM111, TM120) too, which deflect the beam in a real linac. The mod wheel moves it.' },
      { id: 'beta', label: 'Particle speed (β = v/c)', min: 0.3, max: 1, def: 1, step: 0.005, fmt: (v) => `β = ${v.toFixed(3)}`,
        hint: 'The bunch\'s speed. Matched to the cells\' design speed, it crosses each cell in half a period of the accelerating mode and rings it alone; slower or faster, it falls out of step and rings the rest of the passband, which beat.' },
      { id: 'current', label: 'Beam current (held keys)', perform: true, min: 0, max: 1, def: 0, step: 0.01, fmt: pct(0),
        hint: 'While a key is held, a train of bunches follows the first. One that arrives in step with a mode builds it up (beam loading) until the losses take as much as the beam gives. Key pressure adds to it. 0: one bunch, a struck bell.' },
      { id: 'spacing', label: 'Bunch spacing', min: 1, max: 16, def: 4, step: 1, fmt: (v) => `${v.toFixed(0)} RF periods`,
        hint: 'The train\'s bunches come every this many periods of the accelerating mode, so its harmonics fall on the note: the train pulls the other modes onto them.' },
    ],
  },
  {
    title: 'Cavity',
    params: [
      { id: 'cells', label: 'Cells', min: 1, max: 12, def: 9, step: 1, fmt: (v) => `${v.toFixed(0)} cells`,
        hint: 'How many cells are coupled in a row. N cells make N modes in each passband: TESLA\'s cavity has nine. One cell is a single pillbox.' },
      { id: 'coupling', label: 'Cell-to-cell coupling', perform: true, min: 0.002, max: 0.06, def: 0.0187, log: true, fmt: pct(2),
        hint: 'How strongly neighbouring cells couple through their irises: the passband\'s width. The modes below the accelerating one spread down by about this share, and beat with it. TESLA\'s is 1.87 %.' },
      { id: 'betag', label: 'Cell design speed (β_g)', min: 0.3, max: 1, def: 1, step: 0.005, fmt: (v) => `β_g = ${v.toFixed(3)}`,
        hint: 'The speed the cells are built for: a cell is β_g λ/2 long. Shorter cells (for slow protons) push the modes with a longitudinal node (TM011, TM012) up, away from the others.' },
      { id: 'lorentz', label: 'Lorentz-force detuning', min: 0, max: 60, def: 2, step: 0.1, fmt: (v) => `${v.toFixed(1)} ¢`,
        hint: 'The field\'s radiation pressure squeezes the cells in at the equator and out at the irises, lowering every frequency in proportion to the stored energy: by this many cents at the field a full-velocity bunch leaves. A hard strike starts flat and rises to pitch as it rings down.' },
      { id: 'mech', label: 'Mechanical resonance', min: 1, max: 80, def: 12, log: true, fmt: (v) => `${v.toFixed(1)} Hz`,
        hint: 'The cavity walls\' lowest mechanical mode, which the detuning follows: a strike rings it, so the pitch wobbles at this rate as it rises.' },
    ],
  },
  {
    title: 'Couplers and cryostat',
    params: [
      { id: 'qext', label: 'Input coupler (Q_ext)', perform: true, min: 1e7, max: 1e11, def: 1e9, log: true, fmt: (v) => `Q = ${sci(v)}`,
        hint: 'How strongly the power coupler on the first cell draws energy out: the accelerating mode\'s external Q. It sets the ring time: about 5 s for C4 at 10⁹, at a constant Q, so low keys ring longer. It couples to each mode by its field in the end cell, so modes with little field there ring on.' },
      { id: 'qhom', label: 'HOM couplers (Q_ext)', min: 1e6, max: 1e11, def: 2e8, log: true, fmt: (v) => `Q = ${sci(v)}`,
        hint: 'The higher-order-mode couplers at both ends, which notch out the accelerating passband and damp the rest: the bell\'s upper partials. A mode with little field in the end cells is trapped and rings on.' },
      { id: 'release', label: 'Coupler on release (Q_ext)', min: 1e6, max: 1e9, def: 3e7, log: true, fmt: (v) => `Q = ${sci(v)}`,
        hint: 'Letting go of a key pushes the coupler\'s antenna in, so the cavity rings out at this Q (about 0.15 s for C4 at 3×10⁷). The pedal (Space) keeps the antenna back.' },
      { id: 'temp', label: 'Helium bath', perform: true, min: 1.6, max: 12, def: 2, step: 0.05, fmt: (v) => `${v.toFixed(2)} K`,
        hint: 'The niobium\'s temperature. Its surface resistance (BCS) falls as exp(−Δ/kT): at 2 K the walls hardly lose anything, at 4.2 K they shorten the ring, and above niobium\'s 9.25 K the cavity is a normal metal and only clicks.' },
      { id: 'quench', label: 'Quench field', min: 0.5, max: 6, def: 3, step: 0.01, fmt: (v) => `${v.toFixed(2)} × a bunch\'s`,
        hint: 'The field at which a cell\'s surface goes normal (a quench), in units of the field one full-velocity bunch leaves. A beam that builds a mode past it collapses the field, and the cavity stays dead until the helium has cooled it.' },
      { id: 'recovery', label: 'Recovery after a quench', min: 0.05, max: 5, def: 0.8, log: true, fmt: sec,
        hint: 'How long a quenched cavity stays normal-conducting before the helium has it superconducting again.' },
      { id: 'probe', label: 'Probes', type: 'select', def: 'ends',
        options: [['ends', 'Both ends'], ['far', 'Far end']],
        hint: 'Both ends: a field probe in each end cell, on the two channels, so modes even and odd about the middle sit apart. Far end: the transmitted-power probe alone, on both.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.3, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'TESLA nine-cell at 2 K', p: {} },
  { name: 'A single pillbox cell', p: { cells: 1 } },
  { name: 'Wide passband: strong coupling', p: { coupling: 0.05, cells: 7 } },
  { name: 'Out of step: the passband beats', p: { beta: 0.8, offset: 0.05 } },
  { name: 'Slow protons (β = 0.61)', p: { beta: 0.61, betag: 0.61, cells: 6 } },
  { name: 'No HOM couplers: a bright bell', p: { qhom: 1e11, offset: 0.35, bunch: 0.02 } },
  { name: 'Warm: liquid helium at 4.2 K', p: { temp: 4.2 } },
  { name: 'Beam loading to a quench', p: { current: 1, quench: 1.2, lorentz: 0.5, recovery: 0.6 } },
  { name: 'Lorentz detuning, ringing walls', p: { lorentz: 30, mech: 5 } },
];
