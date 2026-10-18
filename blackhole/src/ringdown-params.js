// ringdown-params.js — knobs for the black-hole keyboard.
// kind: 'model' → recompute every key's modes; 'engine' → audio thread; 'mix' → Web Audio.

// spin slider: u = −log10(1 − a), from 0 (Schwarzschild) to 6 (a = 1 − 10⁻⁶)
export const spinFromU = (u) => 1 - 10 ** -u;
export const uFromSpin = (a) => -Math.log10(1 - a);

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export const KEY_LO = 21, KEY_HI = 108; // A0–C8: every key of an 88-key keyboard

export function fmtSpin(u) {
  const a = spinFromU(u);
  if (u < 2) return `a = ${a.toFixed(u < 1 ? 3 : 4)}`;
  return `a = 1 − ${(1 - a).toExponential(1).replace('e-', '×10⁻').replace(/⁻(\d)/, (_, d) => '⁻' + '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])}`;
}

export const GROUPS = [
  {
    id: 'hole', title: 'Black hole',
    params: [
      { id: 'spinU', label: 'Spin', perform: true, kind: 'model', min: 0, max: 6, step: 0.005, def: uFromSpin(0.69), fmt: fmtSpin,
        hint: 'Kerr parameter a = J/M², on a log scale toward extremality. Slow holes go “thud”; near-extremal ones ring like bells. ↑ / ↓ keys, MIDI mod wheel.' },
    ],
  },
  {
    id: 'merger', title: 'How it was struck (a binary merger)',
    params: [
      { id: 'massRatio', label: 'Mass ratio q', perform: true, kind: 'model', min: 1, max: 20, def: 1.2, log: true, fmt: (v) => `${v.toFixed(2)} : 1`,
        hint: 'Equal masses excite only even-m modes. Lopsided mergers switch on (2,1) and (3,3): “black-hole hair loss”.' },
      { id: 'inclination', label: 'Viewing inclination ι', perform: true, kind: 'model', min: 0, max: 180, step: 1, def: 30, fmt: (v) => `${v.toFixed(0)}°`,
        hint: 'Angle between the spin axis and your line of sight. Face-on: circular polarisation; edge-on: linear.' },
      { id: 't0', label: 'Ringdown start', kind: 'model', min: 0, max: 30, step: 0.5, def: 5, fmt: (v) => `${v.toFixed(1)} M after peak`,
        hint: 'Start closer to the merger and the fast-dying overtones (2,2,1), (2,2,2) are still loud.' },
      { id: 'overtones', label: 'Overtone strength', kind: 'model', min: 0, max: 2, step: 0.01, def: 1, fmt: (v) => v.toFixed(2) },
      { id: 'retrograde', label: 'Counter-rotating modes', kind: 'model', min: 0, max: 1, step: 0.01, def: 0, fmt: (v) => v.toFixed(2),
        hint: 'Modes travelling against the spin (m < 0), weakly excited in aligned mergers.' },
      { id: 'inspiral', label: 'Play the inspiral first (chirp)', perform: true, kind: 'model', type: 'checkbox', def: false },
      { id: 'inspiralOct', label: 'Inspiral starts', kind: 'model', min: 0.25, max: 3, step: 0.05, def: 1.5,
        fmt: (v) => `${v.toFixed(2)} octaves below ISCO`, showIf: (P) => P.inspiral,
        hint: 'Measured down from the wave frequency at the innermost stable circular orbit, f_ISCO = c³/(6√6 πGM) for the binary’s total mass M. The chirp lasts τ_c ∝ f^(−8/3), capped at 2 s. For the lowest keys the whole inspiral is under 20 Hz: you hear the merger.' },
    ],
  },
  {
    id: 'sound', title: 'Listening',
    params: [
      { id: 'stereo', label: 'Left = h₊, right = h× (polarisations)', kind: 'engine', type: 'checkbox', def: true },
      { id: 'releaseMute', label: 'Key release mutes', kind: 'engine', type: 'checkbox', def: false, hint: 'Unphysical, but handy for long near-extremal rings.' },
      { id: 'tone', label: 'Tone (low-pass)', perform: true, kind: 'mix', min: 500, max: 20000, def: 14000, log: true, fmt: (v) => `${(v / 1000).toFixed(1)} kHz` },
      { id: 'room', label: 'Room', perform: true, kind: 'mix', min: 0, max: 1, step: 0.01, def: 0.25, fmt: (v) => v.toFixed(2) },
      { id: 'volume', label: 'Volume', perform: true, kind: 'mix', min: 0, max: 2, step: 0.01, def: 0.8, fmt: (v) => v.toFixed(2) },
    ],
  },
];

export const ALL_PARAMS = GROUPS.flatMap((g) => g.params);
export const DEFAULTS = Object.fromEntries(ALL_PARAMS.map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'GW150914-like remnant (a = 0.69, q = 1.2)', p: {} },
  { name: 'Schwarzschild (a = 0): two cycles and gone', p: { spinU: 0 } },
  { name: 'Rapid spin (a = 0.99)', p: { spinU: 2 } },
  { name: 'Near-extremal (a = 1 − 10⁻⁴): a harmonic bell', p: { spinU: 4, t0: 10, overtones: 0.4 } },
  { name: 'Extremal edge (a = 1 − 10⁻⁶): rings for a second', p: { spinU: 6, t0: 10, overtones: 0.4, releaseMute: true } },
  { name: 'Lopsided merger (q = 8): odd modes appear', p: { massRatio: 8 } },
  { name: 'Seen edge-on (ι = 90°): linear polarisation', p: { inclination: 90 } },
  { name: 'Early ringdown (t₀ = 0): overtone burst', p: { t0: 0, overtones: 1.5 } },
  { name: 'Inspiral + merger + ringdown (LIGO chirp)', p: { inspiral: true, inspiralOct: 1.5 } },
  { name: 'Counter-rotating modes too', p: { retrograde: 0.7, massRatio: 3 } },
];
