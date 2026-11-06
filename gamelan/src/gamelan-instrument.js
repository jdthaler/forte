// gamelan-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (gamelan-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './gamelan-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'gamelan',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: lifts the damping hand
  modWheel: 'ombak',                    // CC1: the pairs' beat
  mpe: { bend: 0.1, way: 'down', slide: true }, // MPE: a note's own bend, a hand pressing its bar's end or its gong's rim (down only, ten cents at most); CC74 is a note's own pair's beat
  glide: 'a hand pressing the bar\'s end: a few cents flat', // what a note's own bend does
  aftertouch: 'a firm press damps the bar with the other hand', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'the damping hand: on release, a slow lift lets it settle gently (a longer tail) and a fast one stops the bar; damping at the next stroke, a fast lift damps at once', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['mallet', 'along', 'gongStrike', 'across', 'ombak'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/gamelan), built as WebAssembly
  wasm: { name: 'GamelanWasmEngine', module: new URL('./gamelan-wasm.js', import.meta.url).href, binary: new URL('../wasm/gamelan.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
