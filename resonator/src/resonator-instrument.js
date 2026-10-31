// resonator-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (resonator-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './resonator-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'resonator',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: the damper pedal, sent to the engine
  // CC1: the drive's brightness (McPherson played the MRP's timbre on a wheel)
  modWheel: 'bright',
  // MPE: no bend (a piano string rings at its own pitch, and the loop locks to it), but each note's
  // own brightness on CC74 and its own pressure, which presses the key harder: more current.
  mpe: { bend: 0, slide: true },
  faders: ['drive', 'attack', 'hammer', 'phase', 'bright'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/resonator), built as WebAssembly
  wasm: { name: 'ResonatorWasmEngine', module: new URL('./resonator-wasm.js', import.meta.url).href, binary: new URL('../wasm/resonator.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue', body: { param: 'soundboard', seconds: 0.4, dry: 0.75, wet: 1.1 } }, // the soundboard
};
