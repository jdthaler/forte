// cristal-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (cristal-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './cristal-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'cristal',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: A0–C8
  compass: { keys: [36, 84], param: 'fullRange' }, // C2–C6, the cristal's four octaves, until Full range opens the rest
  space: 'hold',                        // Space and CC64 latch the keys down: the fingers keep stroking
  // CC1: the stroke's speed, from the default (wheel at rest) to twice it: louder, as a faster bow
  modWheel: { param: 'stroke', max: 2 * DEFAULTS.stroke },
  // MPE: a stem rings at its own bending mode, so no note bends; each finger strokes at its own
  // speed (CC74, the wheel's parameter) and presses on its own (pressure)
  mpe: { bend: 0, slide: true },
  aftertouch: 'the wet fingers press harder on the rods, up to twice', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'how fast the wet fingers leave the rods: a slow lift drags them off, the rods singing on a moment; a fast one leaves them ringing free', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['wet', 'height', 'sway', 'press', 'stroke'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/cristal), built as WebAssembly
  wasm: { name: 'CristalWasmEngine', module: new URL('./cristal-wasm.js', import.meta.url).href, binary: new URL('../wasm/cristal.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
