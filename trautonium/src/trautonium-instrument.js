// trautonium-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (trautonium-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './trautonium-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'trautonium',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', 'swell', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'hold',                        // Space and CC64 latch the keys down: a finger kept on the wire
  // CC1: the first resonant circuit's tuning, from its default (wheel at rest) up: a vowel sweep
  modWheel: 'f1',
  // MPE: a finger rolls and slides along the wire, so a note bends as far as a ribbon (four octaves);
  // CC74 tunes its own first circuit; its pressure presses its wire harder
  mpe: { bend: 48, slide: true },
  controllers: { 11: 'swell' },          // MIDI CC11, the expression pedal: the 1930 instrument's volume pedal
  faders: ['sync', 'q1', 'q2', 'f2', 'f1'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/trautonium), built as WebAssembly
  wasm: { name: 'TrautoniumWasmEngine', module: new URL('./trautonium-wasm.js', import.meta.url).href, binary: new URL('../wasm/trautonium.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
