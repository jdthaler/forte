// arc-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (arc-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './arc-params.js';
import { KEY_LO, KEY_HI, keyCaps, tuneKey } from './arc-model.js';

export { GROUPS, DEFAULTS, PRESETS };

// The capacitor bank the engine plays from (P.table): each key's capacitor, cut for its
// sounding note (arc-model.js keyCaps) or by Kelvin's formula. The talking arc plays none
// (its transformer replaces the coil), so the bank is always cut for the arcs' circuit
// (bankParams) and depends only on the parameters tuneKey names: cached on that.
export const bankParams = (P) => (P.mode === 'talk' ? { ...P, mode: 'mono' } : P);
let bank = null;
export function capBank(P) {
  const key = tuneKey(P);
  if (bank?.key !== key) bank = keyCaps(bankParams(P));
  return bank;
}

export const INSTRUMENT = {
  id: 'arc',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'dist'],  // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],           // MIDI keys: C3–C6, 48–84
  space: 'hold',                     // Space and CC64 latch the keys down; the host sends the noteOffs on release
  modWheel: 'current',               // CC1: the arc current, from its default up to its maximum
  engine: { name: 'ArcEngine', module: new URL('./arc-engine.js', import.meta.url).href },
  // the same physics in C++ (native/instruments/arc), built as WebAssembly: the page runs it when it
  // can, the JavaScript engine otherwise. It cuts its own bank (each key's on its first note), or
  // plays the one the page offers with a note (arc-wasm.js)
  wasm: { name: 'ArcWasmEngine', module: new URL('./arc-wasm.js', import.meta.url).href, binary: new URL('../wasm/arc.wasm', import.meta.url).href },
  engineParams: (P) => ({ ...P, table: capBank(P) }), // ~0.3 s to cut a bank: the page cuts it a few keys at a time
  chain: { volume: 'volume', room: 'room' },
};
