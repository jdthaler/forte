// harmonium-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (harmonium-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './harmonium-params.js';
import { KEY_LO, KEY_HI, KEY_MIN, KEY_MAX } from './harmonium-data.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'harmonium',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity'], // kept when a preset is chosen
  range: [KEY_MIN, KEY_MAX],            // MIDI keys: A0–C8, 21–108
  compass: { keys: [KEY_LO, KEY_HI], param: 'fullRange' }, // C2–C7, 36–96, until Full range opens the rest
  space: 'hold',                        // Space and CC64 latch the keys down; the host sends the noteOffs on release
  modWheel: 'pressure',                 // CC1: wind pressure, from its default up to its maximum
  // the engine: the physics in C++ (native/instruments/harmonium), built as WebAssembly
  wasm: { name: 'HarmoniumWasmEngine', module: new URL('./harmonium-wasm.js', import.meta.url).href, binary: new URL('../wasm/harmonium.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
