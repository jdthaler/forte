// nmr-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (nmr-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './nmr-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION, offInPresets } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'nmr',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: offInPresets(PRESETS, ['lift']), // its presets turn off what makes little sense on it (shared/expression.js)
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8 (past E6, ethanol needs a magnet stronger than any built)
  space: 'sustain',                     // Space and CC64: the pedal fires a π pulse at every sounding sample (held, an echo train)
  modWheel: { param: 'shim', max: 500 }, // CC1 spoils the shim: the field's spread, up to 500 ppb
  // MPE: each key is its own magnet, so a note's bend is its own field offset (every line by the
  // same hertz) and CC74 its own shim
  mpe: { bend: 48, slide: true },
  aftertouch: 'its own echo train: π pulses on its sample, faster the harder it is pressed', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'how the receiver closes: a slow lift fades the echoes out, a fast one cuts them', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['flip', 't2', 'noise', 'spacing', 'shim'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/nmr), built as WebAssembly
  wasm: { name: 'NmrWasmEngine', module: new URL('./nmr-wasm.js', import.meta.url).href, binary: new URL('../wasm/nmr.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
