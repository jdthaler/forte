// cuore-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (cuore-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './cuore-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION, offInPresets } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'cuore',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: offInPresets(PRESETS, ['lift']), // its presets turn off what makes little sense on it (shared/expression.js)
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: the heaters keep firing after the keys come up
  modWheel: { param: 'tbase', max: 14 }, // CC1: the heat sink warms, up to 14 mK
  // MPE: each crystal's heater pulser fires at any rate; a note's slide, as its crystal starts, is
  // its own thermistor's bias (the sink is shared)
  mpe: { bend: 48, slide: { param: 'bias', max: 15 } },
  aftertouch: 'more heat in each pulse', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'a slow lift fades the pulses out, the heater firing ever weaker; a fast one cuts the crystal\'s cooling tail short', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['energy', 'periodA4', 'bias', 'clamp', 'tbase'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/cuore), built as WebAssembly
  wasm: { name: 'CuoreWasmEngine', module: new URL('./cuore-wasm.js', import.meta.url).href, binary: new URL('../wasm/cuore.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
