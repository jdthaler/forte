// hydrogen-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (hydrogen-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './hydrogen-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'hydrogen',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: the lamps stay lit after the keys come up
  modWheel: 'density',                  // CC1: the ions' density, which Stark-broadens the lines
  mpe: { bend: 48, slide: true },       // MPE: each lamp's own redshift, and with CC74 its own density
  faders: ['shutter', 'glow', 'laserLevel', 'temperature', 'density'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/hydrogen), built as WebAssembly
  wasm: { name: 'HydrogenWasmEngine', module: new URL('./hydrogen-wasm.js', import.meta.url).href, binary: new URL('../wasm/hydrogen.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
