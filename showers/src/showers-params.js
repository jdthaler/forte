// showers-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound. Every key is a crystal of a collider's electromagnetic calorimeter
// (lead tungstate, as in CMS), scaled to sound: its length is cut so its first longitudinal mode
// is the note, and its depth and width are counted in the shower's own units (radiation lengths
// and Molière radii), so every key's crystal is the same crystal as far as the shower can tell.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const gev = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v < 10000 ? 2 : 1)} TeV` : v >= 10 ? `${v.toFixed(0)} GeV` : `${v.toFixed(1)} GeV`);

export const GROUPS = [
  {
    title: 'The particle',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'The share of the particle energy the computer keys send into the crystal (a MIDI keyboard\'s velocity does the same). Harder means more energy: louder, and a deeper shower.' },
      { id: 'particle', label: 'Particle', face: 'selector', shortLabels: ['e⁻', 'γ', 'π±'], type: 'select', perform: true, def: 'electron',
        options: [['electron', 'Electron'], ['photon', 'Photon'], ['pion', 'Charged pion']],
        hint: 'Electron: an electromagnetic shower from the crystal\'s face, the same every time. Photon: it first travels a random distance (9/7 of a radiation length on average) before it turns into an electron pair, so each note starts a little deeper. Charged pion: it crosses part of the crystal before it hits a nucleus, then splits into photons, which shower, and hadrons, which mostly leak out the back: no two notes alike, and quieter.' },
      { id: 'energy', label: 'Particle energy', face: 'dial', perform: true, min: 0.5, max: 10000, def: 50, log: true, fmt: gev,
        hint: 'The particle\'s energy at full velocity. A shower peaks deeper the more energy it has (by the logarithm of it), so low energies light the front of the crystal and ring its upper modes, and TeV showers peak near the middle, which rings the odd harmonics and hardly the even ones: a darker, hollow note.' },
      { id: 'offset', label: 'Impact point (off the axis)', perform: true, min: 0, max: 0.5, def: 0, step: 0.005, fmt: (v) => `${(v * 100).toFixed(1)} % of a crystal`,
        hint: 'How far from the crystal\'s axis the particle lands, toward the next key up. Off the axis the heat is lopsided and bends the crystal, ringing its bending modes, which are not harmonic; at 50 % it lands on the crack and the two crystals share the shower. The mod wheel moves it.' },
      { id: 'pileup', label: 'Pile-up (held keys)', min: 0, max: 400, def: 0, step: 1, fmt: (v) => `${v.toFixed(0)} a second`,
        hint: 'While a key is held, collisions keep coming: soft photons from other proton–proton collisions in the same bunch crossings land at random in the crystal and ring it again, a crackle at its harmonics. Key pressure adds to it. 0: one particle, a struck crystal.' },
    ],
  },
  {
    title: 'The crystal',
    params: [
      { id: 'depth', label: 'Crystal depth', min: 5, max: 60, def: 25.8, step: 0.1, fmt: (v) => `${v.toFixed(1)} X₀`,
        hint: 'The crystal\'s length in radiation lengths: CMS\'s barrel crystals are 23 cm of lead tungstate, 25.8 X₀. A short crystal holds only the front of a shower and the rest leaks out the back; a long one holds it all near its front face, so the note is brighter.' },
      { id: 'width', label: 'Crystal width', min: 0.4, max: 4, def: 1.12, step: 0.01, fmt: (v) => `${v.toFixed(2)} R_M`,
        hint: 'The crystal\'s face in Molière radii (CMS\'s are 22 mm, 1.12 R_M). A shower spreads sideways about one Molière radius, so narrow crystals share it with their neighbours, which ring softly a semitone either side, and wide ones keep it. Depth over width also sets the crystal\'s slenderness, and so where its bending modes fall.' },
      { id: 'q', label: 'Crystal Q', min: 100, max: 20000, def: 1500, log: true, fmt: (v) => `Q = ${v.toFixed(0)}`,
        hint: 'How little the crystal loses as it rings: every mode rings for Q periods of its own, about 13 s for C4 at 1500, so low keys and low modes ring longest.' },
      { id: 'damper', label: 'Damper on release (Q)', min: 3, max: 500, def: 25, log: true, fmt: (v) => `Q = ${v.toFixed(0)}`,
        hint: 'Letting go of a key presses a damper against the crystal, so it rings out at this Q (about 0.2 s for C4 at 25). The pedal (Space) keeps the dampers off.' },
    ],
  },
  {
    title: 'Listening',
    params: [
      { id: 'sensor', label: 'Sensor', face: 'selector', shortLabels: ['Piezo', 'Accel'], type: 'select', def: 'piezo',
        options: [['piezo', 'Piezo on the side (strain)'], ['accel', 'Accelerometer on the back face']],
        hint: 'Piezo: a piezoelectric sensor glued to the crystal\'s side reads the strain where it sits, from both the stretching and the bending modes. Accelerometer: one on the back face, on the axis, feels only the stretching modes, the harmonic series, louder the higher they are.' },
      { id: 'piezo', label: 'Piezo position', min: 0.02, max: 0.98, def: 0.3, step: 0.005, fmt: (v) => `${(v * 100).toFixed(1)} % of the length`,
        showIf: (P) => P.sensor === 'piezo',
        hint: 'Where along the crystal the piezo sits, from the front face. A mode with a node of strain there is silent: in the middle, the even harmonics.' },
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

export const PRESETS = [
  { name: 'CMS crystal, 50 GeV electrons', p: {} },
  { name: 'Photons: each converts somewhere new', p: { particle: 'photon' } },
  { name: 'Pions: no two showers alike', p: { particle: 'pion', energy: 100 } },
  { name: 'Low energy: shallow and bright', p: { energy: 2 } },
  { name: 'TeV electrons: deep and hollow', p: { energy: 3000 } },
  { name: 'Off the axis: the crystal bends', p: { offset: 0.25 } },
  { name: 'On the crack: two crystals share', p: { offset: 0.5 } },
  { name: 'Narrow crystals: the shower spreads', p: { width: 0.5 } },
  { name: 'Short crystal: the shower leaks', p: { depth: 9, energy: 500 } },
  { name: 'Pile-up: the collisions keep coming', p: { pileup: 150 } },
  { name: 'Accelerometer: the harmonics alone', p: { sensor: 'accel' } },
  { name: 'A long crystal (50 X₀): nothing leaks', p: { depth: 50, energy: 3000 } },
  { name: 'A lossy crystal (Q 200): short notes', p: { q: 200 } },
  { name: 'Piezo at the middle: the even harmonics silent', p: { piezo: 0.5 } },
];
