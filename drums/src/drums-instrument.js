// drums-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (drums-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './drums-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'drums',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: holds the hand off released heads (when they don't ring anyway)
  modWheel: 'strike',                   // CC1: where the beater lands, centre to rim
  // MPE: a note's bend is its head's tension (the timpani pedal, the bayan's heel), CC74 moves its
  // strike point, and its pressure is the heel pressing into the head.
  mpe: { bend: 12, slide: true },
  aftertouch: 'pressed firmly, the heel goes into the head: the pitch rises', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'the hand damping the head: a slow lift lets it ring on, a fast one stops it (with the heads let ring, only a fast lift brings the hand down)', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['air', 'mic', 'push', 'restAt', 'strike'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/drums), built as WebAssembly
  wasm: { name: 'DrumWasmEngine', module: new URL('./drums-wasm.js', import.meta.url).href, binary: new URL('../wasm/drums.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
