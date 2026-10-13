// Physics + engine checks. Run: node test/piano-tests.mjs
import assert from 'node:assert/strict';
import { genEig, computeKeyModel, buildVoiceData, keyFreq, BRIDGE_G, sectionProps, MATERIALS } from '../piano/src/physics.js';
import { PianoEngine } from '../piano/src/engine.js';
import { DEFAULTS } from '../piano/src/params.js';

const FS = 48000;
let failures = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ', name); }
  catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

console.log('linear algebra');
test('generalized eigenproblem residual', () => {
  const n = 60;
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const A = new Float64Array(n * n), Bm = new Float64Array(n * n);
  const G1 = Array.from({ length: n * n }, rnd), G2 = Array.from({ length: n * n }, rnd);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let a = 0, b = 0;
    for (let k = 0; k < n; k++) { a += G1[i * n + k] * G1[j * n + k]; b += G2[i * n + k] * G2[j * n + k]; }
    A[i * n + j] = a; Bm[i * n + j] = b + (i === j ? n : 0);
  }
  const { lambda, X } = genEig(A, Bm, n);
  let worst = 0;
  for (let c = 0; c < n; c++) for (let i = 0; i < n; i++) {
    let kx = 0, mx = 0;
    for (let j = 0; j < n; j++) { kx += A[i * n + j] * X[j * n + c]; mx += Bm[i * n + j] * X[j * n + c]; }
    worst = Math.max(worst, Math.abs(kx - lambda[c] * mx));
  }
  for (let c = 1; c < n; c++) assert.ok(lambda[c] >= lambda[c - 1]);
  assert.ok(worst < 1e-9, `residual ${worst}`);
});

console.log('string physics');
test('C4 steel wire: tuned, B ≈ 4e-4, tension ≈ 700 N', () => {
  const m = computeKeyModel(60, P(), FS);
  assert.ok(rel(m.info.f1, keyFreq(60)) < 1e-9);
  assert.ok(m.info.B1 > 3e-4 && m.info.B1 < 6e-4, `B=${m.info.B1}`);
  assert.ok(m.T > 600 && m.T < 800, `T=${m.T}`);
  assert.ok(m.info.strengthRatio < 0.6);
});

test('square / triangle are isotropic; ribbon is not', () => {
  for (const shape of ['round', 'square', 'triangle']) {
    const s = sectionProps(shape, 1e-6, 1);
    assert.ok(rel(s.I1, s.I2) < 1e-12, shape);
  }
  const r = sectionProps('ribbon', 1e-6, 12);
  assert.ok(r.I2 / r.I1 > 140 && r.I2 / r.I1 < 150);
  // equal-area bending stiffness relative to round: square 4π/12, triangle 2π/(3√3)
  const c = sectionProps('round', 1e-6).I1;
  assert.ok(rel(sectionProps('square', 1e-6).I1 / c, (4 * Math.PI) / 12) < 1e-9);
  assert.ok(rel(sectionProps('triangle', 1e-6).I1 / c, (2 * Math.PI) / (3 * Math.sqrt(3))) < 1e-9);
});

test('torsion: c_θ² = GJ/(ρIp) + c_T²', () => {
  const m = computeKeyModel(60, P({ shape: 'ribbon', aspect: 20 }), FS);
  const s = m.sec, mat = MATERIALS.steel;
  const cT2 = m.T / (mat.rho * s.A);
  const expect = Math.sqrt(1 + (mat.G * s.J) / (mat.rho * s.Ip) / cT2);
  // fam1 includes a tiny stiffness term, so compare against its string-only value
  const ratio = m.info.cTheta / Math.sqrt(cT2);
  assert.ok(rel(ratio, expect) < 1e-9);
  assert.ok(m.info.torsionRatio > 1 && m.info.torsionRatio < 2.5, `ratio ${m.info.torsionRatio}`);
});

