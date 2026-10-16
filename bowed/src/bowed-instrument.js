// bowed-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (bowed-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './bowed-params.js';
import { RANGE } from './bowed-model.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'bowed',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: RANGE,                         // MIDI keys: C2–C6, 36–84
  space: 'hold',                        // Space and CC64 latch the keys down; the host sends the noteOffs on release
  modWheel: 'speed',                    // CC1: the treadle, the instrument's swell (Helmholtz amplitude ∝ v_B)
  engine: { name: 'OrganistaEngine', module: new URL('./bowed-engine.js', import.meta.url).href },
  chain: { volume: 'volume', room: 'room' },
};
