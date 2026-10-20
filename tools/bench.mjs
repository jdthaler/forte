// bench.mjs — what each instrument's engine costs while it plays, at each Quality
// (shared/quality.js), block by block as the AudioWorklet runs it: a pedalled passage of 24 notes
// across the keyboard, one every 1/8 s, then two seconds of ringing. Prints the mean load (time
// over real time), the worst 1 % of 128-sample blocks against their budget (2.67 ms at 48 kHz),
// and the most voices sounding. A note's own setup (the page builds much of it, as noteData) is
// left out.
//
//   node tools/bench.mjs [slug …] [--quality high,medium,low] [--fs 48000]

import { loadInstrument, Player, defaultsOf } from './headless.mjs';
import { loadEngine } from './engine.mjs';
import { INSTRUMENTS } from '../shared/registry.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args.splice(i, 2)[1]; };
const FS = +opt('--fs', 48000), N = 128, LEVELS = opt('--quality', 'high,medium,low').split(',');
const slugs = args.length ? args : INSTRUMENTS.filter((i) => i.ready).map((i) => i.id);

export function bench(I, Engine, quality = 'high', P = defaultsOf(I)) {
  const p = new Player(I, Engine, FS, P, { quality });
  const [lo, hi] = I.compass?.keys ?? I.range ?? [36, 96];
  const keys = Array.from({ length: 24 }, (_, i) => Math.round(lo + ((hi - lo) * ((i * 7) % 24)) / 23));
  if (I.space) p.pedal(true);
  const L = new Float32Array(N), R = new Float32Array(N), times = [];
  const step = Math.round(FS / 8 / N), total = Math.round(((keys.length / 8 + 2) * FS) / N);
  let voices = 0;
  for (let b = 0; b < total; b++) {
    if (b % step === 0 && b / step < keys.length) {
      p.noteOn(keys[b / step], 0.8);
      if (b / step >= 1) p.noteOff(keys[b / step - 1]);
    }
    const t0 = performance.now();
    p.engine.process(L, R, N);
    times.push(performance.now() - t0);
    voices = Math.max(voices, p.engine.voiceCount?.() ?? 0);
  }
  const budget = (1000 * N) / FS, sorted = times.slice().sort((a, b) => a - b);
  return { mean: times.reduce((a, b) => a + b, 0) / (times.length * budget), p99: sorted[Math.floor(0.99 * sorted.length)] / budget, voices };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pct = (x) => `${(100 * x).toFixed(1).padStart(6)} %`;
  console.log('instrument'.padEnd(14), LEVELS.map((q) => `${q.padStart(8)} mean      p99 voices`).join('   '));
  for (const slug of slugs) {
    const I = await loadInstrument(slug), E = await loadEngine(I);
    bench(I, E); // warm up
    const row = LEVELS.map((q) => { const r = bench(I, E, q); return `${pct(r.mean)} ${pct(r.p99)} ${String(r.voices).padStart(6)}`; });
    console.log(slug.padEnd(14), row.join('   '));
  }
}
