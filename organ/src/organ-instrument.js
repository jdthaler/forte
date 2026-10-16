// organ-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (organ-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.
//
// Two things differ from the other instruments:
// - The console (drawbars, percussion, vibrato and Leslie switches, motor) is state beside
//   the parameter groups: P carries it, presets set it (CONSOLE_DEFAULTS in organ-params.js),
//   and engineParams fills in whatever a host's P leaves out from DEFAULTS.
// - The tone generator's tables depend on the sample rate; the engine builds them itself from
//   its parameters (tonewheels.js buildGenerator, GEN_PARAMS), so setParams is all it needs.

import { GROUPS, DEFAULTS, PRESETS, CONSOLE_DEFAULTS } from './organ-params.js';
import { KEY_LO, KEY_HI } from './tonewheels.js';

export { GROUPS, DEFAULTS, PRESETS, CONSOLE_DEFAULTS };

export const INSTRUMENT = {
  id: 'organ',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'expression'], // kept when a preset is chosen; the console, motor on, comes from DEFAULTS
  range: [KEY_LO, KEY_HI],                // the 61-key manual, 36–96 (the page folds other keys in by octaves)
  space: null,                            // Space and CC64 switch the Leslie fast/slow (the page), not a pedal
  controllers: { 11: 'expression' },      // MIDI CC11, the expression pedal, across its range
  engine: { name: 'OrganEngine', module: new URL('./organ-engine.js', import.meta.url).href },
  // all of P, the console included (missing values: DEFAULTS)
  engineParams: (P) => ({ ...DEFAULTS, ...P, drawbars: [...(P.drawbars ?? DEFAULTS.drawbars)] }),
  chain: { volume: 'volume', room: 'room', roomSeconds: 1.8 }, // room gain 0.6 × room; the shared limiter
};
