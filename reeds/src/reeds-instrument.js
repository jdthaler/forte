// reeds-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (reeds-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './reeds-params.js';
import { keyModel, KEY_LO, KEY_HI } from './reeds-model.js';

export { GROUPS, DEFAULTS, PRESETS };

// The parameters that change the reeds themselves; a voice struck again after they
// change is a different reed (the engine fades the old one out), so noteData carries them
// as its version.
export const reedKey = (P) => `${P.solder}|${P.strike}|${P.hardness}`;

// A key's modal model (keyModel, a few ms) at the engine's rate (2× oversampled, as the
// engine builds its own), kept until the reed parameters change.
let models = new Map(), modelsFor = '';
export function reedModel(key, P, fs) {
  const r = reedKey(P);
  if (r !== modelsFor) { models = new Map(); modelsFor = r; }
  let m = models.get(`${key}|${fs}`);
  if (!m) { m = keyModel(key, P, 2 * fs); models.set(`${key}|${fs}`, m); }
  return m;
}

export const INSTRUMENT = {
  id: 'reeds',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],              // MIDI keys: A1–C7, 33–96
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  engine: { name: 'ReedEngine', module: new URL('./reeds-engine.js', import.meta.url).href },
  // each key's modal model is computed off the audio thread and sent with the noteOn
  noteData: (key, vel, P, fs) => ({ ...reedModel(key, P, fs).voice, version: reedKey(P) }),
  chain: { volume: 'volume', room: 'room' },
};
