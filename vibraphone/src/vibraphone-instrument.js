// vibraphone-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (vibraphone-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './vibraphone-params.js';
import { KEY_LO, KEY_HI, KEY_MIN, KEY_MAX } from './bar.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION, offInPresets } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'vibraphone',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: offInPresets(PRESETS, ['glide', 'lift']), // its presets turn off what makes little sense on it (shared/expression.js)
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [KEY_MIN, KEY_MAX],            // MIDI keys: A0–C8, 21–108
  lift: 'a fast lift lets the mallet rest on the bar a moment, damping it even with the pedal down', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  mpe: { bend: 1, way: 'down', slide: { param: 'strike', max: 0.05 } }, // MPE: a note's own bend drags a hard mallet along its bar (down only, a semitone at most); its slide moves its mallet from the centre towards the bar's end, at the stroke
  glide: 'a hard mallet pressed and dragged on the bar: up to a semitone flat', // what a note's own bend does
  aftertouch: 'a firm press holds the mallet into the bar: the dead stroke', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  compass: { keys: [KEY_LO, KEY_HI], param: 'fullRange' }, // F3–F6, 53–89, until Full range opens the rest
  space: 'sustain',                     // Space and CC64: the damper pedal, sent to the engine
  modWheel: 'speed',                    // CC1: the motor's speed
  faders: ['hardness', 'gap', 'damp', 'strike', 'speed'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/vibraphone), built as WebAssembly. The page
  // sends each note its bar's data, packed by the WebAssembly model (vibraphone-main.js), so the
  // audio thread needn't solve the bar; without it (in Node) the engine solves the bar itself.
  wasm: { name: 'VibraphoneWasmEngine', module: new URL('./vibraphone-wasm.js', import.meta.url).href, binary: new URL('../wasm/vibraphone.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
