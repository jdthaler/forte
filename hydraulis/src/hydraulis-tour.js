// hydraulis-tour.js — the guided tour of the hydraulis's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('hydraulis', [
  {
    title: 'Wind held up by water',
    views: ['Cistern and pumps', 'The wind'],
    play: [chord('G3 D4', { dur: 7 }), run('G4 A4 B4 C5 D5 C5 B4 A4', { at: 1, step: 0.7, dur: 0.65 })],
    text: `Ctesibius's water organ, from Alexandria in the third century BC. Pumpers push air into a bronze bowl, the *pnigeus*, standing upside down in a cistern of water. The air pushes the water down inside the bowl and up outside it: the **difference in height is the wind pressure**, and the weight of the water holds it nearly steady between strokes.

Listen under the tune for the wind swelling a little with each stroke.`,
  },
  {
    title: 'The rim: a safety valve',
    views: ['Cistern and pumps', 'The wind'],
    preset: 'Eager pumpers: a full bowl, gurgling',
    play: [chord('G3 D4', { dur: 8 })],
    text: `If the pumpers outrun the pipes, the water inside the bowl is pushed down to its rim, and then air **bubbles out** under it. So the bowl can never hold more than the depth of its rim allows: the wind has a ceiling, and an organ blown too hard **gurgles** instead of shrieking.

Watch the bubbles and the wind trace pinned at the top.`,
  },
  {
    title: 'Tired pumpers',
    views: ['The wind', 'Spectrogram'],
    preset: 'Tired pumpers: the wind sags under chords',
    play: [chord('G3 B3 D4 G4', { dur: 6 }), { at: 6, set: { effort: 0.95 } }, chord('G3 B3 D4 G4', { at: 6.1, dur: 4 })],
    text: `A chord on three ranks takes more air than tired pumpers supply. The bowl empties, the wind **sags**, and the pipes droop in pitch and thin out.

Then they pump hard and the bowl fills again: the same chord, full and steady.`,
  },
  {
    title: 'The ranks',
    views: ['Pipes', 'Spectrum'],
    preset: 'Stopped rank alone: soft and hollow',
    play: [run('G4 A4 B4 C5 D5', { step: 0.45, dur: 0.45 }), { at: 2.4, set: { open: true, stopped: false } }, run('G4 A4 B4 C5 D5', { at: 2.5, step: 0.45, dur: 0.45 })],
    text: `The organ found at Aquincum (Budapest, 228 AD) has four ranks of pipes, chosen by stopcocks. A **stopped** pipe resonates at a quarter wavelength, so it has only the **odd** harmonics: soft and hollow. An **open** pipe has them all: the bright bronze pipes found at Dion.

The pipes view draws the ranks to scale, lighting the ones that sound.`,
  },
  {
    title: 'Slides, not keys',
    views: ['Pipes', 'Spectrogram'],
    preset: 'Quick slides and a stiff iron spring',
    play: [run('G4 B4 D5 G5', { step: 0.6, dur: 0.55 }), { at: 2.5, set: { push: 40, spring: 60 } }, run('G4 B4 D5 G5', { at: 2.6, step: 0.6, dur: 0.55 })],
    text: `A key pushes a perforated **slide** under the pipes, and a spring pulls it back. Pushed across in a few milliseconds the jet starts abruptly and the pipes speak with a chiff, their upper modes first.

Pushed slowly (40 ms), the opening grows gradually and the notes **swell in**.`,
  },
]);
