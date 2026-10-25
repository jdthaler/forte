// celesta-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const sci = (v) => { const e = Math.floor(Math.log10(v)), m = v / 10 ** e; return `${m.toFixed(1)}×10${String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])}`; };
const felt = (v) => (v < 60 ? 'very soft felt' : v < 200 ? 'soft felt' : v < 700 ? 'medium felt' : v < 2500 ? 'hard felt' : 'wood or brass');

export const GROUPS = [
  {
    title: 'Bars',
    params: [
      { id: 'thick', label: 'Bar thickness', min: 1, max: 5, def: 2.5, step: 0.05, fmt: (v) => `${v.toFixed(2)} mm at C4 → ${(0.8 * v).toFixed(2)} mm at C8`,
        hint: 'The steel bars are plain rectangles, 2.5 mm thick at the bottom and 2 mm at the top. Each is cut to the length that puts it on pitch, so a thicker bar is longer and heavier: it takes the hammer’s energy more slowly and rings longer, and shear lowers its overtones a little more. Applies to the next strike.' },
      { id: 'eta', label: 'Internal friction η', min: 1e-6, max: 1e-3, def: 2e-5, log: true, fmt: sci,
        hint: 'The steel’s loss factor. Steel rings a long time on its own: what stops a celesta note is mostly the resonator box, the blocks under the bar and the damper.' },
      { id: 'fullRange', label: 'Full range (A0–C8)', type: 'checkbox', def: false,
        hint: 'Opens the keys below the four-octave C4–C8 compass: bars cut from the C4 bar’s blank, longer and longer (69 cm at A0), each over its own box.' },
    ],
  },
  {
    title: 'Resonators',
    params: [
      { id: 'boxes', label: 'Resonator boxes', type: 'checkbox', def: true,
        hint: 'A wooden box under each bar, closed at the bottom and tuned to the bar’s fundamental. Off: the bar alone, a thin strip of steel that barely moves the air at its own pitch.' },
      { id: 'gap', label: 'Bar–box gap', min: 2, max: 40, def: 12, log: true, fmt: (v) => `${v.toFixed(1)} mm`,
        hint: 'How far above the box’s mouth the bar rests. Closer: the bar pushes more air into the box, a louder, shorter note; very close, bar and box trade energy back and forth.' },
      { id: 'detune', label: 'Box tuning', min: -300, max: 300, def: 0, step: 1, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)} ¢`,
        hint: 'The box’s own pitch relative to its bar. Off tune, it takes less energy from the bar: a quieter, longer note that beats as it starts.' },
    ],
  },
  {
    title: 'Hammers',
    params: [
      { id: 'hardness', label: 'Hammer felt', min: 10, max: 10000, def: 200, log: true, fmt: (v) => `${v.toFixed(0)} N at 1 mm (${felt(v)})`,
        hint: 'The felt’s force when squashed by 1 mm at C4 (F = Kδ^2.5; 40 times harder at C8, where the felt is thin and the hammer half as heavy). Harder felt leaves the bar sooner and reaches its upper modes: a brighter, more bell-like tone, towards a glockenspiel.' },
      { id: 'mass', label: 'Hammer mass', min: 1, max: 12, def: 4, step: 0.1, fmt: (v) => `${v.toFixed(1)} g at C4 → ${(v / 2).toFixed(1)} g at C8`,
        hint: 'A heavier hammer stays on the bar longer: more fundamental, less shimmer, and a louder note for the same speed.' },
      { id: 'strike', label: 'Strike point', min: 0.02, max: 0.5, def: 0.3, step: 0.005, fmt: (v) => (v >= 0.5 ? 'the centre' : `${(v * 100).toFixed(1)} % from the end`),
        hint: 'Where along the bar the hammer lands. At the centre the second mode (2.76 × the pitch, an inharmonic shimmer) has a node and stays silent; on mode 1’s node (22.4 %) the fundamental drops out.' },
      { id: 'across', label: 'Off the centre line', min: 0, max: 0.9, def: 0.1, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of the half-width`,
        hint: 'Striking towards a long edge twists the bar: its torsional modes join in, high and inharmonic.' },
      { id: 'speedMax', label: 'Hammer speed at full velocity', min: 0.5, max: 5, def: 2.5, step: 0.1, fmt: (v) => `${v.toFixed(1)} m/s`,
        hint: 'The hammer’s speed for velocity 1. Faster strikes squash the felt further and stiffen it: louder and brighter, not just louder.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.6, step: 0.01, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    title: 'Dampers',
    params: [
      { id: 'damp', label: 'Damper felt', min: 0.03, max: 3, def: 0.15, log: true, fmt: (v) => `T₆₀ ${v < 1 ? v.toFixed(2) : v.toFixed(1)} s`,
        hint: 'The felt pad that rests on each bar until its key goes down: how fast it stops the fundamental once the key is let go. The pedal lifts every damper.' },
      { id: 'pedalLock', label: 'Pedal held down (nothing damped)', perform: true, strip: true, type: 'checkbox', def: false,
        hint: 'Every note rings until it dies away by itself.' },
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
  { name: 'Celesta: felt hammers, steel bars, wooden boxes', p: {} },
  { name: 'Struck at the centre: the second mode silent', p: { strike: 0.5 } },
  { name: 'Keyboard glockenspiel: brass hammers, no boxes', p: { hardness: 6000, mass: 3, boxes: false, thick: 3.5, strike: 0.3 } },
  { name: 'No resonators: the bars alone', p: { boxes: false } },
  { name: 'Boxes pressed close: bar and box trade energy', p: { gap: 2.5 } },
  { name: 'Boxes a semitone sharp', p: { detune: 100 } },
  { name: 'Thick bars, 5 mm', p: { thick: 5 } },
  { name: 'Struck on the node: the fundamental drops out', p: { strike: 0.224 } },
  { name: 'Struck off the edge: the bars twist', p: { across: 0.85, hardness: 600 } },
  { name: 'Pedal down: every note rings', p: { pedalLock: true } },
];