for (const shape of ['round', 'ribbon']) {
  test(`Ritz (taper→0) matches closed form: ${shape}`, () => {
    const base = P({ shape, aspect: 10, offset: 0.5, roll: 30 });
    const a = computeKeyModel(48, base, FS);
    const b = computeKeyModel(48, { ...base, taper: 2e-4 }, FS);
    for (let f = 0; f < 3; f++) {
      const fa = a.families[f], fb = b.families[f];
      const nn = Math.min(30, fa.n, fb.n);
      for (let n = 0; n < nn; n++) {
        assert.ok(rel(fb.omega[n], fa.omega[n]) < 2e-4, `fam${f} ω[${n}] ${fb.omega[n]} vs ${fa.omega[n]}`);
        const scale = Math.max(...fa.phiH.slice(0, nn).map(Math.abs));
        assert.ok(Math.abs(Math.abs(fb.phiH[n]) - Math.abs(fa.phiH[n])) < 2e-3 * scale, `fam${f} φh[${n}]`);
        if (n < 15) assert.ok(rel(Math.abs(fb.bridge[n]), Math.abs(fa.bridge[n])) < 2e-2, `fam${f} bridge[${n}] ${fb.bridge[n]} vs ${fa.bridge[n]}`);
      }
    }
  });
}

test('tapered ("triangular") ribbon stays in tune, partials go inharmonic', () => {
  for (const key of [33, 60, 90]) {
    const m = computeKeyModel(key, P({ shape: 'ribbon', aspect: 12, taper: 0.9 }), FS);
    assert.ok(m.info.tuned);
    assert.ok(rel(m.info.f1, keyFreq(key)) < 1e-6, `key ${key}: f1=${m.info.f1}`);
  }
  const m = computeKeyModel(48, P({ shape: 'ribbon', aspect: 12, taper: 0.9 }), FS);
  const r2 = m.families[0].omega[1] / m.families[0].omega[0];
  assert.ok(Math.abs(r2 - 2) > 0.01, `f2/f1 = ${r2}`);
});

test('bridge damping σ = G(T + EIk²)/L', () => {
  const m = computeKeyModel(60, P({ bridge: 1 }), FS);
  const vd = buildVoiceData(m, P({ bridge: 1, unisons: 1 }));
  const E = MATERIALS.steel.E, I = m.sec.I1;
  for (const n of [1, 5, 20]) {
    const kk = (n * Math.PI) / m.L;
    const expect = (BRIDGE_G * (m.T + E * I * kk * kk)) / m.L;
    assert.ok(rel(vd.cv[n - 1] ** 2 / 2, expect) < 1e-9);
  }
});

console.log('engine');
function render(key, params, seconds, vel = 2.5) {
  const m = computeKeyModel(key, params, FS);
  const vd = buildVoiceData(m, params, 1);
  const eng = new PianoEngine(FS);
  const n = Math.round(seconds * FS), L = new Float32Array(n), R = new Float32Array(n);
  const bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const v = eng.noteOn(key, vd, vel);
  let contactMs = null;
  for (let s = 0; s < n; s += bl) {
    eng.process(bL, bR, bl);
    L.set(bL.subarray(0, Math.min(bl, n - s)), s);
    R.set(bR.subarray(0, Math.min(bl, n - s)), s);
    if (contactMs === null && !v.hammerOn) contactMs = (v.contactSamples / FS) * 1000;
  }
  return { L, R, v, m, vd, contactMs, eng };
}

function peakFreqNear(x, f, fs) {
  // Goertzel scan ±3 % around f, Hann windowed
  const N = x.length;
  let best = 0, bestF = f;
  for (let ff = f * 0.97; ff <= f * 1.03; ff += f * 0.0002) {
    const w = (2 * Math.PI * ff) / fs;
    let re = 0, im = 0;
    for (let i = 0; i < N; i++) {
      const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      re += h * x[i] * Math.cos(w * i);
      im -= h * x[i] * Math.sin(w * i);
    }
    const mag = re * re + im * im;
    if (mag > best) { best = mag; bestF = ff; }
  }
  return bestF;
}

test('C4 strike: finite, plausible contact time and pitch', () => {
  const r = render(60, P(), 1.5);
  let pk = 0;
  for (const s of r.L) { assert.ok(Number.isFinite(s)); pk = Math.max(pk, Math.abs(s)); }
  assert.ok(pk > 1e-3 && pk < 5, `peak ${pk}`);
  assert.ok(r.contactMs > 0.5 && r.contactMs < 6, `contact ${r.contactMs} ms`);
  const f = peakFreqNear(r.L.subarray(4800, 4800 + 32768), keyFreq(60), FS);
  assert.ok(rel(f, keyFreq(60)) < 0.002, `f=${f}`);
  console.log(`        peak ${pk.toFixed(3)}, contact ${r.contactMs.toFixed(2)} ms, Fmax ${r.v.Fmax.toFixed(1)} N, modes ${r.vd.n}`);
});

