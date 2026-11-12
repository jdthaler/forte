// breitwigner-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (breitwigner-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './breitwigner-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'breitwigner',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: the pedal keeps the key-up channel shut, sent to the engine
  modWheel: { param: 'width', max: 0.2 }, // CC1: the width, from its default up to a ρ meson's
  mpe: { bend: 24, way: 'up', slide: true }, // MPE: a note's own bend boosts its state (up only: γ ≥ 1, to γ = 4); its slide is its own width
  glide: 'a boost: its energy γM is sharper, and its life γ times longer', // what a note's own bend does
  aftertouch: 'a firm press opens a third decay channel: the note dies while pressed', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'a slow lift opens the key-up channel half as wide, a fast one twice as wide', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['power', 'release', 'press', 'phase', 'width'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/breitwigner), built as WebAssembly
  wasm: { name: 'BreitWignerWasmEngine', module: new URL('./breitwigner-wasm.js', import.meta.url).href, binary: new URL('../wasm/breitwigner.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
