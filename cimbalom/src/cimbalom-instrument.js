// cimbalom-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (cimbalom-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './cimbalom-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'cimbalom',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8 (the scale carried on past each instrument's compass)
  space: 'sustain',                     // Space and CC64: the damper pedal, which lifts the cimbalom's damper bar
  modWheel: 'strike',                   // CC1: where the hammers land
  // MPE: no bend (a struck string rings at its own pitch); the slide moves the note's own strike point.
  mpe: { bend: 0, slide: true },
  faders: ['mass', 'sympathy', 'detune', 'roll', 'strike'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/cimbalom), built as WebAssembly
  wasm: { name: 'CimbalomWasmEngine', module: new URL('./cimbalom-wasm.js', import.meta.url).href, binary: new URL('../wasm/cimbalom.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
