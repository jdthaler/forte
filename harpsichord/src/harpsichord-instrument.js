// harpsichord-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (harpsichord-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS, KEY_LO, KEY_HI, KEY_MIN, KEY_MAX } from './harpsichord-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'harpsichord',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [KEY_MIN, KEY_MAX],            // MIDI keys: A0–C8, 21–108
  lift: 'how fast the jack falls back: a slow lift lets the damper settle softly', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  mpe: { bend: 1, way: 'up', slide: { param: 'xFront', max: 15 } }, // MPE: a note's own bend tightens its strings (up only, a semitone at most); its slide moves its quills towards the nut, nasal as the lute row, at the pluck
  glide: 'a finger pressing the strings\' back length: up to a semitone sharp', // what a note's own bend does
  aftertouch: 'a firm press lays the buff on the strings: a lute sound', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  compass: { keys: [KEY_LO, KEY_HI], param: 'fullRange' }, // FF–f³, 29–89, until Full range opens the rest
  space: 'hold',                        // Space and CC64 latch the keys down; the host sends the noteOffs on release
  faders: ['front8', 'back8', 'four', 'xFront', 'xBack'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/harpsichord), built as WebAssembly
  wasm: { name: 'HarpsichordWasmEngine', module: new URL('./harpsichord-wasm.js', import.meta.url).href, binary: new URL('../wasm/harpsichord.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
