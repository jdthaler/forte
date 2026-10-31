// bubbles-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const depthFmt = (v) => (v < 1 ? `${(v * 100).toFixed(0)} cm` : v < 10 ? `${v.toFixed(2)} m` : `${v.toFixed(1)} m`);
const atm = (v) => `${v.toFixed(2)} atm${v < 0.995 ? ' (partial vacuum)' : ''}`;

export const GROUPS = [
  {
    title: 'Tank',
    params: [
      { id: 'depth', label: 'Nozzle depth', min: 0.1, max: 100, def: 0.3, log: true, fmt: depthFmt,
        hint: 'How far below the surface the nozzles sit. The water above adds ρgh to the pressure on the bubbles (1 atm per 10.3 m), and every pitch rises with √p₀. Near the surface the bubbles ring a little higher still, radiate less and ring longer.' },
      { id: 'pressure', label: 'Air pressure above the water', min: 0.25, max: 4, def: 1, log: true, fmt: atm,
        hint: 'Pump the tank up or down. Every pitch moves with √p₀: a quarter of an atmosphere puts the keyboard about an octave down. Bubbles already ringing follow it too.' },
      { id: 'keepInTune', label: 'Keep in tune (re-size the bubbles)', type: 'checkbox', def: false,
        hint: 'Each nozzle then releases bubbles of the radius that sounds its note under the current depth, pressure, gas and liquid. Off: the nozzles stay as they were cut (30 cm of water, air, 1 atm) and the whole keyboard retunes.' },
    ],
  },
  {
    title: 'Gas and liquid',
    params: [
      { id: 'gas', label: 'Gas', type: 'select', def: 'air',
        options: [['air', 'Air (γ = 1.40)'], ['helium', 'Helium (γ = 5/3, conducts heat fast)'], ['argon', 'Argon (γ = 5/3, conducts heat slowly)'], ['sf6', 'SF₆ (γ = 1.10)']],
        hint: 'The gas is the spring: pitch ∝ √κ, with κ between 1 (isothermal) and γ (adiabatic). Helium carries heat to the wall so fast that its small bubbles fall back towards isothermal, and lose energy doing it: shorter, duller notes.' },
      { id: 'liquid', label: 'Liquid', type: 'select', def: 'water',
        options: [['water', 'Water (1.0 mPa·s)'], ['gly90', '90 % glycerol (0.22 Pa·s)'], ['glycerol', 'Glycerol (1.41 Pa·s)']],
        hint: 'The liquid is the mass (ρ) and the viscous loss (μ). Glycerol is 1400 times as viscous as water: its loss, 4μ/ρωR², grows as the bubbles shrink, so the treble only thuds while the biggest bubbles still ring.' },
      { id: 'vapour', label: 'Vapour in the bubbles', type: 'checkbox', def: false,
        hint: 'Bubbles in water carry water vapour, 2.3 kPa of it at 20 °C. As the wall moves the vapour condenses and evaporates rather than being squeezed, so only the gas is a spring: every pitch drops by about p_v/2p₀, 20 ¢ at the defaults and 70 ¢ under a quarter of an atmosphere. (90 % glycerol has about a third as much vapour; pure glycerol hardly any.) Off: the bubbles are dry gas.' },
    ],
  },
  {
    title: 'Nozzles',
    params: [
      { id: 'rate', label: 'Bubbles per second (held key)', perform: true, min: 0.5, max: 40, def: 5, log: true, fmt: (v) => `${v < 10 ? v.toFixed(1) : v.toFixed(0)} /s`,
        hint: 'While a key is held its nozzle keeps releasing bubbles: a brook. Aftertouch opens the gas further, up to three times as many.' },
      { id: 'irregular', label: 'Irregularity', perform: true, min: 0, max: 1, def: 0.4, step: 0.01, fmt: (v) => (v === 0 ? 'a metronome' : v === 1 ? 'random (Poisson)' : `${(v * 100).toFixed(0)} % random`),
        hint: 'How random the gaps between bubbles are, and how much their kicks vary: 0 a metronome, 100 % independent releases.' },
      { id: 'spread', label: 'Size spread', min: 0, max: 15, def: 1.5, step: 0.1, fmt: (v) => `±${v.toFixed(1)} % (±${(1200 * Math.log2(1 + v / 100)).toFixed(0)} ¢)`,
        hint: 'The first bubble of each press forms in still liquid at its nozzle’s size; the ones after it form in their wake and scatter. A bubble 1 % bigger rings 17 ¢ flat.' },
      { id: 'snap', label: 'Neck snap time', min: 0.01, max: 2, def: 0.05, log: true, fmt: (v) => `${v < 0.1 ? (v * 1000).toFixed(0) + ' µs' : v.toFixed(2) + ' ms'}`,
        hint: 'How fast the neck pinches off. Quicker than a period, it rings the bubble fully; slower, it only nudges the small bubbles, and the treble fades.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'How hard the neck snaps: the pressure kick, a fraction of the Laplace pressure 2σ/R.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'echo', label: 'Surface echo at the hydrophones', type: 'checkbox', def: false,
        hint: 'The water’s surface reflects sound back down, inverted. On, each hydrophone hears every bubble twice: directly, and from its mirror image above the surface, a fraction of a millisecond later at the default depth. The two cancel in the bass (6–13 dB quieter at 30 cm, most of the keyboard in a 10 cm tank) and comb the treble; 20 m down the echo comes 27 ms later, a distinct slap. Off: the hydrophones hear the direct sound only, and the keyboard stays even.' },
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.25, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Brook: air bubbles 30 cm down in water', p: {} },
  { name: 'Nozzles 20 m down: everything a major sixth up', p: { depth: 20 } },
  { name: 'Partial vacuum (¼ atm): about an octave down', p: { pressure: 0.25 } },
  { name: 'Helium: up less than √γ, and duller', p: { gas: 'helium' } },
  { name: 'Argon: helium’s γ, but it stays adiabatic', p: { gas: 'argon' } },
  { name: 'SF₆ (γ = 1.10): two semitones down', p: { gas: 'sf6' } },
  { name: 'Glycerol: viscosity kills the treble', p: { liquid: 'glycerol' } },
  { name: 'Shallow tank (10 cm): big bubbles rise in pitch as they surface', p: { depth: 0.1, rate: 2 } },
  { name: '20 m down, kept in tune: bigger bubbles, same notes', p: { depth: 20, keepInTune: true } },
  { name: 'Torrent: 30 bubbles a second, 6 % spread', p: { rate: 30, irregular: 1, spread: 6 } },
  { name: 'Slow pinch-off (1 ms): the treble hardly rings', p: { snap: 1 } },
  { name: 'Metronome: even bubbles, all the same size', p: { rate: 2.5, irregular: 0, spread: 0 } },
  { name: 'Water vapour, a quarter atmosphere: ¾ of a semitone flatter', p: { pressure: 0.25, vapour: true } },
  { name: 'Surface echo: the hydrophones hear the surface too', p: { echo: true } },
  { name: 'Surface echo 20 m down: a slap after every bubble', p: { echo: true, depth: 20 } },
  { name: 'Pressurised tank (4 atm): about an octave up', p: { pressure: 4 } },
  { name: '90 % glycerol: thick, but the treble still rings', p: { liquid: 'gly90' } },
];
