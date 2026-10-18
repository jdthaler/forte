// ring-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint
// says what it does to the sound. The rings are scaled to sound: a key's revolution frequency
// is its note, so a bunch passes the pickup a few hundred times a second instead of a million.

import { VENUE } from '../../shared/chain.js';

const pct = (d) => (v) => `${(v * 100).toFixed(d)} %`;
const sec = (v) => (v < 1 ? `${(v * 1000).toFixed(0)} ms` : `${v.toFixed(v < 10 ? 2 : 1)} s`);

export const GROUPS = [
  {
    title: 'Injection',
    params: [
      { id: 'kick', label: 'Injection kick', perform: true, min: 0, max: 6, def: 2.5, step: 0.05, fmt: (v) => `${v.toFixed(2)} σ`,
        hint: 'How far off the closed orbit the bunch arrives, in beam sizes. The kick sets the betatron oscillation the pickup hears as sidebands at (n ± Q)·f_rev; a big kick also filaments faster through the amplitude detuning. 0: a clean injection, a pure pulse train.' },
      { id: 'phase', label: 'Injection phase error', min: 0, max: 4, def: 1, step: 0.05, fmt: (v) => `${v.toFixed(2)} σ`,
        hint: 'How early or late the bunch arrives against the RF, in bunch lengths. It swings about the synchronous phase at the synchrotron frequency: a vibrato that the longitudinal damping slowly removes.' },
      { id: 'size', label: 'Beam size (σ / aperture)', min: 0.01, max: 0.3, def: 0.08, log: true, fmt: pct(1),
        hint: 'The beam\'s size against the pickup\'s half-aperture: how strongly a betatron oscillation of one σ shows in the electrodes.' },
      { id: 'lifetime', label: 'Beam lifetime', min: 1, max: 600, def: 60, log: true, fmt: sec,
        hint: 'How long the stored beam lasts while the key is down (Touschek scattering and the residual gas). Short: notes fade like a struck string.' },
      { id: 'scrape', label: 'Scraper time', min: 0.005, max: 2, def: 0.08, log: true, fmt: sec,
        hint: 'Letting go of a key closes the scrapers: the beam\'s lifetime falls to this. The pedal (Space) keeps the beam stored.' },
    ],
  },
  {
    title: 'Lattice',
    params: [
      { id: 'tune', label: 'Betatron tune (fraction)', min: 0.05, max: 0.95, def: 0.31, step: 0.001, fmt: (v) => `Q = ${v.toFixed(3)}`,
        hint: 'The fractional number of transverse oscillations per turn: where the sidebands sit between the harmonics. Near 0, ½ or 1 (an integer or half-integer resonance) they close in on the harmonics.' },
      { id: 'chroma', label: 'Chromaticity', perform: true, min: 0, max: 60, def: 20, step: 0.1, fmt: (v) => `Q′ = ${v.toFixed(1)}`,
        hint: 'How much the tune changes with momentum. Particles of different momentum dephase, so the betatron sidebands fade within a synchrotron period, then come back as the synchrotron motion brings every particle\'s momentum round again: recoherence. Given for the C4 ring; a bigger ring has more cells and more of it. The mod wheel turns it up.' },
      { id: 'octupole', label: 'Amplitude detuning', min: 0.1, max: 30, def: 2, log: true, fmt: (v) => `${v.toFixed(2)} ×10⁻⁴`,
        hint: 'The octupoles\' tune shift for a particle one σ out (in units of 10⁻⁴, in the C4 ring). It dephases particles by amplitude, which never recoheres: the sidebands fade for good, faster after a bigger kick, and slide in pitch as they go.' },
      { id: 'damping', label: 'Radiation damping time', min: 0.1, max: 20, def: 2.5, log: true, fmt: sec,
        hint: 'Synchrotron radiation damps the betatron oscillation in this time, and the synchrotron oscillation in half of it.' },
    ],
  },
  {
    title: 'RF',
    params: [
      { id: 'synch', label: 'Synchrotron frequency', perform: true, min: 0.5, max: 20, def: 4, log: true, fmt: (v) => `${v.toFixed(2)} Hz`,
        hint: 'How fast particles swing in energy in the RF bucket: the rate of the vibrato and of the recoherence. Pressing harder on a key raises the RF voltage, which raises it as √V.' },
      { id: 'bunch', label: 'Bunch length', perform: true, min: 0.005, max: 0.15, def: 0.025, log: true, fmt: pct(1),
        hint: 'The bunch\'s rms length as a share of the ring. A Gaussian bunch rolls the harmonics off as exp(−(2πnσ)²/2): short bunches are bright, long ones soft. More RF voltage (pressure) squeezes it as V^(−¼).' },
      { id: 'spread', label: 'Momentum spread', min: 0.0001, max: 0.005, def: 0.001, log: true, fmt: pct(3),
        hint: 'The rms momentum spread σδ. With the chromaticity it sets how far the betatron signal dephases before it recoheres: by the factor exp(−2(Q′σδ/Qs)²).' },
    ],
  },
  {
    title: 'Pickup',
    params: [
      { id: 'pickup', label: 'Pickup', perform: true, type: 'select', def: 'pair',
        options: [['pair', 'Two buttons'], ['single', 'One button'], ['delta', 'Difference']],
        hint: 'Two buttons, left and right of the beam, on the two channels: the betatron oscillation moves between them. One button on both channels. Difference: left minus right, which hears only the oscillation, fading and recohering.' },
      { id: 'cutoff', label: 'Pickup cutoff', min: 10, max: 3000, def: 120, log: true, fmt: (v) => `${v.toFixed(0)} Hz`,
        hint: 'A button pickup is a capacitor into a resistor: it passes the bunch\'s harmonics above 1/(2πRC) and weakens those below.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'The bunch charge the computer keys inject (a MIDI keyboard\'s velocity does the same).' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.2, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Kicked beam, recohering', p: {} },
  { name: 'Clean injection: the bare bunch train', p: { kick: 0, phase: 0 } },
  { name: 'Difference signal: only the oscillation', p: { pickup: 'delta', kick: 3, chroma: 28 } },
  { name: 'Octupoles on: filaments for good', p: { chroma: 2, octupole: 12, kick: 3.5 } },
  { name: 'Long bunch, slow RF', p: { bunch: 0.08, synch: 1.2, chroma: 8 } },
  { name: 'Near the half-integer', p: { tune: 0.48, chroma: 12 } },
  { name: 'Short lifetime: plucked beam', p: { lifetime: 1.5, bunch: 0.012, damping: 0.6 } },
];
