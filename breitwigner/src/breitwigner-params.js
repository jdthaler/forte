// breitwigner-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

// A width over a mass, Γ/M: per cent, or parts per million below a thousandth (three figures)
const figures = (x) => (x < 9.995 ? x.toFixed(2) : x < 99.95 ? x.toFixed(1) : x.toFixed(0));
export const share = (v) => (v >= 0.0009995 ? `${figures(v * 100)} %` : `${figures(v * 1e6)} ppm`);
const hz = (v) => `${figures(v)} Hz`;

// Real resonances, by their width over their mass (Particle Data Group, Review of Particle
// Physics 2026: the README's table has the masses and widths).
export const PARTICLES = {
  rho: 147.4 / 775.26,          // ρ(770)
  delta: 117 / 1232,            // Δ(1232)
  Z: 2.4955 / 91.1879,          // Z boson
  omega: 8.68 / 782.66,         // ω(782)
  phi: 4.249 / 1019.460,        // φ(1020)
  etaprime: 0.188 / 957.78,     // η′(958)
  higgs: 3.0e-3 / 125.13,       // Higgs boson (its width as measured so far: 3.0 +1.5 −0.7 MeV)
  jpsi: 92.6e-6 / 3.0969,       // J/ψ(1S)
  upsilon: 54.02e-6 / 9.4604,   // Υ(1S)
};

export const GROUPS = [
  {
    title: 'Resonance',
    params: [
      { id: 'width', label: 'Width Γ/M', perform: true, min: 1e-6, max: 1, def: 0.00417, log: true, fmt: share, hint: 'The line\'s full width at half its height, over the mass. Width times lifetime is ħ, so a wider line is a shorter note: τ = 1/Γ. Narrow, a pure tone that rings on; wide, a thud with hardly a pitch.' },
      { id: 'power', label: 'Width grows as Mⁿ', min: 0, max: 5, def: 1, step: 0.05, fmt: (v) => `Γ ∝ M^${v.toFixed(2)}`, hint: 'How the width changes from key to key, about A4. At 1 every key has the same Γ/M and rings as many cycles; at 0 every key lives as long; at 3 or 5 (Sargent\'s rule for weak decays) the heavy treble dies far sooner than the bass.' },
      { id: 'formation', label: 'Formation time', perform: true, min: 0, max: 1, def: 0, step: 0.001, fmt: (v) => `${(v * 1000).toFixed(0)} ms`, hint: 'How long a held key\'s source feeds its state. At 0 the state is made at once, struck; longer, the note swells for that long, or until the key comes up, then decays as before. A state that lives shorter than this holds a steady tone while formation balances decay. Never a click.' },
    ],
  },
  {
    title: 'Decay and production',
    params: [
      { id: 'release', label: 'Key-up channel Γ₂', perform: true, min: 0.05, max: 500, def: 6, log: true, fmt: hz, hint: 'Letting a key go opens a second way to decay, this wide on every key (the pedal keeps it shut). Partial widths add, so the note dies sooner and its line widens: 6 Hz ends a note in about a third of a second.' },
      { id: 'press', label: 'Press production', min: 0.1, max: 3, def: 1.5, step: 0.05, fmt: (v) => `${v.toFixed(2)} ×`, hint: 'A firm press into a held key (aftertouch) keeps making its state, as a beam at its energy would: at full pressure it builds to this many times the amplitude the key made it with, and holds there while pressed. It swells at the line\'s own rate, so a narrow line slowly.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'The amplitude the state is made with.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.25, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

const of = (x) => Number(x.toPrecision(3));

export const PRESETS = [
  { name: 'φ meson: 0.42 % wide, a soft mallet', p: {} },
  { name: 'ρ meson: 19 % wide, a thud with hardly a pitch', p: { width: of(PARTICLES.rho) } },
  { name: 'Δ(1232): 9.5 %, a tap', p: { width: of(PARTICLES.delta) } },
  { name: 'Z boson: 2.7 %, a knock on wood', p: { width: of(PARTICLES.Z) } },
  { name: 'ω meson: 1.1 %, a short bar', p: { width: of(PARTICLES.omega) } },
  { name: 'η′ meson: 196 ppm, a bar that rings for seconds', p: { width: of(PARTICLES.etaprime) } },
  { name: 'J/ψ: 30 ppm, a needle that rings for minutes', p: { width: of(PARTICLES.jpsi) } },
  { name: 'Higgs boson: 24 ppm, as measured so far', p: { width: of(PARTICLES.higgs) } },
  { name: 'Υ(1S): 5.7 ppm, the narrowest here', p: { width: of(PARTICLES.upsilon) } },
  { name: 'Formed slowly: the η′ swells for 0.3 s, then rings', p: { width: of(PARTICLES.etaprime), formation: 0.3 } },
  { name: 'A ρ fed while held: a steady tone, formation balancing decay', p: { width: of(PARTICLES.rho), formation: 1 } },
  { name: 'Sargent\'s rule: Γ ∝ M⁵, a bass that rings under a treble of ticks', p: { width: 0.002, power: 5 } },
  { name: 'One lifetime for every key: Γ the same in hertz', p: { width: 0.002, power: 0 } },
];
