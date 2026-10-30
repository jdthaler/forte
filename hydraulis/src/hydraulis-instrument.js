// hydraulis-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (hydraulis-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './hydraulis-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const KEY_LO = 55, KEY_HI = 79;   // G3–G5: two octaves, about the compass of the surviving organs
export const KEY_MIN = 21, KEY_MAX = 108; // A0–C8, with the full range open

export const INSTRUMENT = {
  id: 'hydraulis',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [KEY_MIN, KEY_MAX],               // MIDI keys: all 88, A0–C8
  compass: { keys: [KEY_LO, KEY_HI], param: 'fullRange' }, // G3–G5 until Full range opens the rest
  space: 'hold',                           // Space and CC64 latch the keys down (the slides stay pushed); the host sends the noteOffs on release
  modWheel: 'effort',                      // CC1: the pumpers' effort
  mpe: { bend: 12 },                       // MPE: a key's own bend warms or cools the air in its pipes alone (the wind is every key's: no slide)
  faders: ['open', 'stopped', 'high', 'gurgle', 'effort'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/hydraulis), built as WebAssembly
  wasm: { name: 'HydraulisWasmEngine', module: new URL('./hydraulis-wasm.js', import.meta.url).href, binary: new URL('../wasm/hydraulis.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
