// pianet-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (pianet-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './pianet-params.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'pianet',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [36, 96],                      // MIDI keys
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  engine: { name: 'PianetEngine', module: new URL('./pianet-engine.js', import.meta.url).href },
  // the same physics in C++ (native/instruments/pianet), built as WebAssembly: the page runs it
  // when it can, the JavaScript engine otherwise
  wasm: { name: 'PianetWasmEngine', module: new URL('./pianet-wasm.js', import.meta.url).href, binary: new URL('../wasm/pianet.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room' },
};
