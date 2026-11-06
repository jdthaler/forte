// hurdygurdy-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (hurdygurdy-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS, RANGE } from './hurdygurdy-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION, offInPresets } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'hurdygurdy',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: offInPresets(PRESETS, ['lift']), // its presets turn off what makes little sense on it (shared/expression.js)
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: RANGE,                         // MIDI keys: G4–G6, 67–91 (the open chanterelles and 24 tangents)
  space: 'sustain',                     // Space and CC64: the coup de poignet, held (the engine's setSustain)
  modWheel: 'crank',                    // CC1: the crank's speed
  aftertouch: 'the hand leans into the crank (every string)', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'a slow lift lets the tangent sag off the string: the pitch slides down to the next stop or the open string', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  mpe: { bend: 1, way: 'up', slide: { param: 'pressure', max: 3 } }, // MPE: the melody's own bend pushes its tangent harder (up only, a semitone at most); its slide presses the chanterelles harder onto the wheel
  glide: 'the tangent pushed harder into the strings: up to a semitone sharp, the players\' vibrato', // what a note's own bend does
  faders: ['coup', 'pressure', 'bounce', 'tirant', 'crank'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/hurdygurdy), built as WebAssembly
  wasm: { name: 'HurdyGurdyWasmEngine', module: new URL('./hurdygurdy-wasm.js', import.meta.url).href, binary: new URL('../wasm/hurdygurdy.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
