// whistlers-tour.js — the guided tour of the whistlers' physics (shared/tour.js)
import { tour, note, run } from '../../shared/tour.js';

export const TOUR = tour('whistlers', [
  {
    title: 'Lightning heard from space',
    views: ['The field line', 'Spectrogram'],
    play: [note('C4', { dur: 5 })],
    text: `A lightning stroke is a crack of radio waves at every frequency. Some of it escapes up into the magnetosphere and is guided along a line of the **Earth's magnetic field** to the other hemisphere, where a radio receiver hears it as a falling **whistle**.

The plasma along the way is dispersive: in the whistler mode, higher frequencies travel faster (below about half the gyrofrequency). So the crack arrives spread out, highest first: a falling tone. Each key is a different field line.`,
  },
  {
    title: 'The nose',
    views: ['Dispersion', 'Spectrogram'],
    play: [note('G4', { dur: 6 })],
    text: `Eckersley's law says the delay goes as \`D/√f\`: the low frequencies lag most, and the whistle falls. But near the electrons' **gyrofrequency** the plasma slows the waves again, so above some frequency the delay rises.

The fastest frequency, the **nose**, is the note you play. Above it a short rising branch appears and stops at the duct's cutoff, half the gyrofrequency at the equator. Owen Storey worked this out in 1953.`,
  },
  {
    title: 'Echoes',
    views: ['The field line', 'Spectrogram'],
    preset: 'Echo train',
    play: [note('C4', { dur: 8 })],
    text: `At the far end the wave partly reflects off the ionosphere and comes back along the same line, then back again: an **echo train**. Each echo has travelled further through the same dispersive plasma, so it arrives later, slower and fainter.

Watch the packets in the field-line view: the nose ahead, the low frequencies falling behind, turning back at each end.`,
  },
  {
    title: 'The plasmapause',
    views: ['The plasma', 'Spectrogram'],
    play: [run('C4 G4 C5', { step: 1.3, dur: 1.2 }), run('G5 C6 E6 G6 C7', { at: 4, step: 1.3, dur: 1.2 })],
    text: `The dense plasma around the Earth, the **plasmasphere**, ends sharply at the **plasmapause**, some 4 or 5 Earth radii out. Beyond it, in the thin trough, whistlers are quick. Inside it, the denser plasma slows the waves and they are long and drawn out.

The field is stronger close in, so higher keys are lines closer to the Earth: this scale climbs from the trough, across the plasmapause, into the plasmasphere. A magnetic storm pushes the plasmapause in (try that preset).`,
  },
  {
    title: 'Dawn chorus',
    views: ['Spectrogram', 'The field line'],
    preset: 'Dawn chorus',
    play: [note('C4', { dur: 8 }), note('G4', { at: 2, dur: 6 })],
    text: `Not lightning at all: **chorus** is made in space, at the equator of a field line, where energetic electrons swept in from the magnetotail amplify whistler waves into rising chirps. Heard together in the early morning, they sound like birds waking: the dawn chorus.

These waves matter: they accelerate the electrons of the radiation belts and scatter them into the atmosphere as aurora.`,
  },
]);
