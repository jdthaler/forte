// ondes-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pct = (v) => `${(v * 100).toFixed(0)} %`;
const time = (v) => (v < 1 ? `${(v * 1000).toFixed(v < 0.01 ? 1 : 0)} ms` : `${v.toFixed(2)} s`);
const hz = (v) => `${v.toFixed(v < 10 ? 2 : 1)} Hz`;
const secs = (v) => `${v.toFixed(v < 10 ? 1 : 0)} s`;

// The timbre switches of the drawer, as Loriod's method names them: each a circuit that shapes
// the beat note, any of them on at once.
const TIMBRES = [ // id, label, default, its tab's legend, hint
  ['tO', 'O (onde)', true, 'O onde', 'The beat note as the detector gives it: nearly a sine, with as much of its own harmonics as the detector balance lets through.'],
  ['tC', 'C (creux)', false, 'C creux', 'Hollow: the beat note through a rectifier that passes one half of each cycle, so the fundamental comes with its even harmonics (2, 4, 6, … falling as 1/n²).'],
  ['tg', 'g (petit gambe)', false, 'g petit gambe', 'The little gamba: odd harmonics falling as the square of their number, a triangle wave. Soft and reedy.'],
  ['tG', 'G (gambe)', false, 'G gambe', 'The gamba: odd harmonics falling as their number, a square wave, as an amplifier driven into clipping makes of a sine. Bowed and woody.'],
  ['tN', 'N (nasillard)', false, 'N nasillard', 'Nasal: a narrow pulse each cycle, every harmonic present up to where the pulse\'s width cuts them off.'],
];

