// pyrophone-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (pyrophone-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './pyrophone-params.js';
import { bifurcation, tuning, tubeKey } from './pyrophone-model.js';

export { GROUPS, DEFAULTS, PRESETS };

// The tube's bifurcation analysis and tuning table (harmonic balance, ~50 ms), for the
// tube parameters (tubeKey): kept for the last tube, so other parameters cost nothing
// and send the same table object (the engine unpacks a table only when it is new).
let last = null;
export function tubeTuning(P) {
  const key = tubeKey(P);
  if (!last || last.key !== key) { const bif = bifurcation(P); last = { key, bif, tune: tuning(P, bif) }; }
  return last;
}

export const INSTRUMENT = {
  id: 'pyrophone',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [48, 84],                      // MIDI keys
  space: 'hold',                        // Space and CC64 latch the keys down; the host sends the noteOffs on release
  modWheel: 'flame',                    // CC1: the flame power, from its default up to its maximum
  engine: { name: 'PyrophoneEngine', module: new URL('./pyrophone-engine.js', import.meta.url).href },
  engineParams: (P) => ({ ...P, tune: tubeTuning(P).tune }), // the tuning table rides with the parameters
  chain: { volume: 'volume', room: 'room' },
};
