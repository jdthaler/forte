// vibraphone-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (vibraphone-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './vibraphone-params.js';
import { KEY_LO, KEY_HI, KEY_MIN, KEY_MAX } from './bar.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'vibraphone',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity'], // kept when a preset is chosen
  range: [KEY_MIN, KEY_MAX],            // MIDI keys: A0–C8, 21–108
  compass: { keys: [KEY_LO, KEY_HI], param: 'fullRange' }, // F3–F6, 53–89, until Full range opens the rest
  space: 'sustain',                     // Space and CC64: the damper pedal, sent to the engine
  modWheel: 'speed',                    // CC1: the motor's speed
  // the engine: the physics in C++ (native/instruments/vibraphone), built as WebAssembly. The page
  // sends each note its bar's data, packed by the WebAssembly model (vibraphone-main.js), so the
  // audio thread needn't solve the bar; without it (in Node) the engine solves the bar itself.
  wasm: { name: 'VibraphoneWasmEngine', module: new URL('./vibraphone-wasm.js', import.meta.url).href, binary: new URL('../wasm/vibraphone.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
