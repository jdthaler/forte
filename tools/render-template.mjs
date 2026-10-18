// Render template demos, each isolating one physical effect, to examples/template/*.wav
// Usage: node tools/render-template.mjs        (then node tools/encode-examples.mjs)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../docs/template/src/template-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const TemplateEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'template';
const preset = (i, o = {}) => ({ ...DEFAULTS, ...PRESETS[i].p, ...o });
const play = (P, seconds, events) => { const e = new TemplateEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

const demos = [
  ['01-scale-rosewood', () => play(preset(0), 5, notes(0.1, 0.3, [60, 62, 64, 65, 67, 69, 71, 72], 0.7, 0.25))],
  ['02-soft-then-hard-mallet', () => cat(
    play(preset(0, { mallet: 4 }), 2, notes(0.1, 0.4, [60, 64, 67], 0.8, 0.3)),
    play(preset(0, { mallet: 0.1 }), 2, notes(0.1, 0.4, [60, 64, 67], 0.8, 0.3)))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