test('bridge coupling gives double decay with detuned unisons', () => {
  // two in-tune unisons: symmetric mode decays at 2× bridge rate; with no
  // detune the antisymmetric mode is never excited → single fast decay.
  const db = (x, a, b) => { let e = 0; for (let i = a; i < b; i++) e += x[i] * x[i]; return 10 * Math.log10(e / (b - a)); };
  const base = P({ unisons: 2, lossLow: 0.01, lossHigh: 0.01, maxFreq: 600, bridge: 3 });
  const tight = render(48, { ...base, unisonDetune: 0 }, 6);
  const loose = render(48, { ...base, unisonDetune: 2 }, 6);
  const late = (r) => db(r.L, 5 * FS, 6 * FS) - db(r.L, 0.2 * FS, 1.2 * FS);
  assert.ok(late(loose) > late(tight) + 3, `tight ${late(tight).toFixed(1)} dB, detuned ${late(loose).toFixed(1)} dB`);
  console.log(`        level after 5 s: in tune ${late(tight).toFixed(1)} dB, detuned ${late(loose).toFixed(1)} dB`);
});

test('off-centre strike on a ribbon excites torsion; centred does not', () => {
  const centred = buildVoiceData(computeKeyModel(60, P({ shape: 'ribbon' }), FS), P({ shape: 'ribbon' }));
  const off = P({ shape: 'ribbon', offset: 0.7 });
  const offd = buildVoiceData(computeKeyModel(60, off, FS), off);
  assert.ok(!centred.famId.includes(2));
  assert.ok(offd.famId.includes(2));
  const r = render(60, off, 0.3);
  for (const s of r.L) assert.ok(Number.isFinite(s));
});

test('every preset-ish extreme stays stable', () => {
  const cases = [
    P({ shape: 'ribbon', aspect: 60, roll: 45, offset: 1, taper: 0.95, unisons: 3 }),
    P({ shape: 'triangle', hardness: 10, feltExp: 1, hammerMass: 4 }),
    P({ material: 'nylon', gauge: 2.5 }),
    P({ material: 'carbon', shape: 'ribbon', aspect: 30, offset: -1 }),
    P({ hysteresis: 4e-4, hardness: 0.1, hammerWidth: 3 }),
    P({ bridge: 10, bridgeH: 1, roll: 20, unisons: 3 }),
  ];
  for (const c of cases) for (const key of [21, 60, 108]) {
    const r = render(key, c, 0.25, 6);
    for (const s of r.L) assert.ok(Number.isFinite(s) && Math.abs(s) < 50, `key ${key} ${JSON.stringify(c).slice(0, 80)}`);
  }
});

console.log('performance');
test('real-time budget', () => {
  const eng = new PianoEngine(FS);
  const params = P({ unisons: 2 });
  let modes = 0;
  for (const key of [36, 43, 48, 52, 55, 60, 64, 67, 72, 76]) {
    const vd = buildVoiceData(computeKeyModel(key, params, FS), params, 1);
    eng.noteOn(key, vd, 2.5);
    modes += vd.n;
  }
  const bl = 128, L = new Float32Array(bl), R = new Float32Array(bl);
  for (let i = 0; i < 200; i++) eng.process(L, R, bl); // warm up + hammers done
  const blocks = 2000, t0 = performance.now();
  for (let i = 0; i < blocks; i++) eng.process(L, R, bl);
  const ms = performance.now() - t0, audioMs = (blocks * bl * 1000) / FS;
  const nsPerMode = (ms * 1e6) / (blocks * bl * modes);
  console.log(`        10 notes, ${modes} oscillators: ${(100 * ms / audioMs).toFixed(1)} % of one core, ${nsPerMode.toFixed(2)} ns per mode-sample`);
  assert.ok(ms < audioMs * 0.6);
});

test('model computation time (taper uses Ritz)', () => {
  const t0 = performance.now();
  for (let key = 21; key <= 108; key++) computeKeyModel(key, P(), FS);
  const t1 = performance.now();
  for (const key of [21, 33, 45, 60, 84]) computeKeyModel(key, P({ shape: 'ribbon', taper: 0.8, offset: 0.5 }), FS);
  const t2 = performance.now();
  console.log(`        uniform: all 88 keys ${(t1 - t0).toFixed(1)} ms; tapered: 5 keys ${(t2 - t1).toFixed(1)} ms`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
