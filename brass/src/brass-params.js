// brass-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const kpa = (v) => `${v.toFixed(1)} kPa`;
const times = (v) => `× ${v < 1 ? v.toFixed(2) : v.toFixed(1)}`;
const pct = (v) => `${(v * 100).toFixed(0)} %`;

// The horns: the order is the contract's (append only).
export const HORNS = [
  ['trombone', 'Tenor trombone in B♭ (slide)'],
  ['trumpet', 'Trumpet in B♭ (valves)'],
  ['flugelhorn', 'Flugelhorn in B♭ (mostly cone)'],
];

export const GROUPS = [
  {
    title: 'Horn',
    params: [
      { id: 'horn', label: 'Horn', face: 'selector', perform: true, type: 'select', def: 'trombone', options: HORNS,
        shortLabels: ['Trombone', 'Trumpet', 'Flugelhorn'],
        hint: 'Which bore the lips blow into. The trombone and trumpet are mostly narrow cylinder, so a loud note steepens into a shock wave on its way to the bell: brassy. The flugelhorn is mostly cone, widening all the way, so the same note stays round and mellow. Each plays its own compass on its partials; beyond it the same horn is built bigger or smaller by octaves. Applies to new notes.' },
      { id: 'shock', label: 'Air nonlinearity (shock waves)', perform: true, min: 0, max: 2, def: 1, step: 0.01, fmt: (v) => (v === 0 ? 'off: linear acoustics' : `${times(v)} real air`),
        hint: 'Loud sound in air travels faster where the pressure is high, (γ + 1)/2 × the flow faster, so the crests of a loud wave catch up with the troughs and steepen into a shock wave inside the tube (Hirschberg et al., 1996). This is the brassy blare of a fortissimo trombone. 0 is the linear acoustics of textbooks: loud notes only get louder, never brassier.' },
      { id: 'plunger', label: 'Plunger mute (over the bell)', perform: true, strip: true, min: 0, max: 1, def: 0, step: 0.01, fmt: (v) => (v === 0 ? 'off' : `${pct(v)} closed`),
        hint: 'A rubber plunger held over the bell. Closing it reflects the treble back into the horn instead of letting it out: the classic wah. Mod wheel and an MPE slide move it.' },
      { id: 'bellSize', label: 'Bell size', min: 0.6, max: 1.5, def: 1, step: 0.01, fmt: times,
        hint: 'The bell\'s mouth wider or narrower, its flare redrawn to meet it. A wide bell lets the treble out sooner (bright and open); a narrow one keeps more of it in the horn (darker, and the high partials stronger and easier). Applies to new notes.' },
    ],
  },
  {
    title: 'Player',
    params: [
      { id: 'breath', label: 'Breath (blowing pressure)', perform: true, min: 0.3, max: 2, def: 1, step: 0.01, fmt: times,
        hint: 'How hard the player blows for each velocity: the pressure in the mouth, from about 0.5 kPa (pianissimo) to 5.5 kPa (fortissimo) at C4, more for high notes. Aftertouch blows up to half as hard again, a crescendo on a held note.' },
      { id: 'lipTension', label: 'Lip tension', min: -300, max: 300, def: 0, step: 1, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)} ¢ from the usual`,
        hint: 'How tight the lips are for each note: their own resonance against the horn\'s. Tighter lips buzz brighter and speak quicker, then jump to the next partial up; looser ones play darker and fall to the partial below. The player\'s ear moves the slide to keep the note in tune either way.' },
      { id: 'lipQ', label: 'Lip damping (Q)', min: 3, max: 20, def: 10, step: 0.1, log: true, fmt: (v) => `Q ${v.toFixed(1)}`,
        hint: 'How long the lips would ring on their own: soft, damp lips (low Q) need more breath to start but bend and slur easily; firmer ones (high Q) start sooner and buzz more.' },
      { id: 'tongue', label: 'Tonguing (attack)', min: 2, max: 80, def: 12, log: true, fmt: (v) => `${v.toFixed(0)} ms`,
        hint: 'How quickly the breath arrives when the tongue lets it go: a hard "t" attack in a few milliseconds, or a soft "d" or breath attack over tens.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.6, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'How hard the computer keys blow.' },
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
  { name: 'Tenor trombone', p: {} },
  { name: 'Trombone fortissimo: shock waves', p: { breath: 1.8 } },
  { name: 'Trombone fortissimo in linear air: no shocks', p: { breath: 1.8, shock: 0 } },
  { name: 'Trumpet', p: { horn: 'trumpet' } },
  { name: 'Trumpet, blazing', p: { horn: 'trumpet', breath: 1.8 } },
  { name: 'Flugelhorn: the cone stays mellow', p: { horn: 'flugelhorn', breath: 1.4 } },
  { name: 'Plunger half closed: wah', p: { plunger: 0.6 } },
  { name: 'Soft breath attacks', p: { tongue: 60, breath: 0.6 } },
  { name: 'Tight lips: bright and edgy', p: { lipTension: 150, lipQ: 5 } },
  { name: 'Narrow bell: dark and covered', p: { bellSize: 0.65 } },
  { name: 'Twice as nonlinear as air', p: { shock: 2, breath: 1.4 } },
];
