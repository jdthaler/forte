// voice-tour.js — the guided tour of the voice's physics (shared/tour.js): the folds, the tract and
// its vowels, the breath, the singer's formant and a soprano's jaw, then a song.
import { tour, note, run } from '../../shared/tour.js';

// "Daisy Bell" (Harry Dacre, 1892), the song a computer sang at Bell Labs in 1961 through Kelly and
// Lochbaum's tract: its notes in beats (3/4), each syllable's vowel (the mod wheel's 0 oo to 4 ee).
export const DAISY = [
  ['D4', 3, 2], ['B3', 3, 4], ['G3', 3, 2], ['D3', 3, 4], ['E3', 1, 3.6], ['F#3', 1, 4], ['G3', 1, 0.6], ['E3', 2, 2.2], ['G3', 1, 1.2], ['D3', 6, 0],
  ['A3', 3, 2], ['D4', 3, 2.3], ['B3', 3, 3], ['G3', 3, 4], ['E3', 1, 1], ['F#3', 1, 1], ['G3', 1, 3], ['A3', 2, 2], ['B3', 1, 2], ['A3', 6, 0],
];
// The song as a score: each note held to just before the next, each syllable's vowel set as it starts.
export function daisy({ at = 0, beat = 0.38, vel = 0.65 } = {}) {
  const out = [];
  let t = at;
  for (const [k, beats, vowel] of DAISY) {
    out.push({ at: t, set: { vowel } }, note(k, { at: t, dur: beats * beat * 0.93, vel }));
    t += beats * beat;
  }
  return out;
}

export const TOUR = tour('voice', [
  {
    title: 'Folds set flapping by the breath',
    views: ['Vocal folds', 'Spectrum'],
    play: [note('A2', { dur: 3.5, vel: 0.6 }), note('E3', { at: 3.6, dur: 3.5, vel: 0.6 })],
    text: `The breath pushes the two vocal folds apart from below, and the air rushing through the gap pulls them back together (Bernoulli). Each fold is **two masses on springs**, a lower and an upper edge (Ishizaka and Flanagan, 1972), so they open from the bottom and shut from the bottom too, a little out of step: that is what keeps them going.

Watch them slowed down, and the flow below: a pulse of air each cycle, **cut off sharply** when they snap shut. That sudden stop is what gives the voice its harmonics.`,
  },
  {
    title: 'The vowel is the shape of the tube',
    views: ['Vocal tract', 'Vowel chart'],
    play: [note('A2', { dur: 10, vel: 0.6 }), { at: 1.5, set: { vowel: 1 } }, { at: 3, set: { vowel: 0 } }, { at: 4.5, set: { vowel: 1 } }, { at: 6, set: { vowel: 2 } }, { at: 7.5, set: { vowel: 3 } }, { at: 9, set: { vowel: 4 } }],
    text: `The same buzz from the folds, through a tube whose shape changes: **ah, aw, oo, aw, ah, eh, ee**. The tube from the folds to the lips rings at a few frequencies, the **formants**, and boosts the harmonics near them. Two of them are enough to tell the vowels apart.

The tube here is 44 short sections, each a wave scattering at every change of width (Kelly and Lochbaum, 1962). Each vowel's shape was fitted so that its formants are the averages Peterson and Barney measured from 33 men in 1952: the grey letters on the chart.`,
  },
  {
    title: 'Pitch and vowel are separate',
    views: ['Spectrogram'],
    play: run('A2 C#3 E3 A3 E3 C#3 A2', { step: 1, dur: 0.95, vel: 0.6 }),
    text: `The folds set the pitch, the tract the vowel, and each leaves the other alone. A scale on ah: the harmonics climb, spreading apart, while the **bands where they are loud stay put**. That is why you can sing any vowel on any note, and how the ear knows ah at any pitch.`,
  },
  {
    title: 'Breath: louder and brighter',
    views: ['Vocal folds', 'Spectrum'],
    set: { pressure: 4 },
    play: [note('D3', { dur: 9, vel: 0.6 }), { at: 3, set: { pressure: 9 } }, { at: 6, set: { pressure: 22 } }],
    text: `The same note with the lungs pushing harder: 4, 9, then 22 cm of water. The folds swing wider and **slap shut harder**, closed for a longer share of each cycle, and the sharper cut-off of the flow lifts the upper harmonics. A voice singing out is not just a quiet voice turned up: it is brighter.`,
  },
  {
    title: 'Breathy, whispered and pressed',
    views: ['Vocal folds', 'Spectrogram'],
    play: [note('F3', { dur: 12, vel: 0.6 }), { at: 3, set: { gap: 8 } }, { at: 6, set: { gap: 26, pressure: 6 } }, { at: 9, set: { gap: -2, pressure: 14 } }],
    text: `Now the folds are held apart. A little, and they no longer quite meet: **breathy**, with the hiss of air through the gap (turbulence, once the flow's Reynolds number passes about 1800). Far apart, they cannot set each other going at all, and only the hiss is left, still shaped by the tract: a **whisper**. Then squeezed together: a tight, **pressed** voice.`,
  },
  {
    title: 'The singer\'s formant',
    views: ['Vocal tract', 'Spectrum'],
    play: [note('G3', { dur: 4, vel: 0.65 }), { at: 4, set: { larynx: 0.45 } }, note('G3', { at: 4.2, dur: 4.5, vel: 0.65 })],
    text: `First the larynx tube just above the folds at its usual width, then narrowed to a sixth of the throat's, as trained singers do by lowering the larynx. It rings on its own near 3 kHz and gathers the formants there into one peak: the **singer's formant** (Sundberg, 1974). An orchestra is weak there, so an opera voice carries over it without a microphone.`,
  },
  {
    title: 'Sopranos open the jaw',
    views: ['Vocal tract', 'Vowel chart'],
    preset: 'Soprano, head voice',
    set: { vowel: 4, tuning: false },
    play: [run('C5 E5 G5', { step: 1.4, dur: 1.3, vel: 0.65 }), { at: 4.4, set: { tuning: true } }, run('C5 E5 G5', { at: 4.6, step: 1.4, dur: 1.3, vel: 0.65 })],
    text: `ee has its first formant near 300 Hz. Sing above it and the air in the tract stops helping the folds and starts to fight them: here the high notes falter. Then **formant tuning** on: the singer opens the jaw and spreads the mouth so that F1 stays just above the note, as sopranos do (Joliveau, Smith and Wolfe, 2004). The notes sing, at the cost of the vowel, which drifts toward ah: watch the dot on the chart.`,
  },
  {
    title: 'Daisy Bell, 1961',
    views: ['Vocal tract', 'Spectrogram'],
    preset: 'Straight tone, as in 1961',
    play: daisy(),
    text: `In 1961 John Kelly, Carol Lochbaum and Max Mathews made an IBM computer at Bell Labs sing *Daisy Bell* through this very kind of tube, one of the first songs a computer sang; Arthur C. Clarke heard it, and HAL sings it in *2001*. Two decades before, Bell Labs' **Voder** had spoken from a keyboard at the 1939 World's Fair. Here the mod wheel moves the vowel for each syllable.`,
  },
]);
