// regal-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (regal-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './regal-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };
export { RESONATORS } from './regal-params.js';

export const KEY_LO = 36, KEY_HI = 84;    // C2–C6 (C–c³), 49 keys: a regal's compass
export const KEY_MIN = 21, KEY_MAX = 108; // with the full range open

export const INSTRUMENT = {
  id: 'regal',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [KEY_MIN, KEY_MAX],            // MIDI keys: A0–C8
  compass: { keys: [KEY_LO, KEY_HI], param: 'fullRange' }, // C2–C6 until Full range opens the rest
  space: 'hold',                        // Space and CC64 latch the keys down (an organ has no damper)
  modWheel: 'pressure',                 // CC1: the weight on the bellows, from its default up to its maximum
  mpe: { bend: 7 },                     // MPE: a key's own bend runs its reeds faster or slower (the wind is every key's: no slide)
  controllers: { 67: 'tremulant' },     // the soft pedal: the tremulant while it is down
  faders: ['tremRate', 'curve', 'q', 'resLength', 'pressure'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/regal), built as WebAssembly
  wasm: { name: 'RegalWasmEngine', module: new URL('./regal-wasm.js', import.meta.url).href, binary: new URL('../wasm/regal.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
