// project8-tour.js — the guided tour of Project 8's physics (shared/tour.js)
import { tour, note, chord } from '../../shared/tour.js';

export const TOUR = tour('project8', [
  {
    title: 'An electron’s radio song',
    views: ['The receiver', 'Spectrogram'],
    play: [note('C4', { dur: 6 })],
    text: `An electron in a magnetic field circles at the **cyclotron frequency**, \`f = eB/2πγm\`, and radiates at it: about 26 GHz near 1 T. Project 8 listens to single electrons this way (Cyclotron Radiation Emission Spectroscopy) to measure their energy through γ.

Each key is one electron, its frequency scaled into hearing. Hold it: as it radiates it loses energy, γ falls and the frequency **climbs**, quickly at first and then slowing: the chirp. Every note climbs by the same ratio, so a held chord stays in tune with itself.`,
  },
  {
    title: 'A magnetic bottle',
    views: ['The trap', 'The receiver'],
    preset: 'A deep trap: wide bounces, deep vibrato',
    play: [note('C4', { dur: 7 })],
    text: `The electrons are held in a **magnetic bottle**: the field rises toward both ends and turns them back, so each bounces along the axis, a hundred million times a second in the real trap.

An electron that bounces further sees more field, so it sounds a little sharp; its motion along the waveguide also Doppler-shifts it, a **vibrato** that deepens as it cools. As it cools its bounce widens, until it reaches the walls and leaves.`,
  },
  {
    title: 'Gas cuts the tracks',
    views: ['The receiver', 'Spectrogram'],
    preset: "Phase II's gas: tracks a fifth of a millisecond long",
    play: [note('C4', { dur: 3 }), note('E4', { at: 1, dur: 3 }), note('G4', { at: 2, dur: 3 })],
    text: `The trap is never a perfect vacuum. An electron hitting a gas molecule loses a little energy and **jumps** in frequency (a dot in the receiver view), or is scattered out of the trap and ends (a cross).

At Phase II's pressure each note is a short pitched blip, and the tracks break into the stepped segments of Project 8's real spectrograms.`,
  },
  {
    title: 'Tritium and the neutrino’s mass',
    views: ['Energies', 'The receiver'],
    preset: "Tritium: each electron sharp by its neutrino's energy",
    play: [chord('C4 E4 G4', { dur: 3 }), chord('C4 E4 G4', { at: 3, dur: 3 })],
    text: `Tritium β-decays to helium-3, an electron and an antineutrino, sharing 18.6 keV. Each electron's energy is what the antineutrino left it, so each note sounds **its own pitch**, and the energies view fills in the β spectrum.

At the very end of that spectrum, the **endpoint**, the antineutrino gets almost nothing: if it has a mass, the last few eV of the curve bend and the endpoint pulls in. Measuring that shape by frequency is Project 8's goal.`,
  },
  {
    title: 'Relativistic electrons',
    views: ['Spectrogram', 'Spectrum'],
    preset: 'Relativistic: 300 keV electrons',
    play: [note('C3', { dur: 6 })],
    text: `At 300 keV the electron moves at three quarters of the speed of light, and its radiation is beamed: an antenna ring hears not a sine but a **buzzy pulse train**, rich in harmonics of the cyclotron frequency.

As it radiates and slows, γ falls, the note climbs most of an octave, and the harmonics fade: it grows purer as it slows.`,
  },
]);
