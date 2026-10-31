// grand-tour.js — the guided tour of the electric grand's physics (shared/tour.js)
import { tour, note, chord } from '../../shared/tour.js';

export const TOUR = tour('grand', [
  {
    title: 'Strings heard through the bridge',
    views: ['Slow motion: hammer, string, bridge force', 'Spectrum'],
    play: [chord('C3 G3 E4', { dur: 3.5, vel: 0.6 }), note('C5', { at: 3.5, dur: 3, vel: 0.6 })],
    text: `An electric grand (Yamaha's CP-70) has real hammers and strings but no soundboard: the strings sit on a heavy frame, and a **piezo** pickup under each bridge hears the force the strings put on it.

The slow motion shows the hammer leaving a kink that runs to the bridge and back; each time it arrives, the force on the bridge **steps** (the lower trace). That stepping force is the signal.`,
  },
  {
    title: 'Why the piezo is bright',
    views: ['Why the piezo is bright', 'Spectrogram'],
    play: [note('C3', { dur: 5, vel: 0.7 })],
    text: `A microphone in front of a soundboard hears something like the string's motion. The piezo hears the **force**, the tension times the string's slope at the bridge, \`T ∂y/∂x\`, and slope weights partial n by n (more by n(1 + Bn²) on a stiff string).

So the upper partials come out stronger than on an acoustic piano: the CP-70's glassy, cutting sound, made for stages.`,
  },
  {
    title: 'Frame or soundboard',
    views: ['Spectrogram', 'Why the piezo is bright'],
    play: [chord('C3 G3 E4', { dur: 3 }), { at: 3, set: { mount: 'board', listen: 0 } }, chord('C3 G3 E4', { at: 3.1, dur: 3 }), { at: 6.1, set: { listen: 1 } }, chord('C3 G3 E4', { at: 6.2, dur: 3 })],
    text: `The same chord on the frame through the piezo, then on a soundboard through the same piezo, then heard by microphones.

A rigid frame barely moves, so the strings keep their energy and **sustain**. A soundboard moves with the bridge: it takes energy from the strings faster (it falls 18 dB in two seconds against 14), and through the microphones you hear its resonant colour and knock.`,
  },
  {
    title: 'Short bass strings',
    views: ['Spectrum', 'Spectrogram'],
    play: [note('E1', { dur: 3.5, vel: 0.7 }), { at: 3.5, set: { scale: 'concert', stringing: 'grand' } }, note('E1', { at: 3.6, dur: 3.5, vel: 0.7 })],
    text: `To fit in a van, the CP-70's bass strings are **short**. A short string must be thicker for its pitch, and stiffer: its upper partials are **stretched** by over a semitone, a metallic, clangy zing (watch the ticks drift off the harmonics).

The second note is a concert grand's long bass string: round and nearly harmonic.`,
  },
  {
    title: 'Two strings, two decays',
    views: ['Spectrogram'],
    preset: 'Weinreich: one string, tilted bridge, soundboard',
    set: { tilt: 0 },
    play: [note('C4', { dur: 4.5, vel: 0.7 }), { at: 4.5, set: { stringing: 'cp70', detune: 1.5, tilt: 10 } }, note('C4', { at: 4.6, dur: 5, vel: 0.7 })],
    text: `One string, struck square on, decays as a single exponential. Two strings a hair out of tune share the bridge: at first they swing together and give energy to it fast (a **prompt** sound), then, as they drift out of phase, the part where they oppose each other hardly moves the bridge and rings on (the **aftersound**).

Gabriel Weinreich explained this double decay in 1977. A bridge that gives a little sideways does the same with one string's two directions of vibration (try the preset as it is, tilted 20°).`,
  },
  {
    title: 'The preamp’s tremolo',
    views: ['Spectrogram'],
    preset: 'Stereo tremolo',
    play: [{ at: 0, pedal: true }, chord('A2 E3 C#4 E4', { dur: 0.8 }), chord('D3 F#3 A3 D4', { at: 3.5, dur: 0.8 }), { at: 7.5, pedal: false }],
    text: `Not physics of the strings but of the stage: electric pianos of the 1970s often went through a **stereo tremolo**, the sound swept from one speaker to the other. Here a photocell circuit pans it, 5.5 times a second.

The pedal lifts the dampers so the chords ring on through it.`,
  },
]);
