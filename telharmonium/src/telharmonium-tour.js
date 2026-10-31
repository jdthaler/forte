// telharmonium-tour.js — the guided tour of the Telharmonium's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('telharmonium', [
  {
    title: 'Alternators on shafts',
    views: ['Pitch-shafts', 'Spectrum'],
    preset: 'Pure ground tone (sine alternators)',
    play: [run('C4 E4 G4 C5', { step: 0.8, dur: 0.75 }), chord('C4 E4 G4', { at: 3.4, dur: 3 })],
    text: `Cahill's Telharmonium (1906) made every note with an **alternator**: a toothed steel rotor turning past a coil. An alternator with T teeth on a shaft turning Ω times a second gives T·Ω hertz, a nearly pure sine.

Each of the twelve pitch classes had its own steel shaft, all geared to one motor. Watch the Pitch-shafts view: each key you hear lights the alternator it uses on its shaft.`,
  },
  {
    title: 'Harmonics drawn like organ stops',
    views: ['Harmonic buses', 'Spectrum'],
    play: [note('C4', { dur: 9 }), { at: 1.5, set: { m2: 0 } }, { at: 3, set: { m3: 0, m5: 0 } }, { at: 4.5, set: { m4: 0, m6: 0, m7: 0, m8: 0 } }, { at: 6, set: { m2: 8, m3: 7, m4: 6, m5: 5, m6: 4, m7: 2, m8: 3 } }],
    text: `A key's harmonics are the alternators with 2, 3 … 8 times its teeth **on its own shaft**. Its relay switches them onto eight buses, one per harmonic, each with a stop of induction coils that sets how much gets through.

One held C4: the octave, twelfth and the rest are taken out until only the sine is left, then all put back. The Harmonic buses view shows each bus's current.`,
  },
  {
    title: 'Robbing: notes share a bus',
    views: ['Harmonic buses', 'Spectrogram'],
    preset: 'Robbing: soft stops, many notes',
    play: [note('G4', { dur: 7 }), note('C5', { at: 1.4, dur: 5.6 }), note('E5', { at: 2.8, dur: 4.2 }), note('G5', { at: 4.2, dur: 2.8 })],
    text: `Every note on a bus shares its transformer coil, so each note added **takes current from the others**: N windings in parallel on one load each carry e/(Z_s + N Z_L). Cahill called it *robbing*; a soft stop robs more.

Listen to the held G4 grow quieter as each note joins it, and watch its bars drop below their ticks (what it gets alone).`,
  },
  {
    title: 'The thump of a relay',
    views: ['Spectrogram', 'Key and shaft'],
    play: [run('C3 E3 G3 C4', { step: 0.6, dur: 0.25, vel: 0.9 }), { at: 2.6, set: { tau: 25, contact: 0 } }, run('C3 E3 G3 C4', { at: 2.8, step: 0.6, dur: 0.25, vel: 0.9 })],
    text: `A sine switched into a winding's resistance and inductance leaves an **offset** that dies away as e^(−t/τ), τ = L/R, as big as the wave was at the instant the relay closed. Listeners heard every note begin with a little puff.

The same notes, then with a long L/R and contacts that close at once: each one starts with a heavy thump, and the spectrogram shows a smear of low frequencies at every onset.`,
  },
  {
    title: 'The motor sags under a chord',
    views: ['Pitch-shafts', 'Spectrogram'],
    preset: 'A struggling motor: big droop, light flywheel',
    set: { m1: 8, m2: 8, m3: 8, m4: 8, a1: 8, a2: 8, a3: 8, a4: 8 },
    play: [note('C5', { dur: 9 }), chord('C2 G2 C3 E3 G3 C4 E4 G4', { at: 2, dur: 4, vel: 1 })],
    text: `All the shafts were geared to one motor, and the alternators' electrical load slowed it. Under a big chord the **whole machine sags flat**, every note together, and comes back as the notes let go; the flywheel sets how quickly.

Listen to the held C5 bend down when the chord comes in. The Pitch-shafts view shows the motor's speed in cents.`,
  },
  {
    title: 'Down the telephone line',
    views: ['Line and receiver', 'Spectrum'],
    play: [run('C4 E4 G4 C5 E5 C5 G4 E4', { step: 0.3, dur: 0.28 }), { at: 2.5, set: { distance: 25 } }, run('C4 E4 G4 C5 E5 C5 G4 E4', { at: 2.6, step: 0.3, dur: 0.28 }), { at: 5.1, set: { cable: 'open', distance: 160 } }, run('C4 E4 G4 C5 E5 C5 G4 E4', { at: 5.2, step: 0.3, dur: 0.28 })],
    text: `The music went out over **telephone lines** to hotels, restaurants and homes. A line is resistance and inductance along it and capacitance across it: the telegrapher's equations, solved exactly here.

The same phrase in the hall, then 25 km down a city cable, mostly R and C, which dulls the highs, then 160 km of open wire on poles, which keeps them. Watch the dashed line in the Line and receiver view.`,
  },
  {
    title: 'The receiver: a growl and a phantom bass',
    views: ['Line and receiver', 'Spectrum'],
    preset: 'Harmonics without the ground tone (Hope-Jones\'s resultant)',
    play: [run('C2 C2 G2 F2 E2 D2 B1 C2', { step: 0.7, dur: 0.62, vel: 0.9 }), { at: 5.7, set: { magnet: 2000 } }, run('C2 G2 C2', { at: 5.8, step: 0.7, dur: 0.62, vel: 0.9 })],
    text: `The receiver is a magnet pulling an iron diaphragm with the **square** of the flux, so the music adds its own square: sum and difference tones. Here the buses carry no ground tone, only harmonics 2 to 8, yet a bass sounds, the "phantom low note" the organ builder Hope-Jones heard.

Then a strong magnet keeps the receiver linear, and the ground tone is weaker. A paper horn in front resonates on every c/2L.`,
  },
]);
