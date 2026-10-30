// project8-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (project8-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './project8-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'project8',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: keep the traps closed after the keys come up
  modWheel: { param: 'gas', max: 3e-6 }, // CC1: gas into the traps, up to Phase II's pressure
  mpe: { bend: 24, slide: true },       // MPE: each key's own magnet bends its field; CC74 its own gas
  faders: ['field', 'energy', 'noise', 'depth', 'gas'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/project8), built as WebAssembly
  wasm: { name: 'Project8WasmEngine', module: new URL('./project8-wasm.js', import.meta.url).href, binary: new URL('../wasm/project8.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
