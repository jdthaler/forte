// showers-tour.js — the guided tour of the collider showers' physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('showers', [
  {
    title: 'A crystal heated by a shower',
    views: ['The event', 'The shower'],
    play: [{ at: 0, pedal: true }, run('C4 E4 G4', { step: 0.8, dur: 0.6 }), chord('C4 E4 G4', { at: 2.6, dur: 0.6 }), { at: 6, pedal: false }],
    text: `CMS measures electrons and photons in 75,848 crystals of lead tungstate. A 50 GeV electron hitting one sets off a **shower**: it radiates photons, which make electron–positron pairs, which radiate again, until the energy is spread over thousands of particles and absorbed as heat within a few centimetres.

That sudden heat makes the crystal **expand** where it was deposited, and it rings: the thermo-acoustic effect. Each key is a crystal tuned to its note.`,
  },
  {
    title: 'Where the heat lands sets the tone',
    views: ['The shower', 'Spectrum'],
    preset: 'Low energy: shallow and bright',
    play: [run('C4 E4 G4 C5', { step: 0.6, dur: 0.6 }), { at: 2.4, set: { energy: 3000 } }, run('C4 E4 G4 C5', { at: 2.5, step: 0.6, dur: 0.6 })],
    text: `A shower's depth grows only with the **logarithm** of its energy. At 2 GeV it peaks near the front face; at 3 TeV, near the middle of the crystal.

Heat rings a stretching mode in proportion to the mode's strain under it. At the middle, the even modes' strain changes sign under the peak and cancels: the **even harmonics drop out** and the note goes hollow, like a clarinet.`,
  },
  {
    title: 'Electrons, photons, pions',
    views: ['The event', 'Spectrogram'],
    play: [run('A3 A3 A3', { step: 1, dur: 0.8 }), { at: 3, set: { particle: 'photon' } }, run('A3 A3 A3', { at: 3.1, step: 1, dur: 0.8 }), { at: 6.1, set: { particle: 'pion', energy: 100 } }, run('A3 A3 A3', { at: 6.2, step: 1, dur: 0.8 })],
    text: `The same note, three times for each particle. **Electrons** shower the same way every time: identical notes. **Photons** must first convert into a pair, somewhere new each time, so their notes vary a little.

**Pions** interact through the strong force, deeper and far more erratically: no two hadronic showers alike, in level and in colour. The calorimeter's resolution for them is much worse, for the same reason.`,
  },
  {
    title: 'Off the axis, and on the crack',
    views: ['The event', 'Spectrum'],
    preset: 'Off the axis: the crystal bends',
    play: [note('C4', { dur: 3 }), { at: 3, set: { offset: 0.5 } }, note('C4', { at: 3.1, dur: 3.5 })],
    text: `A shower off the crystal's axis heats one side more than the other: the crystal **bends** as well as stretches, and its bending modes, low and inharmonic, join in under the note.

On the crack between two crystals, both share the shower: two notes a semitone apart.`,
  },
  {
    title: 'Pile-up',
    views: ['Spectrogram', 'The event'],
    preset: 'Pile-up: the collisions keep coming',
    play: [chord('C4 E4 G4', { dur: 6 })],
    text: `At the LHC, bunches cross 40 million times a second, and each crossing has dozens of collisions. The crystals keep being hit by soft photons from all of them: **pile-up**.

The held chord rings on with a crackle of extra showers, each lighting the lines again: the background every physics analysis at a hadron collider must subtract.`,
  },
]);
