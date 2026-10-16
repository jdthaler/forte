// stars-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (stars-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './stars-params.js';
import { KEY_LO, KEY_HI, keyStar, starId } from './stars-model.js';

export { GROUPS, DEFAULTS, PRESETS };

// A key's star, sent with each note (a red giant's mixed modes take a few ms). Kept (by
// everything they depend on), so the page can build them ahead in spare moments.
const built = new Map();
export function starFor(key, P) {
  const id = `${starId(P)}|${key}`;
  let c = built.get(id);
  if (!c) {
    c = keyStar(key, P);
    if (built.size > 400) built.delete(built.keys().next().value);
    built.set(id, c);
  }
  return c;
}
export const isBuilt = (key, P) => built.get(`${starId(P)}|${key}`);

export const INSTRUMENT = {
  id: 'stars',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],              // MIDI keys: C2–C7
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  modWheel: 'spin',                     // CC1: the star's rotation
  engine: { name: 'StarEngine', module: new URL('./stars-engine.js', import.meta.url).href },
  noteData: (key, vel, P) => { const d = starFor(key, P); return { id: d.id, key: d.key, K: d.K, family: d.family, N: d.N, modes: d.modes }; }, // what the engine needs
  chain: { volume: 'volume', room: 'room' },
};
