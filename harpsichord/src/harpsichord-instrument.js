// harpsichord-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (harpsichord-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS, KEY_LO, KEY_HI, KEY_MIN, KEY_MAX } from './harpsichord-params.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'harpsichord',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [KEY_MIN, KEY_MAX],            // MIDI keys: A0–C8, 21–108
  compass: { keys: [KEY_LO, KEY_HI], param: 'fullRange' }, // FF–f³, 29–89, until Full range opens the rest
  space: 'hold',                        // Space and CC64 latch the keys down; the host sends the noteOffs on release
  // the engine: the physics in C++ (native/instruments/harpsichord), built as WebAssembly
  wasm: { name: 'HarpsichordWasmEngine', module: new URL('./harpsichord-wasm.js', import.meta.url).href, binary: new URL('../wasm/harpsichord.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room' },
};
