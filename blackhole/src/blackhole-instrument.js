// blackhole-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (ringdown-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS, KEY_LO, KEY_HI } from './ringdown-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { EXPRESSION } from '../../shared/expression.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'blackhole',
  groups: [...GROUPS, EXPRESSION], // then the Expression switches: Strike, Glide, Slide, Press, Lift (shared/expression.js)
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'tone', 'stereo', ...TUNING_KEEP], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],                    // MIDI keys: A0–C8, 21–108
  space: null,                                // a ringdown has no damper; nothing to hold
  modWheel: 'spinU',                          // CC1: the spin, from its default up to 1 − 10⁻⁶
  mpe: { bend: 0.3, slide: true },             // MPE: a note's slide is its own hole's spin, at the merger; its bend is the remnant's recoil (a Doppler shift)
  glide: 'the remnant\'s recoil toward us or away: a Doppler shift, up to 30 cents', // what a note's own bend does
  aftertouch: 'matter falling in: a firm press drops clumps in, each ringing it again', // what pressing into a held key does (aftertouch, MPE pressure: a Seaboard's Press)
  lift: 'a fast lift sets off a second, smaller merger: a black hole of half the mass rings down an octave up', // what a slow or a fast release does (release velocity: a Seaboard's Lift)
  midiVelocity: (v) => v ** 1.5,              // MIDI velocity / 127 → the engine's
  keyVelocity: 1,                             // the velocity the computer keys play (no velocity parameter)
  faders: ['massRatio', 'inclination', 'overtones', 'tone', 'spinU'], // a Seaboard RISE's faders 1–3, then its XY pad's X and Y (shared/midi.js)
  // the engine, in C++ (native/instruments/blackhole), built as WebAssembly: it builds each key's
  // voice (its modes, and chirp) from the QNM table and the parameters as the note starts
  wasm: { name: 'BlackholeWasmEngine', module: new URL('./blackhole-wasm.js', import.meta.url).href, binary: new URL('../wasm/blackhole.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue', roomSeconds: 2.2, tone: 'tone' },
};
