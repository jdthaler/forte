// brass-tour.js — the guided tour of the brass's physics (shared/tour.js)
import { tour, note, run } from '../../shared/tour.js';

export const TOUR = tour('brass', [
  {
    title: 'Lips buzzing into a tube',
    views: ['Waveforms', 'Horn'],
    play: [note('B♭3', { dur: 3, vel: 0.5 })],
    text: `A brass player's **lips** are the reed. Blown apart by the breath and pulled shut by their own spring, they open once a period and let a puff of air into the **mouthpiece**; the pressure that builds there pushes back on them.

The tube decides when the push comes back: a wave goes down the horn, reflects from the bell and returns, and the lips fall into step with it. The waveforms view shows the lips (green) opening once a period and the mouthpiece's pressure (blue) swinging in time.`,
  },
  {
    title: 'One horn, many notes',
    views: ['Impedance', 'Horn'],
    play: [run('B♭2 F3 B♭3 D4 F4 A♭4 B♭4', { step: 0.7, dur: 0.65, vel: 0.55 })],
    text: `With the slide in, a trombone plays only the peaks of its **input impedance**, the horn's resonances as the lips feel them. The bell and mouthpiece pull those peaks into a nearly harmonic series on B♭, so tightening the lips steps up through **B♭2, F3, B♭3, D4, F4, A♭4, B♭4**: the bugle call notes.

The impedance view marks the peak the lips choose for each key; the slide or the valves move all the peaks down to reach the notes between.`,
  },
  {
    title: 'Play loud: a shock wave',
    views: ['Horn', 'Waveforms', 'Spectrum'],
    play: [note('F3', { dur: 2.2, vel: 0.25 }), note('F3', { at: 2.5, dur: 2.5, vel: 1 })],
    text: `Sound in air is not quite linear: the crest of a loud wave, compressed and hotter and carried by the air it pushes, travels **faster** than its trough. Along the trombone's long, narrow cylinder the crests catch up, and at fortissimo the wave arriving at the bell has **steepened into a shock**, a near-vertical jump each period (Hirschberg and colleagues photographed it in 1996).

Soft, the wave reaching the bell looks like the mouthpiece's; loud, it has a cliff. A cliff is all harmonics at once: that is the trombone's **blare**.`,
  },
  {
    title: 'Without the shock',
    views: ['Spectrum', 'Waveforms'],
    play: [note('F3', { dur: 2.4, vel: 1 }), { at: 2.6, set: { shock: 0 } }, note('F3', { at: 2.8, dur: 2.4, vel: 1 })],
    text: `Now the same fortissimo note in the **linear acoustics** of textbooks, with the air's nonlinearity turned off. The lips still buzz hard and the note is still loud, but the wave reaching the bell keeps its round shape, and the spectrum's top falls away.

Loud brass is not just louder brass: its treble comes from the air in the tube itself.`,
  },
  {
    title: 'A cone stays mellow',
    views: ['Horn', 'Spectrum'],
    preset: 'Flugelhorn: the cone stays mellow',
    play: [note('B♭4', { dur: 2.2, vel: 1 }), { at: 2.4, set: { horn: 'trumpet' } }, note('B♭4', { at: 2.6, dur: 2.2, vel: 1 })],
    text: `A **flugelhorn** widens almost all the way from the mouthpiece; a **trumpet** keeps a long narrow cylinder. In a widening bore the loud wave spreads out and weakens before it can steepen, so the flugelhorn stays **round** at a fortissimo that makes the trumpet blaze.

The horn view shades the narrow tubes where the steepening happens.`,
  },
  {
    title: 'The plunger',
    views: ['Spectrogram', 'Impedance'],
    play: [note('C4', { dur: 5, vel: 0.7 }), ...[0.3, 0.9, 1.5, 2.1, 2.7, 3.3, 3.9].map((at, i) => ({ at, set: { plunger: i % 2 ? 0.1 : 0.8 } })), { at: 4.6, set: { plunger: 0 } }],
    text: `A rubber **plunger** over the bell reflects the treble back into the horn instead of letting it out. Opening and closing it is the jazz trombonist's **wah**: the spectrogram's top harmonics come and go.

The mod wheel moves the plunger, and on an MPE controller each note's slide has its own.`,
  },
]);
