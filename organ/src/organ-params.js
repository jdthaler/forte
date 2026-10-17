// organ-params.js — knobs for the physics, plus console state and presets.
//
// kind: 'gen'    → rebuilds the generator tables (tuning, wheel shapes, crosstalk)
//       'engine' → sent to the audio thread as-is
//       'mix'    → Web Audio graph (room, volume)

import { DRAWBARS } from './tonewheels.js';

const f1 = (u) => (v) => `${v.toFixed(1)} ${u}`;
const f2 = (u) => (v) => `${v.toFixed(2)} ${u}`;
const db = (v, off = -80) => (v <= off + 1 ? 'off' : `${v.toFixed(0)} dB`);

export const GROUPS = [
  {
    id: 'gen', title: 'Tone generator',
    params: [
      { id: 'tuning', label: 'Tuning', kind: 'gen', type: 'select', def: 'gears',
        options: [['gears', 'Hammond gear ratios (real)'], ['et', 'Exact equal temperament'], ['harmonic', 'Ideal harmonics, one set per key']],
        hint: 'Real: 12 gear pairs, shared wheels, tempered drawbar “harmonics”. Ideal: what drawbars pretend to be.' },
      { id: 'mains', label: 'Mains frequency', kind: 'gen', min: 45, max: 65, step: 0.1, def: 60, fmt: f1('Hz'),
        hint: 'The synchronous motor locks to the line: 50 Hz on a 60 Hz organ plays a minor third flat.' },
      { id: 'inertia', label: 'Coast-down time', kind: 'engine', min: 1, max: 20, def: 6, log: true, fmt: f1('s'),
        hint: 'Flywheel inertia ÷ bearing drag. Switch the motor off to hear it.' },
      { id: 'spinUp', label: 'Spin-up time', kind: 'engine', min: 0.2, max: 5, def: 1.2, log: true, fmt: f1('s') },
      { id: 'wheelHarm', label: 'Wheel waveform impurity', kind: 'gen', min: 0, max: 3, step: 0.01, def: 0.4, fmt: (v) => v.toFixed(2),
        hint: 'Tooth profile → 2nd/3rd harmonics at the pickup (strongest on the low wheels).' },
      { id: 'crosstalk', label: 'Compartment crosstalk', kind: 'gen', min: -80, max: -20, step: 1, def: -48, fmt: (v) => db(v),
        hint: 'Magnetic pickup of the wheel four octaves away in the same compartment.' },
      { id: 'leakage', label: 'Background leakage', kind: 'gen', min: -90, max: -40, step: 1, def: -70, fmt: (v) => db(v, -90),
        hint: 'All 91 wheels bleed faintly into the wiring — the “breath” of an old B-3.' },
      { id: 'loading', label: 'Busbar loading', kind: 'engine', min: 0, max: 2, step: 0.01, def: 0.25, fmt: (v) => v.toFixed(2),
        hint: 'Load/source resistance R_L/R_s. Higher: keys on the same busbar average instead of adding, so chords compress.' },
    ],
  },
  {
    id: 'keys', title: 'Key contacts',
    params: [
      { id: 'spread', label: 'Contact timing spread', kind: 'engine', min: 0, max: 6, step: 0.05, def: 1.2, fmt: f2('ms'),
        hint: 'The nine contacts close at different points of the key travel.' },
      { id: 'bounce', label: 'Contact bounce', kind: 'engine', min: 0, max: 2, step: 0.01, def: 0.5, fmt: (v) => v.toFixed(2) },
      { id: 'contactTime', label: 'Contact softness', kind: 'engine', min: 0, max: 3000, step: 1, def: 20, fmt: (v) => `${v.toFixed(0)} µs`,
        hint: 'How gradually a contact makes. 0 = hardest click; ~1 ms = click filter.' },
    ],
  },
  {
    id: 'perc', title: 'Percussion',
    params: [
      { id: 'percFastTau', label: 'Fast decay τ', kind: 'engine', min: 0.03, max: 0.6, def: 0.15, log: true, fmt: f2('s') },
      { id: 'percSlowTau', label: 'Slow decay τ', kind: 'engine', min: 0.2, max: 3, def: 0.6, log: true, fmt: f2('s') },
      { id: 'percLevel', label: 'Percussion level', kind: 'engine', min: 0, max: 2.5, step: 0.01, def: 1, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    id: 'vib', title: 'Scanner vibrato',
    params: [
      { id: 'sections', label: 'Delay-line sections', kind: 'engine', min: 4, max: 40, step: 1, def: 18, fmt: (v) => v.toFixed(0) },
      { id: 'sectionDelay', label: 'Delay per LC section', kind: 'engine', min: 15, max: 150, step: 1, def: 50, fmt: (v) => `${v.toFixed(0)} µs`,
        hint: '√(LC). Total delay sets the pitch swing; the ladder cutoff 1/(π√LC) darkens the tone.' },
      { id: 'scanRate', label: 'Scanner rate', kind: 'engine', min: 3, max: 12, step: 0.01, def: 6.87, fmt: f2('Hz'),
        hint: 'Gear-driven from the same motor (412 rpm on a real B-3).' },
    ],
  },
  {
    id: 'leslie', title: 'Leslie speaker',
    params: [
      { id: 'hornSlow', label: 'Horn slow', kind: 'engine', min: 0.2, max: 2, step: 0.01, def: 0.8, fmt: (v) => `${(v * 60).toFixed(0)} rpm` },
      { id: 'hornFast', label: 'Horn fast', kind: 'engine', min: 3, max: 9, step: 0.01, def: 6.75, fmt: (v) => `${(v * 60).toFixed(0)} rpm` },
      { id: 'drumSlow', label: 'Drum slow', kind: 'engine', min: 0.2, max: 2, step: 0.01, def: 0.67, fmt: (v) => `${(v * 60).toFixed(0)} rpm` },
      { id: 'drumFast', label: 'Drum fast', kind: 'engine', min: 3, max: 8, step: 0.01, def: 5.9, fmt: (v) => `${(v * 60).toFixed(0)} rpm` },
      { id: 'hornAccel', label: 'Horn spin-up τ', kind: 'engine', min: 0.1, max: 4, def: 0.7, log: true, fmt: f2('s') },
      { id: 'hornDecel', label: 'Horn slow-down τ', kind: 'engine', min: 0.1, max: 4, def: 0.9, log: true, fmt: f2('s') },
      { id: 'drumAccel', label: 'Drum spin-up τ', kind: 'engine', min: 0.5, max: 12, def: 4.5, log: true, fmt: f2('s'),
        hint: 'The heavy bass rotor lags the light horn — the classic ramp.' },
      { id: 'drumDecel', label: 'Drum slow-down τ', kind: 'engine', min: 0.5, max: 12, def: 5.5, log: true, fmt: f2('s') },
      { id: 'hornRadius', label: 'Horn radius', kind: 'engine', min: 0.05, max: 0.35, step: 0.005, def: 0.18, fmt: (v) => `${(v * 100).toFixed(1)} cm`,
        hint: 'Doppler swing ∝ radius × speed: ±v/c in frequency. Past 28 cm the cabinet grows to fit the horn.' },
      { id: 'micDist', label: 'Mic distance', kind: 'engine', min: 0.5, max: 3, def: 0.8, log: true, fmt: f2('m'),
        hint: 'From the rotor axis. The mics stay outside the cabinet (≥ 8 cm past its wall).' },
      { id: 'micSpread', label: 'Mic spread', kind: 'engine', min: 0, max: 180, step: 1, def: 120, fmt: (v) => `${v.toFixed(0)}°` },
      { id: 'crossover', label: 'Crossover', kind: 'engine', min: 300, max: 2000, def: 800, log: true, fmt: (v) => `${v.toFixed(0)} Hz` },
      { id: 'balance', label: 'Drum ↔ horn', kind: 'engine', min: -1, max: 1, step: 0.01, def: 0, fmt: (v) => (Math.abs(v) < 0.01 ? 'even' : v > 0 ? `horn +${(v * 100).toFixed(0)}%` : `drum +${(-v * 100).toFixed(0)}%`) },
      { id: 'reflections', label: 'Cabinet reflection', kind: 'engine', min: 0, max: 0.9, step: 0.01, def: 0.35, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    id: 'amp', title: 'Amp & output',
    params: [
      { id: 'drive', label: 'Tube drive', perform: true, kind: 'engine', min: 0, max: 1, step: 0.01, def: 0.15, fmt: (v) => v.toFixed(2),
        hint: 'Gain into an off-centre-biased tube: even harmonics, then compression. A full chord keeps its level.' },
      { id: 'expression', label: 'Expression pedal', kind: 'engine', min: 0, max: 1, step: 0.01, def: 0.85, fmt: (v) => `${((v - 1) * 40).toFixed(0)} dB`,
        hint: 'Before the drive, so it changes the grit too. MIDI CC 11.' },
      { id: 'room', label: 'Room', perform: true, kind: 'mix', min: 0, max: 1, step: 0.01, def: 0.2, fmt: (v) => v.toFixed(2) },
      { id: 'volume', label: 'Volume', perform: true, kind: 'mix', min: 0, max: 2, step: 0.01, def: 0.8, fmt: (v) => v.toFixed(2) },
    ],
  },
];

export const CONSOLE_DEFAULTS = {
  drawbars: [8, 8, 8, 0, 0, 0, 0, 0, 0],
  percOn: false, percSoft: false, percFast: true, percThird: true,
  vib: 'C3', leslieOn: true, leslie: 'slow', motor: true,
};

// The console as plugin parameters (the descriptor's console; tools/gen-native-params.mjs,
// shared/wasm.js): the page keeps it in P as CONSOLE_DEFAULTS has it, and get(P) gives these
// parameters' values from such a P. The Leslie's one switch has the bypass, the two speeds, and
// the rotors stopped (the engine's brake: any speed but slow or fast).
export const CONSOLE_GROUPS = [
  {
    id: 'drawbars', title: 'Drawbars',
    params: DRAWBARS.map((b, d) => ({ id: `drawbar${d + 1}`, label: `${b.label} drawbar`, min: 0, max: 8, step: 1, def: CONSOLE_DEFAULTS.drawbars[d], fmt: (v) => v.toFixed(0) })),
  },
  {
    id: 'switches', title: 'Console',
    params: [
      { id: 'percOn', label: 'Percussion', type: 'checkbox', def: CONSOLE_DEFAULTS.percOn },
      { id: 'percSoft', label: 'Percussion soft', type: 'checkbox', def: CONSOLE_DEFAULTS.percSoft },
      { id: 'percFast', label: 'Percussion fast', type: 'checkbox', def: CONSOLE_DEFAULTS.percFast },
      { id: 'percThird', label: 'Percussion third', type: 'checkbox', def: CONSOLE_DEFAULTS.percThird },
      { id: 'vib', label: 'Vibrato / chorus', perform: true, type: 'select', def: CONSOLE_DEFAULTS.vib,
        options: [['off', 'Off'], ['V1', 'V1'], ['V2', 'V2'], ['V3', 'V3'], ['C1', 'C1'], ['C2', 'C2'], ['C3', 'C3']] },
      { id: 'leslie', label: 'Leslie', perform: true, type: 'select', def: CONSOLE_DEFAULTS.leslieOn ? CONSOLE_DEFAULTS.leslie : 'bypass',
        options: [['bypass', 'Bypass'], ['slow', 'Slow'], ['fast', 'Fast'], ['stop', 'Stopped']] },
      { id: 'motor', label: 'Motor', type: 'checkbox', def: CONSOLE_DEFAULTS.motor },
    ],
  },
];
export const CONSOLE = {
  groups: CONSOLE_GROUPS,
  defaults: CONSOLE_DEFAULTS,
  get: (P) => ({
    ...Object.fromEntries(P.drawbars.map((v, d) => [`drawbar${d + 1}`, v])),
    percOn: P.percOn, percSoft: P.percSoft, percFast: P.percFast, percThird: P.percThird,
    vib: P.vib, leslie: P.leslieOn ? P.leslie : 'bypass', motor: P.motor,
  }),
};

export const ALL_PARAMS = GROUPS.flatMap((g) => g.params);
export const DEFAULTS = {
  ...Object.fromEntries(ALL_PARAMS.map((p) => [p.id, p.def])),
  ...CONSOLE_DEFAULTS,
};

const reg = (s) => s.replace(/\s/g, '').split('').map(Number);

export const PRESETS = [
  { name: 'Jazz trio — 88 8000 000, 3rd perc fast', p: { drawbars: reg('888000000'), percOn: true, percThird: true, percFast: true, vib: 'C3', leslie: 'slow' } },
  { name: 'Full organ — 88 8888 888, Leslie fast', p: { drawbars: reg('888888888'), vib: 'C3', leslie: 'fast', drive: 0.35 } },
  { name: 'Gospel — 88 8800 000', p: { drawbars: reg('888800000'), vib: 'C3', leslie: 'fast', drive: 0.3 } },
  { name: 'Ballad — 80 8000 000', p: { drawbars: reg('808000000'), vib: 'C3', leslie: 'slow' } },
  { name: 'Rock grind — 88 8800 000, overdriven', p: { drawbars: reg('888800000'), vib: 'C3', leslie: 'fast', drive: 0.75 } },
  { name: 'Bright whistle — 80 0000 888', p: { drawbars: reg('800000888'), vib: 'V2', leslie: 'slow' } },
  { name: 'Single wheel — 00 8000 000, dry', p: { drawbars: reg('008000000'), vib: 'off', leslieOn: false, drive: 0 } },
  { name: '2nd perc only — 00 8000 000, slow decay', p: { drawbars: reg('008000000'), percOn: true, percThird: false, percFast: false, vib: 'off', leslie: 'slow' } },
  { name: 'Full drawbars, dry — compare tunings', p: { drawbars: reg('888888888'), vib: 'off', leslieOn: false, drive: 0, room: 0.1 } },
];
