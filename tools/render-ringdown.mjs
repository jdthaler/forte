// Render black-hole keyboard demos to examples/ringdown/*.wav
// Usage: node tools/render-ringdown.mjs

import { mkdirSync, readFileSync } from 'node:fs';
import { QNMBank, keyVoice, uFromSpin } from '../ringdown/src/ringdown-model.js';
import { RingdownEngine } from '../ringdown/src/ringdown-engine.js';
import { DEFAULTS } from '../ringdown/src/ringdown-params.js';
import { roomIR } from '../src/impulses.js';
import { convolve, writeWav, FS_SHIM } from './audio-util.mjs';

const FS = 48000;
const bank = new QNMBank(JSON.parse(readFileSync(new URL('../ringdown/data/qnm-table.json', import.meta.url))));

// events: [t, key, vel, params?]
function render(P0, seconds, events) {
  const e = new RingdownEngine(FS);
  e.setParams({ stereo: 1 });
  const n = Math.round(seconds * FS), L = new Float64Array(n), R = new Float64Array(n);
  const bl = 64, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, key, vel, p]) => ({ s: Math.round(t * FS), key, vel, P: { ...P0, ...(p || {}) } })).sort((a, b) => a.s - b.s);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j].s <= s) { const x = ev[j++]; e.noteOn(keyVoice(x.key, x.P, bank, FS), x.vel); }
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; R[s + i] = bR[i]; }
  }
  return [L, R];
}
const room = roomIR(FS_SHIM(FS), 2.2);
const unit = (d) => { let e = 0; for (const v of d) e += v * v; return d.map((v) => v / Math.sqrt(e)); };
const RM = [unit(room.getChannelData(0)), unit(room.getChannelData(1))];
const finish = (out, amt = 0.25) => out.map((x, ch) => { const r = convolve(x, RM[ch]); return x.map((v, i) => v + 0.6 * amt * r[i]); });
const D = { ...DEFAULTS };
const phrase = (t0, vel = 0.9) => [[0, 57], [0.35, 60], [0.7, 64], [1.05, 69], [1.4, 72], [1.75, 76], [2.1, 69], [2.45, 64], [2.8, 45]].map(([t, k]) => [t0 + t, k, vel]);

const demos = [
  ['01-one-note-as-spin-rises-from-0-to-1-minus-1e-6', () => {
    const spins = [0, 0.69, 0.9, 0.99, 0.999, 0.9999, 0.99999, 0.999999];
    const gaps = [0.6, 0.6, 0.6, 0.7, 0.9, 1.2, 1.8, 3.0];
    let t = 0.05; const ev = [];
    spins.forEach((a, i) => { ev.push([t, 57, 1, { spinU: uFromSpin(a), massRatio: 1, t0: 10, overtones: 0.4 }]); t += gaps[i]; });
    return finish(render(D, t + 0.5, ev));
  }],
  ['02-phrase-gw150914-like-remnant', () => finish(render(D, 4.2, phrase(0.05)))],
  ['03-same-phrase-near-extremal-harmonic-bells', () => finish(render({ ...D, spinU: 5, t0: 10, overtones: 0.4 }, 6.5, phrase(0.05)))],
  ['04-equal-masses-then-lopsided-q8', () => {
    const P = { ...D, spinU: 2, inclination: 60 };
    const notes = [[0, 48], [0.6, 55], [1.2, 60], [1.8, 64]];
    return finish(render(P, 5.2, [...notes.map(([t, k]) => [0.05 + t, k, 1, { massRatio: 1 }]), ...notes.map(([t, k]) => [2.65 + t, k, 1, { massRatio: 8 }])]));
  }],
  ['05-face-on-then-edge-on-listen-in-stereo', () => {
    const P = { ...D, spinU: 3 };
    const notes = [[0, 52], [0.5, 59], [1.0, 64]];
    return finish(render(P, 4.2, [...notes.map(([t, k]) => [0.05 + t, k, 1, { inclination: 0 }]), ...notes.map(([t, k]) => [2.1 + t, k, 1, { inclination: 90 }])]));
  }],
  ['06-inspiral-merger-ringdown-chirps', () => finish(render({ ...D, inspiral: true, inspiralOct: 3, spinU: 1.5 }, 5, [[0.05, 45, 1], [1.4, 52, 1], [2.4, 57, 1], [3.2, 64, 1], [3.8, 69, 1]]))],
];

mkdirSync(new URL('../examples/ringdown/', import.meta.url), { recursive: true });
for (const [name, fn] of demos) {
  const t0 = performance.now();
  const out = fn();
  let pk = 0;
  for (const ch of out) for (const v of ch) pk = Math.max(pk, Math.abs(v));
  writeWav(new URL(`../examples/ringdown/${name}.wav`, import.meta.url), out, 0.6 / pk, FS);
  console.log(`examples/ringdown/${name}.wav  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}
