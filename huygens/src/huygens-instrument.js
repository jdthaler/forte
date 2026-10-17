// huygens-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (sync-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './sync-params.js';
import { tunedFreq, KEY_LO, KEY_HI } from './tuning.js';

export { GROUPS, DEFAULTS, PRESETS };

export const INSTRUMENT = {
  id: 'huygens',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'tone', 'body'], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],                  // MIDI keys: 36–96
  space: 'hold',                            // Space and CC64 latch the keys
  modWheel: 'kick',                         // CC1: the pulse coupling, from its default up
  engine: { name: 'NeonEngine', module: new URL('./neon-engine.js', import.meta.url).href },
  // the same physics in C++ (native/instruments/huygens), built as WebAssembly: the page runs it
  // when it can, the JavaScript engine otherwise
  wasm: { name: 'HuygensWasmEngine', module: new URL('./huygens-wasm.js', import.meta.url).href, binary: new URL('../wasm/huygens.wasm', import.meta.url).href },
  // the lamp voltages kept in order, 5 V apart: V_ext < V_s < supply
  engineParams: (P) => ({
    kick: P.kick, rSrc: P.rSrc, pitchHold: P.pitchHold ? 1 : 0, drift: P.drift, driftRate: P.driftRate,
    vNom: P.vNom, vStrike: Math.min(P.vStrike, P.vNom - 5), vExt: Math.min(P.vExt, P.vStrike - 5),
    attack: P.attack, release: P.release, width: P.width,
  }),
  // each key's design frequency (tuning, tonic, mistuning); a lamp has no touch, so no velocity
  noteData: (key, vel, P) => ({ f: tunedFreq(key, P) }),
  // tone low-pass → dry + a small resonant body → room; a slightly lower limiter
  chain: {
    volume: 'volume', room: 'room', tone: 'tone',
    body: { param: 'body', seconds: 0.3, dry: 0.7, wet: 1.2 },
    limiter: { threshold: -4, knee: 4 },
  },
};
