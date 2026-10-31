// regal-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pa = (v) => `${v.toFixed(0)} Pa (${(v / 9.81).toFixed(0)} mm of water)`;
const times = (v) => `× ${v < 1 ? v.toFixed(2) : v.toFixed(1)}`;

// The resonators, as Praetorius drew them (Syntagma musicum II, 1619, plate XXXVIII): the order is
// the contract's (append only).
export const RESONATORS = [
  ['regal', 'Short cylinders (Jungfernregal)'],
  ['funnel', 'Short funnels (Trichterregal)'],
  ['apple', 'Capped balls with holes (Apfelregal)'],
  ['none', 'None: bare shallots'],
];

export const GROUPS = [
  {
    title: 'Stops',
    params: [
      { id: 'regal8', face: 'drawknob', faceLabel: 'Regal 8′', label: 'Regal 8′ (one reed a key)', perform: true, type: 'checkbox', def: true,
        hint: 'The regal itself: one beating reed a key, sounding the written pitch.' },
      { id: 'regal4', face: 'drawknob', faceLabel: 'Regal 4′', label: 'Regal 4′ (an octave up)', perform: true, type: 'checkbox', def: false,
        hint: 'A second rank of reeds an octave higher, half the size: a brighter, more singing regal.' },
      { id: 'regal16', face: 'drawknob', faceLabel: 'Sordun 16′', label: 'Sordun 16′ (an octave down)', perform: true, type: 'checkbox', def: false,
        hint: 'A rank of long reeds an octave lower, as in the bigger regals Praetorius describes: a dark, buzzing bass.' },
      { id: 'tremulant', face: 'drawknob', faceLabel: 'Tremu­lant', label: 'Tremulant', perform: true, strip: true, type: 'checkbox', def: false,
        hint: 'A sprung pallet in the wind trunk that opens a vent a few times a second: the wind, and so every reed\'s loudness and pitch, pulses.' },
      { id: 'tremRate', label: 'Tremulant rate', min: 3, max: 9, def: 5.5, step: 0.1, fmt: (v) => `${v.toFixed(1)} beats/s`, showIf: (P) => P.tremulant,
        hint: 'How fast the flap beats: set by its spring and weight.' },
    ],
  },
  {
    title: 'Resonators',
    params: [
      { id: 'resonator', label: 'Resonators', face: 'selector', perform: true, type: 'select', def: 'regal', options: RESONATORS,
        shortLabels: ['Cylinder', 'Funnel', 'Apple', 'None'],
        hint: 'What sits on each reed\'s shallot. A regal\'s resonators are a small fraction of a pipe\'s length, so the tongue sets the pitch and they only colour it, each with a formant of its own: a cylinder\'s nasal buzz, a funnel\'s open brightness, a capped ball\'s muffled hum, or the bare shallot\'s raw rasp. Each kind is retuned for its reeds.' },
      { id: 'resLength', label: 'Resonator length', min: 0.5, max: 2, def: 1, log: true, fmt: times,
        hint: 'Each resonator longer or shorter than the voicer cut it: its formant moves, longer darker and more nasal, shorter thinner and brighter, and the pitch shifts a little with it. Applies to new notes.' },
    ],
  },
  {
    title: 'Wind',
    params: [
      { id: 'pressure', label: 'Wind pressure', perform: true, min: 400, max: 1000, def: 600, log: true, fmt: pa,
        hint: 'The weight on the bellows. More wind: louder, brassier, quicker to speak and sharper, since the tongue slaps harder and spends longer on its shallot; less, and the treble stops first. Mod wheel up and aftertouch lean on the bellows (aftertouch up to a quarter more).' },
      { id: 'bellows', label: 'Bellows', type: 'select', def: 'hand', options: [['hand', 'Two wedge bellows, worked by hand'], ['blower', 'A steady blower and reservoir']],
        hint: 'A regal\'s two weighted wedge bellows, one sinking while the calcant raises the other: the wind gives a little as a chord comes in, rises as a bellows sinks, and shakes when the other takes over. Or a modern blower\'s steady wind.' },
      { id: 'velocity', label: 'Velocity (computer keys)', strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => `${v.toFixed(2)} (pallet opens in ${(3 + 27 * (1 - v) ** 2).toFixed(0)} ms)`,
        hint: 'How fast the key opens the pallet: a fast pallet slams the wind into the reed\'s boot and starts it sooner.' },
    ],
  },
  {
    title: 'Tongues (voicing)',
    params: [
      { id: 'curve', label: 'Curve: tip off the shallot', min: 0.2, max: 1.6, def: 0.6, step: 0.01, fmt: (v) => `${v.toFixed(2)} mm at C4`,
        hint: 'How far the voicer curved the tongue up off the shallot (scaled with the reed). More curve: the tongue swings further and slaps harder, louder and brassier. Little curve: a thin, quiet buzz. Applies to new notes.' },
      { id: 'thickness', label: 'Tongue thickness', min: 0.6, max: 1.6, def: 1, step: 0.01, fmt: times,
        hint: 'Thicker brass, recut longer to keep its note: a heavier tongue that the wind moves less, darker and slower to speak. Thinner: lighter, quicker and more fiery. Applies to new notes.' },
      { id: 'facing', label: 'Shallot facing', type: 'select', def: 'brass', options: [['brass', 'Bare brass: a hard slap'], ['leather', 'Leathered: a soft, padded close']],
        hint: 'What the tongue beats on. Bare brass stops the tongue dead and the flow with it: a bright, buzzing regal. A leathered shallot cushions the close: rounder and quieter, as some regals and later reed stops were voiced. Applies to new notes.' },
      { id: 'q', label: 'Tongue Q (mechanical)', min: 20, max: 400, def: 120, log: true, fmt: (v) => v.toFixed(0),
        hint: 'The brass tongue\'s own losses, with its wedge and tuning wire. A lossier tongue needs more wind to start. Applies to new notes.' },
      { id: 'fullRange', label: 'Full range (A0–C8)', type: 'checkbox', def: false,
        hint: 'Opens the keys beyond the regal\'s C2–C6: the same reeds, shallots and resonators carried on down to A0 and up to C8.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.3, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Regal 8′: short brass resonators', p: {} },
  { name: 'Charon’s regal: 8′ and 4′ (Monteverdi, Orfeo)', p: { regal4: true } },
  { name: 'Full regal: Sordun 16′, 8′ and 4′', p: { regal16: true, regal4: true } },
  { name: 'Funnel regal (Trichterregal): open and bright', p: { resonator: 'funnel' } },
  { name: 'Apple regal (Apfelregal): capped and muffled', p: { resonator: 'apple' } },
  { name: 'Bare shallots: the tongues alone', p: { resonator: 'none' } },
  { name: 'Tremulant: the wind pulses', p: { tremulant: true } },
  { name: 'Leathered shallots: soft and round', p: { facing: 'leather' } },
  { name: 'Much curve: loud and brassy', p: { curve: 1.2 } },
  { name: 'Little curve: a thin, quiet buzz', p: { curve: 0.3 } },
  { name: 'Strong wind: loud, brassy and sharp', p: { pressure: 950 } },
  { name: 'Gentle wind: slow to speak, the treble shy', p: { pressure: 450 } },
  { name: 'Long resonators: darker, more nasal', p: { resLength: 1.8 } },
  { name: 'Steady blower: no bellows to sink or shake', p: { bellows: 'blower' } },
];
