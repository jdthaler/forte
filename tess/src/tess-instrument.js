// tess-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (tess-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './tess-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'tess',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: TESS keeps watching after the keys come up
  modWheel: 'impact',                   // CC1: the planet's path, from the star's centre to missing it
  mpe: { bend: 0, slide: false },       // MPE: a planet's year does not bend
  // the engine: the physics in C++ (native/instruments/tess), built as WebAssembly
  wasm: { name: 'TessWasmEngine', module: new URL('./tess-wasm.js', import.meta.url).href, binary: new URL('../wasm/tess.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
