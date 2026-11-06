// piano-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS, hammerSpeed } from './params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'piano',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'soundboard', 'velocity', 'maxFreq', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],      // MIDI keys: A0–C8
  lift: 'how fast the damper falls: a slow lift leaves a longer tail, a fast one stops the string sooner', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  mpe: { bend: 0, slide: { param: 'strikePos', max: 0.04 } }, // MPE: a note's own slide moves its hammer towards the agraffe, at the strike (a struck string keeps its pitch)
  aftertouch: 'a firm press rests a palm on the strings: shorter and darker', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  space: 'sustain',      // Space and CC64: the damper pedal, sent to the engine
  controllers: { 67: 'unaCorda' }, // MIDI CC67, the soft pedal: on at 64 and above
  // noteOn's velocity is the hammer's speed in m/s; MIDI velocity / 127 → 0.25 … 6 m/s
  midiVelocity: hammerSpeed,
  faders: ['damper', 'sympathy', 'soundboard', 'hardness', 'strikePos'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/piano), built as WebAssembly. A note may
  // offer it its key's voice data, packed by the model on the page's thread (main.js); without
  // it, the engine builds the key itself
  wasm: { name: 'PianoWasmEngine', module: new URL('./piano-wasm.js', import.meta.url).href, binary: new URL('../wasm/piano.wasm', import.meta.url).href },
  chain: {
    volume: 'volume', room: 'room', venue: 'venue', roomSeconds: 2.2, roomGain: 0.55,
    body: { param: 'soundboard', seconds: 0.4, dry: 0.75, wet: 1.1 }, // the soundboard
    limiter: { threshold: -4, knee: 4, release: 0.2 },
  },
};
