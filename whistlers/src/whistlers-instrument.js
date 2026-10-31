// whistlers-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (whistlers-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './whistlers-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'whistlers',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: keeps the receivers open
  modWheel: { param: 'chorus', max: 20 }, // CC1: chorus on the held keys' field lines
  faders: ['ducts', 'echo', 'density', 'sferic', 'chorus'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/whistlers), built as WebAssembly
  wasm: { name: 'WhistlersWasmEngine', module: new URL('./whistlers-wasm.js', import.meta.url).href, binary: new URL('../wasm/whistlers.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
