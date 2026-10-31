// regal-tour.js — the guided tour of the regal's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('regal', [
  {
    title: 'A brass tongue beating',
    views: ['Tongue', 'Spectrum'],
    play: [note('C4', { dur: 3 }), run('G3 C4 E4 G4 C5', { at: 3.2, step: 0.5, dur: 0.48 })],
    text: `Under each key a brass **tongue** lies curved over the open face of a **shallot**, a little brass tube. The wind pushes it down; it rolls onto the shallot from the root out, shutting off the air, springs back, and does it again hundreds of times a second.

The tongue view replays one beat slowly: watch the tongue close the gap and the flow (blue) stop dead while it lies on the shallot. Those sudden stops are why a regal buzzes.`,
  },
  {
    title: 'Short resonators colour it',
    views: ['Resonator', 'Spectrum'],
    play: [run('C3 G3 C4 E4', { step: 0.6, dur: 0.55 }), { at: 2.5, set: { resonator: 'funnel' } }, run('C3 G3 C4 E4', { at: 2.6, step: 0.6, dur: 0.55 }), { at: 5, set: { resonator: 'apple' } }, run('C3 G3 C4 E4', { at: 5.1, step: 0.6, dur: 0.55 }), { at: 7.5, set: { resonator: 'none' } }, run('C3 G3 C4 E4', { at: 7.6, step: 0.6, dur: 0.55 })],
    text: `A regal's resonators are a small fraction of a pipe's length, so the **tongue sets the pitch** and the resonator only colours it: its first resonance sits a few harmonics up, lifting those harmonics into a formant.

Cylinders, then funnels, capped balls and bare shallots, as Praetorius drew them. The resonator view draws each to scale, with its impedance against the note's harmonics.`,
  },
  {
    title: 'The wind gives',
    views: ['Bellows', 'Spectrogram'],
    play: [note('C4', { dur: 6 }), chord('C3 G3 E4 G4', { at: 1.5, dur: 4.5 })],
    text: `Two weighted **wedge bellows** feed the chest. When the chord comes in, the reeds draw more wind than the trunk lets through at once: the chest's pressure dips, the board on the bellows catches it up with a small bounce, and the held C4 dips with it.

Because the tongue sets the pitch, **every movement of the wind moves the pitch**: the bellows view shows the dip, the spectrogram the reeds sagging.`,
  },
  {
    title: 'A bellows runs out',
    views: ['Bellows'],
    preset: 'Full regal: Sordun 16′, 8′ and 4′',
    play: [chord('G2 D3 G3 B3 D4 G4', { dur: 9 })],
    text: `Three ranks on a big chord empty a bellows in a few seconds. As it sinks the weight's arm shortens and the wind **rises** a little; when it is nearly empty the calcant (the bellows boy) lets the other, raised meanwhile, take over, and the wind **shakes** at the change.

Watch the two wedges trade places.`,
  },
  {
    title: 'Brass or leather',
    views: ['Tongue', 'Spectrum'],
    play: [chord('D3 A3 D4 F4', { dur: 2.4 }), { at: 2.6, set: { facing: 'leather' } }, chord('D3 A3 D4 F4', { at: 2.8, dur: 2.4 })],
    text: `What the tongue beats on sets how hard it stops. On **bare brass** it stops dead, and the flow with it: a bright, buzzing slap. On a **leathered** shallot it lands on a cushion and the close is padded: rounder, with less of the top in the spectrum.

The voicer retunes each tongue for its shallot, so the pitch stays put.`,
  },
  {
    title: 'The tremulant',
    views: ['Bellows', 'Spectrogram'],
    preset: 'Tremulant: the wind pulses',
    play: [chord('D3 A3', { dur: 7 }), run('D4 F4 E4 D4', { at: 0.2, step: 1.7, dur: 1.65 })],
    text: `A sprung flap in the wind trunk opens a vent to the air a few times a second. The chest's pressure **pulses**, and every reed's loudness and pitch with it: Charon's regal in Monteverdi's *Orfeo* could shiver like this.

The bellows view shows the wind beating; **Tremulant rate** sets how fast.`,
  },
]);
