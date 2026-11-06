// saw-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const time = (v) => (v < 1 ? `${(v * 1000).toFixed(v < 0.01 ? 1 : 0)} ms` : `${v.toFixed(2)} s`);
const secs = (v) => `${v.toFixed(v < 10 ? 1 : 0)} s`;
const hz = (v) => `${v.toFixed(1)} Hz`;
const cm = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} cm`;

export const GROUPS = [
  {
    title: 'Playing',
    params: [
      { id: 'mode', label: 'Playing', type: 'select', def: 'keys', perform: true, options: [['keys', 'Keys: a saw for every key'], ['saw', 'One saw: the note slides from key to key']], hint: 'A musical saw is one blade, and the player moves its note by bending it, so it plays one note at a time and slides between them. Keys gives every key a saw of its own, so chords play; One saw is the instrument as played, a single note that slides to each key pressed while another is held, and back when it lets go.' },
      { id: 'glide', label: 'Re-bending (key to key)', perform: true, min: 0.005, max: 1.5, def: 0.15, log: true, fmt: time, showIf: (P) => P.mode === 'saw', hint: 'How long the player takes to bend the blade from one note to the next while the first key is held: the S slides along the blade and the note slides with it, evenly in semitones.' },
      { id: 'excite', label: 'Played with', type: 'select', def: 'bow', perform: true, options: [['bow', 'A bow, on the smooth edge'], ['mallet', 'A felt mallet, on the face']], hint: 'Saws are bowed on their back edge with a cello or double-bass bow, which sustains the note while the key is down, or struck with a soft mallet, which lets it ring.' },
      { id: 'vibrato', label: 'Vibrato (the knee shakes)', perform: true, strip: true, min: 0, max: 60, def: 12, step: 0.5, fmt: (v) => `±${v.toFixed(v < 10 ? 1 : 0)} ¢`, hint: 'The handle is held between the knees, and a shaking knee wobbles the bend, and with it the note: the saw\'s singing vibrato. It comes in once the note has started. The mod wheel shakes it from here.' },
      { id: 'vibRate', label: 'Vibrato rate', min: 2, max: 9, def: 5.5, step: 0.1, fmt: hz, hint: 'How many times a second the knee shakes.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'How hard the computer keys play: how hard the bow presses and how fast it draws, or how fast the mallet comes down.' },
    ],
  },
  {
    title: 'The bend',
    params: [
      { id: 'shape', label: 'Bent into', type: 'select', def: 'S', perform: true, options: [['S', 'An S: the curvature turns over'], ['J', 'A J: bent one way only']], hint: 'Bent into an S, the blade\'s curvature changes sign along a line across it, its inflection, and a mode is trapped there: the curved blade on either side cannot carry it, so it rings on, untouched by the hands. Bent into a J there is no inflection and nothing is trapped: the same waves run out to the hands and die at once.' },
      { id: 'bend', label: 'How tight the S (curvature gradient)', perform: true, min: 1.5, max: 20, def: 6, log: true, fmt: (v) => `${v.toFixed(1)} /m²`, hint: 'How fast the curvature changes through the inflection. Tighter squeezes the trapped mode into a narrower band across the blade and raises its pitch, so for the same note the S sits further back toward the handle; looser lets the mode spread out until it reaches the hands, and the note dies away.' },
      { id: 'thickness', label: 'Blade thickness', min: 0.5, max: 1.2, def: 0.75, step: 0.01, fmt: (v) => `${v.toFixed(2)} mm`, hint: 'A thicker blade is stiffer, so each place along it rings higher and every note sits further toward the wide handle end, where the curvature traps it less tightly.' },
      { id: 'ring', label: 'Ring time (at A4)', min: 0.5, max: 12, def: 2.5, log: true, fmt: secs, hint: 'How long the trapped note rings once the bow lifts, from the steel\'s own losses and the sound it gives off, before any of it leaks to the hands. Lower notes ring longer, higher ones shorter.' },
    ],
  },
  {
    title: 'Bow and mallet',
    params: [
      { id: 'place', label: 'Where it is played (from the sweet spot)', perform: true, min: -8, max: 8, def: 0, step: 0.1, fmt: cm, hint: 'Where the bow crosses the edge, or the mallet lands, along the blade from the inflection: plus toward the tip. At the inflection the bow drives the trapped mode best. Off it the mode moves less under the bow, so it needs more pressure; a few centimetres off, the saw falls silent, or, on the high notes, where the second trapped mode is close above, jumps to that one.' },
      { id: 'force', label: 'Bow pressure (× threshold)', perform: true, min: 0.3, max: 12, def: 2.5, log: true, fmt: (v) => `${v.toFixed(1)}×`, showIf: (P) => P.excite === 'bow', hint: 'How hard the bow presses on the edge, as a multiple of the force at which the trapped mode just starts to grow (where the rosin\'s fall in friction with speed pays for the mode\'s losses). Under 1 the saw stays silent; well above, it bites and can squeal. Velocity and aftertouch press harder.' },
      { id: 'speed', label: 'Bow speed', min: 0.05, max: 0.6, def: 0.2, log: true, fmt: (v) => `${(v * 100).toFixed(0)} cm/s`, showIf: (P) => P.excite === 'bow', hint: 'How fast the bow is drawn across the edge. Slower is gentler and darker, and needs less pressure to speak.' },
      { id: 'contact', label: 'Mallet contact time', min: 0.2, max: 6, def: 1.5, log: true, fmt: (v) => `${v.toFixed(v < 1 ? 2 : 1)} ms`, showIf: (P) => P.excite === 'mallet', hint: 'How long the felt stays on the steel. Soft and long reaches only the trapped note; hard and short knocks the higher modes too.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.35, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Bowed saw', p: {} },
  { name: 'One saw, sliding from note to note', p: { mode: 'saw', vibrato: 16 } },
  { name: 'Struck with a felt mallet', p: { excite: 'mallet' } },
  { name: 'A still knee: no vibrato', p: { vibrato: 0 } },
  { name: 'Loose bend: the note leaks to the hands', p: { bend: 2 } },
  { name: 'Bent into a J: no inflection, no note', p: { shape: 'J', excite: 'mallet' } },
  { name: 'Bowed 5 cm off the sweet spot: silent, or the next mode up', p: { place: 5 } },
  { name: 'Pressing too hard: the bow bites', p: { force: 9, speed: 0.5 } },
  { name: 'Thick blade, tight bend', p: { thickness: 1.1, bend: 14 } },
  { name: 'Slow, wide vibrato, long ring', p: { mode: 'saw', vibrato: 30, vibRate: 4, ring: 6, glide: 0.3 } },
];
