// universe-params.js — the knobs. Every key is a universe: its ingredients are Planck's, and its
// sound horizon at recombination is scaled so the acoustic peaks are the note's harmonics. The
// cosmological knobs are the ones the peaks measure; the note's are the clock that plays the first
// 380,000 years and how the light is heard.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const secs = (v) => (v < 1 ? `${(v * 1000).toFixed(0)} ms` : `${v.toFixed(v < 10 ? 2 : 1)} s`);

export const GROUPS = [
  {
    title: 'The universe',
    params: [
      { id: 'baryons', label: 'Baryon density (Ω_b h²)', perform: true, min: 0.001, max: 0.1, def: 0.02237, log: true, fmt: (v) => v.toFixed(4),
        hint: 'How much ordinary matter there is (Planck measures 0.0224). Baryons load the photons with mass but no pressure, so the fluid falls deeper into gravity\'s wells than it climbs out of them: the compressions, the odd harmonics, ring louder than the rarefactions, the even ones. They also bring more electrons to scatter off, so the light diffuses less and the upper harmonics last longer.' },
      { id: 'darkMatter', label: 'Dark matter density (Ω_c h²)', perform: true, min: 0.02, max: 0.6, def: 0.12, log: true, fmt: (v) => v.toFixed(3),
        hint: 'How much cold dark matter there is (Planck: 0.120). It decides when matter overtook radiation. A wave that starts to oscillate while radiation rules is driven: its potential well decays just as the fluid falls in, so it rebounds harder. Less dark matter, later equality: the harmonics are driven louder, the lower ones most. More: the waves fall into wells that stay, and the fundamental is quieter.' },
      { id: 'neutrinos', label: 'Neutrino species (N_eff)', min: 0, max: 8, def: 3.044, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'The radiation besides the photons, counted in neutrino species (3.044 in the Standard Model). More of it delays equality, which drives the waves harder, and the neutrinos, streaming freely through the waves instead of riding them, shift their phase and damp them a little.' },
      { id: 'helium', label: 'Helium fraction (Y_p)', min: 0, max: 0.5, def: 0.245, step: 0.001, fmt: (v) => `${(v * 100).toFixed(1)} %`,
        hint: 'The share of the baryons\' mass in helium from the first three minutes (about 24.5 %). Helium holds on to its electrons long before hydrogen does, so more helium leaves fewer free electrons to tie the photons to the fluid: the light diffuses further and the upper harmonics fade sooner.' },
      { id: 'tilt', label: 'Spectral tilt (n_s)', perform: true, min: 0.7, max: 1.3, def: 0.9649, step: 0.0001, fmt: (v) => v.toFixed(4),
        hint: 'The spectrum of the ripples inflation left. At 1 every octave of wavelengths is as strong (Harrison and Zel\'dovich\'s scale invariance); Planck measures 0.965, the short waves a little weaker, so the upper harmonics are a little quieter. Above 1 they are brighter. The mod wheel tilts it.' },
    ],
  },
  {
    title: 'The note',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'How strong the ripples are, for the computer keys (a MIDI keyboard\'s velocity does the same). The waves are linear, so it sets only how loud the note is.' },
      { id: 'recombination', label: 'Time to recombination', perform: true, min: 0.1, max: 20, def: 1.5, log: true, fmt: secs,
        hint: 'How long the universe\'s first 380,000 years take in the note. The clock runs in conformal time, the time light needs to cross a given distance: the key starts it at the beginning, and at recombination the light goes free. On the way, each harmonic\'s wave swells and fades as it oscillates, the upper ones faster, and dies away as the photons diffuse.' },
      { id: 'release', label: 'Free streaming on release', min: 0.05, max: 5, def: 0.5, log: true, fmt: secs,
        hint: 'Letting go of the key sets the light free (if recombination hasn\'t yet): the photons stream away from where they were, and what is left at any one place fades as sin x / x, the upper harmonics first. This is how long the fundamental takes to reach its first silence.' },
    ],
  },
  {
    title: 'Listening',
    params: [
      { id: 'listener', label: 'Listen to', type: 'select', def: 'sky',
        options: [['sky', 'The sky (the CMB)'], ['plasma', 'Inside the plasma']],
        hint: 'The sky: the temperature of each wave\'s light as it reaches us, its climb out of the gravitational well included (the Sachs–Wolfe effect), so the note holds the pattern recombination leaves, as the microwave background does. Inside the plasma: the temperature where the wave is; once the light is free it streams away, and the note fades by itself.' },
      { id: 'doppler', label: 'Doppler shift', type: 'checkbox', def: true, showIf: (P) => P.listener === 'sky',
        hint: 'The light of a fluid moving toward us is bluer, away redder. The fluid moves fastest a quarter cycle after it is most compressed, so the Doppler shift fills in each harmonic as its compression passes zero.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.3, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Our universe (Planck 2018)', p: {} },
  { name: 'Hardly any baryons: odd and even alike', p: { baryons: 0.002 } },
  { name: 'Heavy with baryons: the odd harmonics ring', p: { baryons: 0.06 } },
  { name: 'Little dark matter: driven by radiation', p: { darkMatter: 0.04 } },
  { name: 'Much dark matter: wells that stay', p: { darkMatter: 0.45 } },
  { name: 'More neutrinos: a later equality', p: { neutrinos: 6 } },
  { name: 'Helium-rich: the light diffuses', p: { helium: 0.45 } },
  { name: 'Scale-invariant ripples (n_s = 1)', p: { tilt: 1 } },
  { name: 'Inside the plasma: the light streams away', p: { listener: 'plasma' } },
  { name: 'Without the Doppler shift', p: { doppler: false } },
  { name: 'A slow universe: ten seconds to recombination', p: { recombination: 10 } },
  { name: 'No neutrinos: an earlier equality', p: { neutrinos: 0 } },
  { name: 'A red tilt (n_s = 0.9): the low harmonics loud', p: { tilt: 0.9 } },
  { name: 'No helium: the plasma holds the light longer', p: { helium: 0 } },
];
