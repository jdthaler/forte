// Render viola organista demos, each isolating one physical effect, to examples/bowed/*.wav
// Usage: node tools/render-bowed.mjs        (then node tools/encode-examples.mjs bowed)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { OrganistaEngine } from '../bowed/src/bowed-engine.js';
import { DEFAULTS } from '../bowed/src/bowed-params.js';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const FS = 48000, SLUG = 'bowed';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (params, seconds, events) => { const e = new OrganistaEngine(FS); e.setParams(params); return renderEngine(e, seconds, events, FS); };
// join A/B parts, fading the end of each (the soundboard is still ringing) over 60 ms
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => {
  const x = Array.from(p[c]), n = Math.round(0.06 * FS);
  for (let i = 0; i < n; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
  return x;
})));
// a parameter that glides from a to b between t0 and t1 (as a run of 'params' events)
const glide = (params, id, a, b, t0, t1, steps = 60, log = true) => Array.from({ length: steps + 1 }, (_, i) => {
  const u = i / steps, v = log ? a * (b / a) ** u : a + (b - a) * u;
  return [t0 + u * (t1 - t0), 'params', { ...params, [id]: v }];
});

// A four-part chorale phrase in G major over a descending bass (G F♯ E D C … D G),
// with a 6/4–7 cadence. Common tones are tied, as an organist would, and the
// voices are a few ms apart with slightly different touches, as a player's
// would be. The treadle swells the wheel speed into the phrase and eases off
// at the cadence, and the player presses in proportion (F/F_max stays put).
function chorale() {
  const S = [71, 69, 67, 66, 64, 67, 72, 71, 69, 67];
  const A = [67, 66, 64, 62, 60, 62, 64, 67, 66, 62];
  const T = [62, 62, 59, 59, 55, 59, 60, 62, 60, 59];
  const B = [43, 42, 40, 38, 36, 47, 48, 50, 50, 43];
  const beat = 0.82, dur = [1, 1, 1, 1, 1, 1, 1, 1, 1, 2.6];
  const t = [0.05]; for (let i = 1; i < dur.length; i++) t.push(t[i - 1] + dur[i - 1] * beat);
  const vel = [0.75, 0.65, 0.65, 0.8], lag = [0.008, 0.02, 0.012, 0];
  const ev = [];
  [S, A, T, B].forEach((voice, v) => {
    for (let i = 0; i < voice.length; i++) {
      if (i > 0 && voice[i] === voice[i - 1]) continue; // tie
      let j = i; while (j + 1 < voice.length && voice[j + 1] === voice[i]) j++;
      ev.push([t[i] + lag[v], 'on', voice[i], vel[v]], [t[j] + dur[j] * beat - 0.06, 'off', voice[i]]);
    }
  });
  const end = t.at(-1) + dur.at(-1) * beat, base = P({ room: 0.35 });
  const treadle = (a, b, t0, t1, n) => Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n, v = a * (b / a) ** u;
    return [t0 + u * (t1 - t0), 'params', { ...base, speed: v, force: v / 0.25 }];
  });
  return play(base, end + 1.2, [...treadle(0.2, 0.3, 0.1, t[6], 40), ...treadle(0.3, 0.22, t[7], end, 30), ...ev]);
}

const demos = [
  ['01-chorale-in-g-the-treadle-swells-the-phrase', chorale],
  // one held note, key pressure raised from far too light to far too heavy
  ['02-force-sweep-surface-sound-then-helmholtz-then-raucous', () => play(P({ force: 0.03 }), 9.5, [[0.05, 'on', 50, 0.7], ...glide(P(), 'force', 0.03, 4, 0.8, 9, 90), [9.2, 'off', 50]])],
  // the same note with the wheel near the bridge, normal, far
  ['03-wheel-at-6-then-12-then-28-percent-sul-ponticello-to-sul-tasto', () => cat(
    play(P({ beta: 0.06, force: 1.6 }), 2.6, [[0.05, 'on', 55, 0.8], [2.2, 'off', 55]]),
    play(P(), 2.6, [[0.05, 'on', 55, 0.8], [2.2, 'off', 55]]),
    play(P({ beta: 0.28, force: 0.6 }), 2.6, [[0.05, 'on', 55, 0.8], [2.2, 'off', 55]]))],
  // a held chord while the treadle speeds up, then an uneven treadle
  ['04-wheel-speed-12-to-50-cm-per-s-then-an-uneven-treadle', () => cat(
    play(P({ speed: 0.12 }), 5, [[0.05, 'on', 48, 0.8], [0.05, 'on', 55, 0.8], [0.05, 'on', 64, 0.8], ...glide(P(), 'speed', 0.12, 0.5, 0.6, 4.4, 60), [4.6, 'off', 48], [4.6, 'off', 55], [4.6, 'off', 64]]),
    play(P({ treadle: 0.18, treadleRate: 0.7 }), 4.2, [[0.05, 'on', 48, 0.8], [0.05, 'on', 55, 0.8], [0.05, 'on', 64, 0.8], [3.8, 'off', 48], [3.8, 'off', 55], [3.8, 'off', 64]]))],
  // attacks: a quick key, a lazy key, and one that slams down far too hard
  ['05-attacks-quick-key-then-lazy-key-then-too-heavy', () => cat(
    play(P({ attack: 4 }), 1.8, [[0.05, 'on', 45, 1], [1.4, 'off', 45]]),
    play(P({ attack: 150 }), 1.8, [[0.05, 'on', 45, 0.25], [1.4, 'off', 45]]),
    play(P({ attack: 4, force: 3 }), 1.8, [[0.05, 'on', 45, 1], [1.4, 'off', 45]]))],
  // the dampers: a released chord stops; with them lifted it rings on, and the other strings join in
  ['06-chord-released-with-dampers-then-dampers-lifted-sympathetic-ring', () => cat(
    play(P(), 3.5, [36, 43, 52, 60].flatMap((k) => [[0.05, 'on', k, 0.8], [1.8, 'off', k]])),
    play(P({ lifted: true }), 5.5, [36, 43, 52, 60].flatMap((k) => [[0.05, 'on', k, 0.8], [1.8, 'off', k]])))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), name.startsWith('01') ? 0.35 : 0.25, FS), FS);
