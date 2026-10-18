// Tonewheel organ checks. Run: node test/organ-tests.mjs
// The tone generator's numbers (the C++ model, through the WebAssembly), then the engine.
import assert from 'node:assert/strict';
import { NUM_WHEELS } from '../organ/src/tonewheels.js';
import { INSTRUMENT } from '../organ/src/organ-instrument.js';
import { loadEngine } from '../tools/engine.mjs';
import { wasmModel } from '../organ/src/organ-wasm.js';
import { DEFAULTS } from '../organ/src/organ-params.js';

const OrganEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();
const { gearFreq, centsOff, keyWheel, keyAnalysis, wheelSpec } = M;

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real[- ]time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });

function engine(params) {
  const e = new OrganEngine(FS);
  e.setParams(params); // builds the generator too
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
const DRY = { vib: 'off', leslieOn: false, drive: 0, leakage: -90, crosstalk: -80, relief: 0, spread: 0, bounce: 0 };

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
  assert.equal(keyWheel(36, 0), 13);   // the 16′ folds back in the bottom octave, as on a B-3
  assert.equal(keyWheel(96, 8), 85);   // C7 at 1′ folds back two octaves
  for (let k = 36; k <= 96; k++) for (let d = 0; d < 9; d++) { const w = keyWheel(k, d); assert.ok(w >= 1 && w <= 91); }
});
test('every key A0–C8 plays: below the manual the drawbars fold back up where they run off wheel 1 (the 16′ off wheel 13, leaving 1–12 to the pedals), above it down from wheel 91, and the analysis says which', () => {
  assert.deepEqual(INSTRUMENT.range, [21, 108]);
  assert.equal(keyWheel(24, 2), 1);    // C1 at 8′: the bottom wheel
  assert.equal(keyWheel(24, 0), 13);   // its 16′ folds up past the pedals' wheels
  assert.equal(keyWheel(36, 0), 13);   // as C2's does on the B-3
  assert.equal(keyWheel(21, 2), 10);   // A0 at 8′: there is no wheel below C1, so A1
  assert.equal(keyWheel(108, 2), 85);  // C8 at 8′: the first 192-tooth wheel
  for (let k = 21; k <= 108; k++) for (let d = 0; d < 9; d++) {
    const w = keyWheel(k, d), at = k - 23 + [-12, 7, 0, 12, 19, 24, 28, 31, 36][d];
    assert.ok(w >= (d === 0 ? 13 : 1) && w <= 91 && (w - at) % 12 === 0, `key ${k}, drawbar ${d}: wheel ${w}`);
    assert.equal(keyAnalysis(k, P())[d].folded, w !== at, `key ${k}, drawbar ${d}: folded`);
  }
  for (const k of [21, 24, 30, 100, 108]) { // and the engine sounds them, 8′ alone on its wheel
    const e = engine(P({ ...DRY, drawbars: [0, 0, 8, 0, 0, 0, 0, 0, 0] }));
    e.noteOn(k, 0.8);
    const { L, R } = run(e, 0.6), want = gearFreq(keyWheel(k, 2)), f = zcFreq(L, 9600, 28800);
    assert.ok(L.every(Number.isFinite) && R.every(Number.isFinite), `key ${k}: NaN`);
    assert.ok(Math.abs(f / want - 1) < 2e-4 && rms(L, 9600, 28800) > 0.01, `key ${k}: ${f.toFixed(2)} Hz, wheel ${want.toFixed(2)} Hz`);
  }
});
test('drawbar "harmonics" are tempered: 1⅗′ ≈ +13.7 ¢, 2⅔′ ≈ −2 ¢', () => {
  const a = keyAnalysis(60, P());
  assert.ok(Math.abs(a[6].cents - 13.7) < 1, `1 3/5: ${a[6].cents}`);
  assert.ok(Math.abs(a[4].cents + 1.96) < 1, `2 2/3: ${a[4].cents}`);
  const h = keyAnalysis(60, P({ tuning: 'harmonic' }));
  for (const r of h) assert.ok(Math.abs(r.cents) < 1e-9);
});

