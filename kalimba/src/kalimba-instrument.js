// kalimba-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (kalimba-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './kalimba-params.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'kalimba',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity'], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  compass: { keys: [60, 88], param: 'fullRange' }, // C4–E6, a 17-tine kalimba's span, until Full range opens the rest
  space: 'sustain',                     // Space and CC64: holds fingers off released tines (when they don't ring anyway)
  modWheel: 'cover',                    // CC1: a finger over the sound hole, from open to shut (the wah)
  // the engine: the physics in C++ (native/instruments/kalimba), built as WebAssembly
  wasm: { name: 'KalimbaWasmEngine', module: new URL('./kalimba-wasm.js', import.meta.url).href, binary: new URL('../wasm/kalimba.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
