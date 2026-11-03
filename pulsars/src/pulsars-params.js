// pulsars-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound. Every key is a pulsar, a spinning neutron star, whose spin is the
// note: its beam sweeps past the Earth once a turn, and the radio telescope's power, pulse after
// pulse, is the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const deg = (v) => `${v.toFixed(1)}°`;
const km = (v) => `${v.toFixed(0)} km`;
const mhz = (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} GHz` : `${v.toFixed(0)} MHz`);

export const GROUPS = [
  {
    title: 'The star',
    params: [
      { id: 'alpha', label: 'Magnetic inclination (α)', perform: true, min: 0, max: 90, def: 45, step: 0.5, fmt: deg,
        hint: 'How far the magnetic axis, and the beams along it, tilt from the spin axis. Near 90° the other pole\'s beam sweeps past us too, half a turn later: an interpulse, which brings in the octave. Near 0° the beam hardly moves across the sky, and the pulses fade into a steady glow.' },
      { id: 'sightline', label: 'Sightline (impact β / ρ)', perform: true, min: 0, max: 1.3, def: 0.3, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of the beam`,
        hint: 'How close to the magnetic axis our line of sight passes, as a share of the beam\'s radius. Through the middle it crosses the core and both sides of the hollow cone: a triple pulse. Near the edge it grazes the cone: one narrow pulse, and a buzzier tone. Past the beam (over 100 %) only its faint edge reaches us.' },
      { id: 'core', label: 'Core emission', min: 0, max: 1, def: 0.4, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %`,
        hint: 'How much of the beam comes from its core, along the magnetic axis, and how much from the hollow cone around it. A sightline through the middle hears the core as the pulse\'s centre.' },
      { id: 'height', label: 'Emission height', min: 20, max: 2000, def: 200, log: true, fmt: km,
        hint: 'How far above the star the radio comes from. The beam is as wide as the open field lines there, so higher up it is wider and the pulses longer and mellower; lower down they are short and sharp. It can\'t reach past 30 % of the light cylinder, where the field lines close: for the fast pulsars at the top of the keyboard, that sets the beam.' },
      { id: 'jitter', label: 'Pulse-to-pulse jitter', perform: true, min: 0, max: 2, def: 0.3, step: 0.01, fmt: (v) => `modulation index ${v.toFixed(2)}`,
        hint: 'Single pulses are never alike: each is brighter or fainter than the average (its spread over its mean, the modulation index). Rough and crackling when high, smooth at 0. A smeared pulse is an average of several, so it varies less.' },
    ],
  },
  {
    title: 'The way here',
    params: [
      { id: 'dm', label: 'Dispersion measure (DM)', perform: true, strip: true, min: 0.5, max: 1000, def: 20, log: true, fmt: (v) => `${v.toFixed(1)} pc/cm³`,
        hint: 'The electrons between the pulsar and us, which delay low frequencies more than high ones (by 4.15 ms × DM / f², f in GHz) and scatter the pulses. A nearby pulsar is a few, one across the Galaxy hundreds. More smears each pulse and dulls the tone; the scattering grows fastest of all. The mod wheel moves it.' },
      { id: 'scatter', label: 'Scattering (× the typical)', min: 0.01, max: 100, def: 1, log: true, fmt: (v) => `× ${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`,
        hint: 'The turbulence along the way, as a multiple of what pulsars at this DM typically have (Bhat et al. 2004; real ones scatter ten times more or less). Each pulse gets a tail, longer at low frequencies, that no dedispersion takes away: the tone loses its top, and at low frequencies and high DM the pulses melt into one another.' },
    ],
  },
  {
    title: 'The telescope',
    params: [
      { id: 'freq', label: 'Observing frequency', perform: true, min: 100, max: 5000, def: 1400, log: true, fmt: mhz,
        hint: 'The radio frequency the telescope listens at. Dispersion goes as 1/f² and scattering about as 1/f⁴, so low frequencies (LOFAR, 150 MHz) blur the pulses and high ones (5 GHz) keep them sharp.' },
      { id: 'bandwidth', label: 'Bandwidth', min: 0.01, max: 0.6, def: 0.2, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of the frequency`,
        hint: 'How wide a band of radio the receiver takes in, as a share of the observing frequency. Its upper half is the left channel and its lower half the right. A wider band spans a wider spread of delays.' },
      { id: 'dedisp', label: 'Dedispersion', perform: true, type: 'select', face: 'selector', shortLabels: ['None', 'Filterbank', 'Coherent'], def: 'filterbank',
        options: [['none', 'None: the band\'s total power'], ['filterbank', 'Filterbank: each channel\'s delay taken out'], ['coherent', 'Coherent: the plasma\'s effect undone']],
        hint: 'None: the whole band is summed as it arrives, so each pulse is smeared over the band\'s spread of delays, the lower half (right) later than the upper (left), and a new note sweeps from left to right. Filterbank: the band is cut into channels and each one\'s delay is taken out, leaving the smear inside a channel. Coherent: the plasma\'s phase is undone exactly. Scattering stays.' },
      { id: 'channels', label: 'Filterbank channels', min: 4, max: 4096, def: 256, log: true, step: 1, fmt: (v) => `${v.toFixed(0)} channels`, showIf: (P) => P.dedisp === 'filterbank',
        hint: 'How many channels the filterbank cuts the band into. More, narrower channels leave less smear inside each.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'How bright the pulsar is for the computer keys (a MIDI keyboard\'s velocity does the same): its flux at the telescope.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.2, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Millisecond pulsars at 1.4 GHz', p: {} },
  { name: 'Orthogonal rotator: main pulse and interpulse', p: { alpha: 89, sightline: 0.15 } },
  { name: 'Nearly aligned: the beam never leaves us', p: { alpha: 6, sightline: 0.5 } },
  { name: 'Grazing the cone: one narrow pulse', p: { sightline: 0.92, height: 60 } },
  { name: 'Through the core: a triple pulse', p: { sightline: 0, core: 0.5, height: 60 } },
  { name: 'No dedispersion: the pulses smear and sweep', p: { dedisp: 'none', dm: 1.5 } },
  { name: 'Coherent dedispersion: sharp across the Galaxy', p: { dedisp: 'coherent', dm: 150, freq: 3000 } },
  { name: 'LOFAR at 150 MHz: scattering tails', p: { freq: 150, dm: 35, dedisp: 'coherent', bandwidth: 0.3 } },
  { name: 'Deep in the Galaxy: DM 400 at 3 GHz', p: { dm: 400, freq: 3000 } },
  { name: 'Flickering single pulses', p: { jitter: 1.4 } },
  { name: 'Low in the beam: sharp, buzzy pulses', p: { height: 30, sightline: 0.5 } },
  { name: 'PSR B1937+21 (DM 71): the first millisecond pulsar', p: { dm: 71, alpha: 87, sightline: 0.2 } },
];
