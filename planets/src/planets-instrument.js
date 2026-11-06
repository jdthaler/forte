// planets-instrument.js — the instrument without its page: everything a host needs to play it.
// The page (planets-main.js), the Node tools and tests, and the native plugins
// (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './planets-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'planets',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: keep recording after the key comes up
  modWheel: 'spin',                     // CC1 spins the planet up (or stops it)
  mpe: { bend: 48, slide: true },       // a note's bend changes its own time-lapse; CC74 its own spin
  lift: 'how the recording stops: a slow lift fades the ringing, a fast one cuts it', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['depth', 'distance', 'azimuth', 'atten', 'spin'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/planets), built as WebAssembly
  wasm: { name: 'PlanetWasmEngine', module: new URL('./planets-wasm.js', import.meta.url).href, binary: new URL('../wasm/planets.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
