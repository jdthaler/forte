// cristal-tour.js — the guided tour of the cristal Baschet's physics (shared/tour.js)
import { tour, note, chord } from '../../shared/tour.js';

export const TOUR = tour('cristal', [
  {
    title: 'Glass rods, steel stems',
    views: ['Resonator', 'Stick and slip'],
    play: [note('C4', { dur: 4.5 }), note('G4', { at: 4.8, dur: 4.5 }), chord('C4 E4 G4', { at: 9.6, dur: 6 })],
    text: `Bernard and François Baschet built the first **cristal** in Paris in 1952: a row of glass rods, each clamped on a steel stem, stroked with wet fingers. The glass does not ring: it is the handle. The finger's friction pulls the rod along its length, and that **bends the stem** it is clamped on, which sets the note.

Hold a key: the finger keeps stroking, and the stem keeps singing.`,
  },
  {
    title: 'Stick, then slip',
    views: ['Stick and slip', 'Resonator'],
    play: [note('A3', { dur: 6 }), note('A4', { at: 6.3, dur: 6 })],
    text: `A wet fingertip on clean glass grips hard while still (a friction coefficient of about 2) and lets go once it slides (0.3): Couineaux, Ablitzer and Gautier fitted that to measurements of fingers on glass.

So the rod rides along with the finger, **stuck**, until the bent stem pulls it back; it **slips**, swings round and catches the finger again, once a cycle. The shaded bands in *Stick and slip* are the stuck moments. The rod's speed swings by about the finger's own.`,
  },
  {
    title: 'A threshold to cross',
    views: ['Rod and finger', 'Stick and slip'],
    play: [note('E4', { dur: 3.5 }), note('E4', { at: 4, dur: 5.5 }), { at: 4, set: { press: 2.5 } }, note('E4', { at: 10, dur: 4 }), { at: 10, set: { press: 10 } }],
    text: `The stem loses a little of its motion every cycle, so the friction's fall has to outrun that loss: the finger must press harder than a **threshold**, 2ζωm·V₀(1 + u/V₀)²/(μs − μd), a few hundredths of a newton for the middle rods.

Just under it, the finger only slides: silence. Just over, the note grows slowly from nothing. Ten times over (the default), it is there in a fraction of a second.`,
  },
  {
    title: 'The stroke is the loudness',
    views: ['Stick and slip', 'Spectrum'],
    play: [note('D4', { dur: 14 }), { at: 4.5, set: { stroke: 0.2 } }, { at: 9, set: { stroke: 0.05 } }],
    text: `As a bow's speed does for a string, the finger's speed sets how far the rod swings, and so how loud it sings: 10 cm/s, then 20, then 5. A faster stroke needs more pressure to speak, so the finger presses harder as it goes faster.

A rod is only 24 cm long: back and forth, the finger turns round every 20 cm, and the tone dips for a moment as the rod reverses.`,
  },
  {
    title: 'Pressing too hard',
    views: ['Stick and slip', 'Spectrogram'],
    play: [note('G3', { dur: 4 }), note('G3', { at: 4.5, dur: 5 }), { at: 4.5, set: { press: 120 } }],
    text: `Press far harder and the finger cannot let go once a cycle any more: the stuck moments grow, slips come irregularly, and the clean tone turns **rough**, crackling and wavering in pitch. Gautier and his colleagues gave the limit after Schelleng's for a bowed string, F = πu√(km)/2(μs − μd), about a hundred times the threshold here.`,
  },
  {
    title: 'Cones, a flame and whiskers',
    views: ['Spectrum', 'Spectrogram'],
    play: [chord('C5 G5 C6', { dur: 15 }), { at: 4.5, set: { radiator: 'cones' } }, { at: 9, set: { radiator: 'both', sway: 1 } }],
    text: `A thin rod and stem barely move the air. Their stems are bolted to the **collector**, a heavy bar that carries the vibration to the radiators. Alone it is faint and thin; the fibreglass **cones**, pistons, bring out the body, and the cut-steel **flame** adds a shimmer of its own modes.

The steel **whiskers** on the collector ring in sympathy where one of their stretching modes meets a harmonic (Couineaux 2025). Swaying, they sweep across them: a sparkle in the highs.`,
    set: { radiator: 'bare', whiskers: 24 },
  },
]);
