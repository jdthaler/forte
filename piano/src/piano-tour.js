// piano-tour.js — the guided tour of the Ribbon Piano's physics (shared/tour.js)
import { tour, note, chord } from '../../shared/tour.js';

export const TOUR = tour('piano', [
  {
    title: 'A hammer meets the strings',
    views: ['Slow motion after the strike', 'Partials'],
    play: [note('C3', { dur: 3, vel: 0.5 }), chord('C4 E4 G4', { at: 3, dur: 3, vel: 0.55 })],
    text: `A felt hammer, a mass on a nonlinear spring, is thrown at two or three strings tuned in unison and bounces off a millisecond later. The slow motion shows the kink it leaves running along the string.

Each string's modes are nearly harmonic, but not quite: steel wire is **stiff**, so mode n sits at \`fₙ = n f₁ √(1 + B n²)\` and the upper partials sit a little sharp of the harmonics (the ticks in the partials view).`,
  },
  {
    title: 'Two decays, from the unison',
    views: ['Spectrogram', 'Partials'],
    play: [note('A2', { dur: 8, vel: 0.85 })],
    text: `Watch each line in the spectrogram: it **dims fast, then lingers**. The strings of a unison are tuned a hair apart and all drive one bridge. At first they move together and push the bridge hard, so they lose energy fast (the loud attack); as they drift out of phase, the part where they move against each other hardly moves the bridge and rings on.

This is Weinreich's double decay, and the long tail of a piano note: the *aftersound*.`,
  },
  {
    title: 'Where the hammer strikes',
    views: ['Partials', 'Spectrogram'],
    preset: 'Hammer at the middle (odd partials only)',
    play: [note('C3', { dur: 3.5, vel: 0.6 }), { at: 3.5, set: { strikePos: 0.12 } }, note('C3', { at: 3.6, dur: 3.5, vel: 0.6 })],
    text: `A mode is excited in proportion to how much it moves where the hammer lands. Struck at the **middle**, every even mode has a node there and stays silent: a hollow, clarinet-like tone.

Real pianos strike about an eighth of the way along (the second note), which weakens the 7th to 9th partials, the most dissonant of the low harmonics.`,
  },
  {
    title: 'Stiff wire: stretched partials',
    views: ['Partials', 'Spectrogram'],
    preset: 'Thick, stiff wire (very inharmonic)',
    play: [note('C2', { dur: 4, vel: 0.7 }), chord('C2 G2 C3', { at: 4, dur: 4, vel: 0.6 })],
    text: `The same string, more than twice as thick. Bending stiffness grows as the fourth power of the diameter, so the \`B n²\` term takes over: the partials march off the harmonic ticks and the low notes turn **bell-like** and clangorous.

Piano makers fight this with long strings and copper-wound bass strings, which add mass without stiffness.`,
  },
  {
    title: 'From strings to ribbons',
    views: ['Slow motion after the strike', 'Partials'],
    preset: 'Ribbon, twisted by an off-centre strike',
    play: [note('C3', { dur: 4, vel: 0.6 }), note('G3', { at: 4, dur: 4, vel: 0.6 })],
    text: `Now each string is a flat ribbon, twelve times wider than thick, and the hammer hits off its centre line. A ribbon bends easily one way and hardly at all the other, and an off-centre blow also **twists** it.

Three families of modes sound at once (bending each way, and torsion), each with its own inharmonic series: the partials view colours them by family. Torsional waves on a tensioned ribbon are never slower than transverse ones.`,
  },
  {
    title: 'Una corda',
    views: ['Spectrogram'],
    play: [note('C3', { dur: 4.5, vel: 0.6 }), { at: 4.5, set: { unaCorda: true } }, note('C3', { at: 4.6, dur: 5, vel: 0.6 })],
    text: `The soft pedal shifts the action so each hammer **misses one string** of its unison. The missed string is driven only through the bridge, so it starts out of phase with the others: more of the energy sits in the slowly decaying motion.

The second note is softer and gentler, with relatively more aftersound: three seconds in, about 3 dB more of it remains.`,
  },
]);
