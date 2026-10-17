// The bridge to the native ports (docs/PLUGINS.md): every descriptor converts to C++ tables,
// the generated files are fresh, and the ported instruments' engines match their references.
// Run: node test/native-tests.mjs        (FORTE_ENGINE=wasm: the WebAssembly engines)

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { INSTRUMENTS } from '../shared/registry.js';
import { generate, portedSlugs } from '../tools/gen-native-params.mjs';
import { loadInstrument } from '../tools/headless.mjs';
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
await test('generated files are fresh (node tools/gen-native-params.mjs --check)', () => {
  execFileSync(process.execPath, [new URL('tools/gen-native-params.mjs', R).pathname, '--check'], { stdio: 'pipe' });
});
await test('the C++ tests\' JavaScript vectors are fresh (node tools/gen-native-vectors.mjs --check)', () => {
  execFileSync(process.execPath, [new URL('tools/gen-native-vectors.mjs', R).pathname, '--check'], { stdio: 'pipe' });
});

const ported = portedSlugs();
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
