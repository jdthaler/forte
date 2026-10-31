// clavichord-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

// The model's constants that the page needs (as clavichord-model.h has them).
export const KEY_LO = 29, KEY_HI = 89;    // FF – f³: the compass
export const KEY_MIN = 21, KEY_MAX = 108; // with the full range open
export const OCTAVE_TOP = 52;             // the highest key with a 4′ string
// Velocity 0..1 → the tangent's speed onto the strings: 4 cm/s (pp) … 40 cm/s (ff).
export const tangentSpeed = (vel) => 0.04 * 10 ** Math.min(1, Math.max(0, vel));
const grams = (n) => `${((n * 1000) / 9.81).toFixed(0)} g`;

export const GROUPS = [
  {
    title: 'Touch',
    params: [
      { id: 'press', label: 'Finger pressure on the key', perform: true, min: 0.2, max: 3, def: 0.8, log: true, fmt: (v) => `${v.toFixed(2)} N (${grams(v)})`,
        hint: 'How hard the finger holds the key down once it has struck. The tangent stays on the strings, so it holds them up, stretched: press harder and the note goes sharp, lighter and it goes flat and thin. The strings were tuned at 0.8 N.' },
      { id: 'bebung', label: 'Bebung (finger vibrato)', perform: true, strip: true, min: 0, max: 1, def: 0, step: 0.01, fmt: (v) => (v === 0 ? 'off' : `± ${(v * 60).toFixed(0)} %`),
        hint: 'The clavichord’s own vibrato: the finger rocks its pressure on the held key, the tangent lifts the strings and lets them back, and the pitch wavers with it. How far the pressure swings (the mod wheel). With aftertouch or MPE pressure you can do it yourself.' },
      { id: 'rate', label: 'Bebung rate', perform: true, min: 2, max: 9, def: 5, step: 0.1, fmt: (v) => `${v.toFixed(1)} Hz`,
        hint: 'How fast the finger rocks.' },
      { id: 'mass', label: 'Key and finger (mass at the tangent)', min: 4, max: 40, def: 12, log: true, fmt: (v) => `${v.toFixed(0)} g`,
        hint: 'What the tangent carries into the strings: the key and the finger on it. A heavier stroke pushes the strings further before the finger’s pressure holds them, so its notes start sharper and settle.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.6, step: 0.01, fmt: (v) => `${v.toFixed(2)} (tangent ${(4 * 10 ** v).toFixed(0)} cm/s)`,
        hint: 'How fast the tangent meets the strings. Faster is louder and brighter: the tangent is brass, so it starts every partial at once.' },
    ],
  },
  {
    title: 'Strings',
    params: [
      { id: 'fretting', label: 'Fretting', type: 'select', def: 'unfretted',
        options: [['unfretted', 'Unfretted (bundfrei): two strings to every key'], ['fretted', 'Double-fretted (gebunden): neighbours share, D and A free']],
        hint: 'On a fretted clavichord two neighbouring keys share a pair of strings, their tangents a semitone apart along it: the one nearer the bridge sounds, so C and C♯ cannot sound together. Let the upper go while the lower is held, and the lower speaks again, plucked by the string springing back.' },
      { id: 'octave', label: '4′ strings in the bass', type: 'checkbox', def: false,
        hint: 'A third string an octave up beside each pair in the bass (to e), struck by the same tangent: a brighter, fuller bass, as on some of Hieronymus Albrecht Hass’s large clavichords.' },
      { id: 'detune', label: 'Unison spread (the pair)', min: 0, max: 8, def: 1.5, step: 0.1, fmt: (v) => `${v.toFixed(1)} ¢`,
        hint: 'No two strings of a pair are ever exactly in tune: a cent or two apart, they beat slowly. Applies to new notes.' },
      { id: 'listing', label: 'Listing cloth', min: 0.02, max: 4, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)}`,
        hint: 'The cloth woven between the strings by the hitchpins. It damps the stretch beyond the tangent, which would otherwise ring at a pitch of its own, and stops the whole string when the key lets go. Thin it out to hear the afterlengths and a long, open-string release.' },
      { id: 'loss', label: 'String losses (air and wire)', min: 0.25, max: 4, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)}`,
        hint: 'Scales the air’s drag on the wire and its internal friction. Applies to new notes.' },
      { id: 'fmax', label: 'Highest partial', min: 4, max: 16, def: 10, step: 0.5, fmt: (v) => `${v.toFixed(1)} kHz`,
        hint: 'Partials above this are left out (and at most 96 per string). Lower it if the CPU pill runs hot. Applies to new notes.' },
      { id: 'soundboard', label: 'Soundboard', type: 'checkbox', def: true,
        hint: 'The strings themselves make almost no sound; the small, thin board under the bridge does. Off, you hear the force on the bridge directly, as a contact pickup would.' },
      { id: 'fullRange', label: 'Full range (A0–C8)', type: 'checkbox', def: false,
        hint: 'Opens the keys beyond the five-octave FF–f³ compass: the same scale of strings, carried on down to A0 and up to C8.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.2, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Unfretted: two strings to every key', p: {} },
  { name: 'Double-fretted: neighbouring keys share strings', p: { fretting: 'fretted' } },
  { name: '4′ strings in the bass', p: { octave: true } },
  { name: 'Bebung: the finger rocks the key', p: { bebung: 0.45 } },
  { name: 'Light touch: flat and thin', p: { press: 0.35 } },
  { name: 'Heavy touch: pressed sharp', p: { press: 2 } },
  { name: 'Heavy key, heavy finger: notes start sharp', p: { mass: 32 } },
  { name: 'No listing: the afterlengths ring', p: { listing: 0.03 } },
  { name: 'Fretted in ¼-comma meantone, at A = 415 Hz', p: { fretting: 'fretted', pitch: 415, temperament: 'meantone' } },
  { name: 'Without the soundboard (bridge force)', p: { soundboard: false } },
];
