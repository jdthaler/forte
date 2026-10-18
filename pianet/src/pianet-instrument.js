// pianet-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (pianet-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './pianet-params.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'pianet',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity'], // kept when a preset is chosen
  range: [36, 96],                      // MIDI keys
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  // the engine: the physics in C++ (native/instruments/pianet), built as WebAssembly
  wasm: { name: 'PianetWasmEngine', module: new URL('./pianet-wasm.js', import.meta.url).href, binary: new URL('../wasm/pianet.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
