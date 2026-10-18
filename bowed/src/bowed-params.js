// bowed-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';

export const RANGE = [21, 98]; // the keys: A0–D7
export const KEY_LO = 36, KEY_HI = 84; // C2–C6: the 49 strings the bridge and board are drawn on

const pct = (v) => `${(v * 100).toFixed(0)} %`;
const ms = (v) => `${v < 10 ? v.toFixed(1) : v.toFixed(0)} ms`;

export const GROUPS = [
  {
    title: 'Wheel',
    params: [
      { id: 'speed', label: 'Wheel speed (bow speed)', perform: true, min: 0.05, max: 1, def: 0.25, log: true, fmt: (v) => `${(v * 100).toFixed(0)} cm/s`, hint: 'Surface speed of the rosined bass wheels, set by the treadle (the larger upper wheels run 1.1× from C4 and 1.6× from E♭5; a flywheel smooths changes over ½ s). Helmholtz amplitude ∝ v_B/β: faster is louder. Both of Schelleng\'s force limits scale with it. MIDI mod wheel: rest = 25 cm/s, up to 1 m/s.' },
      { id: 'beta', label: 'Bow position β', perform: true, min: 0.04, max: 0.4, def: 0.12, step: 0.005, fmt: (v) => `${(v * 100).toFixed(1)} % from bridge`, hint: 'Where the wheels meet the strings (the treble wheel, E♭5 up, at 0.75 β). Near the bridge (sul ponticello) is louder and brighter but needs more force; far (sul tasto) is soft and flutey.' },
      { id: 'treadle', label: 'Treadle unevenness', min: 0, max: 0.2, def: 0.02, step: 0.005, fmt: pct, hint: 'The foot pumps the crank in strokes; the flywheel smooths them. Wheel speed swings this much, once per stroke.' },
      { id: 'treadleRate', label: 'Treadle rate', min: 0.3, max: 3, def: 1.1, step: 0.05, fmt: (v) => `${v.toFixed(2)} strokes/s` },
    ],
  },
  {
    title: 'Keys',
    params: [
      { id: 'force', label: 'Key pressure', perform: true, min: 0.05, max: 6, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)}`, hint: 'Bow force relative to the voiced touch (half of Schelleng\'s maximum). Low: whistly surface sound (double slips). High: raucous crunch. MIDI aftertouch adds to it.' },
      { id: 'attack', label: 'Key travel time', perform: true, min: 1, max: 150, def: 8, log: true, fmt: ms, hint: 'How long a full-speed key takes to bring the string onto the wheel at full force (slower keys take longer). The attack\'s quality comes out of the stick–slip physics.' },
      { id: 'velocity', label: 'Velocity (computer keys)', min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'Faster keys bring the force up sooner and press a little harder.' },
    ],
  },
  {
    title: 'Rosin and string',
    open: false,
    params: [
      { id: 'mus', label: 'Static friction μs', min: 0.4, max: 1.2, def: 0.8, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'Grip while stuck. A bigger μs − μd narrows the playable force range from above.' },
      { id: 'mud', label: 'Sliding friction μd', min: 0.1, max: 0.7, def: 0.3, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'Friction at fast sliding (the asymptote of the curve).' },
      { id: 'v0', label: 'Friction curve width v₀', min: 0.01, max: 1, def: 0.1, log: true, fmt: (v) => `${(v * 100).toFixed(1)} cm/s`, hint: 'How fast μ falls from μs to μd with sliding speed.' },
      { id: 'memory', label: 'Rosin lag τ', min: 0, max: 0.2, def: 0.02, step: 0.005, fmt: (v) => `${(v * 1000).toFixed(0)} µs`, hint: 'Rosin\'s grip follows the sliding speed with this delay (it is set by the contact temperature). Zero is the classic friction curve; more makes attacks steadier and flattens the pitch.' },
      { id: 'grain', label: 'Rosin grain', min: 0, max: 0.05, def: 0.005, step: 0.001, fmt: (v) => `${(v * 100).toFixed(1)} %`, hint: 'The grip of rosin and horsehair is not uniform: random fluctuation of μ (band-limited to ≈ 2 kHz). Audible as bow noise; it also shakes the string out of stray slipping patterns.' },
      { id: 'torsionQ', label: 'Torsional Q', min: 5, max: 300, def: 40, log: true, fmt: (v) => v.toFixed(0), hint: 'The string also rolls under the wheel. Lossy torsional waves damp irregular slipping.' },
      { id: 'losses', label: 'String losses', min: 0.2, max: 5, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)}`, hint: 'Air and internal friction of the strings (the wound bass strings are lossier). Rounds the Helmholtz corner; raises the minimum force.' },
    ],
  },
  {
    title: 'Soundboard and dampers',
    open: false,
    params: [
      { id: 'mobility', label: 'Bridge mobility', min: 0.2, max: 5, def: 1, log: true, fmt: (v) => `${(v * 8.5).toFixed(1)} mm/(N·s)`, hint: 'The soundboard\'s point admittance at the bridge (×1 = the plate\'s 8.5 mm/s per N). More: louder, shorter ring, higher minimum force, stronger sympathetic coupling.' },
      { id: 'boardEta', label: 'Soundboard loss factor', min: 0.005, max: 0.1, def: 0.03, log: true, fmt: (v) => `η = ${v.toFixed(3)}`, hint: 'Damping of the spruce board\'s modes (Q ≈ 1/η).' },
      { id: 'damper', label: 'Damper time', min: 0.03, max: 3, def: 0.25, log: true, fmt: (v) => `T60 ${v.toFixed(2)} s`, hint: 'How quickly the felt stops a released string.' },
      { id: 'lifted', label: 'Dampers lifted (all strings ring in sympathy)', perform: true, type: 'checkbox', def: false, hint: 'Every string is free: released notes ring on, and the bridge makes the others resonate with what you play.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.3, step: 0.01, fmt: pct },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Viola organista', p: {} },
  { name: 'Sul ponticello: wheel near the bridge', p: { beta: 0.06, force: 1.6 } },
  { name: 'Sul tasto: wheel far from the bridge', p: { beta: 0.25, force: 0.6 } },
  { name: 'Surface sound: too little force', p: { force: 0.15 } },
  { name: 'Raucous: too much force', p: { force: 3 } },
  { name: 'Slow treadle, fast treadle swing', p: { speed: 0.12, treadle: 0.12, treadleRate: 0.7 } },
  { name: 'Lazy keys: slow attacks', p: { attack: 80 } },
  { name: 'Dampers lifted: sympathetic strings', p: { lifted: true } },
  { name: 'Classic friction curve (no rosin lag)', p: { memory: 0 } },
];
