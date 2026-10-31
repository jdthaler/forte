// bowed-tour.js — the guided tour of the viola organista's physics (shared/tour.js)
import { tour, note, chord } from '../../shared/tour.js';

export const TOUR = tour('bowed', [
  {
    title: 'Strings bowed by a wheel',
    views: ['String on the wheel', 'Velocity of the string under the wheel'],
    play: [note('D3', { dur: 3.5 }), chord('G2 D3 B3', { at: 3.6, dur: 4 })],
    text: `Leonardo sketched a keyboard that bows: here a key presses its string onto a rosined **wheel** that turns all the time. Friction is higher when sticking than when sliding, and that difference is what keeps a bowed string going.

The string settles into **Helmholtz motion**: two straight lines meeting at a corner that runs round the dashed parabolas once a period. While the corner is away, the string **sticks** to the wheel and moves with it; as it passes, the string **slips** back (the velocity view).`,
  },
  {
    title: 'Schelleng’s window',
    views: ['Schelleng diagram', 'Spectrogram'],
    preset: 'Surface sound: too little force',
    play: [note('D3', { dur: 2.5 }), { at: 2.5, set: { force: 1 } }, note('D3', { at: 2.6, dur: 2.5 }), { at: 5.1, set: { force: 3 } }, note('D3', { at: 5.2, dur: 2.5 })],
    text: `Helmholtz motion needs the force between minimum and maximum values that depend on the wheel's speed and where it touches: Schelleng's diagram (1973). The dot is this key.

**Too little** force and the string slips several times a period: a thin, whistly *surface sound*. Inside the window: full and clean. **Too much** and the string can't let go cleanly: a gritty, raucous crunch.`,
  },
  {
    title: 'Where the wheel touches',
    views: ['Schelleng diagram', 'Spectrum'],
    preset: 'Sul ponticello: wheel near the bridge',
    play: [note('G3', { dur: 2.5 }), { at: 2.5, set: { beta: 0.12, force: 1 } }, note('G3', { at: 2.6, dur: 2.5 }), { at: 5.1, set: { beta: 0.25, force: 0.6 } }, note('G3', { at: 5.2, dur: 2.5 })],
    text: `Near the bridge (*sul ponticello*) the bowing point drives the upper harmonics strongly: glassy and loud. Further out (*sul tasto*) it is soft and flutey.

The window moves too: close to the bridge it needs more force, far from it less, which is why string players press harder as they bow nearer the bridge.`,
  },
  {
    title: 'The attack',
    views: ['Attack map', 'Spectrogram'],
    preset: 'Lazy keys: slow attacks',
    play: [note('A2', { dur: 2.5 }), { at: 2.5, set: { attack: 8 } }, note('A2', { at: 2.6, dur: 2.5 })],
    text: `How the string starts depends on how the force arrives. A lazy key lets the string slip for a while before it locks into Helmholtz motion: a breathy start. A quick one settles within a few periods.

The attack map (a Guettler diagram) simulates every key travel and force: light regions start clean, dark ones slip or go chaotic. The ring marks this key's touch.`,
  },
  {
    title: 'Sympathetic strings',
    views: ['Spectrum', 'Spectrogram'],
    preset: 'Dampers lifted: sympathetic strings',
    play: [chord('G2 D3 G3 B3', { dur: 2 })],
    text: `With the dampers lifted, released strings keep ringing (slightly sharp, once the wheel lets go), and the other strings, coupled through the bridge and soundboard, **join in** at their shared partials.

That halo of sympathetic resonance is part of every string instrument's sound.`,
  },
]);
