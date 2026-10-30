// hurdygurdy-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (hurdygurdy-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS, RANGE } from './hurdygurdy-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'hurdygurdy',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: RANGE,                         // MIDI keys: G4–G6, 67–91 (the open chanterelles and 24 tangents)
  space: 'sustain',                     // Space and CC64: the coup de poignet, held (the engine's setSustain)
  modWheel: 'crank',                    // CC1: the crank's speed
  // the engine: the physics in C++ (native/instruments/hurdygurdy), built as WebAssembly
  wasm: { name: 'HurdyGurdyWasmEngine', module: new URL('./hurdygurdy-wasm.js', import.meta.url).href, binary: new URL('../wasm/hurdygurdy.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
