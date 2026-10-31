// blackhole-tour.js — the guided tour of the black-hole keyboard's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('blackhole', [
  {
    title: 'A black hole rings',
    views: ['The black hole', 'Gravitational waves of the last note'],
    play: [run('C3 G3 C4', { step: 1.5, dur: 1.4 }), chord('C3 E3 G3', { at: 4.5, dur: 2 })],
    text: `When two black holes merge, the new one is born lopsided and settles to a smooth Kerr black hole by **ringing**: it radiates gravitational waves at a set of complex frequencies, its **quasinormal modes**, like a struck bell.

Each key is such a ringdown: the remnant of a merger like GW150914 (spin a = 0.69). The pitch scales inversely with the mass, \`f ∝ 1/M\`: a lower key is a heavier hole. The trace is the wave reaching us.`,
  },
  {
    title: 'Two cycles and gone',
    views: ['Spectrogram', 'Gravitational waves of the last note'],
    preset: 'Schwarzschild (a = 0): two cycles and gone',
    play: [note('C4', { dur: 2 }), note('E4', { at: 1.5, dur: 2 }), note('G4', { at: 3, dur: 2 })],
    text: `A black hole is a very poor bell. The dominant mode, (l, m, n) = (2, 2, 0), of a non-spinning hole has a quality factor of about **2**: it is gone within a couple of cycles, its energy pouring out to infinity and into the horizon.

Each note is a brief chirped knock. The overtones (n = 1, 2) are damped faster still and colour only the very start.`,
  },
  {
    title: 'Spin it up',
    views: ['Quasinormal spectrum', 'Spectrogram'],
    preset: 'Rapid spin (a = 0.99)',
    play: [note('C4', { dur: 2.5 }), { at: 2.5, set: { spinU: 4, t0: 10, overtones: 0.4 } }, note('C4', { at: 2.6, dur: 3.5 })],
    text: `A spinning hole drags spacetime round with it. The co-rotating modes **rise** in pitch and ring **longer** as the spin grows: watch the dots climb in the quasinormal spectrum.

As a → 1 the l = m modes slide onto m times the horizon's angular velocity (dashed) and nearly stop damping: a near-extremal hole rings like a real bell, and its modes line up almost as harmonics.`,
  },
  {
    title: 'How it was struck',
    views: ['Modes in this note', 'Quasinormal spectrum'],
    preset: 'Lopsided merger (q = 8): odd modes appear',
    play: [note('C4', { dur: 2.5 }), { at: 2.5, set: { massRatio: 1.2 } }, note('C4', { at: 2.6, dur: 2.5 })],
    text: `Which modes ring depends on the merger. Two nearly equal holes make a remnant symmetric enough that the odd-m modes (like (3,3)) barely appear. A **lopsided** merger, one hole eight times the other, rings them clearly: extra partials, a richer timbre.

So the ringdown's spectrum tells you about the hole *and* how it was made: black-hole spectroscopy.`,
  },
  {
    title: 'Chirp, merger, ringdown',
    views: ['Gravitational waves of the last note', 'Spectrogram'],
    preset: 'Inspiral + merger + ringdown (LIGO chirp)',
    play: [note('C4', { dur: 4 }), note('G3', { at: 4, dur: 4 })],
    text: `The whole event, as LIGO heard it in 2015: two holes spiralling in, the wave's frequency and amplitude **chirping** up as they close, the merger, then the ringdown you have been playing.

The rising sweep is the inspiral; the abrupt end is the remnant settling down.`,
  },
]);
