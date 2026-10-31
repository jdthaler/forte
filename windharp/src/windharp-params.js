// windharp-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound.

import { U_REF, U_MAX, noteName } from './windharp-model.js';
import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const dB = (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB`;
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];

export const GROUPS = [
  {
    title: 'Wind',
    params: [
      { id: 'wind', label: 'Wind speed', perform: true, min: 1, max: U_MAX, def: U_REF, step: 0.02, fmt: (v) => `${v.toFixed(2)} m/s`,
        hint: `Every string is cut to sound its note at ${U_REF} m/s. More wind raises every string’s shedding frequency, and each hops up its own harmonic series; less wind brings them down, and below Re = 47 the thinnest (top) strings stop. The mod wheel and aftertouch blow harder.` },
      { id: 'gust', label: 'Gustiness', perform: true, min: 0, max: 0.3, def: 0, step: 0.005, fmt: (v) => (v === 0 ? 'steady' : `${(v * 100).toFixed(1)} % rms`),
        hint: 'Turbulence in the wind (its intensity, σ_u/U). Gusts push the strings in and out of lock-in: near a switch a string flickers between harmonics, the Aeolian harp’s sound.' },
      { id: 'gustTime', label: 'Gust time scale', min: 0.3, max: 6, def: 1.5, log: true, fmt: (v) => `${v.toFixed(2)} s`,
        hint: 'How long a gust lasts (the turbulence’s integral time scale). Faster eddies are weaker, falling as f^−5/3.' },
    ],
  },
  {
    title: 'Strings',
    params: [
      { id: 'tuning', label: 'Tuning', type: 'select', def: 'keys', options: [['keys', 'Each key’s string cut for its note'], ['unison', 'Kircher: all strings in unison, gauges differ']],
        hint: 'Each key cut for its note: its string sounds the note on harmonic n₀ at the reference wind. Kircher’s harp: every string tuned to the same note and only its thickness differs, so each key’s gauge locks onto whichever harmonic of the unison is nearest its shedding frequency.' },
      { id: 'n0', label: 'Sounding harmonic n₀', min: 2, max: 6, def: 3, step: 1, fmt: (v) => `${ORD[v]} harmonic`, showIf: (P) => P.tuning === 'keys',
        hint: 'Which harmonic of each string sounds the key’s note at the reference wind: its fundamental is the note ÷ n₀. Higher n₀ puts the harmonics closer together, so wind changes hop by smaller intervals.' },
      { id: 'unison', label: 'Unison note', min: 43, max: 67, def: 55, step: 1, fmt: (v) => noteName(v), showIf: (P) => P.tuning === 'unison',
        hint: 'The fundamental every string of Kircher’s harp is tuned to. The keys sound its harmonics.' },
      { id: 'q', label: 'String Q', min: 100, max: 3000, def: 500, log: true, fmt: (v) => `${v.toFixed(0)}`,
        hint: 'The string’s own losses (ζ = 1/2Q). Less damping locks harder and louder (the mass–damping, or Skop–Griffin, parameter falls) and rings longer after the shutter closes.' },
      { id: 'mass', label: 'String mass (winding)', min: 1, max: 8, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)} (m* = ${(744 * v).toFixed(0)})`,
        hint: 'A metal winding makes the string heavier without thickening it (tension rises to keep the pitch). The mass ratio m* grows: lock-in narrows, the wake grows the string more slowly and its swing falls.' },
    ],
  },
  {
    title: 'Shutters',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => `${v.toFixed(2)} (${(300 * (1 / 30) ** v).toFixed(0)} ms)`,
        hint: 'How fast a key slides its shutter open along the string: slowly, the wind reaches the string a little at a time.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.25, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: dB },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Each key on its 3rd harmonic, steady wind', p: {} },
  { name: 'A gusty evening: strings flicker between harmonics', p: { gust: 0.06, gustTime: 1.2 } },
  { name: 'Kircher’s harp: unison strings, gauges differ', p: { tuning: 'unison', unison: 55 } },
  { name: 'Close harmonics: tuned on the 6th', p: { n0: 6 } },
  { name: 'Low harmonics: tuned on the 2nd', p: { n0: 2 } },
  { name: 'Heavy wound strings: high mass ratio', p: { mass: 6 } },
  { name: 'Lightly damped strings: loud, sticky lock-in', p: { q: 2000 } },
  { name: 'Slow, gentle gusts: the strings sway in and out', p: { gust: 0.03, gustTime: 4 } },
];
