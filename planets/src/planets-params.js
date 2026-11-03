// planets-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const deg = (v) => `${v.toFixed(0)}°`;

export const PLANET_OPTIONS = [
  ['earth', 'Earth'],
  ['mars', 'Mars'],
  ['moon', 'Moon'],
];
export const MECHANISMS = [
  ['thrust', 'Megathrust (a fault dipping 10°)'],
  ['strikeslip', 'Strike-slip (a vertical fault)'],
  ['normal', 'Normal fault (dipping 45°)'],
  ['explosion', 'Explosion or impact (no fault)'],
];
export const SENSORS = [
  ['displacement', 'Up and down: how far the ground moves'],
  ['vertical', 'Up and down: how fast (a seismometer)'],
  ['gravimeter', 'Gravity (a gravimeter)'],
  ['horizontal', 'North (left) and east (right): how far'],
];

export const GROUPS = [
  {
    title: 'Planet',
    params: [
      { id: 'planet', label: 'Planet', type: 'select', options: PLANET_OPTIONS, def: 'earth', perform: true, strip: true, face: 'rockers',
        hint: 'Earth is PREM, the reference Earth its free oscillations helped build. Mars and the Moon are models built from what InSight and Apollo measured: nobody has yet recorded either ring.' },
      { id: 'spin', label: 'Spin (× its own)', min: 0, max: 10, def: 1, step: 0.01, perform: true, fmt: (v) => `${v.toFixed(2)}×`,
        hint: 'The planet\'s rotation splits each tone into 2l + 1, which beat: the Earth\'s gravest, ₀S₂, into five a few per cent apart. 0 stops it; the Moon, turning once a month, hardly splits at all.' },
      { id: 'atten', label: 'Attenuation (× its own)', min: 0.1, max: 4, def: 1, log: true, fmt: (v) => `${v.toFixed(2)}×`,
        hint: 'How fast the rock turns the ringing into heat (1/Q). The Earth\'s mantle is lossy; the dry Moon hardly at all, so it rings on.' },
    ],
  },
  {
    title: 'Quake',
    params: [
      { id: 'mech', label: 'Fault', type: 'select', options: MECHANISMS, def: 'thrust', perform: true,
        hint: 'How the rock broke, which sets which modes ring and how loud each is in each direction. An explosion pushes out equally all round.' },
      { id: 'strike', label: 'Fault direction (strike)', min: 0, max: 360, def: 330, step: 1, fmt: deg,
        hint: 'The compass direction the fault runs. It turns the pattern the fault radiates relative to the station.' },
      { id: 'depth', label: 'Depth', min: 0, max: 1200, def: 30, step: 1, perform: true, fmt: (v) => `${v.toFixed(0)} km`,
        hint: 'Shallow quakes ring the surface-wave modes; deep ones (Bolivia, 1994, 640 km down) ring overtones that live deeper. Kept within each planet\'s table: 700 km on Earth, 800 on Mars, 1200 on the Moon, whose deep quakes are near 900 km.' },
      { id: 'mwTop', label: 'Magnitude, hardest key', min: 8, max: 9.5, def: 9.1, step: 0.05, fmt: (v) => `Mw ${v.toFixed(2)}`,
        hint: 'A key at full velocity is a quake this size; softer ones down to one magnitude less. A bigger quake is louder and, rupturing for longer, darker.' },
      { id: 'rupture', label: 'Rupture time (× usual)', min: 0.25, max: 4, def: 1, log: true, fmt: (v) => `${v.toFixed(2)}×`,
        hint: 'How long the fault takes to break, against the usual for its size (a half-duration of 77 s at Mw 9). A slow rupture cannot ring the higher modes.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    title: 'Station',
    params: [
      { id: 'distance', label: 'Distance from the quake', min: 0, max: 180, def: 60, step: 0.5, perform: true, fmt: deg,
        hint: 'Degrees round the planet. Each mode\'s pattern has nodal lines: at 90° from an explosion every odd degree is silent, and at 180° (the antipode) every wave comes back together.' },
      { id: 'azimuth', label: 'Direction from the quake', min: 0, max: 360, def: 45, step: 1, fmt: deg,
        hint: 'Compass direction from the quake to the station: a fault rings each direction differently.' },
      { id: 'lat', label: 'Quake latitude', min: -89, max: 89, def: 3, step: 0.5, fmt: (v) => `${Math.abs(v).toFixed(1)}° ${v < 0 ? 'S' : 'N'}`,
        hint: 'Where the quake is relative to the spin axis, which sets how the split tones share the sound: the splitting pattern turns with the planet.' },
      { id: 'sensor', label: 'Listening to', type: 'select', options: SENSORS, def: 'displacement',
        hint: 'How far the ground moves brings out the low tones; a seismometer hears its speed, brighter. A gravimeter hears gravity: the ground\'s acceleration, plus gravity weakening as the ground rises and strengthening with the mass that rose; quiet at the longest periods, it is what first caught the gravest modes clearly. The horizontal pair hears the toroidal (twisting) modes too, in stereo.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', perform: true, min: 0, max: 1, def: 0.2, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Earth: a great megathrust quake', p: {} },
  { name: 'Earth: heard on a gravimeter', p: { sensor: 'gravimeter', mwTop: 9.3, rupture: 1.5 } },
  { name: 'Earth: a deep quake 640 km down (like Bolivia, 1994)', p: { mech: 'normal', depth: 640, lat: -13.8, strike: 300, mwTop: 9.0, distance: 80, azimuth: 20 } },
  { name: 'Earth: at the antipode, every wave comes back', p: { distance: 179, azimuth: 0, mwTop: 8.6 } },
  { name: 'Earth: an explosion heard 90° away (odd degrees silent)', p: { mech: 'explosion', distance: 90, depth: 10 } },
  { name: 'Earth: twisting modes, heard sideways', p: { sensor: 'horizontal', mech: 'strikeslip', strike: 0, azimuth: 30, depth: 15, mwTop: 8.8 } },
  { name: 'Earth, not turning: one tone each', p: { spin: 0 } },
  { name: 'Earth spun up eight times', p: { spin: 8, lat: 60 } },
  { name: 'Mars: a great marsquake', p: { planet: 'mars', depth: 40, distance: 70 } },
  { name: 'Moon: a deep moonquake (900 km)', p: { planet: 'moon', mech: 'normal', depth: 900, distance: 90, mwTop: 8.5 } },
  { name: 'Moon: a meteorite strikes', p: { planet: 'moon', mech: 'explosion', depth: 0, distance: 40 } },
];
