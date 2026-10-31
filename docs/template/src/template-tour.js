// template-tour.js — the guided tour of the bar's physics (shared/tour.js): a few steps, each
// showing the views it is about and playing what to listen for. Write one for your instrument.
import { tour, note, run } from '../../../shared/tour.js';

export const TOUR = tour('template', [
  {
    title: 'A struck bar',
    views: ['Mode shapes and strike point', 'Spectrum'],
    play: [note('C4', { dur: 2.5, vel: 0.6 }), note('G4', { at: 2.5, dur: 2.5, vel: 0.6 })],
    text: `A bar free at both ends bends in **modes**, each with its own shape and frequency. Their frequencies go as 1 : 2.76 : 5.40 : 8.93, not as the harmonics of a string, so a bar sounds like a bell more than a string.

The markers in the spectrum are the modes the model predicts; the peaks are what the engine plays.`,
  },
  {
    title: 'Where the mallet lands',
    views: ['Mode shapes and strike point', 'Spectrum'],
    play: [note('C4', { dur: 2.5 }), { at: 2.5, set: { strike: 0.224 } }, note('C4', { at: 2.6, dur: 2.5 })],
    text: `A strike excites each mode in proportion to how far that mode moves where it lands. Near the end every mode sounds; at **22.4 %** of the length, the lowest mode's node, the fundamental is left out and the note jumps to the next mode up.`,
  },
  {
    title: 'High modes die first',
    views: ['Spectrogram'],
    preset: 'Steel bar, hard mallet',
    play: run('C4 E4 G4 C5', { step: 1, dur: 1 }),
    text: `Losses grow with frequency, so each note's stack of lines in the spectrogram **thins from the top down**: the attack is bright and the tail pure.`,
  },
]);
