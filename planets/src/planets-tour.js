// planets-tour.js — the guided tour of the Ringing Planets' physics (shared/tour.js)
import { tour, note } from '../../shared/tour.js';

export const TOUR = tour('planets', [
  {
    title: 'The Earth rings',
    views: ['Planet', 'Spectrogram'],
    play: [note('C3', { dur: 5, vel: 0.8 }), { at: 0, pedal: true }],
    text: `After a great quake the **whole Earth** vibrates for days, like a struck bell. Its slowest tone, ₀S₂, the "football mode", squashes the planet one way and then the other once every **54 minutes**. Seismometers first caught it after the Chilean quake of 1960.

Here the Earth is sped up until ₀S₂ is the key's note: a crack first (the surface waves racing round the planet), then the tones that ring on.`,
  },
  {
    title: 'Hundreds of standing waves',
    views: ['Spectrum', 'Mode table'],
    play: [note('C3', { dur: 4, vel: 0.9 }), { at: 0, pedal: true }],
    text: `Each tone is a standing wave of the whole planet: **spheroidal** modes ₙSₗ, which move the ground up and down, and **toroidal** modes ₙTₗ, which twist it. l counts the wave's nodal lines round the planet, n its nodes with depth. ₀S₀, the breathing mode, swells and shrinks the whole planet every 20 minutes and rings longest of all.

The frequencies here were solved from PREM, the reference Earth, and land within half a per cent of the measured ones.`,
  },
  {
    title: 'The spin splits each tone',
    views: ['Spectrum', 'Planet'],
    set: { spin: 0 },
    play: [note('C4', { dur: 3.5 }), { at: 3.5, set: { spin: 1 } }, note('C4', { at: 3.6, dur: 4 }), { at: 0, pedal: true }],
    text: `A mode of degree l is really 2l + 1 patterns. On a still planet they share one frequency; the **Coriolis force** of its spin pulls them apart, so ₀S₂ splits into five tones a few per cent apart, which beat.

First a planet that does not turn: one steady tone. Then the Earth's own day: the football mode **warbles**, as it did on the gravimeters after Sumatra in 2004.`,
  },
  {
    title: 'Where you listen',
    views: ['Planet', 'Spectrum'],
    preset: 'Earth: an explosion heard 90° away (odd degrees silent)',
    play: [note('C3', { dur: 3.5 }), { at: 3.5, set: { distance: 45 } }, note('C3', { at: 3.6, dur: 3.5 }), { at: 0, pedal: true }],
    text: `Each mode has nodal lines on the surface, and a station sitting on one hears nothing of it. An explosion rings every mode symmetrically about itself, so **90°** away every odd degree has a node: half the tones go. Moved to 45°, they come back.

The ★ is the quake and the ▲ the station.`,
  },
  {
    title: 'Deep quakes ring overtones',
    views: ['Spectrum', 'Inside'],
    play: [note('C3', { dur: 3.5 }), { at: 3.5, set: { depth: 640, mech: 'normal' } }, note('C3', { at: 3.6, dur: 3.5 }), { at: 0, pedal: true }],
    text: `A mode is rung by how much it strains the rock **where the fault slips**. The fundamental modes live near the surface, so a shallow quake rings them hardest. A quake 640 km down, like Bolivia's in 1994, rings the overtones, whose motion reaches deep: the crack goes and other tones come forward.`,
  },
  {
    title: 'Mars and the Moon',
    views: ['Inside', 'Spectrogram'],
    set: { planet: 'mars' },
    play: [note('C4', { dur: 4 }), { at: 4, set: { planet: 'moon' } }, note('C4', { at: 4.1, dur: 6 }), { at: 0, pedal: true }],
    text: `Neither has been heard ringing yet, but InSight's marsquakes and Apollo's moonquakes measured what is inside them, and the modes follow. Mars has a big **liquid core** and a lossy mantle. The Moon is small and bone-dry: its rock hardly damps at all, so it rings far longer.

Pick a planet on the keyboard bar and play.`,
  },
]);
