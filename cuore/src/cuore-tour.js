// cuore-tour.js — the guided tour of the CUORE keyboard's physics (shared/tour.js)
import { tour, note, run } from '../../shared/tour.js';

export const TOUR = tour('cuore', [
  {
    title: 'A thermometer for single decays',
    views: ['The bolometer', 'The pulses'],
    play: [note('A3', { dur: 5 })],
    text: `CUORE, under the Gran Sasso mountain, looks for **neutrinoless double-beta decay** of tellurium-130 in 988 crystals of tellurium dioxide, cooled to 10 mK. At that temperature a crystal's heat capacity is so small that a single decay's few MeV **warm it measurably**: each crystal is a bolometer.

A germanium thermistor glued to it reads the temperature. A heater beside it fires known pulses to calibrate it: here the heater fires at the note's rate, and the sound is the thermistor's voltage, sped up.`,
  },
  {
    title: 'A formant from heat flow',
    views: ['The pulses', 'Spectrogram'],
    play: [run('C3 G3 C4 G4 C5', { step: 1.2, dur: 1.1 })],
    text: `Each pulse **rises** as the heat reaches the thermistor and **fades** as it leaks out through the Teflon holders to the copper frame. Every key's pulse train passes through the same filter: the rise cuts the top, the fade the bottom.

So as the note moves up the scale, its harmonics stay loud in **one band**, like a voice's formant: the low keys buzz, the high keys are round.`,
  },
  {
    title: 'Warmer, quieter, darker',
    views: ['The pulses', 'The bolometer'],
    preset: 'Warmer: 12.5 mK, quieter and darker',
    play: [note('A3', { dur: 3 }), { at: 3, set: { tbase: 10, gain: 5000 } }, note('A3', { at: 3.1, dur: 3 })],
    text: `A crystal's heat capacity grows as **T³** (Debye), and the thermistor's resistance falls steeply with temperature. At 12.5 mK the same pulse warms the crystal far less and the thermistor answers less: the note is much quieter (here amplified to match) and the pulses linger, so it darkens.

Every millikelvin matters: that is why the cryostat is the coldest cubic metre in the known universe.`,
  },
  {
    title: 'Saturation',
    views: ['The pulses', 'Spectrum'],
    preset: 'Big pulses: the thermistor saturates',
    play: [note('A3', { dur: 2.5, vel: 1 }), note('A3', { at: 2.5, dur: 2.5, vel: 0.15 })],
    text: `A big pulse warms the crystal so far that the thermistor no longer answers in proportion (the solid pulse falls short of the dashed one): it **saturates**, and its peak is blunted.

Play hard, then soft: the hard notes are mellower as well as louder. CUORE corrects its energy scale for exactly this non-linearity.`,
  },
  {
    title: 'A smaller crystal',
    views: ['The bolometer', 'The pulses'],
    preset: "Cuoricino's small crystal (3 cm)",
    play: [note('A3', { dur: 3 }), { at: 3, set: { side: 5, gain: 5000 } }, note('A3', { at: 3.1, dur: 3 })],
    text: `Cuoricino, CUORE's forerunner, also ran smaller crystals. A 3 cm cube has a fifth of the heat capacity of CUORE's 5 cm ones, so more than twice the signal for the same energy, and pulses that fall faster.

Bigger crystals hold more tellurium per channel, which is what a rare-decay search needs: a trade between mass and sensitivity.`,
  },
]);
