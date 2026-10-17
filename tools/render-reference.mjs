// render-reference.mjs — fixed note scripts played through an instrument in Node, as a MIDI host
// would play it (notes and velocities, the pedal, the mod wheel, aftertouch, pitch bend, each
// preset), and summarised: level over time, peak, the strongest partial, the spectral centroid
// and the decay. The JavaScript engine's summary is the reference its C++ port must match
// (docs/PLUGINS.md, steps 1 and 3).
//
// Usage: node tools/render-reference.mjs <slug>             writes native/instruments/<slug>/reference.json
//        node tools/render-reference.mjs <slug> --print     prints the summary instead
//        FORTE_ENGINE=wasm node tools/render-reference.mjs <slug> --compare
//                                                           plays the WebAssembly engine against the file

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Player, loadInstrument, withPreset, defaultsOf } from './headless.mjs';
import { loadEngine, ENGINE } from './engine.mjs';
import { fft } from './audio-util.mjs';

const FS = 48000, R = new URL('../', import.meta.url);
const FRAME = 0.1; // s: the level envelope's frames

// The scripts, from the descriptor: what every port is checked on.
export function scripts(I) {
  const [lo, hi] = I.range || [36, 96];
  const vel = (v) => (I.midiVelocity ? I.midiVelocity(v) : v); // a MIDI host's velocity, as the page maps it
  const fold = (k) => { while (k < lo) k += 12; while (k > hi) k -= 12; return k; };
  const c4 = fold(60), on = (t, k, v) => [t, 'on', fold(k), vel(v)], off = (t, k) => [t, 'off', fold(k)];
  const list = [
    { name: 'note', seconds: 2, events: [on(0, 60, 0.7), off(1, 60)] },
    { name: 'soft then loud', seconds: 2.2, events: [on(0, 60, 0.25), off(0.6, 60), on(0.8, 60, 1), off(1.4, 60)] },
    { name: 'chord', seconds: 2, events: [48, 55, 64, 72].flatMap((k) => [on(0, k, 0.8), off(1.2, k)]) },
    { name: 'lowest and highest', seconds: 2.2, events: [[0, 'on', lo, vel(0.7)], [0.8, 'off', lo], [1, 'on', hi, vel(0.7)], [1.8, 'off', hi]] },
  ];
  if (I.space) list.push({ name: 'pedal', seconds: 2, events: [[0, 'pedal', true], on(0, 60, 0.7), off(0.1, 60), on(0.2, 64, 0.7), off(0.3, 64), on(0.4, 67, 0.7), off(0.5, 67), [1.2, 'pedal', false]] });
  if (I.modWheel) list.push({ name: 'mod wheel', seconds: 2, events: [on(0, 60, 0.7), [0.5, 'wheel', 127], [1.2, 'wheel', 0], off(1.5, 60)] });
  list.push({ name: 'aftertouch', seconds: 1.8, events: [on(0, 60, 0.7), [0.4, 'pressure', 1, c4], [1, 'pressure', 0, c4], off(1.3, 60)] });
  list.push({ name: 'pitch bend', seconds: 1.8, events: [on(0, 60, 0.7), [0.4, 'bend', 1], [1, 'bend', 0], off(1.3, 60)] });
  I.presets.forEach((pr, i) => list.push({ name: `preset: ${pr.name}`, preset: i, seconds: 1.6, events: [on(0, 60, 0.7), off(1, 60)] }));
  return list;
}

export function play(I, Engine, script) {
  const P = script.preset === undefined ? defaultsOf(I) : withPreset(I, script.preset);
  return new Player(I, Engine, FS, P).render(script.seconds, script.events);
}

const db = (x) => Math.round(100 * 20 * Math.log10(Math.max(x, 1e-6))) / 100;
const r3 = (x) => Math.round(1000 * x) / 1000;

