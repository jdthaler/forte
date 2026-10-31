// abracadabra-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound. Every key is ABRACADABRA in a universe whose dark matter is an axion of
// the key's mass: its frequency in kHz is the note's in Hz. Nothing else is scaled, so the field
// swells and fades, and the SQUID hisses, as they would in the real experiment.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

// 3×10⁻⁷ and the like
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const sci = (v, digits = 1) => {
  const [m, e] = v.toExponential(digits).split('e');
  return `${m}×10${e.replace('+', '').replace('-', '⁻').replace(/\d/g, (d) => SUP[d])}`;
};

export const GROUPS = [
  {
    title: 'The axion',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'How hard the computer keys play: how far each key charges its magnet (a MIDI keyboard\'s velocity does the same). The axion\'s flux follows the field, so a soft note is quieter against the same SQUID noise.' },
      { id: 'coupling', label: 'Coupling to photons (g)', perform: true, min: 1e-12, max: 1e-6, def: 5e-7, log: true, fmt: (v) => `${sci(v)} GeV⁻¹`,
        hint: 'How strongly the axion turns the magnet\'s field into a current, g in g a E·B. The flux in the pickup grows as g: at the default the axion stands clear of the SQUID\'s noise; turn it down and it sinks into the hiss. CAST and the stars allow at most 6.6×10⁻¹¹ GeV⁻¹; ABRACADABRA-10 cm ruled out down to 3.2×10⁻¹¹ near 3 neV.' },
      { id: 'halo', label: 'Halo speed (v₀)', perform: true, min: 20, max: 3000, def: 220, log: true, fmt: (v) => `${v.toFixed(0)} km/s`,
        hint: 'How fast the dark matter moves through the Galaxy: 220 km/s in the Standard Halo Model. Each speed adds a wave a little sharp of the axion\'s mass, by v²/2c², so the line is about a millionth of its frequency wide and the tone swells and fades over about half a million cycles (a second at A4, a quarter of a minute at A0). A colder halo holds each swell longer; a hotter one, a galaxy cluster\'s, blurs the tone into a band of noise. The mod wheel heats it.' },
      { id: 'stream', label: 'Stream', min: 0, max: 0.5, def: 0, step: 0.01, fmt: (v) => (v ? `${(v * 100).toFixed(0)} %` : 'none'),
        hint: 'A share of the dark matter in a cold stream crossing the lab (a galaxy torn apart by ours), only 20 km/s across: a second, steadier line beside the halo\'s, which beats against it. O\'Hare and Green\'s benchmark stream holds 5 %.' },
      { id: 'streamSpeed', label: 'Stream speed', min: 100, max: 800, def: 420, fmt: (v) => `${v.toFixed(0)} km/s`, showIf: (P) => P.stream > 0,
        hint: 'How fast the stream crosses the lab: the faster, the further sharp of the halo\'s line it sits, so the faster the two beat.' },
    ],
  },
  {
    title: 'The magnet',
    params: [
      { id: 'field', label: 'Magnetic field', face: 'dial', min: 0.1, max: 10, def: 1, log: true, fmt: (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} T`,
        hint: 'The toroid\'s field at its inner radius, 1 T in ABRACADABRA-10 cm. The axion\'s flux grows with it; the SQUID\'s noise does not.' },
      { id: 'size', label: 'Toroid size', min: 6, max: 300, def: 12, log: true, fmt: (v) => (v < 100 ? `${v.toFixed(v < 20 ? 1 : 0)} cm` : `${(v / 100).toFixed(2)} m`),
        hint: 'The toroid\'s diameter and height, 12 cm in ABRACADABRA-10 cm, with the pickup scaled alike: the flux grows as the volume, so a meter-scale toroid hears an axion 580 times fainter.' },
      { id: 'ramp', label: 'Ramp time', min: 0.005, max: 10, def: 0.08, log: true, fmt: (v) => (v < 1 ? `${(v * 1000).toFixed(0)} ms` : `${v.toFixed(1)} s`),
        hint: 'How long a key takes to charge its magnet to full field, and to discharge it when the key comes up: the note\'s attack and release. The axion was there all along; the magnet makes it heard.' },
    ],
  },
  {
    title: 'The readout',
    params: [
      { id: 'noise', label: 'SQUID noise', min: 0, max: 10, def: 1, step: 0.01, fmt: (v) => (v ? `${v.toFixed(2)} μΦ₀/√Hz` : 'off'),
        hint: 'The SQUID\'s flux noise, about 1 μΦ₀/√Hz in ABRACADABRA-10 cm, heard in a channel around each note while its magnet is charged. It is per Hz, as in the experiment, so a higher note\'s wider channel hisses more.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.25, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'ABRACADABRA-10 cm and a strongly coupled axion', p: {} },
  { name: 'At the CAST limit: lost in the SQUID\'s noise', p: { coupling: 6.6e-11 } },
  { name: 'A meter-scale toroid at 5 T hears it', p: { coupling: 6.6e-11, size: 100, field: 5 } },
  { name: 'A cold stream beside the halo: beats', p: { stream: 0.3 } },
  { name: 'A cold halo: long, slow swells', p: { halo: 40 } },
  { name: 'A galaxy cluster\'s hot halo: a band of noise', p: { halo: 1200 } },
  { name: 'A slow magnet: notes that charge up', p: { ramp: 1.5 } },
  { name: 'A noiseless SQUID: the axion alone', p: { noise: 0 } },
  { name: 'A fast stream (700 km/s): a second line, sharp of the halo', p: { stream: 0.4, streamSpeed: 700 } },
];
