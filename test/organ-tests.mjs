// Tonewheel organ checks. Run: node test/organ-tests.mjs
import assert from 'node:assert/strict';
import { gearFreq, etFreq, centsOff, keyWheel, keyAnalysis, buildGenerator, NUM_WHEELS, wheelSpec } from '../organ/src/tonewheels.js';
import { OrganEngine } from '../organ/src/organ-engine.js';
import { DEFAULTS } from '../organ/src/organ-params.js';

const FS = 48000;
let failures = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });

function engine(params) {
  const e = new OrganEngine(FS);
  e.setParams(params);
  e.configure(buildGenerator(params, FS));
  return e;
}
function run(e, seconds, onBlock) {
  const n = Math.round(seconds * FS), L = new Float32Array(n), R = new Float32Array(n);
  const bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  for (let s = 0; s < n; s += bl) {
    if (onBlock) onBlock(s / FS);
    e.process(bL, bR, bl);
    L.set(bL.subarray(0, Math.min(bl, n - s)), s);
    R.set(bR.subarray(0, Math.min(bl, n - s)), s);
  }
  return { L, R };
}
// frequency from rising zero crossings (linear interpolation), over a window
function zcFreq(x, a, b) {
  const t = [];
  for (let i = a + 1; i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) t.push(i - 1 + x[i - 1] / (x[i - 1] - x[i]));
  return ((t.length - 1) * FS) / (t[t.length - 1] - t[0]);
}
function zcTimes(x) {
  const t = [];
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) t.push(i - 1 + x[i - 1] / (x[i - 1] - x[i]));
  return t;
}
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const DRY = { vib: 'off', leslieOn: false, drive: 0, leakage: -90, crosstalk: -80, wheelHarm: 0, spread: 0, bounce: 0 };

console.log('tone generator');
test('gear ratios: A4 = 440 Hz exactly, every wheel within 0.71 ¢ of ET (2.1 ¢ for the 192-tooth wheels)', () => {
  assert.equal(gearFreq(46), 440);
  assert.ok(Math.abs(gearFreq(1) - 32.692) < 0.01, `wheel 1 ${gearFreq(1)}`);
  for (let w = 1; w <= 84; w++) assert.ok(Math.abs(centsOff(w)) < 0.71, `wheel ${w}: ${centsOff(w)}`);
  for (let w = 85; w <= NUM_WHEELS; w++) {
    assert.equal(wheelSpec(w).teeth, 192);
    assert.ok(Math.abs(centsOff(w)) < 2.1, `wheel ${w}: ${centsOff(w)}`);
  }
});
test('keys tap wheels 1–91 with foldback at the top', () => {
  assert.equal(keyWheel(36, 2), 13);   // C2 at 8′
  assert.equal(keyWheel(36, 0), 1);    // 16′ uses the bottom wheel
  assert.equal(keyWheel(96, 8), 85);   // C7 at 1′ folds back two octaves
  for (let k = 36; k <= 96; k++) for (let d = 0; d < 9; d++) { const w = keyWheel(k, d); assert.ok(w >= 1 && w <= 91); }
});
test('drawbar "harmonics" are tempered: 1⅗′ ≈ +13.7 ¢, 2⅔′ ≈ −2 ¢', () => {
  const a = keyAnalysis(60, P());
  assert.ok(Math.abs(a[6].cents - 13.7) < 1, `1 3/5: ${a[6].cents}`);
  assert.ok(Math.abs(a[4].cents + 1.96) < 1, `2 2/3: ${a[4].cents}`);
  const h = keyAnalysis(60, P({ tuning: 'harmonic' }));
  for (const r of h) assert.ok(Math.abs(r.cents) < 1e-9);
});

