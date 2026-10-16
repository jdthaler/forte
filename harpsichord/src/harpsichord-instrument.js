// harpsichord-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (harpsichord-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './harpsichord-params.js';
import { KEY_LO, KEY_HI } from './harpsichord-model.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'harpsichord',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],              // MIDI keys: FF–f³, 29–89
  space: 'hold',                        // Space and CC64 latch the keys down; the host sends the noteOffs on release
  engine: { name: 'HarpsichordEngine', module: new URL('./harpsichord-engine.js', import.meta.url).href },
  chain: { volume: 'volume', room: 'room' },
};
