// arc-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint
// says what it does to the sound. Velocity has no meaning on Duddell's keyboard (a key only
// closes a contact), so there is none.

import { VENUE } from '../../shared/chain.js';

const f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2);

export const GROUPS = [
  {
    title: 'The arc',
    params: [
      { id: 'current', label: 'Arc current', perform: true, min: 1.5, max: 20, def: 3, log: true, fmt: (v) => `${f2(v)} A`,
        hint: 'The direct current the rheostat lets through. Less current, steeper falling curve and a stronger negative resistance; more and the arc stops singing, then hisses (mod wheel).' },
      { id: 'gap', label: 'Electrode gap', perform: true, min: 0.5, max: 8, def: 3, step: 0.05, fmt: (v) => `${f2(v)} mm`,
        hint: 'A longer arc burns at a higher voltage, falls more steeply (Ayrton\'s c + d·l) and starts to hiss only at a larger current.' },
      { id: 'tau', label: 'Column time constant τ', perform: true, min: 5, max: 300, def: 26, log: true, fmt: (v) => `${v < 10 ? f1(v) : v.toFixed(0)} µs`,
        hint: 'How fast the column heats and cools. Slow (thick carbons): a fat hysteresis loop, flatter notes and a low ceiling, above which keys stay silent. Fast (Poulsen\'s hydrogen-cooled arc): the arc follows its static curve to high notes.' },
      { id: 'restrike', label: 'Re-strike voltage', min: 1.1, max: 2.5, def: 1.25, step: 0.01, fmt: (v) => `${f2(v)} × burning`,
        hint: 'How far the column can cool before the white-hot carbons re-strike it. Low: the current never stops (Duddell\'s first kind, a clear note). High: the arc goes out and re-strikes every cycle (the second kind, buzzing).' },
      { id: 'hiss', label: 'Hissing', min: 0, max: 2, def: 1, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %`,
        hint: 'Strength of the conductance noise above Ayrton\'s hissing current, when air reaches the crater. 0 keeps the arc silent at any current.' },
    ],
  },
  {
    title: 'The circuit',
    params: [
      { id: 'mode', label: 'Arcs', perform: true, type: 'select', def: 'mono',
        options: [['mono', 'One arc (Duddell)'], ['poly', 'Several arcs'], ['talk', 'Talking arc (Simon)']],
        hint: 'One arc: keys held together put their capacitors in parallel and the pitch drops. Several arcs: each key gets an arc lamp of its own. Talking arc: the keys play a singer into a microphone coupled to the arc.' },
      { id: 'arcs', label: 'Number of arcs', min: 2, max: 6, def: 4, step: 1, fmt: (v) => `${v} lamps`, showIf: (P) => P.mode === 'poly',
        hint: 'Arc lamps on the bench, each with its own coil and capacitors; a key takes a free one, or the longest-sounding.' },
      { id: 'coil', label: 'Coil L', perform: true, min: 3, max: 100, def: 20, log: true, fmt: (v) => `${v < 10 ? f1(v) : v.toFixed(0)} mH`,
        hint: 'The fixed coil; each key\'s capacitor is cut for it. A small coil with big capacitors (low L/C) speaks fast, bright and pulled flat; a big coil with small capacitors speaks slowly and purely.', showIf: (P) => P.mode !== 'talk' },
      { id: 'coilR', label: 'Coil resistance', min: 0.02, max: 4, def: 0.3, log: true, fmt: (v) => `${v.toFixed(v < 1 ? 2 : 1)} Ω`,
        hint: 'The musical circuit\'s loss. The arc sings only while its negative resistance outweighs it; near that edge the notes grow slowly and quietly.', showIf: (P) => P.mode !== 'talk' },
      { id: 'tune', label: 'Capacitors cut by', type: 'select', def: 'arc',
        options: [['arc', 'the sounding note'], ['kelvin', 'Kelvin\'s formula']],
        hint: 'Kelvin\'s formula 1/(2π√LC) ignores the arc: its thermal lag acts as a small inductance, and the notes sound about 1 % flat.', showIf: (P) => P.mode !== 'talk' },
    ],
  },
  {
    title: 'Talking arc',
    params: [
      { id: 'voice', label: 'Microphone level', min: 0, max: 6, def: 2, step: 0.05, fmt: (v) => `${f2(v)} V`, showIf: (P) => P.mode === 'talk',
        hint: 'The EMF the microphone transformer puts into the arc circuit. The arc turns the current it drives into sound; too little arc current and the arc howls on its own.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'dist', label: 'Listening distance', min: 0.3, max: 5, def: 1, log: true, fmt: (v) => `${f2(v)} m`,
        hint: 'The arc is a small source: its pressure falls as 1/r.' },
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.3, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Duddell\'s singing arc', p: {} },
  { name: 'Singing and hissing (9 A)', p: { current: 9 } },
  { name: 'Second kind: out and re-struck every cycle', p: { restrike: 2.2 } },
  { name: 'Slow column (τ 150 µs): the top keys fall silent', p: { tau: 150 } },
  { name: 'Quick column (τ 6 µs): the arc follows its curve', p: { tau: 6 } },
  { name: 'Capacitors cut by Kelvin\'s formula: 1 % flat', p: { tune: 'kelvin' } },
  { name: 'Small coil, big capacitors (4 mH)', p: { coil: 4 } },
  { name: 'Big coil, small capacitors (80 mH)', p: { coil: 80 } },
  { name: 'A long arc (6 mm)', p: { gap: 6 } },
  { name: 'Several arcs (6 lamps)', p: { mode: 'poly', arcs: 6 } },
  { name: 'Simon\'s talking arc', p: { mode: 'talk' } },
];
