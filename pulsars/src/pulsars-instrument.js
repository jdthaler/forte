// pulsars-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (pulsars-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './pulsars-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'pulsars',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8 (past the fastest known pulsar, and past break-up, the same design carries on)
  space: 'hold',                        // Space and CC64 latch the keys down: a pulsar keeps spinning; the host sends the noteOffs on release
  modWheel: { param: 'dm', max: 400 },  // CC1: the electrons on the way, from the DM set up to 400 pc/cm³
  mpe: { bend: 0.1, slide: true },      // MPE: a spin cannot bend, but its binary orbit Doppler-shifts it; CC74 is each pulsar's own DM, its own distance
  glide: 'its binary orbit toward us or away: a Doppler shift of a few cents', // what a note's own bend does
  lift: 'a slow lift fades the pulse train out before the pulsar switches off; a fast one cuts it, the dispersed tail too', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['alpha', 'sightline', 'jitter', 'freq', 'dm'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/pulsars), built as WebAssembly
  wasm: { name: 'PulsarsWasmEngine', module: new URL('./pulsars-wasm.js', import.meta.url).href, binary: new URL('../wasm/pulsars.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
