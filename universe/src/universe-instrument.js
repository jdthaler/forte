// universe-instrument.js — the instrument without its page: everything a host needs to play it.
// The page (universe-main.js), the Node tools and tests, and the native plugins
// (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './universe-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'universe',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: the notes keep sounding after the keys are up
  modWheel: 'tilt',                     // CC1: the primordial spectrum's tilt
  // the engine: the physics in C++ (native/instruments/universe), built as WebAssembly
  wasm: { name: 'EarlyUniverseWasmEngine', module: new URL('./universe-wasm.js', import.meta.url).href, binary: new URL('../wasm/universe.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
