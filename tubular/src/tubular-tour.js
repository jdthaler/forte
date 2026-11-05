// tubular-tour.js — the guided tour of the tubular bells' physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('tubular', [
  {
    title: 'Brass tubes, struck on the cap',
    views: ['Tubes', 'Spectrum'],
    set: { pedalLock: true },
    play: [run('C5 G4 A4 E4', { step: 1.2, dur: 1.2 }), run('E4 A4 G4 C5', { at: 5.2, step: 1.2, dur: 1.2 })],
    text: `Orchestral chimes are brass tubes, 1½ inches across, hung by cords from a frame. The player strikes each one on its **cap**, a brass plug in the top end, with a rawhide mallet, and the tube bends like a free bar: the tubes view draws it, exaggerated.

The tubes are cut to length, the low ones longest. Listen to the clang of the strike, then the long hum it leaves behind.`,
  },
  {
    title: 'A pitch no mode plays',
    views: ['Strike note', 'Spectrum'],
    set: { pedalLock: true },
    play: [note('G4', { dur: 6 }), note('G4', { at: 6.5, dur: 5, vel: 0.4 })],
    text: `The note you hear is not any mode of the tube. A free bar's modes lie near (2n + 1)²: modes **4, 5 and 6** fall close to 2 : 3 : 4, like the 2nd, 3rd and 4th harmonics of a note an octave below mode 4. The ear fills in that missing fundamental, a virtual pitch: the **strike note** (the dashed line).

The strike note view puts every mode on that note's harmonics: modes 4–6 in gold sit near 2, 3 and 4; the low modes 1–3 are below it and barely heard.`,
  },
  {
    title: 'The air takes the high modes',
    views: ['Spectrogram', 'Mode table'],
    set: { pedalLock: true, hardness: 9000 },
    play: [note('D5', { dur: 8 })],
    text: `A tube a few centimetres across is a poor loudspeaker for its low modes: the air flows round it from one side to the other. Once its bending waves travel faster than sound (above a few hundred hertz here) it radiates well, and the higher the mode, the faster it loses its energy to the air.

So a hard mallet's bright **clang** of high modes fades in a second or two (watch the spectrogram), and modes 4–6, the strike note, hum on for many seconds. The mode table gives each one's ring time.`,
  },
  {
    title: 'Mallets',
    views: ['Spectrum', 'Spectrogram'],
    set: { pedalLock: true },
    play: [note('C5', { dur: 3, vel: 0.8 }), { at: 3, set: { hardness: 150, mass: 300 } }, note('C5', { at: 3.2, dur: 3.5, vel: 0.8 }), { at: 6.7, set: { hardness: 30000, mass: 150 } }, note('C5', { at: 6.9, dur: 3.5, vel: 0.8 })],
    text: `The same tube struck three ways: the orchestra's **rawhide** mallet, then a **leather-wrapped** one, then **brass**. A soft face stays on the cap for longer and cannot shake the fast modes: the strike note alone, mellow.

A hard face leaves within a fraction of a millisecond and rings every mode up to the treble: a bright, hard clang.`,
  },
  {
    title: 'The cap',
    views: ['Strike note', 'Mode table'],
    preset: 'No cap: an open tube',
    set: { pedalLock: true },
    play: [note('F5', { dur: 4.5 }), { at: 4.5, set: { cap: 400 } }, note('F5', { at: 4.7, dur: 5 })],
    text: `The top tube, open and then with a heavy 400 g cap. A mass at the struck end lowers every mode, the low ones most, so modes 5 and 6 rise against mode 4 (the ratios in the strike note view's title): in this short tube, where shear had flattened them, towards 3 and 4.

The cap also gives the mallet a hard, round face to strike, and its mass is part of the tuning: the tube is cut a little shorter to stay on pitch.`,
  },
  {
    title: 'The damper bar',
    views: ['Tubes', 'Spectrogram'],
    play: [chord('C4 E4 G4', { dur: 1.5 }), chord('C4 E4 G4', { at: 2.5, dur: 1.5 }), { at: 4.5, pedal: true }, chord('D4 F4 A4', { at: 4.6, dur: 1.5 }), chord('C4 E4 G4 C5', { at: 6.6, dur: 5 })],
    text: `A felt-lined bar presses on every tube near its top, unless the pedal is down. A held key keeps it off its own tube, so chords stop as the keys come up: the frame's bar darkens as it lands.

Then the pedal goes down and lifts it: every tube rings on into the next chord, as a player lets a peal overlap.`,
  },
]);
