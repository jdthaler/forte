// Instruments sit at about the same loudness at their defaults, after the registry's trim.
// Run: node test/level-tests.mjs        (measurement: tools/loudness.mjs)

import assert from 'node:assert/strict';
import { measureAll, TARGET } from '../tools/loudness.mjs';
import { INSTRUMENTS, byId } from '../shared/registry.js';

let failures = 0;
function test(name, fn) { try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }

const rows = await measureAll();
console.log(`loudness of one default C4, target ${TARGET} LUFS (momentary max)`);
test('every ready instrument is measured', () => {
  for (const i of INSTRUMENTS.filter((x) => x.ready)) assert.ok(rows.some((r) => r.id === i.id), i.id);
});
for (const r of rows) {
  const t = byId(r.id)?.trim ?? 0, lufs = r.lufs + t, peak = r.peak + t;
  test(`${r.id}: ${lufs.toFixed(1)} LUFS, peak ${peak.toFixed(1)} dBFS after a ${t} dB trim`, () => {
    assert.ok(peak <= -4.5, 'a single default note should leave headroom for chords');
    // short, percussive sounds reach the peak limit before the loudness target
    const peakLimited = peak > -5.5;
    if (peakLimited) assert.ok(lufs <= TARGET + 2.5, `${lufs.toFixed(1)} LUFS`);
    else assert.ok(Math.abs(lufs - TARGET) <= 2.5, `${lufs.toFixed(1)} LUFS, more than 2.5 LU from ${TARGET}`);
  });
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
