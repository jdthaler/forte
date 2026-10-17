// vibraphone-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (vibraphone-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './vibraphone-params.js';
import { KEY_LO, KEY_HI, voiceData } from './vibraphone-model.js';

export { GROUPS, DEFAULTS, PRESETS };

// The bars' modal data (a few ms each), sent with each note so the audio thread never solves a
// bar. Kept, so the page can build it ahead, a key at a time, when it is idle.
const cache = new Map();
export function dataFor(key, depth) {
  const id = `${key}|${depth}`;
  let d = cache.get(id);
  if (!d) { d = voiceData(key, depth); d.id = id; cache.set(id, d); }
  return d;
}
export const isBuilt = (key, depth) => cache.has(`${key}|${depth}`);

export const INSTRUMENT = {
  id: 'vibraphone',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],              // MIDI keys: F3–F6
  space: 'sustain',                     // Space and CC64: the damper pedal, sent to the engine
  modWheel: 'speed',                    // CC1: the motor's speed
  engine: { name: 'VibraphoneEngine', module: new URL('./vibraphone-engine.js', import.meta.url).href },
  // the same physics in C++ (native/instruments/vibraphone), built as WebAssembly: the page runs it
  // when it can, the JavaScript engine otherwise
  wasm: { name: 'VibraphoneWasmEngine', module: new URL('./vibraphone-wasm.js', import.meta.url).href, binary: new URL('../wasm/vibraphone.wasm', import.meta.url).href },
  noteData: (key, vel, P) => dataFor(key, P.depth),
  chain: { volume: 'volume', room: 'room' },
};
