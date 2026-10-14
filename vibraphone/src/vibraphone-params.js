// vibraphone-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

const sci = (v) => { const e = Math.floor(Math.log10(v)), m = v / 10 ** e; return `${m.toFixed(1)}×10${String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])}`; };
const yarn = (v) => (v < 120 ? 'soft yarn' : v < 400 ? 'medium-soft yarn' : v < 1500 ? 'medium yarn' : v < 4000 ? 'hard yarn' : 'cord or rubber');

export const GROUPS = [
  {
    title: 'Bars',
    params: [
      { id: 'depth', label: 'Undercut depth', min: 0, max: 1.2, def: 1, step: 0.01, fmt: (v) => (v === 0 ? 'none: a plain bar' : v === 1 ? 'tuned: 1 : 4 : 10' : `${(v * 100).toFixed(0)} % of the tuned cut`),
        hint: 'The arch cut under each bar. Tuned (100 %), modes 1, 2, 3 sit at 1 : 4 : 10; a plain bar rings at 1 : 2.76 : 5.40. Each bar is cut to the length that keeps it on pitch: a plain bar is half as long again. Applies to the next strike.' },
      { id: 'eta', label: 'Internal friction η', min: 1e-5, max: 1e-3, def: 1e-4, log: true, fmt: sci,
        hint: 'The aluminium’s loss factor. It sets how long the bar rings on its own; the cords, radiation and heat flow add their own losses.' },
      { id: 'temp', label: 'Air temperature', min: 0, max: 40, def: 20, step: 0.5, fmt: (v) => `${v.toFixed(1)} °C`,
        hint: 'Tuned at 20 °C. The tubes follow the speed of sound (about +3 ¢ per kelvin), the bars go slightly flat (−0.4 ¢ per kelvin): in a cold hall the resonators fall out of tune with their bars.' },
    ],
  },
  {
    title: 'Resonators',
    params: [
      { id: 'tubes', label: 'Resonator tubes', type: 'checkbox', def: true,
        hint: 'A stopped tube under each bar, tuned to its fundamental. Off: the bar alone, a weak radiator of its own fundamental.' },
      { id: 'gap', label: 'Bar–tube gap', min: 5, max: 80, def: 30, log: true, fmt: (v) => `${v.toFixed(1)} mm`,
        hint: 'How far below the bar the tube’s mouth sits. Closer: more of the bar’s air is pushed into the tube, a louder, shorter note; very close, bar and tube trade energy back and forth (beats).' },
      { id: 'detune', label: 'Tube tuning', min: -200, max: 200, def: 0, step: 1, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)} ¢`,
        hint: 'The tube’s own pitch relative to its bar (discs open). Off tune, it takes less energy from the bar: a quieter, longer note, beating at the difference as it starts.' },
    ],
  },
  {
    title: 'Motor',
    params: [
      { id: 'motor', label: 'Motor', perform: true, type: 'select', def: 'run', options: [['run', 'Running'], ['open', 'Off, discs open'], ['closed', 'Off, discs closed']],
        hint: 'The motor turns a shaft with a butterfly disc in every tube’s mouth. Stopped, the shaft turns to the chosen position and parks there.' },
      { id: 'speed', label: 'Shaft speed', perform: true, min: 0.5, max: 6, def: 2.25, step: 0.05, fmt: (v) => `${v.toFixed(2)} rev/s → ${(2 * v).toFixed(1)} Hz`, showIf: (P) => P.motor === 'run',
        hint: 'Each disc opens its tube twice per turn, so the tremolo runs at twice the shaft speed. The shaft takes a moment to spin up or down.' },
      { id: 'cd', label: 'Disc size', min: 0.3, max: 0.97, def: 0.7, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of the bore`,
        hint: 'How much of the mouth a disc covers face-on. Bigger discs close the tube further: a deeper tremolo.' },
      { id: 'twist', label: 'Disc phase step', min: 0, max: 90, def: 0, step: 1, fmt: (v) => `${v.toFixed(0)}° per bar`,
        hint: 'Each disc set this much further round its shaft than its neighbour’s: chords shimmer instead of pulsing together.' },
      { id: 'shaft2', label: 'Accidentals’ shaft', min: 0, max: 180, def: 0, step: 1, fmt: (v) => `${v.toFixed(0)}° behind the naturals’`,
        hint: 'The naturals and the accidentals each have a shaft, joined by a belt. At 90° one row opens as the other closes.' },
    ],
  },
  {
    title: 'Mallet',
    params: [
      { id: 'hardness', label: 'Mallet hardness', perform: true, min: 30, max: 10000, def: 800, log: true, fmt: (v) => `${v.toFixed(0)} N at 1 mm (${yarn(v)})`,
        hint: 'The head’s force when squashed by 1 mm (F = Kδ^2.3). Harder heads leave the bar sooner and reach the upper modes; softer ones give a round, dark tone.' },
      { id: 'mass', label: 'Mallet head mass', min: 5, max: 40, def: 12, step: 0.5, fmt: (v) => `${v.toFixed(1)} g`,
        hint: 'A heavier head stays on the bar longer: more fundamental, less shimmer.' },
      { id: 'strike', label: 'Strike point', min: 0.02, max: 0.5, def: 0.45, step: 0.005, fmt: (v) => (v >= 0.5 ? 'the centre' : `${(v * 100).toFixed(1)} % from the end`),
        hint: 'At the centre, mode 2 (two octaves up) has a node and stays silent. At the end every mode speaks; on mode 1’s node (≈ 20 %) the fundamental drops out.' },
      { id: 'across', label: 'Off the centre line', min: 0, max: 0.9, def: 0.15, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of the half-width`,
        hint: 'Striking towards a long edge twists the bar: its torsional modes join in.' },
      { id: 'speedMax', label: 'Mallet speed at full velocity', min: 0.5, max: 5, def: 3, step: 0.1, fmt: (v) => `${v.toFixed(1)} m/s`,
        hint: 'The head’s speed for velocity 1. Faster strikes squash the yarn further and stiffen the contact: louder and brighter, not just louder.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, min: 0.05, max: 1, def: 0.6, step: 0.01, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    title: 'Damper',
    params: [
      { id: 'damp', label: 'Damper felt', min: 0.05, max: 3, def: 0.3, log: true, fmt: (v) => `T₆₀ ${v < 1 ? v.toFixed(2) : v.toFixed(1)} s`,
        hint: 'The felt bar that presses on every bar unless the pedal is down: how fast it stops the fundamental. Space or the pedal lifts it; a held key also keeps it off its own bar.' },
      { id: 'pedalLock', label: 'Pedal held down (nothing damped)', perform: true, type: 'checkbox', def: false,
        hint: 'Every note rings until it dies away by itself.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.25, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Vibraphone: motor on, medium yarn mallets', p: {} },
  { name: 'Motor off, discs open: no tremolo', p: { motor: 'open' } },
  { name: 'Fast motor: 6 rev/s, a 12 Hz tremolo', p: { speed: 6 } },
  { name: 'Discs twisted along the shaft: chords shimmer', p: { twist: 40, shaft2: 90 } },
  { name: 'No resonators: the bars alone', p: { tubes: false, motor: 'open' } },
  { name: 'Tubes pressed close: bar and tube trade energy', p: { gap: 7, motor: 'open' } },
  { name: 'Tubes a semitone sharp', p: { detune: 100, motor: 'open' } },
  { name: 'Plain bars, 1 : 2.76 : 5.40', p: { depth: 0, motor: 'open' } },
  { name: 'Hard cord mallets, struck near the end', p: { hardness: 6000, strike: 0.06, motor: 'open' } },
  { name: 'Cold hall (5 °C): tubes fall flat of their bars', p: { temp: 5, motor: 'open' } },
  { name: 'Motor off, discs closed: dry', p: { motor: 'closed' } },
];
