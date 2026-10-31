// pianet-tour.js — the guided tour of the reed piano's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('pianet', [
  {
    title: 'Plucked by sticking',
    views: ['Pad and reed, slow motion', 'Where the pad lets go'],
    play: [note('A3', { dur: 2.5 }), chord('A3 C4 E4', { at: 2.5, dur: 3 })],
    text: `Ernst Zacharias's Pianet has no hammers. Each steel reed rests against a sticky pad on the key. Pressing the key **lifts** the pad, and the reed, stuck to it, is dragged up with it until the bond peels away from the edge: then the reed is free and rings.

Watch the red band under the pad shrink as the crack runs, and the release point in the force plot.`,
  },
  {
    title: 'Touch: how fast the bond breaks',
    views: ['Where the pad lets go', 'Spectrogram'],
    play: [note('E4', { dur: 1.5, vel: 0.1 }), note('E4', { at: 1.5, dur: 1.5, vel: 0.4 }), note('E4', { at: 3, dur: 1.5, vel: 0.7 }), note('E4', { at: 4.5, dur: 2, vel: 1 })],
    text: `An adhesive bond is **rate-sensitive**: pulled quickly, it holds to a higher force before the crack runs away. So a faster key bends the reed further before letting go, and the note is louder, but only by a few dB.

Listen too for the attack moving earlier: a slow key lifts for tens of milliseconds before the reed breaks free.`,
  },
  {
    title: 'Pads that age',
    views: ['Where the pad lets go', 'Spectrogram'],
    play: [run('A3 C4 E4 A4', { step: 0.5, dur: 0.5 }), { at: 2, set: { tack: 0.04 } }, run('A3 C4 E4 A4', { at: 2.1, step: 0.5, dur: 0.5 }), { at: 4.1, set: { tack: 0.012 } }, run('A3 C4 E4 A4', { at: 4.2, step: 0.5, dur: 0.5 })],
    text: `Fresh pads, then aged ones, then nearly dead. As the pads lose their tack, the reed is let go **sooner**, bent less, and sounds quieter: some 12 dB down, then 20, the faint notes barely speaking.

This is the real fate of old Pianets, and why restorers hunt for the right foam.`,
  },
  {
    title: 'Inharmonic reed, harmonic pickup',
    views: ['Spectrum', 'Spectrogram'],
    play: [note('A2', { dur: 4, vel: 0.9 })],
    text: `A reed is a cantilever with a solder tip: its overtones sit **8 to 12 times** the fundamental, not on the harmonics, and they fade first.

The harmonics in between come from the pickup, whose response is a curved function of where the reed is: they are made from the fundamental, so they fade with it.`,
  },
  {
    title: 'Pianet N: an electrostatic pickup',
    views: ['Spectrum', 'Pad and reed, slow motion'],
    preset: 'Pianet N: leather pads, electrostatic pickup',
    play: [run('A3 C4 E4 A4', { step: 0.6, dur: 1.2 }), { at: 2.6, set: { offset: 0, plateGap: 0.36 } }, run('A3 C4 E4 A4', { at: 2.7, step: 0.6, dur: 1.2 })],
    text: `The earlier Pianet N hears the reeds with a charged plate instead of magnets: a capacitor whose gap the reed changes, so it follows the reed's **displacement** rather than its velocity, with more weight in the bass.

With the plate's edge level with the reed (the second phrase), the reed passes it symmetrically and only **odd harmonics** are made: hollow, clarinet-like.`,
  },
]);
