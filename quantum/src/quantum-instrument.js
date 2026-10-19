// quantum-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (quantum-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './quantum-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

// The highest Bohr line a packet keeps: 20 kHz, or 0.45 fs at a low sample rate.
export const fMax = (fs) => Math.min(20000, 0.45 * fs);

export const INSTRUMENT = {
  id: 'quantum',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: A0–C8
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  modWheel: 'dephase',                  // CC1: dephasing, from its default up to its maximum
  // the engine: the physics in C++ (native/instruments/quantum), built as WebAssembly. Each note's
  // packet (~1 ms) is computed off the audio thread, by the page's WebAssembly model, and sent with
  // the noteOn (the page's noteData)
  wasm: { name: 'QuantumWasmEngine', module: new URL('./quantum-wasm.js', import.meta.url).href, binary: new URL('../wasm/quantum.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
};
