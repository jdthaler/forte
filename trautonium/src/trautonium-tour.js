// trautonium-tour.js — the guided tour of the trautonium's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('trautonium', [
  {
    title: 'A neon lamp that flashes',
    views: ['Lamps', 'Spectrum'],
    preset: 'The bare lamp (no resonant circuits)',
    play: [note('C3', { dur: 3 }), note('G3', { at: 3, dur: 3 })],
    text: `Friedrich Trautwein's trautonium (1930) makes its tone with a **glow lamp** and a capacitor. The capacitor charges through a resistor until the gas in the lamp strikes (90 V), the lamp discharges it in a flash down to extinction (60 V), and it charges again: a **relaxation oscillator**.

Its voltage is a sawtooth, rich in every harmonic: the bare lamp is buzzy and raw. Pressing the wire at another point changes the resistance, and so the pitch.`,
  },
  {
    title: 'Formants: a voice that keeps its vowel',
    views: ['Circuits', 'Spectrogram'],
    preset: 'Vowel “oo” (300 and 800 Hz)',
    play: [run('C3 E3 G3 C4', { step: 0.7, dur: 0.65 }), { at: 2.9, set: { f1: 300, f2: 2300, q1: 10, q2: 12, g2: 0.8, dry: 0.15 } }, run('C3 E3 G3 C4', { at: 3, step: 0.7, dur: 0.65 })],
    text: `The sawtooth rings **resonant circuits** that stay where their capacitors tune them, whatever note is played. The harmonics that fall under a peak come out loud.

So as the note moves, different harmonics light up but the peaks stay put, as a voice keeps its **vowel** on every pitch: "oo", then "ee". This is subtractive synthesis, decades before synthesizers.`,
  },
  {
    title: 'Undertones: the Mixtur',
    views: ['Lamps', 'Spectrogram'],
    play: [note('C4', { dur: 9 }), { at: 1.5, set: { sub1: 0.7 } }, { at: 3, set: { sub2: 0.55 } }, { at: 4.5, set: { sub3: 0.45 } }, { at: 6, set: { sub4: 0.35 } }],
    text: `Oskar Sala's Mixtur-Trautonium adds lamps that fire on every 2nd, 3rd, 4th and 5th flash of the main one. Each divider's capacitor charges too slowly to fire alone; the master's flash **kicks** it, and when it is close enough to striking, it fires in step.

One held C4 with ÷2, ÷3, ÷4 and ÷5 added one by one: the **subharmonic** series, f/2, f/3, f/4, f/5, a chord built downward, the mirror of the harmonics.`,
  },
  {
    title: 'Weak sync: dividers that slip',
    views: ['Lamps', 'Spectrogram'],
    preset: 'Weak sync: the dividers slip',
    play: [note('C4', { dur: 7 })],
    text: `With only a small kick from the master, a divider whose own rate doesn't quite match can't be pulled into step: it fires on its own and **slides past**, a little flat of its undertone, and beats against it.

That is frequency locking failing, the same physics as Huygens's clocks: watch a divider in the Lamps view drift through the sync band.`,
  },
  {
    title: 'One wire, sliding',
    views: ['Spectrogram', 'Circuits'],
    preset: 'One wire, sliding between keys',
    play: [note('C3', { dur: 1.1 }), note('E3', { at: 1, dur: 1.1 }), note('G3', { at: 2, dur: 1.1 }), note('C4', { at: 3, dur: 2.5 })],
    text: `On the real instrument the player presses a resistance **wire** against a metal rail, anywhere along it: the pitch moves continuously, like a violin's fingerboard. Played legato, the note **slides** between the keys.

Watch the spectrogram: every harmonic bends together while the circuits' bands stay where they are. (Sala's Mixtur-Trautonium made the bird sounds of Hitchcock's *The Birds*.)`,
  },
]);
