// ionchain-tour.js — the guided tour of the ion chain's physics (shared/tour.js)
import { tour, note, chord } from '../../shared/tour.js';

export const TOUR = tour('ionchain', [
  {
    title: 'One, two, three ions',
    views: ['Crystal', 'Modes'],
    preset: 'One ion: a pure tone',
    play: [
      note('A3', { dur: 2.8 }),
      { at: 3, set: { ions: 2 } }, note('A3', { at: 3.1, dur: 2.8 }),
      { at: 6.1, set: { ions: 3 } }, note('A3', { at: 6.2, dur: 3.5 }),
    ],
    text: `Ions held in a trap's electric fields and cooled by lasers settle into a line, a **Coulomb crystal**, each pushing on its neighbours. A key kicks it with a laser pulse, and the chain can only ring as a whole: in its **normal modes**.

One ion is a pure tone, the trap's own frequency. Two add the **breathing mode** at √3 = 1.732 times it (951 cents up); three add √(29/5) = 2.41. The modes view shows each one's shape.`,
  },
  {
    title: 'A chain rings like a bell',
    views: ['Spectrum', 'Spectrogram'],
    preset: 'Five calcium ions, the end one kicked',
    play: [note('C3', { dur: 3 }), chord('C3 E3 G3', { at: 3.2, dur: 4 })],
    text: `Five ions, the end one kicked. Each ion after the first adds a partial, a little higher each time: 1, 1.732, 2.41, 3.05 … times the note. No harmonic series, so a chord rings like **bells**.

The ratios don't depend on the ion, its charge or the trap: only on the Coulomb force and the number of ions in the line.`,
  },
  {
    title: 'Where the laser lands',
    views: ['Crystal', 'Spectrum'],
    preset: 'The centre ion kicked: the even modes fall silent',
    set: { beam: 1 },
    play: [note('A3', { dur: 3 }), { at: 3.2, set: { beam: 0 } }, note('A3', { at: 3.3, dur: 3.5 })],
    text: `Seven ions: first the end one kicked, then the **centre** one. A mode is rung in proportion to how far the kicked ion moves in it.

In every second mode (the breathing mode among them) the two halves move in mirror image and the centre ion stands still, so a kick there rings only the others (1, 2.41, 3.68 …). The sound goes hollower, as a string plucked at its middle loses its even harmonics.`,
  },
  {
    title: 'A beam along the axis',
    views: ['Modes', 'Spectrum'],
    preset: 'A beam along the axis: the centre of mass alone',
    set: { angle: 30 },
    play: [note('A3', { dur: 3 }), { at: 3.2, set: { angle: 0 } }, note('A3', { at: 3.3, dur: 3.5 })],
    text: `The laser at 30° to the chain, then along it. A beam along the axis pushes every ion it lights the same way, and if it lights them evenly the push goes into the **centre of mass** alone: a pure tone, whatever the number of ions.

The centre-of-mass mode is untouched by the ions' repulsion, which pulls on them in pairs and cancels in the sum (Kohn's theorem), so it always rings at the trap's frequency: the note.`,
  },
  {
    title: 'What the electrodes hear',
    views: ['Modes', 'Spectrogram'],
    preset: 'Far electrodes, as in a real trap: the centre of mass alone',
    set: { distance: 2 },
    play: [note('A3', { dur: 4 }), { at: 4.2, set: { distance: 60 } }, note('A3', { at: 4.3, dur: 5 })],
    text: `The sound is the current the moving ions induce in the trap's electrodes, which is how a real trap listens to its ions. Close by, each electrode hears the nearest ions most and picks up every mode.

Moved far away, its field is the same at every ion, so only the centre of mass sends it current: the partials fade **from the top down** until only the note is left. Held notes fade too, as the current loses energy in the electrodes' resistor; the modes heard best fade first.`,
  },
  {
    title: 'The zigzag',
    views: ['Crystal', 'Spectrogram'],
    preset: 'A zigzag of eight ions',
    set: { aniso: 6 },
    play: [
      { at: 0, pedal: true }, note('A3', { dur: 10, vel: 0.7 }),
      { at: 2.5, set: { aniso: 4.6 } }, { at: 4, set: { aniso: 4 } }, { at: 5.5, set: { aniso: 3.6 } }, { at: 7, set: { aniso: 3.2 } },
      { at: 10, pedal: false },
    ],
    text: `Eight ions with a key held while the trap's **radial pull** weakens (the mod wheel does this). The ions' repulsion squeezes the line, and as the pull holding it straight weakens, the side-to-side zigzag mode softens until its frequency reaches zero: for eight ions, when the radial frequency falls to 3.78 times the axial one.

There the line **buckles into a zigzag**, a continuous phase transition. The partials slide, and the radial modes, now heard by the electrodes, come in.`,
  },
]);
