// saw-tour.js — the guided tour of the musical saw's physics (shared/tour.js): from the bowed
// note, to why it is trapped, to what takes the trap away.
import { tour, note, run } from '../../shared/tour.js';

// legato: each note held a little past the next one's start, so One saw slides between them
const legato = (ks, { at = 0, step = 0.9, vel = 0.6 } = {}) => ks.split(' ').map((k, i) => note(k, { at: at + i * step, dur: step + 0.15, vel }));

export const TOUR = tour('saw', [
  {
    title: 'A bowed blade',
    views: ['The saw', 'Spectrogram'],
    play: [note('A4', { dur: 3.5, vel: 0.6 }), note('E5', { at: 3.8, dur: 3.5, vel: 0.6 })],
    text: `A saw blade, its handle held between the knees and its tip in the fingers, bent into an **S** and bowed on its smooth back edge. The note swells as the bow's stick and slip build it up, then sings nearly as a pure tone: one line in the spectrogram, wavering with the knee's vibrato.

Where does a tone that pure come from, in a flat strip of steel with dozens of ways to vibrate?`,
  },
  {
    title: 'Trapped where the bend turns over',
    views: ['The trap', 'The saw'],
    play: [note('C5', { dur: 4, vel: 0.6 })],
    text: `Bending a curved sheet stretches it, so a curved blade is stiffer to waves that vary across it: the **band edge** (the line) rises on either side of the S's inflection, where the curvature is zero. The note sits in the dip between and cannot run out of it, only fade.

So the mode is **trapped** at the inflection, away from the hands that would soak it up, and rings on (Shankar, Bryde and Mahadevan, 2022).`,
  },
  {
    title: 'Sliding the S plays the scale',
    views: ['The saw', 'The trap'],
    play: run('C4 E4 G4 C5 E5 G5 C6', { step: 1.1, dur: 1, vel: 0.6 }),
    text: `The blade tapers from heel to toe, and a narrower blade is stiffer across, so the trapped mode rings higher there. The player bends the S so that it turns over further toward the tip for each note up: watch the inflection walk along the blade.

Bent tighter, the curvature also lifts the note and squeezes the mode into a narrower band.`,
  },
  {
    title: 'A loose bend leaks',
    views: ['The trap', 'Spectrogram'],
    preset: 'Struck with a felt mallet',
    play: [note('G4', { dur: 3, vel: 0.7 }), { at: 3.2, set: { bend: 2 } }, note('G4', { at: 3.4, dur: 3, vel: 0.7 })],
    text: `Struck with a felt mallet, a well-bent saw rings for seconds. Then the bend is loosened: the dip grows shallow, the mode spreads along the blade until it reaches the knees and the fingers, and the note dies in a moment.

The leak is a **tunnelling** rate (Gamow's): the bounce in the dip times the chance of getting through the curved blade on either side.`,
  },
  {
    title: 'No inflection, no note',
    views: ['The trap', 'The saw'],
    preset: 'Struck with a felt mallet',
    play: [note('D5', { dur: 2.5, vel: 0.7 }), { at: 2.7, set: { shape: 'J' } }, note('D5', { at: 2.9, dur: 2.5, vel: 0.7 })],
    text: `Now the same blade, bent into a **J**: curved one way along its whole length. There is no inflection, so no dip in the band edge and nothing to trap the wave: it runs to the hands, and the strike gives a dull clunk (Shankar and his colleagues measured a Q of about 10, against 150 for the S).

It is the bend's turning over that makes a saw sing.`,
  },
  {
    title: 'The sweet spot',
    views: ['The saw', 'Spectrogram'],
    play: [note('A4', { dur: 3, vel: 0.6 }), { at: 3.2, set: { place: 5 } }, note('A4', { at: 3.4, dur: 3, vel: 0.6 }), note('C6', { at: 6.8, dur: 3, vel: 0.6 })],
    text: `Bowed at the inflection, the bow drives the trapped mode where it moves most. Moved **5 cm** along, it barely moves the mode at all: the A falls silent. High up, the second trapped mode (whose shape changes sign at the inflection) sits close above the note and moves there, so the bow catches it and the C jumps up to it.

Players hunt for the sweet spot with the bow, and follow it along the blade as the note changes.`,
  },
  {
    title: 'One saw, sliding',
    views: ['The saw', 'Spectrogram'],
    preset: 'One saw, sliding from note to note',
    play: legato('E4 A4 C5 B4 A4 E5 D5 C5', { step: 1.05 }),
    text: `A saw is one blade, so it plays one note at a time, and the player gets from note to note by bending: the S slides along and the note slides with it, the saw's famous swoop. **One saw** plays it so: each key held while another is down slides there.

Play a slow tune, and lean on the keys for more bow.`,
  },
]);
