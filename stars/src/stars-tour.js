// stars-tour.js — the guided tour of the star keyboard's physics (shared/tour.js)
import { tour, note, run } from '../../shared/tour.js';

export const TOUR = tour('stars', [
  {
    title: 'Stars that ring',
    views: ['The star', 'Power spectrum'],
    play: [note('G6', { dur: 5 })],
    text: `Sound waves trapped inside a star make its surface **breathe**. The Sun rings in thousands of modes, with periods near five minutes; NASA's Kepler and TESS satellites measured them in thousands of stars from their flickering light.

Here the Sun itself on G6, sped up some 500,000 times into hearing: a shimmer of modes, each breathing at random.`,
  },
  {
    title: 'Driven by convection',
    views: ['Power spectrum', 'Spectrogram'],
    play: [note('G6', { dur: 4 })],
    text: `These modes are not struck. The boiling **convection** near the surface kicks every mode at random, and each swells and fades within its lifetime. So the bars come and go like a breathing comb.

Let go and the convection stops (here): each mode rings down at its own linewidth.`,
  },
  {
    title: 'A comb of modes',
    views: ['Échelle diagram', 'Power spectrum'],
    play: [note('C6', { dur: 5 })],
    text: `Modes of one degree l are almost evenly spaced, by the **large separation** Δν, the inverse of the time sound takes to cross the star. Cut the spectrum into strips Δν wide and stack them (an échelle diagram) and the modes line up in **ridges**, one per degree.

Δν goes as the square root of the star's mean density: measuring it weighs the star.`,
  },
  {
    title: 'Down the track: dwarfs to red giants',
    views: ['The track', 'Échelle diagram'],
    play: [run('C7 C6 C5 C4 C3', { step: 2, dur: 1.9 })],
    text: `The keyboard is one star's life. Top keys are dwarfs on the main sequence, then subgiants, then **red giants** down the keyboard (the ring on the Hertzsprung–Russell diagram).

As the star swells its density falls, so its modes slow and crowd: the combs close up from 85 Hz to 6 Hz apart, and the breathing slows from about a second to five. A red giant's dipole modes also mix with waves in its dense core, which scatter them off the ridge.`,
  },
  {
    title: 'Rotation splits the modes',
    views: ['The star', 'Power spectrum'],
    preset: 'Equator-on, spinning fast: split multiplets',
    play: [note('C6', { dur: 3 }), { at: 3, set: { incl: 0 } }, note('C6', { at: 3.1, dur: 3 })],
    text: `A spinning star turns its patterns: those going with the rotation are carried faster and those against it slower, so each mode **splits** into 2l + 1 components (m from −l to l). The note beats and shimmers.

Seen pole-on (the second note), the components with m ≠ 0 average out over the disc and only single lines are left: the splittings measure both the spin and the angle we see it from.`,
  },
]);
