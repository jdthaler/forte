// huygens-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (sync-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './sync-params.js';
import { KEY_LO, KEY_HI } from './tuning.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'huygens',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'tone', 'body', ...TUNING_KEEP], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],                  // MIDI keys: A0–C8, 21–108
  space: 'hold',                            // Space and CC64 latch the keys
  modWheel: 'kick',                         // CC1: the pulse coupling, from its default up
  mpe: { bend: 48 },                        // MPE: a note's bend turns its lamp's resistor (the coupling is every lamp's: no slide)
  faders: ['rSrc', 'mistune', 'body', 'tone', 'kick'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/huygens), built as WebAssembly. It tunes each
  // key itself (tuning, tonic, mistuning), or plays the frequency a note brings (huygens-wasm.js)
  wasm: { name: 'HuygensWasmEngine', module: new URL('./huygens-wasm.js', import.meta.url).href, binary: new URL('../wasm/huygens.wasm', import.meta.url).href },
  // tone low-pass → dry + a small resonant body → room; a slightly lower limiter
  chain: {
    volume: 'volume', room: 'room', venue: 'venue', tone: 'tone',
    body: { param: 'body', seconds: 0.3, dry: 0.7, wet: 1.2 },
    limiter: { threshold: -4, knee: 4 },
  },
};
