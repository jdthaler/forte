// cellulophone-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pct = (v) => `${(v * 100).toFixed(0)} %`;

export const GROUPS = [
  {
    title: 'Discs',
    params: [
      { id: 'disc', label: 'Disc', type: 'select', def: '54',
        options: [['54', '54 slots on the C ring, as built'], ['216', '216 slots on the C ring (four times as fine)'], ['864', '864 slots on the C ring (sixteen times as fine)']],
        hint: 'One disc an octave carries the twelve semitones as twelve rings of slots, and a ring sounds its slots times the disc\'s turns a second. Slots come in whole numbers, so every ring but the one the motor is set by (A) is a little out of tune: up to 12 ¢ on Toulon\'s 54-slot disc, "permanently out of tune", as Tom Rhea put it. A finer disc rounds closer.' },
      { id: 'slot', label: 'Slot width', min: 0.02, max: 0.9, def: 0.06, step: 0.005, fmt: (v) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)} % of the pitch`,
        hint: 'How wide each slot is, as a fraction of the distance from one slot to the next. The slot is the window\'s scanning aperture: it averages the screen over its width, which dulls the harmonics (each by sinc(n × width)) and lets more light through. Narrow is bright and faint; wide is dull and loud; at 100 % the disc would be all open and silent.' },
      { id: 'wear', label: 'Slot-cutting error', min: 0, max: 0.05, def: 0.004, step: 0.001, fmt: (v) => `${(v * 100).toFixed(1)} %`,
        hint: 'How far each slot\'s width and place stray from the pattern, as a fraction of the slot pitch. The errors come round once a turn, so they add a faint buzz at the disc\'s turning rate (under 1 Hz on the lowest disc, 40 a second on the highest): sidebands around every note.' },
      { id: 'hunt', label: 'Motor hunting', min: 0, max: 20, def: 1, step: 0.1, fmt: (v) => (v < 0.05 ? 'steady' : `±${v.toFixed(1)} ¢`),
        hint: 'How far the motor\'s speed swings about its mean, about once a second. Every disc is geared to it, so the whole instrument wavers together, in tune with itself. Pitch bend turns the motor\'s speed too, as fast as the discs\' inertia lets it.' },
    ],
  },
  {
    title: 'Screens',
    params: [
      { id: 'screen', label: 'Screen', type: 'select', def: 'flute', perform: true,
        options: [['sine', 'Sine: a pure tone'], ['flute', 'Flûte'], ['clarinet', 'Clarinette: odd harmonics'], ['oboe', 'Hautbois'], ['horn', 'Trompe de chasse'], ['violin', 'Violon'], ['voix', 'Voix humaine'], ['octaves', 'A screen for each octave']],
        hint: 'The screen in each window: a transparent plate whose clearness across the window is one period of the wave. The light through it, and so the photocell\'s current, follows the drawing. The stops turned a disc of screens to bring another series into the windows. With a screen for each octave, every disc has its own, as Tom Rhea noted the design allowed: eight timbres on one keyboard.' },
      { id: 'push', label: 'Key pushed back (timbre)', min: 0, max: 1, def: 0, step: 0.01, perform: true, strip: true, fmt: pct,
        hint: 'How far the keys are pushed back from the player (the mod wheel; MPE slide moves one key). Toulon\'s key slides a second screen into its window as it moves back: a slit that narrows the clear part of the screen. Stacked screens multiply, so the light comes in shorter flashes: brighter and buzzier. Less light gets through on average, but each flash still swings from dark to clear, so the note keeps its loudness.' },
      { id: 'tremolo', label: 'Tremolo screen', min: 0, max: 1, def: 0, step: 0.01, perform: true, fmt: (v) => (v < 0.005 ? 'off' : pct(v)),
        hint: 'A slotted screen turning in the beam, for "the tremolo of the hunting horn": how much of the light it cuts at its darkest. 0 keeps it out of the beam.' },
      { id: 'tremRate', label: 'Tremolo rate', min: 4, max: 12, def: 9, step: 0.1, fmt: (v) => `${v.toFixed(1)} Hz`,
        showIf: (P) => P.tremolo > 0,
        hint: 'How many times a second the tremolo screen cuts the light: "8 or 10 per second" in the patent.' },
    ],
  },
  {
    title: 'Keys',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.8, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'How hard the computer keys go down.' },
      { id: 'keyTouch', label: 'Key touch (depth screen)', min: 0, max: 1, def: 0.7, step: 0.01, fmt: pct,
        hint: 'How much the depth of a key sets its loudness. Pressing a key down moves a screen whose clearness grows evenly with depth into its beam: a light touch lets little light through. Aftertouch presses the key deeper. At 0 every key lets its full beam through.' },
      { id: 'mirror', label: 'Mirror travel', min: 1, max: 40, def: 8, log: true, fmt: (v) => `${v.toFixed(v < 10 ? 1 : 0)} ms`,
        hint: 'How long a key\'s little mirror takes to tilt across its beam and send it to the photocell (a quick key, a little less). The light grows as the mirror\'s edge sweeps over the round spot: quick is a click as the note\'s steady light arrives, slow is a soft swell in and out.' },
      { id: 'damping', label: 'Damping arcs (piano)', min: 0, max: 10, def: 0, step: 0.05, perform: true, fmt: (v) => (v < 0.025 ? 'off' : `${v.toFixed(1)} s`),
        hint: 'Toulon\'s damping: slots whose length shortens along an arc, so a note\'s light narrows away as the arc turns past, "like a piano". The light falls evenly to nothing over this time (a straight line, not a ring\'s exponential). Off sustains like an organ.' },
    ],
  },
  {
    title: 'Light and cell',
    params: [
      { id: 'lamp', label: 'Lamps', type: 'select', def: 'battery',
        options: [['battery', 'On batteries: a steady light'], ['50', 'On the mains, 50 Hz (Paris)'], ['60', 'On the mains, 60 Hz']],
        hint: 'The four tungsten lamps that light the discs. On alternating current the filament cools a little between the peaks, so its light ripples at twice the mains frequency (about 5 % at 50 Hz): every held note brings a 100 Hz hum with it, and sidebands 100 Hz either side.' },
      { id: 'cell', label: 'Photocell', type: 'select', def: 'potassium',
        options: [['potassium', 'Potassium, in vacuum (Toulon\'s choice)'], ['selenium', 'Selenium (the cell Toulon ruled out)']],
        hint: 'What turns each octave\'s light into current. A potassium cell in vacuum answers at once and in proportion: the "cell without inertia" the patent asks for. Selenium answers slowly (part of it over 30 ms) and as the 0.6 power of the light, so its notes are muffled, swell in late and growl together when they share a cell.' },
    ],
  },
  {
    title: 'Amplifier and loudspeaker',
    params: [
      { id: 'drive', label: 'Valve amplifier drive', min: 0, max: 1, def: 0.15, step: 0.01, fmt: pct,
        hint: 'How hard the photocell\'s tiny current drives the valve amplifier. Past its straight part the valves round off the peaks: chords thicken with sum and difference tones.' },
      { id: 'speaker', label: 'Loudspeaker', type: 'select', def: 'cone',
        options: [['cone', 'Moving-coil cone (Rice and Kellogg, 1925)'], ['horn', 'Horn loudspeaker'], ['none', 'None: the amplifier\'s output']],
        hint: 'A cone in a baffle answers from its resonance near 90 Hz up to where its paper stops moving as one, near 4.5 kHz. A horn starts higher (its flare\'s cut-off near 180 Hz) and its driver\'s diaphragm rings near 2.2 kHz. Without one, the lowest notes keep their fundamentals.' },
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
  { name: 'Flûte, as built: the 54-slot disc', p: {} },
  { name: 'A pure sine screen', p: { screen: 'sine' } },
  { name: 'Clarinette: the odd harmonics', p: { screen: 'clarinet' } },
  { name: 'Hautbois', p: { screen: 'oboe' } },
  { name: 'Trompe de chasse with its tremolo', p: { screen: 'horn', tremolo: 0.6, tremRate: 9 } },
  { name: 'Violon', p: { screen: 'violin' } },
  { name: 'Voix humaine, slow tremolo', p: { screen: 'voix', tremolo: 0.3, tremRate: 6 } },
  { name: 'Eight timbres: a screen for each octave', p: { screen: 'octaves' } },
  { name: 'Piano: the damping arcs', p: { screen: 'violin', damping: 2.5, mirror: 3 } },
  { name: 'In tune: a disc sixteen times as fine', p: { disc: '864' } },
  { name: 'Narrow slots: bright and faint', p: { screen: 'oboe', slot: 0.025 } },
  { name: 'Wide slots: dull and loud', p: { screen: 'oboe', slot: 0.3 } },
  { name: 'Lamps on the Paris mains: a 100 Hz hum', p: { lamp: '50' } },
  { name: 'A selenium cell (the one Toulon ruled out)', p: { cell: 'selenium' } },
  { name: 'A worn disc on a hunting motor', p: { wear: 0.03, hunt: 8 } },
  { name: 'Horn loudspeaker, driven hard', p: { screen: 'horn', speaker: 'horn', drive: 0.7 } },
  { name: 'No loudspeaker: the amplifier\'s output', p: { speaker: 'none' } },
];
