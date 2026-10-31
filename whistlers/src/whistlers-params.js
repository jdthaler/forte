// whistlers-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound. Every key is a field line of the Earth's magnetic field, the one whose
// whistler's nose (the frequency that arrives first) is the note: the top keys are field lines
// about four Earth radii out, in the plasmasphere, and the bottom ones reach twenty and more.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const km = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v < 10000 ? 2 : 1)} thousand km` : `${v.toFixed(0)} km`);
const secs = (v) => (v < 1 ? `${(v * 1000).toFixed(0)} ms` : `${v.toFixed(v < 10 ? 2 : 1)} s`);
// the plasmapause's L and the Kp that puts it there (Carpenter & Anderson 1992: L = 5.6 − 0.46 Kp)
const pause = (v) => { const kp = (5.6 - v) / 0.46; return kp >= 0 && kp <= 9 ? `L = ${v.toFixed(2)} (Kp ${kp.toFixed(1)})` : `L = ${v.toFixed(2)}`; };

export const GROUPS = [
  {
    title: 'The lightning',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'How hard the lightning strikes for the computer keys (a MIDI keyboard\'s velocity does the same): its current, and so how loud its radio crack and its whistler are.' },
      { id: 'sferic', label: 'Sferic (the lightning\'s crack)', perform: true, min: 0, max: 1, def: 0.3, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %`,
        hint: 'How loud the lightning\'s own radio crack is, heard straight along the ground between the Earth and the ionosphere: a click, then a tweek, a ping that slides down onto the waveguide\'s cutoff (about 1.8 kHz at night) and its harmonics. 0: the whistler alone.' },
      { id: 'distance', label: 'Lightning\'s distance', min: 200, max: 8000, def: 2000, log: true, fmt: km, showIf: (P) => P.sferic > 0,
        hint: 'How far away the stroke is, along the ground. The farther, the longer the waveguide stretches the tweek: a near stroke is a click, a far one a drawn-out ping.' },
      { id: 'iono', label: 'Ionosphere height', min: 60, max: 100, def: 85, step: 0.5, fmt: (v) => `${v.toFixed(1)} km`, showIf: (P) => P.sferic > 0,
        hint: 'The height the ionosphere reflects the crack from: about 85 km at night, 70 km by day. The waveguide between it and the ground cuts off below c / 2h, the note the tweeks ring down to (1.76 kHz at 85 km).' },
    ],
  },
  {
    title: 'The field line',
    params: [
      { id: 'density', label: 'Plasma density', min: 0.01, max: 10, def: 1, log: true, fmt: (v) => `× ${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`,
        hint: 'The electrons along the field lines, as a multiple of Carpenter and Anderson\'s model. More plasma slows the whistler and spreads it more: every whistler takes about the square root as long, and the notes fall more slowly. The nose stays put: it is set by the field.' },
      { id: 'plasmapause', label: 'Plasmapause', min: 2.5, max: 9, def: 4.7, step: 0.05, fmt: pause,
        hint: 'Where the plasmasphere ends, in Earth radii at the equator: it shrinks in a magnetic storm (high Kp) and refills over quiet days. Inside it, the plasma is a hundred times thicker, so the top keys\' whistlers, whose lines lie inside, are long and slow, and the keys below it, out in the thin trough, are quick.' },
      { id: 'ducts', label: 'Ducts', perform: true, min: 1, max: 5, def: 1, step: 1, fmt: (v) => (v === 1 ? '1 duct' : `${v.toFixed(0)} ducts`),
        hint: 'Whistlers reach the ground along ducts, tubes of thicker plasma that hold them to a field line. Several ducts near one another give several whistlers at once, each a little higher or lower and a little earlier or later: a multi-path whistler.' },
      { id: 'spread', label: 'Duct spacing', min: 0, max: 0.05, def: 0.012, step: 0.001, fmt: (v) => `${(v * 100).toFixed(1)} % of L`, showIf: (P) => P.ducts > 1,
        hint: 'How far apart the ducts lie, as a share of the field line\'s distance out. A line 1 % farther out has a nose 3 % lower (the field falls as 1/L³), about half a semitone.' },
    ],
  },
  {
    title: 'The echoes',
    params: [
      { id: 'receiver', label: 'Receiver', face: 'selector', shortLabels: ['Far end', 'Near'], type: 'select', def: 'conjugate',
        options: [['conjugate', 'At the other end of the line (1, 3, 5 … hops)'], ['source', 'Near the lightning (2, 4, 6 … hops)']],
        hint: 'At the field line\'s other end, the whistler arrives after one hop, and its echoes after three, five and more. Near the lightning, it is heard only once it has come back, after two hops, twice as spread out.' },
      { id: 'echo', label: 'Echoes (the ionosphere\'s reflection)', perform: true, min: 0, max: 0.95, def: 0.35, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %`,
        hint: 'How much of the whistler the ionosphere at each end sends back up the field line. Each echo travels the line twice more, so it comes later, falls more slowly and is spread thinner: an echo train.' },
      { id: 'travel', label: 'Real travel time', face: 'toggle', type: 'checkbox', def: false,
        hint: 'Off: the whistler starts as you press the key. On: you hear the lightning\'s crack at once and the whistler only when it arrives, after its trip along the field line: a fraction of a second at the top of the keyboard, minutes at the bottom.' },
    ],
  },
  {
    title: 'Chorus',
    params: [
      { id: 'chorus', label: 'Chorus (held keys)', perform: true, min: 0, max: 40, def: 0, step: 0.1, fmt: (v) => (v ? `${v.toFixed(1)} a second` : 'none'),
        hint: 'While a key is held, hot electrons injected into its field line (at dawn, after a substorm) sing rising tones near the equator: chorus. This is how many come a second; key pressure brings more, and the mod wheel sets it.' },
      { id: 'element', label: 'Chorus element length', min: 0.05, max: 2, def: 0.35, log: true, fmt: secs, showIf: (P) => P.chorus > 0,
        hint: 'How long each rising chorus element takes to sweep from about a quarter of the gyrofrequency up to half of it, where it stops.' },
    ],
  },
  {
    title: 'Listening',
    params: [
      { id: 'release', label: 'Release (the receiver fades)', min: 0.05, max: 8, def: 1.2, log: true, fmt: secs,
        hint: 'Nothing stops a whistler on its way, so letting go of a key turns its receiver down instead, over this time. The pedal (Space) keeps the receivers open.' },
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
  { name: 'Whistlers at night (Kp 2)', p: {} },
  { name: 'Quiet week: the plasmasphere out to L = 6', p: { plasmapause: 6 } },
  { name: 'Magnetic storm: the plasmapause at L = 3', p: { plasmapause: 3 } },
  { name: 'Multi-path: five ducts', p: { ducts: 5 } },
  { name: 'Echo train', p: { echo: 0.8 } },
  { name: 'Near the lightning: two-hop whistlers', p: { receiver: 'source', echo: 0.6 } },
  { name: 'Real travel time: the crack, then the whistler', p: { travel: true, sferic: 0.6 } },
  { name: 'Thin plasma: quick whistlers', p: { density: 0.05 } },
  { name: 'Dawn chorus', p: { chorus: 10, sferic: 0.1 } },
  { name: 'Distant storms: long tweeks', p: { sferic: 1, distance: 7000 } },
  { name: 'By day: a low ionosphere (70 km), higher tweeks', p: { iono: 70 } },
  { name: 'Dense plasma: slow, drawn-out whistlers', p: { density: 5 } },
];
