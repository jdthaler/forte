// voice-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (voice-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './voice-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'voice',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', 'fullRange', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  compass: { keys: [36, 84], param: 'fullRange' }, // C2–C6, a bass's low C to a soprano's top C, until Full range opens the rest
  space: 'hold',                        // Space and CC64 hold the keys down: the singers sing on
  modWheel: 'vowel',                    // CC1: the vowel, from where the slider is
  // MPE: a note slides as far as the controller bends it, as a singer's can, CC74 moves that note's own vowel,
  // and its pressure pushes that singer's lungs harder
  mpe: { bend: 48, slide: true },
  aftertouch: 'the lungs push harder', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  faders: ['pressure', 'gap', 'vibrato', 'larynx', 'vowel'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/voice), built as WebAssembly
  wasm: { name: 'VoiceWasmEngine', module: new URL('./voice-wasm.js', import.meta.url).href, binary: new URL('../wasm/voice.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
