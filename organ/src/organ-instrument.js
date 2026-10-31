// organ-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (organ-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.
//
// Two things differ from the other instruments:
// - The console (drawbars, percussion, vibrato and Leslie switches, motor) is state beside
//   the parameter groups: P carries it, presets set it (CONSOLE_DEFAULTS in organ-params.js),
//   and the engine keeps its defaults for whatever a host's P leaves out. `console` makes it
//   plugin parameters (CONSOLE in organ-params.js), after the groups'.
// - The tone generator's tables depend on the sample rate; the engine builds them itself from
//   its parameters (organ-model.h, buildGenerator), so setParams is all it needs.

import { GROUPS, DEFAULTS, PRESETS, CONSOLE_DEFAULTS, CONSOLE } from './organ-params.js';
import { KEY_MIN, KEY_MAX } from './tonewheels.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS, CONSOLE_DEFAULTS, CONSOLE };

export const INSTRUMENT = {
  id: 'organ',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'expression', ...TUNING_KEEP], // kept when a preset is chosen; the console, motor on, comes from DEFAULTS
  range: [KEY_MIN, KEY_MAX],              // A0–C8: past the 61-key manual (36–96) the wheels fold back an octave where a drawbar runs out
  space: null,                            // Space and CC64 switch the Leslie fast/slow (the page), not a pedal
  controllers: {
    1: { param: 'leslie', values: ['slow', 'fast'] },  // the mod wheel: Leslie fast from halfway up
    11: 'expression',                                  // MIDI CC11, the expression pedal, across its range
    64: { param: 'leslie', toggle: ['slow', 'fast'] }, // each press of a sustain pedal flips the Leslie
  },
  console: CONSOLE,                       // the drawbars and switches as plugin parameters
  faders: ['drawbar1', 'drawbar3', 'drawbar4', 'drive', 'expression'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine: the physics in C++ (native/instruments/organ), built as WebAssembly; it takes all
  // of P, the console included
  wasm: { name: 'OrganWasmEngine', module: new URL('./organ-wasm.js', import.meta.url).href, binary: new URL('../wasm/organ.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue', roomSeconds: 1.8 }, // room gain 0.6 × room; the shared limiter
};
