// gongs-tour.js — the guided tour of the gong's physics (shared/tour.js)
import { tour, note, run } from '../../shared/tour.js';

// a roll with a soft beater: strokes ever closer and harder, then dying away
const roll = (k, at, n) => Array.from({ length: n }, (_, i) => note(k, { at: at + i * 0.13, dur: 0.12, vel: 0.15 + 0.75 * Math.sin(Math.PI * i / (n - 1)) ** 2 }));

export const TOUR = tour('gongs', [
  {
    title: 'A plate that rings',
    views: ['Gong surface', 'Spectrum'],
    play: [note('A3', { dur: 4, vel: 0.08 }), note('E3', { at: 4, dur: 4, vel: 0.08 })],
    text: `A gong is a thin bronze disc hanging free. Struck softly it behaves like any linear plate: each **mode** rings at its own frequency and decays on its own, and the picture shows their sum (the motion slowed and exaggerated).

The markers in the spectrum are those modes. They are not harmonics of one pitch, which is why a plate sounds like a bell rather than a string: the gold marker is the strike tone you hear as the note.`,
  },
  {
    title: 'Harder: the crash',
    views: ['Spectrogram', 'Energy cascade'],
    play: [note('A3', { dur: 3, vel: 0.1 }), note('A3', { at: 3, dur: 3, vel: 0.4 }), note('A3', { at: 6, dur: 5, vel: 1 })],
    text: `The same gong three times: soft, medium, hard. A plate can't bend far without **stretching**, as its middle surface has to lengthen to follow the curve. That stretching (von Kármán's equations) couples every mode to every other, and the coupling grows with the square of the amplitude.

Soft, the lines stay apart. Hard, the space between them **fills up to the top** of the spectrogram within a fraction of a second, and the energy view shows it moving into the high octave bands: an energy cascade, much like turbulence. Then it drains back down and the bell returns.`,
  },
  {
    title: 'Opera gongs: pitch that glides',
    views: ['Spectrogram', 'Energy cascade'],
    preset: 'Opera gong, pitch bends down (flat, centre)',
    play: [note('E4', { dur: 3.5, vel: 1 }), { at: 3.5, set: { rise: 2.5 } }, note('E4', { at: 3.6, dur: 4, vel: 1 })],
    text: `Struck hard at the centre, a **flat** plate is a hardening spring: the stretching stiffens it, so the note starts sharp and **falls** into tune as it rings down (about +220 ¢ at first).

Then the same strike on a shallow **dome**, 2.5 thicknesses high. Curvature adds a quadratic term that *softens* the plate, so this one starts flat and **rises**. The lower panel of the energy view tracks the strike tone's pitch: the Chinese opera gongs, made both ways, are tuned on exactly this.`,
  },
  {
    title: 'Where the mallet lands',
    views: ['Gong surface', 'Spectrum'],
    set: { strike: 0 },
    play: [note('A3', { dur: 3, vel: 0.15 }), { at: 3, set: { strike: 0.75 } }, note('A3', { at: 3.1, dur: 4, vel: 0.15 })],
    text: `Dead centre, then near the rim. A mode is excited in proportion to how far it moves where the mallet hits: at the centre only the **axisymmetric** modes (rings, no nodal diameters) move, so one clean tone sounds.

Near the rim the modes with nodal diameters join in, among them the (2,0), which lies about an octave and a half *below* the strike tone. Watch the surface break its circular symmetry and the markers in the spectrum light up.`,
  },
  {
    title: 'Thick bells, thin crashes',
    views: ['Spectrogram', 'Energy cascade'],
    preset: 'Thick bronze: stays linear (a bell plate)',
    play: [note('A3', { dur: 3.5, vel: 0.5 }), { at: 3.5, set: { thick: 0.004 } }, note('A3', { at: 3.6, dur: 4.5, vel: 0.5 })],
    text: `What matters is the vibration's size **relative to the thickness**. The same strike on a plate whose thickness is 3 % of its radius moves it a small fraction of that thickness: it stays linear, a bell plate.

On a plate seven times thinner the same strike is several thicknesses deep, and the cascade switches on. Tam-tams are thin for exactly this reason.`,
  },
  {
    title: 'A tam-tam roll',
    views: ['Gong surface', 'Spectrogram'],
    preset: 'Tam-tam: thin, big soft beater, off centre',
    play: [roll('A2', 0, 40), { at: 0, pedal: true }, { at: 9, pedal: false }],
    text: `A thin tam-tam, rolled with a big soft beater. At first only a low hum grows. The cascade has a **threshold**: past a certain amplitude, energy starts to flow upward faster than damping takes it away, and the shimmer blooms, half the energy above 2 kHz.

As the roll stops it sinks back into the hum. The physics here is the same as in the crash, only fed slowly: this is how an orchestral tam-tam swells.`,
  },
]);
