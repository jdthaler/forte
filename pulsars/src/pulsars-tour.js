// pulsars-tour.js — the guided tour of the pulsars' physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('pulsars', [
  {
    title: 'A lighthouse in space',
    views: ['The lighthouse', 'Pulse profile'],
    play: [note('C3', { dur: 3 }), chord('C4 E4 G4', { at: 3, dur: 4 })],
    text: `A **pulsar** is a neutron star, the collapsed core of a massive star: as heavy as the Sun, the size of a city. Its magnetic field beams radio out along its poles, and as it spins, a beam sweeps past the Earth once a turn. A radio telescope hears a pulse every turn.

The fastest, the **millisecond pulsars**, turn hundreds of times a second, so the pulses are a tone. Every key here is a pulsar spinning at the note. The lighthouse view slows the turn down; the profile is one turn of the pulse.`,
  },
  {
    title: 'A narrow beam is a buzzy one',
    views: ['Pulse profile', 'Spectrum'],
    set: { height: 30 },
    play: [note('A2', { dur: 4 }), { at: 4, set: { height: 1000 } }, note('A2', { at: 4.2, dur: 4 })],
    text: `The beam comes from the open field lines, the ones that reach out past the **light cylinder**, where turning with the star would mean going faster than light. Low down it is narrow, so each pulse is short: a buzzy tone with many harmonics. Higher up the beam is wider and the pulse longer: a mellow tone.

For the fastest pulsars the light cylinder is only tens of kilometres out, so their beams are wide whatever you set: high keys are mellow.`,
  },
  {
    title: 'Where the sightline cuts',
    views: ['The lighthouse', 'Pulse profile'],
    set: { height: 60, core: 0.5, sightline: 0 },
    play: [note('D3', { dur: 4 }), { at: 4, set: { sightline: 0.92 } }, note('D3', { at: 4.2, dur: 4 })],
    text: `The beam has a bright **core** on the magnetic axis and a hollow **cone** around it (Rankin's picture). A sightline through the middle crosses the cone, the core and the cone again: a triple pulse.

Then the sightline moves out to graze the cone's edge: one narrow pulse, and a thinner, buzzier tone. What you hear of a pulsar depends on where in its beam we happen to sit.`,
  },
  {
    title: 'The other pole: an interpulse',
    views: ['The lighthouse', 'Spectrum'],
    set: { sightline: 0.15 },
    play: [note('G3', { dur: 4 }), { at: 4, set: { alpha: 89 } }, note('G3', { at: 4.2, dur: 4 })],
    text: `When the magnetic axis is tipped nearly at right angles to the spin, the **other pole's beam** sweeps past us too, half a turn later: an interpulse. PSR B1937+21, the first millisecond pulsar found (1982), has one.

Two equal pulses a turn means a pulse every half turn: the odd harmonics cancel and the note jumps up an **octave**. Watch them vanish in the spectrum.`,
  },
  {
    title: 'Dispersion: the pulses arrive late, and smeared',
    views: ['Phase against frequency', 'Pulse profile'],
    set: { dedisp: 'none', dm: 1.5 },
    play: [note('C4', { dur: 4 }), { at: 4, set: { dedisp: 'filterbank' } }, note('C4', { at: 4.2, dur: 4 })],
    text: `The free electrons between us and the pulsar delay each pulse by **4.15 ms × DM / f²** (f in GHz): the dispersion measure DM counts them, and low radio frequencies come in last. Summed across the band, each pulse is smeared and the tone loses its top. With headphones, a new note comes in from the left (the upper half of the band) before the right.

Then a **filterbank** cuts the band into channels and takes each one's delay out: the pulses stand upright again and the tone comes back.`,
  },
  {
    title: 'Scattering: tails that nothing removes',
    views: ['Phase against frequency', 'Pulse profile'],
    preset: 'LOFAR at 150 MHz: scattering tails',
    play: [run('C4 E4 G4 C5', { step: 1, dur: 1.2 }), { at: 4.5, set: { freq: 1400 } }, run('C4 E4 G4 C5', { at: 5, step: 1, dur: 1.2 })],
    text: `The plasma is turbulent, so the radio reaches us by many slightly different paths: each pulse gets a one-sided **exponential tail**, about as 1/f⁴, far longer at low frequencies. Even coherent dedispersion, which undoes the plasma's delay exactly, leaves it.

At 150 MHz (LOFAR) the high notes melt; then the telescope moves up to 1.4 GHz and they sharpen.`,
  },
  {
    title: 'No two pulses alike',
    views: ['Spectrogram'],
    set: { jitter: 0 },
    play: [note('E3', { dur: 4 }), { at: 4, set: { jitter: 1.4 } }, note('E3', { at: 4.2, dur: 5 })],
    text: `The average profile of a pulsar is steady over decades, but **single pulses** are not: each one is brighter or fainter, by as much as the average itself or more. That turns a pure tone into a rough, crackling one.

A smeared pulse is an average of several, so dispersion and scattering smooth the crackle out too.`,
  },
  {
    title: 'The fastest stars',
    views: ['The lighthouse', 'Pulse profile'],
    play: [note('F5', { dur: 3 }), run('C6 G6 C7 C8', { at: 3, step: 1.2, dur: 1.2 })],
    text: `**PSR J1748−2446ad**, in the globular cluster Terzan 5, turns 716 times a second, a little above F5: the fastest known. A neutron star of 1.4 Suns and 12 km would fly apart at about 940 turns a second (near B♭5), so the top of the keyboard is stars that can't exist, played with the same physics.

Play your own: hold Space to keep them spinning, and move the mod wheel to send them across the Galaxy.`,
  },
]);
