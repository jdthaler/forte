// abracadabra-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (abracadabra-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './abracadabra-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'abracadabra',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: keep the magnets charged after the keys come up
  modWheel: { param: 'halo', max: 2000 }, // CC1: a hotter halo, up to a galaxy cluster's
  mpe: { bend: 0, slide: true },        // MPE: an axion's mass does not bend; CC74 heats its own halo
  faders: ['streamSpeed', 'stream', 'noise', 'coupling', 'halo'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/abracadabra), built as WebAssembly
  wasm: { name: 'AbracadabraWasmEngine', module: new URL('./abracadabra-wasm.js', import.meta.url).href, binary: new URL('../wasm/abracadabra.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
