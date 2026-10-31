// universe-tour.js — the guided tour of the early universe's physics (shared/tour.js)
import { tour, note, chord } from '../../shared/tour.js';

export const TOUR = tour('universe', [
  {
    title: 'Sound in the early universe',
    views: ['The waves', 'The sky'],
    play: [note('C3', { dur: 5 })],
    text: `For its first 380,000 years the universe was a hot **plasma** of photons, electrons and nuclei, so tightly coupled that it carried **sound**. Ripples from the very beginning set it ringing.

Then the plasma cooled enough for atoms to form (**recombination**), the light went free, and it reaches us as the cosmic microwave background, with the sound frozen into its hot and cold spots. Each note here is that history, played in a few seconds.`,
  },
  {
    title: 'Harmonics: the acoustic peaks',
    views: ['The waves', 'Spectrum'],
    play: [note('C3', { dur: 5 })],
    text: `At recombination, waves that had just reached a crest or a trough are frozen at their strongest: the **sound horizon** picks out a fundamental and its harmonics. Those are the peaks of the microwave background's power spectrum, measured by WMAP and Planck.

Watch each wave swing in *The waves*, the short ones faster, until recombination stops them. The sky view settles into spots about a degree across.`,
  },
  {
    title: 'Baryons load the odd harmonics',
    views: ['The waves', 'Spectrum'],
    preset: 'Hardly any baryons: odd and even alike',
    play: [note('C3', { dur: 4 }), { at: 4, set: { baryons: 0.06 } }, note('C3', { at: 4.1, dur: 4 })],
    text: `Ordinary matter, the **baryons**, adds weight to the plasma without adding pressure. In a gravitational well the extra weight deepens the compressions and weakens the rarefactions, so the **odd** harmonics (compressions) come out louder than the even ones.

Hardly any baryons: odd and even alike. Heavy with baryons: the odd ones stand out, the third twice the fourth. The ratio of the peaks is how we weigh the universe's baryons.`,
  },
  {
    title: 'Silk damping',
    views: ['Spectrogram', 'The waves'],
    preset: 'Helium-rich: the light diffuses',
    play: [note('C3', { dur: 4 }), { at: 4, set: { helium: 0.245 } }, note('C3', { at: 4.1, dur: 4 })],
    text: `Photons don't stay put: they random-walk between collisions with electrons, and smooth out waves shorter than the distance they wander. So the upper harmonics **die** (Joseph Silk, 1968).

With more helium there are fewer free electrons for the light to hit; it diffuses further and the note is duller. Our universe's own helium (the second note) sounds brighter.`,
  },
  {
    title: 'Dark matter’s wells',
    views: ['The universe', 'Spectrum'],
    preset: 'Little dark matter: driven by radiation',
    play: [chord('C3 G3', { dur: 4 }), { at: 4, set: { darkMatter: 0.45 } }, chord('C3 G3', { at: 4.1, dur: 4 })],
    text: `**Dark matter** feels gravity but not the photons' pressure, so it gathers into potential wells that stay while the plasma oscillates in them. With little dark matter, the universe is dominated by radiation for longer and its decaying wells drive every harmonic hard.

With much dark matter the wells stay, and the fundamental is quieter against the rest: the shape of the spectrum measures the dark matter.`,
  },
]);
