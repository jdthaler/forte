// arc-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (arc-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './arc-params.js';
import { KEY_LO, KEY_HI } from './arc-model.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

// The capacitor bank the engine plays from: each key's capacitor, cut for its sounding note or by
// Kelvin's formula. The talking arc plays none (its transformer replaces the coil), so the bank is
// always cut for the arcs' circuit (bankParams).
export const bankParams = (P) => (P.mode === 'talk' ? { ...P, mode: 'mono' } : P);

export const INSTRUMENT = {
  id: 'arc',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'dist', ...TUNING_KEEP],  // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],           // MIDI keys: A0–C8, 21–108
  space: 'hold',                     // Space and CC64 latch the keys down; the host sends the noteOffs on release
  modWheel: 'current',               // CC1: the arc current, from its default up to its maximum
  mpe: { bend: 12 },                 // MPE: a key's own bend slides its arc's core (one arc: the newest key's); the current is the supply's
  faders: ['hiss', 'tau', 'dist', 'gap', 'current'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/arc), built as WebAssembly. It cuts its own
  // bank (each key's on its first note), or plays the one the page offers with a note (arc-wasm.js)
  wasm: { name: 'ArcWasmEngine', module: new URL('./arc-wasm.js', import.meta.url).href, binary: new URL('../wasm/arc.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
