// glass-tour.js — the guided tour of the glass armonica's physics (shared/tour.js)
import { tour, note, chord } from '../../shared/tour.js';

export const TOUR = tour('glass', [
  {
    title: 'A wet finger on spinning glass',
    views: ['Bowl', 'Under the finger'],
    play: [note('A4', { dur: 3.5 }), chord('C5 E5 G5', { at: 3.5, dur: 4 })],
    text: `Benjamin Franklin's armonica (1761): glass bowls nested on a spindle, turned by a treadle, played with wet fingers on their rims. The skin **sticks** to the moving glass, is dragged along, then **slips** back, once per cycle, like a bow on a string.

The bowl view shows the rim's vibration hugely exaggerated: the rim bends into a shape with four lobes (the (2,0) mode), and the finger holds a node of it under itself.`,
  },
  {
    title: 'Why it warbles',
    views: ['The (2,0) doublet, zoomed', 'Spectrogram'],
    preset: 'Perfect bowls, even treadle (no warble)',
    play: [note('A4', { dur: 3.5 }), { at: 3.5, set: { split: 25, treadle: 0.06 } }, note('A4', { at: 3.6, dur: 4.5 })],
    text: `A perfectly round bowl's modes come in pairs of twins at one frequency. A hand-blown bowl is never perfectly round, so its twins are **split** a little, along two axes fixed in the glass.

The finger stays put while the glass turns, so those axes sweep past it: the bowl rings now nearer one twin, now the other, and the pitch **warbles**, four times per turn of the spindle. The first bowl is perfect; the second has a 25 ¢ split.`,
  },
  {
    title: 'The treadle’s speed',
    views: ['Spectrogram', 'Bowl'],
    preset: 'Lazy treadle (slow warble)',
    play: [note('G5', { dur: 3.5 }), { at: 3.5, set: { speed: 1.2 } }, note('G5', { at: 3.6, dur: 3.5 })],
    text: `The same note with the spindle turning slowly, then four times faster. The warble speeds up with it, and the note is **louder**: the faster the glass moves under the finger, the more energy each stick and slip puts in.`,
  },
  {
    title: 'How hard to press',
    views: ['Under the finger', 'Spectrum'],
    play: [note('C5', { dur: 9 }), { at: 0, set: { press: 0.5 } }, { at: 2, set: { press: 3 } }, { at: 4, set: { press: 8 } }, { at: 6.5, set: { press: 18 } }],
    text: `One note while the finger presses harder and harder. Too light, and the skin only slides: a whisper of its ridges. Past a **threshold** it grips, and the slip speed (the view) goes flat on zero between slips: stick–slip, and the bowl swells.

Pressed very hard, the stick–slip locks onto a higher family of the bowl's modes and the skin **squeals**, near 7 kHz.`,
  },
  {
    title: 'Water in the bowl',
    views: ['Spectrum', 'Spectrogram'],
    play: [note('G4', { dur: 3 }), { at: 3, set: { water: 0.5 } }, note('G4', { at: 3.1, dur: 3.5 })],
    text: `Water poured into a bowl moves with the glass where it touches the wall, adding mass but no stiffness: the pitch **falls**, here from G4 by most of a minor third.

Players have long tuned musical glasses this way.`,
  },
  {
    title: 'The free bowl turns its pattern',
    views: ['The (2,0) doublet, zoomed', 'Bowl'],
    play: [chord('A4 E5', { dur: 2 })],
    text: `Rubbed, then let go: the bowls ring on. On a free, spinning bowl the vibration pattern is not carried round with the glass. It turns more slowly, at about (1 − B)Ω, the **Bryan effect** (1890), the principle of the hemispherical resonator gyroscope.

The pattern sweeps past the two microphones, so in stereo the sound **swings between the speakers**.`,
  },
]);
