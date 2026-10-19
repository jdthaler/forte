// pipes-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says what
// it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pa = (v) => `${v.toFixed(0)} Pa (${(v / 9.81).toFixed(0)} mm of water)`;
const times = (v) => `× ${v < 1 ? v.toFixed(2) : v.toFixed(1)}`;

export const GROUPS = [
  {
    title: 'Stops',
    params: [
      { id: 'principal', label: 'Principal 8′', perform: true, type: 'checkbox', def: true,
        hint: 'Open metal pipes at the written pitch, on Töpfer’s normal scale: the organ’s own sound.' },
      { id: 'octave', label: 'Octave 4′', perform: true, type: 'checkbox', def: false,
        hint: 'Open pipes an octave higher: half the length, brighter.' },
      { id: 'gedackt', label: 'Gedackt 8′', perform: true, type: 'checkbox', def: false,
        hint: 'Stopped pipes at the written pitch: capped at the top, so half as long and sounding only the odd harmonics (1, 3, 5…): a soft, hollow flute.' },
      { id: 'mixture', label: 'Mixture III', perform: true, type: 'checkbox', def: false,
        hint: 'Three small open pipes a key, sounding octaves and fifths far above the note (1⅓′ 1′ ⅔′ in the bass), breaking back an octave at each c so they never get too small: the organ’s brilliance.' },
      { id: 'tremulant', label: 'Tremulant', perform: true, type: 'checkbox', def: false,
        hint: 'A valve that opens and shuts a leak from the wind chest several times a second: the wind, and with it every pipe, pulses.' },
      { id: 'tremRate', label: 'Tremulant rate', min: 2, max: 10, def: 5.5, step: 0.1, fmt: (v) => `${v.toFixed(1)} beats/s`, showIf: (P) => P.tremulant,
        hint: 'How fast the tremulant’s valve beats.' },
      { id: 'tremDepth', label: 'Tremulant depth', min: 0.05, max: 1, def: 0.5, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of its valve`, showIf: (P) => P.tremulant,
        hint: 'How far the valve opens: how much wind it lets out, and how deep the wind pulses.' },
    ],
  },
  {
    title: 'Wind',
    params: [
      { id: 'pressure', label: 'Wind pressure', perform: true, min: 150, max: 6000, def: 700, log: true, fmt: pa,
        hint: 'The pressure the bellows’ weights set. The jets go faster (U = √(2p/ρ)), the pipes louder and brighter, the pitch barely higher; far above the voiced 700 Pa the pipes overblow to their next mode (an open pipe’s octave, a stopped one’s twelfth), and come back only well below where they jumped (lower the cut-up to bring that within reach). Too little and the pipes speak late and weak, then barely at all. Mod wheel: up to 3000 Pa.' },
      { id: 'wind', label: 'Wind: steady … flexible', min: 0, max: 1, def: 0.35, step: 0.01, fmt: (v) => (v < 0.15 ? `steady (Schwimmer) ${(v * 100).toFixed(0)} %` : v > 0.85 ? `flexible (long trunk) ${(v * 100).toFixed(0)} %` : `${(v * 100).toFixed(0)} % flexible`),
        hint: 'Steady: a regulator in the chest holds the pressure. Flexible, the Baroque way: the chest is fed only through the trunk from the bellows, so big chords drain it, the pressure dips and the wind “breathes”, ringing at a few hertz.' },
      { id: 'rise', label: 'Pallet: pressure rise', min: 1, max: 80, def: 12, log: true, fmt: (v) => `${v < 10 ? v.toFixed(1) : v.toFixed(0)} ms at velocity 0.7`,
        hint: 'How long the key’s pallet takes to open, so how fast the pressure rises at the pipe’s foot (Nolle & Finch 1992). Fast: the jet hits the labium at once and the upper modes speak first: more chiff. Slow: the pipe swells in more smoothly. Velocity scales it (twice as fast per +0.3).' },
      { id: 'velocity', label: 'Velocity (computer keys)', min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => `${v.toFixed(2)} (pallet in ${(2 ** ((0.7 - v) / 0.3)).toFixed(2)} × its time)`, // ×2 per −0.3, as the engine's palletTime
        hint: 'An organ has no loudness touch: velocity only sets how fast the pallet opens, which shapes the attack (the chiff), not the level.' },
    ],
  },
  {
    title: 'Voicing',
    params: [
      { id: 'cutup', label: 'Mouth cut-up', min: 0.5, max: 2, def: 1, log: true, fmt: times,
        hint: 'The height of the mouth, the distance W the jet crosses. A low cut-up puts more jet-speed per wave across the mouth, U/(fW): brighter, chiffier and quicker to overblow. A high one: rounder, slower, flatter, and too high it will not speak. The pipes keep their length (their pitch moves a little); the jet is re-voiced to keep its gain. Applies to new notes.' },
      { id: 'gain', label: 'Jet gain (flue and languid)', min: 0.4, max: 2.5, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)} (loop gain ${(6 * v).toFixed(1)})`,
        hint: 'How strongly the jet amplifies the disturbance it picks up at the flue on its way to the labium, as the voicer sets it with the flue and languid. Less: slow, gentle speech. More: prompt, chiffy, loud speech and wilder transients. Applies to new notes.' },
      { id: 'offset', label: 'Labium offset', min: 0, max: 1.5, def: 0.4, step: 0.01, fmt: (v) => `${v.toFixed(2)} jet widths`,
        hint: 'How far the labium’s edge sits off the jet’s centre line. Centred, the jet splits symmetrically and the even harmonics vanish; set off, it splits unevenly and they grow. Applies to new notes.' },
      { id: 'noise', label: 'Jet turbulence', min: 0, max: 4, def: 1, step: 0.05, fmt: times,
        hint: 'The random flutter of the jet: wind noise in the tone, and the seed the oscillation grows from.' },
      { id: 'fullRange', label: 'Full range (A0–C8)', type: 'checkbox', def: false,
        hint: 'Opens the keys past the C–f³ manual, A₂–c⁵: the same scales and voicing carried on, down to a Principal pipe 5.7 m long (27.5 Hz), slow to speak as big pipes are, and up to c⁵ (4.2 kHz), the Mixture breaking back twice more.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room (church)', perform: true, min: 0, max: 1, def: 0.55, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Principal 8′: the organ’s own voice', p: {} },
  { name: 'Plenum: Principal 8′, Octave 4′ and Mixture', p: { octave: true, mixture: true } },
  { name: 'Gedackt 8′: stopped pipes, odd harmonics', p: { principal: false, gedackt: true } },
  { name: 'Gedackt 8′ with the tremulant', p: { principal: false, gedackt: true, tremulant: true } },
  { name: 'Principal 8′ and Octave 4′', p: { octave: true } },
  { name: 'Full organ: every stop', p: { octave: true, gedackt: true, mixture: true } },
  { name: 'Flexible wind: the plenum breathes', p: { octave: true, mixture: true, wind: 1 } },
  { name: 'Steady wind: a Schwimmer in the chest', p: { octave: true, mixture: true, wind: 0 } },
  { name: 'Fast pallet: the upper modes speak first (chiff)', p: { rise: 1.5 } },
  { name: 'Slow pallet: the pipes swell in', p: { rise: 60 } },
  { name: 'Low cut-up: bright, close to overblowing', p: { cutup: 0.85 } },
  { name: 'High cut-up: round, slow and flat', p: { cutup: 1.5 } },
  { name: 'Overblown: strong wind on a low cut-up', p: { cutup: 0.7, pressure: 2500 } },
  { name: 'Gentle wind: 300 Pa', p: { pressure: 300 } },
  { name: 'Centred labium: no even harmonics', p: { offset: 0 } },
  { name: 'Turbulent jet: breathy', p: { noise: 4 } },
  { name: 'Low jet gain: slow, gentle speech', p: { gain: 0.5 } },
];
