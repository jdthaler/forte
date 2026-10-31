// chladni-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (chladni-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './chladni-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'chladni',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: the hand kept off the plates, which ring on after the bow lifts
  modWheel: 'shift',                    // CC1: the bow wanders along the edge, from the figure's place (wheel at rest)
  // MPE: no bend (a plate rings at its own pitch); CC74 moves one note's bow along its edge, and
  // each note's pressure presses its bow harder.
  mpe: { bend: 0, slide: true },
  faders: ['speed', 'rosin', 'ring', 'force', 'shift'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/chladni), built as WebAssembly
  wasm: { name: 'ChladniPlateWasmEngine', module: new URL('./chladni-wasm.js', import.meta.url).href, binary: new URL('../wasm/chladni.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
