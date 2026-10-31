// chladni-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pct = (v) => `${(v * 100).toFixed(0)} %`;

// The figures, in the order of chladni-model.cpp's FIGURES: what the sand draws on a square plate
// clamped at its centre, lowest first.
export const FIGURES = [
  'One line through the clamp',
  'The cross',
  'The diagonals',
  'A line and two arcs',
  'Four arcs round the corners',
  'Three lines',
  'The star',
  'A cross between corner arcs',
  'A ring',
  'A cross with an X in each quarter',
];

export const GROUPS = [
  {
    title: 'Figure',
    params: [
      { id: 'figure', label: 'Figure', type: 'select', perform: true, def: 2, options: FIGURES.map((f, i) => [i, f]), hint: 'The mode each key’s plate is cut to sound on its note, and so the figure its sand draws. Chladni drew a figure out by holding the plate with a finger on one of its nodal lines and bowing the edge where it swings most; the bow and the finger go there for you.' },
      { id: 'shift', label: 'Bow shift along the edge', perform: true, min: 0, max: 1, def: 0, step: 0.01, fmt: (v) => (v < 0.005 ? 'where the figure wants it' : `${pct(v)} of half an edge away`), hint: 'Moves the bow along the edge away from the figure’s place (the mod wheel). A figure that has the bow holds on to it as the bow moves; set the bow down afresh far enough away and another mode can take it (the note jumps to its pitch and the sand runs to its lines), or none speaks at all' },
      { id: 'finger', label: 'Finger on a node', perform: true, strip: true, type: 'checkbox', def: true, hint: 'A fingertip resting on one of the figure’s nodal lines, where it does not move: it damps the modes that would steal the bow, so the figure speaks clean. Lift it and other modes join in, or take over.' },
    ],
  },
  {
    title: 'Bow',
    params: [
      { id: 'force', label: 'Bow force (× threshold)', perform: true, min: 0.5, max: 30, def: 2.5, log: true, fmt: (v) => `${v.toFixed(1)} × the threshold`, hint: 'How hard the bow hair presses against the edge, as a multiple of the force at which the figure just starts to speak (the readout gives it in newtons; velocity scales it 0.5–1.5×, aftertouch up to 2× more). Below 1 the plate will not speak; just above, it swells in slowly; heavy, it speaks at once with a rasp, and can jump to another mode.' },
      { id: 'speed', label: 'Bow speed', perform: true, min: 0.02, max: 1, def: 0.1, log: true, fmt: (v) => `${(v * 100).toFixed(0)} cm/s`, hint: 'How fast the bow is drawn down across the edge. The edge keeps pace with the hair while it sticks, so a faster bow swings the plate further: louder, with the same figure.' },
      { id: 'rosin', label: 'Rosin', min: 0, max: 1, def: 0.6, step: 0.01, fmt: pct, hint: 'How much more the rosined hair grips while it sticks than while it slides (static friction 0.35–1.0 over the sliding 0.3). Little rosin and the bow skates; plenty and it bites.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.6, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'How hard the computer keys draw the bow: the bow force, 0.5–1.5×.' },
    ],
  },
  {
    title: 'Plate',
    params: [
      { id: 'material', label: 'Material', type: 'select', def: 0, options: [[0, 'Brass'], [1, 'Glass'], [2, 'Steel'], [3, 'Aluminium']], hint: 'Chladni used glass and brass. The material sets the bending stiffness and so how big each key’s plate is, and its Poisson ratio moves the higher modes against one another a little.' },
      { id: 'thickness', label: 'Thickness', min: 0.5, max: 5, def: 1.5, log: true, fmt: (v) => `${v.toFixed(2)} mm`, hint: 'A thicker plate is stiffer, so it is cut bigger for the same note, and heavier: it needs more bow force.' },
      { id: 'hold', label: 'Held by', type: 'select', def: 0, options: [[0, 'A clamp at the centre'], [1, 'The finger alone (free plate)']], hint: 'Chladni screwed a plate to a post at its centre between leather pads, or held it in his fingers at a node. Clamped, the modes that move the centre rise and the lowest is the plate rocking about the clamp; free, the plate keeps the free square’s modes.' },
      { id: 'ring', label: 'Ring time', min: 0.2, max: 20, def: 1.2, log: true, fmt: (v) => `${v.toFixed(1)} s`, hint: 'How long a plate’s figure rings once the bow lifts (hold the sustain pedal to hear it): the metal’s or glass’s own loss, the clamp’s leather and the air, a fixed share of each cycle, each plate’s share set so that every key rings this long, though none loses more than 2.6 % of its energy a cycle (a Q of 240): at 1.2 s the keys below A4 ring longer, as real plates do, and the low ones need it to speak clean. Higher modes lose more. A plate that rings longer needs less bow to speak, but is slower to speak and to settle into its figure.' },
      { id: 'hand', label: 'Hand on release', min: 0.05, max: 3, def: 0.4, log: true, fmt: (v) => `${v.toFixed(2)} s`, hint: 'When a key lets go the bow lifts and a hand stops the plate in about this time (the sustain pedal holds the hand off).' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.3, step: 0.01, fmt: pct },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Brass plate, the diagonals', p: {} },
  { name: 'The cross', p: { figure: 1 } },
  { name: 'A ring', p: { figure: 8 } },
  { name: 'The star', p: { figure: 6 } },
  { name: 'Glass plate (Chladni’s)', p: { material: 1, thickness: 2.5, ring: 4 } },
  { name: 'Free plate, held at a node', p: { hold: 1 } },
  { name: 'Finger lifted (modes fight)', p: { finger: false } },
  { name: 'Bow wandering off the figure', p: { shift: 0.7 } },
  { name: 'Heavy bow (rasp and jumps)', p: { force: 12 } },
  { name: 'Light, slow bow', p: { force: 1.3, speed: 0.05 } },
  { name: 'Thin steel, ringing', p: { material: 2, thickness: 0.8, ring: 3, hand: 1.5, force: 4 } },
];
