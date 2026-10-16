// gongs-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (gongs-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './gongs-params.js';
import { shell, engineTables, tablesId } from './gongs-model.js';

export { GROUPS, DEFAULTS, PRESETS };

// The coupling tables for P (a few ms to build, then cached by tablesId: Dome rise, Coupling
// terms and Rim). They travel with the parameters, so the audio thread never builds them.
let last = null;
export const couplingTables = (P) => (last?.id === tablesId(P) ? last : (last = engineTables(shell(P.bc, P.rise, P.terms))));

export const INSTRUMENT = {
  id: 'gongs',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'], // kept when a preset is chosen
  range: [36, 84],                      // MIDI keys: C2–C6
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  modWheel: 'strike',                   // CC1: strike point, from its default (near the centre) out to 95 % of the radius
  engine: { name: 'GongEngine', module: new URL('./gongs-engine.js', import.meta.url).href },
  engineParams: (P) => ({ ...P, tables: couplingTables(P) }),
  chain: { volume: 'volume', room: 'room' },
};
