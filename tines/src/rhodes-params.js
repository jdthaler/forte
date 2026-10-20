// rhodes-params.js — knobs, grouped for the UI, and presets.
//
// kind: 'model'  → recompute the key mechanics (modes); heard from the next note
//       'pickup' → the pickups' placement and voicing: live, even on ringing notes
//       'engine' → audio thread only
//       'mix'    → Web Audio graph
//       'play'   → computer-keyboard velocity

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const x = (v) => `×${v < 1 ? v.toFixed(2) : v.toFixed(v < 10 ? 2 : 0)}`;

export const GROUPS = [
  {
    id: 'tine', title: 'Tine',
    params: [
      { id: 'tineDiameter', label: 'Tine diameter', kind: 'model', min: 1.2, max: 2.8, step: 0.01, def: 1.9, fmt: (v) => `${v.toFixed(2)} mm`,
        hint: 'Length is solved per key to hit the pitch: thicker tines are longer.' },
      { id: 'springMass', label: 'Tuning spring mass', kind: 'model', min: 0, max: 1.5, step: 0.01, def: 0.35, fmt: (v) => `${(v * 100).toFixed(0)} % of tine`,
        hint: 'A point mass on the tine. It lowers f₁ more than the overtones, stretching the bell partial.' },
      { id: 'springPos', label: 'Spring position', kind: 'model', min: 0.2, max: 1, step: 0.01, def: 0.8, fmt: (v) => `${(v * 100).toFixed(0)} % of length` },
      { id: 'strike', label: 'Hammer strike point', kind: 'model', min: 2, max: 40, step: 0.5, def: 8, fmt: (v) => `${v.toFixed(1)} mm from clamp`,
        hint: 'Near the clamp every mode shape goes like x², so higher modes (the bell) are excited relatively more.' },
    ],
  },
  {
    id: 'bar', title: 'Tone bar & mount',
    params: [
      { id: 'barMass', label: 'Tone bar mass', kind: 'model', min: 0.01, max: 60, def: 15, log: true, fmt: x,
        hint: '× tine mass. Tiny = no tone bar: the tine shakes its mount and dies fast. (Next note.)' },
      { id: 'barTune', label: 'Tone bar tuning', kind: 'model', min: -100, max: 100, step: 1, def: 0, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)} ¢`,
        hint: 'Matched to the tine, the fork’s antisymmetric mode leaves the block still and sustains. (Next note.)' },
      { id: 'blockMass', label: 'Block + harp mass', kind: 'model', min: 5, max: 2000, def: 100, log: true, fmt: x, hint: '(Next note.)' },
      { id: 'mountRatio', label: 'Mount resonance', kind: 'model', min: 0.1, max: 3, def: 0.45, log: true, fmt: (v) => `${v.toFixed(2)} × f₀`, hint: '(Next note.)' },
      { id: 'mountDamp', label: 'Grommet damping ζ', kind: 'model', min: 0.02, max: 2, def: 0.8, log: true, fmt: (v) => v.toFixed(2), hint: '(Next note.)' },
    ],
  },
  {
    id: 'hammer', title: 'Hammer',
    params: [
      { id: 'hardness', label: 'Tip hardness', kind: 'model', min: 0.1, max: 10, def: 1, log: true, fmt: x,
        hint: 'Neoprene tips, graded softer in the bass. Harder = shorter contact = brighter.' },
      { id: 'tipExp', label: 'Tip nonlinearity Δp', kind: 'model', min: -0.5, max: 1, step: 0.05, def: 0, fmt: (v) => (v >= 0 ? '+' : '') + v.toFixed(2) },
      { id: 'hammerMass', label: 'Hammer mass', kind: 'model', min: 0.3, max: 3, def: 1, log: true, fmt: x },
      { id: 'hysteresis', label: 'Tip hysteresis α', kind: 'model', min: 0, max: 1e-3, step: 1e-5, def: 2e-4, fmt: (v) => `${(v * 1e6).toFixed(0)} µs` },
      { id: 'velocity', label: 'Keyboard velocity', perform: true, kind: 'play', min: 0.2, max: 5, step: 0.05, def: 1.8, fmt: (v) => `${v.toFixed(2)} m/s`, hint: '↑ / ↓ arrows. MIDI uses key velocity.' },
    ],
  },
  {
    id: 'pickup', title: 'Pickup',
    params: [
      { id: 'gap', label: 'Tine-to-pickup gap', kind: 'pickup', min: 0.4, max: 5, step: 0.05, def: 1.2, fmt: (v) => `${v.toFixed(2)} mm`,
        hint: 'Closer = narrower flux bump = more harmonics for the same swing ("bark"). Live, even on ringing notes.' },
      { id: 'offset', label: 'Vertical voicing', kind: 'pickup', min: -1.2, max: 1.2, step: 0.01, def: 0.4, fmt: (v) => (Math.abs(v) < 0.005 ? 'centred' : `${v > 0 ? '+' : ''}${v.toFixed(2)} w`),
        hint: 'Tine rest position relative to the pole axis. Centred → mostly the octave; off-centre → fundamental + even harmonics. Live.' },
      { id: 'poleRadius', label: 'Pole piece radius', kind: 'pickup', min: 0.3, max: 4, step: 0.05, def: 1, fmt: (v) => `${v.toFixed(2)} mm`, hint: 'Live.' },
      { id: 'cable', label: 'Cable capacitance', kind: 'engine', min: 100, max: 6000, def: 1000, log: true,
        fmt: (v) => `${v.toFixed(0)} pF → ${(1 / (2 * Math.PI * Math.sqrt(v * 1e-12)) / 1000).toFixed(1)} kHz`,
        hint: 'Resonates with the ~1 H of pickup coils: a long cable is a low-pass.' },
      { id: 'resQ', label: 'Pickup resonance Q', kind: 'engine', min: 0.5, max: 6, step: 0.05, def: 2, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    id: 'damping', title: 'Damping',
    params: [
      { id: 'tineLoss', label: 'Tine loss', kind: 'model', min: 0.1, max: 10, def: 1, log: true, fmt: x, hint: '(Next note.)' },
      { id: 'hfLoss', label: 'High-mode loss', kind: 'model', min: 0.1, max: 10, def: 0.7, log: true, fmt: x, hint: 'How long the bell partial rings. (Next note.)' },
      { id: 'barLoss', label: 'Tone bar loss', kind: 'model', min: 0.1, max: 10, def: 1, log: true, fmt: x, hint: '(Next note.)' },
      { id: 'damper', label: 'Damper felt', kind: 'engine', min: 2, max: 150, def: 35, log: true, fmt: (v) => `${v.toFixed(0)} s⁻¹` },
    ],
  },
  {
    id: 'amp', title: 'Suitcase & amp',
    params: [
      { id: 'tremDepth', label: 'Stereo vibrato depth', perform: true, kind: 'engine', min: 0, max: 1, step: 0.01, def: 0, fmt: (v) => v.toFixed(2) },
      { id: 'tremRate', label: 'Stereo vibrato rate', perform: true, kind: 'engine', min: 0.5, max: 10, step: 0.05, def: 4, fmt: (v) => `${v.toFixed(2)} Hz` },
      { id: 'drive', label: 'Amp drive', kind: 'engine', min: 0, max: 1, step: 0.01, def: 0.15, fmt: (v) => v.toFixed(2) },
      { id: 'tone', label: 'Speaker top end', kind: 'engine', min: 1500, max: 14000, def: 6000, log: true, fmt: (v) => `${(v / 1000).toFixed(1)} kHz` },
      { id: 'voicing', label: 'Register voicing', kind: 'pickup', min: -8, max: 4, step: 0.1, def: -3.5, fmt: (v) => `${v.toFixed(1)} dB/oct`,
        hint: 'Pickup emf ∝ frequency, so an unvoiced bass is quiet. Real instruments are balanced by voicing. Live.' },
      { id: 'room', label: 'Room', kind: 'mix', min: 0, max: 1, step: 0.01, def: 0.2, fmt: (v) => v.toFixed(2) },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, kind: 'mix', min: 0, max: 2, step: 0.01, def: 0.8, fmt: (v) => v.toFixed(2) },
    ],
  },
  TUNING_GROUP,
];

export const ALL_PARAMS = GROUPS.flatMap((g) => g.params);
export const DEFAULTS = Object.fromEntries(ALL_PARAMS.map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Stage piano (default voicing)', p: {} },
  { name: 'Bark — pickups close, voiced off-centre', p: { gap: 0.6, offset: 0.55, drive: 0.35 } },
  { name: 'Mellow — pickups pulled back', p: { gap: 2.8, offset: 0.3, tone: 4000 } },
  { name: 'Centred tine — the octave trick', p: { offset: 0 } },
  { name: 'Bell — strike right at the clamp', p: { strike: 3, hfLoss: 0.4 } },
  { name: 'No tone bar — bare tine on its mount', p: { barMass: 0.01 } },
  { name: 'Detuned tone bar (+40 ¢)', p: { barTune: 40 } },
  { name: 'Soft felt hammers (early style)', p: { hardness: 0.25, hysteresis: 6e-4, hammerMass: 1.3 } },
  { name: 'Suitcase stereo vibrato', p: { tremDepth: 0.7, tremRate: 4.5 } },
  { name: 'Heavy tuning springs (stretched bell)', p: { springMass: 1.2, springPos: 0.95 } },
];
