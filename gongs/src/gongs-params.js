// gongs-params.js — the knobs. Every parameter has a physical meaning and a
// unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';

const sci = (v) => { const e = Math.floor(Math.log10(v)), m = v / 10 ** e; return `${m.toFixed(1)}×10${String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])}`; };
const mpa = (v) => (v < 1 ? `${(v * 1000).toFixed(0)} kPa` : v < 1000 ? `${v.toPrecision(2)} MPa` : `${(v / 1000).toFixed(1)} GPa`);

export const GROUPS = [
  {
    title: 'Gong',
    params: [
      { id: 'material', label: 'Material', type: 'select', def: 'bronze', options: [['bronze', 'Bell bronze'], ['steel', 'Steel'], ['aluminium', 'Aluminium']],
        hint: 'Sets the wave speed (so the size for each pitch), the mass, and the thermoelastic loss. Steel is stiffer, so the same strike is less nonlinear.' },
      { id: 'thick', label: 'Thickness / radius h/a', min: 0.003, max: 0.03, def: 0.01, log: true, fmt: (v) => `${(v * 1000).toFixed(1)} ‰`,
        hint: 'Thinner gongs bend further, in thicknesses, for the same strike: the nonlinearity grows as (a/h)². Tam-tams are ~4 ‰.' },
      { id: 'rise', label: 'Dome rise (curvature)', perform: true, min: 0, max: 4, def: 0.4, step: 0.05, fmt: (v) => (v ? `${v.toFixed(2)} h` : 'flat'),
        hint: 'A shallow spherical cap, rising this many thicknesses at the rim. Flat plates stiffen when struck hard (pitch glides down); domes above ~0.7 h soften (pitch glides up).' },
      { id: 'bc', label: 'Rim', type: 'select', def: 'free', options: [['free', 'Free (hanging gong)'], ['clamped', 'Clamped (held, free to slide in its plane)']],
        hint: 'Free: the gong hangs on cords. Clamped: the rim cannot move or tilt, but, as in the free gong, it may slide in its own plane; so it is less nonlinear than a plate held fast in a frame, which would stretch about three times as much.' },
      { id: 'eta', label: 'Internal friction η', min: 1e-5, max: 1e-2, def: 1.5e-4, log: true, fmt: sci,
        hint: 'Material loss factor, the same at every frequency. Thermoelastic and radiation losses are added on top (see the mode table).' },
      { id: 'thermal', label: 'Thermoelastic loss', min: 0, max: 2, def: 1, step: 0.05, fmt: (v) => `${v.toFixed(2)} ×`,
        hint: 'Heat flows from the compressed to the stretched face of the bending plate. It peaks near π²D/h² and so is strongest for thin plates: it is why the small, high gongs ring short.' },
      { id: 'radiation', label: 'Radiation loss', min: 0, max: 3, def: 1, step: 0.05, fmt: (v) => `${v.toFixed(2)} ×`,
        hint: 'Sound radiated by the plate is energy lost. It grows with frequency, so the shimmer dies before the hum.' },
    ],
  },
  {
    title: 'Mallet',
    params: [
      { id: 'hardness', label: 'Head stiffness', perform: true, min: 0.1, max: 3000, def: 4, log: true, fmt: mpa,
        hint: 'Young’s modulus of the mallet head: soft yarn ~0.3 MPa, felt ~2 MPa, rubber ~10 MPa, plastic or wood ~2 GPa. Harder heads touch for less time and reach higher modes directly.' },
      { id: 'mass', label: 'Mallet mass', min: 0.01, max: 0.3, def: 0.06, log: true, fmt: (v) => `${(v * 100).toFixed(1)} % of the gong`,
        hint: 'A heavier mallet stays on longer and pushes more energy in.' },
      { id: 'strike', label: 'Strike point', perform: true, min: 0, max: 0.95, def: 0.1, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of the radius`,
        hint: 'At the centre only the axisymmetric modes ring (one clear tone); towards the rim the asymmetric modes, the lower (2,0) among them, join in.' },
      { id: 'speed', label: 'Strike speed at full velocity', min: 0.5, max: 12, def: 9, log: true, fmt: (v) => `${v.toFixed(1)} m/s`,
        hint: 'Impact speed for velocity 1 (it goes as velocity²). The deflection in thicknesses, and so the nonlinearity, scales with it.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, min: 0.05, max: 1, def: 0.6, step: 0.01, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'listen', label: 'Microphone distance', min: 0, max: 1, def: 0.6, step: 0.01, fmt: (v) => (v < 0.1 ? 'touching (plate motion)' : v > 0.9 ? 'room (radiated power)' : `${(100 * v).toFixed(0)} % of the way out`),
        hint: 'Close up you hear the plate’s motion, ruled by its strike tone. Out in the room you hear what it radiates, and a gong smaller than the wavelength radiates its low modes poorly: the high modes, and the crash, come forward.' },
      { id: 'release', label: 'Hand damping on release', perform: true, min: 0.1, max: 30, def: 2.5, log: true, fmt: (v) => `T₆₀ ${v.toFixed(1)} s`,
        hint: 'A hand on the gong when the key is let go (Space or the pedal holds it off). MIDI aftertouch presses harder.' },
      { id: 'nlvoices', label: 'Nonlinear voices', min: 1, max: 16, def: 4, step: 1, fmt: (v) => `${v.toFixed(0)} at once`,
        hint: 'How many gongs may run their (costly) nonlinear coupling at once; beyond that the least nonlinear one rings on linearly. Lower it if a tablet crackles, raise it on a fast computer.' },
      { id: 'terms', label: 'Coupling terms', min: 200, max: 2000, def: 600, step: 50, log: true, fmt: (v) => `${v.toFixed(0)}`,
        hint: 'How many of the strongest von Kármán coupling terms are kept. More is more accurate turbulence, and more CPU.' },
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.3, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Bronze gong: bell when soft, crash when hard', p: {} },
  { name: 'Tam-tam: thin, big soft beater, off centre', p: { thick: 0.004, mass: 0.15, hardness: 1, strike: 0.3, speed: 4 } },
  { name: 'Opera gong, pitch bends up (2.5 h dome, centre)', p: { rise: 2.5, strike: 0.03 } },
  { name: 'Opera gong, pitch bends down (flat, centre)', p: { rise: 0, strike: 0.03, speed: 5.5 } },
  { name: 'Thick bronze: stays linear (a bell plate)', p: { thick: 0.03 } },
  { name: 'Steel sheet struck near the rim', p: { material: 'steel', thick: 0.005, strike: 0.75, hardness: 300 } },
  { name: 'Clamped rim (held, free to slide in its plane)', p: { bc: 'clamped', strike: 0.2 } },
  { name: 'Struck dead centre (no asymmetric modes)', p: { strike: 0 } },
];
