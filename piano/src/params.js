// params.js — every adjustable knob, grouped for the UI, plus presets.
//
// kind: 'model'  → changes the string physics (modes recomputed)
//       'engine' → sent straight to the audio thread
//       'mix'    → Web Audio graph (soundboard, room, volume)
//       'play'   → how the computer keyboard plays

import { MATERIALS, SHAPES } from './materials.js';
import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const x = (v) => `×${v < 1 ? v.toFixed(2) : v.toFixed(v < 10 ? 2 : 1)}`;

export const GROUPS = [
  {
    id: 'string', title: 'String / ribbon',
    params: [
      { id: 'material', label: 'Material', kind: 'model', type: 'select', def: 'steel',
        options: Object.entries(MATERIALS).map(([k, v]) => [k, v.name]) },
      { id: 'shape', label: 'Cross-section', kind: 'model', type: 'select', def: 'round',
        options: Object.entries(SHAPES) },
      { id: 'aspect', label: 'Ribbon width : thickness', kind: 'model', min: 1, max: 60, def: 12, log: true,
        fmt: (v) => `${v.toFixed(v < 10 ? 1 : 0)} : 1`, showIf: (P) => P.shape === 'ribbon',
        hint: 'Same cross-sectional area (same mass) — only the shape changes.' },
      { id: 'roll', label: 'Roll angle ψ', kind: 'model', min: 0, max: 90, step: 1, def: 0, fmt: (v) => `${v.toFixed(0)}°`,
        hint: 'Rotation of the section about the string axis. 0° = flat face toward the hammer.' },
      { id: 'taper', label: 'Planform taper', kind: 'model', min: -0.95, max: 0.95, step: 0.01, def: 0,
        fmt: (v) => (Math.abs(v) < 0.005 ? 'uniform' : `${((1 + v) / (1 - v)).toFixed(2)} : 1`),
        hint: 'Width at hammer end : width at bridge end. ±0.95 ≈ a triangular strip.' },
      { id: 'gauge', label: 'Thickness', kind: 'model', min: 0.4, max: 2.5, def: 1, log: true, fmt: x,
        hint: 'Scales the core diameter. Stiffness ∝ gauge⁴, tension ∝ gauge².' },
      { id: 'lengthScale', label: 'Length', kind: 'model', min: 0.5, max: 2, def: 1, log: true, fmt: x },
      { id: 'winding', label: 'Bass winding (extra mass)', kind: 'model', type: 'checkbox', def: true },
      { id: 'unisons', label: 'Strings per note', kind: 'model', min: 1, max: 3, step: 1, def: 2, fmt: (v) => v.toFixed(0) },
      { id: 'unisonDetune', label: 'Unison detune', kind: 'model', min: 0, max: 8, step: 0.1, def: 0.8, fmt: (v) => `${v.toFixed(1)} ¢` },
      { id: 'polDetune', label: 'Polarization detune', kind: 'model', min: -5, max: 5, step: 0.1, def: 0.3, fmt: (v) => `${v.toFixed(1)} ¢`,
        hint: 'Extra detune of the 2nd bending axis (bridge anisotropy).' },
      { id: 'kc', label: 'Tension modulation (pitch glide)', kind: 'engine', type: 'checkbox', def: true,
        hint: 'A hard blow stretches the string, so its tension and pitch rise, then glide back as it decays.' },
      { id: 'longi', label: 'Longitudinal modes (phantom partials)', kind: 'engine', min: 0, max: 4, step: 0.05, def: 1,
        fmt: (v) => (v === 0 ? 'off' : `×${v.toFixed(2)}`),
        hint: 'A string stretched by its own swing pulls on the bridge along its length, and that pull rings in the string\'s longitudinal modes, about 15 times its pitch. It sounds at the sums of the partials\' frequencies: phantom partials between the overtones, a metallic growl in the bass that grows with the square of the blow.' },
    ],
  },
  {
    id: 'hammer', title: 'Hammer',
    params: [
      { id: 'strikePos', label: 'Strike position', kind: 'model', min: 0.02, max: 0.5, step: 0.001, def: 0.12,
        fmt: (v) => `${v.toFixed(3)} L  (1/${(1 / v).toFixed(1)})`,
        hint: 'Distance from the agraffe end as a fraction of length. Partials with a node here vanish.' },
      { id: 'offset', label: 'Strike offset across width', kind: 'model', min: -1, max: 1, step: 0.01, def: 0,
        fmt: (v) => `${(v * 100).toFixed(0)} %`, hint: 'Off-centre hits twist flat faces → torsional waves. (No effect on round wire.)' },
      { id: 'hardness', label: 'Felt hardness', kind: 'model', min: 0.1, max: 10, def: 1, log: true, fmt: x },
      { id: 'feltExp', label: 'Felt nonlinearity Δp', kind: 'model', min: -0.8, max: 1, step: 0.05, def: 0,
        fmt: (v) => (v >= 0 ? '+' : '') + v.toFixed(2), hint: 'F = K δ^p. Larger p: brighter when loud, darker when soft.' },
      { id: 'hammerMass', label: 'Hammer mass', kind: 'model', min: 0.25, max: 4, def: 1, log: true, fmt: x },
      { id: 'hammerWidth', label: 'Contact width', kind: 'model', min: 0.1, max: 3, def: 1, log: true, fmt: x },
      { id: 'hysteresis', label: 'Felt hysteresis α', kind: 'model', min: 0, max: 4e-4, step: 1e-6, def: 5e-5,
        fmt: (v) => `${(v * 1e6).toFixed(0)} µs` },
      { id: 'velocity', label: 'Velocity', perform: true, strip: true, kind: 'play', min: 0.2, max: 6, step: 0.05, def: 2.5,
        fmt: (v) => `${v.toFixed(2)} m/s`, hint: '↑ / ↓ arrows. MIDI uses key velocity instead.' },
      { id: 'unaCorda', label: 'Una corda (soft pedal)', pedal: true, perform: true, strip: true, kind: 'engine', type: 'checkbox', def: false,
        hint: 'Shifts the action so each hammer misses one string (2 of 3, or 1 of 2). The missed string is driven only through the bridge: softer, with a longer aftersound. MIDI CC 67.' },
    ],
  },
  {
    id: 'damping', title: 'Damping & bridge',
    params: [
      { id: 'bridge', label: 'Bridge coupling', kind: 'model', min: 0.1, max: 10, def: 1, log: true, fmt: x,
        hint: 'Soundboard admittance. More coupling = louder, shorter, stronger unison interaction. (Next note.)' },
      { id: 'bridgeH', label: 'Horizontal / vertical coupling', kind: 'model', min: 0, max: 1, step: 0.01, def: 0.3, fmt: (v) => v.toFixed(2),
        hint: '(Next note.)' },
      { id: 'lossLow', label: 'Air & internal loss', kind: 'model', min: 0.1, max: 10, def: 1, log: true, fmt: x, hint: '(Next note.)' },
      { id: 'lossHigh', label: 'High-frequency loss', kind: 'model', min: 0.1, max: 10, def: 1, log: true, fmt: x, hint: '(Next note.)' },
      { id: 'torsionLoss', label: 'Torsional loss', kind: 'model', min: 0.2, max: 10, def: 3, log: true, fmt: x, hint: '(Next note.)' },
      { id: 'damper', label: 'Damper strength', kind: 'engine', min: 2, max: 80, def: 25, log: true, fmt: (v) => `${v.toFixed(0)} s⁻¹` },
      { id: 'sympathy', label: 'Sympathetic resonance', kind: 'engine', min: 0, max: 1, step: 0.01, def: 0.25, fmt: (v) => (v === 0 ? 'off' : `${(v * 100).toFixed(0)} %`),
        hint: 'Every string whose damper is up (the pedal, a held key, the undamped treble) rings along through the bridge. The share of the bridge\'s motion one string feels from another: 100 % if they all met it at one point.' },
    ],
  },
  {
    id: 'output', title: 'Output',
    params: [
      { id: 'gainV', label: 'Vertical bridge force', kind: 'engine', min: 0, max: 1.5, step: 0.01, def: 1, fmt: (v) => v.toFixed(2) },
      { id: 'gainH', label: 'Horizontal bridge force', kind: 'engine', min: 0, max: 1.5, step: 0.01, def: 0.35, fmt: (v) => v.toFixed(2) },
      { id: 'gainT', label: 'Torsion pickup', kind: 'engine', min: 0, max: 2, step: 0.01, def: 0.6, fmt: (v) => v.toFixed(2) },
      { id: 'soundboard', label: 'Soundboard body', kind: 'mix', min: 0, max: 1, step: 0.01, def: 0.6, fmt: (v) => v.toFixed(2) },
      { id: 'room', label: 'Room', kind: 'mix', min: 0, max: 1, step: 0.01, def: 0.25, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'width', label: 'Stereo spread', kind: 'engine', min: 0, max: 1, step: 0.01, def: 0.6, fmt: (v) => v.toFixed(2) },
      { id: 'voicing', label: 'Treble voicing', kind: 'model', min: 0, max: 6, step: 0.1, def: 2.5, fmt: (v) => `${v.toFixed(1)} dB/oct`,
        hint: 'Loudness tilt across the keyboard (what a piano technician does to the felt). (Next note.)' },
      { id: 'volume', label: 'Volume', perform: true, strip: true, kind: 'mix', min: 0, max: 2, step: 0.01, def: 0.8, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
      { id: 'maxFreq', label: 'Highest partial', kind: 'model', min: 2000, max: 20000, def: 12000, log: true,
        fmt: (v) => `${(v / 1000).toFixed(1)} kHz`, hint: 'Lower this if the CPU meter runs hot.' },
    ],
  },
  TUNING_GROUP,
];

export const ALL_PARAMS = GROUPS.flatMap((g) => g.params);
export const DEFAULTS = Object.fromEntries(ALL_PARAMS.map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Concert grand (steel wire)', p: {} },
  { name: 'Square bar', p: { shape: 'square' } },
  { name: 'Triangular bar', p: { shape: 'triangle' } },
  { name: 'Ribbon, face-on', p: { shape: 'ribbon', aspect: 12 } },
  { name: 'Ribbon, twisted by an off-centre strike', p: { shape: 'ribbon', aspect: 12, offset: 0.8 } },
  { name: 'Ribbon, rolled 30° (both bending axes)', p: { shape: 'ribbon', aspect: 12, roll: 30 } },
  { name: 'Ribbon, edge-on (hard axis)', p: { shape: 'ribbon', aspect: 12, roll: 90 } },
  { name: 'Thin ribbon 40:1 (torsion ≈ transverse)', p: { shape: 'ribbon', aspect: 40, offset: 0.6 } },
  { name: 'Triangular (tapered) ribbon', p: { shape: 'ribbon', aspect: 12, taper: 0.9, offset: 0.4 } },
  // low-density materials get thicker so the tension (and loudness) is piano-like
  { name: 'Carbon-fibre ribbon (soft in shear)', p: { material: 'carbon', shape: 'ribbon', aspect: 12, offset: 0.6, gauge: 2.2 } },
  { name: 'Nylon strings', p: { material: 'nylon', gauge: 2.4 } },
  { name: 'Hammer at the middle (odd partials only)', p: { strikePos: 0.5 } },
  { name: 'Thick, stiff wire (very inharmonic)', p: { gauge: 2.2 } },
  { name: 'Brass strings', p: { material: 'brass' } },
  { name: 'Titanium strings', p: { material: 'titanium' } },
  { name: 'Three strings a note, una corda', p: { unisons: 3, unaCorda: true } },
];
