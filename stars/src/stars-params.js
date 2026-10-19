// stars-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

// The speed-up K: chosen so that the Sun itself is a key, G6 (1568 Hz), on the 1 M☉ track.
export const K0 = 510800;

const dB = (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB`;
const kfmt = (v) => `${(Math.round(v / 100) * 100).toLocaleString('en-US')}×`;
const spinFmt = (v) => (v === 0 ? 'none' : `${(25.4 / v).toFixed(v > 25.4 ? 2 : 1)} d (× ${v < 10 ? v.toFixed(1) : v.toFixed(0)} Sun)`);

export const GROUPS = [
  {
    title: 'Stars',
    params: [
      { id: 'family', label: 'Kind of star', type: 'select', def: 'track', options: [['track', 'Sun-like: an evolutionary track'], ['dscuti', 'δ Scuti: self-excited (κ-mechanism)']],
        hint: 'Sun-like stars are rung at random by their convection: a comb of modes that breathes. δ Scuti stars drive a few modes themselves; they grow, then hold steady.' },
      { id: 'mass', label: 'Mass of the track', min: 0.9, max: 1.8, def: 1, step: 0.05, fmt: (v) => `${v.toFixed(2)} M☉`, showIf: (P) => P.family === 'track',
        hint: 'The keyboard follows one star as it ages: dwarfs on the top keys, subgiants in the middle, red giants below. A heavier star’s comb is a little denser at the same pitch, and its dwarfs are hotter, with broader modes.' },
      { id: 'speedup', label: 'Speed-up K', min: 350000, max: 1000000, def: K0, log: true, fmt: kfmt,
        hint: 'μHz × K = Hz. A larger K puts older, larger stars on every key, and their modes ring for fewer seconds.' },
    ],
  },
  {
    title: 'Rotation and view',
    params: [
      { id: 'spin', label: 'Rotation period', perform: true, min: 0, max: 30, def: 1, step: 0.1, fmt: spinFmt,
        hint: 'Splits each mode into 2l + 1 components, m·Ω/2π apart: slow beats at the Sun’s 25.4-day rate (0.46 μHz), a chorus when fast. The mod wheel spins the star up.' },
      { id: 'coreRatio', label: 'Core spins faster by', min: 1, max: 30, def: 5, step: 0.5, fmt: (v) => `× ${v.toFixed(1)}`, showIf: (P) => P.family === 'track',
        hint: 'Red giants’ cores spin faster than their envelopes. The dipole modes trapped in the core split by half the core’s rate.' },
      { id: 'incl', label: 'Inclination', perform: true, min: 0, max: 90, def: 60, step: 1, fmt: (v) => `${v.toFixed(0)}°${v === 0 ? ' (pole-on)' : v === 90 ? ' (equator-on)' : ''}`,
        hint: 'The angle between the rotation axis and your line of sight. Pole-on you see only the m = 0 components; equator-on the outer ones, m = ±l.' },
    ],
  },
  {
    title: 'Convection',
    params: [
      { id: 'driving', label: 'Convective driving', perform: true, min: 0, max: 2, def: 1, step: 0.01, fmt: (v) => (v === 0 ? 'off: only the flare' : dB(v)),
        hint: 'How hard the turbulence near the surface kicks the modes (their heights). The modes answer over their own lifetimes; at zero only the flare rings them.' },
      { id: 'damping', label: 'Damping (linewidths)', min: 0.1, max: 10, def: 1, log: true, fmt: (v) => `× ${v < 1 ? v.toFixed(2) : v.toFixed(1)}`,
        hint: 'Multiplies every linewidth Γ: broader modes breathe faster and ring down sooner; narrow ones are near-steady tones.' },
      { id: 'flare', label: 'Flare kick (× the modes’ rms)', perform: true, min: 0, max: 3, def: 0.7, step: 0.01, fmt: (v) => (v === 0 ? 'none' : `× ${v.toFixed(2)}`),
        hint: 'A coherent kick to every mode at key-down (velocity sets its size), so the note starts at once: the wave packet echoes through the star at the large separation.' },
      { id: 'growth', label: 'δ Scuti growth time', min: 0.05, max: 2, def: 0.25, log: true, fmt: (v) => `${v.toFixed(2)} s`, showIf: (P) => P.family === 'dscuti',
        hint: 'How fast an unstable mode grows (1/γ). Real growth times are years; here they are compressed.' },
      { id: 'velocity', label: 'Velocity (computer keys)', min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.25, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: dB },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'The Sun’s track (1 M☉)', p: {} },
  { name: 'A heavier track (1.5 M☉): hot dwarfs, broad modes', p: { mass: 1.5 } },
  { name: 'Pole-on: only m = 0', p: { incl: 0, spin: 8 } },
  { name: 'Equator-on, spinning fast: split multiplets', p: { incl: 90, spin: 15 } },
  { name: 'No rotation: single lines', p: { spin: 0 } },
  { name: 'Narrow modes: long lifetimes', p: { damping: 0.2 } },
  { name: 'Broad modes: quick breathing', p: { damping: 4 } },
  { name: 'Struck, not driven: the flare alone', p: { driving: 0, flare: 2 } },
  { name: 'Red giants with fast cores', p: { coreRatio: 25, spin: 2 } },
  { name: 'A smaller speed-up: younger stars on every key', p: { speedup: 350000 } },
  { name: 'δ Scuti: self-excited modes', p: { family: 'dscuti', spin: 20, flare: 1 } },
];
