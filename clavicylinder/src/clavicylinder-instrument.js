// clavicylinder-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (clavicylinder-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './clavicylinder-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'clavicylinder',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: A0–C8
  compass: { keys: [36, 89], param: 'fullRange' }, // C2–F6, “four and a half octaves, from the great C to f‴”, until Full range opens the rest
  space: 'hold',                        // Space and CC64 latch the keys down (the right foot is on the treadle)
  // CC1: treadle speed, from the default (wheel at rest) to twice it.
  modWheel: { param: 'speed', max: 2 * DEFAULTS.speed },
  // MPE: a note's own bend presses its bar off its centre (a few cents either way); its slide moves
  // where the glass touches its bar, at the touch; each note's pressure presses its key harder.
  mpe: { bend: 0.1, slide: { param: 'contact', max: 0.1 } },
  glide: 'the bar pressed off its centre: a few cents', // what a note's own bend does
  aftertouch: 'the key presses harder on the cylinder', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'how fast the bar\'s cloth leaves the glass: a slow lift drags it off, quieting the bar; a fast one leaves it ringing', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['treadle', 'wet', 'grip', 'press', 'speed'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/clavicylinder), built as WebAssembly
  wasm: { name: 'ClavicylinderWasmEngine', module: new URL('./clavicylinder-wasm.js', import.meta.url).href, binary: new URL('../wasm/clavicylinder.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue', body: { param: 'board', seconds: 0.3, dry: 0.6, wet: 1.1 } },
};
