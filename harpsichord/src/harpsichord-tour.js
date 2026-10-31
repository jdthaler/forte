// harpsichord-tour.js — the guided tour of the harpsichord's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

const arp = (at = 0) => run('C3 E3 G3 C4 E4 G4 C5', { at, step: 0.22, dur: 1.6, vel: 0.6 });

export const TOUR = tour('harpsichord', [
  {
    title: 'A quill slips off a string',
    views: ['Pluck in slow motion', 'Comb filter and spectrum'],
    play: [note('G3', { dur: 2.5 }), arp(2.5)],
    text: `A key lifts a wooden jack; its plectrum, a tiny cantilever, catches the string, **bends**, and the string slides out along it until it slips off the tip. The slow motion is about a hundred times slower than life, with the plectrum drawn to scale.

Once let go, the string vibrates freely from the shape it was pulled into. That is why touch changes the sound so little: the plectrum, not the finger, decides how far the string goes.`,
  },
  {
    title: 'Where it is plucked: the comb',
    views: ['Comb filter and spectrum', 'Spectrogram'],
    preset: 'Back 8′ alone: plucked further in, round',
    set: { xBack: 30 },
    play: [note('C5', { dur: 2.5 }), { at: 2.5, set: { xBack: 90 } }, note('C5', { at: 2.6, dur: 2.5 }), { at: 5.1, set: { xBack: 178 } }, note('C5', { at: 5.2, dur: 2.5 })],
    text: `The same c² plucked 30, 90 and 178 mm from the nut. A string let go from a kink at a fraction β of its length has partials of strength ∝ \`sin(nπβ)/n\`, so every partial with a node at the plucking point is missing: a **comb** whose notches sit at multiples of f₁/β.

As the plucking point moves in, the notches slide down the spectrum. At the middle (the last note) all the even partials are gone, and the tone turns hollow.`,
  },
  {
    title: 'Registers: two 8′ choirs',
    views: ['Comb filter and spectrum', 'The scale'],
    preset: 'Front 8′ alone: plucked near the nut, bright',
    play: [arp(0), { at: 2.6, set: { manual: 'lower', coupler: false, front8: false, back8: true } }, arp(2.7)],
    text: `A harpsichord has two sets of strings at the same pitch (two **8′ choirs**), plucked by rows of jacks at different points. The front row plucks close to the nut: its comb's notches lie high, so it sounds bright and reedy. The back row plucks further in: rounder.

The scale view shows every string to scale and where each row plucks it, from a twentieth of the length in the bass to a quarter at the top.`,
  },
  {
    title: 'Lute and buff',
    views: ['Comb filter and spectrum', 'Spectrogram'],
    preset: 'Lute row: plucked 12 mm from the nut',
    play: [arp(0), { at: 2.6, set: { manual: 'lower', lute: false, buff: true, coupler: false, front8: false, back8: true } }, arp(2.7)],
    text: `The **lute** row plucks the front strings only 12 mm from the nut: the comb's first notch is far up, so the high partials all sound strongly, and the tone is thin and nasal.

The **buff** stop presses pads of leather against the back strings near the nut. They damp the upper partials in a few periods, so the notes come out short and dull, like a lute or a harp plucked with the flesh of a finger.`,
  },
  {
    title: 'The 4′ and the full harpsichord',
    views: ['The scale', 'Spectrogram'],
    preset: '4′ alone: its own strings, an octave up',
    play: [chord('C3 G3 E4', { dur: 2.5 }), { at: 2.6, set: { coupler: true, front8: true, back8: true, four: true } }, chord('C3 G3 E4', { at: 2.7, dur: 3 })],
    text: `The **4′** choir has its own shorter strings tuned an octave up, on their own bridge. Alone it is light and silvery.

Coupled with both 8′s, each key plucks three strings at once: the brilliant *plenum* of the baroque continuo. A harpsichord gets louder only by adding strings, never by striking harder.`,
  },
  {
    title: 'Virginals: one string, two bridges',
    views: ['Pluck in slow motion', 'Comb filter and spectrum'],
    preset: 'Virginal: spinett, plucked near one end',
    play: [arp(0), { at: 2.6, set: { build: 'muselar' } }, arp(2.7), { at: 5.3, set: { hooks: true } }, chord('C2 G2 C3', { at: 5.4, dur: 2.5, vel: 0.8 })],
    text: `A **virginal** has one choir of strings running across a box, with both bridges standing on the soundboard. The jacks sit in a row across the case, so where they pluck depends on the case. The **spinett** plucks close to one end, bright and nasal; the **muselar** plucks a third of the way to nearly halfway along, so the comb's first notches fall among the low partials, and it sounds round and flute-like.

The muselar's **arpichordium** then lowers little hooks beside its bass strings. The swinging string strikes them, and the bass buzzes.`,
  },
  {
    title: 'The lute-harpsichord: gut strings',
    views: ['The scale', 'Spectrogram'],
    preset: 'Lute-harpsichord: two gut 8′s coupled',
    play: [arp(0), { at: 2.6, set: { build: 'double' } }, arp(2.7)],
    text: `Bach owned a **lute-harpsichord** (*Lautenwerck*) strung in gut. Gut is light, so its strings are shorter and under less tension than wire, and it loses energy as it bends. Its high partials fade quickly, leaving the soft, rounded tone of a lute. The same arpeggio follows on the wire-strung double.`,
  },
  {
    title: 'Meantone thirds',
    views: ['Spectrogram'],
    preset: 'Baroque pitch, ¼-comma meantone',
    set: { temperament: 'equal' },
    play: [chord('C3 E3 G3 C4', { dur: 2.5 }), chord('F3 A3 C4', { at: 2.5, dur: 2.5 }), { at: 5, set: { temperament: 'meantone' } }, chord('C3 E3 G3 C4', { at: 5.1, dur: 2.5 }), chord('F3 A3 C4', { at: 7.6, dur: 2.5 })],
    text: `Two cadences at A = 415, the first in equal temperament, the second in quarter-comma **meantone**. Equal temperament's major thirds are 14 ¢ wider than the pure 5 : 4, so their partials beat audibly; meantone makes the thirds pure and narrows the fifths a little.

Listen to the steady, sweet thirds of the second cadence: the sound of seventeenth-century music. The price is a few unusable keys far from C.`,
  },
]);
