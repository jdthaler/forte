// cristal-params.js — the knobs. Every parameter has a physical meaning and a
// unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pct = (v) => `${(v * 100).toFixed(0)} %`;

export const GROUPS = [
  {
    title: 'Finger',
    params: [
      { id: 'press', label: 'Finger pressure', perform: true, min: 0.3, max: 300, def: 10, log: true, fmt: (v) => `${v.toFixed(v < 10 ? 1 : 0)} × threshold`,
        hint: 'How hard the wet finger presses on the rod, as a multiple of each rod\'s threshold, the force at which sliding turns into stick–slip. Below 1 the finger just slides; just above, the note takes its time to come; far above, about 50×, the finger can no longer slip once a cycle and the tone turns rough and crackles. MIDI aftertouch presses harder.' },
      { id: 'stroke', label: 'Stroke speed', perform: true, min: 0.02, max: 0.4, def: 0.1, log: true, fmt: (v) => `${(v * 100).toFixed(1)} cm/s`,
        hint: 'How fast the finger slides along the rod (velocity scales it 0.4–1.4×). Like a bow\'s speed, it sets how loud the rod sings: the rod moves back and forth at about the finger\'s speed. A faster stroke needs more pressure, so the pressure follows it. The mod wheel strokes up to twice as fast.' },
      { id: 'strokes', label: 'Strokes', type: 'select', def: 'back', perform: true,
        options: [['back', 'Back and forth along the rod'], ['down', 'Toward you, lifting between strokes'], ['endless', 'One endless stroke']],
        hint: 'A rod is 24 cm long, so a held note is a series of strokes, 20 cm each. Back and forth, the finger turns at each end and the tone dips for a moment as the rod reverses. Toward you, the finger lifts at the end and comes down again at the far end, as many players do: a small new start every stroke. One endless stroke is what no finger can do: an unbroken tone.' },
      { id: 'wet', label: 'Finger wetness', min: 0, max: 1, def: 0.85, step: 0.01, fmt: (v) => `${v < 0.25 ? 'dry' : v < 0.6 ? 'damp' : 'wet'} · ${pct(v)}`,
        hint: 'Players dip their fingers in water. A wet fingertip on clean glass grips hard when still and lets go when it slides (static friction about 2, sliding 0.3), and that fall is what feeds the rod. Dry skin grips about as much sliding as still, so the rods stay silent, and the fingerprint\'s ridges catch: a dry rub.' },
      { id: 'velocity', label: 'Velocity (computer keys)', min: 0.05, max: 1, def: 0.6, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'How fast the computer keys\' finger strokes.' },
    ],
  },
  {
    title: 'Rods and stems',
    params: [
      { id: 'height', label: 'Rod\'s place on the stem', min: 0.1, max: 0.5, def: 0.5, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of the way up`,
        hint: 'Where the glass rod is clamped on its steel stem, between the collector below and the frame above. In the middle the finger\'s pull rocks nothing: one bending mode, the note. Lower, the rod also rocks as the stem bends, so a second mode below the note shares the finger\'s pull: the threshold rises, and on some keys (around C3–G3 at 30 %) the two modes argue and the tone wavers between them. The stems are re-cut to keep every note in tune.' },
      { id: 'loss', label: 'Stem losses', min: 2e-4, max: 0.01, def: 9e-4, log: true, fmt: (v) => `ζ = ${(v * 100).toFixed(2)} % (Q ${(1 / (2 * v)).toFixed(0)})`,
        hint: 'How much of its motion the stem loses each cycle, in the steel and the bolted joints (0.09 % in Couineaux\'s measured resonator). It sets the threshold (less loss, a lighter touch speaks) and how long a rod rings after the finger leaves it.' },
      { id: 'fullRange', label: 'Full range (A0–C8)', type: 'checkbox', def: false,
        hint: 'Opens the keys beyond the cristal\'s four octaves, C2–C6: the same glass rods on stems cut ever longer, with heavier weights, down to A0, and ever shorter, to a 3 cm stem at C8.' },
    ],
  },
  {
    title: 'Radiators',
    params: [
      { id: 'radiator', label: 'Radiators', type: 'select', def: 'both',
        options: [['both', 'Cones and the flame'], ['cones', 'The fibreglass cones'], ['flame', 'The metal flame'], ['bare', 'None: the bare collector']],
        hint: 'The rods barely move the air: the collector, the heavy bar their stems are bolted to, carries their vibration to radiators that do. The fibreglass cones are pistons: they bring out the bass (the big one at the low end, the small one at the high end). The flame is a tall cut steel sheet with hundreds of its own modes: a shimmering metal halo. Without them the bar alone is faint and thin.' },
      { id: 'whiskers', label: 'Whiskers', min: 0, max: 24, def: 24, step: 1, fmt: (v) => `${v.toFixed(0)} wires`,
        hint: 'Long steel wires, 0.6–1.5 m, fixed to the collector in three groups of eight. Where one of their stretching modes meets a harmonic of the note, the wire rings in sympathy and that harmonic blooms and lingers.' },
      { id: 'sway', label: 'Whisker sway', perform: true, min: 0, max: 1, def: 0.3, step: 0.01, fmt: pct,
        hint: 'The whiskers sway slowly on their own first bending mode, about once a second. A bent wire\'s stretching modes shift with its curvature, so as they sway they sweep across the harmonics: a slow sparkle in the highs.' },
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
  { name: 'The Baschets\' cristal', p: {} },
  { name: 'A light touch: the note takes its time', p: { press: 2.5 } },
  { name: 'Pressing too hard: the tone crackles', p: { press: 120 } },
  { name: 'Dry fingers: no grip', p: { wet: 0.2 } },
  { name: 'Slow strokes: soft and pure', p: { stroke: 0.04 } },
  { name: 'Fast strokes: loud and bright', p: { stroke: 0.25 } },
  { name: 'Strokes toward you, lifting between', p: { strokes: 'down' } },
  { name: 'One endless stroke', p: { strokes: 'endless' } },
  { name: 'Rods low on their stems: two modes argue', p: { height: 0.3 } },
  { name: 'Lossy stems: the rods stop with the finger', p: { loss: 0.006 } },
  { name: 'The bare collector: no radiators, no whiskers', p: { radiator: 'bare', whiskers: 0 } },
  { name: 'Cones only, no whiskers', p: { radiator: 'cones', whiskers: 0 } },
  { name: 'The flame alone', p: { radiator: 'flame' } },
  { name: 'Swaying whiskers: a sparkle in the highs', p: { sway: 1 } },
];
