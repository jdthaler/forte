// The AudioWorklet processor every page plays through (shared/worklet.js): a preset's change
// (a 'params' message with swap) fades the output out, gives the engine the preset and fades it
// back in, so a preset that changes the sound at once doesn't click; other parameters go straight in.
// Run: node test/worklet-tests.mjs

import assert from 'node:assert/strict';
import { loadInstrument, defaultsOf, withPreset } from '../tools/headless.mjs';
import { loadEngine } from '../tools/engine.mjs';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}

// the worklet's globals, then the worklet itself
const FS = 48000;
const processors = {};
globalThis.sampleRate = FS;
globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage: () => {}, onmessage: null }; } };
globalThis.registerProcessor = (name, C) => { processors[name] = C; };
await import('../shared/worklet.js');

async function processor(slug) {
  const I = await loadInstrument(slug), E = await loadEngine(I);
  globalThis.TestEngine = class extends E { static load() {} };
  const p = new processors['forte-processor']({ processorOptions: { wasm: { name: 'TestEngine', bytes: null } } });
  return { I, p, send: (m) => p.port.onmessage({ data: m }) };
}
// render `seconds`, calling at(t) before each block
function render(p, seconds, at = () => {}) {
  const n = Math.round(seconds * FS), L = new Float64Array(n);
  for (let s = 0; s < n; s += 128) {
    at(s / FS);
    const out = [[new Float32Array(128), new Float32Array(128)]];
    p.process([], out);
    for (let i = 0; i < 128 && s + i < n; i++) L[s + i] = out[0][0][i];
  }
  return L;
}
// the largest second difference (a click's mark) within [a, b) s
const roughness = (x, a, b) => { let m = 0; for (let i = Math.max(2, Math.round(a * FS)); i < Math.min(x.length, Math.round(b * FS)); i++) m = Math.max(m, Math.abs(x[i] - 2 * x[i - 1] + x[i - 2])); return m; };

console.log('worklet');

await test('a preset that changes the sound at once (the clavichord without its soundboard) fades across instead of clicking', async () => {
  const play = async (swap) => {
    const { I, p, send } = await processor('clavichord');
    send({ type: 'params', P: defaultsOf(I) });
    const k = I.presets.findIndex((q) => /without the soundboard/i.test(q.name));
    assert.ok(k >= 0, 'the preset');
    let sent = false;
    const x = render(p, 1.2, (t) => {
      if (t >= 0.2 && t < 0.21) for (const key of [60, 64, 67]) send({ type: 'noteOn', key, velocity: 0.7 });
      if (t >= 0.8 && !sent) { sent = true; send({ type: 'params', P: withPreset(I, k), swap }); }
    });
    return { at: roughness(x, 0.79, 0.85), before: roughness(x, 0.6, 0.78), after: roughness(x, 0.9, 1.2) };
  };
  const hard = await play(false), soft = await play(true);
  console.log(`         the change: ${(hard.at / hard.before).toFixed(0)}× the playing's roughness straight in, ${(soft.at / Math.max(soft.before, soft.after)).toFixed(1)}× faded`);
  assert.ok(hard.at > 20 * hard.before, 'straight in, it clicks (else this test shows nothing)');
  assert.ok(soft.at <= 2 * Math.max(soft.before, soft.after), 'faded, no rougher than the playing either side');
});

await test('the fade takes 18 ms and leaves the new preset playing; a parameter that is not a preset goes straight in', async () => {
  const { I, p, send } = await processor('clavichord');
  send({ type: 'params', P: defaultsOf(I) });
  send({ type: 'params', P: withPreset(I, 0), swap: true });
  assert.ok(p.swap?.out, 'fading out');
  render(p, 0.0065);
  assert.ok(p.swap && !p.swap.out, 'fading back in once out');
  render(p, 0.013);
  assert.equal(p.swap, null, 'done');
  send({ type: 'params', P: defaultsOf(I) });
  assert.equal(p.swap, null, 'no fade for a plain change');
});

await test('a second preset during the fade out is the one taken; one during the fade in turns it back', async () => {
  const { I, p, send } = await processor('clavichord');
  send({ type: 'params', P: defaultsOf(I) });
  send({ type: 'params', P: withPreset(I, 0), swap: true });
  render(p, 0.002);
  const later = withPreset(I, 1);
  send({ type: 'params', P: later, swap: true });
  assert.equal(p.swap.P, later);
  render(p, 0.006);
  assert.ok(!p.swap.out);
  render(p, 0.006); // half way up
  const at = p.swap.at;
  send({ type: 'params', P: withPreset(I, 2), swap: true });
  assert.ok(p.swap.out); assert.ok(Math.abs(p.swap.at - (1 - at)) < 1e-9, 'down from where it was');
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
