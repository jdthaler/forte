// gamelan-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (gamelan-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './gamelan-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'gamelan',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: lifts the damping hand
  modWheel: 'ombak',                    // CC1: the pairs' beat
  mpe: { bend: 0, slide: true },        // MPE: a bar or a gong cannot bend; CC74 is a note's own pair's beat
  faders: ['mallet', 'along', 'gongStrike', 'across', 'ombak'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/gamelan), built as WebAssembly
  wasm: { name: 'GamelanWasmEngine', module: new URL('./gamelan-wasm.js', import.meta.url).href, binary: new URL('../wasm/gamelan.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
