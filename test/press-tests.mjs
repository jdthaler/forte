// Press (native/core/include/forte/press.h): Strike sets a note's attack, Press the level it holds
// at. On the struck and plucked instruments pressing a held key makes its note more, never less: a
// sustainer swells and holds the strings, tines, reeds, springs and steel bars (an EBow, a driver
// coil by a pickup) at the level the hardest strike gives them, a bow the vibraphone's bars; the
// mallet instruments roll; the Breit-Wigner Keyboard keeps making its state, and the Quantum Keyboard's
// pump stays on, refilling its packet. A finger resting on a
// key (pressure up to half way: a Seaboard sends some) plays exactly as no press at all. On the
// instruments whose notes hold (a bow, a breath, a current), a note's own pressure (MPE) takes its
// level over from the strike once it comes.
// Run: node test/press-tests.mjs

import assert from 'node:assert/strict';
import { player } from '../tools/headless.mjs';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}

const fs = 24000, AT = 0.3, END = 2.5;
const HOW = {
  sustainer: ['piano', 'grand', 'harpsichord', 'tines', 'reeds', 'pianet', 'celesta', 'kalimba', 'springs'],
  bow: ['vibraphone'],
  roll: ['marimba', 'steelpan', 'gongs', 'carillon', 'tubular', 'gamelan'],
  production: ['breitwigner'],
  pump: ['quantum'],
};
// the instruments whose notes hold, whose own pressure sets the level (forte/press.h Held)
const HELD = ['voice', 'brass', 'clavicylinder', 'chladni', 'cristal', 'saw', 'resonator', 'ondes', 'trautonium', 'cellulophone', 'telharmonium',
  'bowed', 'pyrophone', 'dunes', 'abracadabra', 'pulsars', 'universe', 'hydrogen', 'stars', 'cuore'];
const same = (a, b) => a[0].every((x, i) => Object.is(x, b[0][i])) && a[1].every((x, i) => Object.is(x, b[1][i]));
// the held note's energy over its last second
const late = ([L, R]) => { let s = 0; for (let i = Math.round((END - 1) * fs); i < END * fs; i++) s += L[i] * L[i] + R[i] * R[i]; return s; };
const dB = (r) => (10 * Math.log10(r)).toFixed(1);

console.log('press');

for (const [how, ids] of Object.entries(HOW)) {
  await test(`${how}: ${ids.join(', ')}: a finger at rest (half way) plays as no press, sample for sample; a firm press, on the key or the channel, holds the note louder than it rings alone, and a full press louder than one half as hard past rest`, async () => {
    const wrong = [];
    for (const id of ids) {
      const { I } = await player(id, fs);
      const [lo, hi] = I.compass?.keys ?? I.range ?? [36, 96];
      let key = 60;
      while (key < lo) key += 12;
      while (key > hi) key -= 12;
      const play = async (ev) => (await player(id, fs)).render(END, [[0, 'on', key, 0.7], ...ev]); // (a fresh engine each)
      const plain = await play([]), rest = await play([[AT, 'pressure', 0.5, key]]);
      const half = await play([[AT, 'pressure', 0.75, key]]), full = await play([[AT, 'pressure', 1, key]]), channel = await play([[AT, 'pressure', 1]]);
      if (!same(rest, plain)) wrong.push(`${id}: a finger at rest changes the sound`);
      if (!(late(full) > 2 * late(plain))) wrong.push(`${id}: a full press, ${dB(late(full) / late(plain))} dB over the note alone`);
      if (!(late(channel) > 2 * late(plain))) wrong.push(`${id}: a full press on the channel, ${dB(late(channel) / late(plain))} dB over the note alone`);
      if (!(late(half) > late(plain) && late(full) > late(half))) wrong.push(`${id}: half a press ${dB(late(half) / late(plain))} dB, a full one ${dB(late(full) / late(plain))} dB over the note alone`);
    }
    assert.deepEqual(wrong, []);
  });
}

const keyOf = (I) => {
  const [lo, hi] = I.compass?.keys ?? I.range ?? [36, 96];
  let key = 60;
  while (key < lo) key += 12;
  while (key > hi) key -= 12;
  return key;
};

// The grand's and the vibraphone's notes ring so long that a press brings them to its level over
// seconds, and a harpsichord's two choirs of strings, each held, sum as their phases fall; the
// rest have settled by the last second.
const SETTLED = ['piano', 'reeds', 'celesta', 'kalimba', 'springs', 'breitwigner', 'quantum', ...HOW.roll];
await test(`Strike sets the attack, Press the level: under a full press a soft strike (0.3) and a hard one (1) hold within 1 dB: ${SETTLED.join(', ')}`, async () => {
  const wrong = [];
  for (const id of SETTLED) {
    const { I } = await player(id, fs);
    const key = keyOf(I);
    const play = async (v) => (await player(id, fs)).render(END, [[0, 'on', key, v], [AT, 'pressure', 1, key]]);
    const r = late(await play(0.3)) / late(await play(1));
    if (!(Math.abs(10 * Math.log10(r)) < 1)) wrong.push(`${id}: ${dB(r)} dB`);
  }
  assert.deepEqual(wrong, []);
});

// A note's own pressure from the start (MPE, as a Seaboard sends it): the level it holds is the
// press's, whatever the strike, the level a strike as hard as the press, pressed as hard on the
// channel, holds; a channel's pressure, or a key's aftertouch, leaves the strike's level to it. (Not the glass harmonica: a hard
// landing can set a bowl in its louder regime, which a firm finger then keeps; nor the birds,
// whose songs come by chance.)
await test(`a note's own press (MPE) sets the level it holds, in place of the strike, within 1.5 dB: ${HELD.join(', ')}`, async () => {
  const wrong = [];
  for (const id of HELD) {
    const { I } = await player(id, fs);
    const key = keyOf(I), p = 0.6;
    const play = async (v, k) => late(await (await player(id, fs)).render(END, [[0, 'on', key, v], k === undefined ? [0.001, 'pressure', p] : [0.001, 'notePressure', p, k]]));
    const soft = await play(0.3, key), hard = await play(1, key), as = await play(p);
    if (!(Math.abs(10 * Math.log10(soft / hard)) < 1.5)) wrong.push(`${id}: struck soft, ${dB(soft / hard)} dB from struck hard`);
    if (!(Math.abs(10 * Math.log10(hard / as)) < 1.5)) wrong.push(`${id}: ${dB(hard / as)} dB from a strike of ${p} pressed as hard on the channel`);
  }
  assert.deepEqual(wrong, []);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
