// clavichord-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (clavichord-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './clavichord-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'clavichord',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: A0–C8
  compass: { keys: [29, 89], param: 'fullRange' }, // FF–f³, until Full range opens the rest
  space: 'hold',                        // Space and CC64 hold the keys down (a clavichord has no dampers to lift)
  modWheel: 'bebung',                   // CC1: the Bebung's depth
  // MPE: no bend (the only way to bend a clavichord's note is to press it, and pressure does
  // that); the slide sets the note's own Bebung, its pressure how hard its key is held.
  mpe: { bend: 0, slide: true },
  faders: ['rate', 'listing', 'detune', 'press', 'bebung'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/clavichord), built as WebAssembly
  wasm: { name: 'ClavichordWasmEngine', module: new URL('./clavichord-wasm.js', import.meta.url).href, binary: new URL('../wasm/clavichord.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
