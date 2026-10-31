// stars-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (stars-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './stars-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };
export const KEY_LO = 21, KEY_HI = 108; // A0–C8

export const INSTRUMENT = {
  id: 'stars',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],              // MIDI keys: A0–C8
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  modWheel: 'spin',                     // CC1: the star's rotation
  mpe: { slide: true },                 // MPE: a note's slide spins its own star (a star can't bend)
  faders: ['flare', 'incl', 'coreRatio', 'driving', 'spin'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/stars), built as WebAssembly. The page
  // builds each key's star with its WebAssembly model and sends it with the note (noteData)
  wasm: { name: 'StarWasmEngine', module: new URL('./stars-wasm.js', import.meta.url).href, binary: new URL('../wasm/stars.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
