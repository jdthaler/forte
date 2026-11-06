// marimba-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const sci = (v) => { const e = Math.floor(Math.log10(v)), m = v / 10 ** e; return `${m.toFixed(1)}×10${String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])}`; };
const head = (v) => (v < 120 ? 'soft yarn' : v < 400 ? 'medium-soft yarn' : v < 1500 ? 'medium yarn' : v < 4000 ? 'hard yarn or rubber' : 'hard rubber or plastic');

export const KINDS = [['marimba', 'Marimba (1 : 4 : 10)'], ['xylophone', 'Xylophone (1 : 3)']];

export const GROUPS = [
  {
    title: 'Bars',
    params: [
      { id: 'kind', label: 'Instrument', face: 'selector', perform: true, type: 'select', def: 'marimba', options: KINDS,
        hint: 'Both are rosewood bars over stopped tubes; they differ in how the bars are cut. The marimba’s wide, deep arch puts the first three modes at 1 : 4 : 10, two octaves and then three octaves and a third above the note: a round, mellow tone. The xylophone’s thick bars have a short, shallow cut that puts the first overtone a twelfth up (1 : 3): bright and dry.' },
      { id: 'depth', label: 'Undercut depth', min: 0, max: 1.2, def: 1, step: 0.01, fmt: (v) => (v === 0 ? 'none: a plain bar' : v === 1 ? 'tuned' : `${(v * 100).toFixed(0)} % of the tuned cut`),
        hint: 'The arch cut under each bar. Tuned (100 %), the marimba’s modes sit at 1 : 4 : 10 and the xylophone’s at 1 : 3; a plain bar rings at 1 : 2.76 : 5.40, not a chord. Each bar is cut to the length that keeps it on pitch. Applies to the next strike.' },
      { id: 'eta', label: 'Wood’s internal friction η', min: 1e-3, max: 3e-2, def: 4e-3, log: true, fmt: sci,
        hint: 'The rosewood’s loss factor along the grain. Wood loses a hundred times more than the vibraphone’s aluminium: it is why a marimba’s note dies in a second or two and its upper partials far sooner. Lower: a ringing bar; higher: a dry, dead one.' },
    ],
  },
  {
    title: 'Resonators',
    params: [
      { id: 'tubes', label: 'Resonator tubes', type: 'checkbox', def: true,
        hint: 'A stopped tube under each bar, tuned to its fundamental. Off: the bar alone, a weak radiator of its own fundamental.' },
      { id: 'gap', label: 'Bar–tube gap', min: 5, max: 80, def: 25, log: true, fmt: (v) => `${v.toFixed(1)} mm`,
        hint: 'How far below the bar the tube’s mouth sits. Closer: more of the bar’s air is pushed into the tube, a louder, shorter note; very close, bar and tube trade energy back and forth.' },
      { id: 'detune', label: 'Tube tuning', min: -200, max: 200, def: 0, step: 1, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)} ¢`,
        hint: 'The tube’s own pitch relative to its bar. Off tune, it takes less energy from the bar: a quieter, longer note.' },
      { id: 'offset', label: 'Tube mouth off centre', min: 0, max: 0.3, def: 0, step: 0.005, fmt: (v) => (v === 0 ? 'centred' : `${(v * 100).toFixed(1)} % of the bar’s length`),
        hint: 'A stopped tube also resonates three times higher, right on a xylophone bar’s first overtone (1 : 3). But that mode rocks the bar about its centre, so a centred mouth gets nothing from it. Move the mouth towards one end and the tube’s second resonance takes it up: the twelfth grows louder and shorter.' },
    ],
  },
  {
    title: 'Mallets',
    params: [
      { id: 'hardness', label: 'Mallet hardness', min: 30, max: 30000, def: 300, log: true, fmt: (v) => `${v.toFixed(0)} N at 1 mm (${head(v)})`,
        hint: 'The head’s force when squashed by 1 mm (F = Kδ^2.3). Harder heads leave the bar sooner and reach the upper modes; softer ones give a round, dark tone. Marimbists use yarn; xylophonists hard rubber or plastic.' },
      { id: 'mass', label: 'Mallet head mass', min: 5, max: 40, def: 14, step: 0.5, fmt: (v) => `${v.toFixed(1)} g`,
        hint: 'A heavier head stays on the bar longer: more fundamental, fewer upper partials.' },
      { id: 'strike', label: 'Strike point', perform: true, min: 0.02, max: 0.5, def: 0.42, step: 0.005, fmt: (v) => (v >= 0.5 ? 'the centre' : `${(v * 100).toFixed(1)} % from the end`),
        hint: 'At the centre, mode 2 has a node and stays silent. At the end every mode speaks; on mode 1’s node (≈ 22 %) the fundamental drops out.' },
      { id: 'across', label: 'Off the centre line', min: 0, max: 0.9, def: 0.1, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of the half-width`,
        hint: 'Striking towards a long edge twists the bar: its torsional modes join in.' },
      { id: 'speedMax', label: 'Mallet speed at full velocity', min: 0.5, max: 5, def: 3, step: 0.1, fmt: (v) => `${v.toFixed(1)} m/s`,
        hint: 'The head’s speed for velocity 1. Faster strikes squash the head further and stiffen the contact: louder and brighter, not just louder.' },
      { id: 'roll', label: 'Roll', perform: true, strip: true, min: 0, max: 1, def: 0, step: 0.01, fmt: (v) => (v === 0 ? 'off' : `${(v * 100).toFixed(0)} % of the stroke`),
        hint: 'A bar can’t be made to sustain, so a marimbist rolls: held notes are struck again and again, the two mallets in turn, at this fraction of the first stroke. The mod wheel sets it, and a note’s own MPE slide rolls that note.' },
      { id: 'rollRate', label: 'Roll speed', min: 4, max: 24, def: 12, step: 0.5, fmt: (v) => `${v.toFixed(1)} strokes/s`,
        hint: 'Strokes per second, both mallets together. Marimbists roll slower in the bass, where a bar rings longer.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.6, step: 0.01, fmt: (v) => v.toFixed(2) },
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
  { name: 'Marimba: medium yarn mallets', p: {} },
  { name: 'Xylophone: hard plastic mallets', p: { kind: 'xylophone', hardness: 12000, mass: 12, strike: 0.45 } },
  { name: 'Marimba rolled: a chorale', p: { roll: 0.55, rollRate: 10, hardness: 200 } },
  { name: 'Soft yarn: dark and round', p: { hardness: 80, mass: 20 } },
  { name: 'Marimba with xylophone mallets', p: { hardness: 12000, mass: 12 } },
  { name: 'Xylophone with yarn mallets', p: { kind: 'xylophone' } },
  { name: 'Xylophone, tubes off centre: the twelfth sings', p: { kind: 'xylophone', hardness: 12000, mass: 12, offset: 0.2, strike: 0.15 } },
  { name: 'No resonators: the bars alone', p: { tubes: false } },
  { name: 'Tubes pressed close: bar and tube trade energy', p: { gap: 6 } },
  { name: 'Tubes a semitone sharp', p: { detune: 100 } },
  { name: 'Plain bars, 1 : 2.76 : 5.40', p: { depth: 0 } },
  { name: 'Struck at the node: the fundamental drops out', p: { strike: 0.22, hardness: 1500 } },
  { name: 'Struck off the edge: the bars twist', p: { across: 0.85, hardness: 1500 } },
  { name: 'Dry wood: a dead, lossy bar', p: { eta: 0.025 } },
  { name: 'A ringing bar: low-loss wood', p: { eta: 0.0012 } },
];
