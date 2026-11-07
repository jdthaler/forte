// Lift on every instrument (native/core/include/forte/lift.h): how fast a key comes up, the release
// velocity a Seaboard's Lift or a keyboard's note-off sends. A key let go with none (−1: the
// computer keys, the pedal) or a middling one (0.5) plays exactly as it always did; a slow or a fast
// lift changes the release; a slow one never ends it sooner, but where it drags a damper on.
// Run: node test/lift-tests.mjs

import assert from 'node:assert/strict';
import { INSTRUMENTS } from '../shared/registry.js';
import { player } from '../tools/headless.mjs';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}

const fs = 24000, T = 1, END = T + 2;
// What each instrument plays for the test: a note held for T s and let go, or (the hurdy-gurdy,
// whose melody string a lift lets go only to the key still held under it) a second key over a first.
const SCENES = {
  hurdygurdy: (key, v) => [[0, 'on', key - 4, 0.7], [0.3, 'on', key, 0.7], [T, 'off', key, v]],
};
// Those that took release velocity before every instrument did, each with a release of its own for
// none (the harpsichord's jack as at 0.6, a pipe's pallet closing in 8 ms): not a middling one's.
const OWN_NONE = ['harpsichord', 'pipes', 'harmonium', 'regal', 'windharp'];
// Those where a slow lift damps more: the clavichord's tangent leaving the strings slowly, and a
// bow dragged off the saw's blade or the Chladni plate (a fast lift springs it clear and rings on).
const SLOW_DAMPS = ['clavichord', 'saw', 'chladni'];
const scene = (id, key, v) => (SCENES[id] ?? ((k, x) => [[0, 'on', k, 0.7], [T, 'off', k, x]]))(key, v);

async function render(id, v) {
  const p = await player(id, fs);
  const [lo, hi] = p.I.range || [36, 96];
  const key = Math.min(hi, Math.max(lo + 4, 64));
  return p.render(END, scene(id, key, v));
}
const same = (a, b) => a[0].every((x, i) => Object.is(x, b[0][i])) && a[1].every((x, i) => Object.is(x, b[1][i]));
const tail = ([L, R]) => { let s = 0; for (let i = T * fs; i < END * fs; i++) s += L[i] * L[i] + R[i] * R[i]; return s; };

console.log('lift');

await test('every instrument: no release velocity plays as a middling one, sample for sample; a slow or a fast lift plays otherwise; a slow one never ends sooner (but where it drags a damper on)', async () => {
  const wrong = [];
  for (const { id } of INSTRUMENTS) {
    const none = await render(id, -1), mid = await render(id, 0.5), slow = await render(id, 0.05), fast = await render(id, 0.95);
    if (!OWN_NONE.includes(id) && !same(none, mid)) wrong.push(`${id}: −1 and 0.5 differ`);
    if (same(slow, mid) && same(fast, mid)) wrong.push(`${id}: neither a slow nor a fast lift changes anything`);
    if (SLOW_DAMPS.includes(id) ? tail(slow) > tail(mid) : tail(slow) < 0.95 * tail(mid)) wrong.push(`${id}: a slow lift's tail is ${(tail(slow) / tail(mid)).toFixed(3)} of a middling one's`);
  }
  assert.deepEqual(wrong, []);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
