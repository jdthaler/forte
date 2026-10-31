// tines-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (rhodes-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './rhodes-params.js';
import { KEY_MIN, KEY_MAX } from './tine.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'tines',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [KEY_MIN, KEY_MAX],            // MIDI keys: 88, A0–C8 (the 73-key models: E1–E7)
  space: 'sustain',                     // Space and CC64: the damper pedal, sent to the engine
  midiVelocity: (v) => 0.25 * 20 ** v,  // MIDI velocity / 127 → hammer speed, 0.25 … 5 m/s
  mpe: { bend: 48 },                    // MPE: a note's own bend slides its fork's tuning spring, ±48 semitones
  faders: ['drive', 'tone', 'hardness', 'tremRate', 'tremDepth'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/tines), built as WebAssembly
  wasm: { name: 'TinesWasmEngine', module: new URL('./tines-wasm.js', import.meta.url).href, binary: new URL('../wasm/tines.wasm', import.meta.url).href },
  // 'tone' is the speaker inside the engine, not the chain's low-pass
  chain: { volume: 'volume', room: 'room', venue: 'venue', roomSeconds: 1.8 },
};
