// The bridge to the native ports (docs/PLUGINS.md): every descriptor converts to C++ tables,
// the generated files are fresh, and the ported instruments' engines match their references.
// Run: node test/native-tests.mjs        (FORTE_ENGINE=wasm: the WebAssembly engines)

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { INSTRUMENTS } from '../shared/registry.js';
import { generate, portedSlugs, inferFormat, formatBy } from '../tools/gen-native-params.mjs';
import { GROUPS as BLACKHOLE_GROUPS } from '../blackhole/src/ringdown-params.js';
import { loadInstrument } from '../tools/headless.mjs';
import { Limiter } from '../shared/limiter.js';
import { LIMITER } from '../shared/chain.js';
import { loadEngine, ENGINE } from '../tools/engine.mjs';
import { scripts, play, summarise, compare, referenceFile, toleranceFor } from '../tools/render-reference.mjs';

let failures = 0;
async function test(name, fn) {
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const R = new URL('../', import.meta.url);
const slugs = ['template', ...INSTRUMENTS.filter((i) => i.ready).map((i) => i.id)];

console.log('parameter tables (tools/gen-native-params.mjs)');
await test('every instrument converts: parameters, presets, keys, pedal, wheel and chain', async () => {
  for (const slug of slugs) {
    const { header, report } = await generate(slug);
    assert.ok(header.includes(`namespace forte::`) && header.includes('inline InstrumentInfo info('), slug);
    const plain = report.filter((r) => r.plain).length;
    assert.ok(plain <= 3, `${slug}: ${plain} parameters show as plain numbers`);
  }
});
await test('the plugins\' text matches the pages\' for most of every parameter\'s travel', async () => {
  for (const slug of slugs) for (const r of (await generate(slug)).report) if (!r.plain) assert.ok(r.match >= 0.95, `${slug}.${r.id}: ${(100 * r.match).toFixed(1)} %`);
});
await test("the black hole's spin reads as the page writes it at every step: a = 0.690, a = 0.9900, a = 1 − 1.0×10⁻⁴", () => {
  const p = BLACKHOLE_GROUPS.flatMap((g) => g.params).find((q) => q.id === 'spinU'), { segs, plain } = inferFormat(p);
  assert.ok(!plain);
  for (let k = 0; k * p.step <= p.max + 1e-9; k++) { const u = Math.min(p.max, k * p.step); assert.equal(formatBy(segs, u), p.fmt(u), `u = ${u}`); }
});
await test('generated files are fresh (node tools/gen-native-params.mjs --check)', () => {
  execFileSync(process.execPath, [new URL('tools/gen-native-params.mjs', R).pathname, '--check'], { stdio: 'pipe' });
});
await test('the C++ tests\' JavaScript vectors are fresh (node tools/gen-native-vectors.mjs --check)', () => {
  execFileSync(process.execPath, [new URL('tools/gen-native-vectors.mjs', R).pathname, '--check'], { stdio: 'pipe' });
});

const ported = portedSlugs();
console.log('the limiter (shared/limiter.js, as native/core/src/limiter.cpp)');
await test("Web Audio's curve and makeup gain; below the threshold, a constant gain; no delay", () => {
  const l = new Limiter(LIMITER, 48000);
  assert.ok(Math.abs(l.curve(0.5) - 0.5) < 1e-15);                // below the threshold: unchanged
  const db = (x) => 20 * Math.log10(x);                          // above the knee: 12 dB in, 1 dB out
  assert.ok(Math.abs(db(l.curve(4) / l.curve(2)) - db(2) / 12) < 1e-9);
  assert.ok(l.makeup > 1.1 && l.makeup < 1.3, `makeup ${l.makeup}`); // as the C++ test
  const L = new Float32Array(4800), R = new Float32Array(4800);
  for (let i = 0; i < 4800; i++) L[i] = R[i] = 0.3 * Math.sin(i * 0.05);
  l.process(L, R, 4800);
  assert.ok(Math.abs(L[4000] / (0.3 * Math.sin(4000 * 0.05)) - l.makeup) < 1e-6);
  assert.ok(Math.abs(L[1] / (0.3 * Math.sin(0.05)) - l.makeup) < 1e-6, 'the first samples come out at once');
  const a = new Float32Array(1), b = new Float32Array(1);
  for (let i = 0; i < 6000; i++) { a[0] = b[0] = 3; l.process(a, b, 1); if (i > 2000) assert.ok(a[0] < 1.05 * l.makeup); } // a loud input settles
});
await test("the worklet's 'forte-limiter' processor limits both channels, and upmixes mono", async () => {
  const procs = {};
  globalThis.sampleRate = 48000;
  globalThis.AudioWorkletProcessor ??= class { constructor() { this.port = { postMessage() {} }; } };
  const reg = globalThis.registerProcessor;
  globalThis.registerProcessor = (name, cls) => { procs[name] = cls; };
  try { await import('../shared/worklet.js?limiter'); } finally { globalThis.registerProcessor = reg; }
  const p = new procs['forte-limiter']({ processorOptions: LIMITER });
  const out = [new Float32Array(128), new Float32Array(128)];
  p.process([[new Float32Array(128).fill(0.1)]], [out]);
  const m = new Limiter(LIMITER, 48000).makeup;
  assert.ok(Math.abs(out[0][0] - 0.1 * m) < 1e-6 && Math.abs(out[1][127] - 0.1 * m) < 1e-6);
  p.process([[]], [out]);
  assert.equal(out[0][5], 0);
});

console.log(`ported instruments: ${ported.length ? ported.join(', ') : 'none yet'} (${ENGINE} engine)`);
for (const slug of ported) {
  await test(`${slug}: its WebAssembly build is committed, loads, and has the descriptor's parameters`, async () => {
    const I = await loadInstrument(slug);
    assert.ok(I.wasm, `${slug}: the descriptor has no wasm`);
    assert.ok(existsSync(new URL(I.wasm.binary)), I.wasm.binary);
    const W = await loadEngine(I, 'wasm');
    assert.equal(W.name, I.wasm.name);
    const e = new W(48000), L = new Float32Array(128), R = new Float32Array(128);
    e.setParams(Object.fromEntries(I.groups.flatMap((g) => g.params).map((p) => [p.id, p.def])));
    e.noteOn(Math.round((I.range[0] + I.range[1]) / 2), 0.7);
    let pk = 0;
    for (let b = 0; b < 40; b++) { e.process(L, R, 128); for (const v of L) pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk > 1e-4 && Number.isFinite(pk), `peak ${pk}`);
  });
  await test(`${slug}: plays as its JavaScript reference (tools/render-reference.mjs)`, async () => {
    assert.ok(existsSync(referenceFile(slug)), `no native/instruments/${slug}/reference.json`);
    const ref = JSON.parse(readFileSync(referenceFile(slug), 'utf8'));
    const I = await loadInstrument(slug), Engine = await loadEngine(I);
    for (const s of scripts(I)) {
      const r = ref.scripts.find((x) => x.name === s.name);
      assert.ok(r, `${s.name}: not in the reference`);
      const errs = compare(r.summary, summarise(play(I, Engine, s)), toleranceFor(I, s));
      assert.deepEqual(errs, [], `${s.name}: ${errs.join('; ')}`);
    }
  });
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
