// arc-tour.js — the guided tour of the singing arc's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('arc', [
  {
    title: 'A lamp that sings',
    views: ['The arc', 'V–I loop'],
    play: [run('G4 G4 A4 F#4 G4 A4', { step: 0.55, dur: 0.5 })],
    text: `William Duddell, London, 1900: a carbon **arc lamp** with a coil and a capacitor across it sings, and he played *God Save the Queen* on it with a keyboard of capacitors.

The arc's column has a **falling** characteristic: more current heats it, which lowers its resistance so much that the voltage across it drops. That is a negative resistance, and across a tuned circuit it pumps energy in instead of taking it out. The column itself breathes with the current, and the air around it is the loudspeaker.`,
  },
  {
    title: 'A loop, not a line',
    views: ['V–I loop', 'Spectrogram'],
    play: [note('E4', { dur: 4 })],
    text: `A steady arc sits on its static curve. Singing, the operating point runs round a **loop**: the column takes some 26 µs to heat and cool, so while the current rises it is still cool (above the curve), and while it falls still hot (below).

That thermal memory sets an upper limit: an arc can't sing faster than its column can follow. Each note grows out of the arc's flicker in about a tenth of a second, a little below Kelvin's frequency (the blue tick).`,
  },
  {
    title: 'Too slow to sing high',
    views: ['Spectrogram', 'V–I loop'],
    preset: 'Slow column (τ 150 µs): the top keys fall silent',
    play: [run('G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6', { step: 0.45, dur: 0.43 })],
    text: `A column six times slower (150 µs) has a ceiling near 843 Hz. The scale climbs, the notes speak later and weaker, G5 barely sounds, and **A5 and above stay silent**: the column can no longer follow, its loop closes up and the negative resistance is gone.`,
  },
  {
    title: 'Keys add capacitors',
    views: ['Circuit', 'Spectrogram'],
    play: [note('C5', { dur: 6 }), note('E5', { at: 2, dur: 2 })],
    text: `Each key switches a capacitor into the circuit. Two keys on one arc put two capacitors **in parallel**: their capacitance adds, so \`f = 1/2π√(LC)\` falls, and the arc sings **one note below both**.

C5, then E5 added: the pitch steps down. Let E5 go and C5 comes back. One arc is a monophonic instrument (the *Several arcs* preset gives a lamp per key).`,
  },
  {
    title: 'Singing and hissing',
    views: ['V–I loop', 'Spectrogram'],
    play: [note('E4', { dur: 8 }), { at: 2, set: { current: 6 } }, { at: 4, set: { current: 9 } }, { at: 6, set: { current: 14 } }],
    text: `E4 held while the current through the arc rises. The falling curve flattens, and at about 7 A the arc starts to **hiss**: the column turns turbulent and noise fills the top of the spectrogram. Higher still, the song dies and only the hiss is left.`,
  },
  {
    title: 'The talking arc',
    views: ['The arc', 'Spectrum'],
    preset: "Simon's talking arc",
    play: [note('C4', { dur: 5 })],
    text: `Hermann Theodor Simon found in 1898 that a microphone's current fed into an arc makes it **speak**: the column heats and cools with the signal and reproduces it as sound, a loudspeaker with no moving parts.

The page has no microphone, so a synthesised singer gliding round the vowels a–e–i–o–u feeds the arc; the keys set its note.`,
  },
]);
