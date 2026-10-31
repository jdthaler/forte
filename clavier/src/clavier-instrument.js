// clavier-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (clavier-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS, LO, HI, KEY_MIN, KEY_MAX } from './clavier-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'clavier',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [KEY_MIN, KEY_MAX],            // MIDI keys: A0–C8, 21–108
  compass: { keys: [LO, HI], param: 'fullRange' }, // the D6's F1–E6, 29–88, until Full range opens the rest
  space: 'sustain',                     // Space and CC64: sent to the engine, which reads it as the mute bar
  mpe: { bend: 2, press: true },        // a note's own bend presses its key as the wheel does: up to 2 semitones, tens of cents
  faders: ['mute', 'press', 'hf', 'xUpper', 'gain'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/clavier), built as WebAssembly
  wasm: { name: 'ClavierWasmEngine', module: new URL('./clavier-wasm.js', import.meta.url).href, binary: new URL('../wasm/clavier.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
