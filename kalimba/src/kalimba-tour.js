// kalimba-tour.js — the guided tour of the kalimba's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('kalimba', [
  {
    title: 'A plucked steel tine',
    views: ['The tine', 'Spectrum'],
    play: [run('C4 E4 G4 C5 G4 E4', { step: 0.4, dur: 2 })],
    text: `A kalimba's tine is a steel strip clamped at one end, pressed over a bridge, and free at the tip: a **cantilever**. The thumb pushes the tip down and lets it go, and the tine swings from that bent shape (slow motion in the view).

A clamped–free bar's first overtone sits about **6.27 times** the fundamental, nowhere near a harmonic: the bright, slightly out-of-tune ping at the start of each note, which fades in moments while the fundamental rings on.`,
  },
  {
    title: 'Behind the bridge',
    views: ['The tine', 'Spectrum'],
    preset: 'Clamped at the bridge (6.27)',
    play: [note('C5', { dur: 2 }), { at: 2, set: { back: 1.12 } }, note('C5', { at: 2.1, dur: 2 }), { at: 4.1, set: { back: 1 } }, note('C5', { at: 4.2, dur: 2 })],
    text: `The tine doesn't stop at the bridge: the part behind it, up to the clamp, moves too, and its length sets where the overtones fall.

Clamped right at the bridge the overtone is at 6.27; with the usual back length (the second note) it moves down to about 5.6. With the back **as long as the front**, the overtone lands on the **9th harmonic** and blends into the note.`,
  },
  {
    title: 'Nail or flesh',
    views: ['Spectrogram', 'The tine'],
    preset: 'Thumbnail ping',
    play: [run('C5 A4 G4 E4', { step: 0.5, dur: 1.5 }), { at: 2.2, set: { thumb: 2.5 } }, run('C5 A4 G4 E4', { at: 2.3, step: 0.5, dur: 1.5 })],
    text: `A hard thumbnail lets go of the tine in an instant, and a sharp release excites every mode. The soft flesh of the thumb releases it gently over a few milliseconds, too slowly for the high modes to follow: **only the fundamental** sounds.

Kalimba players move between the two to colour a phrase.`,
  },
  {
    title: 'The box and its sound hole',
    views: ['The box', 'Spectrum'],
    play: [note('C4', { dur: 6 }), { at: 1.5, set: { cover: 0.5 } }, { at: 3, set: { cover: 1 } }, { at: 4.5, set: { cover: 0 } }],
    text: `The tines sit on a hollow box. Its lowest resonance is the air bouncing in and out of the sound hole, a **Helmholtz resonator**, the low hump in the box view; the next is the top plate's first mode.

As a finger slides over the hole its opening shrinks, the air's resonance **slides down and fades**, and the note goes *wah*.`,
  },
  {
    title: 'Mbira with bottle caps',
    views: ['Spectrogram', 'The box'],
    preset: 'Mbira with bottle caps',
    play: [run('C4 E4 G4 C5', { step: 0.45, dur: 1.5, vel: 0.15 }), run('C4 E4 G4 C5', { at: 2.5, step: 0.45, dur: 1.5, vel: 0.95 })],
    text: `The Zimbabwean mbira has bottle caps or shells fixed loosely to it. Played softly, they lie still. Played hard, the vibration throws them off their seats and they rattle against the wood: a burst of **buzz** high in the spectrum.

The buzz is not noise added for effect: it is a contact that opens and closes, a strongly nonlinear system, which is why it switches on only above a threshold.`,
  },
]);
