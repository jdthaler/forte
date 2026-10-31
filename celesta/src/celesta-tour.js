// celesta-tour.js — the guided tour of the celesta's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('celesta', [
  {
    title: 'Steel bars over wooden boxes',
    views: ['Bar and box', 'Spectrum'],
    play: [run('C5 E5 G5 C6 G5 E5', { step: 0.35, dur: 0.6 }), chord('C5 E5 G5', { at: 2.4, dur: 2.5 })],
    text: `Mustel's celesta (1886) is a keyboard glockenspiel made gentle: felt hammers strike **plain steel bars**, each over a tuned wooden **box**. The bar view draws the bar on its two blocks with its first three modes moving.

A plain bar's overtones lie at 2.76 and 5.40 times the note, not on the harmonics (the markers): they give each attack its bell-like glint and then die long before the fundamental.`,
  },
  {
    title: 'Bar and box trade energy',
    views: ['Bar and box energy', 'Bar and box'],
    play: [note('C5', { dur: 2.5 }), { at: 2.5, set: { gap: 2.5 } }, note('C5', { at: 2.6, dur: 4 })],
    text: `The box is a stopped pipe tuned to its bar, coupled to it through the air in the gap. The bar alone barely moves air; the box takes its energy and **radiates** it, which is what makes a celesta note short and sweet.

Then the bar is lowered to 2.5 mm above its box. Now they are strongly coupled and the energy swings back and forth between them (watch the two traces): the note **swells and beats**.`,
  },
  {
    title: 'Without its boxes',
    views: ['Bar and box energy', 'Spectrogram'],
    preset: 'No resonators: the bars alone',
    play: [run('C5 E5 G5 C6', { step: 0.5, dur: 1 }), { at: 2.2, set: { boxes: true } }, run('C5 E5 G5 C6', { at: 2.3, step: 0.5, dur: 1 })],
    text: `The same phrase with the boxes taken away, then put back. A bar vibrating on its own pushes air forward with one face and back with the other, and the two nearly cancel: it can hardly make itself heard.

The box gathers the sound from one face only, and the note comes alive.`,
  },
  {
    title: 'Where the hammer lands',
    views: ['Bar and box', 'Spectrum'],
    preset: 'Struck at the centre: the second mode silent',
    play: [note('C5', { dur: 2.2 }), { at: 2.2, set: { strike: 0.05 } }, note('C5', { at: 2.3, dur: 2.2 }), { at: 4.5, set: { strike: 0.224 } }, note('C5', { at: 4.6, dur: 2.2 })],
    text: `A hammer excites each mode in proportion to how far that mode moves where it lands. At the **centre** the second mode has a node and stays silent. Near the **end** every mode sounds. On the first mode's **node**, 22.4 % of the way along, the fundamental drops out and the glassy overtones are left.`,
  },
  {
    title: 'The keyboard glockenspiel',
    views: ['Spectrum', 'Spectrogram'],
    preset: 'Keyboard glockenspiel: brass hammers, no boxes',
    play: [run('E5 G5 C6 E6 G6', { step: 0.3, dur: 1 }), chord('C6 E6 G6', { at: 1.8, dur: 3 })],
    text: `Hard brass hammers, thicker bars and no boxes: the celesta's ancestor, the keyboard glockenspiel. A hard, short contact puts energy into the **inharmonic** upper modes, and with no box to drain it the bars ring long: bright, metallic and clangy.

The felt hammers of the celesta touch the bar for longer, which filters out the high modes: that, with the boxes, is its whole sweetness.`,
  },
]);
