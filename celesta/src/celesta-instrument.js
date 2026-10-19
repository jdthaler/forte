// celesta-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (celesta-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './celesta-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

// celesta-model.h: KEY_LO–KEY_HI, the compass; KEY_MIN–KEY_MAX, every key with Full range
export const KEY_LO = 60, KEY_HI = 108, KEY_MIN = 21, KEY_MAX = 108;

export const INSTRUMENT = {
  id: 'celesta',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [KEY_MIN, KEY_MAX],            // MIDI keys: A0–C8, 21–108
  compass: { keys: [KEY_LO, KEY_HI], param: 'fullRange' }, // C4–C8, 60–108, until Full range opens the rest
  space: 'sustain',                     // Space and CC64: the damper pedal, sent to the engine
  modWheel: 'hardness',                 // CC1: the hammers' felt, from its default up to wood or brass
  // the engine: the physics in C++ (native/instruments/celesta), built as WebAssembly
  wasm: { name: 'CelestaWasmEngine', module: new URL('./celesta-wasm.js', import.meta.url).href, binary: new URL('../wasm/celesta.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
