// template-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

const ms = (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} ms`;

export const GROUPS = [
  {
    title: 'Bar',
    params: [
      { id: 't60', label: 'Ring time (fundamental)', min: 0.2, max: 20, def: 3, log: true, fmt: (v) => `${v.toFixed(1)} s`, hint: 'Time for the first mode to fall 60 dB.' },
      { id: 'damping', label: 'Damping vs frequency', min: 0, max: 2, def: 1, step: 0.01, fmt: (v) => `σ ∝ f^${v.toFixed(2)}`, hint: 'Higher modes die faster in wood than in metal.' },
      { id: 'stretch', label: 'Overtone stretch', min: -0.1, max: 0.1, def: 0, step: 0.001, fmt: (v) => `${(v * 100).toFixed(1)} % / mode`, hint: 'Departure from the ideal beam (undercutting, shear).' },
    ],
  },
  {
    title: 'Mallet',
    params: [
      { id: 'mallet', label: 'Contact time', min: 0.05, max: 10, def: 0.8, log: true, fmt: ms, hint: 'A soft mallet stays on longer and cannot excite modes above ~1/contact time.' },
      { id: 'strike', label: 'Strike point', perform: true, min: 0, max: 0.5, def: 0.12, step: 0.005, fmt: (v) => `${(v * 100).toFixed(1)} % of length`, hint: 'Striking on a mode\'s node leaves it silent (mode 1 nodes at 22.4 %).' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.25, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Rosewood bar', p: {} },
  { name: 'Steel bar, hard mallet', p: { t60: 12, damping: 0.3, mallet: 0.15 } },
  { name: 'Struck on the node', p: { strike: 0.224 } },
];