export function summarise([L, Rr]) {
  const n = L.length, frame = Math.round(FRAME * FS);
  let pk = 0, e = 0;
  for (let i = 0; i < n; i++) { pk = Math.max(pk, Math.abs(L[i]), Math.abs(Rr[i])); e += L[i] * L[i] + Rr[i] * Rr[i]; }
  const env = [];
  for (let s = 0; s + frame <= n; s += frame) {
    let f = 0;
    for (let i = s; i < s + frame; i++) f += L[i] * L[i] + Rr[i] * Rr[i];
    env.push(db(Math.sqrt(f / (2 * frame))));
  }
  // the spectrum of the first third of a second from the onset: strongest partial and centroid
  let a = 0;
  while (a < n && Math.max(Math.abs(L[a]), Math.abs(Rr[a])) < 0.01 * pk) a++;
  const N = 16384, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N && a + i < n; i++) re[i] = 0.5 * (L[a + i] + Rr[a + i]) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  fft(re, im, false);
  let best = 1, num = 0, den = 0;
  const mag = new Float64Array(N / 2);
  for (let k = 1; k < N / 2; k++) { mag[k] = Math.hypot(re[k], im[k]); if (mag[k] > mag[best]) best = k; num += k * mag[k]; den += mag[k]; }
  let f = best;
  if (best > 1 && best < N / 2 - 1) { // parabolic interpolation on the log magnitude
    const [y0, y1, y2] = [mag[best - 1], mag[best], mag[best + 1]].map((x) => Math.log(x + 1e-30));
    f += (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2 || 1);
  }
  // decay: the level's slope while the first note is held (frames 1 … 8)
  const xs = env.slice(1, 9).map((y, i) => [i + 1, y]).filter(([, y]) => y > -100);
  let slope = 0;
  if (xs.length > 2) {
    const mx = xs.reduce((s, [x]) => s + x, 0) / xs.length, my = xs.reduce((s, [, y]) => s + y, 0) / xs.length;
    slope = xs.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / xs.reduce((s, [x]) => s + (x - mx) ** 2, 0) / FRAME;
  }
  return {
    peak: db(pk), rms: db(Math.sqrt(e / (2 * n))), env,
    partial: r3((f * FS) / N), centroid: Math.round(((num / (den || 1)) * FS) / N), decay: Math.round(100 * slope) / 100,
  };
}

// How far a port may be from the reference. The level is compared only where the reference is
// above −80 dB. Instruments with chaotic or random parts set looser ones in their descriptor
// (reference: { level, cents, centroid }), or a function of the script giving them, for instruments
// chaotic in some scripts only.
export const TOLERANCE = { level: 0.5, cents: 2, centroid: 0.02, decay: 0.5 };
export const toleranceFor = (I, script) => ({ ...TOLERANCE, ...(typeof I.reference === 'function' ? I.reference(script) : I.reference) });

export function compare(ref, got, tol = TOLERANCE) {
  const errs = [];
  if (Math.abs(ref.peak - got.peak) > tol.level && ref.peak > -80) errs.push(`peak ${got.peak} dB, reference ${ref.peak}`);
  ref.env.forEach((y, i) => { if (y > -80 && Math.abs(y - got.env[i]) > tol.level) errs.push(`level at ${(i * FRAME).toFixed(1)} s: ${got.env[i]} dB, reference ${y}`); });
  if (ref.rms > -80) {
    const cents = 1200 * Math.log2(got.partial / ref.partial);
    if (!(Math.abs(cents) <= tol.cents)) errs.push(`strongest partial ${got.partial} Hz, reference ${ref.partial} (${cents.toFixed(1)} ¢)`);
    if (!(Math.abs(got.centroid / ref.centroid - 1) <= tol.centroid)) errs.push(`centroid ${got.centroid} Hz, reference ${ref.centroid}`);
    if (Math.abs(got.decay - ref.decay) > tol.decay) errs.push(`decay ${got.decay} dB/s, reference ${ref.decay}`);
  }
  return errs;
}

export const referenceFile = (slug) => new URL(`native/instruments/${slug}/reference.json`, R);

if (import.meta.url === `file://${process.argv[1]}`) {
  const [slug, ...flags] = process.argv.slice(2);
  if (!slug) { console.error('usage: node tools/render-reference.mjs <slug> [--print | --compare]'); process.exit(1); }
  const I = await loadInstrument(slug), Engine = await loadEngine(I);
  const list = scripts(I), file = referenceFile(slug);
  if (flags.includes('--compare')) {
    const ref = JSON.parse(readFileSync(file, 'utf8'));
    let failed = 0;
    for (const s of list) {
      const r = ref.scripts.find((x) => x.name === s.name);
      if (!r) { console.log(`  FAIL ${s.name}: not in the reference (render it again)`); failed++; continue; }
      const errs = compare(r.summary, summarise(play(I, Engine, s)), toleranceFor(I, s));
      console.log(`  ${errs.length ? 'FAIL' : 'ok  '} ${s.name}${errs.length ? `\n        ${errs.slice(0, 4).join('\n        ')}` : ''}`);
      if (errs.length) failed++;
    }
    console.log(failed ? `\n${failed} FAILED (${ENGINE} engine against the JavaScript reference)` : `\nall match (${ENGINE} engine against the JavaScript reference)`);
    process.exit(failed ? 1 : 0);
  }
  if (ENGINE !== 'js') { console.error('the reference is the JavaScript engine\'s: unset FORTE_ENGINE'); process.exit(1); }
  const out = { slug, engine: 'js', fs: FS, frame: FRAME, scripts: list.map((s) => ({ ...s, summary: summarise(play(I, Engine, s)) })) };
  if (flags.includes('--print')) { for (const s of out.scripts) console.log(s.name.padEnd(36), JSON.stringify({ ...s.summary, env: undefined })); process.exit(0); }
  if (!existsSync(new URL('./', file))) { console.error(`${slug} is not ported (no native/instruments/${slug}/): use --print`); process.exit(1); }
  writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`native/instruments/${slug}/reference.json`);
}
