// dunes-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (dunes-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './dunes-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'dunes',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'hold',                        // Space and CC64 hold the keys down: the avalanche keeps running
  modWheel: 'push',                     // CC1 pushes more sand down the face
  // MPE: a grain's shear rate is set by its size and gravity, so no note bends; each key's avalanche is
  // pushed on its own (CC74 is that key's push) and pressed (its pressure)
  mpe: { bend: 0.5, slide: true },
  glide: 'the avalanche\'s shear: its boom a few per cent higher or lower', // what a note's own bend does
  aftertouch: 'pushes more sand down the face', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'how fast the flow drains when the push stops: a slow lift lets the boom run on, a fast one stops it', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['sorting', 'damp', 'speed', 'contact', 'push'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/dunes), built as WebAssembly
  wasm: { name: 'DunesWasmEngine', module: new URL('./dunes-wasm.js', import.meta.url).href, binary: new URL('../wasm/dunes.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
