// drums-tour.js — the guided tour of the Timpani and Tabla's physics (shared/tour.js)
import { tour, note, run } from '../../shared/tour.js';

export const TOUR = tour('drums', [
  {
    title: 'A kettledrum',
    views: ['Drumhead', 'Overtones'],
    play: [note('D3', { dur: 3, vel: 0.6 }), note('A2', { at: 3, dur: 3, vel: 0.6 }), note('D3', { at: 6, dur: 3, vel: 0.8 })],
    text: `A timpani head is a circular membrane, struck about a quarter of the way in from the rim. A bare membrane's modes are the zeros of Bessel functions, **1 : 1.34 : 1.66 : 1.98** for the (1,1), (2,1), (3,1) and (4,1) modes: no musical series at all.

Yet a timpani has a clear pitch. In **Overtones** the solid bars sit near **1 : 1.5 : 2 : 2.5**, the 2nd to 5th harmonics of a note an octave below the principal (1,1). The hollow circles are where a bare head would put them.`,
  },
  {
    title: 'The air does it',
    views: ['Overtones', 'Spectrogram'],
    play: [note('D3', { dur: 3.5, vel: 0.7 }), { at: 3.5, set: { air: 0 } }, note('D3', { at: 3.7, dur: 4.5, vel: 0.7 })],
    text: `The head is light (a quarter of a kilogram a square metre) and the air it pushes is not: every mode drags air along, and the slow, broad ones drag the most, so they are lowered most. Rayleigh guessed it; Christian, Rossing and their colleagues worked it out in 1984.

The second note is the same drum with the air's weight taken off the head: the overtones fall back to the Bessel ratios, the clang of a bare membrane, and ring far longer, since the air was also carrying their energy away.`,
  },
  {
    title: 'The thud, and the kettle',
    views: ['Drumhead', 'Spectrogram'],
    play: [note('D3', { dur: 3, vel: 0.8 }), { at: 3, set: { strike: 0 } }, note('D3', { at: 3.2, dur: 3, vel: 0.8 }), { at: 6.2, set: { strike: 0.72, under: 1 } }, note('D3', { at: 6.4, dur: 3, vel: 0.8 })],
    text: `The round modes, (0,1) and (0,2), move air in and out of the kettle like a piston: the kettle's air pushes back, raising them, and they radiate so well they die in a tenth of a second. That is the timpani's thud.

Struck at the centre (the second note) only the round modes sound: a dull thump with no pitch. Third, back near the rim but with the kettle taken away: the thud drops in pitch, and the note's overtones shift.`,
  },
  {
    title: 'The pedal, and a hard stroke',
    views: ['Drumhead', 'Spectrogram'],
    preset: 'Timpani, wooden mallets',
    play: [note('A2', { dur: 3, vel: 1 }), note('A2', { at: 3, dur: 3, vel: 0.15 })],
    text: `The pitch-bend wheel is the timpani's **pedal**: it changes the head's tension while it rings, the glissando of orchestral timpani.

The head also stretches as it swings, so a very hard stroke starts a little sharp and glides down as it dies (the first note against the soft second). Wooden mallets leave the head in half a millisecond and reach every mode; felt stays on for several and leaves the high ones out.`,
  },
  {
    title: 'Raman’s drum',
    views: ['Drumhead', 'Overtones'],
    preset: 'Dayan: Tun (centre, open)',
    play: [note('C#4', { dur: 2, vel: 0.7 }), { at: 2, set: { syahi: 0 } }, note('C#4', { at: 2.2, dur: 2.5, vel: 0.7 })],
    text: `The tabla's right-hand drum, the **dayan**, has no kettle to tune it. Its head carries the **syahi**, a black patch of iron filings and paste laid on in layers, heaviest at the centre. C. V. Raman showed in 1934 that its weight brings nine modes onto the first five harmonics of the fundamental: (1,1) on the 2nd, (2,1) and (0,2) on the 3rd, (3,1) and (1,2) on the 4th.

The second note is the same skin without its syahi: the overtones scatter.`,
  },
  {
    title: 'Na, Tin, Te',
    views: ['Drumhead', 'Spectrogram'],
    preset: 'Dayan: Na (rim, finger on the syahi edge)',
    play: [run('C#4 C#4 C#4 C#4', { step: 0.5, vel: 0.7 }), { at: 2.2, set: { strike: 0.15, stays: true, rest: false } }, run('C#4 C#4 C#4 C#4', { at: 2.4, step: 0.25, vel: 0.7 }), { at: 3.6, set: { strike: 0.92, stays: false, rest: true } }, run('C#4 C#4 C#4 C#4 C#4', { at: 3.8, step: 0.4, vel: 0.8 })],
    text: `A tabla player chooses which modes ring with where the fingers fall. **Na**: the index finger snaps against the rim while the ring finger rests on the syahi's edge beside it, which kills the fundamental (it moves there) and spares the (1,1), whose nodal line it lies on, leaving a bright ring an octave up.

**Te** (the fast notes) strikes the syahi and stays: a dry slap. The ring of the Na comes back after them.`,
  },
  {
    title: 'The bayan’s swoop',
    views: ['Drumhead', 'Spectrogram'],
    preset: 'Bayan: Ge (press for the swoop)',
    play: [note('C3', { dur: 3, vel: 0.8, at: 0 }), note('C3', { at: 3, dur: 3, vel: 0.8 }), note('G2', { at: 6, dur: 3, vel: 0.8 })],
    text: `The left-hand drum, the **bayan**, is big and loosely tensioned. Players press the heel of the hand into its head as it rings: pressing in stretches the skin, its tension rises, and every mode slides up together, the swooping **ghe**.

Here that is **aftertouch** (or a Seaboard's pressure): lean into a held key and the drum's pitch rises with it. A loose head bends furthest.`,
  },
]);
