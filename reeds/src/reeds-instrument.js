// reeds-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (reeds-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './reeds-params.js';
import { KEY_LO, KEY_HI } from './reeds-data.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'reeds',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],              // MIDI keys: A1–C7, 33–96
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  // the engine: the physics in C++ (native/instruments/reeds), built as WebAssembly
  wasm: { name: 'ReedWasmEngine', module: new URL('./reeds-wasm.js', import.meta.url).href, binary: new URL('../wasm/reeds.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room' },
};
