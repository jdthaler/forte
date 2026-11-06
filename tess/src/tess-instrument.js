// tess-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (tess-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './tess-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'tess',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: TESS keeps watching after the keys come up
  modWheel: 'impact',                   // CC1: the planet's path, from the star's centre to missing it
  mpe: { bend: 0.1, slide: false },     // MPE: a planet's year bends only as a second planet tugs it (transit-timing variations)
  glide: 'a second planet\'s tug: the transits early or late, a few cents', // what a note's own bend does
  lift: 'a slow lift fades the light curve out through its dips; a fast one cuts it at once', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['teff', 'starRadius', 'periodA4', 'planetRadius', 'impact'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/tess), built as WebAssembly
  wasm: { name: 'TessWasmEngine', module: new URL('./tess-wasm.js', import.meta.url).href, binary: new URL('../wasm/tess.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
