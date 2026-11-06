// cellulophone-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (cellulophone-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './cellulophone-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION, offInPresets } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'cellulophone',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: offInPresets(PRESETS, ['glide']), // its presets turn off what makes little sense on it (shared/expression.js)
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'hold',                        // Space and CC64 hold the keys down (their mirrors stay in the beam): an organ has no damper
  modWheel: 'push',                     // CC1 pushes the keys back: the timbre screen slides into the windows
  // MPE: every disc is geared to one motor, so no note bends alone (pitch bend turns the motor); each
  // key slides back on its own (CC74 is that key's push) and presses deeper (its pressure)
  mpe: { bend: 2, slide: true },
  glide: 'the motor\'s speed: the newest note\'s bend, through the discs\' inertia', // what a note's own bend does
  aftertouch: 'the key goes deeper: more light, louder', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'how fast the key\'s mirror tilts back out of the beam: a slow lift fades the note, a fast one cuts it', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['tremolo', 'damping', 'drive', 'slot', 'push'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/cellulophone), built as WebAssembly
  wasm: { name: 'CellulophoneWasmEngine', module: new URL('./cellulophone-wasm.js', import.meta.url).href, binary: new URL('../wasm/cellulophone.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
