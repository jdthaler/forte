// birdsong-params.js — the knobs. Every parameter has a physical meaning and a unit (the
// normal form's two parameters are dimensionless, as in Mindlin's papers); the hint says what it
// does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pct = (v) => `${(v * 100).toFixed(0)} %`;
const ms = (v) => (v < 0.01 ? `${(v * 1000).toFixed(1)} ms` : `${(v * 1000).toFixed(0)} ms`);
const khz = (v) => (v < 1000 ? `${v.toFixed(0)} Hz` : `${(v / 1000).toFixed(2)} kHz`);
const num = (d) => (v) => v.toFixed(d);

export const GROUPS = [
  {
    title: 'Syrinx',
    params: [
      { id: 'tension', label: 'Labial tension (−β)', perform: true, min: -0.2, max: 1, def: 0.5, step: 0.005, fmt: num(3), hint: 'How tightly the syringeal muscles stretch the labia: minus the normal form\'s β. Above 0.25 a breath starts the labia through a Hopf bifurcation, a pure tone that grows from nothing, as a canary\'s whistle. Below 0.25 it starts them through a saddle-node: near 0 and under, on the limit cycle itself, so the note is born at zero frequency, a train of clicks that runs up into a buzzy, harmonic-rich tone, as a zebra finch\'s calls. Every key is retuned, so the pitch stays.' },
      { id: 'drive', label: 'Air sac pressure (beyond onset)', perform: true, min: 0.005, max: 0.4, def: 0.1, log: true, fmt: num(3), hint: 'How far a full breath pushes the normal form\'s α past the onset of sound, at the hardest velocity (soft notes push a quarter as far, and aftertouch half as far again). Just past onset the labia barely swing: a faint pure tone after a Hopf onset, sparse sharp pulses after a saddle-node. Further on they swing wider and faster, so the pitch rises with the pressure, as in a real bird; each key is tuned at the pressure its velocity gives.' },
      { id: 'inhale', label: 'Breath in (attack)', min: 0.002, max: 0.2, def: 0.015, log: true, fmt: ms, hint: 'How long the expiratory muscles take to raise the air sac pressure when a key goes down. Even a sudden breath sounds only once the labia\'s swing has grown, which takes longer the lower the note.' },
      { id: 'exhale', label: 'Breath out (release)', min: 0.002, max: 0.3, def: 0.025, log: true, fmt: ms, hint: 'How long the pressure takes to fall when the key is let go. Below the onset the labia stop within a few swings, and the trachea and mouth ring on for a moment.' },
      { id: 'noise', label: 'Turbulence in the airflow', min: 0, max: 0.05, def: 0.003, step: 0.0005, fmt: num(4), hint: 'Random pressure fluctuations of the airflow through the syrinx, as noise in α. They seed every onset and jitter the swing; near the onset they make it wander and rasp, and with enough of them the labia sputter.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.75, step: 0.01, fmt: num(2), hint: 'How hard a breath the computer keys give. Aftertouch adds more.' },
    ],
  },
  {
    title: 'Song',
    params: [
      { id: 'syllable', label: 'Syllable', type: 'select', def: 'whistle', perform: true, strip: true,
        options: [['whistle', 'Whistle'], ['trill', 'Trill'], ['up', 'Upsweeps'], ['down', 'Downsweeps'], ['warble', 'Warble']],
        hint: 'The gesture the bird makes with its muscles while a key is held, repeated at the syllable rate, as a canary repeats one syllable through a phrase. Whistle holds the breath and the tension. Trill breathes in briefly between syllables (mini-breaths), so each starts afresh. Upsweeps and Downsweeps slide the tension through each syllable. Warble rocks the tension back and forth on one breath.' },
      { id: 'rate', label: 'Syllable rate', perform: true, min: 1, max: 40, def: 8, log: true, fmt: (v) => `${v.toFixed(1)} /s`, hint: 'Syllables a second. Canaries repeat theirs at up to about 30 a second, faster than they can breathe in and out, so each syllable gets a mini-breath of its own. The mod wheel raises it from here.' },
      { id: 'duty', label: 'Sound in each syllable', min: 0.15, max: 0.95, def: 0.6, step: 0.01, fmt: pct, hint: 'How much of each syllable the breath is on, in Trill and the sweeps; the rest is the mini-breath, silent.' },
      { id: 'sweep', label: 'Tension sweep', min: 0, max: 0.9, def: 0.5, step: 0.01, fmt: (v) => `±${(v * 100).toFixed(0)} %`, hint: 'How far the sweeps and the warble move the labial tension about its setting. The pitch goes roughly as the square root of the tension, so ±50 % sweeps about an octave.' },
    ],
  },
  {
    title: 'Vocal tract',
    params: [
      { id: 'trachea', label: 'Trachea length', min: 1, max: 12, def: 3.5, step: 0.1, fmt: (v) => `${v.toFixed(1)} cm`, hint: 'The windpipe between the syrinx and the mouth: a tube closed at the syrinx and open at the glottis, resonant at c/4L and its odd multiples (2.45 kHz and 7.4 kHz at a zebra finch\'s 3.5 cm). Its resonances lift the harmonics near them.' },
      { id: 'reflect', label: 'Reflection at the glottis', min: 0, max: 0.95, def: 0.7, step: 0.01, fmt: num(2), hint: 'How much of each pressure wave the open top of the trachea sends back down it (r). Near 1 the tube resonates sharply; at 0 it only delays the sound.' },
      { id: 'track', label: 'Mouth tuned to the note', type: 'checkbox', def: true, perform: true, hint: 'Songbirds widen and narrow the cavity of the throat and upper oesophagus (the OEC) to keep its resonance on the note they sing (Riede and colleagues, 2006). It passes the fundamental and holds back the harmonics, so the song comes out as a pure whistle. Off, it keeps one resonance, set below, which picks out whichever harmonics fall near it.' },
      { id: 'oec', label: 'Mouth resonance (fixed)', min: 300, max: 8000, def: 4000, log: true, fmt: khz, showIf: (P) => !P.track, hint: 'The Helmholtz resonance of the oropharyngeal–oesophageal cavity when it is not tuned to the note: about 4 kHz in a zebra finch.' },
      { id: 'q', label: 'Mouth resonance (Q)', min: 0.7, max: 12, def: 2, log: true, fmt: (v) => `Q ${v.toFixed(1)}`, hint: 'How sharply the cavity\'s resonance picks out the frequencies near it. Low, it passes the harmonics; high, a tuned cavity leaves the fundamental almost alone.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.25, step: 0.01, fmt: pct },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Canary whistle (Hopf onset)', p: {} },
  { name: 'Canary trill: a mini-breath a syllable', p: { syllable: 'trill', rate: 12, duty: 0.55 } },
  { name: 'Zebra finch: born at zero frequency (SNILC)', p: { tension: 0, drive: 0.03, track: false, oec: 4000, q: 3, trachea: 3.5, reflect: 0.85 } },
  { name: 'Upsweeps', p: { syllable: 'up', rate: 6, duty: 0.7, sweep: 0.6 } },
  { name: 'Downsweeps', p: { syllable: 'down', rate: 5, duty: 0.75, sweep: 0.6 } },
  { name: 'Warble', p: { syllable: 'warble', rate: 9, sweep: 0.35 } },
  { name: 'Fast trill (25 a second)', p: { syllable: 'trill', rate: 25, duty: 0.5, inhale: 0.004, exhale: 0.006 } },
  { name: 'Buzzy calls: trill near the saddle-node', p: { syllable: 'trill', rate: 7, duty: 0.6, tension: 0.05, drive: 0.02, track: false, oec: 3500, q: 2.5 } },
  { name: 'Sweeps across the bifurcation', p: { syllable: 'down', rate: 3, duty: 0.85, tension: 0.3, sweep: 0.9, drive: 0.05, track: false, oec: 3000, q: 1.5 } },
  { name: 'Long trachea (12 cm)', p: { trachea: 12, reflect: 0.9, track: false, oec: 2000, q: 1.2, tension: 0.15, drive: 0.06 } },
  { name: 'Turbulent, near onset', p: { drive: 0.012, noise: 0.03 } },
  { name: 'Hard breath: wide, fast swings', p: { drive: 0.4, q: 1, track: false, oec: 5000 } },
];
