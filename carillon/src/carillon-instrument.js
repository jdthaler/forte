// carillon-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (carillon-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './carillon-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'carillon',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  // MIDI keys: F2–C8 at sounding pitch. Below F2 a bell would outweigh the largest carillon bourdons
  // ever cast (about 20 t), so the range stops there.
  range: [41, 108],
  compass: { keys: [48, 96], param: 'fullRange' }, // C3–C7, a four-octave concert carillon, until Full range opens the rest
  space: null,                          // a carillon has no dampers: no pedal to offer
  faders: ['hardness', 'strikeHeight', 'clapMass', 'around', 'distance'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/carillon), built as WebAssembly
  wasm: { name: 'CarillonWasmEngine', module: new URL('./carillon-wasm.js', import.meta.url).href, binary: new URL('../wasm/carillon.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
