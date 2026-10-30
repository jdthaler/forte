// pyrophone-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (pyrophone-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './pyrophone-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'pyrophone',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: A0–C8
  space: 'hold',                        // Space and CC64 latch the keys down; the host sends the noteOffs on release
  modWheel: 'flame',                    // CC1: the flame power, from its default up to its maximum
  mpe: { bend: 48, slide: true },       // MPE: a key's own bend heats its tube's gas alone; its slide is its own flames' power
  faders: ['lag', 'noise', 'listen', 'xf', 'flame'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/pyrophone), built as WebAssembly. It builds
  // each tube's tuning table itself, or takes the one the page offers ({ type: 'tune' }, pyrophone-wasm.js)
  wasm: { name: 'PyrophoneWasmEngine', module: new URL('./pyrophone-wasm.js', import.meta.url).href, binary: new URL('../wasm/pyrophone.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
