// marimba-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (marimba-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS, KINDS } from './marimba-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS, KINDS };

// The real instruments' compasses, which the bars are graded on (marimba-model.h): the concert
// marimba's C2–C7 and the xylophone's F4–C8. Every key A0–C8 has a bar, the design carried on.
export const KEY_MIN = 21, KEY_MAX = 108;
export const COMPASS = { marimba: [36, 96], xylophone: [65, 108] };
// What the undercut tunes the first bending modes to (the xylophone's third falls near 6).
export const TARGETS = { marimba: [1, 4, 10], xylophone: [1, 3] };

export const INSTRUMENT = {
  id: 'marimba',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [KEY_MIN, KEY_MAX],            // MIDI keys: all 88, A0–C8
  space: 'hold',                        // Space and CC64 hold the keys down: a marimba has no dampers, and held notes keep rolling
  modWheel: 'roll',                     // CC1: the roll
  mpe: { bend: 1, way: 'down', slide: true }, // a note's own bend drags a hard mallet along its bar (down only, a semitone at most); its slide, its own roll
  glide: 'a hard mallet pressed and dragged on the bar: up to a semitone flat', // what a note's own bend does
  aftertouch: 'a firm press holds the mallet into the bar: the dead stroke', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'a fast lift lets the mallet rest on the bar a moment, damping it', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['hardness', 'gap', 'rollRate', 'strike', 'roll'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/marimba), built as WebAssembly. The page
  // sends each note its bar's data, packed by the WebAssembly model (marimba-main.js), so the
  // audio thread needn't solve the bar; without it (in Node) the engine solves the bar itself.
  wasm: { name: 'MarimbaWasmEngine', module: new URL('./marimba-wasm.js', import.meta.url).href, binary: new URL('../wasm/marimba.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
