// windharp-tour.js — the guided tour of the wind harp's physics (shared/tour.js)
import { tour, note, chord } from '../../shared/tour.js';

export const TOUR = tour('windharp', [
  {
    title: 'Strings played by the wind',
    views: ['Vortex street', 'Lock-in map'],
    play: [chord('G3 D4 G4', { dur: 6 })],
    text: `An aeolian harp has no player: wind blowing across a string sheds **vortices** from alternate sides, a von Kármán street, at a frequency set by the wind speed: the Strouhal frequency \`f = St U/D\`, with St ≈ 0.2.

Each key opens a shutter onto its string. Watch the vortices peel off alternately behind the string as it swings across the wind.`,
  },
  {
    title: 'Lock-in: wake and string agree',
    views: ['Lock-in map', 'Spectrum'],
    play: [note('G5', { dur: 6 })],
    text: `The wake behaves like a self-excited oscillator (a van der Pol oscillator). When its Strouhal frequency comes near one of the string's harmonics, the string's motion pulls the shedding into step with it: **lock-in**, the dark bands in the map.

So a wind harp sings a string's harmonics, not its fundamental: here every string is cut so the steady wind locks it on its **third** harmonic. The dot is the wind now.`,
  },
  {
    title: 'A rising wind climbs the harmonics',
    views: ['Lock-in map', 'Spectrogram'],
    set: { wind: 3.6 },
    play: [note('G5', { dur: 16 }), { at: 2, set: { wind: 4.8 } }, { at: 4, set: { wind: 6 } }, { at: 6, set: { wind: 6.9 } }, { at: 9, set: { wind: 6 } }, { at: 11.5, set: { wind: 4.8 } }, { at: 14, set: { wind: 3.6 } }],
    text: `One string as the wind rises and falls. Rising, it **hops** from its 3rd harmonic to its 4th and 5th, falling quiet in between. Falling, each harmonic comes back later and holds on lower: once locked, the string drags the wake along, which is **hysteresis** (the pale extensions of the bands).`,
  },
  {
    title: 'A gusty evening',
    views: ['Spectrogram', 'Lock-in map'],
    preset: 'A gusty evening: strings flicker between harmonics',
    play: [chord('C4 G4 E5', { dur: 10 })],
    text: `Real wind gusts. A string near the edge of a lock-in band **drops out** when a gust carries the wind past it and back in when it returns: notes flicker and hop, and between locks the faint aeolian tone slides with the wind.

That unpredictability is the wind harp's ghostly charm, much loved by the Romantic poets.`,
  },
  {
    title: 'Kircher’s harp',
    views: ['Spectrum', 'Lock-in map'],
    preset: 'Kircher’s harp: unison strings, gauges differ',
    play: [chord('C4 E4 G4 C5 E5', { dur: 8 })],
    text: `Athanasius Kircher described the aeolian harp in 1650: strings all **tuned to one note**, but of different gauges. In one wind, the thinner strings shed faster and lock onto higher harmonics of the same fundamental.

So the instrument sounds a chord of **harmonics** of one note, which changes as the wind changes.`,
  },
]);
