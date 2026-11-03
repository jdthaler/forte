// nmr-tour.js — the guided tour of the NMR keyboard's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('nmr', [
  {
    title: 'A molecule is a chord',
    views: ['NMR spectrum', 'Spectrogram'],
    preset: 'Ethanol: a chord of three groups',
    set: { acquire: 'ring', shim: 1 },
    play: [run('A3 C4 E4 A4', { step: 0.9, dur: 0.85 }), note('A3', { at: 4, dur: 3 })],
    text: `Every key is a tube of ethanol in a magnet. A pulse tips its protons' spins over, and they precess; the spectrometer mixes their radio signal down against a reference, so what you hear is each proton's **chemical shift** times the magnet's frequency.

Ethanol's CH₃, CH₂ and OH protons sit at 1.06, 3.44 and 4.63 ppm, so each note is a chord. The key sets the field to put CH₃ on the note: A4 needs 9.75 T, a 415 MHz magnet, close to the commonest spectrometer there is.`,
  },
  {
    title: 'J couplings beat',
    views: ['NMR spectrum', 'Receiver'],
    preset: 'Perfect shim: the couplings beat',
    play: [note('A3', { dur: 6, vel: 0.8 })],
    text: `Each group feels its neighbours' spins through the bonds, the **J coupling**: the CH₃ line splits 1 : 2 : 1 by the two CH₂ protons, 7 Hz apart, and the CH₂ into a quartet of doublets. Lines a few hertz apart are not heard apart but as a beat, so the chord throbs.

The model solves the spins' quantum mechanics exactly, so every line and its height come out of the Hamiltonian, not from a table of multiplets.`,
  },
  {
    title: 'The spins drift out of step',
    views: ['Spins', 'Receiver'],
    preset: 'Water: one line',
    set: { acquire: 'ring' },
    play: [note('C4', { dur: 2.5, vel: 0.9 }), { at: 2.7, set: { shim: 80 } }, note('C4', { at: 3, dur: 2.5, vel: 0.9 })],
    text: `Water has one line. Its note fades because the magnet is not perfectly even: spins in slightly stronger field precess slightly faster, so they **fan out** (the Spins view) and their sum shrinks, in about 1/(π × width).

First a well-shimmed magnet (5 parts per billion), then one 80 ppb uneven: the note dies in milliseconds. Nothing is lost yet, though: each spin still knows its own phase.`,
  },
  {
    title: 'Hahn\'s echo',
    views: ['Spins', 'Receiver'],
    preset: 'Hahn\'s echo: hold a key, press the pedal',
    play: [note('C4', { dur: 3, vel: 0.9 }), { at: 0.5, pedal: true }, { at: 0.7, pedal: false }],
    text: `Hold a key and let the note fade; then the pedal fires a **π pulse**, which flips every spin over. The fast ones are now behind, and catch up: at twice the time of the pulse the fan closes and the note swells back, an **echo**. Erwin Hahn heard it in 1950.

The echo is weaker than the note by what T₂ took, the spins' real loss of phase to tumbling molecules, which no pulse undoes: the dashed line in the receiver.`,
  },
  {
    title: 'An echo train',
    views: ['Receiver', 'Spectrogram'],
    preset: 'Echo train: hold the pedal',
    play: [chord('C3 G3', { dur: 7, vel: 0.9 }), { at: 0.15, pedal: true }, { at: 6, pedal: false }],
    text: `Hold the pedal with the echo train on and a π pulse fires every echo time (0.3 s), as Carr and Purcell did in 1954, with Meiboom and Gill's choice of phase: each pulse calls the chord back again, every echo a little weaker, by T₂ alone.

This is how T₂ is measured, and how an MRI scanner makes its fast images: one pulse, many echoes.`,
  },
  {
    title: 'Saturation: T₁',
    views: ['Magnetisation', 'Receiver'],
    preset: 'Saturated: long T₁, full pulses',
    play: [run('C4 C4 C4 C4', { step: 0.6, dur: 0.5, vel: 1 }), { at: 2.6, set: { flip: 25 } }, run('C4 C4 C4 C4', { at: 2.8, step: 0.6, dur: 0.5, vel: 1 })],
    text: `A 90° pulse tips all of a sample's magnetisation off the field, and it grows back only in **T₁**, here 10 s. Strike the key again too soon and there is little to tip: the repeats fade away (the Magnetisation view).

Then the same repeats with 25° pulses: each tips a little and leaves most along the field, so they keep sounding. Richard Ernst worked out the best angle for a given repeat, and made fast NMR possible.`,
  },
  {
    title: 'Weak magnets lean',
    views: ['NMR spectrum', 'Spectrum'],
    preset: 'Perfect shim: the couplings beat',
    play: [note('A1', { dur: 4, vel: 0.9 }), note('A5', { at: 4.2, dur: 3, vel: 0.9 })],
    text: `The shifts grow with the field but J does not. On the low keys, weak magnets (A1 is 1.2 T), ethanol's CH₂ and OH lines are only 62 Hz apart, a dozen J, and the spectrum turns **second order**: the multiplets lean towards each other and extra lines appear. High keys are strong magnets, where the multiplets are clean; past E6 no magnet that strong has been built (the strongest, 30.5 T, reaches ethanol's E6).`,
  },
  {
    title: 'Play it',
    views: ['Spins', 'Receiver'],
    preset: 'Ethyl acetate: a triplet, a singlet and a quartet',
    set: { train: true, spacing: 0.4, acquire: 'ring', shim: 12, t2: 3, t1: 3 },
    play: [chord('C3 E3', { dur: 3, vel: 0.8 }), { at: 0.2, pedal: true }, chord('F3 A3', { at: 3, dur: 3, vel: 0.8 }), chord('G3 B3', { at: 6, dur: 3, vel: 0.8 }), { at: 9, pedal: false }],
    text: `Ethyl acetate: a triplet, a singlet and a quartet, with the echo train held. Try the samples, spoil the shim with the mod wheel, and hold notes through the pedal's pulses.`,
  },
]);
