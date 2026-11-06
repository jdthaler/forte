// saw-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (saw-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './saw-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'saw',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8 (past a real saw's two octaves, a bigger or smaller blade)
  space: 'sustain',                     // Space and CC64: the hand stays off the blade, so a note rings on after its key
  modWheel: 'vibrato',                  // CC1: the knee shaking the handle, from still (wheel at rest) up
  // MPE: a note bends as the player bends the blade, four octaves; CC74 shakes its own vibrato;
  // its pressure presses the bow harder
  mpe: { bend: 48, slide: true },
  aftertouch: 'the bow presses harder', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  faders: ['bend', 'force', 'place', 'speed', 'vibrato'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/saw), built as WebAssembly
  wasm: { name: 'SawWasmEngine', module: new URL('./saw-wasm.js', import.meta.url).href, binary: new URL('../wasm/saw.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
