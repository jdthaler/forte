// cimbalom-tour.js — the guided tour of the cimbalom's and the dulcimer's physics (shared/tour.js).
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('cimbalom', [
  {
    title: 'A hammer thrown at four strings',
    views: ['Strings and hammer', 'Hammer contact'],
    play: [note('C4', { dur: 2.5, vel: 0.6 }), note('G4', { at: 2.5, dur: 2.5, vel: 0.6 }), note('C5', { at: 5, dur: 3, vel: 0.8 })],
    text: `The cimbalom's player holds two light sticks loosely and throws them at the strings. The hammer is free while it touches them: the strings push it back up within a millisecond or two, and it leaves them ringing.

Each note is a **course** of four steel strings tuned together (three copper-wound in the bass). Watch the string swing between its bridges, and the force of each stroke rise and fall.`,
  },
  {
    title: 'Cotton, leather, wood',
    views: ['Hammer contact', 'Spectrum'],
    set: { head: 'cotton' },
    play: [note('A4', { dur: 2, vel: 0.8 }), { at: 2, set: { head: 'leather' } }, note('A4', { at: 2.1, dur: 2, vel: 0.8 }), { at: 4.1, set: { head: 'wood' } }, note('A4', { at: 4.2, dur: 2.5, vel: 0.8 })],
    text: `The cimbalom's hammers are wound with cotton at the tips; the dulcimer's are often bare wood. A soft face is a soft spring: its force rises gently and stays on the strings longer, and a long, smooth push cannot shake the high partials. Bare wood jumps at once.

The same stroke three times: cotton, leather, bare wood. Watch the force's shape, and the spectrum fill in at the top.`,
  },
  {
    title: 'Four strings, slightly out of tune',
    views: ['Decay', 'Spectrogram'],
    set: { detune: 0, bridge: 3 },
    play: [note('C4', { dur: 6, vel: 0.8 }), { at: 6, set: { detune: 4 } }, note('C4', { at: 6.2, dur: 7, vel: 0.8 })],
    text: `The strings of a course all press on the bridge at one point, and the bridge's motion drives each of them back (Weinreich, 1977). Struck together, they move in step and drain into the bridge **four times as fast** as one string alone. (**Bridge mobility** is turned up here to make it plain; the cimbalom's own is gentler, and its notes ring long.)

In perfect unison the note just fades. Spread them by a few cents and they drift out of step: they stop driving the bridge together, the decay slows and **beats**. Watch the decay's line.`,
  },
  {
    title: 'Where the hammer lands',
    views: ['Strings and hammer', 'Spectrum'],
    set: { strike: 0.5 },
    play: [note('G3', { dur: 2.5, vel: 0.8 }), { at: 2.5, set: { strike: 0.12 } }, note('G3', { at: 2.6, dur: 2.5, vel: 0.8 }), { at: 5.1, set: { strike: 0.04 } }, note('G3', { at: 5.2, dur: 2.8, vel: 0.8 })],
    text: `A stroke at the middle of the string leaves out every partial with a node there, the even ones: a hollow tone. Players strike near a bridge, where nearly every partial gets its share; very near it the short stretch of string throws the hammer off and the fundamental weakens, thin and bright.

The mod wheel moves the strike point while you play.`,
  },
  {
    title: 'The dulcimer: one string, two notes',
    views: ['Strings and hammer', 'Spectrum'],
    preset: 'Hammered dulcimer, bare wood',
    play: [note('A4', { dur: 3, vel: 0.8 }), note('E5', { at: 3, dur: 3, vel: 0.8 }), run('D4 E4 F#4 G4 A4 B4 C#5 D5', { at: 6, step: 0.3, dur: 0.6, vel: 0.7 })],
    text: `The hammered dulcimer's treble bridge divides each string 2 : 3, so its two sides sound **a fifth apart**. Strike one side and the other rings along through the bridge: weakly at its own fundamental, strongly where their partials meet (the struck side's 3rd is the far side's 2nd).

It has no dampers: every string rings on until it dies away.`,
  },
  {
    title: 'Dampers, pedal and the other strings',
    views: ['Spectrogram', 'Strings and hammer'],
    play: [chord('C4 E4 G4', { dur: 1.5, vel: 0.8 }), chord('F4 A4 C5', { at: 1.6, dur: 1.5, vel: 0.8 }), { at: 3.4, pedal: true }, chord('C4 E4 G4', { at: 3.5, dur: 1.5, vel: 0.8 }), chord('F4 A4 C5', { at: 5.1, dur: 1.5, vel: 0.8 }), chord('G3 D4 G4 B4', { at: 6.7, dur: 4, vel: 0.9 })],
    text: `Schunda's concert cimbalom (1874) added a felt damper bar under the strings, which only the **pedal** (Space) lifts. Here a held key keeps its own strings free as well, unless you choose the cimbalom's own way under Dampers.

With the bar up every course is free, and the strings of the other notes ring along with the bridge, sympathetic strings: the haze of lines in the spectrogram around each chord.`,
  },
  {
    title: 'The tremolo',
    views: ['Hammer contact', 'Decay'],
    preset: 'Cimbalom tremolo',
    play: [note('A3', { dur: 3, vel: 0.7 }), chord('D4 F4 A4', { at: 3, dur: 4, vel: 0.6 }), note('E5', { at: 7, dur: 4, vel: 0.8 })],
    text: `A held note on the cimbalom is a tremolo: the two hammers strike it again and again, the hands alternating. Each stroke lands on strings already moving, so no two sound quite alike.

Hold a key and the hammers keep going; aftertouch says how hard.`,
  },
]);
