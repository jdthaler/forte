// springs-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (springs-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './springs-params.js';
import { KEY_LO, KEY_HI, keySprings, geometryId } from './springs-model.js';

export { GROUPS, DEFAULTS, PRESETS };

// A key's springs and their modes, sent with each note: a few hundred 6 × 6 eigenproblems for a
// bass key, too slow for the audio thread. Kept (by everything they depend on), so the page can
// build them ahead, working through the keyboard in spare moments after a change.
const built = new Map();
export function springsFor(key, P, fs) {
  const id = `${geometryId(P)}|${key}|${fs}`;
  let c = built.get(id);
  if (!c) {
    c = keySprings(key, P, fs);
    if (built.size > 300) built.delete(built.keys().next().value);
    built.set(id, c);
  }
  return c;
}

export const INSTRUMENT = {
  id: 'springs',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],              // MIDI keys: C2–C6
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  modWheel: 'hand',                     // CC1: a hand on the springs
  engine: { name: 'SpringEngine', module: new URL('./springs-engine.js', import.meta.url).href },
  noteData: (key, vel, P, fs) => springsFor(key, P, fs),
  chain: { volume: 'volume', room: 'room' },
};
