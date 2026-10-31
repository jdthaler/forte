// vibraphone-tour.js — the guided tour of the vibraphone's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('vibraphone', [
  {
    title: 'A tuned bar',
    views: ['Bar and modes', 'Spectrum'],
    preset: 'Motor off, discs open: no tremolo',
    play: [note('F4', { dur: 3 }), note('C5', { at: 3, dur: 3 })],
    text: `An aluminium bar hangs on cords at the nodes of its first mode, so they barely damp it. A plain bar's modes go as 1 : 2.76 : 5.40, a clangy halo; the **arch cut** underneath thins the middle, where the low modes bend most, and pulls them down until they sit at **1 : 4 : 10**: two octaves, and three octaves and a major third.

The bar view draws the first three modes moving with their live amplitudes; the spectrum marks where the model puts them.`,
  },
  {
    title: 'Tuned against plain bars',
    views: ['Spectrum', 'Spectrogram'],
    preset: 'Hard cord mallets, struck near the end',
    play: [chord('F4 A4 C5', { dur: 3 }), { at: 3, set: { depth: 0 } }, chord('F4 A4 C5', { at: 3.1, dur: 3.5 })],
    text: `Struck hard near the end, so the upper modes speak. On tuned bars the 4th and 10th harmonics ring in tune over the chord; on **plain bars** the partials at 2.76 and 5.40 belong to no harmonic series, and the chord grows an out-of-tune halo.

The undercut is how a mallet-percussion maker tunes overtones: by taking metal away where a mode bends most.`,
  },
  {
    title: 'The resonator',
    views: ['Tube and disc', 'Spectrogram'],
    preset: 'No resonators: the bars alone',
    play: [run('F4 A4 C5 F5', { step: 0.6, dur: 1.5 }), { at: 2.8, set: { tubes: true } }, run('F4 A4 C5 F5', { at: 2.9, step: 0.6, dur: 1.5 })],
    text: `Without its tube a bar is thin and quiet: a vibrating bar is a poor radiator, its two faces pushing air in opposite directions. Under each bar hangs a tube closed at the bottom, a **quarter-wave resonator** tuned to the bar.

The bar drives the air at the tube's mouth and the tube radiates it: the fundamental comes up by some 30 dB, and the note gets shorter, because the sound it gives off is energy the bar loses.`,
  },
  {
    title: 'Two oscillators, sharing air',
    views: ['Tube and disc', 'Spectrum'],
    preset: 'Tubes pressed close: bar and tube trade energy',
    play: [note('F3', { dur: 6, vel: 0.7 })],
    text: `With the tube pushed up to 7 mm under the bar, the two oscillators are strongly coupled through the thin layer of air between them. Like two pendulums on a string, the pair **splits into two modes** a few hertz apart, and the note throbs as the energy passes back and forth (watch the energy trace in the tube view).

At the normal 30 mm gap the coupling is weak and the pair rings as one.`,
  },
  {
    title: 'The motor: vibrato that is really tremolo',
    views: ['Tube and disc', 'Spectrogram'],
    play: [{ at: 0, pedal: true }, chord('A3 C4 E4 G4', { dur: 0.6, vel: 0.6 }), { at: 6.5, pedal: false }],
    text: `A shaft through the tops of the tubes carries a disc in each mouth, turned by a motor. As a disc turns it **opens and closes the tube**, changing both how strongly the tube couples to the bar and its pitch.

So every line in the spectrogram pulses, twice per revolution: the vibraphone's famous "vibrato" is mostly a tremolo, a swing in loudness. The pedal lifts the damper felt so the chord rings on.`,
  },
  {
    title: 'Discs out of step',
    views: ['Tube and disc', 'Spectrogram'],
    preset: 'Discs twisted along the shaft: chords shimmer',
    play: [{ at: 0, pedal: true }, chord('G3 B3 D4 F#4 A4', { dur: 0.6, vel: 0.6 }), { at: 6.5, pedal: false }],
    text: `On a real vibraphone the discs are rarely perfectly aligned. Here each one is set 40° further round the shaft than the last, and the accidentals' shaft runs 90° behind.

Now the pulse **ripples through the chord** instead of beating as one: each note swells at its own moment, and the chord shimmers.`,
  },
]);
