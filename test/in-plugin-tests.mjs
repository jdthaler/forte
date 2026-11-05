// In-plugin checks: shared/in-plugin.js, the page inside a plugin's window (its Views pane). Its
// analyser reads the plugin's sound as Web Audio's AnalyserNode would (Blackman window, |X| / N,
// smoothing, dB), the plugin's values become the page's, the keys follow the plugin's, and
// every instrument's page follows the plugin one way or the other: shared/shell.js, or its own
// main module through follow().
// Run: node test/in-plugin-tests.mjs

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { inPlugin, hear, graph, fft, pageValue, keysFrom } from '../shared/in-plugin.js';
import { INSTRUMENTS } from '../shared/registry.js';
import { loadInstrument } from '../tools/headless.mjs';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (± ${tol})`);
const b64 = (x) => Buffer.from(new Float32Array(x).buffer).toString('base64');
// The views' playhead moves on in real time, as the plugin's sound comes in: hear, then wait
// until it has caught up.
const heard = async (x) => { hear(b64(x)); await new Promise((r) => setTimeout(r, 30 + (1000 * x.length) / 48000)); };

await test('outside a plugin window, the page is the site\'s', () => assert.equal(inPlugin, false));

await test('the FFT matches the DFT', () => {
  const n = 64, x = Array.from({ length: n }, (_, i) => Math.sin(i * 0.7) + 0.3 * Math.cos(i * 2.1) + (i % 5) / 7);
  const re = Float64Array.from(x), im = new Float64Array(n);
  fft(re, im);
  for (let k = 0; k < n; k++) {
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) { a += x[i] * Math.cos((2 * Math.PI * k * i) / n); b -= x[i] * Math.sin((2 * Math.PI * k * i) / n); }
    near(re[k], a, 1e-9, `re[${k}]`); near(im[k], b, 1e-9, `im[${k}]`);
  }
});

// A sine centred on bin k reads, in Web Audio's analyser, as A·0.42/2 there (the Blackman
// window's mean is 0.42; |X| / N of a sine is A/2 times it).
await test('the analyser reads a sine as Web Audio does', async () => {
  const { analyser, ctx } = graph();
  const n = 2048, k = 100, A = 0.5, fs = ctx.sampleRate;
  analyser.fftSize = n; analyser.smoothingTimeConstant = 0;
  await heard(Array.from({ length: 4 * n }, (_, i) => A * Math.sin((2 * Math.PI * k * i) / n)));
  const out = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(out);
  let peak = 0;
  for (let i = 1; i < out.length; i++) if (out[i] > out[peak]) peak = i;
  assert.equal(peak, k, 'the peak\'s bin');
  near(out[k], 20 * Math.log10((A * 0.42) / 2), 0.05, 'its level (dB)');
  assert.ok(out[k + 10] < out[k] - 60, `far from it, the window's sidelobes: ${out[k + 10]} dB`);
  assert.equal(analyser.frequencyBinCount, n / 2);
  assert.ok(fs > 0);
  const bytes = new Uint8Array(out.length);
  analyser.getByteFrequencyData(bytes);
  assert.equal(bytes[k], Math.max(0, Math.min(255, Math.floor((255 * (out[k] + 100)) / 70))), 'in bytes, -100…-30 dB');
});

await test('the analyser smooths over time as Web Audio does', async () => {
  const { analyser } = graph();
  const n = 1024, k = 40;
  analyser.fftSize = n; analyser.smoothingTimeConstant = 0.5;
  await heard(Array.from({ length: 2 * n }, (_, i) => Math.sin((2 * Math.PI * k * i) / n)));
  const out = new Float32Array(n / 2);
  analyser.getFloatFrequencyData(out);
  near(out[k], 20 * Math.log10(0.5 * (0.42 / 2)), 0.05, 'the first reading: half the way from silence');
});

await test('the time domain is the newest samples', async () => {
  const { analyser } = graph();
  analyser.fftSize = 256;
  const x = Array.from({ length: 512 }, (_, i) => ((i % 17) - 8) / 10);
  await heard(x);
  const out = new Float32Array(256);
  analyser.getFloatTimeDomainData(out);
  for (let i = 0; i < 256; i++) near(out[i], Math.fround(x[256 + i]), 0, `sample ${i}`);
  const bytes = new Uint8Array(256);
  analyser.getByteTimeDomainData(bytes);
  assert.equal(bytes[0], Math.floor(128 * (1 + Math.fround(x[256]))));
});

await test('the plugin\'s values become the page\'s', () => {
  const select = { type: 'select', def: 'b', options: [['a', 'A'], ['b', 'B'], ['c', 'C']] };
  assert.equal(pageValue(select, 2), 'c');
  assert.equal(pageValue(select, 0.9), 'b');
  assert.equal(pageValue(select, 7), 'b', 'out of range: the default');
  assert.equal(pageValue({ type: 'checkbox' }, 1), true);
  assert.equal(pageValue({ type: 'checkbox' }, 0), false);
  assert.equal(pageValue({ min: 0, max: 1 }, 0.25), 0.25);
});

await test('the keys and the pedal follow the plugin\'s', () => {
  const log = [];
  const follow = keysFrom({ on: (k, v) => log.push(['on', k, v]), off: (k) => log.push(['off', k]), pedal: (on) => log.push(['pedal', on]) });
  follow({ keys: [60, 64], vel: [0.5, 0.9] });
  follow({ keys: [64, 67], vel: [0.9, 0.3], pedal: true });
  follow({ keys: [64, 67], vel: [0.9, 0.3], pedal: true });
  follow({ keys: [] });
  assert.deepEqual(log, [['on', 60, 0.5], ['on', 64, 0.9], ['off', 60], ['on', 67, 0.3], ['pedal', true], ['off', 64], ['off', 67], ['pedal', false]]);
});

// Each instrument with plugins shows its page in the plugin's window: through shared/shell.js,
// which follows the plugin itself, or through follow() in the page's own main module.
await test('every instrument\'s page follows the plugin', () => {
  const missing = [];
  for (const i of INSTRUMENTS.filter((x) => x.plugin?.ready)) {
    const dir = new URL(`../${i.id}/src/`, import.meta.url);
    if (!existsSync(new URL(`../${i.id}/index.html`, import.meta.url))) continue;
    const src = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
    const shell = src.includes('shared/shell.js'), own = /import \{[^}]*\bfollow\b[^}]*\} from '\.\.\/\.\.\/shared\/in-plugin\.js'/.test(src);
    if (!shell && !own) missing.push(i.id);
  }
  assert.deepEqual(missing, []);
});

// The engine's messages reach the views as the page's worklet turns them: each WebAssembly
// module's engine class gives its translator to the window (shared/wasm.js).
await test('every engine class gives the window its messages', async () => {
  const none = [];
  for (const i of INSTRUMENTS.filter((x) => x.plugin?.ready)) {
    const { wasm } = await loadInstrument(i.id);
    const cls = (await import(wasm.module))[wasm.name];
    if (!cls || !('translate' in cls)) none.push(i.id);
  }
  assert.deepEqual(none, []);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall in-plugin tests passed');
