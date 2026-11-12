// breitwigner-tour.js — the guided tour of the Breit-Wigner Keyboard's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('breitwigner', [
  {
    title: 'One state, one line',
    views: ['Lines', 'Decay law'],
    play: [run('A3 C4 E4 A4', { step: 1.2, dur: 1.1 }), chord('A3 E4 A4', { at: 5.2, dur: 2.5 })],
    text: `Every key makes one unstable state, the plainest resonance there is. It has a **mass**, which is the note, and a **width** Γ, and nothing else. Its amplitude turns at its mass and dies at half its width, so each note is a single decaying sine.

The spectrum of that sound is the **Breit–Wigner line**: a peak at the mass, Γ wide at half its height. In Lines each ringing key's line stands as high as the chance that its state is still there, and sinks without changing its shape.`,
  },
  {
    title: 'Wide is short, narrow is long',
    views: ['Lines', 'Spectrogram'],
    preset: 'ρ meson: 19 % wide, a thud with hardly a pitch',
    play: [run('A3 C4 E4 A4', { step: 0.5, dur: 0.4, vel: 0.8 }), { at: 2.6, set: { width: 0.0000299 } }, run('A3 C4 E4 A4', { at: 3, step: 0.9, dur: 3 })],
    text: `Width times lifetime is ħ: **τ = 1/Γ**. The ρ meson's width is 19 % of its mass, so it is gone after a couple of turns: a thud whose line spreads over several keys, with hardly a pitch.

Then the J/ψ, 30 parts per million wide. Its line is a needle and it would ring for minutes; in 1974 that narrowness was the surprise that announced a new quark. In the spectrogram the first is a short smear, the second a long thin trace.`,
  },
  {
    title: 'A straight line on a log scale',
    views: ['Decay law', 'Lines'],
    set: { width: 0.002 },
    play: [note('A2', { dur: 5 }), note('A3', { at: 0.6, dur: 5 }), note('A4', { at: 1.2, dur: 5 }), note('A5', { at: 1.8, dur: 5 })],
    text: `An unstable state has no memory: in every moment the same share of what is left decays. So the chance that it is still there falls exponentially, a **straight line** on the Decay law's logarithmic scale, down by a factor e each lifetime.

All four notes have the same Γ/M, so each lives the same number of turns: the bass, turning slower, lasts longer, and each octave doubles the slope.`,
  },
  {
    title: 'Partial widths add',
    views: ['Decay law', 'Lines'],
    set: { width: 0.0003, release: 3 },
    play: [note('C4', { dur: 2, vel: 0.8 }), note('G4', { at: 3.5, dur: 1, vel: 0.8 }), { at: 4.2, pedal: true }, { at: 6.5, pedal: false }],
    text: `A state that can decay in two ways has a width for each, and they **add**. Letting a key go opens a second channel, here 3 Hz wide: the note's line in the Decay law bends down where the key came up, and its Breit–Wigner line widens as it falls.

The second note is let go with the pedal down, which keeps the channel shut; it bends when the pedal comes up. A firm press into a held key (aftertouch) opens a third.`,
  },
  {
    title: 'Born at its peak',
    views: ['Amplitude', 'Spectrum'],
    preset: 'Z boson: 2.7 %, a knock on wood',
    play: [run('A2 A3 A4', { step: 1.4, dur: 1.2, vel: 0.9 }), { at: 4.4, set: { phase: 90 } }, run('A2 A3 A4', { at: 4.6, step: 1.4, dur: 1.2, vel: 0.9 })],
    text: `The amplitude is a complex number, spiralling in: the Z shrinks by 8 % a turn. We hear one of its two parts, its height in the Amplitude view. Born on the real axis, the note starts from nothing, as a sine.

Born at 90° it starts at its peak, a cosine. The jump is a **click**, which fills in the line's far tails: a Breit–Wigner line falls only as the square of the distance from its peak, and in the spectrum the skirts rise.`,
  },
  {
    title: 'A keyboard of weak decays',
    views: ['Lines', 'Decay law'],
    preset: 'Sargent\'s rule: Γ ∝ M⁵, a bass that rings under a treble of ticks',
    play: [run('A1 A2 A3 A4 A5 A6', { step: 0.7, dur: 6, vel: 0.8 }), { at: 0, pedal: true }, { at: 9, pedal: false }],
    text: `How should the width change from key to key? Until now Γ/M was the same on every key. But a weak decay's rate grows as the **fifth power** of the energy it releases (Sargent's rule: it is why the muon lives two millionths of a second and the tau 0.3 trillionths).

With Γ ∝ M⁵ about A4, each octave up is 32 times wider: the bass would ring for hours, under a treble of ticks.`,
  },
  {
    title: 'A harp of resonances',
    views: ['Lines', 'Decay law'],
    set: { width: 0.0015 },
    play: [{ at: 0, pedal: true }, run('D3 A3 D4 F#4 A4 D5 F#5 A5 D6', { step: 0.35, dur: 0.3, vel: 0.7 }), run('G3 B3 D4 G4 B4 D5 G5', { at: 4, step: 0.35, dur: 0.3, vel: 0.6 }), { at: 9.5, pedal: false }],
    text: `With the pedal down every state lives out its own lifetime, and the keyboard is a harp of pure decays. Amplitudes add, so a key struck again while it still rings may be reinforced or cancelled, as its two states fall in or out of step.

Pitch bend is a **boost**: a moving state's energy γM is sharper, and time dilation stretches its life by the same γ. The mod wheel widens every line.`,
  },
]);
