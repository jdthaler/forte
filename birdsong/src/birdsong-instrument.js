// birdsong-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (birdsong-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './birdsong-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'birdsong',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'hold',                        // Space and CC64 hold the keys down: the bird keeps singing
  // CC1: the syllable rate, from its default (wheel at rest) up
  modWheel: 'rate',
  // MPE: a note bends as the labial muscles retune it (two octaves); CC74 sets its own syllable rate;
  // its pressure is a harder breath
  mpe: { bend: 24, slide: true },
  aftertouch: 'a harder breath, which sharpens the note', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  faders: ['drive', 'sweep', 'trachea', 'tension', 'rate'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/birdsong), built as WebAssembly
  wasm: { name: 'BirdsongWasmEngine', module: new URL('./birdsong-wasm.js', import.meta.url).href, binary: new URL('../wasm/birdsong.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
