// blackhole-instrument.js — the instrument without its page: everything a host needs
// to play it. The page (ringdown-main.js), the Node tools and tests, and the native
// plugins (tools/gen-native-params.mjs) all start here. No DOM, no Web Audio.

import { GROUPS, DEFAULTS, PRESETS } from './ringdown-params.js';
import { QNMBank, keyVoice, KEY_LO, KEY_HI } from './ringdown-model.js';

export { GROUPS, DEFAULTS, PRESETS };

// The QNM table (tools/qnm-table.mjs), loaded once before the first note: fetched in
// the browser, read from disk in Node.
const TABLE = new URL('../data/qnm-table.json', import.meta.url);
let bank = null, loading = null;
export const qnmBank = () => bank;
export function loadBank() {
  return (loading ??= (async () => {
    const table = typeof window === 'undefined'
      ? JSON.parse(await (await import('node:fs/promises')).readFile(TABLE, 'utf8'))
      : await (await fetch(TABLE)).json();
    return (bank = new QNMBank(table));
  })());
}

// A key's voice (keyVoice), cached: it depends only on the key, the 'model' parameters
// and the sample rate, so the cache is kept while those stay the same.
const MODEL = GROUPS.flatMap((g) => g.params).filter((p) => p.kind === 'model').map((p) => p.id);
let cacheKey = '', cache = new Map();
export function voiceFor(key, P, fs) {
  if (!bank) throw new Error('blackhole: the QNM table is not loaded (INSTRUMENT.load())');
  const k = JSON.stringify([fs, ...MODEL.map((id) => P[id])]);
  if (k !== cacheKey) { cacheKey = k; cache = new Map(); }
  let v = cache.get(key);
  if (!v) cache.set(key, (v = keyVoice(key, P, bank, fs)));
  return v;
}

export const INSTRUMENT = {
  id: 'blackhole',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'tone', 'stereo'], // kept when a preset is chosen
  range: [KEY_LO, KEY_HI],                    // MIDI keys: 36–96
  space: null,                                // a ringdown has no damper; nothing to hold
  modWheel: 'spinU',                          // CC1: the spin, from its default up to 1 − 10⁻⁶
  midiVelocity: (v) => v ** 1.5,              // MIDI velocity / 127 → the engine's
  keyVelocity: 1,                             // the velocity the computer keys play (no velocity parameter)
  engine: { name: 'RingdownEngine', module: new URL('./ringdown-engine.js', import.meta.url).href },
  engineParams: (P) => ({ stereo: P.stereo ? 1 : 0, releaseMute: P.releaseMute ? 1 : 0 }),
  noteData: (key, vel, P, fs) => voiceFor(key, P, fs), // the hole's modes (and chirp); velocity scales them in the engine
  chain: { volume: 'volume', room: 'room', roomSeconds: 2.2, tone: 'tone' },
  load: loadBank,
};
