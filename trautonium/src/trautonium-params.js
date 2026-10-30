// trautonium-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pct = (v) => `${(v * 100).toFixed(0)} %`;
const time = (v) => (v < 1 ? `${(v * 1000).toFixed(v < 0.01 ? 1 : 0)} ms` : `${v.toFixed(2)} s`);
const hz = (v) => (v < 1000 ? `${v.toFixed(0)} Hz` : `${(v / 1000).toFixed(2)} kHz`);

// The four dividers of Sala's Mixtur-Trautonium: each a lamp of its own, fired by every n-th pulse
// of the master (1–24, as his rotary switches), mixed in at its own level.
const DIVIDERS = [2, 3, 4, 5].flatMap((def, i) => [
  { id: `div${i + 1}`, label: `Divider ${i + 1} (÷n)`, min: 1, max: 24, def, step: 1, fmt: (v) => `÷${v.toFixed(0)}`, hint: `The whole number that divider ${i + 1}'s lamp divides the master's pulses by: it fires on every n-th of them and sounds the note's n-th subharmonic, f/n. Sala set his on 24-position switches.` },
  { id: `sub${i + 1}`, label: `Divider ${i + 1} level`, min: 0, max: 1, def: 0, step: 0.01, fmt: pct, hint: `How much of divider ${i + 1}'s sawtooth goes into the mixture. At zero it is switched out.` },
]);

// Trautwein's resonant circuits: a coil and a rotary capacitor each, rung by every discharge of the lamps.
const FORMANT_DEF = [[500, 8, 1], [1400, 8, 0.6], [2600, 10, 0], [3600, 12, 0]];
const FORMANTS = FORMANT_DEF.flatMap(([f, q, g], i) => [
  { id: `f${i + 1}`, label: `Circuit ${i + 1} tuning`, perform: i < 2, min: 80, max: 6000, def: f, log: true, fmt: hz, hint: i === 0
    ? 'The resonant frequency 1/2π√LC of the first circuit, turned with its rotary capacitor: fixed, whatever note is played, so it lifts whichever harmonics fall near it, as a vowel\'s formant does. The mod wheel sweeps it up from here.'
    : `The resonant frequency 1/2π√LC of circuit ${i + 1}, turned with its rotary capacitor: fixed, whatever note is played.` },
  { id: `q${i + 1}`, label: `Circuit ${i + 1} resonance (Q)`, min: 1, max: 40, def: q, log: true, fmt: (v) => `Q ${v.toFixed(1)}`, hint: 'The circuit\'s quality factor, √(L/C)/R: how sharply it picks out the harmonics near its tuning, and how long it rings after each discharge (Q/πf). Each discharge rings it equally hard, so a sharper circuit rings longer and louder. Low notes ring it once a period, so a high Q sounds as a pitched click under them.' },
  { id: `g${i + 1}`, label: `Circuit ${i + 1} level`, min: 0, max: 1, def: g, step: 0.01, fmt: pct, hint: i < 2 ? 'How much of this circuit goes to the amplifier. Trautwein\'s first instrument had two resonant circuits; Sala\'s Mixtur-Trautonium four to a manual.' : 'How much of this circuit goes to the amplifier (off on Trautwein\'s two-circuit instrument).' },
]);

