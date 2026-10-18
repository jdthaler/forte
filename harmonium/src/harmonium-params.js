// harmonium-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';

const pa = (v) => `${v.toFixed(0)} Pa (${(v / 9.81).toFixed(0)} mm of water)`;
const times = (v) => `× ${v < 1 ? v.toFixed(2) : v.toFixed(1)}`;

export const GROUPS = [
  {
    title: 'Stops',
    params: [
      { id: 'principal', label: '8′ (one reed a key)', perform: true, type: 'checkbox', def: true,
        hint: 'The main rank: one reed a key, sounding the written pitch.' },
      { id: 'musette', label: 'Musette (voix céleste)', perform: true, type: 'select', def: 'off',
        options: [['off', 'Off'], ['two', 'Two reeds: 8′ and one tuned sharp'], ['three', 'Three reeds: one flat, one true, one sharp']],
        hint: 'Extra 8′ reeds a few cents off, as an accordion’s musette or a harmonium’s voix céleste: they beat against each other at their frequency difference.' },
      { id: 'detune', label: 'Musette detune', min: 0, max: 40, def: 12, step: 0.5, fmt: (v) => `±${v.toFixed(1)} ¢ (${(440 * (2 ** (v / 1200) - 1)).toFixed(1)} beats/s at A4)`,
        hint: 'How far the musette’s reeds are tuned off. Beats = the frequency difference: a slow shimmer at a few cents, a wet tremolo at 20–30. Applies to new notes.' },
      { id: 'bourdon', label: '16′ (an octave down)', perform: true, type: 'checkbox', def: false,
        hint: 'A rank of reeds an octave lower: long, weighted tongues.' },
      { id: 'piccolo', label: '4′ (an octave up)', perform: true, type: 'checkbox', def: false,
        hint: 'A rank of short reeds an octave higher: brightens the sound.' },
      { id: 'percussion', label: 'Percussion (on the 8′)', perform: true, type: 'checkbox', def: false,
        hint: 'Martin’s percussion action (1841): a small hammer strikes the 8′ reed as the key goes down, so it speaks at once instead of swelling out of the wind. Velocity sets the blow.' },
    ],
  },
  {
    title: 'Wind',
    params: [
      { id: 'pressure', label: 'Bellows pressure', perform: true, min: 100, max: 2500, def: 800, log: true, fmt: pa,
        hint: 'The wind every reed blows against: louder, brighter and quicker to speak as it rises, and a little flatter. Mod wheel up and aftertouch raise it (aftertouch up to double).' },
      { id: 'expression', label: 'Expression stop', perform: true, type: 'checkbox', def: false,
        hint: 'Shuts off the reservoir, so the pressure follows the bellows within milliseconds (the harmonium’s expression stop, and how an accordion always works): a big chord’s sag is immediate, and the pumping is heard.' },
      { id: 'pump', label: 'Pumping', min: 0, max: 3, def: 0, step: 0.05, fmt: (v) => (v ? `${v.toFixed(2)} strokes/s per foot` : 'steady (a blower)'),
        hint: 'Two feeders worked alternately by the feet. Each stroke delivers unevenly, so the wind swells twice per stroke: smoothed by the reservoir, heard through the expression stop.' },
      { id: 'velocity', label: 'Velocity (computer keys)', min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => `${v.toFixed(2)} (pallet opens in ${(3 + 27 * (1 - v) ** 2).toFixed(0)} ms)`,
        hint: 'How fast the key opens the pallet. A fast pallet slams the wind into the reed’s cell, which kicks the reed and starts it sooner; the loudness is the wind’s.' },
    ],
  },
  {
    title: 'Reeds (voicing)',
    params: [
      { id: 'set', label: 'Set: tip above the slot', min: 0.3, max: 2.5, def: 0.9, step: 0.05, fmt: (v) => `${v.toFixed(2)} mm at C4`,
        hint: 'How far the voicer bent the tip up out of the slot (scaled with the reed’s length). Little set: prompt, soft, bright and a little flat. Much set: slow to speak, loud and round. Applies to new notes.' },
      { id: 'clearance', label: 'Slot clearance', min: 10, max: 200, def: 40, step: 1, fmt: (v) => `${v.toFixed(0)} µm at C4`,
        hint: 'The gap round the reed’s sides and tip inside the slot. A close fit chops the flow cleanly into pulses; a loose one leaks all the time: softer, slower to speak, a little duller. Applies to new notes.' },
      { id: 'q', label: 'Reed Q (mechanical)', min: 50, max: 800, def: 500, log: true, fmt: (v) => `${v.toFixed(0)}`,
        hint: 'The brass tongue’s own losses. A lossier reed needs more wind to start. Applies to new notes.' },
      { id: 'throat', label: 'Air mass feeding the reed', min: 0.2, max: 3, def: 1, log: true, fmt: times,
        hint: 'The inertance of the throat that feeds the reed’s cell (its length over its area). This air’s inertia is what drives a free reed. More: quicker speech, a brighter and flatter tone, a higher threshold. Less: slow, dark speech, and the treble struggles to start. Applies to new notes.' },
      { id: 'cell', label: 'Reed cell volume', min: 0.2, max: 4, def: 1, log: true, fmt: times,
        hint: 'The pocket of air under the reed, sized so that its resonance with the throat sits 3× above the reed. A bigger cell brings that resonance down towards the reed: a lower pitch, a higher threshold and a darker tone. Applies to new notes.' },
    ],
  },
  {
    title: 'Cassotto and output',
    params: [
      { id: 'cassotto', label: 'Cassotto (tone chamber)', type: 'checkbox', def: false,
        hint: 'The accordion’s tone chamber: the reeds sound into a box with one mouth, a Helmholtz resonator that softens everything above its resonance and puts its pressure back on the reeds. Mono: the sound leaves through one mouth.' },
      { id: 'cassF', label: 'Cassotto resonance', min: 300, max: 3000, def: 1500, log: true, fmt: (v) => `${v.toFixed(0)} Hz`, showIf: (P) => P.cassotto,
        hint: 'The chamber’s Helmholtz frequency (volume and mouth): above it the sound falls 12 dB per octave.' },
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.3, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Harmonium 8′: one brass reed a key', p: {} },
  { name: 'Musette: three reeds 12 ¢ apart (accordion)', p: { musette: 'three' } },
  { name: 'Voix céleste: two reeds, a slow 4 ¢ shimmer', p: { musette: 'two', detune: 4 } },
  { name: 'Wet musette: three reeds 30 ¢ apart', p: { musette: 'three', detune: 30 } },
  { name: 'Full organ: 16′, 8′ and 4′', p: { bourdon: true, piccolo: true } },
  { name: 'Accordion: musette in the cassotto, bellows direct', p: { musette: 'two', cassotto: true, expression: true } },
  { name: 'Percussion: a hammer starts each reed', p: { percussion: true } },
  { name: 'Pumped through the expression stop', p: { expression: true, pump: 1.2 } },
  { name: 'Gentle wind: near threshold, slow to speak', p: { pressure: 250 } },
  { name: 'Strong wind: loud, bright, a little flat', p: { pressure: 1800 } },
  { name: 'Little set: prompt, soft and bright', p: { set: 0.4 } },
  { name: 'Much set: slow to speak, loud and round', p: { set: 2.2 } },
  { name: 'Loose slot: a leaky, duller reed', p: { clearance: 150 } },
  { name: 'Big reed cells: darker and a little flatter', p: { cell: 4 } },
  { name: 'Little air mass: slow, dark speech', p: { throat: 0.3 } },
];
