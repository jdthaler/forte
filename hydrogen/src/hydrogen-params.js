// hydrogen-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound. Every key is a tube of hydrogen glowing while the key is down: its
// spectrum, every line at its exact ratio to Hα, moved down so that Hα is the key's note.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

// (written so that the plugins can write the same: tools/gen-native-params.mjs)
const sig = (v, d = 2) => Number(v.toPrecision(d)).toString();
const pow10 = (v, unit = '') => {
  const [m, e] = v.toExponential(1).split('e');
  return `${m}×10${String(Number(e)).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])}${unit}`;
};
const ns = (v) => (v < 9.95 ? `${v.toFixed(1)} ns` : v < 999.5 ? `${v.toFixed(0)} ns` : `${(v / 1000).toFixed(2)} µs`);
const ALPHA_INV = 137.035999084;

export const GROUPS = [
  {
    title: 'The lamp',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'How hard the computer keys play (a MIDI keyboard\'s velocity does the same): how many atoms the key lights, so how loud its lamp glows. The spectrum is the same at every velocity.' },
      { id: 'excitation', label: 'Excitation', type: 'select', face: 'selector', perform: true, def: 'discharge',
        options: [['discharge', 'Discharge (electrons strike the atoms)'], ['recombination', 'Recombination (a nebula)'], ['laser', 'Laser (one level)']], shortLabels: ['Discharge', 'Nebula', 'Laser'],
        hint: 'How the key puts the atoms into their excited levels. Discharge: a current through the tube, whose electrons knock atoms from the ground state into the p levels, mostly the low ones (the excitation is strongest for the strongest absorption lines). Recombination: an ionised gas, as in a nebula lit by a hot star, where electrons are captured into every level, high ones too, and cascade down: the classic recombination spectrum. Laser: a laser tuned to one line of the Lyman series lifts every atom into the same np level, and you hear only the cascades that start there.' },
      { id: 'temperature', label: 'Temperature', face: 'dial', min: 1000, max: 100000, def: 20000, log: true, fmt: (v) => `${v.toFixed(0)} K`,
        hint: 'The electrons\' temperature. In a discharge a hotter gas reaches higher levels, so more of the series sounds and the high lines are louder against Hα. In a nebula a cooler gas captures more electrons into high levels, which changes the balance of the lines a little (the Balmer decrement). It also sets the atoms\' thermal speeds, which widen every line by its Doppler shift.' },
      { id: 'laserLevel', label: 'Laser level n', min: 2, max: 30, def: 5, step: 1, fmt: (v) => `${v.toFixed(0)}p`, showIf: (P) => P.excitation === 'laser',
        hint: 'The level the laser pumps, np, reached from the ground state by Lyman line n. A low level gives a few bright lines; a high one cascades down through many levels and lights many lines, all of them below the laser\'s.' },
      { id: 'caseB', label: 'Lyman lines trapped (Case B)', type: 'checkbox', def: false,
        hint: 'A thick gas absorbs its own Lyman lines: every photon from np down to 1s is caught by another atom and re-emitted, until the atom takes another way down, through the Balmer lines and the 2s level. On (Case B, as in most nebulae): the Lyman lines are silent and the rest grow louder. Off (Case A): a thin gas, where every line escapes.' },
      { id: 'density', label: 'Density', perform: true, min: 100, max: 1e18, def: 1e8, log: true, fmt: (v) => pow10(v, ' cm⁻³'),
        hint: 'How many ions per cubic centimetre surround each atom. Their electric fields split its levels (the Stark effect) by an amount that varies from atom to atom, which broadens every line, most of all the high ones, whose levels are biggest. Past about 10¹⁴ cm⁻³ the top of each series smears into a hiss and its last resolved line moves down (the Inglis–Teller limit); at 10¹⁸ even Hα is a band of noise. The mod wheel moves it.' },
      { id: 'glow', label: 'Time in the glow', min: 5, max: 2000, def: 60, log: true, fmt: ns,
        hint: 'How long an excited atom stays in the glow before it is carried out of it or loses its energy in a collision, on average (in the atom\'s own time, before the slow motion). Every level drains at least this fast, so it caps how long the slow levels take to fill and how long the light lasts after the key comes up.' },
    ],
  },
  {
    title: 'The spectrometer',
    params: [
      { id: 'window', label: 'Window', type: 'select', perform: true, def: 'visible',
        options: [['visible', 'Visible (380–750 nm, what the eye sees)'], ['ultraviolet', 'Ultraviolet (below 380 nm)'], ['infrared', 'Infrared (above 750 nm)'], ['all', 'Every line']], shortLabels: ['Visible', 'UV', 'IR', 'All'],
        hint: 'Which lines reach the ear, by their real wavelength. Visible: the Balmer series the eye sees, Hα\'s red to the violet, a chord that rises to a just minor seventh. Ultraviolet: the Lyman series, two octaves and a fourth up, and the top of the Balmer series. Infrared: the Paschen, Brackett and Pfund series, from a major third below the note to three and a half octaves below. Every line: all of them, as far as hearing goes.' },
      { id: 'slowmo', label: 'Slow motion', min: 1e6, max: 1e9, def: 3e7, log: true, fmt: (v) => `${pow10(v)} (2p lives ${sig(1.596e-9 * v * 1000)} ms)`,
        hint: 'How much the atoms\' time is stretched. The frequencies are moved down by about 10¹² so that Hα is the key\'s note, but time by less: at 3 × 10⁷ the 2p level, which lives 1.6 ns, lives 48 ms. More slow motion: each line is purer and steadier (a line is as wide as its levels decay fast), but the lamp takes longer to light and to fade. Less: a quicker attack, rougher lines. The uncertainty principle, by ear.' },
      { id: 'shutter', label: 'Shutter on release', perform: true, min: 0.05, max: 30, def: 1, log: true, fmt: (v) => (v >= 29.95 ? 'Open' : `T₆₀ ${v < 1 ? v.toFixed(2) : v.toFixed(1)} s`),
        hint: 'Not the atoms\' doing: when the key comes up (or the pedal, for a lamp it held), the spectrometer\'s shutter closes over the light, which falls 60 dB in this time on top of the atoms\' own fade. Without it the lamp fades only as its levels empty, the slowest of them as fast as the time in the glow drains them: about 10 s at the default slow motion, longer with more. All the way up the shutter stays open and you hear that fade.' },
      { id: 'alphaScale', label: 'Fine-structure constant', min: 1, max: 40, def: 1, log: true,
        fmt: (v) => `${v < 9.995 ? v.toFixed(2) : v.toFixed(1)} × real (α = 1/${(ALPHA_INV / v).toFixed(v < 1.0005 ? 3 : 1)})`,
        hint: 'A what-if: a bigger α. Relativity splits each level by its angular momentum j, by α² of its energy: Hα is really seven lines 0.3 cm⁻¹ apart, which on A3 beat about once every three minutes. Turn α up and the splitting grows as its square: at 10 × real Hα\'s components on A3 beat about every two seconds, at 40 × they spread over half a semitone. Hear it with plenty of slow motion, which keeps each component narrower than the gaps between them. The real α is the one that makes the atom work as it does.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.3, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

// Each preset shows one idea.
export const PRESETS = [
  { name: 'A hydrogen lamp: the Balmer series', p: {} },
  { name: 'A nebula: Case B recombination', p: { excitation: 'recombination', temperature: 10000, caseB: true, density: 1000 } },
  { name: 'The Lyman series: two octaves and a fourth up', p: { window: 'ultraviolet' } },
  { name: 'The infrared: Paschen, Brackett and Pfund', p: { window: 'infrared', excitation: 'recombination', temperature: 10000 } },
  { name: 'Every line, as far as hearing goes', p: { window: 'all', excitation: 'recombination', temperature: 10000 } },
  { name: 'Laser to 3p: Lyman β and Hα', p: { excitation: 'laser', laserLevel: 3, window: 'all' } },
  { name: 'Laser to 12p: a long cascade', p: { excitation: 'laser', laserLevel: 12, window: 'all' } },
  { name: 'A dense plasma: Stark-broadened lines', p: { density: 3e16, temperature: 30000 } },
  { name: 'Fine structure, 12 × the real α', p: { alphaScale: 12, slowmo: 3e8 } },
  { name: 'Quick and rough: less slow motion', p: { slowmo: 5e6 } },
  { name: 'Pure and slow: more slow motion', p: { slowmo: 3e8, glow: 30 } },
];
