// huygens-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (sync-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './sync-params.js';
import { KEY_LO, KEY_HI } from './tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'huygens',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'tone', 'body'], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],                  // MIDI keys: 36–96
  space: 'hold',                            // Space and CC64 latch the keys
  modWheel: 'kick',                         // CC1: the pulse coupling, from its default up
  // the engine: the physics in C++ (native/instruments/huygens), built as WebAssembly. It tunes each
  // key itself (tuning, tonic, mistuning), or plays the frequency a note brings (huygens-wasm.js)
  wasm: { name: 'HuygensWasmEngine', module: new URL('./huygens-wasm.js', import.meta.url).href, binary: new URL('../wasm/huygens.wasm', import.meta.url).href },
  // tone low-pass → dry + a small resonant body → room; a slightly lower limiter
  chain: {
    volume: 'volume', room: 'room', tone: 'tone',
    body: { param: 'body', seconds: 0.3, dry: 0.7, wet: 1.2 },
    limiter: { threshold: -4, knee: 4 },
  },
};
