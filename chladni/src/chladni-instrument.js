// chladni-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (chladni-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './chladni-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'chladni',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: the hand kept off the plates, which ring on after the bow lifts
  modWheel: 'shift',                    // CC1: the bow wanders along the edge, from the figure's place (wheel at rest)
  // MPE: a note's own bend tightens its plate's clamp (up only, a semitone at most); CC74 moves one
  // note's bow along its edge, and each note's pressure presses its bow harder.
  mpe: { bend: 1, way: 'up', slide: true },
  glide: 'the clamp tightened, stiffening the plate: up to a semitone sharp', // what a note's own bend does
  aftertouch: 'the bow presses harder', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'how the bow leaves the plate: a fast lift springs it clear and the plate rings on, a slow one drags it off, damping it', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['speed', 'rosin', 'ring', 'force', 'shift'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/chladni), built as WebAssembly
  wasm: { name: 'ChladniPlateWasmEngine', module: new URL('./chladni-wasm.js', import.meta.url).href, binary: new URL('../wasm/chladni.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
