// reeds-tour.js — the guided tour of the reed piano's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('reeds', [
  {
    title: 'A struck steel reed',
    views: ['Slow motion: reed, hammer and pickup slot', 'Spectrum'],
    play: [chord('E3 B3 D4 F#4', { dur: 3 }), chord('D3 A3 C4 E4', { at: 3, dur: 3 })],
    text: `Wurlitzer's electric piano: a felt hammer strikes a flat steel **reed** with a blob of solder at its tip, which sets its pitch. The reed swings between the teeth of a **comb** held at a high voltage: the pickup is a capacitor, and the reed is one of its plates.

On the right of the slow motion is the slot end-on, with the electric potential solved live as the reed moves through it.`,
  },
  {
    title: 'The bark comes from the pickup',
    views: ['Pickup capacitance C(y)', 'Spectrum'],
    preset: 'Direct out, clean',
    play: [note('A3', { dur: 1.5, vel: 0.1 }), note('A3', { at: 1.5, dur: 1.5, vel: 0.35 }), note('A3', { at: 3, dur: 1.5, vel: 0.65 }), note('A3', { at: 4.5, dur: 2.5, vel: 1 })],
    text: `The same A3 from pp to ff. The reed swings almost as a sine, but the capacitance between reed and comb is a **curved** function of the reed's height, \`C(y)\`, solved here from Laplace's equation.

A soft note swings over a nearly straight stretch of the curve: a near-sine. A hard one **reaches over the top** of the curve, which folds the waveform and adds even harmonics: the Wurlitzer's bark.`,
  },
  {
    title: 'Voicing: where the reed rides',
    views: ['Pickup capacitance C(y)', 'Spectrum'],
    preset: 'Reed centred in the slot (octave)',
    play: [run('A3 C4 E4 A4', { step: 0.5, dur: 1 }), { at: 2.2, set: { offset: 0.3 } }, run('A3 C4 E4 A4', { at: 2.3, step: 0.5, dur: 1 }), { at: 4.5, set: { offset: 1.2 } }, run('A3 C4 E4 A4', { at: 4.6, step: 0.5, dur: 1 })],
    text: `Centred in the slot, the reed sees the same capacitance swinging up as down: the curve is symmetric, so the output repeats **twice per cycle** and everything sounds an octave up, hollow.

At 0.3 mm above centre (the second phrase) is the normal voicing. Riding high, the reed stays on one side of the curve: thin and clean.`,
  },
  {
    title: 'Solder tips',
    views: ['Reed and modes', 'Spectrogram'],
    preset: 'Light solder (long reeds, more bark)',
    play: [run('D4 F4 A4 C5', { step: 0.5, dur: 1 }), { at: 2.2, set: { solder: 3 } }, run('D4 F4 A4 C5', { at: 2.3, step: 0.5, dur: 1 })],
    text: `A reed's pitch is set by its length and the solder at its tip: more solder, shorter reed, same pitch. A long, light-tipped reed swings further: louder, more bark. Heavy blobs give short reeds: quieter, sweeter, shorter.

The reed's second bending mode, 6 to 11 times the note (not a harmonic), dies soon after the strike: the tick above each note in the spectrogram.`,
  },
  {
    title: 'Tremolo through the speakers',
    views: ['Spectrogram'],
    preset: 'Tremolo through the speakers',
    play: [{ at: 0, pedal: true }, chord('E3 G3 B3 D4 F#4', { dur: 0.8 }), chord('D3 F3 A3 C4 E4', { at: 3.5, dur: 0.8 }), { at: 7.5, pedal: false }],
    text: `The 200A's tremolo is a lamp and a **photocell**: the lamp flickers, and the photocell's resistance follows it, swinging the volume. The cell responds fast to light and slowly to dark, which gives the throb its shape.

The built-in speakers take away the bass fundamentals and add a honk near 2.6 kHz: part of the sound everyone knows.`,
  },
]);
