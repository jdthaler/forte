// drums-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pct = (v) => `${(v * 100).toFixed(0)} %`;
const times = (v) => `${v.toFixed(2)} ×`;

// The drums, in the order of drums-model.cpp's DRUMS.
export const DRUMS = ['Timpani', 'Tabla: dayan (right hand)', 'Tabla: bayan (left hand)'];

export const GROUPS = [
  {
    title: 'Drum',
    params: [
      { id: 'drum', label: 'Drum', type: 'select', perform: true, def: 0, options: DRUMS.map((d, i) => [i, d]),
        shortLabels: ['Timpani', 'Dayan', 'Bayan'],
        hint: 'Which drum every key is. Timpani: a calf or Mylar head on a copper kettle, sized and tightened so that its principal mode, (1,1), sounds the note. The tabla’s dayan: goatskin with a black syahi patch, its fundamental (0,1) on the note. The bayan: the big bass drum of the pair, a looser head with a smaller patch, whose pitch the heel of the hand bends.' },
      { id: 'size', label: 'Drum size (× usual)', min: 0.6, max: 1.6, def: 1, log: true, fmt: times,
        hint: 'The head’s diameter against the usual drum for the note (a 66 cm kettle plays around D3, a 14 cm dayan around C♯4). A bigger head is tuned looser for the same note: the air weighs more on it, so the overtones crowd lower.' },
      { id: 'head', label: 'Head', type: 'select', def: 0, options: [[0, 'The drum’s own (Mylar on timpani, goatskin on tabla)'], [1, 'Mylar (polyester film)'], [2, 'Calfskin'], [3, 'Goatskin']],
        shortLabels: ['Own', 'Mylar', 'Calf', 'Goat'],
        hint: 'The head’s weight, stiffness and losses. Mylar is light, stiff and rings long; calfskin is heavier and lossier, the timpani’s head before the 1950s; goatskin is the tabla’s.' },
      { id: 'loss', label: 'Head losses (× its own)', min: 0.1, max: 10, def: 1, log: true, fmt: times,
        hint: 'The head’s own internal friction, against what its material has. The air also takes energy away (the radiation, which the model works out mode by mode): low and simple modes lose most of theirs to it.' },
      { id: 'syahi', label: 'Syahi load (× its own)', min: 0, max: 2, def: 1, step: 0.01, fmt: times, showIf: (P) => P.drum !== 0,
        hint: 'The tabla’s black patch of iron filings, gum and rice paste, laid on in layers: thick at the centre, thinning to its edge. Its weight is what pulls the overtones into the harmonics of the fundamental (Raman, 1934). At 0 the head is bare goatskin and rings like any drum: out of tune with itself.' },
    ],
  },
  {
    title: 'Stroke',
    params: [
      { id: 'beater', label: 'Beater', type: 'select', perform: true, def: 0,
        options: [[0, 'The drum’s own (felt mallet on timpani, fingers on tabla)'], [1, 'Soft felt mallet'], [2, 'Hard felt mallet'], [3, 'Wooden mallet'], [4, 'Fingertip']],
        shortLabels: ['Own', 'Soft', 'Hard', 'Wood', 'Finger'],
        hint: 'What strikes the head: its weight and how stiff its tip is, so how long it stays on the head. A soft mallet stays longest and reaches only the low modes; wood bounces off at once and reaches them all.' },
      { id: 'strike', label: 'Strike point (from centre)', perform: true, min: 0, max: 0.95, def: 0.72, step: 0.01, fmt: (v) => `${pct(v)} of the radius`,
        hint: 'Where the beater lands, from the centre (0) to the rim (the mod wheel). Timpanists play about a quarter of the way in from the rim, where the (0,1) thud is weak and the harmonic (m,1) modes strong; at the centre only the round modes sound: a dull thump. The tabla’s Tun strikes the centre of the syahi, its Na the rim.' },
      { id: 'stays', label: 'Hand stays (closed stroke)', perform: true, type: 'checkbox', def: false,
        hint: 'The fingers stay pressed on the head after they strike, as in the tabla’s Te and Ka: a dry slap with no ring.' },
      { id: 'rest', label: 'Finger resting on the head', perform: true, type: 'checkbox', def: false,
        hint: 'A finger rests lightly on the head while it rings, as the ring finger does in the tabla’s Na and Tin. It damps every mode that moves under it and spares those with a node there.' },
      { id: 'restAt', label: 'Resting finger (from centre)', min: 0, max: 0.95, def: 0.5, step: 0.01, fmt: (v) => `${pct(v)} of the radius`, showIf: (P) => P.rest,
        hint: 'Where the resting finger lies, from the centre, a quarter turn round from the strike point (as the ring finger lies beside the index). There it sits on the nodal line of the struck (1,1) and (3,1) and spares them, and damps the round modes and the even ones. On the dayan’s syahi edge it kills the fundamental and leaves the 2nd harmonic ringing: the Na.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.6, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'How hard the computer keys strike: the beater’s speed, up to 4 m/s.' },
    ],
  },
  {
    title: 'Air and kettle',
    params: [
      { id: 'air', label: 'Air on the head (× sea level)', min: 0, max: 3, def: 1, step: 0.01, fmt: (v) => (v < 0.005 ? 'none (vacuum)' : `${(1.2 * v).toFixed(2)} kg/m³`),
        hint: 'The density of the air that loads the head. It rides along with every mode and lowers it, the low ones most, and it takes their energy away as sound. The air is what pulls the timpani’s modes into a near-harmonic series: without it the head plays the bare Bessel ratios, 1 : 1.34 : 1.66 : 1.98, a clang, and rings far longer. (You still hear it, through ordinary air.)' },
      { id: 'under', label: 'Under the head', type: 'select', def: 0, options: [[0, 'The kettle (or shell)'], [1, 'Open air']],
        hint: 'A closed kettle pushes back on the modes that change its volume (the round ones, (0,n)), so the (0,1) thud rises, and its air rides along with the others. Open, the head has air on both sides and nothing to push back.' },
      { id: 'depth', label: 'Kettle depth (× its own)', min: 0.25, max: 4, def: 1, log: true, fmt: times, showIf: (P) => P.under === 0,
        hint: 'The depth of the kettle, taken as a cylinder holding the same air (a timpani’s is about two thirds of its radius). A shallow kettle is a stiffer spring for the round modes; a deep one lets its own resonances meet the head’s.' },
      { id: 'mic', label: 'Listening angle', min: 0, max: 80, def: 60, step: 1, fmt: (v) => `${v.toFixed(0)}° from overhead`,
        hint: 'Where you listen from, across the drum from the player. Straight overhead you hear only the round modes (the others cancel on their axis); at the side the dipole (1,1) and its harmonics come in.' },
    ],
  },
  {
    title: 'Hands and pedal',
    params: [
      { id: 'ring', label: 'Let it ring', perform: true, strip: true, type: 'checkbox', def: true,
        hint: 'A drum has no dampers. Off, releasing a key lays a hand flat on its head (unless Space or the pedal is down).' },
      { id: 'hand', label: 'Hand damping', min: 0.02, max: 2, def: 0.15, log: true, fmt: (v) => `${(v * 1000).toFixed(0)} ms`,
        hint: 'How quickly a hand laid on the head stops it.' },
      { id: 'push', label: 'Heel push (aftertouch)', perform: true, min: 0, max: 20, def: 8, step: 0.1, fmt: (v) => `${v.toFixed(1)} mm`,
        hint: 'How far the heel of the hand presses into the head at full aftertouch (or MPE pressure). Pressing stretches the head, so its tension and every mode rise: the bayan’s swooping “ghe”. It works on every drum, most on a loose one.' },
      { id: 'pedal', label: 'Pedal range (pitch bend)', min: 0, max: 7, def: 2, step: 0.5, fmt: (v) => `±${v.toFixed(1)} semitones`,
        hint: 'The timpani’s pedal, on the pitch-bend wheel: it changes the head’s tension while it rings, the timpani glissando. The range is of the principal mode.' },
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
  { name: 'Timpani, felt mallets', p: {} },
  { name: 'Timpani, wooden mallets', p: { beater: 3 } },
  { name: 'Timpani struck at the centre', p: { strike: 0 } },
  { name: 'Timpani in a vacuum (bare Bessel ratios)', p: { air: 0 } },
  { name: 'Timpani without its kettle', p: { under: 1 } },
  { name: 'Calfskin timpani, damped', p: { head: 2, ring: false } },
  { name: 'Dayan: Na (rim, finger on the syahi edge)', p: { drum: 1, strike: 0.92, rest: true, restAt: 0.5 } },
  { name: 'Dayan: Tin (finger on the syahi edge)', p: { drum: 1, strike: 0.75, rest: true, restAt: 0.47 } },
  { name: 'Dayan: Tun (centre, open)', p: { drum: 1, strike: 0.08 } },
  { name: 'Dayan: Te (closed slap)', p: { drum: 1, strike: 0.15, stays: true } },
  { name: 'Dayan without its syahi', p: { drum: 1, syahi: 0, strike: 0.6 } },
  { name: 'Bayan: Ge (press for the swoop)', p: { drum: 2, strike: 0.6, push: 10 } },
  { name: 'Bayan: Ke (flat hand)', p: { drum: 2, strike: 0.3, stays: true } },
];
