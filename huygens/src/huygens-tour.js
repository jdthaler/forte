// huygens-tour.js — the guided tour of the Huygens keyboard's physics (shared/tour.js)
import { tour, chord } from '../../shared/tour.js';

export const TOUR = tour('huygens', [
  {
    title: 'Oscillators that pull each other',
    views: ['Lamp firings', 'What the chord is actually playing'],
    preset: 'Uncoupled: plain equal temperament',
    play: [chord('C4 E4 G4', { dur: 4 }), { at: 4, set: { kick: 0.055 } }, chord('C4 E4 G4', { at: 4.1, dur: 4 })],
    text: `In 1665 Christiaan Huygens, ill in bed, noticed two pendulum clocks on one beam swinging in perfect step, however he disturbed them: the first observation of **synchronisation**.

Here each key is a neon-lamp oscillator, a capacitor charging until its lamp flashes. Each flash gives the others a small **kick** along their charging. First no coupling: plain equal temperament. Then 5.5 %: the chord **locks** onto the just ratios 4 : 5 : 6, and the table shows what it is actually playing.`,
  },
  {
    title: 'Locked chords stop beating',
    views: ['Spectrogram', 'Spectrum'],
    preset: 'Uncoupled: plain equal temperament',
    play: [chord('A3 C#4 E4 A4', { dur: 4.5 }), { at: 4.5, set: { kick: 0.055 } }, chord('A3 C#4 E4 A4', { at: 4.6, dur: 4.5 })],
    text: `Each oscillator is a sawtooth with a full comb of harmonics. In equal temperament the major third is 14 ¢ wide, so the 5th harmonic of the root and the 4th of the third sit close but apart, and **beat**: neighbouring lines in the spectrogram wobble.

Coupled, the chord pulls itself onto just ratios, the harmonics fall onto **shared lines**, and every line goes still.`,
  },
  {
    title: 'Arnold tongues',
    views: ['Where two oscillators lock', 'Lamp firings'],
    play: [chord('C4 G4', { dur: 3 }), chord('C4 E4', { at: 3, dur: 3 }), chord('C4 Bb4', { at: 6, dur: 3 })],
    text: `Which ratio a pair locks to, and how strong the coupling must be, is mapped by **Arnold tongues**: wedges in the plane of interval and coupling, widest for the simplest ratios (bright).

The fifth (3 : 2) locks almost at once; the major third (5 : 4) from about 2.6 %; the minor seventh reaches 7 : 4 only near 6 %. The upper panel, a devil's staircase, shows every interval captured onto some ratio at the current strength.`,
  },
  {
    title: 'Too strong: intervals collapse',
    views: ['Where two oscillators lock', 'What the chord is actually playing'],
    preset: 'Very strong (11%): minor 6ths collapse into fifths',
    play: [chord('E4 C5', { dur: 3.5 }), chord('C4 C#4', { at: 3.5, dur: 3.5 })],
    text: `Coupling cuts both ways. Strong enough, and the tongues of simple ratios swallow their neighbours: a minor sixth (8 : 5) is pulled all the way into a **fifth**, and a semitone merges into a **unison**.

Musical coupling is a balance: enough to lock the consonances, not so much that it eats the dissonances.`,
  },
  {
    title: 'Out of tune, played in tune',
    views: ['What the chord is actually playing', 'Spectrogram'],
    preset: 'Badly tuned, rescued by coupling',
    play: [chord('C4 E4 G4', { dur: 3 }), chord('F4 A4 C5', { at: 3, dur: 3 }), chord('G4 B4 D5', { at: 6, dur: 3 })],
    text: `Every oscillator here is mistuned by up to 25 ¢ at random, a badly out-of-tune keyboard. But each chord **re-tunes itself**: the coupling pulls the notes onto just ratios with each other, wherever they started.

Fireflies flashing in unison, cardiac pacemaker cells and Josephson junction arrays lock by the same mathematics.`,
  },
]);
