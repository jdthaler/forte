// grand-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (grand-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './grand-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'grand',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', 'maxFreq', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                                // MIDI keys: A0–C8, the CP-80's 88 (the CP-70 has E1–E7)
  space: 'sustain',                                // Space and CC64: a damper pedal, sent to the engine
  modWheel: 'tremDepth',                // MIDI CC1, the mod wheel (an FC-300's EXP 2): the tremolo, off at rest, full depth fully up
  faders: ['bass', 'mid', 'treble', 'tremRate', 'tremDepth'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/grand), built as WebAssembly
  wasm: { name: 'GrandWasmEngine', module: new URL('./grand-wasm.js', import.meta.url).href, binary: new URL('../wasm/grand.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
