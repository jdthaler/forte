// gongs-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (gongs-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './gongs-params.js';
import { TUNING_KEEP } from '../../shared/tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'gongs',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity', ...TUNING_KEEP], // kept when a preset is chosen
  range: [21, 108],                     // MIDI keys: A0–C8
  space: 'sustain',                     // Space and CC64: a damper pedal, sent to the engine
  modWheel: 'strike',                   // CC1: strike point, from its default (near the centre) out to 95 % of the radius
  mpe: { slide: true },                 // a note's own slide: where its mallet lands, at the strike (a plate cannot bend)
  // the engine: the physics in C++ (native/instruments/gongs), built as WebAssembly (it builds its
  // own coupling tables)
  wasm: { name: 'GongWasmEngine', module: new URL('./gongs-wasm.js', import.meta.url).href, binary: new URL('../wasm/gongs.wasm', import.meta.url).href },
  chain: { volume: 'volume', room: 'room', venue: 'venue' },
  // The engine against its reference (tools/render-reference.mjs), saved from the JavaScript it was
  // ported from. A crash is chaotic: in the scripts that strike hard enough (velocity 1, the chord,
  // the thin tam-tam, the steel sheet) a difference in the last bit (V8's and the C++'s exp, sin,
  // eigenvectors) grows into another crash within ~50 ms, as nudging the velocities by 1e-12 does.
  // Those are compared within that spread (the JavaScript against itself with velocities ×
  // (1 ± 1e-12…1e-6): levels up to 7.6 dB apart on a 0.1 s frame, the centroid 14 %, the decay
  // 6 dB/s, the strongest partial another mode); every other script to the default tolerance (they
  // agreed to float rounding).
  reference: (script) => (/^(soft then loud|chord)$|Tam-tam|Steel sheet/.test(script.name) ? { level: 8, cents: Infinity, centroid: 0.15, decay: 7 } : {}),
};
