// tines-tour.js — the guided tour of the tine piano's physics (shared/tour.js)
import { tour, note, chord } from '../../shared/tour.js';

export const TOUR = tour('tines', [
  {
    title: 'A tuning fork with one thin prong',
    views: ['Slow motion: tine, tone bar, pickup', 'Spectrum'],
    play: [note('A3', { dur: 3, vel: 0.5 }), chord('C4 E4 G4 B4', { at: 3, dur: 3.5, vel: 0.5 })],
    text: `Harold Rhodes's piano: a hammer strikes a thin steel **tine**, clamped at one end to a heavy brass **tone bar**. Together they make an asymmetric tuning fork: the tone bar, tuned to the tine, stores energy and sends it back, so the note sustains.

The tip of the tine swings in front of a magnetic **pickup**, a coil round a magnet: the slow motion shows tine, bar and pickup.`,
  },
  {
    title: 'The bell of the attack',
    views: ['Spectrogram', 'Spectrum'],
    preset: 'Bell — strike right at the clamp',
    play: [note('C4', { dur: 3, vel: 0.6 }), { at: 3, set: { strike: 8, hfLoss: 0.7 } }, note('C4', { at: 3.1, dur: 3, vel: 0.6 })],
    text: `A cantilever's second mode sits far from any harmonic, near **8 times** the fundamental on a Rhodes tine. Struck close to the clamp, the hammer excites it strongly: the bright **bell** at the start of each note, which dies first.

Struck further out (the second note), the bell is softer and the tone rounder.`,
  },
  {
    title: 'Harmonics made by the pickup',
    views: ['Pickup transfer', 'Spectrum'],
    play: [note('A3', { dur: 2.5, vel: 0.2 }), note('A3', { at: 2.5, dur: 3, vel: 0.95 })],
    text: `The tine itself swings almost as a pure sine. The **harmonics** that sustain come from the pickup: the flux through the coil is a curved function of where the tip is (the bump in the view), and the coil's voltage follows how fast that flux changes.

A soft note swings the tip over a small, nearly straight part of the curve. A hard one sweeps across the bump, and the curve **bends the sine** into a stack of harmonics: the Rhodes bark.`,
  },
  {
    title: 'Voicing: where the tip sits',
    views: ['Pickup transfer', 'Spectrum'],
    preset: 'Centred tine — the octave trick',
    play: [note('A3', { dur: 3, vel: 0.7 }), { at: 3, set: { offset: 0.55, gap: 0.6, drive: 0.35 } }, note('A3', { at: 3.1, dur: 3, vel: 0.7 })],
    text: `Technicians voice a Rhodes by moving each pickup relative to its tine. With the tine **centred** on the pole the curve is symmetric, so each swing passes the bump twice: the second harmonic dominates and the note sounds almost an octave up.

Set **off-centre** and close, the curve is lopsided: a growling, barking tone.`,
  },
  {
    title: 'The tone bar',
    views: ['Spectrogram', 'Slow motion: tine, tone bar, pickup'],
    preset: 'No tone bar — bare tine on its mount',
    play: [note('C4', { dur: 3.5, vel: 0.6 }), { at: 3.5, set: { barMass: 15 } }, note('C4', { at: 3.6, dur: 4, vel: 0.6 })],
    text: `A bare tine on its mount loses its energy into the mount and dies quickly. The **tone bar**, tuned to the tine and coupled through the clamp, turns the pair into a fork: the bar's heavy, slow swing holds the energy and feeds it back.

The second note has its tone bar back: much longer sustain.`,
  },
  {
    title: 'The Suitcase’s vibrato',
    views: ['Spectrogram'],
    preset: 'Suitcase stereo vibrato',
    play: [{ at: 0, pedal: true }, chord('D3 A3 C4 F4', { dur: 0.8 }), chord('G3 B3 F4', { at: 3.5, dur: 0.8 }), { at: 7.5, pedal: false }],
    text: `Rhodes's Suitcase model had its own amplifier with a "vibrato" that is really a **stereo tremolo**, panning the sound between the two speakers. With the pedal down, the chords ring through it.`,
  },
]);
