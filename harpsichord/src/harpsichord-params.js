// harpsichord-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const mm = (v) => `${v < 10 ? v.toFixed(1) : v.toFixed(0)} mm`;

// The model's constants that the page needs (as harpsichord-model.h has them).
export const KEY_LO = 29, KEY_HI = 89;        // FF – f³, 61 keys: the compass
export const KEY_MIN = 21, KEY_MAX = 108;     // with the full range open
// Registers: which jacks pluck which strings, from which manual.
export const ROWS = {
  front: { string: 'front', manual: 'upper', name: 'front 8′' },
  back: { string: 'back', manual: 'lower', name: 'back 8′' },
  four: { string: 'four', manual: 'lower', name: '4′' },
  lute: { string: 'back', manual: 'upper', name: 'lute' },
};
// Velocity 0..1 → jack speed: 8 cm/s (pp) … 80 cm/s (ff).
export const jackSpeed = (vel) => 0.08 * 10 ** Math.min(1, Math.max(0, vel));

export const GROUPS = [
  {
    title: 'Registration',
    params: [
      { id: 'manual', label: 'Play on', perform: true, type: 'select', def: 'lower',
        options: [['lower', 'Lower manual (back 8′, 4′)'], ['upper', 'Upper manual (front 8′, lute)']],
        hint: 'A French double: the upper manual plucks the front 8′ strings nearest the nut; the lower plucks the back 8′ (rounder) and the 4′. The keys here play whichever you choose.' },
      { id: 'coupler', label: 'Coupler', perform: true, type: 'checkbox', def: true,
        hint: 'The shove coupler: the lower manual’s keys lift the upper manual’s, so its jacks pluck as well. Two 8′s together, a little apart in pitch and plucking point.' },
      { id: 'front8', label: 'Front 8′ (upper manual)', perform: true, type: 'checkbox', def: true,
        hint: 'Plucks nearest the nut (40 mm from it at c²): bright and a little nasal.' },
      { id: 'back8', label: 'Back 8′ (lower manual)', perform: true, type: 'checkbox', def: true,
        hint: 'Plucks further from the nut (62 mm at c²): rounder.' },
      { id: 'four', label: '4′ (lower manual)', perform: true, type: 'checkbox', def: false,
        hint: 'Its own strings, half as long, an octave up: adds brilliance.' },
      { id: 'lute', label: 'Lute row (upper manual)', perform: true, type: 'checkbox', def: false,
        hint: 'A row of jacks plucking the back 8′ strings 12 mm from the nut (at c²): thin and nasal, the fundamental weak. With the back 8′ also rising, the lute plucks those strings instead. An English and German addition, not on a Ruckers.' },
      { id: 'buff', label: 'Buff stop (back 8′)', perform: true, type: 'checkbox', def: false,
        hint: 'Leather pads pressed against the back 8′ strings 10 mm from the nut. They barely touch the fundamental and soak up the upper partials: a short, dull, pizzicato tone.' },
    ],
  },
  {
    title: 'Plectra',
    params: [
      { id: 'material', label: 'Plectrum', type: 'select', def: 'delrin',
        options: [['delrin', 'Delrin (flat, slippery: μ = 0.2)'], ['quill', 'Bird quill (tapered, μ = 0.3)']],
        hint: 'Its shape and its friction on the wire. A quill cut thin towards the tip bends there, so the string slides off it sooner; more friction holds the string longer.' },
      { id: 'stiff', label: 'Voicing: stiffness at the tip', min: 600, max: 5000, def: 2500, log: true, fmt: (v) => `${v.toFixed(0)} N/m`,
        hint: 'How stiff the voicer has left the plectra (this value at c²; slacker strings get weaker ones). Stiffer plectra carry the string further before it slips off: louder, and a heavier touch. Too stiff, and a plectrum lifts its string to the jack rail without letting go: no pluck.' },
      { id: 'overlap', label: 'Overlap past the string', min: 0.2, max: 1.0, def: 0.6, step: 0.05, fmt: (v) => `${v.toFixed(2)} mm`,
        hint: 'How far the plectrum reaches past the string. More overlap: the string slides further before it slips off, at a larger force.' },
      { id: 'stagger', label: 'Stagger between rows', min: 0, max: 2, def: 0.5, step: 0.05, fmt: (v) => `${v.toFixed(2)} mm`,
        hint: 'The rows are set at slightly different heights, so they pluck one after another (back 8′, front 8′, 4′) rather than all at once.' },
      { id: 'velocity', label: 'Velocity (computer keys)', min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => `${v.toFixed(2)} (jack ${(8 * 10 ** v).toFixed(0)} cm/s)`,
        hint: 'How fast the key lifts the jack. It changes the pluck little: the plectrum lets go where it lets go. Faster keys pluck sooner, a touch brighter, with a louder knock.' },
    ],
  },
  {
    title: 'Plucking points (at c²)',
    params: [
      { id: 'xFront', label: 'Front 8′ from the nut', min: 10, max: 180, def: 40, step: 1, fmt: mm,
        hint: 'A partial whose node falls on the plucking point is not excited: plucked at 1/n of the string, partial n and its multiples are missing (the comb). Nearer the nut, more upper partials: brighter, thinner.' },
      { id: 'xBack', label: 'Back 8′ from the nut', min: 10, max: 180, def: 62, step: 1, fmt: mm },
      { id: 'xFour', label: '4′ from its nut', min: 10, max: 80, def: 45, step: 1, fmt: mm },
      { id: 'xLute', label: 'Lute row from the nut', min: 4, max: 40, def: 12, step: 1, fmt: mm },
    ],
  },
  {
    title: 'Strings and soundboard',
    params: [
      { id: 'detune', label: 'Unison spread (front vs back 8′)', min: 0, max: 8, def: 1.5, step: 0.1, fmt: (v) => `${v.toFixed(1)} ¢`,
        hint: 'No two choirs are ever exactly in tune: a cent or two apart, they beat slowly. Applies to new notes.' },
      { id: 'loss', label: 'String losses (air and wire)', min: 0.25, max: 4, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)}`,
        hint: 'Scales the air’s drag on the wire and its internal friction. Applies to new notes.' },
      { id: 'damper', label: 'Damper felt', min: 0.1, max: 4, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)} √(Tμ)`,
        hint: 'How lossy the damper cloth is, relative to the string’s wave impedance: at × 1 it soaks up what reaches it. Applies to new notes.' },
      { id: 'sympathy', label: 'Sympathetic resonance', min: 0, max: 1, def: 0.25, step: 0.01, fmt: (v) => (v === 0 ? 'off' : `${(v * 100).toFixed(0)} %`),
        hint: 'While a key is held, its strings are free of their dampers (the 4′ too, plucked or not) and ring along through the bridge with the strings that sound. The share of the bridge\'s motion one string feels from another: 100 % if they all met it at one point.' },
      { id: 'fmax', label: 'Highest partial', min: 4, max: 16, def: 10, step: 0.5, fmt: (v) => `${v.toFixed(1)} kHz`,
        hint: 'Partials above this are left out (and at most 90 per string). Lower it if the CPU pill runs hot. Applies to new notes.' },
      { id: 'kc', label: 'Tension modulation (pitch glide)', type: 'checkbox', def: true,
        hint: 'A firm pluck stretches the wire, so its tension and pitch rise a little, then settle as the note decays. Short treble strings stretch the most.' },
      { id: 'fullRange', label: 'Full range (A0–C8)', type: 'checkbox', def: false,
        hint: 'Opens the keys beyond the five-octave FF–f³ compass: the same scale of strings, carried on down to A0 and up to C8.' },
      { id: 'soundboard', label: 'Soundboard', type: 'checkbox', def: true,
        hint: 'The strings make little sound themselves; the board, driven by the bridge, does. Off, you hear the force on the bridge directly, as a contact pickup would: thin, without the board’s resonances.' },
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
  { name: 'Two 8′s coupled (front and back)', p: {} },
  { name: 'Front 8′ alone: plucked near the nut, bright', p: { manual: 'upper', back8: false } },
  { name: 'Back 8′ alone: plucked further in, round', p: { coupler: false, front8: false } },
  { name: 'Full: 8′ 8′ 4′ coupled', p: { four: true } },
  { name: '4′ alone: its own strings, an octave up', p: { coupler: false, back8: false, front8: false, four: true } },
  { name: 'Lute row: plucked 12 mm from the nut', p: { manual: 'upper', front8: false, lute: true } },
  { name: 'Buff stop: leather on the back 8′', p: { coupler: false, front8: false, buff: true } },
  { name: 'Quill plectra', p: { material: 'quill' } },
  { name: 'Light voicing: soft plectra, little overlap', p: { stiff: 1000, overlap: 0.35 } },
  { name: 'Heavy voicing: stiff plectra, deep overlap', p: { stiff: 4000, overlap: 0.9 } },
  { name: 'Back 8′ plucked at the middle (c²): no even partials', p: { coupler: false, front8: false, xBack: 178 } },
  { name: 'Baroque pitch, ¼-comma meantone', p: { pitch: 415, temperament: 'meantone' } },
  { name: 'Without the soundboard (bridge force)', p: { soundboard: false } },
];
