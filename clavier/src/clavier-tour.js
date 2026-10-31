// clavier-tour.js — the guided tour of the tangent clavier's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

const riff = (at = 0) => [note('E3', { at, dur: 0.2 }), note('G3', { at: at + 0.3, dur: 0.15 }), note('A3', { at: at + 0.5, dur: 0.3 }), note('B3', { at: at + 0.9, dur: 0.15 }), note('D4', { at: at + 1.1, dur: 0.15 }), note('E4', { at: at + 1.3, dur: 0.5 })];

export const TOUR = tour('clavier', [
  {
    title: 'A string pinched by its key',
    views: ['Slow motion', 'Spectrum'],
    play: [note('A3', { dur: 2 }), riff(2.2), riff(4.2)],
    text: `The Clavinet's ancestor is the clavichord: a key carries a metal **tangent** up into the string and holds it against it. The tangent both starts the string and becomes one end of its speaking length; the rest of the string, wrapped in yarn, stays silent.

The slow motion replays the last key: the tangent's flight, the string carried onto it, the ring, and the release.`,
  },
  {
    title: 'Two pickups, a comb',
    views: ['Pickup comb', 'Spectrum'],
    preset: 'Mellow · lower pickup, soft',
    play: [riff(0), { at: 2, set: { pickup: 'upper', soft: false, medium: false, brilliant: true, gain: 0 } }, riff(2.1), { at: 4.1, set: { pickup: 'diff', brilliant: true, gain: -4 } }, riff(4.2)],
    text: `Each magnetic pickup hears partial n in proportion to \`sin(nπx/L)\`, where x is its distance from the end: partials with a node over a pole vanish. The lower pickup sits further in and is warm; the upper one, near the end, thin and bright.

Subtracting the two (the last phrase) cancels what they share and leaves a **nasal**, hollow tone: the funk of the Clavinet D6 comes from these switches.`,
  },
  {
    title: 'Release: the thunk',
    views: ['Slow motion', 'Spectrogram'],
    play: [run('E2 E2 G2 A2', { step: 0.5, dur: 0.12 }), { at: 2, set: { yarn: 30 } }, run('E2 E2 G2 A2', { at: 2.1, step: 0.5, dur: 0.12 })],
    text: `Let a key go and the tangent drops away: the whole string, its silent part included, swings free for a moment, and the **yarn** wound round it chokes every line at once. That release thunk is half the Clavinet's rhythm.

Without the yarn (the second phrase), each release **rings on**, a minor third below the note: the whole string is longer than the speaking length.`,
  },
  {
    title: 'Velocity: brighter, not louder',
    views: ['Spectrum', 'Spectrogram'],
    play: [note('A3', { dur: 1.2, vel: 0.1 }), note('A3', { at: 1.4, dur: 1.2, vel: 0.45 }), note('A3', { at: 2.8, dur: 1.2, vel: 1 })],
    text: `A3 from soft to hard. The faster the tangent arrives, the shorter the time it takes to carry the string onto the anvil, and the shorter that contact, the more high partials it excites.

So velocity sets the **brightness** far more than the loudness.`,
  },
  {
    title: 'Stiff strings, and a glide',
    views: ['Spectrum', 'Spectrogram'],
    play: [note('F1', { dur: 2.5, vel: 1 }), { at: 2.5, set: { stiff: 0, kc: false } }, note('F1', { at: 2.6, dur: 2.5, vel: 1 })],
    text: `The bass strings are stiff, so their partials run **sharp** of the harmonic grid (the faint lines). A hard blow also stretches the string and raises its tension for a moment: the pitch starts a little sharp and **droops** into tune.

The second note is an ideal string, flexible and with no tension glide: purer, and lifeless.`,
  },
]);
