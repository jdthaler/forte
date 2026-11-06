// cimbalom-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pct = (v) => `${(v * 100).toFixed(0)} %`;
const times = (v) => `× ${v < 1 ? v.toFixed(2) : v.toFixed(1)}`;

export const BUILDS = [
  ['cimbalom', 'Concert cimbalom (Schunda)'],
  ['dulcimer', 'Hammered dulcimer'],
];
export const HEADS = [
  ['cotton', 'Cotton-wound tips'],
  ['leather', 'Leather faces'],
  ['wood', 'Bare wood'],
];

export const DAMPERS = [
  ['keys', 'Damper bar, lifted by a held key or the pedal'],
  ['pedal', 'Damper bar, lifted only by the pedal (the cimbalom)'],
  ['none', 'No dampers (the dulcimer)'],
];

export const GROUPS = [
  {
    title: 'Instrument',
    params: [
      { id: 'build', label: 'Instrument', type: 'select', options: BUILDS, def: 'cimbalom', face: 'selector', shortLabels: ['Cimbalom', 'Dulcimer'],
        hint: 'The concert cimbalom has four steel strings to a note in the treble and three copper-wound in the bass. The hammered dulcimer has two, and its treble bridge divides each string into two notes a fifth apart: strike one side and the other rings along.' },
      { id: 'detune', label: 'Unison spread', min: 0, max: 8, def: 1, step: 0.05, fmt: (v) => `${v.toFixed(2)} ¢`,
        hint: 'How far apart the tuner left the strings of each note. A little spread makes the note bloom and decay in two stages (the strings fall out of step and stop driving the bridge together); more beats.' },
      { id: 'bridge', label: 'Bridge mobility', min: 0.25, max: 4, def: 1, log: true, fmt: times,
        hint: 'How freely the bridge moves on the soundboard. More: louder and shorter notes, and more of the other strings ringing along.' },
      { id: 'loss', label: 'String losses', min: 0.25, max: 4, def: 1, log: true, fmt: times,
        hint: 'Air drag and the wire\'s internal friction. More dulls the upper partials sooner.' },
    ],
  },
  {
    title: 'Hammers',
    params: [
      { id: 'head', label: 'Hammer head', type: 'select', options: HEADS, def: 'cotton', perform: true, face: 'rockers', shortLabels: ['Cotton', 'Leather', 'Wood'],
        hint: 'Cotton wool wound on the tips (the cimbalom\'s) stays on the strings for a millisecond or more and leaves the high partials out; leather is quicker; bare wood leaves in a tenth of a millisecond and rings every partial: the bright, metallic dulcimer.' },
      { id: 'mass', label: 'Hammer mass', min: 1, max: 20, def: 3, log: true, fmt: (v) => `${v.toFixed(1)} g`,
        hint: 'The hammer as the strings feel it, its head and the stick behind it. Light hammers are thrown back by the wave reflected from the near bridge; heavy ones stay on longer and sound darker and fuller.' },
      { id: 'stick', label: 'Stick stiffness', min: 20, max: 2000, def: 800, log: true, fmt: (v) => `${v.toFixed(0)} Hz`,
        hint: 'How stiffly the stick holds the head: the frequency the head would bob at on it. A whippy stick (low) leaves the head alone on the strings for a short blow, bright in the treble, and its follow-through can strike again; a stiff one puts the whole hammer behind the head.' },
      { id: 'strike', label: 'Strike point (from the bridge)', perform: true, min: 0.03, max: 0.5, def: 0.12, step: 0.005, fmt: pct,
        hint: 'Where along the string the hammer lands. Near the bridge the short stretch of string drives it hard and high (brilliant and thin); at the middle the even partials vanish (hollow).' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    title: 'Playing',
    params: [
      { id: 'roll', label: 'Tremolo (strokes a second)', perform: true, strip: true, min: 0, max: 20, def: 0, step: 0.5, fmt: (v) => (v > 0 ? `${v.toFixed(1)} /s` : 'off'),
        hint: 'The cimbalom\'s tremolo: while a key is held, the two hammers strike it again and again, the hands alternating. Aftertouch sets how hard.' },
      { id: 'dampers', label: 'Dampers', type: 'select', options: DAMPERS, def: 'keys', perform: true, face: 'rockers', shortLabels: ['Keys', 'Pedal', 'None'],
        hint: 'The concert cimbalom\'s felt damper bar rests on every string until the pedal (Space) lifts it: notes are short unless the pedal is down. "Keys" lets a held key keep its own strings free too, as a keyboard player expects. The hammered dulcimer has no dampers: every string rings until it dies away.' },
      { id: 'sympathy', label: 'Sympathetic strings', perform: true, min: 0, max: 1, def: 0.5, step: 0.01, fmt: pct,
        hint: 'How much the undamped strings of the other notes ring along through the bridge they share: the cloud of sound around a dulcimer, or a cimbalom with the pedal down.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.25, step: 0.01, fmt: pct },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Concert cimbalom, cotton hammers', p: {} },
  { name: 'Cimbalom tremolo', p: { roll: 12 } },
  { name: 'Cimbalom as built: the pedal lifts the dampers', p: { dampers: 'pedal' } },
  { name: 'Hammered dulcimer, bare wood', p: { build: 'dulcimer', head: 'wood', dampers: 'none', strike: 0.1, detune: 1.5 } },
  { name: 'Dulcimer with leather hammers', p: { build: 'dulcimer', head: 'leather', dampers: 'none' } },
  { name: 'Whippy bamboo sticks', p: { stick: 40, head: 'leather' } },
  { name: 'Struck near the bridge', p: { strike: 0.04, head: 'leather' } },
  { name: 'Struck at the middle: hollow', p: { strike: 0.5 } },
  { name: 'Heavy hammers', p: { mass: 12 } },
  { name: 'Unisons in perfect tune', p: { detune: 0 } },
  { name: 'Out-of-tune tavern cimbalom', p: { detune: 6, bridge: 1.5 } },
  { name: 'Dulcimer drone cloud', p: { build: 'dulcimer', head: 'wood', dampers: 'none', sympathy: 1, bridge: 1.6 } },
];
