// carillon-params.js — the knobs. Every parameter has a physical meaning and a
// unit; the hint says what it does to the sound.

const sci = (v) => { const e = Math.floor(Math.log10(v)), m = v / 10 ** e; return `${m.toFixed(1)}×10${String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])}`; };
const face = (v) => (v >= 150 ? 'iron' : v >= 70 ? 'bronze or brass' : v >= 15 ? 'hard insert' : v >= 4 ? 'hardwood or nylon insert' : 'soft insert');

export const GROUPS = [
  {
    title: 'Bells',
    params: [
      { id: 'profile', label: 'Bell profile', perform: true, type: 'select', def: 'minor', options: [['minor', 'Minor-third bells (Hemony tradition)'], ['major', 'Major-third bells (Eijsbouts–TU Eindhoven)']],
        hint: 'The rib, the bell’s cross-section, tuned by the FEM: hum, prime, tierce, quint and nominal at 0.5 : 1 : 1.2 : 1.5 : 2, or with the tierce a major third up, 1.25. Applies to the next strike of each bell.' },
      { id: 'historic', label: 'Historic, untuned bells', min: 0, max: 1, def: 0, step: 0.01, fmt: (v) => (v === 0 ? 'tuned (Simpson)' : `${(v * 100).toFixed(0)} % of a typical casting error`),
        hint: 'Bells as cast and never tuned: each region of the wall a few per cent off (seeded per bell), so every partial moves its own way against the nominal, and the casting is less round. Applies to the next strike.' },
      { id: 'asym', label: 'Asymmetry ε', perform: true, min: 0, max: 3, def: 0.2, step: 0.01, fmt: (v) => `${v.toFixed(2)} % of the wall’s mass`,
        hint: 'An uneven wall, ε·cos 2mθ for every family m, splits each pair of modes by Δf/f ≈ εκ/2: the partials beat (warble). 0 = a perfectly round bell.' },
      { id: 'eta', label: 'Bronze loss factor η', min: 5e-5, max: 2e-3, def: 2.5e-4, log: true, fmt: sci,
        hint: 'Internal friction of the bronze, σ = πfη. Radiation adds its own loss, most to the upper partials of the bigger bells.' },
    ],
  },
  {
    title: 'Clapper',
    params: [
      { id: 'hardness', label: 'Clapper face', perform: true, min: 1, max: 210, def: 200, log: true, fmt: (v) => `${v < 10 ? v.toFixed(1) : v.toFixed(0)} GPa (${face(v)})`,
        hint: 'Young’s modulus of the clapper where it hits. Iron (200 GPa) makes a short, hard impact that rings the upper partials; a softer insert stays on longer and the bell sounds rounder.' },
      { id: 'clapMass', label: 'Clapper mass', min: 0.5, max: 8, def: 2.5, step: 0.1, fmt: (v) => `${v.toFixed(1)} % of the bell’s`,
        hint: 'The ball’s effective mass on its pendulum. Heavier: longer contact, louder, darker.' },
      { id: 'strikeHeight', label: 'Strike height', min: 0.04, max: 0.45, def: 0.115, step: 0.005, fmt: (v) => `${(v * 100).toFixed(1)} % of the height above the lip`,
        hint: 'Where the ball hits the inside of the bell. The soundbow (about 12 %) wakes the rim partials; higher, on the waist, the prime and quint (whose motion is there) gain on the nominal.' },
      { id: 'strikeAngle', label: 'Strike angle', perform: true, min: 0, max: 90, def: 20, step: 0.5, fmt: (v) => `${v.toFixed(1)}° from the heavy side`,
        hint: 'Where round the bell the clapper hits, from the asymmetry’s axis. On an axis of a doublet only one of its pair rings (no warble); between them both do, and beat.' },
      { id: 'speedMax', label: 'Clapper speed at full velocity', min: 0.3, max: 4, def: 2, step: 0.05, fmt: (v) => `${v.toFixed(2)} m/s`,
        hint: 'How fast a full baton stroke throws the ball against the bell. Faster: louder, a shorter contact and a brighter sound.' },
      { id: 'velocity', label: 'Velocity (computer keys)', min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    title: 'Listening',
    params: [
      { id: 'distance', label: 'Distance from the tower', perform: true, min: 10, max: 600, def: 30, log: true, fmt: (v) => `${v.toFixed(0)} m`,
        hint: 'Spreading (1/r) and air absorption (ISO 9613-1, 15 °C, 70 % humidity): from across a town square the upper partials fade and the bells sound darker.' },
      { id: 'around', label: 'Listener round the bell', min: 0, max: 90, def: 0, step: 0.5, fmt: (v) => `${v.toFixed(1)}° from the strike point`,
        hint: 'Each partial radiates in a pattern with 2m lobes round the bell; moving round changes which member of each doublet you hear and how they beat.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Belfry and square', perform: true, min: 0, max: 1, def: 0.15, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Concert carillon: minor-third bells, iron clappers', p: {} },
  { name: 'Major-third bells (Eijsbouts–Eindhoven)', p: { profile: 'major' } },
  { name: 'Warbling bells: uneven walls, struck between the nominal’s axes', p: { asym: 0.6, strikeAngle: 11.25 } },
  { name: 'The same bells struck on an axis: no warble', p: { asym: 0.6, strikeAngle: 0 } },
  { name: 'Historic bells, never tuned', p: { historic: 1 } },
  { name: 'Soft clapper inserts', p: { hardness: 4 } },
  { name: 'Heavy clappers', p: { clapMass: 6 } },
  { name: 'Struck high on the waist', p: { strikeHeight: 0.33 } },
  { name: 'Across the town square (300 m)', p: { distance: 300, room: 0.3 } },
  { name: 'Under the tower (10 m)', p: { distance: 10, room: 0.08 } },
];
