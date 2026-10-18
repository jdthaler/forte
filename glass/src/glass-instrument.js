// glass-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (glass-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './glass-params.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'glass',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity'], // kept when a preset is chosen
  range: [53, 93],                      // MIDI keys: F3–A6 (Franklin: 37 bowls, G3–G6)
  space: 'hold',                        // Space and CC64 latch the keys down; the host sends the noteOffs on release
  // CC1: treadle speed, from the default (wheel at rest) to twice it: louder (the rim moves
  // faster) and a faster warble. Not the slider's full 3 rev/s: faster than ~1.2 rev/s the
  // big bowls can no longer speak.
  modWheel: { param: 'speed', max: 2 * DEFAULTS.speed },
  // the engine: the physics in C++ (native/instruments/glass), built as WebAssembly
  wasm: { name: 'ArmonicaWasmEngine', module: new URL('./glass-wasm.js', import.meta.url).href, binary: new URL('../wasm/glass.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
