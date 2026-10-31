// resonator-tour.js — the guided tour of the Magnetic Resonator Piano's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('resonator', [
  {
    title: 'Notes grown from silence',
    views: ['Strings', 'Swell'],
    preset: 'Grown from silence',
    play: [chord('C3 G3 C4 E4', { dur: 5, vel: 0.7 }), chord('F3 A3 C4 F4', { at: 5.2, dur: 5, vel: 0.7 })],
    text: `Andrew McPherson's Magnetic Resonator Piano (2009) hangs an **electromagnet** over the strings of every note of a grand. No hammer strikes here: a pickup on the soundboard hears the strings, a filter picks out the note, and the coil pulls the strings **in step with their own motion**, a little more each cycle.

So the note swells out of nothing and holds as long as the key is down. Watch the string under the glowing coil, and the current and the swing grow together in the Swell view.`,
  },
  {
    title: 'Struck, then sustained',
    views: ['Strings', 'Swell'],
    preset: 'Struck, then sustained',
    set: { drive: 0 },
    play: [run('C4 E4 G4', { step: 0.4, dur: 1.6 }), note('C5', { at: 1.2, dur: 2.6 }),
      { at: 4.3, set: { drive: 0.5 } },
      run('C4 E4 G4', { at: 4.5, step: 0.4, dur: 1.6 }), note('C5', { at: 5.7, dur: 3.5 })],
    text: `The hammers still work. First the coils are off: a plain piano, each note dying away while its key is held.

Then the same phrase with the coils on: the hammer gives the attack, and the coil takes over the note it struck and **holds it**, a piano that sustains like an organ.`,
  },
  {
    title: 'The bass takes seconds',
    views: ['Swell', 'Strings'],
    preset: 'Grown from silence',
    set: { attack: 0.02 },
    play: [note('C2', { dur: 7, vel: 0.9 }), note('C6', { at: 7.5, dur: 3, vel: 0.9 })],
    text: `A heavy bass string stores a lot of energy for each millimetre it swings, and loses it slowly, so a coil with a few newtons to give takes **seconds** to fill it: C2 swells for a long time even with the drive full on at once.

A light treble string fills in a few cycles: C6 speaks almost as fast as it is struck.`,
  },
  {
    title: 'One harmonic alone',
    views: ['Spectrum', 'Coil'],
    preset: 'Octave harmonic',
    set: { harmonic: '1' },
    play: [note('C3', { dur: 2.3, vel: 0.8 }),
      { at: 2.45, set: { harmonic: '2' } }, note('C3', { at: 2.5, dur: 2.3, vel: 0.8 }),
      { at: 4.95, set: { harmonic: '3' } }, note('C3', { at: 5, dur: 2.3, vel: 0.8 })],
    text: `The filter in the loop can listen for any **partial** of the string instead of the first, and the coil then drives that one alone: the same key sounds its fundamental, then its octave, then its twelfth, each a pure tone with the string vibrating in two or three halves.

In the spectrum one peak stands up at a time. A stiff string's partials are a little sharp of whole multiples, and the loop follows the string, not the keyboard.`,
  },
  {
    title: 'A partial on the coil’s node',
    views: ['Coil', 'Strings'],
    preset: '4th harmonic on its node (C4)',
    play: [note('C4', { dur: 4, vel: 0.8 }), note('C3', { at: 4.5, dur: 4, vel: 0.8 })],
    text: `A coil can only push a partial where that partial moves. At C4 the coil sits a quarter of the way along the string, exactly on a **node** of the 4th partial: the coil pulls, the string doesn't move there, and the note will not speak.

At C3 the coil hangs at a fifth of the length, where the 4th partial swings freely, so the same harmonic grows at once. McPherson found these dead partials on the real instrument. The Coil view shows how much each partial moves under the coil.`,
  },
  {
    title: 'Locked to the string',
    views: ['Swell', 'Spectrum'],
    preset: 'Open loop, beating',
    play: [note('A3', { dur: 4.2, vel: 0.8 }), { at: 4.4, set: { loop: 'pll' } }, note('A3', { at: 4.5, dur: 4.5, vel: 0.8 })],
    text: `With the loop open, the coil is fed a steady oscillator at the keyboard's pitch. The note's two or three strings are tuned slightly apart, so they **beat** against it and against each other, and the note wavers.

With the **phase-locked loop**, the drive follows what the pickup hears: the strings settle on one frequency of their own and the coil pushes exactly when they move toward it. The cents trace in the Swell view goes flat when it locks.`,
  },
  {
    title: 'Bowed by noise',
    views: ['Strings', 'Spectrogram'],
    preset: 'Bowed (noise)',
    play: [chord('D3 A3 F4', { dur: 6, vel: 0.8 }), chord('C3 G3 E4', { at: 6.2, dur: 6, vel: 0.8 })],
    text: `Fed **noise** instead of a tone, the coil gives the strings random pushes in the band around the note. Each string still picks out its own partials from them, so the chord comes out breathy and moving, between a bowed string and the wind.

Try the harmonic and drive waveform controls, and the brightness on the mod wheel, with the keys held.`,
  },
]);
