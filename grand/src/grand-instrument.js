// grand-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (grand-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './grand-params.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'grand',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity', 'maxFreq'], // kept when a preset is chosen
  range: [28, 100],                                // MIDI keys: E1–E7, 73 keys
  space: 'sustain',                                // Space and CC64: a damper pedal, sent to the engine
  // the engine: the physics in C++ (native/instruments/grand), built as WebAssembly
  wasm: { name: 'GrandWasmEngine', module: new URL('./grand-wasm.js', import.meta.url).href, binary: new URL('../wasm/grand.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room' },
};
