// voice-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const time = (v) => (v < 1 ? `${(v * 1000).toFixed(0)} ms` : `${v.toFixed(2)} s`);

// The vowels the mod wheel sweeps, back to front (voice-vowels.h, Peterson and Barney 1952).
export const VOWEL_NAMES = [['oo', 'u', 'who\'d'], ['aw', 'ɔ', 'hawed'], ['ah', 'ɑ', 'hod'], ['eh', 'ɛ', 'head'], ['ee', 'i', 'heed']];
export function vowelLabel(v) {
  const i = Math.round(v), d = v - i;
  if (Math.abs(d) < 0.05) return `${VOWEL_NAMES[i][0]} /${VOWEL_NAMES[i][1]}/`;
  const a = Math.floor(v), t = v - a;
  return `${VOWEL_NAMES[a][0]} → ${VOWEL_NAMES[a + 1][0]} ${(t * 100).toFixed(0)} %`;
}

export const GROUPS = [
  {
    title: 'Singing',
    params: [
      { id: 'vowel', label: 'Vowel (oo, aw, ah, eh, ee)', perform: true, strip: true, min: 0, max: 4, def: 2, step: 0.01, fmt: vowelLabel,
        hint: 'The shape of the tube from the folds to the lips, which sets its resonances (the formants), and so the vowel: from oo (lips rounded, tongue back) through aw and ah (jaw open, the throat narrowed) to eh and ee (tongue forward, the throat wide). Between two vowels the shape is halfway between theirs. The mod wheel moves it from here.' },
      { id: 'vibrato', label: 'Vibrato depth', perform: true, min: 0, max: 100, def: 30, step: 1, fmt: (v) => (v === 0 ? 'straight tone' : `±${v.toFixed(0)} ¢`),
        hint: 'A trained singer\'s voice wavers in pitch, about five or six times a second: the muscle that stretches the folds (the cricothyroid) pulses. It sets in a moment after the note starts. 0 is a straight tone, as a boy treble or an early-music singer, or the computer that sang in 1961.' },
      { id: 'vibRate', label: 'Vibrato rate', min: 3, max: 8, def: 5.5, step: 0.1, fmt: (v) => `${v.toFixed(1)} Hz`,
        hint: 'How many times a second the pitch wavers. Singers keep between about 5 and 7.' },
      { id: 'jitter', label: 'Unsteadiness (flutter)', min: 0, max: 30, def: 4, step: 0.5, fmt: (v) => (v === 0 ? 'none' : `${v.toFixed(1)} ¢ rms`),
        hint: 'No singer holds a pitch perfectly still: the tension of the folds wanders a little, slowly and at random, differently for each voice of a chord, which is part of what makes a choir sound like many people. 0 holds every note dead still.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'How hard the computer keys sing. A key\'s velocity sets how hard the lungs push; pressure (aftertouch) pushes harder still.' },
      { id: 'fullRange', label: 'Full range (A0–C8)', type: 'checkbox', def: false,
        hint: 'Opens the keys beyond C2–C6, the span from a low bass to a soprano\'s top C. Below, the folds flap so slowly that each pulse is heard alone (vocal fry); above, they are stretched far past any singer\'s, toward the whistle register.' },
    ],
  },
  {
    title: 'Lungs and folds',
    params: [
      { id: 'pressure', label: 'Lung pressure', perform: true, min: 2, max: 30, def: 8, step: 0.1, log: true, fmt: (v) => `${v.toFixed(1)} cm H₂O`,
        hint: 'How hard the lungs push air up through the folds, in centimetres of water (Ishizaka and Flanagan\'s folds run at 8; a singer uses 5 to 40). Harder makes the folds slap shut more sharply each cycle: louder, and brighter, as a voice is when it sings out. Too little and they stop moving. The key\'s velocity and pressure push harder or softer than this.' },
      { id: 'gap', label: 'Folds apart at rest (breathiness)', perform: true, min: -3, max: 30, def: 0.5, step: 0.1, fmt: (v) => `${v.toFixed(1)} mm²`,
        hint: 'How far apart the folds are held when they are still. Near zero they close fully each cycle: a clear voice. Wider, they never quite meet: breathy, with the hiss of air rushing through the gap. Wider still they cannot set each other going at all, and only the hiss is left, a whisper. Below zero they are pressed together: a tight, pressed voice that needs more pressure to start.' },
      { id: 'thick', label: 'Folds\' thickness (chest or head)', min: 0.4, max: 1.4, def: 1, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %`,
        hint: 'How thick the vibrating part of the folds is, against Ishizaka and Flanagan\'s 3 mm. Thick folds (chest voice) close for a good share of each cycle and slap shut, rich in harmonics; thin ones (head voice, falsetto) barely touch and give a purer, flutier tone.' },
      { id: 'onset', label: 'Breath in (attack)', min: 0.005, max: 0.5, def: 0.04, log: true, fmt: time,
        hint: 'How long the lungs take to bring the pressure up when a key goes down. The folds start to move once it passes their threshold, so a slow breath makes a soft, swelling start.' },
      { id: 'release', label: 'Breath off (release)', min: 0.01, max: 1, def: 0.08, log: true, fmt: time,
        hint: 'How long the pressure takes to fall when the key comes up: the folds fall still and the tract rings out.' },
    ],
  },
  {
    title: 'Vocal tract',
    params: [
      { id: 'length', label: 'Tract length (glottis to lips)', min: 10, max: 24, def: 17.5, step: 0.1, fmt: (v) => `${v.toFixed(1)} cm`,
        hint: 'How long the tube from the folds to the lips is: about 17.5 cm in men, 14.5 in women and 11 in children. Every formant scales with its inverse, so a shorter tract sounds younger and smaller, the same vowel higher; a longer one darker, like a bass.' },
      { id: 'larynx', label: 'Larynx tube (singer\'s formant)', min: 0.3, max: 3, def: 1.5, step: 0.01, log: true, fmt: (v) => `${v.toFixed(2)} cm²`,
        hint: 'The width of the short tube just above the folds. Narrowed to a sixth of the throat\'s width or less, as trained singers lower the larynx and narrow it, it rings on its own near 3 kHz and pulls the formants there into one: the singer\'s formant, which carries a voice over an orchestra (Sundberg 1974).' },
      { id: 'tuning', label: 'Formant tuning (open the jaw for high notes)', type: 'checkbox', def: true,
        hint: 'Once a note climbs toward the vowel\'s first formant, the tract above the folds stops helping them and starts to fight them: the voice cracks or stops. Sopranos open the jaw and spread the mouth to keep F1 just above the note (Joliveau, Smith and Wolfe 2004), at the cost of the vowel, which drifts toward ah. On, each singer does this; off, the high notes of oo and ee choke.' },
      { id: 'losses', label: 'Wall losses', min: 0.2, max: 3, def: 1, step: 0.01, log: true, fmt: (v) => `${(v * 100).toFixed(0)} %`,
        hint: 'How much sound the soft walls of the tract soak up as it travels: more widens every formant and dulls the vowel; less sharpens the resonances to a ringing, synthetic edge.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.3, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Baritone singing ah', p: {} },
  { name: 'Bass: a long tract, a dark oh', p: { length: 19.5, vowel: 0.7, vibrato: 25, pressure: 10 } },
  { name: 'Tenor with the singer\'s formant', p: { length: 17, larynx: 0.45, pressure: 12, vibrato: 40 } },
  { name: 'Alto', p: { length: 15.5, thick: 0.8, vibrato: 35 } },
  { name: 'Soprano, head voice', p: { length: 14.5, thick: 0.6, vowel: 2.4, larynx: 0.6, pressure: 11, vibrato: 45, vibRate: 6 } },
  { name: 'Child (a short tract)', p: { length: 11.5, thick: 0.7, vibrato: 0, jitter: 6, vowel: 3 } },
  { name: 'Straight tone, as in 1961', p: { vibrato: 0, jitter: 0, vowel: 2, losses: 0.6 } },
  { name: 'Breathy voice (folds apart)', p: { gap: 10, vibrato: 15, pressure: 6 } },
  { name: 'Whisper (folds too far apart to move)', p: { gap: 26, pressure: 5, vibrato: 0, vowel: 3 } },
  { name: 'Pressed voice (folds squeezed)', p: { gap: -2, pressure: 11, thick: 1.3 } },
  { name: 'Falsetto (thin folds)', p: { thick: 0.45, gap: 4, vowel: 1, vibrato: 20 } },
  { name: 'Belting (high pressure)', p: { pressure: 18, thick: 1.2, vowel: 3, larynx: 0.8 } },
];
