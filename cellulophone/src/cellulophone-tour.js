// cellulophone-tour.js — the guided tour of the Cellulophone's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('cellulophone', [
  {
    title: 'Light chopped by a disc',
    views: ['Disc', 'Window and screen'],
    preset: 'A pure sine screen',
    play: [run('C4 E4 G4 C5', { step: 0.8, dur: 0.75 }), chord('C4 E4 G4', { at: 3.4, dur: 3 })],
    text: `Pierre Toulon's Cellulophone (1927) makes sound from **light**. A lamp shines through a turning disc of narrow slots onto a photocell, and every slot that passes is one flash: a ring of N slots on a disc turning Ω times a second gives N·Ω hertz.

One disc carries an octave, twelve rings of slots, C innermost. A key tilts a little mirror into its ring's beam and sends the light to the cell. Watch the Disc view light the rings you hear.`,
  },
  {
    title: 'The screen is the waveform',
    views: ['Window and screen', 'Spectrum'],
    preset: 'A pure sine screen',
    play: [note('A3', { dur: 10 }), { at: 2, set: { screen: 'clarinet' } }, { at: 4, set: { screen: 'oboe' } }, { at: 6, set: { screen: 'violin' } }, { at: 8, set: { screen: 'horn' } }],
    text: `In front of each ring sits a window one slot apart wide, holding a **screen**: a transparent plate drawn with one period of the wave, clear where the wave is high. As a slot crosses the window, the light through it follows the drawing, and so does the cell's current.

One held A3 as the stops change the screens: sine, clarinet (odd harmonics only), oboe, violin and hunting horn. The window shows each drawing, the spectrum its harmonics.`,
  },
  {
    title: 'The slot averages the screen',
    views: ['Window and screen', 'Spectrogram'],
    preset: 'Violon',
    play: [note('C3', { dur: 9 }), { at: 2, set: { slot: 0.15 } }, { at: 4, set: { slot: 0.3 } }, { at: 6, set: { slot: 0.025 } }],
    text: `A slot is not a line: it lets through the screen across its whole width at once, so the light is the drawing **averaged over the slot**. Harmonic n is weighted by sinc(n·a), a the slot's width over the slot pitch: it vanishes where n·a is a whole number.

One C3 as the slots widen to 15 % and 30 % of the pitch, then narrow to 2.5 %: wide slots let in more light and lose the top harmonics (watch them go in the spectrogram); narrow ones are bright and faint.`,
  },
  {
    title: 'Whole slots: permanently out of tune',
    views: ['Disc tuning', 'Disc'],
    play: [chord('C4 E4 G4', { dur: 3 }), { at: 3.2, set: { disc: '864' } }, chord('C4 E4 G4', { at: 3.4, dur: 3 }), { at: 6.6, set: { disc: '54' } }, chord('D4 F#4 A4', { at: 6.8, dur: 3 })],
    text: `Each ring needs N₀·2^(k/12) slots for semitone k, but a ring has a whole number of them. On Toulon's disc the C ring has 54, and rounding leaves notes up to 12 ¢ off: Tom Rhea called the instrument "permanently out of tune". Every octave's disc turns exactly twice as fast as the one below, so the error repeats in each octave.

A C major chord on the 54-slot disc, then on one sixteen times as fine, then D major back on the coarse disc, its F♯ 12 ¢ flat. The Disc tuning view shows each ring's error.`,
  },
  {
    title: 'Touch: depth and push',
    views: ['Window and screen', 'Spectrum'],
    preset: 'Hautbois',
    play: [run('G3 B3 D4 G4', { step: 0.5, dur: 0.45, vel: 0.3 }), run('G3 B3 D4 G4', { at: 2.2, step: 0.5, dur: 0.45, vel: 1 }), note('D4', { at: 4.6, dur: 5 }), { at: 5.6, set: { push: 0.5 } }, { at: 7.2, set: { push: 1 } }],
    text: `Toulon's keys move two screens. Pressed **down**, a key slides a screen whose clearness grows evenly with depth into its beam: a light touch lets little light through. Pushed **back**, it slides a narrowing slit into its window; stacked screens multiply, so the light comes in shorter, brighter flashes.

Soft notes, then hard; then a held D4 pushed back (the mod wheel, or MPE slide one key at a time): watch the flashes narrow and the harmonics climb.`,
  },
  {
    title: 'Lamps on the mains, and a selenium cell',
    views: ['Spectrum', 'Spectrogram'],
    play: [chord('C3 G3 E4', { dur: 3 }), { at: 3.1, set: { lamp: '50' } }, chord('C3 G3 E4', { at: 3.2, dur: 3 }), { at: 6.3, set: { lamp: 'battery', cell: 'selenium' } }, run('C4 E4 G4 C5 E5', { at: 6.5, step: 0.25, dur: 0.24 }), chord('C3 G3 E4', { at: 8, dur: 2.5 })],
    text: `On alternating current a tungsten filament cools a little between peaks, so its light ripples at **twice the mains frequency**. That ripple multiplies every note's light: each held chord brings a 100 Hz hum and sidebands 100 Hz either side.

Then a **selenium** cell, which the patent rules out for one "without inertia": it answers slowly and not in proportion to the light, so quick notes smear and a chord sharing a cell grows difference tones.`,
  },
  {
    title: 'Eight timbres at once, and the damping arcs',
    views: ['Disc', 'Spectrogram'],
    preset: 'Eight timbres: a screen for each octave',
    play: [run('C2 G2 C3 G3 C4 G4 C5 G5 C6', { step: 0.35, dur: 2.6 }), { at: 5.5, set: { damping: 2, screen: 'violin', mirror: 3 } }, run('C4 E4 G4 C5', { at: 5.7, step: 0.6, dur: 3 }), chord('F3 A3 C4 F4', { at: 8.4, dur: 3 })],
    text: `Each octave has its own disc, so each can carry its own screens: Rhea noted the design allowed **eight different timbres** on one keyboard. Climbing the octaves here moves from violin through horn and oboe to flute and sine.

Last, Toulon's **damping arcs**: slots whose length shortens along an arc, so a note's light narrows away "like a piano", falling in a straight line rather than a ring's exponential.`,
  },
]);
