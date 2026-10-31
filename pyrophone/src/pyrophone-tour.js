// pyrophone-tour.js — the guided tour of the pyrophone's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('pyrophone', [
  {
    title: 'Flames that sing',
    views: ['Tube', 'Spectrogram'],
    play: [note('C4', { dur: 4 }), chord('F3 A3 C4', { at: 4, dur: 4 })],
    text: `Frédéric Kastner's pyrophone (patented 1873): glass tubes, each with flames inside a third of the way up. Heat added where the gas is being **compressed** and taken away where it expands pumps energy into the sound wave: Lord Rayleigh's criterion (1878), the same physics as a rocket's combustion instability.

There is no attack: each note **grows by itself** out of the flame's noise, a line swelling over tens to hundreds of milliseconds. The tube view strobes the standing wave into slow motion.`,
  },
  {
    title: 'Born of an instability',
    views: ['Phase portrait of mode 1', 'Spectrogram'],
    preset: 'Just past threshold: slow sighs',
    play: [note('C4', { dur: 5 }), { at: 5, set: { flame: 3.4 } }, note('C4', { at: 5.1, dur: 4 })],
    text: `Inside the dashed circle of the phase portrait a disturbance dies; outside it, it spirals out to the solid limit cycle. Just past **threshold** the flame barely beats the losses: the note sighs in slowly.

With the flames turned well up, the same note blooms quickly and brightly.`,
  },
  {
    title: 'Hysteresis: tubes that remember',
    views: ['Bifurcation diagram', 'Phase portrait of mode 1'],
    preset: 'Tubes that remember (key-up in the bistable band)',
    play: [run('C4 E4 G4', { step: 1.2, dur: 1 })],
    text: `The bifurcation diagram plots the steady amplitude against heater power. Between the **fold** and the **Hopf point** (the shaded band) both silence and singing are stable: a silent tube stays silent, a singing one keeps singing.

Here a released key turns its flames down only into that band, so every tube that has sung **goes on singing** after the key is let go: the tube remembers.`,
  },
  {
    title: 'Where the flame sits: Rayleigh’s map',
    views: ['Tube', 'Spectrum'],
    preset: 'Flame high (68 %): the octave sings',
    play: [note('C3', { dur: 4 }), { at: 4, set: { xf: 0.3333333333333333, listen: 0.5, flame: 3.4 } }, note('C3', { at: 4.1, dur: 4 })],
    text: `A mode gains energy only if the flame sits where its pressure swings and the heat's delay suits it. Move the flame and different modes win: here, two thirds of the way up, the **octave** sings instead of the fundamental.

Kastner's place, a third of the way up (the second note), favours the fundamental.`,
  },
  {
    title: 'Glass that warms',
    views: ['Spectrogram'],
    preset: 'Cold glass: big warm-up drift',
    play: [note('A3', { dur: 5 }), note('A3', { at: 5.5, dur: 3 })],
    text: `The speed of sound grows with temperature, so a tube's pitch rises as its gas warms. A cold tube starts flat and **slides up** into tune over a few seconds.

Released for half a second and played again, it is still warm and starts much closer to pitch.`,
  },
]);
