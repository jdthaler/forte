// ionchain-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (ionchain-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './ionchain-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'ionchain',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: the cooling laser kept off, so let-go keys ring on
  // CC1: the radial pull weakens from its default toward the zigzag, down to 0.6 ω_z
  modWheel: { param: 'aniso', max: 0.6 },
  // MPE: a note's own bend is its trap's endcap voltage (the axial frequency, every mode with it)
  mpe: { bend: 12 },
  aftertouch: 'a laser\'s push on its ions: pressed fully, they ring on as long as it is held', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'the cooling laser: a fast lift cools the ions at once, a slow one gently, letting them ring on', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['beam', 'angle', 'distance', 'pulse', 'aniso'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/ionchain), built as WebAssembly
  wasm: { name: 'IonChainWasmEngine', module: new URL('./ionchain-wasm.js', import.meta.url).href, binary: new URL('../wasm/ionchain.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
