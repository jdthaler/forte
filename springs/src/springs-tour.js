// springs-tour.js — the guided tour of the spring keyboard's physics (shared/tour.js)
import { tour, note, run } from '../../shared/tour.js';

export const TOUR = tour('springs', [
  {
    title: 'A spring that echoes',
    views: ['Echoes', 'The spring'],
    preset: 'One spring: bare echoes',
    play: [note('C2', { dur: 3 }), note('C3', { at: 3, dur: 2.5 }), note('C4', { at: 5.5, dur: 2.5 })],
    text: `A long coil spring, the heart of a spring reverb, struck by a mallet at one end. Twisting waves run along the wire, bounce off the far bead and come back: **echoes**, about once per period of the note, so each note is a buzz at its own echo rate.

The spring view slows the twist down so a round trip takes two seconds: watch the pulse leave the struck bead and spread as it goes.`,
  },
  {
    title: 'Chirps: dispersion',
    views: ['Echoes', 'Dispersion'],
    preset: 'One spring: bare echoes',
    play: [note('C2', { dur: 5, vel: 0.8 })],
    text: `A helix is dispersive: its waves' speed depends on frequency. Below a **transition frequency F_C** the low frequencies arrive first, so every echo is a rising chirp, the spring reverb's famous *pew*. The dotted lines in the echoes view are when the model says each frequency arrives.

Near F_C the waves crawl almost to a stop (the group delay in the dispersion view climbs without limit): the modes crowd there and that band rings longest.`,
  },
  {
    title: 'Wider coils, lower chirps',
    views: ['Dispersion', 'Echoes'],
    preset: 'Wide coils: the chirps come down',
    play: [note('C3', { dur: 3 }), { at: 3, set: { coil: 0.7 } }, note('C3', { at: 3.1, dur: 3 })],
    text: `F_C is set by the coil's geometry: it goes as the wire's radius over the square of the coil's, \`F_C ∝ r/R²\`. **Widen** the coil and F_C falls: the chirps' ceiling comes down while the note stays put. Narrow it (the second note) and the chirps climb.`,
  },
  {
    title: 'Springs together: a wash',
    views: ['Spectrogram', 'Echoes'],
    preset: 'Three springs cut apart: a tank’s wash',
    play: [run('C3 E3 G3 C4', { step: 0.6, dur: 1.5 })],
    text: `A reverb tank has two or three springs, cut to slightly different lengths. Their echoes arrive at different times and **blur** into a shimmering wash, instead of one spring's crisp, metallic flutter.

Laurens Hammond patented the spring reverb (filed 1939) to give his organs the sound of a large room, its springs hung in oil.`,
  },
  {
    title: 'The Slinky',
    views: ['Echoes', 'Dispersion'],
    preset: 'Slinky: falling whistles',
    play: [note('C3', { dur: 3 }), note('C4', { at: 3, dur: 2.5 }), note('G4', { at: 5.5, dur: 2.5 })],
    text: `A Slinky, flat wire in loose coils, is on the far side of F_C for everything you hear: there the high frequencies arrive first, and every echo is a **falling whistle**, each longer than the last.

The same dispersion makes *Star Wars*' blaster sound, which Ben Burtt recorded by striking a radio mast's guy wire.`,
  },
]);
