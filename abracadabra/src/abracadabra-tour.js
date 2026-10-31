// abracadabra-tour.js — the guided tour of ABRACADABRA's physics (shared/tour.js)
import { tour, note, chord } from '../../shared/tour.js';

export const TOUR = tour('abracadabra', [
  {
    title: 'Listening for dark matter',
    views: ['The toroid', 'The search'],
    play: [note('A4', { dur: 6 })],
    text: `If dark matter is a sea of very light **axions**, it is a classical field oscillating at \`f = m c²/h\`. In a magnetic field B, that field acts like an **effective current**, \`g √(2ρ) cos(mt) B\`, along the field lines.

ABRACADABRA (Kahn, Safdi and Thaler, 2016) puts it inside a **toroidal** magnet: the effective current circles the toroid and threads an oscillating flux through the hole, where the magnet itself has none. A SQUID in a pickup loop there hears it. Each key is an axion of a different mass.`,
  },
  {
    title: 'A note that swells on its own',
    views: ['The toroid', 'Spectrogram'],
    play: [chord('A3 C#4 E4 A4', { dur: 8 })],
    text: `The axions in our galaxy's halo move at a few hundred km/s in random directions, so the field is a sum of waves at slightly different frequencies, a millionth apart (\`v²/c² ~ 10⁻⁶\`). They drift in and out of step: each note **swells and fades on its own**, after about a million cycles.

So the high notes flicker and the low ones hold still for many seconds.`,
  },
  {
    title: 'Buried in noise',
    views: ['The search', 'Spectrogram'],
    preset: "At the CAST limit: lost in the SQUID's noise",
    play: [note('A4', { dur: 6 }), { at: 6, set: { size: 100, field: 5 } }, note('A4', { at: 6.1, dur: 6 })],
    text: `A real axion is much weaker. At the coupling the CAST helioscope and the stars still allow, the 10 cm prototype's signal is **lost** in the SQUID's noise.

The signal grows with the magnet's field and its volume: a **meter-scale** toroid at 5 T (the second note) hears it again. In the search view, averaging calms the noise as the square root of the time and the line climbs out of it.`,
  },
  {
    title: 'The halo’s fingerprint',
    views: ['The search', 'Spectrum'],
    preset: 'A cold stream beside the halo: beats',
    play: [note('A4', { dur: 8 })],
    text: `The line's shape is the halo's speed distribution: one-sided, since every speed adds kinetic energy and only raises the frequency. A **cold stream** of dark matter (debris from a dwarf galaxy, say) adds a second, sharp line beside it, and the two **beat**: a slow, steady wobble.

A discovery would also be a telescope for the dark matter's motion.`,
  },
  {
    title: 'Where it sits',
    views: ['Where it sits', 'The search'],
    play: [note('A2', { dur: 3 }), note('A6', { at: 3, dur: 3 })],
    text: `Every axion search plots its reach on one plane: coupling to photons against mass. The keyboard spans 0.11 to 17 neV; ABRACADABRA-10 cm searched 0.41 to 8.3 neV.

The **QCD axion**, which would also explain why the strong force respects time reversal, lies far below this universe's line, between the KSVZ and DFSZ models: the target bigger experiments are being built to reach.`,
  },
]);
