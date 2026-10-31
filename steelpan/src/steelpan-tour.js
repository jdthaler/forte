// steelpan-tour.js — the guided tour of the steel pan's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('steelpan', [
  {
    title: 'Notes hammered into a drum',
    views: ['The pan', 'Note area'],
    play: [run('C4 E4 G4 C5 E5 G5', { step: 0.4, dur: 1.2 })],
    text: `A steel pan is the end of an oil drum, sunk into a bowl and hammered into **note areas**: slightly domed patches, each bounded by grooves, each a little plate of its own. The tenor's notes lie in three rings, each an octave above the one outside it.

The note-area view draws each area's tuned modes seen from above, and where the stick lands (✕): a stroke on a mode's node can't excite it.`,
  },
  {
    title: 'The tuner’s harmonics',
    views: ['Spectrum', 'Note area'],
    preset: 'Untuned, as sunk',
    play: [note('C4', { dur: 2.5 }), { at: 2.5, set: { tuning: 'twelfth' } }, note('C4', { at: 2.6, dur: 3 })],
    text: `First the note as sunk: its first three modes are a semitone or more away from any harmonic, and it clangs. The **tuner** then hammers the area, stiffening it here and slackening it there, until those modes sit at 1, 2 and 3 times the note (the octave and twelfth), or 1 : 2 : 4 on some pans.

The second note is tuned: its partials land on the harmonic grid.`,
  },
  {
    title: 'Hard strokes bloom',
    views: ['Energy flow', 'Spectrogram'],
    play: [note('C4', { dur: 2, vel: 0.15 }), note('C4', { at: 2, dur: 2, vel: 0.5 }), note('C4', { at: 4, dur: 3, vel: 1 })],
    text: `One note, from soft to hard. The dome gives the plate a **quadratic** nonlinearity, and with the modes tuned at 1 : 2 : 3 that nonlinearity is resonant: the fundamental drives the octave, and the two together drive the twelfth.

Soft, each mode simply decays. Hard, energy is **pumped** from the fundamental into the octave and back: the octave line swells after the stroke and the note blooms. That is the pan's singing tone.`,
  },
  {
    title: 'Flat notes, high domes',
    views: ['Energy flow', 'Spectrum'],
    preset: 'Flat notes (no dome)',
    play: [run('C4 G4 C5', { step: 0.8, dur: 0.8, vel: 0.95 }), { at: 2.6, set: { rise: 8 } }, run('C4 G4 C5', { at: 2.7, step: 0.8, dur: 0.8, vel: 0.95 })],
    text: `The same hard phrase on **flat** notes, then on high domes. A flat plate has no quadratic term (bending up and down are the same), so its tone is fixed however hard it is struck.

Domed, the energy climbs the harmonics after each stroke: the tone brightens and wobbles.`,
  },
  {
    title: 'Neighbours ring along',
    views: ['The pan', 'Spectrogram'],
    preset: 'Let it ring',
    play: [note('C4', { dur: 6, vel: 0.8 })],
    text: `All the notes share one sheet of steel, so a struck note shakes its neighbours. The tenor's notes are laid out round the rim in **fourths and fifths** so that a note's neighbours have partials at its octave and twelfth (C4's include G4, C5 and G5): they take up those partials and **ring along** (watch the other notes glow), making the note fuller and longer.

Laid out chromatically, few neighbours share a partial and only the octave rings on.`,
  },
]);
