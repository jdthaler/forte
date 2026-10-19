// springs-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (springs-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './springs-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };
export const KEY_LO = 36, KEY_HI = 84; // C2–C6: the span the pan is drawn on
export const KEY_MIN = 21, KEY_MAX = 96; // A0–C7: what it plays (springs-model.h says why it stops at C7)

export const INSTRUMENT = {
  id: 'springs',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [KEY_MIN, KEY_MAX],            // MIDI keys: A0–C7
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  modWheel: 'hand',                     // CC1: a hand on the springs
  // the engine: the physics in C++ (native/instruments/springs), built as WebAssembly. The page
  // builds each key's springs with its WebAssembly model and sends them with the note (noteData)
  wasm: { name: 'SpringWasmEngine', module: new URL('./springs-wasm.js', import.meta.url).href, binary: new URL('../wasm/springs.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
