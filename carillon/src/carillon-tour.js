// carillon-tour.js — the guided tour of the carillon's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('carillon', [
  {
    title: 'A bell and its partials',
    views: ['Bell and mode', 'Spectrum'],
    play: [note('G4', { dur: 5, vel: 0.6 })],
    text: `A bell is a thick, curved shell. Its modes are named by where they vibrate: the **hum** an octave below, the **prime**, the minor-third **tierce**, the **quint**, the **nominal** an octave above, and higher ones. The founder turns metal off the inside, the *rib*, until these sit in a chord.

The view draws the bell cut through its axis with one partial's shape moving and its nodal circles dashed; beside it, the lip seen from below, with that partial's lobes.`,
  },
  {
    title: 'The strike note: a pitch that isn’t there',
    views: ['Strike note', 'Spectrum'],
    play: [note('G4', { dur: 4, vel: 0.6 }), note('C5', { at: 4, dur: 4, vel: 0.6 })],
    text: `The pitch you name when a bell is struck, its **strike note**, usually has no partial at it. It is a *virtual pitch*: the nominal, superquint and octave nominal stand nearly as 2 : 3 : 4, harmonics of a tone an octave below the nominal, and the ear hears that missing fundamental.

The curve is subharmonic summation, a model of the ear: each partial votes for every pitch it could be a harmonic of, and the peak (red) is the strike note.`,
  },
  {
    title: 'Minor and major third bells',
    views: ['Strike note', 'Spectrum'],
    play: [chord('C4 E4 G4', { dur: 3.5 }), { at: 3.5, set: { profile: 'major' } }, chord('C4 E4 G4', { at: 3.6, dur: 4 })],
    text: `A traditional bell's tierce is a **minor** third above its prime, so every bell carries a minor chord inside it, and a major chord on a carillon is always tinged with minor.

The second chord is on major-third bells, a profile the Eijsbouts foundry developed with the Eindhoven University of Technology by optimising the rib's shape: the tierces rise to major thirds and the chord sounds sweeter.`,
  },
  {
    title: 'Warble: a bell not quite round',
    views: ['Bell and mode', 'Spectrogram'],
    preset: 'The same bells struck on an axis: no warble',
    play: [note('C5', { dur: 4 }), { at: 4, set: { strikeAngle: 11.25 } }, note('C5', { at: 4.1, dur: 5 })],
    text: `A perfectly round bell has every mode in a pair of twins with the same frequency, turned against each other. A slightly uneven wall **splits the twins** by a few hertz, along two axes fixed in the bell.

Struck on an axis, the clapper excites only one twin: a steady tone. Struck between the axes, it excites both, and they **beat**: the nominal throbs about three times a second. Carillonneurs call it warble.`,
  },
  {
    title: 'Under the tower, across the square',
    views: ['Spectrum', 'Spectrogram'],
    preset: 'Under the tower (10 m)',
    play: [run('C5 D5 E5 G5 E5 C5', { step: 0.45, dur: 1.5 }), { at: 3, set: { distance: 300, room: 0.3 } }, run('C5 D5 E5 G5 E5 C5', { at: 3.1, step: 0.45, dur: 1.5 })],
    text: `The same phrase heard from 10 m and from 300 m (the levels matched by ear: the far one is really much quieter). **Air absorbs** high frequencies far more than low ones, so with distance the top of each bell goes first.

Across a town square the carillon is mellow and the hum carries furthest: the instrument was always meant to be heard from a distance.`,
  },
]);
