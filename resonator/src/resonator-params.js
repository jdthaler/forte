// resonator-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pct = (v) => `${(v * 100).toFixed(0)} %`;

export const GROUPS = [
  {
    title: 'Resonator',
    params: [
      { id: 'drive', label: 'Drive (coil current)', perform: true, strip: true, min: 0, max: 1, def: 0.6, step: 0.01, fmt: (v) => `${(v * 1000).toFixed(0)} mA`,
        hint: 'The amplifier\'s signal current through each coil, for a key played at full velocity. The string swells until the coil puts in what the string loses, so more current is louder; velocity and pressing harder on a held key add to it.' },
      { id: 'attack', label: 'Swell time', perform: true, min: 0.01, max: 5, def: 0.3, log: true, fmt: (v) => (v < 1 ? `${(v * 1000).toFixed(0)} ms` : `${v.toFixed(1)} s`),
        hint: 'How long the drive takes to rise to full. The string\'s own build-up comes on top: a bass string barely loses energy, so it takes seconds to swell, a treble one a fraction of a second.' },
      { id: 'harmonic', label: 'Harmonic', perform: true, type: 'select', def: '1',
        options: [['1', 'Fundamental'], ['2', '2nd (octave)'], ['3', '3rd (twelfth)'], ['4', '4th (two octaves)'], ['5', '5th (major third)'], ['6', '6th'], ['7', '7th (flat seventh)'], ['8', '8th (three octaves)'], ['12', '1 and 2 (two loops)'], ['123', '1, 2 and 3 (three loops)']],
        hint: 'Which partial of the string the loop listens to and drives. The string sings its harmonic alone, with no fundamental: a harmonic the coil sits on a node of (the 5th in the bass, the 4th at middle C, the 3rd higher up) barely speaks. Two or three loops drive partials at once, each locked to its own.' },
      { id: 'wave', label: 'Drive waveform', type: 'select', def: 'rich',
        options: [['sine', 'Sine'], ['rich', 'Harmonically rich'], ['odd', 'Odd harmonics'], ['noise', 'Noise']],
        hint: 'What the second oscillator sends to the coil, locked to the string: a sine drives one partial, a rich wave the partials above it too (they are a little sharp of its harmonics, so they never quite lock), noise every partial at once with no loop at all, a breathy tone.' },
      { id: 'bright', label: 'Brightness', perform: true, min: 0, max: 1, def: 0.35, step: 0.01, fmt: pct,
        hint: 'How strong the drive\'s upper harmonics are, from a falling 1/n² to nearly flat. The coil runs out of steam above the 8th harmonic, so the string never sounds as bright as a hammer makes it. On the mod wheel.' },
      { id: 'loop', label: 'Feedback', type: 'select', def: 'pll',
        options: [['pll', 'Phase-locked to the string'], ['open', 'Open loop (at the tuned pitch)']],
        hint: 'Locked, a phase-locked loop follows the string\'s own pitch from the soundboard pickup and pushes in step with it: the loudest, steadiest tone. Open, the coil is driven at the keyboard\'s pitch, which the string\'s stretched partials and its detuned unisons miss: weaker, and the unisons beat.' },
      { id: 'phase', label: 'Phase error', perform: true, min: -180, max: 180, def: 0, step: 1, fmt: (v) => `${v.toFixed(0)}°`,
        hint: 'The push\'s phase against the string\'s motion, away from the calibrated best (McPherson tuned it by ear, note by note, for the loudest tone). At ±90° the coil only pulls the pitch and puts little energy in; at 180° it pushes against the string, so nothing grows, and a struck note dies a little sooner.' },
      { id: 'guard', label: 'Interference guard', type: 'checkbox', def: true,
        hint: 'Filters a semitone either side of each note: when a neighbour\'s string is louder in the pickup than the note\'s own, the loop stops following and holds its pitch, so it cannot lock onto the wrong string.' },
    ],
  },
  {
    title: 'Coil',
    params: [
      { id: 'gap', label: 'Gap to the string', min: 0.5, max: 5, def: 1.6, log: true, fmt: (v) => `${v.toFixed(1)} mm`,
        hint: 'The pull falls with the square of the gap. Closer is louder, and as the string swings toward the coil and away it pulls harder and softer, a distortion; too close and the string slaps the coil and buzzes.' },
      { id: 'coil', label: 'Coil position (× as built)', min: 0.4, max: 2.2, def: 1, step: 0.01, fmt: (v) => `× ${v.toFixed(2)}`,
        hint: 'Where along the string the coil sits, as a multiple of the MRP\'s: a fifth of the length from the front in the bass, a quarter at middle C, a third from C5 up. A partial with a node under the coil cannot be driven.' },
      { id: 'bias', label: 'Bias current', min: 0.2, max: 3, def: 1.1, step: 0.01, fmt: (v) => `${v.toFixed(2)} × signal`,
        hint: 'A coil only attracts the string, as hard either way the current flows, so the amplifier adds a steady current to the signal and never lets it go negative. Just above the signal (1.1, the MRP\'s choice) the pull follows it; below, the troughs clip and the pull is rich in harmonics and the octave; far above, it is clean but the coil runs hot.' },
    ],
  },
  {
    title: 'Piano',
    params: [
      { id: 'hammer', label: 'Hammer', perform: true, min: 0, max: 1, def: 0, step: 0.01, fmt: (v) => (v === 0 ? 'off (silent keys)' : pct(v)),
        hint: 'How hard the piano\'s own hammers strike as the keys go down. Off, the keys only lift the dampers and start the coils, as McPherson\'s second keyboard did, so every note grows out of silence; up, the hammer gives the attack and the coil the sustain.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2) },
      { id: 'unison', label: 'Unison detune', min: 0, max: 4, def: 0.8, step: 0.05, fmt: (v) => `${v.toFixed(2)} ¢`,
        hint: 'How far a note\'s two or three strings are tuned apart. They beat, and the loop locks to the note they make together.' },
      { id: 'losses', label: 'String losses', min: 0.3, max: 3, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)}`,
        hint: 'The strings\' damping, through the bridge, the air and the wire: lower rings longer and swells louder and slower under the coil.' },
      { id: 'soundboard', label: 'Soundboard', min: 0, max: 1, def: 0.6, step: 0.01, fmt: pct,
        hint: 'The spruce soundboard the bridge drives, which colours every note.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.3, step: 0.01, fmt: pct },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Grown from silence', p: {} },
  { name: 'Struck, then sustained', p: { hammer: 0.6, attack: 0.05, drive: 0.5 } },
  { name: 'Octave harmonic', p: { harmonic: '2', wave: 'sine', drive: 0.8 } },
  { name: 'Twelfth, no fundamental', p: { harmonic: '3', wave: 'sine', drive: 0.9 } },
  { name: 'Two partials locked', p: { harmonic: '12', wave: 'sine', drive: 0.8 } },
  { name: 'Bowed (noise)', p: { wave: 'noise', drive: 0.9, attack: 0.6 } },
  { name: 'Bright drive', p: { bright: 0.9, bias: 0.7, drive: 0.7 } },
  { name: 'Open loop, beating', p: { loop: 'open', unison: 2 } },
  { name: '4th harmonic on its node (C4)', p: { harmonic: '4', wave: 'sine', drive: 0.9 } },
  { name: 'Too close: buzzing', p: { gap: 0.55, drive: 0.4, bias: 1.5 } },
];
