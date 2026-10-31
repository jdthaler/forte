// clavicylinder-tour.js — the guided tour of the clavicylinder's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('clavicylinder', [
  {
    title: 'Iron bars rubbed by glass',
    views: ['Bar', 'Under the cloth'],
    play: [note('C4', { dur: 3 }), chord('F3 A3 C4 F4', { at: 3.2, dur: 4 })],
    text: `Ernst Chladni, the father of acoustics, built the clavicylinder around 1800. A glass cylinder turns under a row of iron bars; pressing a key lifts its bar against the glass, and a cloth on the bar is dragged along and **slips** back, once per cycle: stick–slip friction, as with a bow.

The bars are tied on cork at the nodes of their lowest mode, so the supports barely damp it; the cloth turns green while it sticks.`,
  },
  {
    title: 'A threshold, then a swell',
    views: ['Under the cloth', 'Spectrogram'],
    play: [note('A3', { dur: 9 }), { at: 0, set: { press: 0.15 } }, { at: 2, set: { press: 0.6 } }, { at: 4, set: { press: 1.5 } }, { at: 6, set: { press: 3 } }, { at: 7.5, set: { press: 0.3 } }],
    text: `One held bar while the key pressure climbs and falls. Below a **threshold**, friction can't feed the bar faster than it loses energy: only the knock of the bar meeting the glass, ringing away. Past it the note **swells in**, a little louder as the pressure goes on rising, and fades as it is let off.

Chladni's instrument could swell and fade on one held note, which no harpsichord or piano could.`,
  },
  {
    title: 'Only the lowest mode',
    views: ['Spectrum', 'Mode table'],
    preset: 'Cords on the wrong nodes (an overtone takes over)',
    set: { cords: 0 },
    play: [note('C4', { dur: 3 }), { at: 3, set: { cords: -0.092 } }, note('C4', { at: 3.1, dur: 3.5 })],
    text: `A free bar's overtones lie at 2.76 and 5.40 times its note, not on the harmonics. Stick–slip makes **true harmonics** of whichever mode it locks to, and the cloth is placed to drive the lowest.

Tie the bar on the second mode's nodes instead (the second note), and that mode, damped least, takes over: the note jumps up an octave and a tritone.`,
  },
  {
    title: 'Cloth wet, cloth soaked',
    views: ['Under the cloth', 'Spectrogram'],
    play: [run('C4 E4 G4 C5 E5 G5 C6', { step: 0.45, dur: 0.6 }), { at: 3.3, set: { wet: 0.95 } }, run('C4 E4 G4 C5 E5 G5 C6', { at: 3.4, step: 0.45, dur: 0.6 })],
    text: `Friction depends on the cloth's state. Damp, it grips and lets go cleanly, and even the small treble bars speak quickly.

Soaked, the difference between sticking and sliding friction shrinks: the tone dulls, and the **top notes don't speak at all**, since too little energy goes in each cycle to beat their losses.`,
  },
]);
