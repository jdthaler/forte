// bowed-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (bowed-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS, RANGE } from './bowed-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'bowed',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: RANGE,                         // MIDI keys: A0–D7, 21–98
  space: 'hold',                        // Space and CC64 latch the keys down; the host sends the noteOffs on release
  modWheel: 'speed',                    // CC1: the treadle, the instrument's swell (Helmholtz amplitude ∝ v_B)
  mpe: { bend: 12 },                    // MPE: a key's own bend slides its bridge alone, an octave either way (one wheel bows every string: no slide)
  aftertouch: 'presses the string harder onto the wheel', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'how fast the key lifts the string off the wheel: 60 ms for a slow lift, the tone thinning as it goes, 4 ms for a fast one', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['force', 'treadle', 'grain', 'beta', 'speed'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/bowed), built as WebAssembly
  wasm: { name: 'OrganistaWasmEngine', module: new URL('./bowed-wasm.js', import.meta.url).href, binary: new URL('../wasm/bowed.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
