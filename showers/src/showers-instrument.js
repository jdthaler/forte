// showers-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (showers-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './showers-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'showers',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: keeps the dampers off the crystals
  modWheel: 'offset',                   // CC1: the impact point, from its default out to the crack
  faders: ['pileup', 'piezo', 'q', 'energy', 'offset'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/showers), built as WebAssembly
  wasm: { name: 'ColliderShowersWasmEngine', module: new URL('./showers-wasm.js', import.meta.url).href, binary: new URL('../wasm/showers.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
