// clavicylinder-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pct = (v) => `${(v * 100).toFixed(0)} %`;

export const GROUPS = [
  {
    title: 'Keys',
    params: [
      { id: 'press', label: 'Key pressure', perform: true, strip: true, min: 0.1, max: 6, def: 1.2, log: true, fmt: (v) => `${(v * 1000 / 9.81).toFixed(0)} g on the glass`, hint: 'How hard the cloth is pressed against the wet glass at middle C; every key is regulated to speak alike (velocity scales it 0.5–1.5×, aftertouch up to 2× more). Below about a tenth of the default the bar will not speak, and a sounding bar dies away as the pressure is let off; just above, it swells in slowly; pressed firmly it speaks at once. Once it sings, pressing harder adds only a little loudness and an edge: the Paris Institut found its swell “limited from medium to loudest” and its fading away “eminent”.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.5, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'How firmly the computer keys press. Struck hard, a bar knocks against the glass before it sings: Chladni’s keys were to be pressed, never struck.' },
    ],
  },
  {
    title: 'Cylinder',
    params: [
      { id: 'speed', label: 'Treadle speed', perform: true, min: 0.2, max: 3, def: 1, log: true, fmt: (v) => `${v.toFixed(2)} rev/s · ${(v * Math.PI * 6.8).toFixed(0)} cm/s at the glass`, hint: 'How fast the 6.8 cm glass cylinder turns under the cloth. The rubbed point keeps pace with the glass while it sticks, so a faster cylinder carries it further each cycle: louder, and quicker to speak.' },
      { id: 'flywheel', label: 'Flywheel lead', min: 0.3, max: 10, def: 3.5, log: true, fmt: (v) => `${v.toFixed(1)} kg`, hint: 'Lead cast round the 10-inch flywheel. Every pressed bar drags on the cylinder; a light wheel lets loud chords slow it down until the foot catches up.' },
      { id: 'treadle', label: 'Foot’s push (unevenness)', min: 0, max: 1, def: 0.5, step: 0.01, fmt: pct, hint: 'The foot pushes the crank down once a turn and Chladni’s off-centre weight brings it back up: the push swings by this much over a turn. It is felt only when the bars drag on the cylinder, and the flywheel smooths it.' },
    ],
  },
  {
    title: 'Cloth',
    params: [
      { id: 'wet', label: 'Cloth wetness', min: 0, max: 1, def: 0.45, step: 0.01, fmt: (v) => `${v < 0.2 ? 'nearly dry' : v < 0.7 ? 'damp' : 'soaked'} · ${pct(v)}`, hint: 'The glass is wiped with a wet sponge. Damp cloth grabs the glass and lets go; soaked cloth is heavy and soft, the tone goes dull and the high bars stop speaking, as Chladni found.' },
      { id: 'layers', label: 'Cloth layers (bass posts)', min: 1, max: 4, def: 3, step: 1, fmt: (v) => `${v.toFixed(0)} (${Math.max(1, v - 1).toFixed(0)} on the treble bars)`, hint: 'Strips of broadcloth tied over the rubbed point. More layers hide the knock of the key and soften the tone; too many and it buzzes.' },
      { id: 'grip', label: 'Grip (soap ← → pumice)', min: -1, max: 1, def: 0, step: 0.01, fmt: (v) => (Math.abs(v) < 0.005 ? 'clean wet glass' : v < 0 ? `soaped ${pct(-v)}` : `pumice ${pct(v)}`), hint: 'Chladni’s remedies: a touch of soap on a strip that sounds too cutting, fine pumice on glass that will not grip.' },
    ],
  },
  {
    title: 'Bars',
    params: [
      { id: 'thick', label: 'Bar thickness', min: 1.2, max: 4, def: 2.3, step: 0.05, fmt: (v) => `${v.toFixed(2)} mm (${(v / 2.18).toFixed(2)} lines)`, hint: 'Iron bars “about a line thick, or a little more”. Thicker bars are longer and heavier for the same note: louder and slower to answer, and they need more pressure.' },
      { id: 't60', label: 'Ring after release (middle C)', min: 0.5, max: 30, def: 4, log: true, fmt: (v) => `${v.toFixed(1)} s`, hint: 'How long a free bar keeps ringing once its key lets go: the iron’s own loss, with the cords and the riveted post. Lower bars ring longer.' },
      { id: 'cords', label: 'Cords off the nodes', min: -0.1, max: 0.06, def: 0, step: 0.002, fmt: (v) => (Math.abs(v) < 0.001 ? 'on the nodes' : `${(v * 100).toFixed(1)} % of the length ${v < 0 ? 'outward' : 'inward'}`), hint: 'Each bar is tied down with thread on cork at its two nodes. Off the nodes the cords damp the note; at 9 % outward they sit on the second mode’s nodes, and that mode (an octave and a tritone up) rings free while the note is damped, until it takes over. Chladni heard upper tones sound along when a bar was badly fastened, “one of the most unbearable” faults.' },
      { id: 'build', label: 'Rubbed point', type: 'select', def: 0, options: [[0, 'Chladni’s: posts in the bass, bent ends above E4'], [1, 'Posts all the way up'], [2, 'Bent ends all the way down']], hint: 'Below E4 the cloth is tied over a short iron post riveted into the bar; above, over the bar’s bent-up back end, which Chladni found better in the treble. The bent end swings further for the same glass, and its tone has more edge.' },
      { id: 'board', label: 'Soundboard (thin fir)', min: 0, max: 1, def: 0.6, step: 0.01, fmt: pct, hint: 'The keys sit on the bridge of a thin fir board, which carries the bars’ sound into the room.' },
      { id: 'fullRange', label: 'Full range (A0–C8)', type: 'checkbox', def: false, hint: 'Opens the keys beyond Chladni’s C2–F6: the same iron bars, longer and shorter.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.3, step: 0.01, fmt: pct },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Chladni’s clavicylinder (1800)', p: {} },
  { name: 'Light touch (slow to speak)', p: { press: 0.25 } },
  { name: 'Pressing hard (louder, harsher)', p: { press: 4 } },
  { name: 'Cloth soaked (dull; the treble fails)', p: { wet: 0.95 } },
  { name: 'Soaped strips (softer tone)', p: { grip: -0.7 } },
  { name: 'Pumice on the glass (cutting)', p: { grip: 0.8 } },
  { name: 'Posts all the way up', p: { build: 1 } },
  { name: 'Cords on the wrong nodes (an overtone takes over)', p: { cords: -0.092 } },
  { name: 'Light flywheel (chords drag the cylinder)', p: { flywheel: 0.4 } },
  { name: 'Slow treadle', p: { speed: 0.4 } },
  { name: 'One layer of cloth: the key’s knock shows', p: { layers: 1 } },
  { name: 'Heavy flywheel: chords keep the speed', p: { flywheel: 10 } },
];
