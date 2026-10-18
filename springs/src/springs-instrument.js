// springs-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (springs-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './springs-params.js';

export { GROUPS, DEFAULTS, PRESETS };
export const KEY_LO = 36, KEY_HI = 84; // C2–C6

export const INSTRUMENT = {
  id: 'springs',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],              // MIDI keys: C2–C6
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  modWheel: 'hand',                     // CC1: a hand on the springs
  // the engine: the physics in C++ (native/instruments/springs), built as WebAssembly. The page
  // builds each key's springs with its WebAssembly model and sends them with the note (noteData)
  wasm: { name: 'SpringWasmEngine', module: new URL('./springs-wasm.js', import.meta.url).href, binary: new URL('../wasm/springs.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room' },
};
