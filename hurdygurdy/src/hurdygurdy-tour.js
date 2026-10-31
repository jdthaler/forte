// hurdygurdy-tour.js — the guided tour of the hurdy-gurdy's physics (shared/tour.js)
import { tour, note, run } from '../../shared/tour.js';

const tune = (at = 0) => [note('G4', { at, dur: 0.55 }), note('A4', { at: at + 0.6, dur: 0.55 }), note('B4', { at: at + 1.2, dur: 0.55 }), note('C5', { at: at + 1.8, dur: 0.55 }), note('D5', { at: at + 2.4, dur: 1.1 })];

export const TOUR = tour('hurdygurdy', [
  {
    title: 'A wheel for a bow',
    views: ['Wheel and strings', 'Spectrum'],
    play: [tune(0), tune(3.8)],
    text: `A rosined **wheel**, turned by a crank, bows every string that touches it. The melody strings, the **chanterelles**, run through a keybox: a key's tangent stops them, making them shorter, while the **drones** at the sides sound on and on.

Each string sticks to the wheel and slips back once a period, Helmholtz motion as on a violin. The missing harmonics near multiples of 1/β mark where the wheel touches the string.`,
  },
  {
    title: 'The buzzing bridge',
    views: ['Chien', 'Crank'],
    preset: 'Une traînée: crank fast, a long buzz',
    set: { crank: 0.6 },
    play: [note('D5', { dur: 9 }), { at: 2, set: { crank: 1.2 } }, { at: 4, set: { crank: 1.8 } }, { at: 6, set: { crank: 2.4 } }],
    text: `The **trompette** string runs over a loose little bridge, the *chien* (dog), held down by a tuning string, the *tirant*. The trompette's pull on it is a sawtooth, once a period, as it sticks and slips.

Crank faster and that pull grows. Past a **threshold** it beats the tirant: the chien lifts and lands once a period, then rattles. Nothing, nothing, then clicks, then a buzz.`,
  },
  {
    title: 'Coups: rhythm from the wrist',
    views: ['Crank', 'Spectrogram'],
    preset: 'Bourrée: two coups a turn',
    play: [tune(0), tune(3.8)],
    text: `Players keep the crank just below the threshold and give it a **coup**, a jerk of the wrist, at chosen points in each turn. Each surge carries the speed across the line, and the chien buzzes for an instant.

Here two coups a turn: a bourrée. The Crank view shows each surge crossing the dashed threshold; the spectrogram, each as a band of buzz.`,
  },
  {
    title: 'Sec and gras',
    views: ['Chien', 'Spectrogram'],
    preset: 'Sec: a tight tirant, hard coups',
    play: [tune(0), { at: 3.6, set: { tirant: 2.1, coup: 0.3 } }, tune(3.7)],
    text: `The tirant sets the threshold. **Tight** (sec, dry), only a hard coup cracks the chien: short, sharp clicks. **Loose** (gras, fat), every surge buzzes, long and full.

Players tune the tirant to the music and to the room, a turn of a peg at a time.`,
  },
  {
    title: 'Too slow for the top',
    views: ['Spectrum', 'Spectrogram'],
    preset: 'Slow crank: the top notes crunch',
    play: [run('G5 A5 B5 D6 G6', { step: 0.6, dur: 0.6 })],
    text: `Bowing works only in Schelleng's window: the force must suit the speed. A short, high string under the same wheel pressure needs a faster wheel; cranked slowly, the force is **too great for the speed** and the top notes crunch, a raucous, aperiodic grind.`,
  },
]);
