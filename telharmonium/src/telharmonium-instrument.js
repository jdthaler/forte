// telharmonium-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (telharmonium-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './telharmonium-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION, offInPresets } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'telharmonium',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: offInPresets(PRESETS, ['glide']), // its presets turn off what makes little sense on it (shared/expression.js)
  keep: ['volume', 'room', 'venue', 'velocity', 'swell', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'hold',                        // Space and CC64 hold the keys down (the relays stay closed): the Telharmonium had no damper
  modWheel: 'swell',                    // CC1 opens the swell pedal from where it rests
  controllers: { 11: 'swell' },         // MIDI CC11, the expression pedal: the electrical swell
  // MPE: every alternator on a shaft turns with the motor, so no note bends alone (the newest held
  // key's bend turns the motor's field rheostat: the whole machine); a note's slide sets how many
  // harmonics its relay draws; its pressure presses its own key further in
  mpe: { bend: 2, slide: { param: 'draws', max: 1 } },
  glide: 'the shafts\' speed: the newest note\'s bend, through the flywheel', // what a note's own bend does
  aftertouch: 'presses the key further in: louder', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'how fast the relay opens: a slow lift parts its contacts gently, a softer click; a fast one sharply', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['m1', 'm3', 'm5', 'distance', 'swell'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/telharmonium), built as WebAssembly
  wasm: { name: 'TelharmoniumWasmEngine', module: new URL('./telharmonium-wasm.js', import.meta.url).href, binary: new URL('../wasm/telharmonium.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
