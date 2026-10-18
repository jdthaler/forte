// piano-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './params.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'piano',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'soundboard', 'velocity', 'maxFreq'], // kept when a preset is chosen
  range: [21, 108],      // MIDI keys: A0–C8
  space: 'sustain',      // Space and CC64: the damper pedal, sent to the engine
  controllers: { 67: 'unaCorda' }, // MIDI CC67, the soft pedal: on at 64 and above
  // noteOn's velocity is the hammer's speed in m/s; MIDI velocity / 127 → 0.25 … 6 m/s
  midiVelocity: (v) => 0.25 * 24 ** v,
  // the engine: the physics in C++ (native/instruments/piano), built as WebAssembly. A note may
  // offer it its key's voice data, packed by the model on the page's thread (main.js); without
  // it, the engine builds the key itself
  wasm: { name: 'PianoWasmEngine', module: new URL('./piano-wasm.js', import.meta.url).href, binary: new URL('../wasm/piano.wasm', import.meta.url).href },
  chain: {
    volume: 'volume', room: 'room', venue: 'venue', roomSeconds: 2.2, roomGain: 0.55,
    body: { param: 'soundboard', seconds: 0.4, dry: 0.75, wet: 1.1 }, // the soundboard
    limiter: { threshold: -4, knee: 4, release: 0.2 },
  },
};
