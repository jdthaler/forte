// steelpan-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const ms = (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} ms`;
const s = (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} s`;

export const GROUPS = [
  {
    title: 'Note areas',
    params: [
      { id: 'tuning', label: 'Tuning', type: 'select', def: 'twelfth', options: [['twelfth', 'Octave and twelfth (1 : 2 : 3)'], ['double', 'Octave and double octave (1 : 2 : 4)'], ['raw', 'Untuned (as sunk)']],
        hint: 'What the tuner hammers the three lowest modes of every note to. Untuned, they stay where the note’s shape puts them, and the note sounds like a tin can.' },
      { id: 'accuracy', label: 'Tuner’s accuracy', min: 0, max: 30, def: 2, step: 0.5, fmt: (v) => `± ${v.toFixed(1)} ¢`, showIf: (P) => P.tuning !== 'raw',
        hint: 'How far each note’s octave and third partial may miss their targets. A few cents: they beat slowly against the partials the dome makes itself.' },
      { id: 'aspect', label: 'Note shape (length / width)', min: 1, max: 2.5, def: 1.3, step: 0.01, fmt: (v) => `${v.toFixed(2)} : 1`,
        hint: 'The note area’s length over its width. It places the upper, untuned modes (and, untuned, the octave and twelfth too: at √2 = 1.41 they fall on 1 : 2 : 3 by themselves).' },
      { id: 'rise', label: 'Dome rise (curvature)', min: 0, max: 10, def: 3, step: 0.1, fmt: (v) => `${v.toFixed(1)} × thickness`,
        hint: 'How far each note’s dome stands above its rim. The curvature couples its modes: struck hard, the fundamental pumps the octave, the octave the double octave, and so on up the note’s harmonics, so the tone blooms, brightens and wobbles. Flat: the note is linear, and every stroke has the same colour.' },
      { id: 't60', label: 'Ring time at C4', min: 0.2, max: 8, def: 1.6, log: true, fmt: s,
        hint: 'How long C4’s fundamental takes to fall 60 dB (steel, the rim and the air). Lower notes ring longer, higher ones less (as 1/√f).' },
      { id: 'damping', label: 'Damping vs frequency', min: 0, max: 2, def: 0, step: 0.01, fmt: (v) => `σ ∝ f^${v.toFixed(2)}`,
        hint: 'How much faster the upper modes die than the fundamental. Measured on a pan, the octave rings longer than the fundamental and the double octave about as long (0: all alike); raise it for a duller, shorter tail.' },
      { id: 'fullRange', label: 'Full range (A0–C8)', type: 'checkbox', def: false,
        hint: 'Opens the keys beyond the steel band’s A1–F♯6, six bass to high tenor: notes carried on down to A0 and up to C8 with the same shape and tuning.' },
    ],
  },
  {
    title: 'Pan',
    params: [
      { id: 'layout', label: 'Note layout', type: 'select', def: 'fifths', options: [['fifths', 'Fourths and fifths'], ['chromatic', 'Chromatic']],
        hint: 'Which notes sit side by side. In fourths and fifths, neighbours share partials (C4’s twelfth is G4’s octave and G5’s fundamental), so they ring along in tune. Chromatic, as on early pans, neighbours share nothing.' },
      { id: 'coupling', label: 'Note coupling', min: 0, max: 0.01, def: 0.0015, step: 0.0001, fmt: (v) => `${(v * 100).toFixed(2)} %`,
        hint: 'How strongly the steel between neighbouring notes ties their modes together. A mode of one note drives a neighbour’s mode at nearly the same frequency: the neighbour sings along.' },
      { id: 'skirt', label: 'Skirt length', min: 0.25, max: 3, def: 1, step: 0.01, log: true, fmt: (v) => `${v.toFixed(2)} × the band’s`,
        hint: 'The drum’s side wall, cut short on tenors (about 14 cm) and left whole on basses (86 cm). Shorter than a wavelength, the sound from the back of a note cancels the front’s: low partials are lost.' },
    ],
  },
  {
    title: 'Sticks',
    params: [
      { id: 'contact', label: 'Stick contact (at C4)', min: 0.2, max: 3, def: 0.7, log: true, fmt: ms,
        hint: 'How long the rubber tip stays on the note at C4 (shorter on higher, stiffer notes, and on harder strokes, as a Hertz contact). Short: a bright, clicky stroke; long: a round one that reaches only the fundamental.' },
      { id: 'along', label: 'Strike point (centre → edge)', perform: true, min: 0, max: 0.95, def: 0.35, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of the half-length`,
        hint: 'Where the stick lands along the note. At the centre the octave mode has its node and is silent, so only the dome can make it; towards the edge it speaks at once.' },
      { id: 'across', label: 'Off the long axis', min: 0, max: 0.95, def: 0.2, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of the half-width`,
        hint: 'On the long axis, the third partial (its node runs along it) stays silent.' },
      { id: 'roll', label: 'Roll', perform: true, min: 0, max: 1, def: 0, step: 0.01, fmt: (v) => (v === 0 ? 'off' : `${(v * 100).toFixed(0)} % of the stroke`),
        hint: 'Held notes are rolled: the two sticks strike again and again, at this fraction of the first stroke. The mod wheel sets it, and leaning on a key (aftertouch) rolls that note.' },
      { id: 'rollRate', label: 'Roll speed', min: 4, max: 24, def: 12, step: 0.5, fmt: (v) => `${v.toFixed(1)} strokes/s`,
        hint: 'Strokes per second, both sticks together.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    title: 'Hands',
    params: [
      { id: 'letRing', label: 'Let notes ring', perform: true, strip: true, type: 'checkbox', def: false,
        hint: 'As a pannist plays: nothing stops a note but its own decay. Off, letting go of a key lays a hand on the note (Space or the pedal lifts it).' },
      { id: 'mute', label: 'Hand mute', min: 0.05, max: 2, def: 0.3, log: true, fmt: (v) => `T₆₀ ${s(v)}`, showIf: (P) => !P.letRing,
        hint: 'How fast a hand on the note stops it.' },
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
  { name: 'Tenor pan', p: {} },
  { name: 'Double tenor (1 : 2 : 4)', p: { tuning: 'double', aspect: 1.2 } },
  { name: 'Six bass', p: { t60: 3, contact: 1.4, rise: 2.5, along: 0.3 } },
  { name: 'Let it ring', p: { letRing: true, coupling: 0.004 } },
  { name: 'Rolled', p: { roll: 0.6, letRing: true } },
  { name: 'Hard sticks, high domes', p: { contact: 0.3, rise: 8 } },
  { name: 'Flat notes (no dome)', p: { rise: 0 } },
  { name: 'Untuned, as sunk', p: { tuning: 'raw' } },
  { name: 'Chromatic layout', p: { layout: 'chromatic', letRing: true, coupling: 0.004 } },
];
