// pyrophone-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';

const pct = (v) => `${(v * 100).toFixed(0)} %`;

export const GROUPS = [
  {
    title: 'Flames',
    params: [
      { id: 'flame', label: 'Flame power K', perform: true, min: 0.5, max: 6, def: 3.4, log: true, fmt: (v) => `${v.toFixed(2)} × threshold`, hint: 'Heater gain with the flames fully apart, in units of the threshold β_H where silence breaks (so it means the same for every bore, damping and flame). Further past it: faster onsets, louder, richer limit cycles. Narrow bores scream sooner (from about 4.5× at 1/100).' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'How far a key parts the flames: β = K β_H (0.4 + 0.6 v).' },
      { id: 'xf', label: 'Flame position x_f / L', min: 0.02, max: 0.98, def: 1 / 3, step: 0.001, fmt: (v) => `${(v * 100).toFixed(1)} % up the tube`, hint: 'Rayleigh: the fundamental is driven in the lower half (best near ¼), the octave mode in the lowest and third quarters. Kastner put the flames at ⅓.' },
      { id: 'lag', label: 'Flame lag τ', min: 0.02, max: 1.5, def: 0.25, log: true, fmt: (v) => `${v.toFixed(2)} L/c · ${(v * 180).toFixed(0)}° of the fundamental`, hint: 'Delay of the heat release behind the flow; a bigger flame responds later. Rayleigh needs the heat in phase with the pressure.' },
      { id: 'keyup', label: 'Key-up flame power', perform: true, min: 0, max: 0.98, def: 0.2, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of threshold`, hint: 'Flames rejoined. Above the fold (≈ 87 %) a tube that was singing keeps singing after release: it remembers. Lower it or press Panic to stop them.' },
      { id: 'noise', label: 'Flame turbulence', perform: true, min: 0.001, max: 0.1, def: 0.02, step: 0.001, fmt: (v) => `${(v * 100).toFixed(1)} % of the draught`, hint: 'Turbulent velocity at the flame (rms). Breath in the tone; it is what starts a tube, and it can kick one in the bistable zone into song.' },
    ],
  },
  {
    title: 'Tubes',
    params: [
      { id: 'bore', label: 'Bore (radius / length)', min: 0.01, max: 0.15, def: 1 / 30, log: true, fmt: (v) => `1 / ${(1 / v).toFixed(0)}`, hint: 'Wide tubes radiate more ((ka)², hits the upper modes); narrow ones lose more in the boundary layer (√ω, hits the fundamental).' },
      { id: 'damp', label: 'Damping scale', min: 0.5, max: 4, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)}`, hint: 'Scales both losses. More damping raises the threshold and shortens the ring after release.' },
      { id: 'warm', label: 'Warm-up time', min: 0.1, max: 10, def: 1, log: true, fmt: (v) => `${v.toFixed(1)} s`, hint: 'Thermal time constant of the gas column: how long a tube takes to heat after its flames part, and to cool after.' },
      { id: 'drift', label: 'Warm-up ΔT', min: 0, max: 60, def: 4, step: 0.5, fmt: (v) => `${v.toFixed(1)} K · ${(600 * Math.log2(400 / (400 - v))).toFixed(0)} ¢`, hint: 'How much hotter a singing tube gets. c ∝ √T, so a fresh note starts this many cents flat and slides up.' },
      { id: 'autotune', label: 'Cut each tube for its velocity', type: 'checkbox', def: true, hint: 'On: every held note settles exactly on pitch. Off: tubes cut for velocity 0.7, so harder notes go sharp, as on a real instrument.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'listen', label: 'Listening point', min: 0, max: 1, def: 0.5, step: 0.01, fmt: (v) => (v < 0.02 ? 'at the top mouth' : v > 0.98 ? 'far, side-on' : `bottom mouth × ${v.toFixed(2)}`), hint: 'Side-on, the two open ends cancel the even modes (the octave), leaving a hollow tone; at the top mouth you hear them all.' },
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.3, step: 0.01, fmt: pct },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: "Kastner's pyrophone (flames at ⅓)", p: {} },
  { name: 'Tubes that remember (key-up in the bistable band)', p: { keyup: 0.93 } },
  { name: 'Just past threshold: slow sighs', p: { flame: 1.58 } },
  { name: 'Flame high (68 %): the octave sings', p: { xf: 0.68, listen: 0.2, flame: 2.1 } },
  { name: 'Flame at ⅝: octave plus subharmonic (period doubling)', p: { xf: 0.625, listen: 0.2, flame: 2.72 } },
  { name: 'Flame low (8 %), quick flame: the octave takes over', p: { xf: 0.08, lag: 0.2, flame: 1.44, listen: 0.2 } },
  { name: 'Cold glass: big warm-up drift', p: { drift: 30, warm: 3 } },
  { name: 'Hot-wire Rijke tube (short lag, wide bore, at ¼)', p: { lag: 0.1, bore: 0.05, xf: 0.25, flame: 3.34 } },
];
