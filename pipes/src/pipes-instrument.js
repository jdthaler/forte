// pipes-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (pipes-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './pipes-params.js';
import { KEY_LO, KEY_HI } from './pipes-model.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'pipes',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'],    // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],                 // MIDI keys: C–f³, 36–89
  space: 'hold',                           // Space and CC64 latch the keys down; the host sends the noteOffs on release
  modWheel: { param: 'pressure', max: 3000 }, // CC1: wind pressure, from its default up to 3000 Pa
  engine: { name: 'PipeEngine', module: new URL('./pipes-engine.js', import.meta.url).href },
  chain: { volume: 'volume', room: 'room' },
};
