// tess-tour.js — the guided tour of the TESS keyboard's physics (shared/tour.js)
import { tour, note, chord } from '../../shared/tour.js';

export const TOUR = tour('tess', [
  {
    title: 'A planet crossing its star',
    views: ['The transits', 'The light curve'],
    play: [chord('A3 C#4 E4', { dur: 6 })],
    text: `NASA's TESS satellite finds planets by **transits**: when a planet crosses its star, the star dims by the planet's share of its disc, \`(R_p/R_⋆)²\`, about 1 % for a Jupiter round the Sun.

Each key is a planet, its orbit sped up so that one year is one cycle of the note: every crossing is one dip in the light. The A4 planet goes round in a day in the real system, and in 1/440 of a second in the sound.`,
  },
  {
    title: 'Kepler’s third law',
    views: ['The transits', 'Spectrogram'],
    play: [note('A2', { dur: 3 }), note('A4', { at: 3, dur: 3 }), note('A6', { at: 6, dur: 3 })],
    text: `A higher note is a shorter year, so a planet closer in: Kepler's third law, \`P² ∝ a³\`. A close planet crosses its star in a big share of its year: a broad dip, a **round** tone. A distant one crosses in a small share: a short dip in a long year, a sharp pulse rich in harmonics, which **buzzes**.

Keys a fifth apart are years in the ratio 3 : 2, the resonance that holds planets in chains like TOI-178's.`,
  },
  {
    title: 'Limb darkening and grazing',
    views: ['The light curve', 'The transits'],
    preset: 'Grazing: short V-shaped dips',
    set: { impact: 0.3, scale: 0.01 },
    play: [note('A3', { dur: 3 }), { at: 3, set: { impact: 0.97, scale: 0.001 } }, note('A3', { at: 3.1, dur: 3 })],
    text: `A star is darker toward its rim (**limb darkening**: there we see higher, cooler layers), so a central transit is a rounded dip.

A planet that only grazes the edge crosses briefly and covers dimmer parts of the star: a short, shallow, V-shaped dip, a quieter and buzzier note.`,
  },
  {
    title: 'Photon noise',
    views: ['The light curve', 'Spectrogram'],
    preset: 'A hot Jupiter round a Sun-like star',
    set: { tmag: 13 },
    play: [note('A3', { dur: 3 }), { at: 3, set: { tmag: 6 } }, note('A3', { at: 3.1, dur: 3 })],
    text: `TESS counts photons, and counting has a noise of √N. A faint star (TESS magnitude 13) gives few photons: the dips are buried in **hiss**. A bright one (magnitude 6) gives many: the note stands out.

That is why TESS watches the nearest, brightest stars, unlike Kepler before it.`,
  },
  {
    title: 'Real planets',
    views: ['The transits', 'The light curve'],
    preset: 'TOI-700 d: an Earth in the habitable zone (on A4)',
    play: [note('A4', { dur: 3.5 }), { at: 3.5, set: { tmag: 16.3, teff: 4710, starMass: 0.518, starRadius: 0.0131, planetRadius: 10.4, impact: 0.865, periodA4: 1.40794, scale: 0.6 } }, note('A4', { at: 3.6, dur: 3.5 })],
    text: `TOI-700 d, an Earth-sized planet in its red dwarf's habitable zone: a small planet, but round a small star, so its dip is deep enough to hear.

Then WD 1856+534 b, a giant planet round a white dwarf about the size of the Earth. The planet is far larger than its star: it blocks more than half its light, a loud, grazing note.`,
  },
]);
