// clavier-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (clavier-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './clavier-params.js';
import { LO, HI } from './clavier-model.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'clavier',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [LO, HI],                      // MIDI keys: F1–E6, 29–88
  space: 'sustain',                     // Space and CC64: sent to the engine, which reads it as the mute bar
  engine: { name: 'ClavierEngine', module: new URL('./clavier-engine.js', import.meta.url).href },
  // the same physics in C++ (native/instruments/clavier), built as WebAssembly: the page runs it
  // when it can, the JavaScript engine otherwise
  wasm: { name: 'ClavierWasmEngine', module: new URL('./clavier-wasm.js', import.meta.url).href, binary: new URL('../wasm/clavier.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room' },
};
