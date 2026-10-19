// cavity-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (cavity-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './cavity-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'cavity',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: keeps the couplers' antennas back, so released cavities ring on
  modWheel: 'offset',                   // CC1: the beam's offset, from its default out
  // the engine: the physics in C++ (native/instruments/cavity), built as WebAssembly
  wasm: { name: 'CavityBellsWasmEngine', module: new URL('./cavity-wasm.js', import.meta.url).href, binary: new URL('../wasm/cavity.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
