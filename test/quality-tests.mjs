// Quality checks (forte/engine.h, shared/quality.js): every instrument's engine takes the three
// levels, High is the sound it always had (to the bit), and Medium and Low still play the
// passage: finite, near High's level, and safe to switch while notes sound. Each instrument's own
// suite checks what its trims promise. Run: node test/quality-tests.mjs [slug…]

import assert from 'node:assert/strict';
import { INSTRUMENTS } from '../shared/registry.js';
import { QUALITY_LEVELS } from '../shared/wasm.js';
import { QUALITIES } from '../shared/quality.js';
import { loadInstrument, defaultsOf, Player } from '../tools/headless.mjs';
import { loadEngine } from '../tools/engine.mjs';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const only = process.argv.slice(2);
const FS = 48000;

const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const db = (a, b) => 20 * Math.log10(a / b);
const peakOf = (...xs) => { let m = 0; for (const x of xs) for (const v of x) m = Math.max(m, Math.abs(v)); return m; };

// A passage that piles voices up: twelve notes across the keys that play by default, one every
// 0.1 s at velocity 0.8, under the pedal (or Hold) where there is one, then a second of ringing;
// an instrument whose note sounds only while held (an organ, a bow) holds its last three.
function passage(I) {
  const [lo, hi] = I.compass?.keys ?? I.range ?? [36, 96];
  const ev = [];
  if (I.space) ev.push([0, 'pedal', true]);
  for (let i = 0; i < 12; i++) {
    const k = Math.round(lo + 6 + ((hi - lo - 12) * ((i * 5) % 12)) / 11);
    ev.push([0.1 * i, 'on', k, 0.8]);
    if (i < 9) ev.push([0.1 * i + 0.09, 'off', k]);
  }
  return ev;
}
function play(I, E, quality, events = passage(I), seconds = 2.2) {
  const p = new Player(I, E, FS, defaultsOf(I), quality ? { quality } : {});
  const [L, R] = p.render(seconds, events);
  return { L, R, p };
}

const slugs = [...INSTRUMENTS.filter((i) => i.ready).map((i) => i.id), 'template'].filter((s) => !only.length || only.includes(s));

console.log('the setting');
await test('three levels, High first (the default), the same in the page\'s menu and the C++ (forte/engine.h: high 0, medium 1, low 2)', () => {
  assert.deepEqual(QUALITY_LEVELS, ['high', 'medium', 'low']);
  assert.deepEqual(QUALITIES.map(([id]) => id), QUALITY_LEVELS);
});

for (const slug of slugs) {
  const I = await loadInstrument(slug), E = await loadEngine(I);
  console.log(slug);
  const base = play(I, E, null);
  await test(`${slug}: High is the sound it always had, to the bit`, () => {
    const high = play(I, E, 'high');
    for (let i = 0; i < base.L.length; i++) if (base.L[i] !== high.L[i] || base.R[i] !== high.R[i]) assert.fail(`differs at sample ${i}`);
  });
  await test(`${slug}: Medium and Low play the passage, finite, within 4 dB of High`, () => {
    const ref = rms(base.L) + rms(base.R);
    assert.ok(ref > 1e-4, 'High is silent');
    for (const q of ['medium', 'low']) {
      const { L, R } = play(I, E, q);
      for (let i = 0; i < L.length; i++) if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) assert.fail(`${q}: not finite at sample ${i}`);
      const d = db(rms(L) + rms(R), ref);
      assert.ok(Math.abs(d) < 4, `${q}: ${d.toFixed(2)} dB from High`);
    }
  });
  await test(`${slug}: switched High → Low → Medium → High while the notes sound, it stays finite and bounded`, () => {
    const ev = [...passage(I), [0.35, 'quality', 'low'], [0.75, 'quality', 'medium'], [1.2, 'quality', 'high']];
    const p = new Player(I, E, FS, defaultsOf(I));
    const n = Math.round(2.2 * FS), L = new Float32Array(128), R = new Float32Array(128);
    const timed = ev.map(([t, ...a]) => ({ s: Math.round(t * FS), a })).sort((x, y) => x.s - y.s);
    let j = 0, peak = 0;
    for (let s = 0; s < n; s += 128) {
      while (j < timed.length && timed[j].s <= s) { const a = timed[j++].a; if (a[0] === 'quality') p.engine.setQuality(a[1]); else p.event(a); }
      p.engine.process(L, R, 128);
      for (let i = 0; i < 128; i++) {
        if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) assert.fail(`not finite at ${((s + i) / FS).toFixed(3)} s`);
        peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      }
    }
    const high = peakOf(base.L, base.R);
    assert.ok(peak < 2 * high + 0.05, `peak ${peak.toFixed(3)} vs High's ${high.toFixed(3)}`);
  });
}

console.log(failures ? `\n${failures} FAILED` : '\nall ok');
process.exit(failures ? 1 : 0);
