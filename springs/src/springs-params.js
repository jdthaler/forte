// springs-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint
// says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const sci = (v) => { const e = Math.floor(Math.log10(v)), m = v / 10 ** e; return `${m.toFixed(1)}×10${String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])}`; };
const times = (v) => `× ${v.toFixed(2)}`;

export const GROUPS = [
  {
    title: 'Springs',
    params: [
      { id: 'springs', label: 'Springs per key', perform: true, min: 1, max: 3, def: 2, step: 1, fmt: (v) => (v === 1 ? 'one spring' : `${v} springs in parallel`),
        hint: 'As in a reverb tank: the springs are cut a little apart, so their echoes drift out of step and blur into a wash.' },
      { id: 'spread', label: 'Length difference', min: 0, max: 6, def: 1.5, step: 0.1, fmt: (v) => `${v.toFixed(1)} %`,
        hint: 'How much neighbouring springs differ in length, centred on the note. Their notes and echoes part by as much.' },
      { id: 'family', label: 'Spring', type: 'select', def: 'tuned', options: [['tuned', 'Tuned: each spring cut to its note'], ['slinky', 'Slinky: a wide, slack coil (pitch approximate)']],
        hint: 'Tuned springs echo at the note, with chirps riding up to F_C. A Slinky’s F_C lies below hearing: every echo is a falling whistle, hundreds of ms long, and the key sets its length.' },
    ],
  },
  {
    title: 'Coil',
    params: [
      { id: 'coil', label: 'Coil radius', min: 0.5, max: 2, def: 1, log: true, fmt: times,
        hint: 'Wider coils (same wire) bring the transition F_C ∝ r/R² down: the chirps top out lower and linger. Each spring is recut to stay on its note.' },
      { id: 'wire', label: 'Wire diameter', min: 0.5, max: 2, def: 1, log: true, fmt: times,
        hint: 'Thicker wire is stiffer in bending: F_C ∝ r rises and the waves run faster, so the spring is cut longer for the same note.' },
      { id: 'helix', label: 'Helix angle', min: 1, max: 20, def: 3, step: 0.1, fmt: (v) => `${v.toFixed(1)}°`,
        hint: 'How steeply the coil climbs. Steeper coils couple the turning and the stretching waves: the chirps split in two and F_C moves.' },
      { id: 'drive', label: 'Beads driven', type: 'select', def: 'rotation', options: [['rotation', 'in rotation (a reverb tank’s)'], ['axial', 'along the axis']],
        hint: 'What the transducers turn or push: the spring’s turning wave or its stretching (slinky) wave, about a tone slower.' },
    ],
  },
  {
    title: 'Damping',
    params: [
      { id: 'endLoss', label: 'Mounts: loss per reflection', perform: true, min: 0.005, max: 1, def: 0.06, log: true, fmt: (v) => `${v < 0.1 ? v.toFixed(3) : v.toFixed(2)} dB`,
        hint: 'What the beads’ mounts absorb each time a wave reaches an end. The low notes ring longest; near F_C the waves crawl and are hardly damped.' },
      { id: 'eta', label: 'Steel’s internal friction', min: 1e-5, max: 3e-3, def: 2e-4, log: true, fmt: sci,
        hint: 'Loss factor η, σ = πfη: the high modes die first.' },
      { id: 'oil', label: 'Oil bath', min: 0, max: 30, def: 0, step: 0.1, fmt: (v) => (v === 0 ? 'none (air)' : `σ = ${v.toFixed(1)} s⁻¹ (T₆₀ ${(6.91 / v).toFixed(2)} s)`),
        hint: 'Hammond hung his springs in oil: viscous drag damps every mode alike.' },
      { id: 'hand', label: 'Hand on the spring', perform: true, min: 0, max: 1, def: 0, step: 0.01, fmt: (v) => (v === 0 ? 'off' : `${(v * 100).toFixed(0)} % (σ = ${(60 * v * v).toFixed(1)} s⁻¹)`),
        hint: 'A palm resting on the coils. The mod wheel moves it.' },
      { id: 'damper', label: 'Damper', min: 0.05, max: 5, def: 0.3, log: true, fmt: (v) => `T₆₀ ${v.toFixed(2)} s`,
        hint: 'A felt pad that falls on the springs when the key comes up (Space or the pedal holds it off).' },
    ],
  },
  {
    title: 'Mallet and beads',
    params: [
      { id: 'mallet', label: 'Mallet contact', perform: true, min: 0.05, max: 5, def: 0.35, log: true, fmt: (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} ms`,
        hint: 'How long the mallet stays on the bead (at mf; shorter when struck harder). A short tap reaches the chirps up to F_C; a soft one only the low echoes.' },
      { id: 'bead', label: 'Bead inertia', min: 0.3, max: 30, def: 1, log: true, fmt: (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} % of the spring’s`,
        hint: 'A light bead passes the high modes in and out; a heavy one, on a soft mount, keeps only the low ones (corner ≈ f₀/πμ).' },
      { id: 'velocity', label: 'Velocity (computer keys)', min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.15, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Two springs per key', p: {} },
  { name: 'One spring: bare echoes', p: { springs: 1 } },
  { name: 'Three springs cut apart: a tank’s wash', p: { springs: 3, spread: 3 } },
  { name: 'Hammond’s oil bath', p: { oil: 6, endLoss: 0.1 } },
  { name: 'Light beads, stiff mounts: bright and long', p: { bead: 0.3, endLoss: 0.012, eta: 6e-5 } },
  { name: 'Heavy beads, soft mounts: dark and short', p: { bead: 6, endLoss: 0.3 } },
  { name: 'Wide coils: the chirps come down', p: { coil: 1.7, springs: 1 } },
  { name: 'Steep helix: the chirps split', p: { helix: 15, springs: 1 } },
  { name: 'Driven along the axis', p: { drive: 'axial' } },
  { name: 'Soft mallet: only the low echoes', p: { mallet: 2 } },
  { name: 'Slinky: falling whistles', p: { family: 'slinky', springs: 1, helix: 6, endLoss: 0.02, eta: 5e-5, mallet: 0.5, damper: 2 } },
];
