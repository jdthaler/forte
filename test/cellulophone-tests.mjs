// Cellulophone checks. Run: node test/cellulophone-tests.mjs
//
// The physics against what is independent of it (whole slots on rings in the ratio of the
// semitones, the slot's sinc, Fourier series of the drawings, a lamp's flicker), then the engine
// (native/instruments/cellulophone, built as WebAssembly) against the model: the pitch, the
// harmonics, the touch, the mirror, the damping arcs, the cells and the motor.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS } from '../cellulophone/src/cellulophone-instrument.js';
import { wasmModel } from '../cellulophone/src/cellulophone-wasm.js';
import { loadEngine } from '../tools/engine.mjs';

const CellulophoneEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
// a clean signal path for measuring: no slot errors, a steady motor, no loudspeaker, a linear amplifier
const CLEAN = { wear: 0, hunt: 0, speaker: 'none', drive: 0 };
const cents = (a, b) => 1200 * Math.log2(a / b);
const db = (a, b) => 20 * Math.log10(a / b);
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };

// Render through the engine, 128-sample blocks like the AudioWorklet: events [t, 'on'|'off'|'pressure'|'bend'|'slide', …].
function render(params, events, sec, { quality, tap } = {}) {
  const e = new CellulophoneEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  if (tap) e.tap = tap;
  const n = Math.ceil((sec * FS) / 128) * 128, L = new Float32Array(n), bL = new Float32Array(128), bR = new Float32Array(128);
  const ev = [...events].sort((a, b) => a[0] - b[0]);
  let k = 0;
  for (let s = 0; s < n; s += 128) {
    while (k < ev.length && ev[k][0] * FS <= s) {
      const [, type, a, b] = ev[k++];
      if (type === 'on') e.noteOn(a, b ?? 0.8);
      else if (type === 'off') e.noteOff(a);
      else if (type === 'pressure') e.handle({ type: 'pressure', value: b, key: a });
      else if (type === 'bend') e.handle({ type: 'bend', value: a });
      else if (type === 'slide') e.handle({ type: 'slide', value: b, key: a });
    }
    e.process(bL, bR, 128); L.set(bL, s);
  }
  return { x: L, e };
}
const hold = (keys, vel = 0.8) => keys.map((k) => [0, 'on', k, vel]);
// Amplitude of frequency f in x[a, b) (Hann-windowed, so a steady sine of amplitude A gives A).
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0, sw = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); sw += h; re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return (2 * Math.hypot(re, im)) / sw;
}
// The strongest frequency within ±25 ¢ of f0 in x[a, b) (golden-section search on tone).
function peak(x, f0, a, b) {
  let lo = f0 * 2 ** (-25 / 1200), hi = f0 * 2 ** (25 / 1200);
  for (let i = 0; i < 50; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const keyFreq = (k) => 440 * 2 ** ((k - 69) / 12);

// The disc, worked out here: ring k of a disc whose C ring has c0 slots has round(c0·2^(k/12)), and
// the motor is set so that A's ring sounds A; octave o's disc turns 2^(o−4) as fast as octave 4's.
const ring = (c0, k) => Math.round(c0 * 2 ** (k / 12));
const discFreq = (key, c0 = 54, a4 = 440) => ring(c0, key % 12) * (a4 / ring(c0, 9)) * 2 ** (Math.floor(key / 12) - 1 - 4);

console.log('the discs');
test('Toulon\'s disc: rings of 54, 57, 61, 64, 68, 72, 76, 81, 86, 91, 96 and 102 slots, C to B; A in tune, the rest up to 12 ¢ off (F♯ −11.8 ¢), the same in every octave', () => {
  const slots = Array.from({ length: 12 }, (_, pc) => M.keyNote(60 + pc, 54, P()).slots);
  assert.deepEqual(slots, [54, 57, 61, 64, 68, 72, 76, 81, 86, 91, 96, 102]);
  for (let key = 21; key <= 108; key++) {
    const n = M.keyNote(key, 54, P());
    assert.ok(Math.abs(n.f / discFreq(key) - 1) < 1e-12, `key ${key}: ${n.f} vs ${discFreq(key)}`);
    assert.ok(Math.abs(n.cents - cents(discFreq(key), keyFreq(key))) < 1e-9, `key ${key}: its cents`);
    assert.ok(Math.abs(n.cents) < 12, `key ${key}: ${n.cents.toFixed(2)} ¢`);
  }
  assert.equal(M.keyNote(69, 54, P()).cents, 0);
  assert.ok(Math.abs(M.keyNote(66, 54, P()).cents - -11.8) < 0.05, 'F♯');
  assert.ok(Math.abs(M.keyNote(30, 54, P()).cents - M.keyNote(102, 54, P()).cents) < 1e-9, 'F♯1 and F♯7 alike');
});
test('finer discs round closer: within 3.5 ¢ with 216 slots on C and within 1 ¢ with 864 (half a slot over the ring\'s slots, plus A\'s own rounding)', () => {
  for (const [c0, tol] of [[216, 3.5], [864, 1]]) {
    const bound = (k) => 1200 * Math.log2(1 + 0.5 / ring(c0, k)) + Math.abs(cents(ring(c0, 9), c0 * 2 ** (9 / 12)));
    for (let pc = 0; pc < 12; pc++) {
      const c = M.keyNote(60 + pc, c0, P()).cents;
      assert.ok(Math.abs(c) <= bound(pc) + 1e-9 && Math.abs(c) < tol, `${c0}: ${pc} ${c.toFixed(3)} ¢`);
    }
  }
});

console.log('the window');
test('a screen is its drawing: clear from 0 to the window\'s height, its harmonics in the recipe\'s proportions (the clarinet\'s even ones absent)', () => {
  for (const scr of M.screens.filter((s) => s !== 'octaves')) {
    const c = M.screenSpectrum(scr), a = M.recipe(scr);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 2048; i++) {
      let v = 0;
      for (let n = 0; n <= M.H_MAX; n++) v += c.re[n] * Math.cos((2 * Math.PI * n * i) / 2048) - c.im[n] * Math.sin((2 * Math.PI * n * i) / 2048);
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    assert.ok(Math.abs(lo) < 2e-3 * hi, `${scr}: darkest ${lo}`);
    const c1 = Math.hypot(c.re[1], c.im[1]);
    for (let n = 2; n <= 16; n++) assert.ok(Math.abs(Math.hypot(c.re[n], c.im[n]) / c1 - a[n - 1] / a[0]) < 1e-9, `${scr}: harmonic ${n}`);
  }
});
test('the stops match: every screen\'s window passes the sine\'s AC power (the window as much taller as the drawing is weaker)', () => {
  const power = (s) => { const c = M.screenSpectrum(s); let p = 0; for (let n = 1; n <= M.H_MAX; n++) p += (c.re[n] ** 2 + c.im[n] ** 2) / 2; return p; };
  for (const s of M.screens.filter((x) => x !== 'octaves')) assert.ok(Math.abs(power(s) / power('sine') - 1) < 1e-9, s);
  assert.ok(Math.abs(power('sine') - 0.125) < 1e-12, 'the sine: amplitude 1/2');
});
test('the slot averages the screen: one period of the light is a·(T ⊛ box_a), so harmonic n is the screen\'s times a·sinc(n a); it vanishes where n·a is whole', () => {
  for (const a of [0.06, 0.25, 0.5]) {
    const L = M.lightPeriod('violin', 0, a, 512), c = M.screenSpectrum('violin');
    for (const n of [0, 1, 2, 3, 4, 6]) {
      let re = 0, im = 0;
      L.forEach((v, i) => { re += v * Math.cos((2 * Math.PI * n * i) / 512); im += v * Math.sin((2 * Math.PI * n * i) / 512); });
      const got = (n ? 2 : 1) * Math.hypot(re, im) / 512;
      const sinc = n ? Math.sin(Math.PI * n * a) / (Math.PI * n * a) : 1;
      const want = Math.abs(a * sinc) * Math.hypot(c.re[n], c.im[n]);
      assert.ok(Math.abs(got - want) < 1e-9, `a ${a}, n ${n}: ${got} vs ${want}`);
    }
  }
  // and against the box itself: average the drawing over the slot by brute force
  const a = 0.2, c = M.screenSpectrum('oboe'), T = (x) => { let v = 0; for (let n = 0; n <= M.H_MAX; n++) v += c.re[n] * Math.cos(2 * Math.PI * n * x) - c.im[n] * Math.sin(2 * Math.PI * n * x); return v; };
  for (const x of [0.1, 0.37, 0.8]) {
    let s = 0; const N = 2000;
    for (let i = 0; i < N; i++) s += T(x - a / 2 + (a * (i + 0.5)) / N);
    assert.ok(Math.abs((a * s) / N - M.light('oboe', 0, a, x)) < 1e-6, `x ${x}`);
  }
});
test('pushing the key back stacks the slit on the screen: the light is T·(1 − p(1 − s)), s = ((1 + cos 2π(x − x*))/2)⁸ centred on T\'s clearest point', () => {
  const c = M.screenSpectrum('flute'), T = (x) => { let v = 0; for (let n = 0; n <= M.H_MAX; n++) v += c.re[n] * Math.cos(2 * Math.PI * n * x) - c.im[n] * Math.sin(2 * Math.PI * n * x); return v; };
  let xs = 0, best = -Infinity;
  for (let i = 0; i < 4096; i++) { const v = T(i / 4096); if (v > best) { best = v; xs = i / 4096; } }
  const s = (x) => ((1 + Math.cos(2 * Math.PI * (x - xs))) / 2) ** M.SLIT_POWER, a = 0.04;
  for (const p of [0.5, 1]) for (const x of [0.05, 0.3, xs, 0.71]) {
    let sum = 0; const N = 400;
    for (let i = 0; i < N; i++) { const u = x - a / 2 + (a * (i + 0.5)) / N; sum += T(u) * (1 - p * (1 - s(u))); }
    assert.ok(Math.abs((a * sum) / N - M.light('flute', p, a, x)) < 2e-4 * a, `p ${p}, x ${x}`);
  }
});
test('the lamp\'s flicker: 5 % at twice 50 Hz, less at 60 Hz (the filament\'s heat smooths it as 1/f); none on batteries', () => {
  assert.equal(M.flicker(0), 0);
  assert.ok(Math.abs(M.flicker(50) - 0.05) < 1e-12);
  assert.ok(Math.abs(M.flicker(60) - 0.05 * 50 / 60) < 1e-12);
});

console.log('the engine');
test('every key sounds its ring\'s slots times its disc\'s turns: the 54-slot disc\'s errors, measured (within 0.3 ¢)', () => {
  for (const key of [21, 30, 45, 57, 60, 61, 64, 66, 70, 79, 93, 106]) {
    const f = discFreq(key), { x } = render(P({ ...CLEAN, screen: 'sine' }), hold([key]), 2.2);
    const got = peak(x, f, FS * 0.2, x.length);
    assert.ok(Math.abs(cents(got, f)) < 0.3, `key ${key}: ${cents(got, f).toFixed(3)} ¢ from the disc's ${f.toFixed(3)} Hz`);
  }
});
test('the harmonics through the window: the clarinet\'s odd ones in its recipe times the slot\'s sinc, the even ones missing (> 50 dB down)', () => {
  const a = 0.06, key = 57, f = discFreq(key), { x } = render(P({ ...CLEAN, screen: 'clarinet', slot: a }), hold([key]), 1.5);
  const r = M.recipe('clarinet'), sinc = (n) => Math.sin(Math.PI * n * a) / (Math.PI * n * a);
  const h1 = tone(x, f, FS * 0.3, x.length);
  for (const n of [3, 5, 7]) {
    const d = db(tone(x, n * f, FS * 0.3, x.length) / h1, (r[n - 1] * sinc(n)) / (r[0] * sinc(1)));
    assert.ok(Math.abs(d) < 0.3, `harmonic ${n}: ${d.toFixed(2)} dB from the model`);
  }
  for (const n of [2, 4, 6]) assert.ok(db(tone(x, n * f, FS * 0.3, x.length), h1) < -50, `harmonic ${n} present`);
});
test('wider slots: the third harmonic falls by sinc(3a)/sinc(a) against the first, and the note grows louder in proportion to the slot', () => {
  const key = 57, f = discFreq(key), out = {};
  for (const a of [0.04, 0.2]) {
    const { x } = render(P({ ...CLEAN, screen: 'violin', slot: a }), hold([key]), 1.2);
    out[a] = { h1: tone(x, f, FS * 0.3, x.length), h3: tone(x, 3 * f, FS * 0.3, x.length) };
  }
  const sinc = (u) => Math.sin(Math.PI * u) / (Math.PI * u);
  const want = db(sinc(0.6) / sinc(0.2), sinc(0.12) / sinc(0.04)), got = db(out[0.2].h3 / out[0.2].h1, out[0.04].h3 / out[0.04].h1);
  assert.ok(Math.abs(got - want) < 0.3, `third over first: ${got.toFixed(2)} dB, the sinc says ${want.toFixed(2)}`);
  const louder = db(out[0.2].h1, out[0.04].h1), wantL = db(0.2 * sinc(0.2), 0.04 * sinc(0.04));
  assert.ok(Math.abs(louder - wantL) < 0.3, `louder by ${louder.toFixed(2)} dB, ${wantL.toFixed(2)} expected`);
});
test('key touch: the depth screen lets through 1 − t + t·velocity of the beam, and aftertouch presses the key the rest of the way', () => {
  const key = 69, f = 440, t = 0.7, amp = (ev) => tone(render(P({ ...CLEAN, screen: 'sine', keyTouch: t }), ev, 1.2).x, f, FS * 0.6, FS * 1.2);
  const full = amp(hold([key], 1)), soft = amp(hold([key], 0.3)), pressed = amp([...hold([key], 0.3), [0.2, 'pressure', key, 1]]);
  assert.ok(Math.abs(db(soft, full) - db(1 - t + t * 0.3, 1)) < 0.1, `soft: ${db(soft, full).toFixed(2)} dB`);
  assert.ok(Math.abs(db(pressed, full)) < 0.1, `pressed: ${db(pressed, full).toFixed(2)} dB`);
});
test('the mirror sweeps a round spot: halfway across, half the light; the light reaches the cell over the travel (quicker for a quick key)', () => {
  // C8's period is 0.24 ms, so the cell's current averaged over one period is the light let in
  const key = 108, f = discFreq(key), T = 1 / f, ms = 20;
  for (const vel of [1, 0.4]) {
    const travel = (ms / 1000) * (1.25 - 0.75 * vel);
    const { x } = render(P({ ...CLEAN, mirror: ms, keyTouch: 0 }), hold([key], vel), 0.2, { tap: 1 });
    const mean = (t0) => { const a = Math.round(t0 * FS), b = Math.round((t0 + 4 * T) * FS); let s = 0; for (let i = a; i < b; i++) s += x[i]; return s / (b - a); };
    const steady = mean(0.15), half = mean(travel / 2 - 2 * T), quarter = mean(travel / 4 - 2 * T);
    assert.ok(Math.abs(half / steady - 0.5) < 0.03, `vel ${vel}: halfway ${(half / steady).toFixed(3)}`);
    const z = 1 - 2 * 0.25, th = 2 * Math.acos(z), seg = (th - Math.sin(th)) / (2 * Math.PI); // a quarter across: the circular segment
    assert.ok(Math.abs(quarter / steady - seg) < 0.03, `vel ${vel}: a quarter across ${(quarter / steady).toFixed(3)} vs ${seg.toFixed(3)}`);
  }
});
test('notes hold while their keys are down and stop when they come up (the mirror out of the beam)', () => {
  const { x, e } = render(P(), [[0, 'on', 60, 0.8], [1, 'off', 60]], 1.5);
  assert.ok(rms(x, FS * 0.5, FS * 0.9) > 0.02 && Math.abs(db(rms(x, FS * 0.2, FS * 0.5), rms(x, FS * 0.6, FS * 0.9))) < 0.5, 'steady while held');
  assert.ok(rms(x, FS * 1.2, FS * 1.5) < 1e-3 * rms(x, FS * 0.5, FS * 0.9), 'silent after');
  assert.equal(e.voiceCount(), 0);
});
test('the damping arcs: the light falls in a straight line to nothing over the time set (half at half the time), and the voice ends', () => {
  const d = 2, f = 440, { x, e } = render(P({ ...CLEAN, screen: 'sine', damping: d }), hold([69]), 2.3);
  const a = (t) => tone(x, f, Math.round((t - 0.05) * FS), Math.round((t + 0.05) * FS));
  const a0 = a(0.1);
  for (const t of [0.5, 1, 1.5]) assert.ok(Math.abs(a(t) / a0 - (1 - t / d) / (1 - 0.1 / d)) < 0.02, `at ${t} s: ${(a(t) / a0).toFixed(3)}`);
  assert.ok(rms(x, Math.round(2.1 * FS), x.length) < 1e-4, 'silent');
  assert.equal(e.voiceCount(), 0);
});
test('lamps on 50 Hz mains: every held note brings a 100 Hz line, flicker × the mean light, and sidebands 100 Hz either side', () => {
  const key = 72, f = discFreq(key), p = P({ ...CLEAN, screen: 'sine', lamp: '50' });
  const { x } = render(p, hold([key]), 1.5, { tap: 1 });
  let dc = 0; for (let i = FS * 0.5; i < x.length; i++) dc += x[i]; dc /= x.length - FS * 0.5;
  const hum = tone(x, 100, FS * 0.5, x.length), carrier = tone(x, f, FS * 0.5, x.length);
  assert.ok(Math.abs(hum / dc - 0.05) < 0.002, `hum ${(hum / dc).toFixed(4)} of the mean light`);
  for (const sb of [f - 100, f + 100]) assert.ok(Math.abs(tone(x, sb, FS * 0.5, x.length) / carrier - 0.025) < 0.002, `sideband at ${sb.toFixed(0)} Hz`);
  const quiet = render(P({ ...CLEAN, screen: 'sine' }), hold([key]), 1.5, { tap: 1 }).x;
  assert.ok(tone(quiet, 100, FS * 0.5, quiet.length) < 1e-4 * dc, 'none on batteries');
});
test('a selenium cell: slow (a note\'s light arrives late) and not in proportion (two notes on one cell make their difference tone; a potassium cell makes none)', () => {
  const c = 60, g = 64, fd = discFreq(g) - discFreq(c), out = {};
  for (const cell of ['potassium', 'selenium']) {
    const { x } = render(P({ ...CLEAN, screen: 'sine', cell, mirror: 1 }), hold([c, g], 1), 1.5);
    out[cell] = { x, diff: tone(x, fd, FS * 0.5, x.length), note: tone(x, discFreq(c), FS * 0.5, x.length) };
  }
  assert.ok(db(out.selenium.diff, out.selenium.note) > -40, `selenium's difference tone ${db(out.selenium.diff, out.selenium.note).toFixed(1)} dB`);
  assert.ok(db(out.potassium.diff, out.potassium.note) < -80, `potassium's ${db(out.potassium.diff, out.potassium.note).toFixed(1)} dB`);
  // the onset: the mean light through the cell, 10 ms in, against its steady value
  const on = (cell) => { const x = render(P({ ...CLEAN, screen: 'sine', cell, mirror: 1 }), hold([84], 1), 0.6, { tap: 1 }).x; const m = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i]; return s / (b - a); }; return m(Math.round(0.009 * FS), Math.round(0.011 * FS)) / m(Math.round(0.4 * FS), Math.round(0.5 * FS)); };
  assert.ok(on('potassium') > 0.99, `potassium: ${on('potassium').toFixed(3)} at 10 ms`);
  const s = on('selenium'), want = (1 - M.SELENIUM_SLOW_SHARE) + M.SELENIUM_SLOW_SHARE * (1 - Math.exp(-0.01 / M.SELENIUM_SLOW));
  assert.ok(Math.abs(s - want) < 0.03, `selenium: ${s.toFixed(3)} at 10 ms, the two time constants give ${want.toFixed(3)}`);
});
test('pushing the keys back brightens the note: the harmonics\' centroid climbs with the push (wheel), and MPE slide pushes one key alone', () => {
  const key = 57, f = discFreq(key);
  const centroid = (x) => { let s = 0, w = 0; for (let n = 1; n <= 12; n++) { const a = tone(x, n * f, FS * 0.4, x.length); s += n * a * a; w += a * a; } return s / w; };
  const base = centroid(render(P({ ...CLEAN }), hold([key]), 1).x), wheel = centroid(render(P({ ...CLEAN, push: 1 }), hold([key]), 1).x);
  const slid = render(P({ ...CLEAN }), [[0, 'slide', key, 1], [0, 'on', key, 0.8], [0, 'on', key + 1, 0.8]], 1).x;
  assert.ok(wheel > base + 0.4, `centroid ${base.toFixed(2)} → ${wheel.toFixed(2)}`);
  assert.ok(Math.abs(centroid(slid) - wheel) < 0.15, `the slid key alone: ${centroid(slid).toFixed(2)}`);
});
test('the tremolo screen cuts the light at its rate, by its depth', () => {
  const key = 69, f = 440, d = 0.6, rate = 9;
  const { x } = render(P({ ...CLEAN, screen: 'sine', tremolo: d, tremRate: rate }), hold([key]), 1.6);
  let lo = Infinity, hi = 0;
  for (let t = 0.5; t < 1.5; t += 0.005) { const a = tone(x, f, Math.round(t * FS), Math.round((t + 0.01) * FS)); lo = Math.min(lo, a); hi = Math.max(hi, a); }
  assert.ok(Math.abs(lo / hi - (1 - d)) < 0.05, `darkest over clearest ${(lo / hi).toFixed(3)}, ${1 - d} expected`);
});
test('the motor: pitch bend turns every disc together, 2 semitones at full, through the discs\' inertia; its hunting swings the pitch by the cents set', () => {
  const { x, e } = render(P({ ...CLEAN, screen: 'sine' }), [...hold([57, 76]), [0.05, 'bend', 1]], 2.5);
  assert.ok(Math.abs(e.cents - 200) < 0.05, `the motor at ${e.cents.toFixed(3)} ¢`);
  for (const k of [57, 76]) { const f = discFreq(k) * 2 ** (200 / 1200); assert.ok(Math.abs(cents(peak(x, f, FS * 1.8, x.length), f)) < 0.5, `key ${k} bent`); }
  const early = render(P({ ...CLEAN }), [[0, 'bend', 1]], 0.25).e.cents;
  assert.ok(early > 50 && early < 190, `a quarter second in: ${early.toFixed(1)} ¢ (not there at once)`);
  const hunt = 8, e2 = new CellulophoneEngine(FS); e2.setParams(P({ ...CLEAN, hunt }));
  const bl = new Float32Array(128), br = new Float32Array(128);
  let lo = Infinity, hi = -Infinity;
  for (let b = 0; b < 600; b++) { e2.process(bl, br, 128); lo = Math.min(lo, e2.cents); hi = Math.max(hi, e2.cents); }
  assert.ok(Math.abs(hi - hunt) < 0.05 && Math.abs(lo + hunt) < 0.05, `hunting ${lo.toFixed(2)} … ${hi.toFixed(2)} ¢`);
});
test('the slots\' cutting errors come round once a turn: sidebands at the disc\'s turning rate, none on a true disc', () => {
  const key = 84, nt = M.keyNote(key, 54, P()), f = nt.f, side = (wear) => {
    const { x } = render(P({ ...CLEAN, screen: 'sine', wear }), hold([key]), 2.2);
    return Math.max(tone(x, f + nt.turns, FS * 0.2, x.length), tone(x, f - nt.turns, FS * 0.2, x.length)) / tone(x, f, FS * 0.2, x.length);
  };
  assert.ok(db(side(0.03), 1) > -45, `worn: ${db(side(0.03), 1).toFixed(1)} dB`);
  assert.ok(db(side(0), 1) < -90, `true: ${db(side(0), 1).toFixed(1)} dB`);
});
test('the keyboard\'s tuning: at A = 415 Hz every note moves by the pitch (the rings unchanged); a retuned note moves to the ring cut for it, whole slots again', () => {
  for (const key of [60, 64, 69]) {
    const n = M.keyNote(key, 54, P({ pitch: 415 })), n0 = M.keyNote(key, 54, P());
    assert.equal(n.slots, n0.slots);
    assert.ok(Math.abs(cents(n.f, n0.f) - cents(415, 440)) < 1e-9, `key ${key}`);
  }
  const custom = P({ temperament: 'custom', cents4: 35 }), n = M.keyNote(64, 54, custom);
  assert.equal(n.slots, Math.round(54 * 2 ** ((400 + 35) / 1200)), 'E\'s ring cut 35 ¢ sharp');
  const { x } = render({ ...custom, ...CLEAN, screen: 'sine' }, hold([64]), 2);
  assert.ok(Math.abs(cents(peak(x, n.f, FS * 0.2, x.length), n.f)) < 0.3, 'and the engine plays it');
});
test('a screen for each octave: the discs carry violin, horn, voix humaine, oboe, clarinet, flute and sine from the bass up', () => {
  assert.deepEqual(Array.from({ length: 9 }, (_, o) => M.octaveScreen(o)), ['violin', 'violin', 'horn', 'voix', 'oboe', 'clarinet', 'flute', 'sine', 'sine']);
  const key = 57, f = discFreq(key), same = render(P({ ...CLEAN, screen: 'octaves' }), hold([key]), 1).x, voix = render(P({ ...CLEAN, screen: 'voix' }), hold([key]), 1).x;
  for (let i = 0; i < same.length; i++) if (same[i] !== voix[i]) throw new Error(`A3 (octave 3) does not play the voix humaine: sample ${i}`);
});
test('output level: a forte note peaks 0.1–0.5, a held chord stays finite, and nothing is left after the keys come up', () => {
  let pk = 0;
  for (const scr of M.screens) for (const k of [33, 60, 84, 105]) { const { x } = render(P({ screen: scr }), [[0, 'on', k, 1], [0.6, 'off', k]], 0.9); for (const v of x) pk = Math.max(pk, Math.abs(v)); assert.ok(x.every(Number.isFinite), `${scr} ${k}: finite`); }
  assert.ok(pk > 0.1 && pk < 0.5, `peak ${pk.toFixed(3)}`);
  const { x, e } = render(P({ cell: 'selenium', lamp: '50', drive: 1, speaker: 'horn', push: 1, tremolo: 1 }), [...hold([36, 48, 55, 60, 64, 67, 72, 76, 79, 84], 1), [1, 'off', 36], ...[48, 55, 60, 64, 67, 72, 76, 79, 84].map((k) => [1, 'off', k])], 2);
  assert.ok(x.every(Number.isFinite), 'finite');
  assert.ok(rms(x, Math.round(1.6 * FS), x.length) < 1e-4, `after: ${rms(x, Math.round(1.6 * FS), x.length)}`);
  assert.equal(e.voiceCount(), 0);
});
test('CPU: ten held keys render 10× faster than real time', () => {
  const t0 = performance.now();
  render(P({ hunt: 1, wear: 0.004, push: 0.3, tremolo: 0.3, lamp: '50' }), hold([36, 40, 43, 48, 52, 55, 60, 64, 67, 72]), 4);
  const ms = performance.now() - t0;
  assert.ok(ms < 400, `${ms.toFixed(0)} ms for 4 s`);
});
test('Quality: at Medium 24 keys sound at once and at Low 12 (High: all 88), the oldest letting go; a note keeps its pitch and level', () => {
  for (const [quality, cap] of [['high', 40], ['medium', 24], ['low', 12]]) {
    const { e } = render(P(), Array.from({ length: 40 }, (_, i) => [i * 0.01, 'on', 36 + i, 0.8]), 1, { quality });
    assert.equal(e.voiceCount(), cap, quality);
  }
  for (const quality of ['medium', 'low']) {
    const hi = render(P(), hold([69]), 1).x, lo = render(P(), hold([69]), 1, { quality }).x;
    assert.ok(Math.abs(db(rms(lo, FS * 0.3, FS), rms(hi, FS * 0.3, FS))) < 0.5, `${quality}: level`);
    assert.ok(Math.abs(cents(peak(lo, 440, FS * 0.3, FS), peak(hi, 440, FS * 0.3, FS))) < 0.1, `${quality}: pitch`);
  }
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
