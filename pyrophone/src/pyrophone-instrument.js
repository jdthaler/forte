// pyrophone-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (pyrophone-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './pyrophone-params.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'pyrophone',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity'], // kept when a preset is chosen
  range: [48, 84],                      // MIDI keys
  space: 'hold',                        // Space and CC64 latch the keys down; the host sends the noteOffs on release
  modWheel: 'flame',                    // CC1: the flame power, from its default up to its maximum
  // the engine: the physics in C++ (native/instruments/pyrophone), built as WebAssembly. It builds
  // each tube's tuning table itself, or takes the one the page offers ({ type: 'tune' }, pyrophone-wasm.js)
  wasm: { name: 'PyrophoneWasmEngine', module: new URL('./pyrophone-wasm.js', import.meta.url).href, binary: new URL('../wasm/pyrophone.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
