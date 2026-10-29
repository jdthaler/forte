// tess-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound. Every key is a planet crossing its star, as NASA's Transiting
// Exoplanet Survey Satellite (TESS) sees it: the star's light, dimmed once an orbit, is played
// as sound, sped up so that the planet's year is the key's note.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const ppm = (v) => (v >= 0.01 ? `${(v * 100).toFixed(1)} %` : `${(v * 1e6).toFixed(0)} ppm`);
const days = (v) => (v < 1 ? `${(v * 24).toFixed(1)} hours` : `${v.toFixed(2)} days`);

export const GROUPS = [
  {
    title: 'The star',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'How hard the computer keys play (a MIDI keyboard\'s velocity does the same). A harder key is a brighter star: its light, and so its transits, are louder in proportion, and they stand further out of the photon noise, which only grows as the square root of the light.' },
      { id: 'tmag', label: 'TESS magnitude', min: 4, max: 17, def: 9, step: 0.1, fmt: (v) => `T = ${v.toFixed(1)}`,
        hint: 'How bright the star is in TESS\'s red band, at full velocity (softer keys are fainter). Each magnitude is 2.5 times less light: TESS collects about 10,000 photons a second from a T = 10 star. Fewer photons, more hiss: the shot noise, the cameras\' read noise and the zodiacal light, over a floor of 60 ppm in an hour.' },
      { id: 'teff', label: 'Temperature', face: 'dial', min: 3000, max: 7000, def: 5772, step: 1, fmt: (v) => `${v.toFixed(0)} K`,
        hint: 'The star\'s surface temperature, which sets how much darker its rim is than its centre in TESS\'s band (limb darkening). A cool M dwarf\'s disc fades strongly toward the edge, so a planet crossing it dims the light in a rounded U, softer at the top of the spectrum; a hot star\'s disc is flatter.' },
      { id: 'starMass', label: 'Mass', min: 0.08, max: 3, def: 1, log: true, fmt: (v) => `${v < 1 ? v.toFixed(3) : v.toFixed(2)} M☉`,
        hint: 'With the planet\'s year (its key), the star\'s mass sets the size of the orbit (Kepler\'s third law): a heavier star holds the planet further out, where it crosses the disc in a smaller share of its year, so the dips are narrower and the note brighter, with more harmonics.' },
      { id: 'starRadius', label: 'Radius', min: 0.01, max: 3, def: 1, log: true, fmt: (v) => `${v < 0.1 ? v.toFixed(4) : v < 1 ? v.toFixed(3) : v.toFixed(2)} R☉`,
        hint: 'A bigger star is crossed for longer (a wider dip, a mellower note) and dimmed less by the same planet (a quieter note). White dwarfs are about the size of the Earth.' },
    ],
  },
  {
    title: 'The planet',
    params: [
      { id: 'planetRadius', label: 'Radius', min: 0.3, max: 25, def: 11.21, log: true, fmt: (v) => `${v < 10 ? v.toFixed(2) : v.toFixed(1)} R⊕`,
        hint: 'The planet\'s radius, in Earths (Jupiter is 11.2). It blocks a share of the light about its area over the star\'s, (Rp/R★)²: a hot Jupiter dims a Sun-like star by 1 %, the Earth by 84 parts in a million. It also sets how long the planet takes to cover the star\'s edge, the rounding of each dip\'s corners.' },
      { id: 'impact', label: 'Impact parameter', perform: true, min: 0, max: 1.1, def: 0.3, step: 0.001,
        fmt: (v) => (v > 1 ? 'misses the star' : `${(v * 100).toFixed(0)} % of grazing`),
        hint: 'How far from the star\'s centre the planet\'s path crosses it, as a share of the furthest that still touches (b = 1 + Rp/R★, in stellar radii). Through the middle each dip is deep and flat-bottomed, rounded by the darker rim. Toward the edge it is shallower and shorter, so the note fades and thins to a buzz (a shorter pulse has more harmonics), and grazing it turns into a V, until the planet misses and only the hiss is left. The mod wheel moves it.' },
    ],
  },
  {
    title: 'The light curve',
    params: [
      { id: 'periodA4', label: 'Orbit at A4 (speed-up)', min: 0.05, max: 400, def: 1, log: true, fmt: days,
        hint: 'The year of the planet on A4: every key\'s planet goes round in that time × 440 Hz / its note, and the light is played that much faster. At one day, a planet with a one-day year plays A4, the speed-up is 38 million, and A0 is a 16-day orbit. A star\'s planets in resonance play in tune: periods in the ratio 3 : 2 are a fifth apart.' },
      { id: 'scale', label: 'Full scale', min: 1e-5, max: 1, def: 0.01, log: true, fmt: ppm,
        hint: 'How deep a dip plays at full level, the light curve\'s vertical zoom. Zooming in on a small planet brings up its transits and the photon noise together: the zoom cannot change how clearly a planet stands out of the noise.' },
      { id: 'noise', label: 'Photon noise', type: 'checkbox', def: true,
        hint: 'The hiss of counting photons (and the cameras\' read noise and the zodiacal light), at the star\'s brightness, while a key is held. Off: the light curve as a noiseless model.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.25, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

// Real systems TESS found, with the numbers of their discovery papers (the NASA Exoplanet
// Archive's solutions; see the README): each preset puts the planet's own year on A4.
export const PRESETS = [
  { name: 'A hot Jupiter round a Sun-like star', p: {} },
  { name: 'π Mensae c: TESS\'s first planet (on A4)', p: { tmag: 5.1, teff: 6037, starMass: 1.094, starRadius: 1.1, planetRadius: 2.042, impact: 0.58, periodA4: 6.2679, scale: 4e-4 } },
  { name: 'LHS 3844 b: a hot rock round an M dwarf (on A4)', p: { tmag: 11.9, teff: 3036, starMass: 0.151, starRadius: 0.189, planetRadius: 1.323, impact: 0.175, periodA4: 0.46293, scale: 6e-3 } },
  { name: 'TOI-700 d: an Earth in the habitable zone (on A4)', p: { tmag: 10.9, teff: 3480, starMass: 0.416, starRadius: 0.42, planetRadius: 1.19, impact: 0.39, periodA4: 37.426, scale: 1e-3 } },
  { name: 'WD 1856+534 b: a giant round a white dwarf (on A4)', p: { tmag: 16.3, teff: 4710, starMass: 0.518, starRadius: 0.0131, planetRadius: 10.4, impact: 0.865, periodA4: 1.40794, scale: 0.6 } },
  { name: 'The Earth and the Sun (a year on A4)', p: { planetRadius: 1, impact: 0, periodA4: 365.256, scale: 1.2e-4 } },
  { name: 'Grazing: short V-shaped dips', p: { impact: 0.97, scale: 1e-3 } },
  { name: 'A noiseless light curve', p: { noise: false } },
];
