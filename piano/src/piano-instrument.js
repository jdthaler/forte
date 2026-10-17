// piano-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, ALL_PARAMS, DEFAULTS, PRESETS } from './params.js';
import { computeKeyModel, buildVoiceData } from './physics.js';

export { GROUPS, DEFAULTS, PRESETS };

// The strings depend on the 'model' parameters and the sample rate (the highest partial
// stays below Nyquist). Those values are the voice data's version: the engine strikes a
// sounding voice again while it is unchanged, and starts a new voice when it changes.
const MODEL = ALL_PARAMS.filter((p) => p.kind === 'model').map((p) => p.id);
export const modelVersion = (P, fs) => JSON.stringify([fs, ...MODEL.map((id) => P[id])]);

// A key's string model (for the views) and voice data (for the engine), cached per key
// for the latest version asked for (tapered members need an eigen-solve per key).
const cache = new Map(); // key → { version, model, data }
export function keyModel(key, P, fs) {
  const version = modelVersion(P, fs);
  let c = cache.get(key);
  if (!c || c.version !== version) {
    const model = computeKeyModel(key, P, fs);
    c = { version, model, data: buildVoiceData(model, P, version) };
    cache.set(key, c);
  }
  return c;
}

export const INSTRUMENT = {
  id: 'piano',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'soundboard', 'velocity', 'maxFreq'], // kept when a preset is chosen
  range: [21, 108],      // MIDI keys: A0–C8
  space: 'sustain',      // Space and CC64: the damper pedal, sent to the engine
  controllers: { 67: 'unaCorda' }, // MIDI CC67, the soft pedal: on at 64 and above
  // noteOn's velocity is the hammer's speed in m/s; MIDI velocity / 127 → 0.25 … 6 m/s
  midiVelocity: (v) => 0.25 * 24 ** v,
  engine: { name: 'PianoEngine', module: new URL('./engine.js', import.meta.url).href },
  // the same physics in C++ (native/instruments/piano), built as WebAssembly: the page runs it when
  // it can, the JavaScript engine otherwise
  wasm: { name: 'PianoWasmEngine', module: new URL('./piano-wasm.js', import.meta.url).href, binary: new URL('../wasm/piano.wasm', import.meta.url).href },
  engineParams: (P) => ({ gainV: P.gainV, gainH: P.gainH, gainT: P.gainT, damper: P.damper, width: P.width, unaCorda: !!P.unaCorda }),
  noteData: (key, vel, P, fs) => keyModel(key, P, fs).data,
  chain: {
    volume: 'volume', room: 'room', roomSeconds: 2.2, roomGain: 0.55,
    body: { param: 'soundboard', seconds: 0.4, dry: 0.75, wet: 1.1 }, // the soundboard
    limiter: { threshold: -4, knee: 4, release: 0.2 },
  },
};
