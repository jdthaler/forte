// dunes-tour.js — the guided tour of the Singing Dunes' physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('dunes', [
  {
    title: 'A dune that booms',
    views: ['Slip face', 'Grains in step'],
    play: [note('G2', { dur: 5, vel: 0.85 }), note('E2', { at: 5.5, dur: 5, vel: 0.85 })],
    text: `In a few deserts, sand sliding down a dune's steep lee face **booms**: a loud low note, 60 to 110 Hz, that can last minutes and carry for kilometres. Darwin heard of a hill near Copiapó the people called *El Bramador*, "the roarer", which sounded only when climbers set its sand moving.

Each key here sends an avalanche down the slip face. Hold it: the sand slides, and the grains in it fall into step.`,
  },
  {
    title: 'The grain size sets the note',
    views: ['What sets the pitch', 'Grains in step'],
    play: [run('C2 D2 E2 F#2 G#2', { step: 2.6, dur: 2.5, vel: 0.85 })],
    text: `Sheared, the grains in the flowing layer pass over one another at a rate set by their size d and gravity: **f = 0.4·√(g/d)**. Douady and his colleagues found it at four singing dunes, from Sand Mountain in Nevada (340 µm grains, 63 Hz) to Tarfaya in Morocco (160 µm, 105 Hz).

So each key is a sand: lower keys are coarser. Watch the ring move along the law past their dunes.`,
  },
  {
    title: 'A threshold: falling into step',
    views: ['Threshold', 'Grains in step'],
    play: [note('A2', { dur: 4.5, vel: 0.35 }), note('A2', { at: 5, dur: 4.5, vel: 0.52 }), note('A2', { at: 10, dur: 4.5, vel: 0.9 })],
    text: `Each patch of grains is an oscillator with its own pace, and the flowing layer's shaking nudges each toward the others: **Kuramoto's model** of synchronisation. Below a critical coupling they stay scattered and the sand only rumbles; above it they bunch and the dune sings.

The coupling grows with the avalanche's speed, so a slow slide (0.12 m/s) stays below Douady's 0.23 m/s, one just past it finds its step slowly, and a fast one at once.`,
  },
  {
    title: 'Well sorted sand sings',
    views: ['Grains in step', 'Spectrogram'],
    play: [note('A2', { dur: 13, vel: 0.85 }), { at: 4.5, set: { sorting: 0.6 } }, { at: 9, set: { sorting: 1.2 } }],
    text: `Singing sands are **very well sorted**: their grains are nearly all one size. A spread of sizes is a spread of the patches' own paces, which the coupling has to overcome.

The same avalanche as the sorting worsens: the bunch loosens, the line blurs, and a poorly sorted sand only roars. Dagois-Bohy and colleagues made such a sand sing in the lab by sieving it.`,
  },
  {
    title: 'After rain, silence',
    views: ['Threshold', 'Spectrogram'],
    play: [note('G2', { dur: 13, vel: 0.85 }), { at: 4, set: { damp: 0.15 } }, { at: 8.5, set: { damp: 0.3 } }],
    text: `Booming dunes fall silent after rain. Water bridges between the grains make them stick and soak up their collisions, so the coupling weakens and the threshold climbs out of reach.

The same avalanche as the sand takes up a little water: the line on the Threshold view sinks past the dashed one, and the song breaks up. (How fast it does so is our choice of scale; that it does is what is seen.)`,
  },
  {
    title: 'How long each push lasts',
    views: ['Spectrum', 'Spectrogram'],
    preset: 'Long collisions: a pure hum',
    play: [note('E2', { dur: 4, vel: 0.85 }), { at: 4.2, set: { contact: 0.25 } }, note('E2', { at: 4.3, dur: 4, vel: 0.85 }), { at: 8.5, set: { contact: 0.12 } }, note('E2', { at: 8.6, dur: 4, vel: 0.85 })],
    text: `Each patch pushes on the layer below once a cycle, and a push takes part of the cycle. Long pushes are nearly a sine: a pure hum. Short ones are knocks, rich in **harmonics**: a buzzing boom, closer to the low-flying propeller plane people compare dunes to.

The same E2 with pushes over 45 %, 25 % and 12 % of the cycle: watch the harmonics climb the spectrum.`,
  },
  {
    title: 'The other theory: a layered dune',
    views: ['Slip face', 'What sets the pitch'],
    preset: 'A layered dune (Vriend): the waveguide sings',
    play: [note('G2', { dur: 4.5, vel: 0.85 }), note('G2', { at: 5, dur: 4, vel: 0.4 }), { at: 9.2, set: { layerQ: 8 } }, note('G2', { at: 9.4, dur: 4.5, vel: 0.85 })],
    text: `Vriend, Hunt and their colleagues found something else at Dumont Dunes: a dry, loose layer about 1.5 m deep over firmer sand, a **waveguide** that rings at f = c₁ / 2H√(1 − c₁²/c₂²) and its harmonics, whatever the grains. Here each key is a layer depth, rung by grains rattling at random: no threshold, so a soft slide rings too.

Then a leakier layer: a breathier drone. Which account is right is still argued over.`,
  },
  {
    title: 'A desert chorus',
    views: ['Slip face', 'Grains in step'],
    play: [chord('C2 G2', { dur: 7, vel: 0.85 }), note('E2', { at: 1.5, dur: 5.5, vel: 0.4 }), { at: 3, set: { push: 1 } }, chord('A1 E2', { at: 7.5, dur: 7, vel: 0.85 })],
    text: `Several avalanches at once, as when a whole face lets go: each sand sings its own note, and pushing more sand down (the mod wheel) brings the softer one over its threshold.

Play the keys from C2 to A♭2 for the notes real dunes sing; above them the grains get finer, past fine sand into silt, where no dune is known to sing.`,
  },
]);
