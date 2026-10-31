// bubbles-tour.js — the guided tour of the bubble organ's physics (shared/tour.js)
import { tour, note, run } from '../../shared/tour.js';

export const TOUR = tour('bubbles', [
  {
    title: 'A bubble is a spring and a mass',
    views: ['Latest bubble', 'Tank'],
    play: [run('A4 C5 E5 A5 E5 C5', { step: 0.5, dur: 0.15 }), note('A4', { at: 3.2, dur: 3 })],
    text: `The babbling of a brook is bubbles ringing. When a bubble pinches off, its gas is the **spring** and the water around it, moving in and out, is the **mass**: it rings at Marcel Minnaert's frequency (1933), about \`f ≈ 3.3 m/s ÷ radius\` in water at the surface. A 1 mm bubble sings near 3 kHz.

A tapped key releases one bubble; a held key a stream of them, a brook.`,
  },
  {
    title: 'One frequency, no overtones',
    views: ['Spectrum', 'Spectrogram'],
    play: [note('A5', { dur: 4 }), note('E6', { at: 1, dur: 3 })],
    text: `A bubble's breathing has only **one** mode that radiates: no overtones at all. Each bubble is a short blip at a single frequency, dying in a few dozen cycles; a held key's brook smears its line a little, because no two bubbles are quite the same size.

The latest-bubble view shows the computed pressure and its decay, split into heat flow, radiation and viscosity.`,
  },
  {
    title: 'Deeper, the spring stiffens',
    views: ['Latest bubble', 'Spectrogram'],
    play: [run('A4 C5 E5 A5', { step: 0.45, dur: 0.15 }), { at: 1.8, set: { depth: 20 } }, run('A4 C5 E5 A5', { at: 1.9, step: 0.45, dur: 0.15 }), { at: 3.7, set: { depth: 0.3, pressure: 0.25 } }, run('A4 C5 E5 A5', { at: 3.8, step: 0.45, dur: 0.15 })],
    text: `The gas's stiffness is its pressure. Twenty metres down the pressure triples and the same bubbles ring a **major sixth higher** (frequency ∝ √p). Under a quarter of an atmosphere they ring about an **octave lower**.

Deep down the bass also rings shorter: the bubble is far from the surface, which no longer reflects its sound back to it.`,
  },
  {
    title: 'Other gases',
    views: ['Damping', 'Spectrogram'],
    preset: 'Helium: up less than √γ, and duller',
    play: [run('A3 A4 A5 A6', { step: 0.6, dur: 0.15 }), { at: 2.5, set: { gas: 'sf6' } }, run('A3 A4 A5 A6', { at: 2.6, step: 0.6, dur: 0.15 })],
    text: `A small bubble is squeezed too fast for heat to flow, and rings **adiabatically**, its spring stiffened by the gas's γ; a big one has time to share heat with the water and is softer. Between, heat flow damps the ring.

Helium conducts heat so well that it rings duller and rises in pitch less than its γ would say. Heavy SF₆ (γ = 1.10) rings two semitones **lower**, and on and on.`,
  },
  {
    title: 'Rising to the surface',
    views: ['Tank', 'Latest bubble'],
    preset: 'Shallow tank (10 cm): big bubbles rise in pitch as they surface',
    play: [note('A3', { dur: 0.3 }), note('C4', { at: 1.5, dur: 0.3 }), note('E4', { at: 3, dur: 0.3 })],
    text: `A bubble near the free surface rings against its own mirror image, which makes it ring **higher**. Released only 10 cm down, each big bubble's pitch climbs as it rises toward the surface, until it bursts.

Deeper down a bubble rises only centimetres while it rings, and its pitch hardly moves.`,
  },
]);
