// reeds-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (reeds-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './reeds-params.js';
import { KEY_LO, KEY_HI, KEY_MIN, KEY_MAX } from './reeds-data.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'reeds',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [KEY_MIN, KEY_MAX],            // MIDI keys: A0–C8, 21–108
  compass: { keys: [KEY_LO, KEY_HI], param: 'fullRange' }, // the 200A's A1–C7, 33–96, until Full range opens the rest
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  mpe: { bend: 48 },                    // MPE: a note's own bend stiffens or softens its reed, ±48 semitones
  // the engine: the physics in C++ (native/instruments/reeds), built as WebAssembly
  wasm: { name: 'ReedWasmEngine', module: new URL('./reeds-wasm.js', import.meta.url).href, binary: new URL('../wasm/reeds.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
