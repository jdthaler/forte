// ondes-tour.js — the guided tour of the ondes Martenot's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('ondes', [
  {
    title: 'Two radio oscillators, beating',
    views: ['Beat', 'Spectrum'],
    preset: 'Pure onde (no diffuseur colour)',
    play: [run('A3 C#4 E4 A4', { step: 0.8, dur: 0.75 }), note('A3', { at: 3.4, dur: 3 })],
    text: `Maurice Martenot's instrument (1928) makes its note as the theremin does: two valve oscillators run near **100 kHz**, far above hearing, one fixed and one tuned by the key. A detector hears only their **difference**, the beat between them, and that is the note.

The Beat view draws the phase between the two oscillators going round the circle once a period, and the waveform the detector makes of it: the *onde*, nearly a sine.`,
  },
  {
    title: 'The intensity key',
    views: ['Spectrum', 'Oscillators and key'],
    preset: 'Pure onde (no diffuseur colour)',
    play: [note('A3', { dur: 1.8, vel: 0.05 }), note('A3', { at: 2, dur: 1.8, vel: 0.3 }), note('A3', { at: 4, dur: 1.8, vel: 0.6 }), note('A3', { at: 6, dur: 2.5, vel: 1 })],
    text: `The left hand plays the *touche d'intensité*: a leaf spring pressing a bag of **graphite and mica powder**, which conducts better the harder it is squeezed. Nothing sounds until the key is pressed; then the level follows the finger.

Here the same A3, soft to hard. The levels come from Quartier and colleagues' measurements of a real key (2015): from 45 dB at a light touch to 95 dB at nearly 10 N. Aftertouch presses it further.`,
  },
  {
    title: 'Pulling: the oscillators tug each other',
    views: ['Beat', 'Spectrum'],
    preset: 'Strong pulling: the low notes buzz and lock',
    set: { pull: 0 },
    play: [run('A1 E2', { step: 2, dur: 1.9 }), { at: 4.2, set: { pull: 25 } }, run('A1 E2', { at: 4.5, step: 2, dur: 1.9 })],
    text: `Two oscillators this close **pull** on each other, as Huygens's clocks did (Adler's equation, 1946). The phase between them lingers where they are nearly in step and hurries past elsewhere, so the beat is no longer a sine: it leans, and its harmonics grow, each a constant fraction of the one below.

Low notes, first unpulled, then pulled hard. Each key is trimmed to stay in tune, so only the **timbre** changes: a buzz. Closer still, they would **lock** and the note would vanish.`,
  },
  {
    title: 'The drawer of timbres',
    views: ['Spectrum', 'Spectrogram'],
    play: [
      note('A3', { dur: 16, vel: 0.5 }),
      { at: 2.5, set: { tO: false, tC: true } },
      { at: 5, set: { tC: false, tg: true } },
      { at: 7.5, set: { tg: false, tG: true } },
      { at: 10, set: { tG: false, tN: true } },
      { at: 12.5, set: { tN: false, tO: true, octave: 0.6 } },
    ],
    text: `A drawer beside the keys picks how the beat is shaped: **O** (*onde*, the near sine), **C** (*creux*, half-waves: hollow), **g** and **G** (*petit gambe* and *gambe*: a triangle and a square, reedy like a viol), **N** (*nasillard*: a narrow pulse, nasal) and **8**, the octave above.

One held A3 through them all. Watch the harmonics in the spectrum: the creux adds the even ones, the gambes only odd ones, the nasillard nearly all of them.`,
  },
  {
    title: 'The ribbon',
    views: ['Spectrogram', 'Beat'],
    preset: 'Ribbon: one voice, sliding',
    play: [note('E4', { dur: 1.6 }), note('G4', { at: 1.5, dur: 1.1 }), note('A4', { at: 2.5, dur: 2.6 }), note('E5', { at: 5, dur: 1.6 }), note('D5', { at: 6.5, dur: 1.1 }), note('A4', { at: 7.5, dur: 3.5 })],
    text: `The right hand can leave the keys for the **ribbon**: a ring on the finger, on a wire stretched along the keyboard, that turns the variable oscillator's capacitor as it slides. The pitch moves continuously, so the ondes **glides** between notes, and wavers in a vibrato.

On a keyboard here, legato notes slide into each other; with MPE or a Seaboard, pitch bend slides it as the ribbon does.`,
  },
  {
    title: 'The diffuseurs',
    views: ['Diffuseurs', 'Spectrogram'],
    preset: 'Pure onde (no diffuseur colour)',
    play: [
      run('A3 C#4 E4 A4', { step: 0.35, dur: 0.3 }),
      { at: 3.8, set: { dP: 0.6, dR: 1 } }, run('A3 C#4 E4 A4', { at: 4, step: 0.35, dur: 0.3 }),
      { at: 7.8, set: { dP: 0, dR: 0, dM: 1 } }, run('A3 C#4 E4 A4', { at: 8, step: 0.35, dur: 0.3 }),
      { at: 12.8, set: { dP: 0.5, dM: 0, dPalme: 1 } }, run('A3 C#4 E4 A4', { at: 13, step: 0.35, dur: 0.3 }),
    ],
    text: `The ondes plays through loudspeakers that are instruments themselves. The same arpeggio through four: the **principal**, a plain cone; the **résonance**, with brass springs on its voice coil that chirp and ring on; the **métallique**, whose cone is a **tam-tam**; and the **palme**, with 24 strings that ring when the note is theirs.

The springs' and the tam-tam's modes are solved from their shape and metal; the Diffuseurs view lights where each rings.`,
  },
  {
    title: 'The gambe, on the ribbon, through the tam-tam',
    views: ['Spectrogram', 'Diffuseurs'],
    preset: 'Gambe on the ribbon, through the tam-tam',
    play: [note('D4', { dur: 1.6 }), note('F4', { at: 1.5, dur: 1.1 }), note('A4', { at: 2.5, dur: 2.1 }), note('D5', { at: 4.5, dur: 2.6 }), note('C5', { at: 7, dur: 1.1 }), note('A4', { at: 8, dur: 1.1 }), note('D4', { at: 9, dur: 4 })],
    text: `All of it together, as Messiaen used the ondes in the *Turangalîla-Symphonie* and Jonny Greenwood in Radiohead: the gambe sliding on the ribbon, with vibrato, ringing the tam-tam's halo after it.

Try the presets, or press a key harder and softer, and see what the pulling, the drawer and the diffuseurs do.`,
  },
]);
