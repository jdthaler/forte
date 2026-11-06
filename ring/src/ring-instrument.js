// ring-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (ring-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './ring-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'ring',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: A0–C8
  space: 'sustain',                     // Space and CC64: keeps released beams stored (the scrapers stay open)
  modWheel: 'chroma',                   // CC1: the chromaticity, from its default up
  mpe: { slide: true },                 // MPE: a note's slide is its own ring's chromaticity (a ring can't bend)
  aftertouch: 'more RF voltage', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'how the beam is dumped: a slow lift scrapes it away gently, a fast one fires the abort kicker', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  faders: ['tune', 'octupole', 'spread', 'kick', 'chroma'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/ring), built as WebAssembly
  wasm: { name: 'StorageRingWasmEngine', module: new URL('./ring-wasm.js', import.meta.url).href, binary: new URL('../wasm/ring.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
