// tines-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (rhodes-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, ALL_PARAMS, DEFAULTS, PRESETS } from './rhodes-params.js';
import { computeKey, pickupFor, KEY_LO, KEY_HI } from './tine.js';

export { GROUPS, DEFAULTS, PRESETS };

// A key's modes depend on the 'model' parameters and the sample rate only: that is the
// voice data's version (a sounding key struck again with new data gets a fresh voice).
// The pickups ('pickup') move live in the engine; here they are patched in, not recomputed.
const MODEL = ALL_PARAMS.filter((p) => p.kind === 'model').map((p) => p.id);
export const modelVersion = (P, fs) => `${fs}|${MODEL.map((id) => P[id]).join('|')}`;

// computeKey for key, P and fs, cached (the latest version of each key), its pickup set from P
const cache = new Map();
export function keyModel(key, P, fs) {
  const version = modelVersion(P, fs);
  let c = cache.get(key);
  if (!c || c.version !== version) { c = { version, model: computeKey(key, P, fs) }; cache.set(key, c); }
  const m = c.model, { gap, wid, yoff, gain } = pickupFor(key, P);
  m.info.gap = gap; m.info.wid = wid; m.voice.pickup = { wid, yoff, gain };
  return m;
}

export const INSTRUMENT = {
  id: 'tines',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],              // MIDI keys: 73, E1–E7
  space: 'sustain',                     // Space and CC64: the damper pedal, sent to the engine
  midiVelocity: (v) => 0.25 * 20 ** v,  // MIDI velocity / 127 → hammer speed, 0.25 … 5 m/s
  engine: { name: 'RhodesEngine', module: new URL('./rhodes-engine.js', import.meta.url).href },
  // the same physics in C++ (native/instruments/tines), built as WebAssembly: the page runs it when
  // it can, the JavaScript engine otherwise
  wasm: { name: 'TinesWasmEngine', module: new URL('./tines-wasm.js', import.meta.url).href, binary: new URL('../wasm/tines.wasm', import.meta.url).href },
  engineParams: (P) => ({
    damper: P.damper, cable: P.cable, resQ: P.resQ, tremRate: P.tremRate, tremDepth: P.tremDepth, drive: P.drive, tone: P.tone,
    gap: P.gap, offset: P.offset, poleRadius: P.poleRadius, voicing: P.voicing, // pickups: the engine moves them live
  }),
  noteData: (key, vel, P, fs) => ({ ...keyModel(key, P, fs).voice, version: modelVersion(P, fs) }),
  // 'tone' is the speaker inside the engine, not the chain's low-pass
  chain: { volume: 'volume', room: 'room', roomSeconds: 1.8 },
};
