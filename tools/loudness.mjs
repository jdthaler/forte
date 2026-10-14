// How loud is each instrument at its defaults? One held C4 at the computer keyboard's
// default velocity, through the page's own dry chain (volume, and the piano soundboard /
// Huygens tone and body convolvers, scaled as a ConvolverNode scales them). The figure is
// the loudest momentary (400 ms) K-weighted loudness in the first 2 s, in LUFS (BS.1770).
// The registry's `trim` (dB) evens instruments out; test/level-tests.mjs keeps them even.
//
// Usage: node tools/loudness.mjs        (prints the table and the trims that would hit TARGET)

import { readFileSync } from 'node:fs';
import { convolve, FS_SHIM, webAudioIR } from './audio-util.mjs';
import { soundboardIR } from '../shared/impulses.js';

export const TARGET = -23; // LUFS, momentary max of one mf C4
const FS = 48000, SEC = 2.5, KEY = 60;
const R = new URL('../', import.meta.url);
const mod = (p) => import(new URL(p, R));

function run(engine, start, bl = 128) {
  const n = Math.round(SEC * FS), L = new Float64Array(n), Rr = new Float64Array(n);
  const bL = new Float32Array(bl), bR = new Float32Array(bl);
  start(engine);
  for (let s = 0; s < n; s += bl) {
    engine.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; Rr[s + i] = bR[i]; }
  }
  return [L, Rr];
}
function biquad(x, b, a) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
// BS.1770 K-weighting at 48 kHz: high shelf, then high-pass
const kWeight = (x) => biquad(biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]), [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
function measure([L, Rr]) {
  let pk = 0;
  for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(Rr[i]));
  const kL = kWeight(L), kR = kWeight(Rr), W = Math.round(0.4 * FS), hop = Math.round(0.1 * FS);
  let m = -Infinity;
  for (let s = 0; s + W <= 2 * FS; s += hop) {
    let e = 0;
    for (let i = s; i < s + W; i++) e += kL[i] * kL[i] + kR[i] * kR[i];
    m = Math.max(m, -0.691 + 10 * Math.log10(e / W + 1e-30));
  }
  return { lufs: m, peak: 20 * Math.log10(pk + 1e-30) };
}
const scale = ([L, Rr], g) => [L.map((v) => v * g), Rr.map((v) => v * g)];
const defaults = (m) => Object.fromEntries(m.GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

// The five older pages have their own audio chains (below). Every other ready instrument is
// built on the shell: <id>/src/<id>-engine.js exports one …Engine class, <id>-params.js its
// defaults, and the computer keyboard plays P.velocity.
const OLDER = ['piano', 'tines', 'organ', 'huygens', 'blackhole'];

export async function measureAll() {
  const rows = [];
  const { INSTRUMENTS } = await mod('shared/registry.js');
  for (const { id } of INSTRUMENTS.filter((i) => i.ready && !OLDER.includes(i.id))) {
    const P = defaults(await mod(`${id}/src/${id}-params.js`));
    const engines = Object.values(await mod(`${id}/src/${id}-engine.js`)).filter((v) => typeof v === 'function' && /Engine$/.test(v.name));
    if (engines.length !== 1) throw new Error(`${id}/src/${id}-engine.js should export exactly one …Engine class`);
    const E = engines[0];
    rows.push({ id, ...measure(scale(run(new E(FS), (e) => { e.setParams(P); e.noteOn(KEY, P.velocity ?? 0.75); }), P.volume)) });
  }
  { // piano: dry (1 − 0.75 sb) + soundboard (1.1 sb), then volume
    const { DEFAULTS: P } = await mod('piano/src/params.js');
    const { computeKeyModel, buildVoiceData } = await mod('piano/src/physics.js');
    const { PianoEngine } = await mod('piano/src/engine.js');
    const out = run(new PianoEngine(FS), (e) => { e.setParams({ gainV: P.gainV, gainH: P.gainH, gainT: P.gainT, damper: P.damper, width: P.width }); e.noteOn(KEY, buildVoiceData(computeKeyModel(KEY, P, FS), P, 1), P.velocity); });
    const sb = webAudioIR(soundboardIR(FS_SHIM(FS)), FS);
    rows.push({ id: 'piano', ...measure(out.map((x, c) => { const w = convolve(x, sb[c]); return x.map((v, i) => P.volume * ((1 - 0.75 * P.soundboard) * v + 1.1 * P.soundboard * w[i])); })) });
  }
  { // tines
    const { DEFAULTS: P } = await mod('tines/src/rhodes-params.js');
    const { computeKey } = await mod('tines/src/tine.js');
    const { RhodesEngine } = await mod('tines/src/rhodes-engine.js');
    const ep = { damper: P.damper, cable: P.cable, resQ: P.resQ, tremRate: P.tremRate, tremDepth: P.tremDepth, drive: P.drive, tone: P.tone };
    rows.push({ id: 'tines', ...measure(scale(run(new RhodesEngine(FS), (e) => { e.setParams(ep); e.noteOn(KEY, { ...computeKey(KEY, P, FS).voice, version: 1 }, P.velocity); }), P.volume)) });
  }
  { // organ (no velocity)
    const { DEFAULTS: P } = await mod('organ/src/organ-params.js');
    const { buildGenerator } = await mod('organ/src/tonewheels.js');
    const { OrganEngine } = await mod('organ/src/organ-engine.js');
    rows.push({ id: 'organ', ...measure(scale(run(new OrganEngine(FS), (e) => { e.setParams(P); e.configure(buildGenerator(P, FS)); e.keyDown(KEY); }, 64), P.volume)) });
  }
  { // huygens: tone low-pass → dry (1 − 0.7 body) + body (1.2 body)
    const { DEFAULTS: P } = await mod('huygens/src/sync-params.js');
    const { tunedFreq } = await mod('huygens/src/tuning.js');
    const { NeonEngine } = await mod('huygens/src/neon-engine.js');
    const ep = { kick: P.kick, rSrc: P.rSrc, pitchHold: P.pitchHold ? 1 : 0, drift: P.drift, driftRate: P.driftRate, vNom: P.vNom, vStrike: Math.min(P.vStrike, P.vNom - 5), vExt: Math.min(P.vExt, P.vStrike - 5), attack: P.attack, release: P.release, width: P.width };
    const out = run(new NeonEngine(FS), (e) => { e.setParams(ep); e.noteOn(KEY, { f: tunedFreq(KEY, P) }); });
    const w0 = (2 * Math.PI * P.tone) / FS, Q = 10 ** (0.6 / 20), al = Math.sin(w0) / (2 * Q), c = Math.cos(w0), a0 = 1 + al;
    const lp = (x) => biquad(x, [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0], [1, (-2 * c) / a0, (1 - al) / a0]);
    const body = webAudioIR(soundboardIR(FS_SHIM(FS), 0.3), FS);
    rows.push({ id: 'huygens', ...measure(out.map((x, ch) => { const t = lp(x), b = convolve(t, body[ch]); return t.map((v, i) => P.volume * ((1 - 0.7 * P.body) * v + 1.2 * P.body * b[i])); })) });
  }
  { // black hole: computer keys play velocity 1
    const { DEFAULTS: P } = await mod('blackhole/src/ringdown-params.js');
    const { QNMBank, keyVoice } = await mod('blackhole/src/ringdown-model.js');
    const { RingdownEngine } = await mod('blackhole/src/ringdown-engine.js');
    const bank = new QNMBank(JSON.parse(readFileSync(new URL('blackhole/data/qnm-table.json', R), 'utf8')));
    rows.push({ id: 'blackhole', ...measure(scale(run(new RingdownEngine(FS), (e) => { e.setParams({ stereo: P.stereo ? 1 : 0, releaseMute: 0 }); e.noteOn(keyVoice(KEY, P, bank, FS), 1); }), P.volume)) });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { byId } = await mod('shared/registry.js');
  const rows = await measureAll();
  rows.sort((a, b) => b.lufs - a.lufs);
  console.log('instrument   LUFS (raw)   peak dBFS   trim now   LUFS trimmed   trim for target');
  for (const r of rows) {
    const t = byId(r.id)?.trim ?? 0;
    console.log(`${r.id.padEnd(12)} ${r.lufs.toFixed(1).padStart(8)} ${r.peak.toFixed(1).padStart(11)} ${t.toFixed(1).padStart(10)} ${(r.lufs + t).toFixed(1).padStart(14)} ${(TARGET - r.lufs).toFixed(1).padStart(17)}`);
  }
}
