// clavichord-tour.js — the guided tour of the clavichord's physics (shared/tour.js)
import { tour, note, run } from '../../shared/tour.js';

// a short phrase in D minor, the last note held
const phrase = (at = 0) => [run('D5 F5 E5 D5 C#5 D5', { at, step: 0.45 }), note('A4', { at: at + 2.7, dur: 2.2 })];

export const TOUR = tour('clavichord', [
  {
    title: 'A tangent that stays',
    views: ['Strings and tangent', 'Spectrum'],
    play: [phrase(0), note('D3', { dur: 4.9, vel: 0.45 })],
    text: `Each key ends in a brass **tangent**. It strikes the pair of strings and **stays on them**: it is the end of the speaking length, from the bridge to the tangent, for as long as the key is down. The rest of the string, beyond it, is muffled by the **listing** cloth.

Because the tangent strikes at the very end of the speaking length, it starts every partial at once (the markers in the spectrum). Watch the tangent hold the string up while a key is held.`,
  },
  {
    title: 'Press harder, play sharper',
    views: ['Strings and tangent', 'Pitch and pressure'],
    play: [note('G4', { dur: 9 }), { at: 2.5, set: { press: 1.6 } }, { at: 4.5, set: { press: 2.8 } }, { at: 6.5, set: { press: 0.35 } }],
    text: `The tangent rests where the strings' pull balances the finger: press harder and it lifts them further, **stretching** them, and the note goes **sharp**. Lighter, it goes flat and thin.

Here the finger presses ever harder, then barely at all: watch the tangent rise and the pitch follow (about ½·ΔT/T). With aftertouch on a MIDI keyboard you do it yourself.`,
  },
  {
    title: 'The Bebung',
    views: ['Pitch and pressure', 'Spectrogram'],
    play: [note('A4', { dur: 9.5 }), { at: 2.5, set: { bebung: 0.3 } }, { at: 5.5, set: { bebung: 0.6, rate: 6.5 } }],
    text: `Rock the finger on a held key and the pitch wavers with it: the **Bebung**, the clavichord's own vibrato, which no other keyboard of its day could make. C. P. E. Bach taught it for long, expressive notes.

First the note still, then a gentle Bebung, then a deeper, quicker one (the mod wheel sets how deep).`,
  },
  {
    title: 'Key up, and the listing',
    views: ['Strings and tangent', 'Spectrogram'],
    play: [run('D4 F4 A4 D5', { step: 0.6, dur: 0.35 }), { at: 2.7, set: { listing: 0.03 } }, run('D4 F4 A4 D5', { at: 3, step: 0.6, dur: 0.35 })],
    text: `Let a key go and the tangent drops away: for an instant the **whole string**, bridge to hitchpin, rings, then the listing stops it. That soft flick is every clavichord note's end.

Then the listing is thinned almost away: the afterlengths ring at their own pitches beside each note, and each release rings on.`,
  },
  {
    title: 'Fretted: neighbours share',
    views: ['Strings and tangent', 'Spectrum'],
    preset: 'Double-fretted: neighbouring keys share strings',
    play: [note('C5', { dur: 4 }), run('C#5 C#5 C#5 C#5 C#5 C#5', { at: 0.6, step: 0.5, dur: 0.25, vel: 0.5 })],
    text: `On a **fretted** clavichord, neighbouring keys such as C and C♯ share one pair of strings, their tangents a semitone apart along it. The tangent nearer the bridge wins, so the two can't sound together.

Hold C and trill on C♯: each C♯ takes the strings, and each time it lets go, C's tangent is still there and speaks again, softly.`,
  },
  {
    title: '4′ strings in the bass',
    views: ['Spectrum', 'The course'],
    preset: '4′ strings in the bass',
    play: [run('D2 F2 A2 D3', { step: 0.7, dur: 0.65 }), { at: 2.9, set: { octave: false } }, run('D2 F2 A2 D3', { at: 3, step: 0.7, dur: 0.65 })],
    text: `Some large clavichords, such as Hieronymus Albrecht Hass's, add a third string an octave up to each bass key, struck by the same tangent: a brighter, fuller bass. First with them, then without.`,
  },
]);
