// grand-params.js — the knobs. Every parameter has a physical meaning and a
// unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

// Key velocity 0..1 → hammer speed, 0.25 … 6 m/s, as the engine maps it (grand-model.h), for the readout.
const hammerSpeed = (vel) => 0.25 * 24 ** Math.min(1, Math.max(0, vel));

const x = (v) => `×${v < 1 ? v.toFixed(2) : v.toFixed(v < 10 ? 2 : 1)}`;
const db = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
const sci = (v) => { const e = Math.floor(Math.log10(v)); return `${(v / 10 ** e).toFixed(1)}e${e}`; };
const ohms = (k) => (k >= 1000 ? `${(k / 1000).toFixed(k < 1e4 ? 2 : 1)} MΩ` : `${k.toFixed(0)} kΩ`);
const board = (P) => P.mount === 'board';

export const GROUPS = [
  {
    title: 'Action',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, step: 0.01, def: 0.7, fmt: (v) => `${hammerSpeed(v).toFixed(2)} m/s`, hint: 'Hammer speed at the string. MIDI velocity maps to 0.25–6 m/s.' },
      { id: 'hardness', label: 'Felt hardness', min: 0.2, max: 5, def: 1, log: true, fmt: x, hint: 'Felt stiffness K in F = Kδᵖ. Harder felt: shorter contact, more high partials. Applies to new notes.' },
      { id: 'strike', label: 'Strike position', min: 0.03, max: 0.5, step: 0.001, def: 0.12, fmt: (v) => `${v.toFixed(3)} L (1/${(1 / v).toFixed(1)})`, hint: 'Partials with a node at the hammer are missing: striking at 1/8 removes the 8th, 16th, …; at the middle, every even partial. Applies to new notes.' },
      { id: 'damper', label: 'Damper', min: 3, max: 80, def: 25, log: true, fmt: (v) => `${v.toFixed(0)} s⁻¹`, hint: 'Decay rate the damper felt adds on release (less on partials with a node under it). Keys above E6 have none.' },
      { id: 'sympathy', label: 'Sympathetic resonance', min: 0, max: 1, step: 0.01, def: 0.25, fmt: (v) => (v === 0 ? 'off' : `${(v * 100).toFixed(0)} %`), hint: 'Every string whose damper is up (the pedal, a held key, the keys above E6) rings along through the bridge. The share of the bridge\'s motion one string feels from another: 100 % if they all met it at one point.' },
    ],
  },
  {
    title: 'Strings',
    params: [
      { id: 'scale', label: 'Scale design', type: 'select', def: 'cp70', options: [['cp70', 'CP-70 short scale (bass 0.68 m)'], ['concert', 'Concert-grand scale (bass 2 m)']], hint: 'Same pitches, different lengths. Short bass strings must be thick and heavily wound, so they are very stiff: B ∝ d⁴/(T L²). Applies to new notes.' },
      { id: 'stringing', label: 'Strings per note', type: 'select', def: 'cp70', options: [['cp70', 'CP-70: 1 (E1–F♯2), then 2'], ['grand', 'Acoustic grand: 1, 2, then 3'], ['single', 'One string everywhere']], hint: 'Unison strings beat against each other and share the bridge (Weinreich). Applies to new notes.' },
      { id: 'detune', label: 'Unison mistuning', min: 0, max: 12, step: 0.1, def: 1.2, fmt: (v) => `${v.toFixed(1)} ¢`, hint: 'Spread between a note\'s strings (varies a little key to key, as a tuner\'s would). A few cents: chorus; 10 ¢: honky-tonk. Applies to new notes.' },
      { id: 'stiffness', label: 'Wire bending stiffness', min: 0, max: 4, step: 0.01, def: 1, fmt: (v) => (v === 0 ? 'none (ideal string)' : x(v)), hint: 'Scales EI and so the inharmonicity B. 0 makes the partials exactly harmonic. Applies to new notes.' },
      { id: 'stretch', label: 'Stretch tuning', type: 'checkbox', def: true, hint: 'Tune each octave beatless, as a tuner would: partial 2 of the lower note on the fundamental of the upper. Stiff strings then stretch the scale (CP-70: about −12 ¢ at E1, +25 ¢ at E7). Off: every fundamental on 12-TET, and the octaves beat. Applies to new notes.' },
      { id: 'loss', label: 'String losses', min: 0.25, max: 4, def: 1, log: true, fmt: x, hint: 'Air drag and internal friction of the wire, σ = b₁ + b₃ω² (higher for wound strings). Applies to new notes.' },
      { id: 'kc', label: 'Tension modulation (pitch glide)', type: 'checkbox', def: true, hint: 'A hard blow stretches the string, so its tension and pitch rise, then glide back as it decays. Stiff, short strings stretch the most.' },
      { id: 'longi', label: 'Longitudinal modes (phantom partials)', min: 0, max: 4, step: 0.05, def: 1, fmt: (v) => (v === 0 ? 'off' : `×${v.toFixed(2)}`),
        hint: 'A string stretched by its own swing pulls on the bridge along its length, and that pull rings in the string\'s longitudinal modes, about 15 times its pitch. The piezo hears it at the sums of the partials\' frequencies: phantom partials between the overtones, a metallic growl in the bass that grows with the square of the blow.' },
      { id: 'maxFreq', label: 'Highest partial', min: 3000, max: 16000, def: 10000, log: true, fmt: (v) => `${(v / 1000).toFixed(1)} kHz`, hint: 'Partials above this are left out (new notes). Lower it if the CPU meter runs hot; the engine also sheds the quietest voices when the audio thread is overloaded.' },
    ],
  },
  {
    title: 'Bridge',
    params: [
      { id: 'mount', label: 'Bridge mounted on', type: 'select', def: 'frame', options: [['frame', 'Iron frame, no soundboard (CP-70)'], ['board', 'A spruce soundboard (acoustic grand)']], hint: 'A stiff, heavy frame barely moves, so the strings keep their energy and sustain long. A soundboard moves, drains them and radiates. Strings already sounding keep their old bridge: applies to new notes.' },
      { id: 'gFrame', label: 'Frame admittance', min: 1e-6, max: 3e-3, def: 5e-5, log: true, fmt: (v) => `${sci(v)} s/kg`, showIf: (P) => !board(P), hint: 'Bridge velocity per newton. Each string loses σ = G·T/L to it. A soundboard is ~1e-3. Applies to new notes.' },
      { id: 'boardH', label: 'Soundboard thickness', min: 5, max: 16, step: 0.1, def: 9, fmt: (v) => `${v.toFixed(1)} mm`, showIf: board, hint: 'Thinner: more mobile (G ∝ 1/h²), so faster decay and denser, lower modes. The strings\' drain applies to new notes; the board itself changes at once.' },
      { id: 'tilt', label: 'Polarisation mixing angle', min: 0, max: 45, step: 0.5, def: 6, fmt: (v) => `${v.toFixed(1)}°`, hint: 'Angle between the hammer\'s blow and the bridge\'s stiff axis. It sets how much sideways (H) motion the strike starts: the slowly decaying aftersound. Applies to new notes.' },
      { id: 'hRatio', label: 'Sideways / vertical admittance', min: 0.01, max: 1, def: 0.2, log: true, fmt: (v) => v.toFixed(2), hint: 'The bridge gives less sideways, so H motion drains slowly (Weinreich\'s double decay). Applies to new notes.' },
      { id: 'kH', label: 'Bridge sideways stiffness', min: 1e5, max: 1e8, def: 1e7, log: true, fmt: (v) => `${sci(v)} N/m`, hint: 'A springy support lengthens the string by T/K: the H polarisation sits flat by T/(K L), and beats against V. Applies to new notes.' },
    ],
  },
  {
    title: 'Pickup',
    params: [
      { id: 'listen', label: 'Piezo ↔ soundboard microphone', min: 0, max: 1, step: 0.01, def: 1, fmt: (v) => (v === 0 ? 'piezo' : v === 1 ? 'microphone' : `${(100 * (1 - v)).toFixed(0)} % piezo`), showIf: board, hint: 'The same strings through two transducers: the force under the bridge, or the soundboard\'s radiated sound at two microphones.' },
      { id: 'pickH', label: 'Piezo sideways sensitivity', min: 0, max: 1, step: 0.01, def: 0.25, fmt: (v) => v.toFixed(2), hint: 'The piezo stack is squeezed by vertical force; sideways force reaches it only weakly. Raise it to hear the H polarisation beat.' },
      { id: 'rIn', label: 'Preamp input resistance', min: 10, max: 10000, def: 470, log: true, fmt: (v) => `${ohms(v)} → ${(1 / (2 * Math.PI * v * 1e3 * 10e-9)).toFixed(0)} Hz`, hint: 'The piezo is a charge source with 10 nF of capacitance: with the input resistance it forms a high-pass at 1/(2πRC). Low R thins the bass.' },
    ],
  },
  {
    title: 'EQ (preamp)',
    params: [
      { id: 'bass', face: 'knob', label: 'Bass (shelf 120 Hz)', min: -15, max: 15, step: 0.5, def: 0, fmt: db },
      { id: 'mid', face: 'knob', label: 'Middle (peak 1 kHz)', min: -15, max: 15, step: 0.5, def: 0, fmt: db },
      { id: 'treble', face: 'knob', label: 'Treble (shelf 3.5 kHz)', min: -15, max: 15, step: 0.5, def: 0, fmt: db, hint: 'Applies to the piezo signal (the CP-70\'s onboard EQ), not to the microphones.' },
    ],
  },
  {
    title: 'Tremolo (preamp)',
    params: [
      { id: 'tremDepth', face: 'knob', label: 'Tremolo depth', perform: true, min: 0, max: 1, step: 0.01, def: 0, fmt: (v) => (v === 0 ? 'off' : `${(v * 100).toFixed(0)} %`), hint: 'The preamp\'s stereo tremolo: an oscillator lights an LED beside each output\'s photocell, in turn, and the photocell shunts that output. Played in stereo the sound swings from side to side; through one output it throbs. Photocells light fast and go dark slowly. Applies to the piezo, not to the microphones.' },
      { id: 'tremRate', face: 'knob', label: 'Tremolo rate', perform: true, min: 1, max: 10, step: 0.05, def: 5, fmt: (v) => `${v.toFixed(2)} Hz`, hint: 'How many times a second the sound goes left and back.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, step: 0.01, def: 0.12, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, step: 0.01, def: 0.8, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'CP-70', p: {} },
  { name: 'Same strings on a soundboard, heard by microphones', p: { mount: 'board', listen: 1 } },
  { name: 'Same strings on a soundboard, through the piezo', p: { mount: 'board', listen: 0 } },
  { name: 'Concert-grand scale (long bass strings)', p: { scale: 'concert', stringing: 'grand' } },
  { name: 'Ideal flexible strings (harmonic)', p: { stiffness: 0 } },
  { name: 'Honky-tonk unisons (10 ¢)', p: { detune: 10 } },
  { name: 'Weinreich: one string, tilted bridge, soundboard', p: { stringing: 'single', mount: 'board', listen: 0, tilt: 20, pickH: 0.6 } },
  { name: 'Struck at the middle (odd partials)', p: { strike: 0.5 } },
  { name: 'Low-impedance preamp (thin bass)', p: { rIn: 22 } },
  { name: 'Stage EQ: bright and scooped', p: { bass: 4, mid: -5, treble: 7 } },
  { name: 'Stereo tremolo', p: { tremDepth: 0.6, tremRate: 5.5 } },
];
