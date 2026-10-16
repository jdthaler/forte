// Render every preset playing the same short phrase to examples/piano/*.wav, so the
// variants can be compared by ear without touching the controls.
// Usage: node tools/render-piano.mjs [presetIndex ...]

import { mkdirSync } from 'node:fs';
import { computeKeyModel, buildVoiceData } from '../piano/src/physics.js';
import { PianoEngine } from '../piano/src/engine.js';
import { DEFAULTS, PRESETS } from '../piano/src/params.js';
import { soundboardIR, roomIR } from '../shared/impulses.js';
import { convolve, writeWav, FS_SHIM, webAudioIR } from './audio-util.mjs';

const FS = 48000;
const SECONDS = 8;

// [time s, key, hammer m/s, duration s]
const PHRASE = [
  [0.0, 48, 2.2, 0.3], [0.32, 55, 2.2, 0.3], [0.64, 60, 2.4, 0.3], [0.96, 64, 2.4, 0.3],
  [1.28, 67, 2.6, 0.3], [1.6, 72, 2.8, 0.3], [1.92, 76, 2.8, 0.3], [2.24, 84, 3.0, 0.5],
  [3.0, 36, 3.2, 3.2], [3.0, 48, 2.6, 3.2], [3.0, 55, 2.4, 3.2], [3.0, 64, 2.4, 3.2], [3.0, 72, 2.2, 3.2],
];

function renderDry(P) {
  const eng = new PianoEngine(FS);
  eng.setParams({ gainV: P.gainV, gainH: P.gainH, gainT: P.gainT, damper: P.damper, width: P.width });
  const data = new Map();
  const vd = (key) => {
    if (!data.has(key)) data.set(key, buildVoiceData(computeKeyModel(key, P, FS), P, 1));
    return data.get(key);
  };
  const n = SECONDS * FS, L = new Float32Array(n), R = new Float32Array(n);
  const events = [];
  for (const [t, key, v, d] of PHRASE) {
    events.push({ s: Math.round(t * FS), on: true, key, v });
    events.push({ s: Math.round((t + d) * FS), on: false, key });
  }
  events.sort((a, b) => a.s - b.s || a.on - b.on);
  const bl = 64, bL = new Float32Array(bl), bR = new Float32Array(bl);
  let e = 0;
  for (let s = 0; s < n; s += bl) {
    while (e < events.length && events[e].s <= s) {
      const ev = events[e++];
      if (ev.on) eng.noteOn(ev.key, ev.v, vd(ev.key)); else eng.noteOff(ev.key);
    }
    eng.process(bL, bR, bl);
    L.set(bL.subarray(0, Math.min(bl, n - s)), s);
    R.set(bR.subarray(0, Math.min(bl, n - s)), s);
  }
  return [L, R];
}

const shim = FS_SHIM(FS);
const SBN = webAudioIR(soundboardIR(shim), FS), ROOMN = webAudioIR(roomIR(shim), FS); // as the page's ConvolverNodes scale them

function mix([L, R], P) {
  return [L, R].map((x, ch) => {
    const sb = convolve(x, SBN[ch]);
    const bus = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) bus[i] = (1 - 0.75 * P.soundboard) * x[i] + 1.1 * P.soundboard * sb[i];
    const room = convolve(bus, ROOMN[ch]);
    for (let i = 0; i < x.length; i++) bus[i] = P.volume * (bus[i] + 0.55 * P.room * room[i]);
    return bus;
  });
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
mkdirSync(new URL('../examples/piano/', import.meta.url), { recursive: true });
const which = process.argv.slice(2).map(Number);
let gain = null;
PRESETS.forEach((pr, i) => {
  if (which.length && !which.includes(i)) return;
  const P = { ...DEFAULTS, ...pr.p };
  const t0 = performance.now();
  const out = mix(renderDry(P), P);
  if (gain === null) { // one gain for every file, set by the first preset, so loudness compares honestly
    let pk = 0;
    for (const ch of out) for (const v of ch) pk = Math.max(pk, Math.abs(v));
    gain = 0.6 / pk;
  }
  const file = `examples/piano/${String(i).padStart(2, '0')}-${slug(pr.name)}.wav`;
  writeWav(new URL(`../${file}`, import.meta.url), out, gain, FS);
  console.log(`${file}  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
});
