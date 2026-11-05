// gamelan-tour.js — the guided tour of the gamelan's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('gamelan', [
  {
    title: 'Bronze bars over bamboo',
    views: ['The gamelan', 'Spectrum'],
    set: { ombak: 0 },
    play: [run('C4 D4 E4 G4 A4 C5', { step: 0.5, vel: 0.7 }), note('C4', { at: 3.2, dur: 3, vel: 0.7 })],
    text: `A **gangsa**: thick bars of high-tin bronze, each hung on cords over a bamboo tube closed at the bottom and a quarter of a wavelength long at the bar's note. The bar alone is a poor loudspeaker at its note (the air slips round its edges); the tube takes the note up, louder and shorter.

Its overtones are a bar's, at about 2.7 and 5.2 times the note and none of them harmonic: in the spectrum they sit between the harmonics.`,
  },
  {
    title: 'Pélog and sléndro',
    views: ['The gamelan', 'Mode table'],
    set: { ombak: 0 },
    play: [run('C4 D4 E4 F4 G4 A4 B4 C5', { step: 0.42, vel: 0.65 }), run('C#4 D#4 F#4 G#4 A#4 C#5', { at: 3.8, step: 0.5, vel: 0.65 })],
    text: `A gamelan comes in two sets of instruments in two scales that fit no twelve equal notes. **Pélog**, on the white keys, has seven unequal steps, small ones and two large; here it is the subset of nine equal steps an octave that Javanese gamelans lean to. **Sléndro**, on the black keys, has five nearly equal steps of about 240 ¢.

The two sets share a tone (here pélog 6 on A and sléndro 6 on G♯), so they can play together.`,
  },
  {
    title: 'The pair’s shimmer: ombak',
    views: ['Ombak', 'Spectrogram'],
    set: { ombak: 0, damping: 'ring' },
    play: [note('A4', { dur: 3, vel: 0.8 }), { at: 3.2, set: { ombak: 6 } }, note('A4', { at: 3.3, dur: 4, vel: 0.8 })],
    text: `In Bali every metallophone comes in a pair: one, the *pengumbang*, tuned a little low, its partner the *pengisep* a little high. Struck together, the two notes drift in and out of step, and the sound swells and fades at their difference: the **ombak**, the "wave".

First one bar, then the pair 6 Hz apart. Watch the two arrows turn against each other, and the level pulse six times a second.`,
  },
  {
    title: 'The same beat all the way up',
    views: ['Ombak', 'The gamelan'],
    set: { ombak: 6, damping: 'ring' },
    play: [note('A2', { dur: 2.5, vel: 0.8 }), note('A4', { at: 2.6, dur: 2.5, vel: 0.8 }), note('A6', { at: 5.2, dur: 2.5, vel: 0.8 })],
    text: `The pairs are tuned to beat the same number of times a second in every register. So the partners are far apart in cents at the bottom (6 Hz on a 110 Hz note is almost a hundred cents) and close together at the top (6 ¢ on 1760 Hz).

The pulse keeps its pace from low to high: an ensemble shimmering together.`,
  },
  {
    title: 'The damping hand',
    views: ['The gamelan', 'Spectrogram'],
    set: { ombak: 5 },
    play: [run('C5 D5 E5 G5 E5 D5 C5', { step: 0.35, vel: 0.7 }), { at: 2.7, set: { damping: 'ring' } }, run('C5 D5 E5 G5 E5 D5 C5', { at: 2.8, step: 0.35, vel: 0.7 })],
    text: `Bronze rings for seconds, so a player stops each bar with the other hand as the next is struck, and a melody stays clear. Then the same phrase with nothing stopping the bars: they ring into one another, a wash.

Space (or the pedal) lifts the hand, as a pedal lifts a piano's dampers.`,
  },
  {
    title: 'Thick bars, struck off the axis',
    views: ['Mode shapes', 'Spectrum'],
    preset: 'Javanese saron (no pairs)',
    set: { along: 0, across: 0, damping: 'ring' },
    play: [note('E4', { dur: 2.5, vel: 0.9 }), { at: 2.6, set: { along: 0.6, across: 0.8 } }, note('E4', { at: 2.7, dur: 3, vel: 0.9 })],
    text: `A **saron**'s bars rest on a wooden trough, without tubes, and are thick: a Timoshenko beam, its overtones pulled down by shear and the turning of its slices (2.74 instead of a thin bar's 2.76, and lower still up the keyboard, where the bars are shorter).

Struck at its centre, the second bending mode (a node there) is silent and the note is pure. Struck near the end and off to one side, the bar also **twists**: its torsion modes ring between the bending ones.`,
  },
  {
    title: 'A gong’s own beat',
    views: ['Spectrogram', 'Mode shapes'],
    preset: 'Gong ageng: its own slow beat',
    play: [note('A0', { dur: 7, vel: 1 }), { at: 7.2, set: { curvature: 0 } }, note('A0', { at: 7.3, dur: 6, vel: 1 })],
    text: `A **gong ageng** hangs alone, yet it throbs. Its face is curved, so struck hard it pushes back harder one way than the other, and its note makes its own second harmonic. The smith leaves the gong's second round mode a little below twice the note (on the Balinese gong Krueger and colleagues measured, 121.25 Hz against 2 × 61.75), and the two beat a couple of times a second.

Then the same gong with a flat, linear face: no harmonic, and no throb.`,
  },
  {
    title: 'The whole gamelan',
    views: ['The gamelan', 'Spectrogram'],
    preset: 'The whole gamelan, by register',
    play: [
      run('A4 G4 E4 D4 E4 G4 A4 C5', { step: 0.45, vel: 0.7 }),
      run('A5 G5 E5 D5 E5 G5 A5 C6', { step: 0.45, vel: 0.55 }),
      note('E2', { at: 1.8, dur: 2, vel: 0.7 }), note('C2', { at: 3.6, dur: 2, vel: 0.7 }),
      chord('C1', { at: 3.6, dur: 6, vel: 1 }),
    ],
    text: `Each octave is one instrument of a Javanese gamelan: the great gong and the kempul at the bottom, then the slenthem over its tubes, the demung, the saron and the peking, each an octave above the last, and each with its own player's damping hand.

The bars play the melody in octaves, the kempul marks the phrase, and the gong ageng closes it.`,
  },
]);
