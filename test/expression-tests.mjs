// The Expression switches (shared/expression.js): every instrument has Strike, Glide, Slide,
// Press and Lift as parameters, all on by default; a page shows those its instrument answers to;
// and the worklet (shared/worklet.js) holds back what a switch that is off would let through,
// letting go of what it held when one turns off. The plugins' side: native/tests/plugin-tests.cpp.
// Run: node test/expression-tests.mjs

import assert from 'node:assert/strict';
import { INSTRUMENTS } from '../shared/registry.js';
import { EXPRESSION, EXPRESSION_IDS, responds, unanswered, createGate } from '../shared/expression.js';
import { nativeParams, pluginParams } from '../shared/wasm.js';
import { presetParams } from '../shared/presets.js';
import { loadInstrument } from '../tools/headless.mjs';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}

// the worklet, with an engine that writes down what it is given
globalThis.sampleRate = 48000;
globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage: () => {}, onmessage: null }; } };
const processors = {};
globalThis.registerProcessor = (name, C) => { processors[name] = C; };
await import('../shared/worklet.js');
globalThis.RecordingEngine = class {
  static load() {}
  constructor() { this.got = []; }
  noteOn(key, velocity) { this.got.push(['noteOn', key, velocity]); }
  noteOff(key, velocity) { this.got.push(['noteOff', key, velocity]); }
  setParams() {}
  handle(m) { this.got.push([m.type, m.key ?? null, m.value]); }
  process() {}
};
function processor(keyVelocity) {
  const p = new processors['forte-processor']({ processorOptions: { wasm: { name: 'RecordingEngine', bytes: null }, keyVelocity } });
  const send = (m) => p.port.onmessage({ data: m });
  return { send, got: () => p.engine.got.splice(0) };
}
const ON = Object.fromEntries(EXPRESSION_IDS.map((id) => [id, true]));

console.log('expression');

await test('every instrument has the five switches, all on; its plugin and its saved presets those it answers to, last; its engine none', async () => {
  for (const r of INSTRUMENTS) {
    const I = await loadInstrument(r.id);
    assert.equal(I.groups.at(-1), EXPRESSION, `${r.id}: the Expression group last`);
    const answered = EXPRESSION_IDS.filter((id) => !unanswered(I).includes(id)), n = answered.length;
    assert.deepEqual(pluginParams(I).slice(-n).map((p) => p.id), answered, `${r.id}: the plugin's last parameters`);
    assert.deepEqual(presetParams(I).map((p) => p.id), pluginParams(I).map((p) => p.id), `${r.id}: a saved preset's`);
    assert.ok(!nativeParams(I).some((p) => EXPRESSION_IDS.includes(p.id)), `${r.id}: the engine's (its WebAssembly's) have none`);
    for (const pr of I.presets ?? []) for (const id of EXPRESSION_IDS) if (id in pr.p) assert.equal(typeof pr.p[id], 'boolean', `${r.id} "${pr.name}".${id}`);
  }
  assert.ok(EXPRESSION.params.every((p) => p.type === 'checkbox' && p.def === true && p.hint));
});

await test('a page shows the switches its instrument answers to', async () => {
  const shown = async (id) => { const I = await loadInstrument(id); return EXPRESSION_IDS.filter((s) => responds(I, s)); };
  assert.deepEqual(await shown('pipes'), ['strikeOn', 'glideOn', 'slideOn', 'pressOn', 'liftOn']); // its slide, a key held part way
  assert.deepEqual(await shown('piano'), ['strikeOn', 'glideOn', 'slideOn', 'pressOn', 'liftOn']); // its bend, a finger on the strings behind the bridge
  assert.deepEqual(await shown('clavier'), ['strikeOn', 'glideOn', 'slideOn', 'pressOn', 'liftOn']); // its bend presses the key, its slide lays its felt on
  assert.deepEqual(await shown('arc'), ['strikeOn', 'glideOn', 'slideOn', 'pressOn', 'liftOn']); // its strike, how hard the key closes its contact
  assert.deepEqual(await shown('brass'), ['strikeOn', 'glideOn', 'slideOn', 'pressOn', 'liftOn']);
  for (const r of INSTRUMENTS) assert.ok((await shown(r.id)).includes('liftOn'), `${r.id}: Lift, at least`); // test/lift-tests.mjs
});

// The approved table's "Off in presets" column: what each instrument's presets turn off, as making
// little sense on it (a struck string's or bar's bend, a damping hand on a piano, a lift on a
// phenomenon whose release is the recording's). Every other instrument's presets leave all on.
const OFF_IN_PRESETS = {
  piano: ['glide', 'press'],
  grand: ['glide', 'press'],
  harpsichord: ['glide', 'press'],
  cimbalom: ['glide'],
  hurdygurdy: ['lift'],
  vibraphone: ['glide', 'lift'],
  carillon: ['glide', 'lift'],
  celesta: ['glide'],
  kalimba: ['glide', 'lift'],
  steelpan: ['glide', 'lift'],
  marimba: ['glide', 'lift'],
  gamelan: ['glide'],
  tubular: ['glide'],
  clavicylinder: ['glide'],
  cristal: ['glide'],
  gongs: ['glide'],
  chladni: ['glide'],
  organ: ['glide', 'press'],
  tines: ['press'],
  reeds: ['press'],
  pianet: ['press'],
  telharmonium: ['glide'],
  cellulophone: ['glide'],
  blackhole: ['lift'],
  showers: ['lift'],
  whistlers: ['lift'],
  project8: ['lift'],
  abracadabra: ['glide', 'lift'],
  tess: ['glide', 'lift'],
  cuore: ['lift'],
  planets: ['lift'],
  pulsars: ['lift'],
  nmr: ['lift'],
};
await test('presets turn off what makes little sense on their instrument, the table\'s "Off in presets" column; the defaults keep every switch on', async () => {
  for (const r of INSTRUMENTS) {
    const I = await loadInstrument(r.id), off = (OFF_IN_PRESETS[r.id] ?? []).map((d) => `${d}On`);
    for (const id of off) assert.ok(responds(I, id), `${r.id}: answers to ${id}`);
    for (const pr of I.presets ?? []) {
      const set = EXPRESSION_IDS.filter((id) => id in pr.p);
      assert.deepEqual(set, EXPRESSION_IDS.filter((id) => off.includes(id)), `${r.id} "${pr.name}": the switches it sets`);
      for (const id of set) assert.equal(pr.p[id], false, `${r.id} "${pr.name}".${id}`);
    }
  }
});

