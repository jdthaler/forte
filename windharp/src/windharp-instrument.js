// windharp-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (windharp-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './windharp-params.js';
import { KEY_MIN, KEY_MAX, U_MAX } from './windharp-model.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'windharp',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [KEY_MIN, KEY_MAX],            // MIDI keys
  space: 'sustain',                     // Space and CC64: a pedal that keeps the shutters open, sent to the engine
  modWheel: { param: 'wind', max: U_MAX }, // CC1: the wind, up to its top speed
  // the engine: the physics in C++ (native/instruments/windharp), built as WebAssembly
  wasm: { name: 'WindHarpWasmEngine', module: new URL('./windharp-wasm.js', import.meta.url).href, binary: new URL('../wasm/windharp.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room' },
};
