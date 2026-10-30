// hydraulis-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pa = (v) => `${v.toFixed(0)} Pa (${(v / 9.81).toFixed(0)} mm of water)`;
const times = (v) => `× ${v < 1 ? v.toFixed(2) : v.toFixed(1)}`;
// a pump's cycle at this effort, as hydraulis-model.h's strokeTime: 4 s down to 0.4 s
export const strokeTime = (e) => 4 * 0.1 ** e;

export const GROUPS = [
  {
    title: 'Ranks',
    params: [
      { id: 'open', face: 'lever', label: 'Open rank', perform: true, type: 'checkbox', def: true,
        hint: 'Open bronze pipes at the written pitch, of nearly one bore as the Dion organ’s are, so slender in the bass and wide in the treble: the hydraulis’s bright, reedy voice. A stopcock turns the rank’s channel on.' },
      { id: 'stopped', face: 'lever', label: 'Stopped rank', perform: true, type: 'checkbox', def: false,
        hint: 'Pipes capped at the top, so half as long for the same pitch and sounding only the odd harmonics (1, 3, 5…): a soft, hollow flute. Aquincum’s organ had three stopped ranks to its one open one.' },
      { id: 'low', face: 'lever', label: 'Stopped rank, octave below', perform: true, type: 'checkbox', def: false,
        hint: 'Stopped pipes an octave down, as long as the open rank’s: a dark hum under the note. Below A1 it breaks back to the unison, so that no pipe sounds under 27.5 Hz.' },
      { id: 'high', face: 'lever', label: 'Stopped rank, octave above', perform: true, type: 'checkbox', def: false,
        hint: 'Stopped pipes an octave up, a quarter of the open rank’s length: a whistling edge over the note.' },
    ],
  },
  {
    title: 'Pumps and water',
    params: [
      { id: 'effort', label: 'Pumping effort', perform: true, strip: true, min: 0, max: 1, def: 0.5, step: 0.01,
        fmt: (v) => `${(60 / strokeTime(v)).toFixed(0)} strokes a minute`,
        hint: 'How fast and how hard the pumpers work the levers (strokes a minute from each pump): each stroke of a piston pushes 2 litres of air through its valve into the bowl under the water, faster the more the wind has sagged. They rest while the bowl is full. Too slow for the pipes and the wind sags under chords (all four ranks need hard pumping); fast, and the bowl stays full, air gurgling out under its rim. Mod wheel and key pressure: harder pumping.' },
      { id: 'pumps', label: 'Pumps', type: 'select', def: 'two', options: [['one', 'One pump (Hero)'], ['two', 'Two pumps, in turn (Vitruvius)']],
        hint: 'Hero describes one cylinder and piston; Vitruvius two, worked in turn by a rocking lever, so the strokes come twice as often for the same effort and each one is half the work of keeping up.' },
      { id: 'rim', label: 'Water over the rim (full wind)', min: 200, max: 2500, def: 700, log: true, fmt: pa,
        hint: 'How deep the inverted bowl (the pnigeus) stands in the cistern. The air in it pushes the water down inside and up outside; once the water inside reaches the rim, air bubbles out under it, so the depth sets the most wind the bowl can hold. The pipes are voiced for 700 Pa: more and they sound louder, brighter and a little sharp, and overblow when pushed.' },
      { id: 'cistern', label: 'Cistern size', min: 0.4, max: 2.5, def: 1, log: true, fmt: (v) => `${times(v)} (bowl ${(60 * Math.sqrt(v)).toFixed(0)} cm across)`,
        hint: 'The width of the bowl and the cistern. Wider water takes more air for the same rise in pressure, so each stroke and each chord moves the wind less, and the water under the rim bounces more slowly. A small cistern makes the wind wobble with every stroke.' },
      { id: 'gurgle', label: 'Gurgle (air bubbling under the rim)', min: 0, max: 2, def: 1, step: 0.01, fmt: times,
        hint: 'How loud the bubbles are that escape under the bowl’s rim when the pumpers overfill it: each one rings at its Minnaert frequency as it breaks away.' },
    ],
  },
  {
    title: 'Keys',
    params: [
      { id: 'push', label: 'Slide: push time', min: 2, max: 60, def: 10, log: true, fmt: (v) => `${v < 10 ? v.toFixed(1) : v.toFixed(0)} ms at velocity 0.7`,
        hint: 'How long a key takes to push its perforated slide across, until its holes line up under the pipes. The holes open as two circles sliding over each other, so a slow push lets the jets swell in; a quick one makes them speak at once, with a chiff. Velocity scales it (twice as fast per +0.3).' },
      { id: 'spring', label: 'Return spring', min: 4, max: 80, def: 15, log: true, fmt: (v) => `shuts in ${v < 10 ? v.toFixed(1) : v.toFixed(0)} ms`,
        hint: 'The spring that pulls the slide back when the key comes up (strips of horn in Hero, iron in Vitruvius). Stiff: the note stops short. Soft: the holes close lazily and the note dies away as its wind is cut.' },
      { id: 'velocity', label: 'Velocity (computer keys)', min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => `${v.toFixed(2)} (slide in ${(2 ** ((0.7 - v) / 0.3)).toFixed(2)} × its time)`, // ×2 per −0.3, as the engine's pushTime
        hint: 'Velocity only sets how fast the slide is pushed, which shapes the attack, not the level.' },
    ],
  },
  {
    title: 'Pipes',
    params: [
      { id: 'bore', label: 'Bore scaling', min: 0.05, max: 0.9, def: 0.21, step: 0.01, fmt: (v) => `width halves over ${(1 / v).toFixed(1)} octaves`,
        hint: 'How fast the pipes narrow up the compass. Ancient pipes were of nearly one bore (Dion’s are all about 18 mm across); here they narrow by a quarter over the two octaves (0.21), so the bass pipes are slender and reedy and the treble ones wide and fluty. 0.75 narrows as fast as a modern organ’s normal scale (Töpfer’s, halving on the seventeenth pipe). The pipes keep 34 mm at G3: as narrow as Dion’s they overblow in this model. Applies to new notes.' },
      { id: 'cutup', label: 'Mouth cut-up', min: 0.5, max: 2, def: 1, log: true, fmt: times,
        hint: 'The height of the mouth, the distance the jet crosses. Low: brighter, chiffier and quicker to overblow. High: rounder and slower, and too high it will not speak. Applies to new notes.' },
      { id: 'gain', label: 'Jet gain (flue and languid)', min: 0.4, max: 2.5, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)}`,
        hint: 'How strongly the jet amplifies what it picks up on its way to the edge. Less: slow, gentle speech. More: prompt, chiffy, loud speech. Applies to new notes.' },
      { id: 'offset', label: 'Labium offset', min: 0, max: 1.5, def: 0.4, step: 0.01, fmt: (v) => `${v.toFixed(2)} jet widths`,
        hint: 'How far the edge sits off the jet’s centre line. Centred, the even harmonics vanish; set off, they grow. Applies to new notes.' },
      { id: 'noise', label: 'Jet turbulence', min: 0, max: 4, def: 1, step: 0.05, fmt: times,
        hint: 'The random flutter of the jets: wind noise in the tone, and the seed the oscillation grows from.' },
      { id: 'fullRange', label: 'Full range (A0–C8)', type: 'checkbox', def: false,
        hint: 'Opens the keys past the two octaves G3–G5, about the compass of the surviving ancient organs: the same voicing carried on, the bass pipes widening and the treble ones narrowing as a modern organ’s, down to an open pipe nearly 6 m long and up to C8.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room (arena)', min: 0, max: 1, def: 0.4, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Open rank: the bronze pipes of Dion', p: {} },
  { name: 'Open and stopped ranks together', p: { stopped: true } },
  { name: 'Stopped rank alone: soft and hollow', p: { open: false, stopped: true } },
  { name: 'All four ranks, as at Aquincum (hard pumping)', p: { stopped: true, low: true, high: true, effort: 0.9 } },
  { name: 'Stopped octaves below and above', p: { open: false, low: true, high: true } },
  { name: 'Tired pumpers: the wind sags under chords', p: { effort: 0.12, stopped: true, low: true } },
  { name: 'Eager pumpers: a full bowl, gurgling', p: { effort: 0.95 } },
  { name: 'One pump (Hero): a stroke at a time', p: { pumps: 'one', effort: 0.35 } },
  { name: 'Small cistern: the wind wobbles', p: { cistern: 0.45, stopped: true } },
  { name: 'Wide cistern: a steady wind', p: { cistern: 2.4, stopped: true } },
  { name: 'Deep water: a strong wind', p: { rim: 1500 } },
  { name: 'Shallow water: a gentle wind', p: { rim: 350 } },
  { name: 'Quick slides and a stiff iron spring', p: { push: 3, spring: 5 } },
  { name: 'Slow slides and a soft horn spring', p: { push: 40, spring: 60 } },
  { name: 'Modern bore: narrowing as Töpfer’s scale', p: { bore: 0.75 } },
  { name: 'Turbulent jets: breathy', p: { noise: 3 } },
];
