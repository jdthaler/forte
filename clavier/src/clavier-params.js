// clavier-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { MUTE_K, MUTE_R } from './clavier-model.js';

const mm = (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} mm`;
const cm = (v) => `${v.toFixed(1)} cm`;
export const strikeSpeed = (vel) => 0.3 + 3.7 * vel;   // m/s at the tangent

export const GROUPS = [
  {
    title: 'Key and tangent',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => `${v.toFixed(2)} · ${strikeSpeed(v).toFixed(1)} m/s`, hint: 'Speed of the tangent when it meets the string (0.3–4 m/s, MIDI velocity maps the same way).' },
      { id: 'press', label: 'Key pressure', min: 0.5, max: 20, def: 4, step: 0.1, fmt: (v) => `${v.toFixed(1)} N`, hint: 'How hard held keys push the tangent onto the anvil. Tuned at 4 N; press harder and the rubber wraps the string tighter and the pitch goes sharp (aftertouch and the pitch wheel add up to 12 N more). Below the string\'s own pull (about 1.2 N in the top octave) it no longer reaches the anvil and buzzes on the rubber.' },
      { id: 'gap', label: 'String–anvil gap', min: 0.2, max: 2, def: 0.5, step: 0.05, fmt: mm, hint: 'How far the tangent carries the string before the anvil stops it. The carry time (gap ÷ speed) sets how bright the attack is; a wider gap also swings the string further (more pickup growl). Levels are matched across gaps (the output is scaled by 0.5 mm ÷ gap).' },
      { id: 'tip', label: 'Rubber tip squeeze at 4 N', min: 0.05, max: 1, def: 0.25, log: true, fmt: mm, hint: 'Compression of the tip (Hertzian, F ∝ δ^1.5). A softer tip squeezes further, wraps the string more and bends the pitch more per newton.' },
      { id: 'wrap', label: 'Tip half-width', min: 1, max: 10, def: 3, step: 0.1, fmt: mm, hint: 'Over this length the squeezed rubber bends the string round the anvil\'s edge. Narrower = more pitch bend per newton (ΔL = δ²/2a).' },
      { id: 'tipLoss', label: 'Tip damping', min: 0, max: 3, def: 0.8, step: 0.01, fmt: (v) => `${v.toFixed(2)} s/m`, hint: 'Hysteresis of the rubber (Hunt–Crossley). Low = the key rebounds off the string and can strike twice.' },
      { id: 'keyMass', label: 'Key mass at the tangent', min: 2, max: 40, def: 8, log: true, fmt: (v) => `${v.toFixed(1)} g`, hint: 'Heavier keys hit the anvil harder and bounce more slowly.' },
    ],
  },
  {
    title: 'String',
    params: [
      { id: 't60', label: 'Sustain (A2 fundamental)', min: 1, max: 40, def: 14, log: true, fmt: (v) => `${v.toFixed(1)} s`, hint: 'T60 of a held A2\'s fundamental. Lower strings ring longer, higher ones shorter (σ ∝ f^0.6).' },
      { id: 'hf', label: 'Treble loss', min: 0, max: 8, def: 0.5, step: 0.05, fmt: (v) => `${v.toFixed(2)} s⁻¹·(f/kHz)²`, hint: 'Extra decay rate growing as f² (air and internal friction): how fast the twang fades into the fundamental.' },
      { id: 'stiff', label: 'Bending stiffness', min: 0, max: 4, def: 1, step: 0.01, fmt: (v) => `× ${v.toFixed(2)}`, hint: 'Scales EI. 0 = an ideal flexible string with exactly harmonic partials; the real D6 bass has B ≈ 5·10⁻⁴.' },
      { id: 'kc', label: 'Tension modulation (pitch glide)', type: 'checkbox', def: true, hint: 'Kirchhoff–Carrier: a large swing stretches the string, so the tension and pitch rise, then glide back as it decays. Strongest in the bass at full velocity.' },
      { id: 'yarn', label: 'Yarn damping', min: 20, max: 8000, def: 2000, log: true, fmt: (v) => `${v.toFixed(0)} s⁻¹`, hint: 'Drag of the wool on the nonspeaking length. After release it stops the whole string; turn it down and the released string rings on, three semitones lower.' },
    ],
  },
  {
    title: 'Pickups and tone',
    params: [
      { id: 'pickup', label: 'Pickup selector', perform: true, type: 'select', def: 'sum', options: [['lower', 'A · lower (centre) pickup'], ['upper', 'B · upper (bridge) pickup'], ['sum', 'A + B in phase'], ['diff', 'A − B out of phase']], hint: 'Each pickup hears mode n as sin(nπx/L). Out of phase, the low partials the two share cancel: thin and nasal.' },
      { id: 'xLower', label: 'Lower pickup, from tailpiece (at C4)', min: 1, max: 30, def: 10.3, step: 0.1, fmt: cm, hint: 'Partials with a node at the pickup vanish: a comb with teeth every L/x partials (the bar is slanted, 15 cm at F1 to 6 cm at E6).' },
      { id: 'xUpper', label: 'Upper pickup, from tailpiece (at C4)', min: 0.5, max: 15, def: 2.7, step: 0.1, fmt: cm, hint: 'Close to the tailpiece every partial is weak but the high ones less so: bright and quiet.' },
      { id: 'field', label: 'Pickup field depth', min: 0.5, max: 10, def: 2, log: true, fmt: mm, hint: 'Decay length λ of the magnet\'s field, Φ ∝ e^(−distance/λ). Shorter = more second-harmonic growl on loud notes.' },
      { id: 'gain', label: 'Amplifier gain', min: -12, max: 18, def: 0, step: 0.5, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`, hint: 'The D6\'s volume control. The tone tabs change the level a lot (Soft alone is about 12 dB quieter); this makes it up.' },
      { id: 'soft', label: 'Soft (30 kΩ ‖ 0.1 µF)', perform: true, type: 'checkbox', def: false, hint: 'A low-pass across the amplifier input.' },
      { id: 'medium', label: 'Medium (10 kΩ ‖ 15 nF)', perform: true, type: 'checkbox', def: true, hint: 'A gentler low-pass, corner ≈ 2 kHz.' },
      { id: 'treble', label: 'Treble (2 H ‖ 4.7 nF)', perform: true, type: 'checkbox', def: true, hint: 'A broad band-pass round 1.6 kHz.' },
      { id: 'brilliant', label: 'Brilliant (0.6 H)', perform: true, type: 'checkbox', def: false, hint: 'A high-pass. Tabs combine in parallel; with none down the D6 is silent.' },
    ],
  },
  {
    title: 'Mute bar',
    params: [
      { id: 'muteOn', label: 'Mute engaged (or hold Space)', perform: true, type: 'checkbox', def: false },
      { id: 'mute', label: 'Felt pressure', min: 0.05, max: 1, def: 0.6, step: 0.01, fmt: (v) => `${(MUTE_K * v).toFixed(0)} N/m · ${(MUTE_R * v).toFixed(2)} N·s/m`, hint: 'The felt is a spring and a dashpot on the string, solved against every mode. It kills the high partials first and nudges the pitch up.' },
      { id: 'muteX', label: 'Felt position', min: 3, max: 60, def: 14, step: 0.5, fmt: mm, hint: 'Distance from the tailpiece. Partials with a node at the felt escape it.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.2, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'D6 · both pickups, medium + treble', p: {} },
  { name: 'Mellow · lower pickup, soft', p: { pickup: 'lower', soft: true, medium: false, treble: false, gain: 11 } },
  { name: 'Bright · upper pickup, treble + brilliant', p: { pickup: 'upper', medium: false, brilliant: true } },
  { name: 'Thin · pickups out of phase', p: { pickup: 'diff', medium: false, brilliant: true, gain: -4 } },
  { name: 'Muted staccato', p: { muteOn: true, mute: 0.7 } },
  { name: 'Worn tips · bouncing, buzzing', p: { tipLoss: 0.1, tip: 0.45, press: 2.2, keyMass: 14 } },
  { name: 'Soft tips · wide vibrato', p: { tip: 0.6, wrap: 1.5 } },
  { name: 'No yarn · release rings a minor third down', p: { yarn: 30 } },
  { name: 'Ideal string · no stiffness, no glide', p: { stiff: 0, kc: false } },
];
