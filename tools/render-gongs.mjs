// Render gong demos, each isolating one physical effect, to examples/gongs/*.wav
// Usage: node tools/render-gongs.mjs        (then node tools/encode-examples.mjs gongs)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { GongEngine } from '../gongs/src/gongs-engine.js';
import { DEFAULTS, PRESETS } from '../gongs/src/gongs-params.js';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const FS = 48000, SLUG = 'gongs';
const preset = (name, o = {}) => ({ ...DEFAULTS, ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (p, seconds, events) => { const e = new GongEngine(FS); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const hit = (t, key, vel, len = 30) => [[t, 'on', key, vel], [t + len, 'off', key]];
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

const demos = [
  // A slow pentatonic phrase on bronze gongs, softly struck and left to ring, over two low gongs.
  ['01-slow-gong-melody', () => play(P({ strike: 0.14, release: 6 }), 10, [
    ...hit(0.05, 50, 0.42), ...hit(0.1, 69, 0.34), ...hit(1.4, 74, 0.3), ...hit(2.6, 72, 0.28), ...hit(3.5, 69, 0.3),
    ...hit(4.9, 67, 0.34), ...hit(5.0, 55, 0.4), ...hit(6.4, 69, 0.26), ...hit(7.3, 74, 0.38), ...hit(7.35, 62, 0.45),
  ])],
  // One gong, A3, struck pp, mf and fff: bell → shimmer → crash.
  ['02-pp-mf-fff-bell-to-crash', () => play(P({ strike: 0.2, release: 1.2 }), 10, [
    ...hit(0.05, 57, 0.28, 2.9), ...hit(3.05, 57, 0.6, 2.9), ...hit(6.05, 57, 1, 3.6)])],
  // The same opera-gong strike on a flat plate (it stiffens: the pitch slides down) and on a 2.5 h dome (it softens: the pitch slides up).
  ['03-flat-glides-down-dome-glides-up', () => cat(
    play(preset('Opera gong, pitch bends down'), 3.6, hit(0.05, 64, 0.65)),
    play(preset('Opera gong, pitch bends down'), 0.4, []),
    play(preset('Opera gong, pitch bends up'), 3.6, hit(0.05, 64, 0.65)))],
  // The same strike (4.4 m/s) on a thick gong (h/a = 2 %: it stays a bell) and a thin one (0.4 %: it crashes).
  ['04-thick-stays-a-bell-thin-crashes', () => cat(
    play(P({ thick: 0.02, strike: 0.25, release: 1 }), 4, hit(0.05, 52, 0.7, 3)),
    play(P({ thick: 0.004, strike: 0.25, release: 1 }), 4.5, hit(0.05, 52, 0.7, 3.5)))],
  // Struck dead centre (only the axisymmetric modes: one clear tone), then near the rim (the asymmetric modes, the lower (2,0) among them).
  ['05-centre-then-rim-strike', () => cat(
    play(P({ strike: 0, release: 1 }), 3.5, hit(0.05, 57, 0.4, 2.8)),
    play(P({ strike: 0.75, release: 1 }), 3.5, hit(0.05, 57, 0.4, 2.8)))],
  // A tam-tam rolled with a soft beater, swelling from a hum into a crash, then left to ring.
  ['06-tam-tam-roll-swells-to-crash', () => {
    const ev = [];
    for (let i = 0, t = 0.05; t < 4.2; i++, t += 0.115) ev.push([t, 'on', [53, 55, 56][i % 3], 0.12 + 0.88 * (t / 4.2) ** 2]);
    ev.push([4.3, 'on', 55, 1], [4.33, 'on', 53, 0.9]);
    return play(preset('Tam-tam', { release: 8 }), 9.5, ev);
  }],
  // A free bronze gong, then the same plate with its rim clamped (free to slide in its plane): other mode ratios, and a stiffer, (2,0)-less spectrum.
  ['07-hanging-then-clamped', () => cat(
    play(P({ strike: 0.3, release: 1 }), 3.5, hit(0.05, 55, 0.6, 2.8)),
    play(P({ bc: 'clamped', strike: 0.3, release: 1 }), 3.5, hit(0.05, 55, 0.6, 2.8)))],
];

for (const [name, fn] of demos) {
  const t = performance.now(), out = fn();
  saveExample(SLUG, name, await withRoom(out, 0.25, FS), FS);
  console.log(`   ${(out[0].length / FS).toFixed(1)} s audio in ${((performance.now() - t) / 1000).toFixed(1)} s`);
}
