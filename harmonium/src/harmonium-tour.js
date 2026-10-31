// harmonium-tour.js — the guided tour of the free-reed organ's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('harmonium', [
  {
    title: 'A reed that swings through a slot',
    views: ['Reed in its slot', 'Spectrum'],
    play: [note('A3', { dur: 3 }), chord('F3 A3 C4', { at: 3, dur: 3.5 })],
    text: `A **free reed** is a brass tongue riveted over a slot it just fits, swinging right through it. The view is a cut along the reed, to scale, one cycle stretched over two seconds.

While the tongue is out of the slot, wind rushes through the gap round it; while it is inside, the gap closes to the clearance. So the reed chops the wind into **pulses**, and the sound is rich in every harmonic, with no gaps in the comb.`,
  },
  {
    title: 'Why it swings by itself',
    views: ['Flow and displacement', 'Reed in its slot'],
    play: [note('A3', { dur: 6 })],
    text: `If air had no mass, the flow would follow the opening exactly (the dashed curve) and push the reed as hard going in as coming out: no net work, no sound.

But the air feeding the reed has to be **accelerated**, so the flow lags the opening and the loop leans off the dashed line. Over each cycle the wind does net work on the tongue, which is what keeps it swinging.`,
  },
  {
    title: 'Musette: reeds that beat',
    views: ['Musette beats', 'Spectrum'],
    play: [note('A4', { dur: 3 }), { at: 3, set: { musette: 'two' } }, note('A4', { at: 3.1, dur: 3.5 }), { at: 6.6, set: { musette: 'three' } }, note('A4', { at: 6.7, dur: 3.5 })],
    text: `One reed, then two 12 ¢ apart, then three. Two tones a few cents apart add up to one that **swells and fades** at their difference frequency: at A4, 12 ¢ beats about 3 times a second (the ticks mark the predicted period).

That shimmer is the accordion's musette and the harmonium's *voix céleste*.`,
  },
  {
    title: 'The wind decides the pitch',
    views: ['The wind', 'Spectrogram'],
    preset: 'Gentle wind: near threshold, slow to speak',
    play: [run('C4 E4 G4 C5 E5 G5', { step: 0.5, dur: 2 }), { at: 4, set: { pressure: 1800 } }, run('C4 E4 G4 C5 E5 G5', { at: 4.1, step: 0.5, dur: 2 })],
    text: `A reed needs a **threshold** pressure to start. On a gentle wind it is barely above it: the reeds speak late and softly, the top ones slowest (the red line in the wind view is the last key's threshold).

On a strong wind they speak at once, louder and brighter, and **a few cents flat**: a free reed's pitch depends a little on how hard it is blown, one of the things a reed voicer works against.`,
  },
  {
    title: 'The bellows',
    views: ['The wind', 'Musette beats'],
    preset: 'Pumped through the expression stop',
    play: [chord('C3 G3 E4 C5', { dur: 7 })],
    text: `A harmonium is pumped by the feet. Usually a **reservoir** smooths the strokes; with the *expression stop* drawn, the reeds blow straight from the pumping bellows, so the chord **swells with every stroke** (1.2 a second here).

That gives the player dynamics, foot by foot: the expressive harmonium of Franck and Karg-Elert.`,
  },
  {
    title: 'The accordion’s cassotto',
    views: ['Spectrum', 'Spectrogram'],
    preset: 'Accordion: musette in the cassotto, bellows direct',
    set: { cassotto: false },
    play: [run('E4 G4 B4 E5 B4 G4', { step: 0.45, dur: 0.45 }), { at: 2.8, set: { cassotto: true } }, run('E4 G4 B4 E5 B4 G4', { at: 2.9, step: 0.45, dur: 0.45 })],
    text: `An accordion's musette, out in the open, then through the **cassotto**: a wooden chamber the reeds sound into, whose air acts as a low-pass filter and takes the edge off the upper harmonics.

The second phrase is rounder and softer: the sound of a concert accordion's tone chamber.`,
  },
]);
