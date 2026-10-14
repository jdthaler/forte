// Render Huygens-keyboard demos to examples/huygens/*.wav
// Usage: node tools/render-huygens.mjs

import { mkdirSync } from 'node:fs';
import { NeonEngine } from '../huygens/src/neon-engine.js';
import { tunedFreq } from '../huygens/src/tuning.js';
import { DEFAULTS } from '../huygens/src/sync-params.js';
import { soundboardIR, roomIR } from '../shared/impulses.js';
import { convolve, writeWav, FS_SHIM, webAudioIR } from './audio-util.mjs';

const FS = 48000;

// events: [t, 'on'|'off', key] ; ramp: (t) => engine params to apply each block
function render(P, seconds, events, ramp) {
  const e = new NeonEngine(FS);
  e.setParams({ ...P, pitchHold: P.pitchHold ? 1 : 0 });
  const n = Math.round(seconds * FS), L = new Float64Array(n), R = new Float64Array(n);
  const bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, type, key]) => ({ s: Math.round(t * FS), type, key })).sort((a, b) => a.s - b.s);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j].s <= s) { const x = ev[j++]; if (x.type === 'on') e.noteOn(x.key, { f: tunedFreq(x.key, P) }); else e.noteOff(x.key); }
    if (ramp) e.setParams(ramp(s / FS));
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; R[s + i] = bR[i]; }
  }
  return [L, R];
}
const hold = (t0, t1, keys) => keys.flatMap((k) => [[t0, 'on', k], [t1, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

// the app's output chain: low-pass tone → body + dry → room
function lowpass(x, fc) {
  const w = (2 * Math.PI * fc) / FS, cw = Math.cos(w), al = Math.sin(w) / (2 * 0.6), a0 = 1 + al;
  const b0 = (1 - cw) / 2 / a0, b1 = (1 - cw) / a0, a1 = (-2 * cw) / a0, a2 = (1 - al) / a0;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
const sb = soundboardIR(FS_SHIM(FS), 0.3), rm = roomIR(FS_SHIM(FS), 2.0);
const SB = webAudioIR(sb, FS), RM = webAudioIR(rm, FS); // as the page's ConvolverNodes scale them
function finish(out, P = DEFAULTS) {
  return out.map((x, ch) => {
    const t = lowpass(x, P.tone), b = convolve(t, SB[ch]);
    const bus = t.map((v, i) => (1 - 0.7 * P.body) * v + 1.2 * P.body * b[i]);
    const r = convolve(bus, RM[ch]);
    return bus.map((v, i) => v + 0.6 * P.room * r[i]);
  });
}

const D = { ...DEFAULTS };
const demos = [
  ['01-c-major-uncoupled-then-coupled', () => finish(cat(
    render({ ...D, kick: 0 }, 3.5, hold(0.05, 3.2, [48, 60, 64, 67])),
    render({ ...D, kick: 0.045 }, 3.5, hold(0.05, 3.2, [48, 60, 64, 67]))))],
  ['02-coupling-swept-0-to-9pct-under-a-held-seventh-chord', () => finish(
    render(D, 12, hold(0.05, 11.6, [48, 60, 64, 67, 70]), (t) => ({ kick: Math.min(0.09, (0.09 * t) / 10) })))],
  ['03-badly-tuned-keyboard-uncoupled-then-coupled', () => {
    const prog = [[48, 60, 64, 67], [53, 60, 65, 69], [55, 59, 62, 67], [48, 60, 64, 67]];
    const ev = prog.flatMap((ch, i) => hold(0.05 + 1.4 * i, 1.35 + 1.4 * i, ch));
    return finish(cat(render({ ...D, mistune: 25, kick: 0 }, 5.9, ev), render({ ...D, mistune: 25, kick: 0.06 }, 5.9, ev)));
  }],
  ['04-minor-second-merges-into-unison-as-coupling-rises', () => finish(
    render(D, 9, hold(0.05, 8.7, [60, 61]), (t) => ({ kick: Math.min(0.07, (0.07 * t) / 8) })))],
  ['05-drifting-resistors-uncoupled-then-coupled', () => finish(cat(
    render({ ...D, drift: 12, driftRate: 0.4, kick: 0 }, 5, hold(0.05, 4.8, [48, 55, 60, 64, 67])),
    render({ ...D, drift: 12, driftRate: 0.4, kick: 0.05 }, 5, hold(0.05, 4.8, [48, 55, 60, 64, 67]))))],
];

mkdirSync(new URL('../examples/huygens/', import.meta.url), { recursive: true });
for (const [name, fn] of demos) {
  const t0 = performance.now();
  const out = fn();
  let pk = 0;
  for (const ch of out) for (const v of ch) pk = Math.max(pk, Math.abs(v));
  writeWav(new URL(`../examples/huygens/${name}.wav`, import.meta.url), out, 0.6 / pk, FS);
  console.log(`examples/huygens/${name}.wav  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}
