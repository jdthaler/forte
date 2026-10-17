// quantum-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (quantum-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './quantum-params.js';
import { makePacket } from './quantum-model.js';

export { GROUPS, DEFAULTS, PRESETS };

// The highest Bohr line a packet keeps: 20 kHz, or 0.45 fs at a low sample rate.
export const fMax = (fs) => Math.min(20000, 0.45 * fs);

export const INSTRUMENT = {
  id: 'quantum',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [36, 96],                      // MIDI keys
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  modWheel: 'dephase',                  // CC1: dephasing, from its default up to its maximum
  engine: { name: 'QuantumEngine', module: new URL('./quantum-engine.js', import.meta.url).href },
  // the same physics in C++ (native/instruments/quantum), built as WebAssembly: the page runs it
  // when it can, the JavaScript engine otherwise
  wasm: { name: 'QuantumWasmEngine', module: new URL('./quantum-wasm.js', import.meta.url).href, binary: new URL('../wasm/quantum.wasm', import.meta.url).href },
  // each note's packet (~1 ms) is computed off the audio thread and sent with the noteOn (either
  // engine plays it; the page computes it with its WebAssembly model when that has loaded)
  noteData: (key, vel, P, fs) => makePacket(key, P, { fMax: fMax(fs) }),
  chain: { volume: 'volume', room: 'room' },
};
