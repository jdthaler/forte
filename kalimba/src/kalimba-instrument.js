// kalimba-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (kalimba-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './kalimba-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'kalimba',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  lift: 'a fast lift brushes the thumb back over the tine; with the tines damped on release, a slow lift lets the fingertip settle gently', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  compass: { keys: [60, 88], param: 'fullRange' }, // C4–E6, a 17-tine kalimba's span, until Full range opens the rest
  space: 'sustain',                     // Space and CC64: holds fingers off released tines (when they don't ring anyway)
  modWheel: 'cover',                    // CC1: a finger over the sound hole, from open to shut (the wah)
  faders: ['buzz', 'hole', 'thumb', 'pluck', 'cover'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/kalimba), built as WebAssembly
  wasm: { name: 'KalimbaWasmEngine', module: new URL('./kalimba-wasm.js', import.meta.url).href, binary: new URL('../wasm/kalimba.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
