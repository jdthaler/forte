// ondes-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (ondes-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './ondes-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'ondes',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'hold',                        // Space and CC64 latch the keys down: the intensity key stays pressed
  // CC1: the finger rocking the key from side to side, from none (wheel at rest) up
  modWheel: 'vibrato',
  // MPE: a finger slides as the ring slides along the ribbon, so a note bends four octaves; CC74
  // rocks its own key; its pressure presses the intensity key harder
  mpe: { bend: 48, slide: true },
  faders: ['pull', 'octave', 'souffle', 'balance', 'vibrato'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/ondes), built as WebAssembly
  wasm: { name: 'OndesWasmEngine', module: new URL('./ondes-wasm.js', import.meta.url).href, binary: new URL('../wasm/ondes.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
