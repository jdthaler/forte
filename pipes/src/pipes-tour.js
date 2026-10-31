// pipes-tour.js — the guided tour of the pipe organ's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('pipes', [
  {
    title: 'A jet of air, steered',
    views: ['Jet in the mouth', 'Spectrum'],
    play: [note('C4', { dur: 3.5 }), chord('C3 G3 E4', { at: 3.6, dur: 3.5 })],
    text: `A flue pipe has no reed and nothing that moves but air. Wind from the chest leaves the flue as a thin **jet** across the mouth, toward a sharp edge, the labium. The view replays one cycle slowed to two seconds.

The air sloshing in and out of the pipe deflects the jet at the flue; the bend grows on its way across and swings the jet inside or outside the labium, which pushes the air column further. The pipe's resonances (the markers) pick the pitch: every harmonic for this open pipe.`,
  },
  {
    title: 'Chiff: the attack',
    views: ['Spectrogram', 'Jet in the mouth'],
    preset: 'Fast pallet: the upper modes speak first (chiff)',
    play: [run('C3 G3 C4', { step: 1.1, dur: 1 }), { at: 3.4, set: { rise: 60 } }, run('C3 G3 C4', { at: 3.5, step: 1.1, dur: 1 })],
    text: `When the pallet under the pipe snaps open, the jet starts before the air column has settled on its fundamental, and for a few tens of milliseconds the **upper modes speak first**: the organ's chiff, the consonant before the vowel. Watch the top of each note in the spectrogram.

The second time the pallet opens slowly (60 ms) and the pipes swell in without it.`,
  },
  {
    title: 'Open and stopped pipes',
    views: ['Spectrum', 'Spectrogram'],
    preset: 'Gedackt 8′: stopped pipes, odd harmonics',
    play: [run('C3 E3 G3 C4', { step: 0.8, dur: 0.75 }), { at: 3.3, set: { principal: true, gedackt: false } }, run('C3 E3 G3 C4', { at: 3.4, step: 0.8, dur: 0.75 })],
    text: `A **stopped** pipe (the Gedackt) is capped at the top. Sound reflects from the cap without inverting, so the pipe resonates at a quarter wavelength: it speaks an octave lower than an open pipe of the same length, and has **only the odd harmonics**. Hear its hollow, flute-like tone.

Then the Principal, an open pipe with every harmonic: the organ's own voice.`,
  },
  {
    title: 'Overblowing, with a memory',
    views: ['Pressure and flow', 'Spectrum'],
    preset: 'Low cut-up: bright, close to overblowing',
    set: { pressure: 300 },
    play: [note('C4', { dur: 9.5, vel: 0.7 }), { at: 1.5, set: { pressure: 1000 } }, { at: 3, set: { pressure: 2200 } }, { at: 4.5, set: { pressure: 3000 } }, { at: 6, set: { pressure: 1000 } }, { at: 7.5, set: { pressure: 300 } }],
    text: `One pipe while the wind rises and falls back. A faster jet takes less time to cross the mouth, which favours a higher mode: near 2 kPa the pipe **jumps to its octave**. The steps in the pressure-against-flow loop are the jet flipping across the labium.

On the way down it stays on the octave until the wind is much weaker than where it jumped up: **hysteresis**, the pipe remembering which mode it was in.`,
  },
  {
    title: 'A wind that breathes',
    views: ['The wind', 'Spectrogram'],
    preset: 'Flexible wind: the plenum breathes',
    play: [note('C4', { dur: 6 }), chord('C3 E3 G3 C5 E5 G5 C6', { at: 2, dur: 3.5 })],
    text: `All the pipes draw from one chest fed by bellows. A big chord takes a lot of air: on a **flexible** wind the pressure sags and rings like a spring, and the held note sways with it.

Many old organs breathe this way; later builders learned to make the wind dead steady (try the *Steady wind* preset).`,
  },
  {
    title: 'The plenum',
    views: ['Spectrum', 'Spectrogram'],
    preset: 'Plenum: Principal 8′, Octave 4′ and Mixture',
    play: [chord('D3 A3 D4 F4', { dur: 3.5 }), chord('C#3 A3 E4', { at: 3.5, dur: 1.5 }), chord('D3 A3 D4 F4', { at: 5, dur: 3 })],
    text: `The **Octave 4′** adds pipes an octave up, and the **Mixture** several small pipes per key at octaves and fifths above: harmonics built from separate pipes. Together with the Principal they make the plenum, the bright chorus of the classical organ.`,
  },
]);
