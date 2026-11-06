// marimba-tour.js — the guided tour of the marimba's and the xylophone's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('marimba', [
  {
    title: 'A tuned wooden bar',
    views: ['Bar and modes', 'Spectrum'],
    play: [note('C3', { dur: 2.5, vel: 0.7 }), note('G3', { at: 2.5, dur: 2.5, vel: 0.7 })],
    text: `A rosewood bar hangs on cords at the nodes of its first mode. Plain, its modes would go as 1 : 2.76 : 5.40, a clang; the deep **arch cut** underneath thins the middle, where the low modes bend most, until they sit at **1 : 4 : 10**, two octaves and then three octaves and a third above the note.

The bar view draws the three modes moving with their live amplitudes; the spectrum marks where the model puts them.`,
  },
  {
    title: 'The xylophone: a twelfth',
    views: ['Bar and modes', 'Spectrum'],
    preset: 'Xylophone: hard plastic mallets',
    play: [run('F4 A4 C5 F5', { step: 0.35, dur: 0.8 }), { at: 2, set: { kind: 'marimba' } }, run('F4 A4 C5 F5', { at: 2.2, step: 0.35, dur: 0.8 })],
    text: `The same wood cut another way. A xylophone bar is thick, with a short, shallow cut that tunes only its first overtone, to **3 × f₁**: a twelfth, an octave and a fifth. Its third mode falls where the cut leaves it, near 6. With hard mallets that is the bright, dry knock of the orchestral xylophone.

Then the same notes on marimba bars with the same mallets: the overtones two octaves up, a rounder sound.`,
  },
  {
    title: 'The resonators',
    views: ['Resonator', 'Spectrogram'],
    preset: 'No resonators: the bars alone',
    play: [run('C3 E3 G3 C4', { step: 0.6, dur: 1.2 }), { at: 2.8, set: { tubes: true } }, run('C3 E3 G3 C4', { at: 2.9, step: 0.6, dur: 1.2 })],
    text: `Without its tube a bar is a feeble radiator: its two faces push the air in opposite directions. Under each bar hangs a tube closed at the bottom, cut to a **quarter wavelength** of the bar's note: over a metre long at C2.

The bar drives the air at the tube's mouth and the tube radiates it, so the fundamental comes up by more than 10 dB. The note gets shorter too: the sound the tube gives off is energy the bar loses (watch the energy plot).`,
  },
  {
    title: 'The tube’s second resonance',
    views: ['Resonator', 'Spectrum'],
    preset: 'Xylophone: hard plastic mallets',
    set: { strike: 0.15, gap: 10 },
    play: [note('A4', { dur: 2 }), note('E5', { at: 1, dur: 2 }), { at: 3, set: { offset: 0.2 } }, note('A4', { at: 3.2, dur: 2 }), note('E5', { at: 4.2, dur: 2 })],
    text: `A stopped tube rings only at odd multiples of its first resonance, so it also resonates at **3 × f₁**, right on the xylophone's first overtone. The textbooks say that is why xylophones are tuned to a twelfth.

But mode 2 rocks the bar about its centre, where the mouth sits: one half pushes air in as the other draws it out, and a centred tube gets nothing from it (κ = 0 in the readout). Moved **off centre**, the mouth takes it up, and the twelfth speaks through the tube.`,
  },
  {
    title: 'Mallets',
    views: ['Bar and modes', 'Spectrum'],
    preset: 'Soft yarn: dark and round',
    play: [chord('C4 E4 G4', { dur: 2.2, vel: 0.8 }), { at: 2.3, set: { hardness: 12000, mass: 12 } }, chord('C4 E4 G4', { at: 2.4, dur: 2.2, vel: 0.8 })],
    text: `A mallet head is a spring that stiffens as it is squashed. A soft yarn head stays on the bar for over a millisecond, longer than a period of the upper modes, and wakes only the fundamental. A hard plastic one leaves in a fraction of that and rings everything: the **contact time** in the bar view sets the colour as much as the cut does.`,
  },
  {
    title: 'The roll',
    views: ['Spectrogram', 'Bar and modes'],
    preset: 'Marimba rolled: a chorale',
    play: [chord('F3 C4 A4', { dur: 3 }), chord('G3 B3 G4', { at: 3, dur: 3 }), chord('C3 E4 G4 C5', { at: 6, dur: 4.5 })],
    text: `Wood loses energy a hundred times faster than the vibraphone's aluminium, so a marimba note is gone in a second or two and no pedal can hold it. A marimbist **rolls** instead: the two mallets strike in turn a dozen times a second while the note is held.

The mod wheel sets the roll, and a note’s own MPE slide rolls that note alone.`,
  },
]);
