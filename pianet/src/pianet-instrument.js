// pianet-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (pianet-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './pianet-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION, offInPresets } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'pianet',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: offInPresets(PRESETS, ['press']), // its presets turn off what makes little sense on it (shared/expression.js)
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: A0–C8
  compass: { keys: [36, 96], param: 'fullRange' }, // the Pianet's 61, C2–C7, until Full range opens the rest
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  // MPE: a note's own bend stiffens or softens its reed, ±12 semitones (the pad's forces don't
  // scale with it); its own slide moves where its pad grabs the reed, toward the clamp, at the touch
  mpe: { bend: 12, slide: { param: 'grab', max: 0.55 } },
  aftertouch: 'a firm press mutes the reed by the pickup with a hand', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'the pad\'s return: a slow lift lets the reed ring on, a fast one slaps the pad back onto it', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['tack', 'gap', 'padC', 'tone', 'drive'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/pianet), built as WebAssembly
  wasm: { name: 'PianetWasmEngine', module: new URL('./pianet-wasm.js', import.meta.url).href, binary: new URL('../wasm/pianet.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
