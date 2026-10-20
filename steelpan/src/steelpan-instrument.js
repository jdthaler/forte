// steelpan-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (steelpan-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './steelpan-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

// The steel band's compass, six bass to high tenor (steelpan-model.h, KEY_LO/KEY_HI).
export const KEY_LO = 33, KEY_HI = 90; // A1–F♯6

export const INSTRUMENT = {
  id: 'steelpan',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  compass: { keys: [KEY_LO, KEY_HI], param: 'fullRange' }, // A1–F♯6 until Full range opens the rest
  space: 'sustain',                     // Space and CC64: keeps the hands off the notes after key-up
  modWheel: 'roll',                     // CC1: the roll
  mpe: { slide: true },                 // a note's own slide: its own roll (a note area cannot bend)
  // the engine: the physics in C++ (native/instruments/steelpan), built as WebAssembly
  wasm: { name: 'SteelPanWasmEngine', module: new URL('./steelpan-wasm.js', import.meta.url).href, binary: new URL('../wasm/steelpan.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
