// cavity-tour.js — the guided tour of the RF cavity bells' physics (shared/tour.js)
import { tour, note, chord } from '../../shared/tour.js';

export const TOUR = tour('cavity', [
  {
    title: 'A bell made of microwaves',
    views: ['The cavity', 'The passband'],
    play: [note('C4', { dur: 4 }), chord('C4 E4 G4', { at: 4, dur: 4 })],
    text: `A superconducting niobium **RF cavity**, the TESLA nine-cell design, cooled to 2 K: the accelerating structure of a linear collider. Each key is a cavity whose accelerating mode is the note, scaled down from 1.3 GHz.

A passing bunch of particles leaves energy in the cavity's modes, and they ring like a bell. With losses as low as superconducting niobium, they ring for a very long time.`,
  },
  {
    title: 'Nine cells, nine modes: a passband',
    views: ['The passband', 'Spectrogram'],
    preset: 'A single pillbox cell',
    play: [note('C4', { dur: 3.5 }), { at: 3.5, set: { cells: 9 } }, note('C4', { at: 3.6, dur: 4 })],
    text: `One pillbox cell has one accelerating mode. Nine cells coupled through their irises behave like nine coupled pendulums: the mode splits into **nine**, a **passband**, along the curve \`ω = ω_c/√(1 + k cos φ)\`.

In the **π mode** the field points the other way in each next cell, so a particle crossing one cell per half period is pushed the same way in all of them: that is the mode that accelerates.`,
  },
  {
    title: 'In step, out of step',
    views: ['The passband', 'Spectrogram'],
    preset: 'Out of step: the passband beats',
    set: { beta: 1, offset: 0.05 },
    play: [note('C4', { dur: 4 }), { at: 4, set: { beta: 0.8 } }, note('C4', { at: 4.1, dur: 5 })],
    text: `A bunch at the speed of light keeps step with the π mode and rings it alone (the dashed line in the passband view). At 80 % of the speed of light it falls behind, rings the **whole passband**, and the nine modes, close in frequency, **beat** slowly.

This is why a proton linac, whose protons are slower, needs cavities shaped for their speed.`,
  },
  {
    title: 'Higher-order modes',
    views: ['The passband', 'Spectrum'],
    preset: 'No HOM couplers: a bright bell',
    play: [note('C4', { dur: 4 }), { at: 4, set: { qhom: 200000000 } }, note('C4', { at: 4.1, dur: 4 })],
    text: `A short bunch off the axis rings **every band**: TM011, TM110 and higher, the quiet partials at 1.42, 1.59 and 1.89 times the note. In an accelerator these higher-order modes kick later bunches sideways, so the cavity has couplers that drain them.

Without the couplers the bell is bright; with them (the second note) the upper partials die quickly and leave the accelerating mode.`,
  },
  {
    title: 'Warmer than 2 K',
    views: ['Spectrogram', 'The cavity'],
    play: [note('C4', { dur: 2.5 }), { at: 2.5, set: { temp: 4.2 } }, note('C4', { at: 2.6, dur: 2.5 }), { at: 5.1, set: { temp: 10 } }, note('C4', { at: 5.2, dur: 2 })],
    text: `Niobium's surface resistance falls exponentially as it gets colder, so 2 K is worth the trouble: the cavity at 4.2 K (boiling helium) loses energy faster and the bell rings shorter.

Above **9.2 K**, niobium is no longer a superconductor at all: the last note is just a click.`,
  },
]);
