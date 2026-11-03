// Render brass demos, each isolating one physical effect, to examples/brass/*.wav
// Usage: node tools/render-brass.mjs        (then node tools/encode-examples.mjs brass)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS } from '../brass/src/brass-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const BrassEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'brass';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (p, seconds, events) => { const e = new BrassEngine(FS); e.setParams(p); const out = renderEngine(e, seconds, events, FS); e.destroy(); return out; };
// a phrase: [key, beats] at a tempo, each note tongued and held a little short of the next
const phrase = (t0, beat, notes, vel) => {
  const ev = [];
  let t = t0;
  for (const [k, b] of notes) { ev.push([t, 'on', k, vel], [t + b * beat * 0.9, 'off', k]); t += b * beat; }
  return ev;
};
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// (a fanfare on the trombone's partials, then down the slide)
const CALL = [[46, 1], [53, 1], [58, 1], [62, 1], [65, 2], [62, 1], [58, 1], [53, 2], [51, 1], [50, 1], [48, 1], [46, 3]];
const TRUMPET = CALL.map(([k, b]) => [k + 12, b]);

const demos = [
  ['01-trombone-soft-and-loud', () => cat(
    play(P(), 6.4, phrase(0.1, 0.42, CALL, 0.55)),
    play(P(), 6.4, phrase(0.1, 0.42, CALL, 1)))],
  ['02-fortissimo-with-and-without-shocks', () => cat(
    play(P(), 6.4, phrase(0.1, 0.42, CALL, 1)),
    play(P({ shock: 0 }), 6.4, phrase(0.1, 0.42, CALL, 1)))],
  ['03-trumpet-and-flugelhorn', () => cat(
    play(P({ horn: 'trumpet' }), 6.4, phrase(0.1, 0.42, TRUMPET, 0.95)),
    play(P({ horn: 'flugelhorn' }), 6.4, phrase(0.1, 0.42, TRUMPET, 0.95)))],
  ['04-plunger-wah', () => play(P(), 6, [[0.1, 'on', 55, 0.75], ...Array.from({ length: 10 }, (_, i) => [0.5 + 0.5 * i, 'params', P({ plunger: i % 2 ? 0.05 : 0.85 })]), [5.6, 'off', 55]])],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
