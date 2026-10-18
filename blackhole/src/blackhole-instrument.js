// blackhole-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (ringdown-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS, KEY_LO, KEY_HI } from './ringdown-params.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'blackhole',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'tone', 'stereo'], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],                    // MIDI keys: 36–96
  space: null,                                // a ringdown has no damper; nothing to hold
  modWheel: 'spinU',                          // CC1: the spin, from its default up to 1 − 10⁻⁶
  midiVelocity: (v) => v ** 1.5,              // MIDI velocity / 127 → the engine's
  keyVelocity: 1,                             // the velocity the computer keys play (no velocity parameter)
  // the engine, in C++ (native/instruments/blackhole), built as WebAssembly: it builds each key's
  // voice (its modes, and chirp) from the QNM table and the parameters as the note starts
  wasm: { name: 'BlackholeWasmEngine', module: new URL('./blackhole-wasm.js', import.meta.url).href, binary: new URL('../wasm/blackhole.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', roomSeconds: 2.2, tone: 'tone' },
};
