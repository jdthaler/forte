// Render pyrophone demos, each isolating one physical effect, to examples/pyrophone/*.wav
// Usage: node tools/render-pyrophone.mjs        (then node tools/encode-examples.mjs pyrophone)
//
// Name demos NN-what-you-hear; the landing page plays the first one. Each render
// is checked numerically: peak, clicks (sample jumps far above the local slope),
// and the pitch/level facts the demo is meant to show.

import { INSTRUMENT, DEFAULTS } from '../pyrophone/src/pyrophone-instrument.js';
import { wasmModel } from '../pyrophone/src/pyrophone-wasm.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const PyrophoneEngine = await loadEngine(INSTRUMENT);
const { tubeTuning } = await wasmModel();

const FS = 48000, SLUG = 'pyrophone';
const D = { ...DEFAULTS };
// The flame power is in units of the tube's threshold β_H; these demos set a heater gain β itself.
const K = (P, beta) => beta / tubeTuning(P).tune.betaH;
const play = (P, seconds, events) => { const e = new PyrophoneEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const hold = (t0, t1, keys, vel) => keys.flatMap((k) => [[t0, 'on', k, vel], [t1, 'off', k]]);
const ramp = (P, t0, t1, f, dt = 0.01) => { const ev = []; for (let t = t0; t <= t1 + 1e-9; t += dt) ev.push([t, 'params', { ...P, ...f((t - t0) / (t1 - t0)) }]); return ev; };
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const lerp = (a, b, u) => a + (b - a) * u;

// 01: a slow chorale. Common tones are held through the chord changes; every
// new note sighs in at its own growth rate, the bass slowest.
function chorale() {
  const ev = [], V = [0.62, 0.7, 0.66, 0.72];
  const chords = [[48, 55, 64, 72], [53, 57, 65, 72], [55, 59, 65, 74], [48, 60, 64, 72], [53, 60, 65, 69], [55, 59, 62, 67], [48, 55, 64, 72]];
  const T = [0, 1.5, 2.9, 4.2, 5.5, 6.7, 7.9], END = 10.2;
  const on = new Map();
  chords.forEach((ch, i) => {
    for (const k of [...on.keys()]) if (!ch.includes(k)) { ev.push([T[i] + 0.05, 'off', k]); on.delete(k); }
    ch.forEach((k, v) => { if (!on.has(k)) { ev.push([T[i], 'on', k, V[v]]); on.set(k, 1); } });
  });
  for (const k of on.keys()) ev.push([END, 'off', k]);
  return play(D, 11.5, ev);
}

// 02: hysteresis. One tube, flames fully apart; the power is raised slowly past
// the Hopf point and then lowered: it keeps singing well below where it started.
function hysteresis() {
  const P0 = { ...D, noise: 0.008, drift: 0 }, P = { ...P0, flame: K(P0, 0.072) }; // (v = 1: β = K β_H)
  return play(P, 10, [[0, 'on', 60, 1], ...ramp(P, 0, 3.8, (u) => ({ flame: K(P0, lerp(0.072, 0.118, u)) })), ...ramp(P, 4.3, 9.3, (u) => ({ flame: K(P0, lerp(0.118, 0.05, u)) })), [9.5, 'off', 60]]);
}

// 03: the flame (one flame, β = 0.3) moved slowly from near the top of the tube to
// near the bottom, key held. Rayleigh's criterion switches modes on and off: silence,
// the twelfth (mode 3), the octave, the octave with its subharmonic, silence, the
// fundamental, and a brighter locked mixture of modes 1–3 near the bottom.
function flameSweep() {
  const P = { ...D, drift: 0, xf: 0.92, listen: 0.3 }, at = (xf) => ({ xf, flame: K({ ...P, xf }, 0.3) });
  return play({ ...P, ...at(0.92) }, 10.5, [[0, 'on', 60, 1], ...ramp(P, 0.2, 9.9, (u) => at(lerp(0.92, 0.06, u))), [10, 'off', 60]]);
}

// 04: warm-up. A cold tube starts flat and slides up as its gas heats (c ∝ √T);
// released for half a second and replayed, it is still warm and starts nearly in tune.
function warmup() {
  const P = { ...D, drift: 30, warm: 2.2 };
  return play(P, 9, [...hold(0.05, 4.8, [55], 0.8), ...hold(5.3, 8.4, [55], 0.8)]);
}

// 05: staccato, then the same phrase held: short notes barely speak, because
// the oscillation needs time to grow from the flame's noise.
function staccato() {
  const phrase = [60, 62, 64, 67, 64, 60, 55, 60];
  const st = phrase.flatMap((k, i) => hold(0.1 + 0.4 * i, 0.1 + 0.4 * i + 0.16, [k], 0.75));
  const lg = phrase.flatMap((k, i) => hold(0.1 + 0.55 * i, 0.1 + 0.55 * i + 0.62, [k], 0.75));
  return cat(play(D, 3.8, st), play(D, 5.4, lg));
}

// 06: a wide chord, soft then loud. Growth rates scale with frequency, so the
// chord blooms from the top down; further past threshold it blooms faster.
function bloom() {
  const ch = [48, 55, 64, 71, 74, 79];
  return cat(play(D, 5, hold(0.05, 4.2, ch, 0.12)), play(D, 4.5, hold(0.05, 3.7, ch, 0.95)));
}

// 07: tubes that remember. The same arpeggio with the key-up power at 20 % of
// threshold (notes die) and at 93 %, inside the bistable band: every tube that
// has sung keeps singing after its key is released, until the power is lowered.
function memory() {
  const arp = [60, 64, 67, 72, 76];
  const ev = (P) => arp.flatMap((k, i) => hold(0.1 + 0.6 * i, 0.1 + 0.6 * i + 0.45, [k], 0.8));
  const Pm = { ...D, keyup: 0.93 };
  return cat(play(D, 4.2, ev(D)), play(Pm, 7, [...ev(Pm), ...ramp(Pm, 5.4, 6.2, (u) => ({ keyup: lerp(0.93, 0.3, u) }))]));
}

const demos = [
  ['01-chorale', chorale],
  ['02-hysteresis-power-up-then-down', hysteresis],
  ['03-flame-moved-from-top-to-bottom', flameSweep],
  ['04-warm-up-cold-tube-then-warm-tube', warmup],
  ['05-staccato-then-held-slow-onsets', staccato],
  ['06-chord-soft-then-loud-blooms-from-the-top', bloom],
  ['07-tubes-that-remember-key-up-in-the-bistable-band', memory],
];

// Clicks: the largest sample-to-sample jump, relative to the rms slope in the
// surrounding 10 ms. A smooth signal stays below ~4; a click jumps far above.
function check([L, R]) {
  let pk = 0, worst = 0, at = 0;
  const W = 480;
  for (const x of [L, R]) {
    for (const v of x) pk = Math.max(pk, Math.abs(v));
    for (let a = W; a + W < x.length; a += W) {
      let s = 0, m = 0, mi = a;
      for (let i = a - W + 1; i < a + W; i++) { const d = x[i] - x[i - 1]; s += d * d; }
      const rms = Math.sqrt(s / (2 * W));
      for (let i = a; i < a + W; i++) { const d = Math.abs(x[i] - x[i - 1]); if (d > m) { m = d; mi = i; } }
      if (rms > 1e-4 * pk && m / rms > worst) { worst = m / rms; at = mi / FS; }
    }
  }
  return { pk, worst, at };
}

const only = process.argv.slice(2);
const { bif } = tubeTuning(D), f1 = bif.fam[0];
console.log(`defaults: Hopf β = ${f1.hopf.beta.toFixed(4)}, fold β = ${f1.fold.beta.toFixed(4)}`);
for (const [name, fn] of demos) {
  if (only.length && !only.some((o) => name.startsWith(o))) continue;
  const t0 = performance.now();
  const dry = fn(), c = check(dry);
  saveExample(SLUG, name, await withRoom(dry, D.room, FS), FS);
  console.log(`   ${(dry[0].length / FS).toFixed(1)} s, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s; dry peak ${c.pk.toFixed(3)}; worst jump ${c.worst.toFixed(1)}× local slope at ${c.at.toFixed(2)} s`);
}
