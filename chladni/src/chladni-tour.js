// chladni-tour.js — the guided tour of the Chladni Plate's physics (shared/tour.js)
import { tour, note, run } from '../../shared/tour.js';

export const TOUR = tour('chladni', [
  {
    title: 'A plate under a bow',
    views: ['Plate', 'Spectrum'],
    play: [note('A4', { dur: 5, vel: 0.6 }), note('E5', { at: 5.3, dur: 4.5, vel: 0.6 })],
    text: `In 1787 Ernst Chladni held a brass plate by its centre, scattered sand on it and drew a violin bow down its edge. The rosined hair **sticks** to the edge and drags it along until the plate's spring tears it free; it slips back and is caught again, once a cycle, for as long as the key is held.

Watch the sand: it is thrown off wherever the plate shakes harder than gravity, and comes to rest on the **nodal lines**, which stay still. Here, the diagonals.`,
  },
  {
    title: 'A finger on a node',
    views: ['Plate', 'Spectrogram'],
    play: [note('A4', { dur: 4, vel: 0.6 }), { at: 4.3, set: { finger: false } }, note('A4', { at: 4.5, dur: 5, vel: 0.6 })],
    text: `A bow on the edge drives every mode that moves there. Chladni chose one by resting a finger on one of its nodal lines: that mode does not move under the finger, so it loses nothing, while its rivals are damped. The two circles are the fingertips.

Lift them (the second note) and a lower mode takes the bow: the note drops more than an octave and the sand runs to a single line through the clamp.`,
  },
  {
    title: 'A threshold, then a swell',
    views: ['Plate', 'Spectrogram'],
    set: { force: 1.3 },
    play: [note('E4', { dur: 5, vel: 0.4 }), { at: 5.3, set: { force: 4 } }, note('E4', { at: 5.5, dur: 4, vel: 0.7 })],
    text: `Friction that falls as the hair slides faster pushes the plate on, like negative damping. It wins only once the bow presses harder than a **threshold**, where it just outweighs the plate's own losses; **Bow force** is set in multiples of it.

Just above, the note swells in slowly from nothing. At four times the threshold (the second note) it speaks at once.`,
  },
  {
    title: 'The bow moved along the edge',
    views: ['Plate', 'Spectrum'],
    play: [note('A4', { dur: 3.5, vel: 0.7 }), { at: 3.8, set: { shift: 0.7 } }, note('A4', { at: 4, dur: 4, vel: 0.7 })],
    text: `The bow sits where the figure swings hardest and its rivals least. Set it down further along the edge (the mod wheel) and another mode, one that swings more there, takes it: the same key now sounds **3.5 times higher**, a mode of the plate, not a harmonic of the note.

A note already sounding keeps its figure as the bow moves; a mode that has the bow holds on to it.`,
  },
  {
    title: 'Ten figures, one keyboard',
    views: ['Figures', 'Plate'],
    play: [note('C5', { dur: 3.5 }), { at: 3.7, set: { figure: 1 } }, note('C5', { at: 3.9, dur: 3.5 }), { at: 7.6, set: { figure: 8 } }, note('C5', { at: 7.8, dur: 3.5 })],
    text: `The Figures view draws the nodal lines of the plate's ten figures, with each one's pitch over its lowest mode: the diagonals 2.56 times it, the cross 1.75, the ring 12.

Each key's plate is cut to size so the chosen figure sounds the key's note: a higher figure needs a bigger plate for the same pitch. So the same C5 draws the diagonals, then the cross, then a ring.`,
  },
  {
    title: 'Big plates are slow',
    views: ['Plate', 'Spectrogram'],
    play: [note('A2', { dur: 6, vel: 0.6 }), note('A5', { at: 6.3, dur: 3, vel: 0.6 })],
    text: `A2's plate is 42 cm across against A4's 10.5, and it needs about as many of its own cycles to build up as a small one, so it takes a second or more to speak, as a big plate under a bow does. A5's speaks at once.`,
  },
  {
    title: 'Chladni\'s glass',
    views: ['Plate', 'Spectrum'],
    preset: 'Glass plate (Chladni’s)',
    play: [{ at: 0, pedal: true }, run('E4 A4 C5 E5', { step: 1.4, dur: 1.2, vel: 0.6 }), { at: 7.5, pedal: false }],
    text: `Chladni's own plates were often glass. Glass is stiffer than brass for its weight, and these are thicker, so each note's plate is bigger (17 cm across at A4), and it rings for longer once the bow lifts: here the pedal keeps the hand off, and each plate rings on under the next.`,
  },
]);
