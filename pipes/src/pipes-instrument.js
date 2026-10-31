// pipes-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (pipes-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './pipes-params.js';
import { KEY_LO, KEY_HI, KEY_MIN, KEY_MAX } from './pipes-data.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'pipes',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP],    // kept when a preset is chosen
  range: [KEY_MIN, KEY_MAX],               // MIDI keys: A0–C8, 21–108
  compass: { keys: [KEY_LO, KEY_HI], param: 'fullRange' }, // C–f³, 36–89, until Full range opens the rest
  space: 'hold',                           // Space and CC64 latch the keys down; the host sends the noteOffs on release
  modWheel: { param: 'pressure', max: 3000 }, // CC1: wind pressure, from its default up to 3000 Pa
  mpe: { bend: 12 },                       // MPE: a key's own bend warms or cools the air in its pipes alone, an octave either way (the wind is every key's: no slide)
  faders: ['principal', 'octave', 'mixture', 'wind', 'pressure'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the physics in C++ (native/instruments/pipes), built as WebAssembly
  wasm: { name: 'PipeWasmEngine', module: new URL('./pipes-wasm.js', import.meta.url).href, binary: new URL('../wasm/pipes.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