console.log('engine');
test('one key, 8′ only: plays its wheel’s frequency', () => {
  const e = engine(P({ ...DRY, drawbars: [0, 0, 8, 0, 0, 0, 0, 0, 0] }));
  e.keyDown(69);
  const { L } = run(e, 0.5);
  const f = zcFreq(L, 4800, 24000);
  assert.ok(Math.abs(f - 440) < 0.05, `f=${f}`);
  assert.ok(rms(L, 4800, 24000) > 0.01);
});
test('motor off: pitch and level fall together as the generator coasts', () => {
  const params = P({ ...DRY, drawbars: [0, 0, 8, 0, 0, 0, 0, 0, 0], inertia: 4 });
  const e = engine(params);
  e.keyDown(69);
  const { L } = run(e, 3.5, (t) => { if (t >= 0.5 && e.p.motor) e.setParams({ motor: false }); });
  const f0 = zcFreq(L, 4800, 19200), f1 = zcFreq(L, 3.0 * FS, 3.3 * FS);
  const a0 = rms(L, 4800, 19200), a1 = rms(L, 3.0 * FS, 3.3 * FS);
  const ratio = f1 / f0;
  assert.ok(ratio < 0.65 && ratio > 0.4, `speed ratio ${ratio}`);
  assert.ok(Math.abs(a1 / a0 - ratio) < 0.06, `level ${a1 / a0} vs pitch ${ratio}`);
  console.log(`        after 2.6 s coasting: pitch ×${ratio.toFixed(3)} (${(1200 * Math.log2(ratio)).toFixed(0)} ¢), level ×${(a1 / a0).toFixed(3)}`);
});
test('scanner vibrato V3: pitch swing matches the LC line (±2Nτ·f_scan)', () => {
  const params = P({ ...DRY, drawbars: [0, 0, 8, 0, 0, 0, 0, 0, 0], vib: 'V3' });
  const e = engine(params);
  e.keyDown(81); // A5 880 Hz, well below the ladder cutoff
  const { L } = run(e, 1.2);
  const t = zcTimes(L.subarray(9600));
  let lo = Infinity, hi = 0;
  for (let i = 4; i < t.length; i++) { const f = (4 * FS) / (t[i] - t[i - 4]); lo = Math.min(lo, f); hi = Math.max(hi, f); }
  const swing = (hi - lo) / (hi + lo); // ≈ fractional deviation
  const expect = 2 * params.sections * params.sectionDelay * 1e-6 * params.scanRate;
  assert.ok(swing > 0.75 * expect && swing < 1.35 * expect, `swing ${swing} vs ${expect}`);
  console.log(`        ±${(1200 * Math.log2(1 + swing)).toFixed(1)} ¢ (ideal-line prediction ±${(1200 * Math.log2(1 + expect)).toFixed(1)} ¢)`);
});
test('Leslie horn: Doppler swing ≈ ±v/c', () => {
  const params = P({ ...DRY, drawbars: [0, 0, 0, 0, 0, 0, 0, 0, 8], leslieOn: true, leslie: 'fast', reflections: 0, crossover: 300, micDist: 3 });
  const e = engine(params);
  e.hornHz = params.hornFast; e.drumHz = params.drumFast;
  e.keyDown(60); // 1′ of C4 → 2093 Hz into the horn
  const { L } = run(e, 1.0);
  const t = zcTimes(L.subarray(4800));
  let lo = Infinity, hi = 0;
  for (let i = 8; i < t.length; i++) { const f = (8 * FS) / (t[i] - t[i - 8]); lo = Math.min(lo, f); hi = Math.max(hi, f); }
  const swing = (hi - lo) / (hi + lo);
  const vc = (2 * Math.PI * params.hornRadius * params.hornFast) / 343;
  assert.ok(swing > 0.7 * vc && swing < 1.15 * vc, `swing ${swing} vs v/c ${vc}`);
  console.log(`        horn tip ${(vc * 343).toFixed(1)} m/s → ±${(1200 * Math.log2(1 + swing)).toFixed(1)} ¢ (v/c: ±${(1200 * Math.log2(1 + vc)).toFixed(1)} ¢)`);
});
test('busbar loading compresses chords', () => {
  const level = (loading, keys) => {
    const e = engine(P({ ...DRY, drawbars: [0, 0, 8, 0, 0, 0, 0, 0, 0], loading }));
    for (const k of keys) e.keyDown(k);
    const { L } = run(e, 0.4);
    return rms(L, 4800);
  };
  const keys = [48, 52, 55, 60];
  const free = level(0, keys) / level(0, [48]), loaded = level(1, keys) / level(1, [48]);
  assert.ok(free > 1.8 && loaded < free * 0.7, `free ×${free.toFixed(2)}, loaded ×${loaded.toFixed(2)}`);
});
test('percussion is single-trigger (legato does not re-strike)', () => {
  const e = engine(P({ ...DRY, percOn: true }));
  e.keyDown(60);
  run(e, 0.3);
  const envBefore = e.percEnv;
  e.keyDown(64);
  assert.equal(e.percEnv, envBefore);
  e.keyUp(60); e.keyUp(64);
  run(e, 0.05);
  e.keyDown(67);
  assert.equal(e.percEnv, 1);
});
test('key click: contact bounce makes a broadband transient, soft contacts remove it', () => {
  const hf = (contactTime) => {
    const e = engine(P({ ...DRY, drawbars: [0, 0, 8, 0, 0, 0, 0, 0, 0], spread: 1.5, bounce: 1, contactTime }));
    e.keyDown(48);
    const { L } = run(e, 0.05);
    let d2 = 0;
    for (let i = 2; i < 960; i++) { const d = L[i] - 2 * L[i - 1] + L[i - 2]; d2 += d * d; }
    return Math.sqrt(d2 / 958) / rms(L, 1200, 2400);
  };
  const hard = hf(0), soft = hf(1500);
  assert.ok(hard > 4 * soft, `hard ${hard.toFixed(4)}, soft ${soft.toFixed(4)}`);
});
test('stable and finite across extreme settings', () => {
  const cases = [
    P({ drawbars: [8, 8, 8, 8, 8, 8, 8, 8, 8], vib: 'C3', leslie: 'fast', drive: 1, sections: 40, sectionDelay: 15 }),
    P({ drawbars: [8, 8, 8, 8, 8, 8, 8, 8, 8], tuning: 'harmonic', vib: 'V1', loading: 2, percOn: true, crosstalk: -20, leakage: -40, wheelHarm: 3 }),
    P({ mains: 45, sections: 4, sectionDelay: 150, hornRadius: 0.35, micDist: 0.3, reflections: 0.9, balance: 1 }),
  ];
  for (const c of cases) {
    const e = engine(c);
    for (const k of [36, 48, 55, 60, 64, 67, 72, 84, 96]) e.keyDown(k, 127);
    const { L, R } = run(e, 0.6, (t) => { if (t > 0.3) e.setParams({ motor: false, leslie: 'stop' }); });
    for (let i = 0; i < L.length; i++) assert.ok(Number.isFinite(L[i]) && Math.abs(L[i]) < 20 && Number.isFinite(R[i]));
  }
});

console.log('performance');
test('real-time budget: 10 keys, full drawbars, chorus, drive, Leslie', () => {
  const e = engine(P({ drawbars: [8, 8, 8, 8, 8, 8, 8, 8, 8], vib: 'C3', leslie: 'fast', drive: 0.5, percOn: true }));
  for (const k of [36, 43, 48, 52, 55, 60, 64, 67, 72, 76]) e.keyDown(k);
  const bl = 128, L = new Float32Array(bl), R = new Float32Array(bl);
  for (let i = 0; i < 100; i++) e.process(L, R, bl);
  const blocks = 3000, t0 = performance.now();
  let pk = 0;
  for (let i = 0; i < blocks; i++) { e.process(L, R, bl); pk = Math.max(pk, e.peak); }
  const ms = performance.now() - t0, audio = (blocks * bl * 1000) / FS;
  console.log(`        ${(100 * ms / audio).toFixed(1)} % of one core; peak level ${pk.toFixed(2)}`);
  assert.ok(ms < 0.5 * audio);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
