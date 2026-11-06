// abracadabra-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (abracadabra-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './abracadabra-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION, offInPresets } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'abracadabra',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: offInPresets(PRESETS, ['glide', 'lift']), // its presets turn off what makes little sense on it (shared/expression.js)
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: all 88, A0–C8
  space: 'sustain',                     // Space and CC64: keep the magnets charged after the keys come up
  modWheel: { param: 'halo', max: 2000 }, // CC1: a hotter halo, up to a galaxy cluster's
  mpe: { bend: 0.1, slide: true },      // MPE: an axion's mass does not bend, but the Earth's speed through the halo shifts it; CC74 heats its own halo
  aftertouch: 'its magnet\'s field, up to twice: a stronger signal above the noise', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  glide: 'the Earth\'s speed through the halo: a tiny Doppler shift', // what a note's own bend does
  lift: 'how fast the magnet ramps down: a slow lift over up to four times the ramp, a fast one in a quarter of it', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['streamSpeed', 'stream', 'noise', 'coupling', 'halo'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/abracadabra), built as WebAssembly
  wasm: { name: 'AbracadabraWasmEngine', module: new URL('./abracadabra-wasm.js', import.meta.url).href, binary: new URL('../wasm/abracadabra.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
