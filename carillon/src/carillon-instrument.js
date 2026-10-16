// carillon-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (carillon-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './carillon-params.js';
import { KEY_LO, KEY_HI } from './carillon-model.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'carillon',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],              // MIDI keys: C3–C7, 48–96
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  engine: { name: 'CarillonEngine', module: new URL('./carillon-engine.js', import.meta.url).href },
  chain: { volume: 'volume', room: 'room' },
};
