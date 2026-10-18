// Render Wind Harp demos, each isolating one physical effect, to examples/windharp/*.wav
// Usage: node tools/render-windharp.mjs        (then node tools/encode-examples.mjs windharp)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS } from '../windharp/src/windharp-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const WindHarpEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'windharp';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (p, seconds, events) => { const e = new WindHarpEngine(FS, 11); e.setParams(p); e.Uw = p.wind; return renderEngine(e, seconds, events, FS); };
// the wind as a function of time, sent as parameter changes every 20 ms
const windCurve = (p, seconds, U) => { const ev = []; for (let t = 0; t < seconds; t += 0.02) ev.push([t, 'params', { ...p, wind: U(t) }]); return ev; };
const chord = (t0, t1, keys, vel = 0.7) => keys.flatMap((k) => [[t0, 'on', k, vel], [t1, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

const demos = [
  // a slow tune over sustained chords, the wind breathing a few per cent about the strings' own 4 m/s
  ['01-a-slow-tune-in-a-breathing-wind', () => {
    const p = P({ gust: 0.008, gustTime: 2 }), T = 13;
    const ev = [
      ...chord(0.0, 3.1, [60, 64, 67]), ...chord(3.1, 6.2, [57, 60, 64]), ...chord(6.2, 9.3, [65, 69, 72]), ...chord(9.3, 12.6, [67, 71, 74]),
      ...[[0.4, 76], [1.6, 79], [2.4, 77], [3.4, 76], [4.6, 72], [5.4, 74], [6.6, 77], [7.8, 81], [8.6, 79], [9.6, 79], [10.6, 83], [11.4, 84]]
        .map(([t, k], i, a) => [[t, 'on', k, 0.8], [Math.min(12.6, (a[i + 1]?.[0] ?? 12.6) + 0.15), 'off', k]]).flat(),
      ...windCurve(p, T, (t) => 4.0 + 0.03 * Math.sin((2 * Math.PI * t) / 5.5) - 0.02 * Math.sin((2 * Math.PI * t) / 2.3)),
    ];
    return play(p, T, ev);
  }],
  // one string as the wind rises slowly through its harmonics and falls again: up, it hops 3 → 4 → 5 → 6;
  // down, each harmonic holds on below where it began (hysteresis)
  ['02-one-string-as-the-wind-rises-and-falls', () => {
    const p = P(), T = 12, key = 79, lo = 3.6, hi = 6.9;
    return play(p, T, [[0, 'on', key, 1], [11.5, 'off', key], ...windCurve(p, T, (t) => (t < 5.5 ? lo + ((hi - lo) * t) / 5.5 : t < 6 ? hi : Math.max(lo, hi - ((hi - lo) * (t - 6)) / 5.5)))]);
  }],
  // a string held just past where its 3rd harmonic lets go: gusts throw it in and out of lock
  ['03-gusts-make-a-string-flicker', () => {
    const p = P({ wind: 4.1, gust: 0.05, gustTime: 0.8 });
    return play(p, 10, [[0, 'on', 84, 1], [0, 'on', 79, 1], [9.5, 'off', 84], [9.5, 'off', 79]]);
  }],
  // Kircher: every string tuned to G3, only the gauge differs; the held gauges sound harmonics 2, 3, 4, 5, 6,
  // and as the wind rises each climbs its own series, so the chord of harmonics changes
  ['04-kircher-harp-unison-strings-in-a-rising-wind', () => {
    const p = P({ tuning: 'unison', unison: 55 }), T = 12;
    return play(p, T, [...chord(0, 11.5, [67, 74, 79, 83, 86], 1), ...windCurve(p, T, (t) => (t < 4 ? 4 : t < 10 ? 4 + 1.9 * (t - 4) / 6 : 5.9))]);
  }],
  // the same note on a plain nylon string, then on one wound to six times the mass: the heavy string
  // speaks later and swings less (its mass–damping is six times larger)
  ['05-light-then-heavy-string', () => cat(
    play(P(), 4.5, [...chord(0, 3.5, [72, 76])]),
    play(P({ mass: 6 }), 4.5, [...chord(0, 3.5, [72, 76])]),
  )],
  // a rising arpeggio with slow shutters (velocity 0.1, 210 ms) and then fast ones (velocity 1, 10 ms)
  ['06-slow-then-fast-shutters', () => {
    const arp = (vel) => [72, 76, 79, 84, 88].flatMap((k, i) => [[0.1 + 0.55 * i, 'on', k, vel], [3.3, 'off', k]]);
    return cat(play(P(), 4.2, arp(0.1)), play(P(), 4.2, arp(1)));
  }],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
