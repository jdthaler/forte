// huygens-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (sync-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './sync-params.js';
import { KEY_LO, KEY_HI } from './tuning.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'huygens',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'tone', 'body', ...TUNING_KEEP], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],                  // MIDI keys: A0–C8, 21–108
  space: 'hold',                            // Space and CC64 latch the keys
  modWheel: 'kick',                         // CC1: the pulse coupling, from its default up
  mpe: { bend: 48, slide: { param: 'kick', max: 0.15 } }, // MPE: a note's bend turns its lamp's resistor; its slide, how hard the others' firings kick its lamp
  aftertouch: 'opens its keyer further: a stronger flash, up to twice as loud', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'how fast the key\'s supply falls: a slow lift lets the lamp flash on more and more slowly as it fades, a fast one cuts it', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  strike: 'how fast the key brings its lamp\'s supply on: a soft key eases the note in, a hard one switches it on at once', // what velocity does, where it isn't how loud (shared/rise.js)
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
