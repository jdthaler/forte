// brass-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (brass-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './brass-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };
export { HORNS } from './brass-params.js';

export const INSTRUMENT = {
  id: 'brass',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8 (past each horn's compass, the same horn built bigger or smaller by octaves)
  space: 'hold',                        // Space and CC64 latch the keys down (a horn has no damper: the note lasts as long as the breath)
  modWheel: 'plunger',                  // CC1: the plunger mute over the bell (wah)
  mpe: { bend: 12, slide: true },       // MPE: a note's own bend moves its slide (and the lips with it); CC74 its own plunger
  faders: ['shock', 'lipTension', 'tongue', 'breath', 'plunger'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/brass), built as WebAssembly
  wasm: { name: 'BrassWasmEngine', module: new URL('./brass-wasm.js', import.meta.url).href, binary: new URL('../wasm/brass.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
