// Render clavichord demos, each isolating one physical effect, to examples/clavichord/*.wav
// Usage: node tools/render-clavichord.mjs        (then node tools/encode-examples.mjs clavichord)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS } from '../clavichord/src/clavichord-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const ClavichordEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'clavichord';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (p, seconds, events) => { const e = new ClavichordEngine(FS); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const note = (t, k, len, vel = 0.6) => [[t, 'on', k, vel], [t + len, 'off', k]];
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => note(t0 + i * dt, k, len, vel));
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const msg = (t, type, value, key = -1) => [t, 'msg', { type, value, key }];

// An air in D minor (written for this demo): crotchet 0.62 s, the long notes sung with the
// finger's own Bebung (a per-note slide, as MPE gives it), a quiet bass under it.
function air() {
  const q = 0.62, ev = [];
  const tune = [[74, 1], [77, 0.5], [76, 0.5], [74, 1], [73, 1], [74, 0.5], [76, 0.5], [77, 1], [76, 2],
    [81, 1], [79, 0.5], [77, 0.5], [76, 1], [74, 0.5], [73, 0.5], [74, 3]];
  let t = 0.15;
  for (const [k, d] of tune) {
    const len = d * q;
    ev.push(...note(t, k, len - 0.04, d >= 2 ? 0.55 : 0.62));
    if (d >= 2) ev.push(msg(t + 0.35, 'slide', 0.55, k), msg(t + len, 'slide', 0, k));
    t += len;
  }
  const bass = [[50, 2], [57, 2], [55, 2], [57, 2], [53, 2], [55, 1], [57, 1], [50, 3]];
  t = 0.15;
  for (const [k, d] of bass) { ev.push(...note(t, k, d * q - 0.05, 0.45)); t += d * q; }
  return play(P(), t + 1.2, ev);
}

const demos = [
  ['01-an-air-with-bebung-on-the-long-notes', air],
  // aftertouch presses the key: the tangent lifts the strings, stretching them sharp, then lets them back
  ['02-pressing-harder-bends-the-note-up', () => {
    const ev = [...note(0.1, 67, 5.6, 0.6)];
    for (let i = 0; i <= 50; i++) { const t = 0.8 + i * 0.08, x = Math.sin((Math.PI * i) / 50); ev.push(msg(t, 'pressure', 0.9 * x, 67)); }
    return play(P(), 6.4, ev);
  }],
  // the Bebung: the same held chord with the wheel at nothing, half and more, then faster
  ['03-bebung-none-then-deeper-then-faster', () => cat(
    play(P(), 2.4, [...note(0.1, 72, 2.1), ...note(0.1, 64, 2.1, 0.5)]),
    play(P({ bebung: 0.3 }), 2.4, [...note(0.1, 72, 2.1), ...note(0.1, 64, 2.1, 0.5)]),
    play(P({ bebung: 0.6, rate: 7.5 }), 2.8, [...note(0.1, 72, 2.5), ...note(0.1, 64, 2.5, 0.5)]))],
  // a fretted pair: a trill on C–C♯ shares the strings (the higher tangent stops the lower), then
  // the same trill unfretted, where the C rings on under it
  ['04-fretted-trill-then-unfretted', () => {
    const trill = (t0) => [...note(t0, 72, 2.2), ...Array.from({ length: 8 }, (_, i) => note(t0 + 0.3 + i * 0.22, 73, 0.12, 0.5)).flat()];
    return cat(play(P({ fretting: 'fretted', detune: 1 }), 3, trill(0.1)), play(P({ detune: 1 }), 3, trill(0.1)));
  }],
  // the listing thinned out: the afterlengths ring at their own pitches beside the note, and each
  // release rings on as the whole string
  ['05-listing-on-then-thinned-out', () => {
    const run = notes(0.1, 0.35, [62, 65, 69, 74, 69, 65], 0.65, 0.3);
    return cat(play(P(), 2.6, run), play(P({ listing: 0.03 }), 3.4, run));
  }],
  // the bass with and without its 4′ strings
  ['06-bass-without-then-with-4-foot-strings', () => {
    const line = notes(0.1, 0.45, [38, 41, 45, 43, 40, 38], 0.65, 0.42);
    return cat(play(P(), 3.2, line), play(P({ octave: true }), 3.4, line));
  }],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.2, FS), FS);
