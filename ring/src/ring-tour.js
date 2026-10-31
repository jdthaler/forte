// ring-tour.js — the guided tour of the storage ring's physics (shared/tour.js)
import { tour, note, chord } from '../../shared/tour.js';

export const TOUR = tour('ring', [
  {
    title: 'A bunch going round',
    views: ['The ring', 'Pickup, turn by turn'],
    preset: 'Clean injection: the bare bunch train',
    play: [note('C4', { dur: 3 }), chord('C3 G3 C4', { at: 3, dur: 3 })],
    text: `A bunch of particles circles a storage ring, and a **pickup** (two electrodes) feels it pass once a turn. Each key is a ring whose revolution frequency is the note.

With the bunch injected cleanly, the pickup hears a bare pulse train: a comb of harmonics, an organ-like buzz. A short bunch makes a sharp pulse, so its brightness is the bunch length.`,
  },
  {
    title: 'Betatron oscillation: sidebands',
    views: ['Phase space of C4', 'Spectrum'],
    play: [note('C4', { dur: 6 })],
    text: `Kicked on the way in, the bunch also swings **across** the beam pipe, the betatron oscillation, a fraction of a cycle per turn: the **tune** (0.31 here). The phase-space view shows the particles turning by that fraction, seen once a turn.

Sampled once a turn, that sideways swing appears in the spectrum as **sidebands** between the harmonics, at the fractional tune.`,
  },
  {
    title: 'Decoherence and recoherence',
    views: ['Pickup, turn by turn', 'Phase space of C4'],
    play: [note('C4', { dur: 7 })],
    text: `Not every particle has the same energy, and with **chromaticity** the tune depends on energy: the particles turn at slightly different rates and smear round the circle. The centroid the pickup hears fades.

But each particle also swings in energy, the **synchrotron** oscillation, so they gather again every synchrotron period: the sidebands fade and **come back**, about four times a second.`,
  },
  {
    title: 'Octupoles: filamentation for good',
    views: ['Phase space of C4', 'Pickup, turn by turn'],
    preset: 'Octupoles on: filaments for good',
    play: [note('C4', { dur: 6 })],
    text: `Octupole magnets make the tune depend on the **amplitude** of the swing rather than on energy. Particles far out turn at a different rate from those near the middle, and they wind into a spiral that never comes back together: **filamentation**.

The sidebands glide and die away and do not return: a real ring uses this to damp oscillations that would otherwise grow.`,
  },
  {
    title: 'Near the half-integer',
    views: ['Spectrum', 'Spectrogram'],
    preset: 'Near the half-integer',
    play: [note('C4', { dur: 4 }), chord('C4 E4 G4', { at: 4, dur: 4 })],
    text: `With the tune near 0.5, the beam swings almost exactly opposite on alternate turns. The sidebands sit almost **halfway between the harmonics**, which sounds like a note an octave down.

Ring designers keep the tune away from simple fractions like this one: resonances there can drive the beam into the walls.`,
  },
]);