test('B-3 levels: the 8′ stays even across the keys, the upper drawbars taper off in the treble', () => {
  const db = (k, d, levels = 'b3') => keyAnalysis(k, P({ levels }))[d].db;
  const eight = [];
  for (let k = 36; k <= 96; k++) eight.push(db(k, 2));
  assert.ok(Math.max(...eight) - Math.min(...eight) < 6, `8′ spans ${Math.min(...eight).toFixed(1)} to ${Math.max(...eight).toFixed(1)} dB`);
  // in the bass the 2⅔′ and 2′ are wired louder than the 8′; at C6 the 1′ is far below it
  assert.ok(db(36, 4) > db(36, 2) + 6 && db(36, 5) > db(36, 2) + 6, `C2: 8′ ${db(36, 2).toFixed(1)}, 2⅔′ ${db(36, 4).toFixed(1)}, 2′ ${db(36, 5).toFixed(1)} dB`);
  assert.ok(db(84, 8) < db(84, 2) - 12, `C6: 8′ ${db(84, 2).toFixed(1)}, 1′ ${db(84, 8).toFixed(1)} dB`);
  // through its wire a wheel's level goes as 1/R: C2's 16′ (folded back) and 8′ are the same wheel
  assert.ok(Math.abs(db(36, 0) - db(36, 2) - 20 * Math.log10(M.wireOhms(36, 2) / M.wireOhms(36, 0))) < 1e-9);
  for (let k = 36; k <= 96; k += 5) for (let d = 0; d < 9; d++) assert.equal(db(k, d, 'flat'), 0);
});
test('generator filters: wheels 44–48 lose their harmonics gently, 49 up are tuned (Q 3)', () => {
  const { filterGain, pickupHarmonics, wireOhms } = M;
  assert.equal(filterGain(43, 2), 1);
  assert.ok(Math.abs(filterGain(46, 1) - 1) < 1e-12 && filterGain(46, 2) < 0.8 && filterGain(46, 2) > 0.6);
  assert.ok(Math.abs(filterGain(60, 2) - 1 / Math.hypot(1, 3 * 1.5)) < 1e-12);
  assert.ok(Math.abs(20 * Math.log10(filterGain(60, 16))) > 30, 'the partner four octaves up is filtered off');
  assert.ok(filterGain(60, 1, 0.6) < 0.6, 'drifted capacitors detune the filter, so the wheel is quieter');
  // the pickup: flux ∝ 1/(1 − ε cos φ), so h2 = 2β, h3 = 3β², β = (1 − √(1 − ε²))/ε
  const { h2, h3 } = pickupHarmonics(13, 0.06);
  const lam = (Math.PI * 0.0508) / wheelSpec(13).teeth, eps = 0.06 * Math.exp((-2 * Math.PI * 0.25e-3) / lam), beta = (1 - Math.sqrt(1 - eps * eps)) / eps;
  assert.ok(Math.abs(h2 - 2 * beta) < 1e-12 && Math.abs(h3 - 3 * beta * beta) < 1e-12, `h2 ${h2}, h3 ${h3}`);
  assert.ok(pickupHarmonics(91, 0.06).h2 < h2 / 4, 'fine teeth sit further off the pickup, so their tone is purer');
  assert.equal(pickupHarmonics(13, 0).h2, 0);
  assert.equal(wireOhms(36, 4), 10.5);
});

