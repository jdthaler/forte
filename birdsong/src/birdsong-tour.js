// birdsong-tour.js — the guided tour of the syrinx's physics (shared/tour.js): the labia's two
// onsets, the breath, the gestures that make syllables, and the vocal tract.
import { tour, note, run } from '../../shared/tour.js';

export const TOUR = tour('birdsong', [
  {
    title: 'One oscillator, one bird',
    views: ['Pressure and tension', 'Labia'],
    play: [note('C6', { dur: 2, vel: 0.7 }), note('G5', { at: 2.2, dur: 1.6, vel: 0.7 }), note('E6', { at: 4, dur: 2.5, vel: 0.8 })],
    text: `A songbird sings with its **syrinx**, where the windpipe forks: air from the air sacs pushes between two folds of tissue, the **labia**, and sets them swinging, as your lips buzz on a trumpet. Mindlin's group reduced their motion to one equation with two knobs: the air sac pressure **α** and the labial tension **β**.

The dot in *Pressure and tension* is the note's breath; above the line the labia swing. The loop in *Labia* is the swing they settle into: a small, round loop, so a pure whistle.`,
  },
  {
    title: 'Born at zero frequency',
    views: ['Pressure and tension', 'Labia', 'Spectrogram'],
    preset: 'Zebra finch: born at zero frequency (SNILC)',
    set: { inhale: 0.06 },
    play: [note('C4', { dur: 1.6, vel: 0.8 }), note('C4', { at: 2, dur: 1.6, vel: 0.4 }), note('G4', { at: 4, dur: 2, vel: 0.9 })],
    text: `Slacken the labia (tension below **¼**) and the onset changes kind. Past the **Hopf** line a swing grows from nothing at a finite frequency. Past this **saddle-node** it starts at full size and **zero frequency**: a few slow clicks that run up into the note, as the dot crosses the dashed line.

The loop is now lopsided: the labia crawl past the ghost of the fixed points they lost and snap back, once a period. That pulse is rich in harmonics, the buzz of a zebra finch (Sitt and colleagues, 2008).`,
  },
  {
    title: 'Harder breath, higher note',
    views: ['Pressure and tension', 'Spectrogram'],
    set: { inhale: 0.2 },
    play: [note('A5', { dur: 2.4, vel: 0.15 }), note('A5', { at: 2.6, dur: 2.4, vel: 1 }), { at: 5.2, set: { drive: 0.4 } }, note('A5', { at: 5.4, dur: 3, vel: 1 })],
    text: `Every key is tuned at the pressure its velocity gives, but a breath that rises slowly shows what pressure does: the note slides up into its pitch as the labia swing wider and faster. A soft note and a hard one land on the same pitch; the hard one is louder and its swing fuller.

Then the pressure is turned up four times: the pitch climbs with it, as in a real bird, and every key is retuned to match.`,
  },
  {
    title: 'Trills: a mini-breath a syllable',
    views: ['Spectrogram', 'Pressure and tension'],
    preset: 'Canary trill: a mini-breath a syllable',
    play: [note('D6', { dur: 2.5, vel: 0.8 }), note('A5', { at: 2.8, dur: 2.5, vel: 0.8 }), { at: 5.4, set: { rate: 24, duty: 0.5 } }, note('F#6', { at: 5.5, dur: 3, vel: 0.9 })],
    text: `A canary repeats one syllable through a phrase, up to some 30 times a second: faster than it can breathe, so it takes a quick **mini-breath** between syllables (Hartley and Suthers, 1989). Each syllable is a fresh onset: the dot rises past the line and drops back.

In the spectrogram a trill is a row of identical marks. The last note trills at 24 a second.`,
  },
  {
    title: 'Sweeps: the tension moves',
    views: ['Spectrogram', 'Pressure and tension'],
    preset: 'Upsweeps',
    play: [note('G5', { dur: 3, vel: 0.85 }), { at: 3.2, set: { syllable: 'down' } }, note('C6', { at: 3.3, dur: 3, vel: 0.85 }), { at: 6.5, set: { syllable: 'warble', rate: 9, sweep: 0.35 } }, note('E5', { at: 6.6, dur: 3, vel: 0.85 })],
    text: `The syringeal muscles stretch the labia as the breath goes, so a syllable can slide: the dot moves sideways across the plane while it sings. Gardner, Mindlin and colleagues (2001) rebuilt whole canary songs from such simple paths, one per syllable type: here upsweeps, downsweeps, then a warble that rocks the tension on one breath.`,
  },
  {
    title: 'The trachea and the mouth',
    views: ['Vocal tract', 'Spectrum'],
    preset: 'Zebra finch: born at zero frequency (SNILC)',
    play: [run('C4 G4 C5', { step: 1.2, dur: 1.1, vel: 0.8 }), { at: 4, set: { track: true } }, run('C4 G4 C5', { at: 4.2, step: 1.2, dur: 1.1, vel: 0.8 })],
    text: `The labia's pulse goes up the **trachea**, a tube resonant at c/4L and its odd multiples, then through the throat and upper oesophagus (the **OEC**), a resonator that radiates from the beak. A fixed one picks out whichever harmonics fall near it.

Songbirds widen and narrow that cavity to keep it on the note they sing (Riede and colleagues, 2006). Halfway through, the mouth follows the note, and the same buzzy labia come out as a whistle.`,
  },
  {
    title: 'A dawn chorus',
    views: ['Spectrogram'],
    preset: 'Canary trill: a mini-breath a syllable',
    play: [note('E6', { dur: 4, vel: 0.7 }), { at: 1, set: { rate: 16 } }, note('B6', { at: 1, dur: 3, vel: 0.6 }), { at: 4.2, set: { syllable: 'down', rate: 4, duty: 0.8 } }, note('G6', { at: 4.3, dur: 3, vel: 0.8 }), { at: 7.5, set: { syllable: 'whistle' } }, note('C6', { at: 7.6, dur: 1.5, vel: 0.6 }), note('E6', { at: 9.2, dur: 2.5, vel: 0.7 })],
    text: `Each key is a bird of its own, so a chord is a flock. Hold a few keys high on the keyboard, where real songbirds sing, and try the syllables, the tension and the mouth. The mod wheel speeds the trills; aftertouch is a harder breath, so it sharpens a note as a real bird's pressure does.`,
  },
]);