await test('on, everything goes through as it came', () => {
  const { send, got } = processor();
  send({ type: 'params', P: { ...ON } });
  send({ type: 'noteOn', key: 60, velocity: 0.3 });
  send({ type: 'noteBend', key: 60, value: 1.5 });
  send({ type: 'slide', key: 60, value: 0.4 });
  send({ type: 'pressure', key: 60, value: 0.6 });
  send({ type: 'noteOff', key: 60, velocity: 0.9 });
  assert.deepEqual(got(), [['noteOn', 60, 0.3], ['noteBend', 60, 1.5], ['slide', 60, 0.4], ['pressure', 60, 0.6], ['noteOff', 60, 0.9]]);
});

await test('off, Strike plays the computer keys\' velocity, Lift the instrument\'s own release, and Glide, Slide and Press are held back', () => {
  const { send, got } = processor();
  send({ type: 'params', P: { ...ON, strikeOn: false, glideOn: false, slideOn: false, pressOn: false, liftOn: false, velocity: 0.6 } });
  send({ type: 'noteOn', key: 60, velocity: 0.3 });
  send({ type: 'noteBend', key: 60, value: 1.5 });
  send({ type: 'slide', key: 60, value: 0.4 });
  send({ type: 'pressure', key: 60, value: 0.6 });
  send({ type: 'pressure', key: null, value: 0.6 });
  send({ type: 'bend', value: 0.5 }); // the pitch wheel is every note's: Glide leaves it
  send({ type: 'noteOff', key: 60, velocity: 0.9 });
  assert.deepEqual(got(), [['noteOn', 60, 0.6], ['bend', null, 0.5], ['noteOff', 60, undefined]]);
  // a note struck plain resets its own bend and slide whatever the switches say
  send({ type: 'noteBend', key: 62, value: 1 }); send({ type: 'slide', key: 62, value: NaN });
  assert.deepEqual(got().map((m) => m[0]), ['noteBend', 'slide']);
  // without a velocity parameter: the page's keyVelocity (the black hole's 1), else 0.75
  const b = processor(1);
  b.send({ type: 'params', P: { ...ON, strikeOn: false } });
  b.send({ type: 'noteOn', key: 60, velocity: 0.3 });
  assert.deepEqual(b.got(), [['noteOn', 60, 1]]);
  const c = processor();
  c.send({ type: 'params', P: { ...ON, strikeOn: false } });
  c.send({ type: 'noteOn', key: 60, velocity: 0.3 });
  assert.deepEqual(c.got(), [['noteOn', 60, 0.75]]);
});

await test('a switch turned off lets go of what it let through: the bent note back on its pitch, the slid one to the wheel, the pressed one unpressed', () => {
  const { send, got } = processor();
  send({ type: 'params', P: { ...ON } });
  send({ type: 'noteOn', key: 60, velocity: 0.5 }); send({ type: 'noteOn', key: 64, velocity: 0.5 });
  send({ type: 'noteBend', key: 60, value: 1.1 });
  send({ type: 'slide', key: 64, value: 0.3 });
  send({ type: 'pressure', key: 64, value: 0.7 }); send({ type: 'pressure', key: null, value: 0.2 });
  send({ type: 'pressure', key: 60, value: 0.5 }); send({ type: 'pressure', key: 60, value: 0 }); // let go already
  got();
  send({ type: 'params', P: { ...ON, glideOn: false, slideOn: false, pressOn: false } });
  assert.deepEqual(got(), [['noteBend', 60, 1], ['slide', 64, NaN], ['pressure', 64, 0], ['pressure', null, 0]]);
  send({ type: 'params', P: { ...ON, glideOn: false, slideOn: false, pressOn: false } }); // again: nothing more
  send({ type: 'params', P: { ...ON } });                                                  // and on again
  assert.deepEqual(got(), []);
  send({ type: 'noteBend', key: 60, value: 1.2 });
  assert.deepEqual(got(), [['noteBend', 60, 1.2]]);
});

await test('the gate alone: a P with no switches (an older page\'s, a second instrument\'s) leaves everything on', () => {
  const g = createGate(), out = [];
  g.params({ volume: 1 }, (m) => out.push(m));
  assert.equal(g.message({ type: 'noteOn', key: 60, velocity: 0.2 }).velocity, 0.2);
  assert.equal(g.message({ type: 'noteOff', key: 60, velocity: 0.2 }).velocity, 0.2);
  assert.ok(g.message({ type: 'pressure', key: 60, value: 0.2 }));
  assert.deepEqual(out, []);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
