// ring-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (ring-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './ring-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'ring',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: A0–C8
  space: 'sustain',                     // Space and CC64: keeps released beams stored (the scrapers stay open)
  modWheel: 'chroma',                   // CC1: the chromaticity, from its default up
  // the engine: the physics in C++ (native/instruments/ring), built as WebAssembly
  wasm: { name: 'StorageRingWasmEngine', module: new URL('./ring-wasm.js', import.meta.url).href, binary: new URL('../wasm/ring.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