export const GROUPS = [
  {
    title: 'Wire',
    params: [
      { id: 'mode', label: 'Playing', type: 'select', def: 'keys', perform: true, options: [['keys', 'Keys: a wire for every key'], ['wire', 'One wire: the tone slides from key to key']], hint: 'The Trautonium is played on a resistance wire over a metal rail: wherever the finger presses the wire onto the rail sets the pitch, and a finger sliding along it glides. Keys gives every key a manual of its own, so chords play; One wire is the instrument as built, a single tone that slides to each key pressed while another is held, and back when it lets go.' },
      { id: 'glide', label: 'Finger slide (key to key)', perform: true, min: 0.005, max: 1.5, def: 0.15, log: true, fmt: time, showIf: (P) => P.mode === 'wire', hint: 'How long the finger takes to slide along the wire to the next key while the first is held. It slides at a steady speed, and the wire\'s resistance grows evenly along it, so the pitch falls in 1/R: quickly through the high notes, slowly through the low ones, as on a string.' },
      { id: 'press', label: 'Finger\'s press (attack)', min: 0.001, max: 0.3, def: 0.012, log: true, fmt: time, hint: 'How long a finger takes to press the wire fully down onto the rail, which sets the loudness through the rail\'s pressure sensor (Sala\'s manuals; velocity and aftertouch press harder). A hard key presses in half the time, a soft one in one and a half.' },
      { id: 'lift', label: 'Finger\'s lift (release)', min: 0.002, max: 1, def: 0.03, log: true, fmt: time, hint: 'How long the pressure takes to let go when the key is released: then the wire leaves the rail and the lamps stop.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.75, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'How hard the computer keys press the wire. Aftertouch presses harder still.' },
    ],
  },
  {
    title: 'Lamp',
    params: [
      { id: 'supply', label: 'Supply voltage', min: 95, max: 400, def: 150, log: true, fmt: (v) => `${v.toFixed(0)} V`, hint: 'The voltage the capacitor charges toward through the wire, between the neon lamp\'s striking voltage (90 V) and its going out (60 V). Near 90 V the charging curve bends over before the lamp fires: a rounder, darker sawtooth. Far above, the ramp is straight and bright. Every key is retuned for it, so the pitch stays.' },
    ],
  },
  {
    title: 'Mixture',
    params: [
      { id: 'master', label: 'Master level', min: 0, max: 1, def: 1, step: 0.01, fmt: pct, hint: 'How much of the master lamp, the one the wire tunes, goes into the mixture. At zero it still runs and fires the dividers, silently.' },
      ...DIVIDERS,
      { id: 'sync', label: 'Sync pulse', perform: true, min: 0, max: 0.25, def: 0.03, step: 0.001, fmt: (v) => `${(v * 100).toFixed(1)} % of the swing`, hint: 'How far each of the master\'s discharges lifts the dividers\' lamps toward striking, as a fraction of the lamp\'s 30 V swing. A divider close enough to striking fires with the master. Too weak and the dividers slip out of step and drift flat; too strong and the high dividers fire a pulse early, ÷(n−1) instead of ÷n.' },
      { id: 'slack', label: 'Dividers\' slack', min: 0, max: 0.15, def: 0.02, step: 0.001, fmt: (v) => `${(v * 100).toFixed(1)} % slow`, hint: 'How much slower than f/n each divider\'s lamp would run on its own: its timing resistor is ganged to the wire, so it tracks the master. It must run a little slow for the master\'s pulse to catch it; the sync pulse has to cover the slack.' },
    ],
  },
  {
    title: 'Formants',
    params: [
      { id: 'dry', label: 'Direct sawtooth', min: 0, max: 1, def: 0.25, step: 0.01, fmt: pct, hint: 'How much of the mixture\'s sawtooth goes to the amplifier around the resonant circuits.' },
      ...FORMANTS,
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'swell', label: 'Volume pedal', perform: true, strip: true, min: 0, max: 1, def: 1, step: 0.01, fmt: pct, hint: 'The foot pedal that set the 1930 Trautonium\'s loudness (MIDI CC11, expression).' },
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.3, step: 0.01, fmt: pct },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Trautonium (Trautwein, 1930)', p: {} },
  { name: 'Mixtur: the undertones ÷2 ÷3 ÷4 ÷5', p: { master: 0.8, sub1: 0.7, sub2: 0.55, sub3: 0.45, sub4: 0.35 } },
  { name: 'Subharmonic bass (÷2 and ÷4)', p: { master: 0.6, div1: 2, div2: 4, sub1: 0.8, sub2: 0.6 } },
  { name: 'One wire, sliding between keys', p: { mode: 'wire' } },
  { name: 'The bare lamp (no resonant circuits)', p: { dry: 1, g1: 0, g2: 0 } },
  { name: 'Vowel “ee” (300 Hz and 2.3 kHz)', p: { f1: 300, f2: 2300, q1: 10, q2: 12, g2: 0.8, dry: 0.15 } },
  { name: 'Vowel “oo” (300 and 800 Hz)', p: { f1: 300, f2: 800, q1: 10, q2: 10, g2: 0.7, dry: 0.1 } },
  { name: 'Ringing circuits (Q 40)', p: { q1: 40, q2: 40, dry: 0.1 } },
  { name: 'Wing beats: ÷24 rings the circuits', p: { master: 0, div1: 24, sub1: 1, dry: 0, q1: 25, q2: 25, g3: 0.5 } },
  { name: 'Weak sync: the dividers slip', p: { sync: 0.004, master: 0.8, sub1: 0.7, sub2: 0.55, sub3: 0.45, sub4: 0.35 } },
  { name: 'Strong sync: ÷10 and ÷16 fire a pulse early', p: { sync: 0.1, div1: 2, div2: 5, div3: 10, div4: 16, master: 0.6, sub1: 0.7, sub2: 0.7, sub3: 0.6, sub4: 0.5 } },
  { name: 'Supply near the strike voltage (rounded ramps)', p: { supply: 100 } },
];
