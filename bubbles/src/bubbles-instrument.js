// bubbles-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (bubbles-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './bubbles-params.js';
import { KEY_LO, KEY_HI } from './bubbles-model.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'bubbles',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],              // MIDI keys: A3–C8, 57–108
  space: 'hold',                        // Space and CC64 latch the keys down; the host sends the noteOffs on release
  modWheel: 'rate',                     // CC1: the bubble rate, from its default up to its maximum
  engine: { name: 'BubbleEngine', module: new URL('./bubbles-engine.js', import.meta.url).href },
  // the same physics in C++ (native/instruments/bubbles), built as WebAssembly: the page runs it
  // when it can, the JavaScript engine otherwise
  wasm: { name: 'BubbleWasmEngine', module: new URL('./bubbles-wasm.js', import.meta.url).href, binary: new URL('../wasm/bubbles.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room' },
};
