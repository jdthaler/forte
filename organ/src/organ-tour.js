// organ-tour.js — the guided tour of the tonewheel organ's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

// the drawbars, as a registration is written: '888000000' (16′ 5⅓′ 8′ 4′ 2⅔′ 2′ 1⅗′ 1⅓′ 1′)
const bars = (r) => Object.fromEntries([...r].map((d, i) => [`drawbar${i + 1}`, +d]));
const dry = { vib: 'off', leslie: 'bypass', drive: 0 };

export const TOUR = tour('organ', [
  {
    title: 'Ninety-one spinning wheels',
    views: ['Tone generator — 91 wheels', 'Spectrogram'],
    set: { ...bars('008000000'), ...dry },
    play: [note('A4', { dur: 2.5 }), chord('C4 E4 G4', { at: 2.5, dur: 3 })],
    text: `Inside a Hammond, a synchronous motor locked to the mains turns one long shaft. Through twelve gear pairs it drives **91 steel tonewheels**, each with a bumpy edge spinning past a magnet and coil: a near-pure sine. One drawbar, one wheel per key.

The gears are small-integer ratios, so every wheel is a little off equal temperament (the bars): A4 is exactly 440 Hz, the rest within a cent, the top wheels a pure fifth sharp.`,
  },
  {
    title: 'Drawbars: harmonics from shared wheels',
    views: ['What a key really plays', 'Spectrogram'],
    set: { ...bars('008000000'), ...dry },
    play: [note('C4', { dur: 9 }), { at: 1.5, set: bars('808000000') }, { at: 3, set: bars('888000000') }, { at: 4.5, set: bars('888800000') }, { at: 6, set: bars('888888000') }, { at: 7.5, set: bars('888888888') }],
    text: `Nine drawbars mix nine wheels into each key: octaves, fifths, and a third two octaves up. One C4, the drawbars pulled out one by one.

But the "harmonics" are **other keys' wheels**, so they are tempered: the 1⅗′ (meant as the 5th harmonic) is 14 ¢ sharp. Inside one note the non-octave lines slowly slide in phase against the octaves, and across a chord, coinciding tones are the same wheel, so a Hammond chord **cannot beat**.`,
  },
  {
    title: 'Percussion',
    views: ['Spectrogram', 'Output'],
    set: { ...bars('888000000'), percOn: true, percThird: true, percFast: true, vib: 'C3', leslie: 'slow' },
    play: [run('C4 E4 G4 C5', { step: 0.35, dur: 0.25 }), run('C4 E4 G4 C5', { at: 1.8, step: 0.35, dur: 0.4 })],
    text: `Percussion is a decaying burst of the 2nd or 3rd harmonic's wheel, here the third (the 2⅔′), fast: the jazz organ's bark.

It is **single-trigger**: it re-arms only when every key is up. The first phrase is detached, and each note barks; the second is legato, each key held into the next, and only the first does.`,
  },
  {
    title: 'The scanner vibrato',
    views: ['Spectrogram', 'Output'],
    set: { ...bars('888000000'), vib: 'off', leslie: 'bypass' },
    play: [chord('C4 E4 G4', { dur: 3 }), { at: 3, set: { vib: 'V3' } }, chord('C4 E4 G4', { at: 3.1, dur: 3 }), { at: 6.1, set: { vib: 'C3' } }, chord('C4 E4 G4', { at: 6.2, dur: 3 })],
    text: `Dry, then vibrato, then chorus. The signal runs down an **LC ladder**, an artificial transmission line, and a rotating capacitive scanner taps it ever further along and back: a delay that swings, so the pitch swings, about ±22 ¢ at V3. The ladder's cutoff near 6 kHz darkens the tone a little.

The chorus settings mix the scanned signal with the dry one, and the two beat: the shimmering C3 setting.`,
  },
  {
    title: 'The Leslie: Doppler, rotating',
    views: ['Leslie, from above', 'Spectrogram'],
    set: { ...bars('888800000'), vib: 'C3', leslie: 'slow', drive: 0.2 },
    play: [chord('G3 B3 D4 G4', { dur: 10 }), { at: 3, set: { leslie: 'fast' } }, { at: 7, set: { leslie: 'slow' } }],
    text: `Don Leslie's cabinet spins a **horn** for the treble and a **drum** for the bass. A rotating source moves toward you and away: Doppler shift, and the beam sweeping past the walls and the microphones.

Switched to fast, the light horn catches up in under a second while the heavy drum takes several, and they fall out of step: the famous ramp. Watch the rotors in the top view.`,
  },
  {
    title: 'Tube drive',
    views: ['Output', 'Spectrogram'],
    set: { ...bars('888800000'), vib: 'C3', leslie: 'fast', drive: 0.75 },
    play: [chord('E3 B3 E4', { dur: 2 }), chord('G3 D4 G4', { at: 2, dur: 1 }), chord('A3 E4 A4', { at: 3, dur: 3 })],
    text: `The amplifier's triode, driven hard, rounds off the waveform's peaks. It is biased off centre, so the curve is **asymmetric** and adds even harmonics as well as odd: the growl of rock organ.

The more it is driven, the more a full chord is compressed rather than just getting louder.`,
  },
]);