console.log('engine');
test('one key, 8′ only: plays its wheel’s frequency', () => {
  const e = engine(P({ ...DRY, drawbars: [0, 0, 8, 0, 0, 0, 0, 0, 0] }));
  e.noteOn(69);
  const { L } = run(e, 0.5);
  const f = zcFreq(L, 4800, 24000);
  assert.ok(Math.abs(f - 440) < 0.05, `f=${f}`);
  assert.ok(rms(L, 4800, 24000) > 0.01);
});
test('motor off: pitch and level fall together as the generator coasts', () => {
  const params = P({ ...DRY, drawbars: [0, 0, 8, 0, 0, 0, 0, 0, 0], inertia: 4 });
  const e = engine(params);
  e.noteOn(69);
  const { L } = run(e, 3.5, (t) => { if (t >= 0.5 && e.p.motor) e.setParams({ motor: false }); });
  const f0 = zcFreq(L, 4800, 19200), f1 = zcFreq(L, 3.0 * FS, 3.3 * FS);
  const a0 = rms(L, 4800, 19200), a1 = rms(L, 3.0 * FS, 3.3 * FS);
  const ratio = f1 / f0;
  assert.ok(ratio < 0.65 && ratio > 0.4, `speed ratio ${ratio}`);
  assert.ok(Math.abs(a1 / a0 - ratio) < 0.06, `level ${a1 / a0} vs pitch ${ratio}`);
  console.log(`        after 2.6 s coasting: pitch ×${ratio.toFixed(3)} (${(1200 * Math.log2(ratio)).toFixed(0)} ¢), level ×${(a1 / a0).toFixed(3)}`);
});
test('scanner vibrato V3: median pitch swing is the LC line’s ±2Nτ·f_scan (±5 %)', () => {
  const params = P({ ...DRY, drawbars: [0, 0, 8, 0, 0, 0, 0, 0, 0], vib: 'V3' });
  const expect = 2 * params.sections * params.sectionDelay * 1e-6 * params.scanRate;
  const c = (x) => 1200 * Math.log2(1 + x);
  // per-cycle frequency; the triangular scan makes it a square wave, so take the
  // medians of its upper and lower halves, and the extremes
  const swings = (key) => {
    const e = engine(params);
    e.noteOn(key);
    const { L } = run(e, 1.5);
    const t = zcTimes(L.subarray(9600)), f = [];
    for (let i = 1; i < t.length; i++) f.push(FS / (t[i] - t[i - 1]));
    const s = [...f].sort((a, b) => a - b), med = s[s.length >> 1];
    const up = s.filter((x) => x > med), dn = s.filter((x) => x < med);
    const hi = up[up.length >> 1], lo = dn[dn.length >> 1];
    return { median: (hi - lo) / (hi + lo), extreme: (s[s.length - 1] - s[0]) / (s[s.length - 1] + s[0]) };
  };
  const a4 = swings(69), a5 = swings(81);
  assert.ok(Math.abs(a4.median / expect - 1) < 0.05, `A4 median swing ±${c(a4.median).toFixed(2)} ¢ vs ±${c(expect).toFixed(2)} ¢`);
  // the per-section phase steps ripple more at higher frequency, so the extremes grow
  assert.ok(a5.extreme > a4.extreme && a4.extreme > a4.median, 'extremes should grow with frequency');
  console.log(`        median ±${c(a4.median).toFixed(1)} ¢ (ideal line ±${c(expect).toFixed(1)} ¢); extremes ±${c(a4.extreme).toFixed(1)} ¢ at A4, ±${c(a5.extreme).toFixed(1)} ¢ at A5`);
});
test('Leslie horn: Doppler swing ≈ ±v/c', () => {
  const params = P({ ...DRY, drawbars: [0, 0, 0, 0, 0, 0, 0, 0, 8], leslieOn: true, leslie: 'fast', reflections: 0, crossover: 300, micDist: 3 });
  const e = engine(params);
  e.hornHz = params.hornFast; e.drumHz = params.drumFast;
  e.noteOn(60); // 1′ of C4 → 2093 Hz into the horn
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
    for (const k of keys) e.noteOn(k);
    const { L } = run(e, 0.4);
    return rms(L, 4800);
  };
  const keys = [48, 52, 55, 60];
  const free = level(0, keys) / level(0, [48]), loaded = level(1, keys) / level(1, [48]);
  assert.ok(free > 1.8 && loaded < free * 0.7, `free ×${free.toFixed(2)}, loaded ×${loaded.toFixed(2)}`);
});
test('percussion is single-trigger (legato does not re-strike)', () => {
  const e = engine(P({ ...DRY, percOn: true }));
  e.noteOn(60);
  run(e, 0.3);
  const envBefore = e.percEnv;
  e.noteOn(64);
  assert.equal(e.percEnv, envBefore);
  e.noteOff(60); e.noteOff(64);
  run(e, 0.05);
  e.noteOn(67);
  assert.equal(e.percEnv, 1);
});
test('key click: contact bounce makes a broadband transient, soft contacts remove it', () => {
  const hf = (contactTime) => {
    const e = engine(P({ ...DRY, drawbars: [0, 0, 8, 0, 0, 0, 0, 0, 0], spread: 1.5, bounce: 1, contactTime }));
    e.noteOn(48);
    const { L } = run(e, 0.05);
    let d2 = 0;
    for (let i = 2; i < 960; i++) { const d = L[i] - 2 * L[i - 1] + L[i - 2]; d2 += d * d; }
    return Math.sqrt(d2 / 958) / rms(L, 1200, 2400);
  };
  const hard = hf(0), soft = hf(1500);
  assert.ok(hard > 4 * soft, `hard ${hard.toFixed(4)}, soft ${soft.toFixed(4)}`);
});
test('tube drive: even harmonics grow with drive, a full chord stays bounded', () => {
  const peak = (x, a = 0) => { let m = 0; for (let i = a; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); return m; };
  const h2 = (drive) => {
    const e = engine(P({ ...DRY, drawbars: [0, 0, 8, 0, 0, 0, 0, 0, 0], drive }));
    e.noteOn(57);
    const { L } = run(e, 0.6);
    const g = (f) => { let re = 0, im = 0; for (let i = 9600; i < 28800; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - 9600)) / 19199); re += w * L[i] * Math.cos((2 * Math.PI * f * i) / FS); im += w * L[i] * Math.sin((2 * Math.PI * f * i) / FS); } return Math.hypot(re, im); };
    return { db: 20 * Math.log10(g(440) / g(220)), level: rms(L, 9600) };
  };
  const d0 = h2(0), d15 = h2(0.15), d50 = h2(0.5), d100 = h2(1);
  assert.ok(d15.db < d50.db && d50.db < d100.db && d100.db > -30, `H2: ${d15.db.toFixed(1)}, ${d50.db.toFixed(1)}, ${d100.db.toFixed(1)} dB`);
  assert.ok(Math.abs(20 * Math.log10(d15.level / d0.level)) < 0.5, 'a little drive leaves the level alone');
  // ten keys, every drawbar out, pedal down, drive full: was a rectifier peaking at 13
  const e = engine(P({ ...DRY, drawbars: [8, 8, 8, 8, 8, 8, 8, 8, 8], expression: 1, drive: 1, loading: 0 }));
  for (const k of [36, 43, 48, 52, 55, 60, 64, 67, 72, 76]) e.noteOn(k, 1);
  const { L } = run(e, 0.5);
  assert.ok(peak(L, 4800) < 1, `peak ${peak(L, 4800).toFixed(2)}`);
  console.log(`        H2 re fundamental: drive 0.15 ${d15.db.toFixed(0)} dB, 0.5 ${d50.db.toFixed(0)} dB, 1 ${d100.db.toFixed(0)} dB; 10-key chord at full drive peaks ${peak(L, 4800).toFixed(2)}`);
});
test('Leslie: the horn cannot sweep through the mics', () => {
  const e = engine(P({ hornRadius: 0.3, micDist: 0.3, leslie: 'fast', vib: 'off', drive: 0 }));
  e.hornHz = e.p.hornFast; e.drumHz = e.p.drumFast;
  for (const k of [60, 64, 67]) e.noteOn(k);
  const { L, R } = run(e, 1.5);
  let pk = 0, s2 = 0;
  for (let i = 9600; i < L.length; i++) { pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); s2 += L[i] * L[i]; }
  const crest = 20 * Math.log10(pk / Math.sqrt(s2 / (L.length - 9600)));
  assert.ok(pk < 1 && crest < 20, `peak ${pk.toFixed(2)}, crest ${crest.toFixed(1)} dB`);
});
test('expression pedal glides: a 2 dB step makes no click', () => {
  // a treble chord: the pedal's 2 dB is the open plate's, and the shut plate's low-passed share
  // (the bass the swell keeps) is too small up here to change it
  const e = engine(P({ ...DRY, drawbars: [0, 0, 8, 8, 0, 0, 0, 0, 0] }));
  for (const k of [79, 84, 88]) e.noteOn(k);
  const { L } = run(e, 0.6, (t) => { if (t >= 0.3 && e.p.expression !== 0.8) e.setParams({ expression: 0.8 }); });
  const d3 = (i) => L[i] - 3 * L[i - 1] + 3 * L[i - 2] - L[i - 3];
  const S = (t) => Math.round(t * FS);
  let ref = 0, c = 0, pk = 0, pk0 = 0;
  for (let i = S(0.1); i < S(0.28); i++) { ref += d3(i) ** 2; c++; pk0 = Math.max(pk0, Math.abs(d3(i))); }
  for (let i = S(0.29); i < S(0.33); i++) pk = Math.max(pk, Math.abs(d3(i)));
  assert.ok(pk < 2 * pk0, `spike ${(pk / Math.sqrt(ref / c)).toFixed(1)}× RMS, background peaks ${(pk0 / Math.sqrt(ref / c)).toFixed(1)}×`);
  const lv = (a, b) => 20 * Math.log10(rms(L, S(a), S(b)));
  assert.ok(Math.abs(lv(0.5, 0.6) - lv(0.15, 0.25) + 2) < 0.2, 'the level still drops 2 dB');
});
test('swell pedal: shut, the bass stays about 14 dB louder than the treble (the AO-28’s shut plate)', () => {
  const level = (key, expression) => {
    const e = engine(P({ ...DRY, drawbars: [0, 0, 8, 0, 0, 0, 0, 0, 0], expression }));
    e.noteOn(key);
    const { L } = run(e, 0.4);
    return 20 * Math.log10(rms(L, 9600));
  };
  const bass = level(36, 0) - level(36, 1), treble = level(96, 0) - level(96, 1);
  console.log(`        shut re open: C2 ${bass.toFixed(1)} dB, C7 ${treble.toFixed(1)} dB`);
  assert.ok(bass - treble > 11 && bass - treble < 17 && treble < -35, `C2 ${bass.toFixed(1)}, C7 ${treble.toFixed(1)} dB`);
});
test('the pickup’s waveform: the second harmonic is 2β of the fundamental', () => {
  const h2 = (relief) => {
    const e = engine(P({ ...DRY, drawbars: [0, 0, 8, 0, 0, 0, 0, 0, 0], relief, expression: 1 }));
    e.noteOn(48); // C3 at 8′: wheel 25, a shunt-fed wheel with no filter
    const { L } = run(e, 0.6);
    const f = keyAnalysis(48, e.p)[2].actual;
    const g = (fr) => { let re = 0, im = 0; for (let i = 9600; i < 28800; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - 9600)) / 19199); re += w * L[i] * Math.cos((2 * Math.PI * fr * i) / FS); im += w * L[i] * Math.sin((2 * Math.PI * fr * i) / FS); } return Math.hypot(re, im); };
    return g(2 * f) / g(f);
  };
  const want = M.pickupHarmonics(25, 0.2).h2, got = h2(0.2);
  assert.ok(Math.abs(20 * Math.log10(got / want)) < 1, `H2 ${(20 * Math.log10(got)).toFixed(1)} dB, 2β ${(20 * Math.log10(want)).toFixed(1)} dB`);
  assert.ok(h2(0) < want / 30, 'no relief, a sine');
});
test('process() builds no per-block key lists', () => {
  const e = engine(P());
  for (const k of [48, 55, 60, 64]) e.noteOn(k);
  run(e, 0.05);
  const values = Map.prototype.values, keys = Map.prototype[Symbol.iterator];
  let calls = 0;
  Map.prototype.values = function (...a) { calls++; return values.apply(this, a); };
  Map.prototype[Symbol.iterator] = function (...a) { calls++; return keys.apply(this, a); };
  try { run(e, 0.1); } finally { Map.prototype.values = values; Map.prototype[Symbol.iterator] = keys; }
  assert.equal(calls, 0);
  for (const k of [48, 55, 60, 64]) e.noteOff(k);
  run(e, 0.1);
  assert.equal(e.keyArr.length, 0); assert.equal(e.keys.size, 0);
});
test('stable and finite across extreme settings', () => {
  const cases = [
    P({ drawbars: [8, 8, 8, 8, 8, 8, 8, 8, 8], vib: 'C3', leslie: 'fast', drive: 1, sections: 40, sectionDelay: 15 }),
    P({ drawbars: [8, 8, 8, 8, 8, 8, 8, 8, 8], tuning: 'harmonic', vib: 'V1', loading: 2, percOn: true, crosstalk: -20, leakage: -40, relief: 0.6, drift: 60 }),
    P({ mains: 45, sections: 4, sectionDelay: 150, hornRadius: 0.35, micDist: 0.3, reflections: 0.9, balance: 1 }),
  ];
  for (const c of cases) {
    const e = engine(c);
    for (const k of [36, 48, 55, 60, 64, 67, 72, 84, 96]) e.noteOn(k, 1);
    const { L, R } = run(e, 0.6, (t) => { if (t > 0.3) e.setParams({ motor: false, leslie: 'stop' }); });
    for (let i = 0; i < L.length; i++) assert.ok(Number.isFinite(L[i]) && Math.abs(L[i]) < 20 && Number.isFinite(R[i]));
  }
});

console.log('performance');
test('real-time budget: 10 keys, full drawbars, chorus, drive, Leslie', () => {
  const e = engine(P({ drawbars: [8, 8, 8, 8, 8, 8, 8, 8, 8], vib: 'C3', leslie: 'fast', drive: 0.5, percOn: true }));
  for (const k of [36, 43, 48, 52, 55, 60, 64, 67, 72, 76]) e.noteOn(k);
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