export const GROUPS = [
  {
    title: 'Playing',
    params: [
      { id: 'mode', label: 'Playing', type: 'select', def: 'keys', perform: true, options: [['keys', 'Keys: an ondes for every key'], ['ribbon', 'Ribbon: one tone that slides from key to key']], hint: 'The ondes Martenot is played from its keyboard or from the ribbon in front of it, a wire pulled by a ring on the finger, which turns the variable oscillator\'s capacitor. Keys gives every key an instrument of its own, so chords play; Ribbon is the instrument as built, one tone that slides to each key pressed while another is held, and back when it lets go.' },
      { id: 'glide', label: 'Ring\'s slide (key to key)', perform: true, min: 0.005, max: 1.5, def: 0.12, log: true, fmt: time, showIf: (P) => P.mode === 'ribbon', hint: 'How long the ring on the finger takes to slide along the ribbon to the next key while the first is held. The keyboard printed over the ribbon has keys of equal width, so the pitch slides evenly in semitones.' },
      { id: 'vibrato', label: 'Keyboard vibrato (side to side)', perform: true, strip: true, min: 0, max: 60, def: 0, step: 0.5, fmt: (v) => `±${v.toFixed(v < 10 ? 1 : 0)} ¢`, hint: 'The keyboard\'s keys rock from side to side, and a finger rocking a key moves the variable capacitor with it: a vibrato that goes as deep as the finger rocks. The mod wheel rocks it from here.' },
      { id: 'vibRate', label: 'Vibrato rate', min: 3, max: 9, def: 5.5, step: 0.1, fmt: hz, hint: 'How many times a second the finger rocks the key.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'How hard the computer keys press the intensity key. Aftertouch presses harder still.' },
    ],
  },
  {
    title: 'Intensity key',
    params: [
      { id: 'press', label: 'Pressing the key (attack)', min: 0.002, max: 0.5, def: 0.03, log: true, fmt: time, hint: 'How long the left hand takes to press the intensity key down: a bag of graphite and mica powder that conducts better the harder it is squeezed, so the note swells in as it is pressed. Velocity sets how hard (0.3 to 3 N), aftertouch presses harder (to 10 N).' },
      { id: 'lift', label: 'Letting go (release)', min: 0.002, max: 1, def: 0.012, log: true, fmt: time, hint: 'How long the note takes to die away when the key comes up. The powder lets go faster than it squeezes, so a note ends more abruptly than it begins, and the key\'s contact opens at the top: silence.' },
    ],
  },
  {
    title: 'Oscillators',
    params: [
      { id: 'balance', label: 'Detector balance (A₂/A₁)', min: 0.02, max: 1, def: 0.3, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'How strong the variable oscillator is against the fixed one where the detector meets them. The detector follows the envelope of their sum, |A₁ + A₂e^{iφ}|: weak, it is a pure sine at the beat; equal, a full-wave rectified sine, every harmonic falling as 1/(4n² − 1).' },
      { id: 'pull', label: 'Pulling (lock range)', min: 0, max: 40, def: 1.5, step: 0.1, fmt: hz, hint: 'How strongly the two radio-frequency oscillators pull on each other (Adler, 1946): within this many hertz of each other they lock and the beat stops. Above, the beat still slows where the pull is strongest, so the low notes sound buzzier, their harmonics falling only as rⁿ, r = (Δ − √(Δ² − K²))/K. Every key is retuned for it, so the pitch stays.' },
      { id: 'drift', label: 'Thermal drift', min: 0, max: 3, def: 0, step: 0.01, fmt: hz, hint: 'How far the oscillators wander as their valves warm (rms). The audible note is the difference of two frequencies near 100 kHz, so a few parts per million moves it by hertz, the same hertz on every note: the low notes drift the most in cents.' },
    ],
  },
  {
    title: 'Timbres',
    params: [
      ...TIMBRES.map(([id, label, def, faceLabel, hint]) => ({ id, label, type: 'checkbox', def, face: 'tab', faceLabel, hint })),
      { id: 'width', label: 'Nasillard pulse width', min: 0.05, max: 0.5, def: 0.15, step: 0.01, fmt: pct, showIf: (P) => P.tN, hint: 'The share of each cycle the nasillard\'s pulse is on. Narrower is thinner and more nasal; half is a square wave.' },
      { id: 'octave', label: '8 (octaviant)', perform: true, min: 0, max: 1, def: 0, step: 0.01, fmt: pct, hint: 'The octave above, from a full-wave rectifier: |cos φ| repeats twice a cycle. Its slider mixes it in.' },
      { id: 'souffle', label: 'S (souffle)', perform: true, min: 0, max: 1, def: 0, step: 0.01, fmt: pct, hint: 'Breath: pink noise of no pitch, mixed with the note under the intensity key.' },
    ],
  },
  {
    title: 'Diffuseurs',
    params: [
      { id: 'dP', label: 'Principal (D1)', min: 0, max: 1, def: 1, step: 0.01, fmt: pct, hint: 'The principal loudspeaker: a large cone, its own resonance the lowest note it gives out.' },
      { id: 'dR', label: 'Résonance (D2): springs', perform: true, min: 0, max: 1, def: 0, step: 0.01, fmt: pct, hint: 'A loudspeaker with seven brass springs stretched in front of it, fixed to its voice coil: they ring on after the note, a reverberation of chirps.' },
      { id: 'dM', label: 'Métallique (D3): tam-tam', perform: true, min: 0, max: 1, def: 0, step: 0.01, fmt: pct, hint: 'A tam-tam in place of the cone: the voice coil drives the bronze plate, whose hundreds of modes ring around every note, a metallic halo.' },
      { id: 'dPalme', label: 'Palme (D4): strings', perform: true, min: 0, max: 1, def: 0.3, step: 0.01, fmt: pct, hint: 'A palm-leaf sound box with twelve strings on each face, tuned to the twelve semitones, driven through their bridge: a note rings the strings of its own pitch class and its harmonics\'.' },
      { id: 'springT60', label: 'Springs\' ring (T60)', min: 0.3, max: 8, def: 2.5, log: true, fmt: secs, hint: 'How long the springs ring on, at 500 Hz.' },
      { id: 'gongD', label: 'Tam-tam diameter', min: 40, max: 75, def: 55, step: 1, fmt: (v) => `${v.toFixed(0)} cm`, hint: 'The tam-tam\'s size, 40 to 75 cm across on the instruments that survive. A bigger plate has lower and denser modes.' },
      { id: 'gongT60', label: 'Tam-tam\'s ring (T60 at 1 kHz)', min: 0.5, max: 15, def: 4, log: true, fmt: secs, hint: 'How long the tam-tam rings on at 1 kHz; lower modes ring longer, higher ones shorter (a constant loss factor).' },
      { id: 'palmeT60', label: 'Palme strings\' ring (T60)', min: 0.5, max: 15, def: 5, log: true, fmt: secs, hint: 'How long the palme\'s strings ring on, at A2.' },
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
  { name: 'Ondes Martenot (principal and palme)', p: {} },
  { name: 'Ribbon: one voice, sliding', p: { mode: 'ribbon', vibrato: 12 } },
  { name: 'Gambe on the ribbon, through the tam-tam', p: { mode: 'ribbon', glide: 0.25, tO: false, tG: true, dP: 0.7, dM: 0.8, dPalme: 0, vibrato: 18 } },
  { name: 'Pure onde (no diffuseur colour)', p: { dPalme: 0, balance: 0.1 } },
  { name: 'Métallique: the tam-tam alone', p: { dP: 0, dPalme: 0, dM: 1 } },
  { name: 'Résonance: the springs', p: { dP: 0.6, dPalme: 0, dR: 1 } },
  { name: 'Palme: the strings ringing', p: { dP: 0.5, dPalme: 1, palmeT60: 8 } },
  { name: 'Creux and octaviant', p: { tO: false, tC: true, octave: 0.5 } },
  { name: 'Nasillard (narrow pulse)', p: { tO: false, tN: true, width: 0.1 } },
  { name: 'Petit gambe with souffle', p: { tO: false, tg: true, souffle: 0.25 } },
  { name: 'Strong pulling: the low notes buzz and lock', p: { pull: 25, balance: 0.1, dPalme: 0 } },
  { name: 'Warming up (thermal drift)', p: { drift: 1.2 } },
];
