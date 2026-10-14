// Physics + engine checks. Run: node test/piano-tests.mjs
import assert from 'node:assert/strict';
import { genEig, computeKeyModel, buildVoiceData, keyFreq, BRIDGE_G, sectionProps, MATERIALS, pianoHammer } from '../piano/src/physics.js';
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

test('tapered ribbon: the hammer’s lever is the half-width where it strikes', () => {
  for (const taper of [-0.9, 0.9]) {
    const p = P({ shape: 'ribbon', aspect: 12, taper, offset: 1, unisons: 1 });
    const m = computeKeyModel(60, p, FS), vd = buildVoiceData(m, p);
    const local = m.secAt(m.xh).lever, famT = m.families[2];
    assert.ok(Math.abs(local / m.sec.lever - 1) > 0.3, 'taper should change the width under the hammer');
    const i = vd.famId.indexOf(2);
    assert.ok(rel(vd.w[i], local * famT.phiH[0]) < 1e-12, `w ${vd.w[i]} vs ${local * famT.phiH[0]}`);
  }
});

test('edge-on ribbon: no oscillators for the family the hammer cannot reach', () => {
  const p = P({ shape: 'ribbon', aspect: 12, roll: 90 });
  const vd = buildVoiceData(computeKeyModel(60, p, FS), p);
  assert.ok(!vd.famId.includes(0), 'easy-axis family should be dropped');
  let wmax = 0;
  for (let i = 0; i < vd.n; i++) wmax = Math.max(wmax, Math.abs(vd.w[i]));
  for (let i = 0; i < vd.n; i++) if (vd.idx[i] === 0) assert.ok(Math.abs(vd.w[i]) > 1e-3 * wmax, `mode ${i} has weight ${vd.w[i]}`);
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

// Hann-windowed Goertzel magnitude² of x at frequency f
function goertzel(x, f, a = 0, b = x.length) {
  const w = (2 * Math.PI * f) / FS, N = b - a;
  let re = 0, im = 0;
  for (let i = 0; i < N; i++) {
    const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    re += h * x[a + i] * Math.cos(w * i);
    im -= h * x[a + i] * Math.sin(w * i);
  }
  return re * re + im * im;
}
// spectral peak near f: coarse scan ±3 %, then golden-section refinement
function peakFreqNear(x, f) {
  let best = 0, bestF = f;
  const step = f * 0.0005;
  for (let ff = f * 0.97; ff <= f * 1.03; ff += step) {
    const g = goertzel(x, ff);
    if (g > best) { best = g; bestF = ff; }
  }
  let lo = bestF - step, hi = bestF + step;
  const gr = (Math.sqrt(5) - 1) / 2;
  while (hi - lo > f * 1e-7) {
    const a = hi - gr * (hi - lo), b = lo + gr * (hi - lo);
    if (goertzel(x, a) > goertzel(x, b)) hi = b; else lo = a;
  }
  return 0.5 * (lo + hi);
}
const cents = (a, b) => 1200 * Math.log2(a / b);

test('C4 strike: finite, plausible contact time, in tune', () => {
  const r = render(60, P(), 1.5);
  let pk = 0;
  for (const s of r.L) { assert.ok(Number.isFinite(s)); pk = Math.max(pk, Math.abs(s)); }
  assert.ok(pk > 1e-3 && pk < 5, `peak ${pk}`);
  assert.ok(r.contactMs > 0.5 && r.contactMs < 6, `contact ${r.contactMs} ms`);
  // two unison strings tuned ±0.4 ¢: the heard pitch lies between them
  const c2 = cents(peakFreqNear(r.L.subarray(4800, 4800 + 32768), keyFreq(60)), keyFreq(60));
  assert.ok(Math.abs(c2) < 0.4, `${c2} ¢`);
  // one string: the engine reproduces the model's tuning to a few hundredths of a cent
  const one = render(60, P({ unisons: 1 }), 1.5);
  const c1 = cents(peakFreqNear(one.L.subarray(4800, 4800 + 32768), keyFreq(60)), keyFreq(60));
  assert.ok(Math.abs(c1) < 0.05, `${c1} ¢`);
  console.log(`        peak ${pk.toFixed(3)}, contact ${r.contactMs.toFixed(2)} ms, Fmax ${r.v.Fmax.toFixed(1)} N, modes ${r.vd.n}; pitch ${c2.toFixed(3)} ¢ (one string ${c1.toFixed(3)} ¢)`);
});

test('bridge losses: measured decay of partials n = 1…30 is G(T + EIk²)/L', () => {
  // one string, internal losses off: every partial decays only into the bridge
  const p = P({ unisons: 1, lossLow: 1e-6, lossHigh: 1e-6, bridge: 2 });
  const r = render(60, p, 2.6);
  const E = MATERIALS.steel.E, I = r.m.sec.I1, W = Math.round(0.2 * FS), t1 = Math.round(0.3 * FS), t2 = Math.round(2.3 * FS);
  const rows = [];
  for (const n of [1, 5, 20, 30]) {
    const f = r.vd.freq[n - 1], kk = (n * Math.PI) / r.m.L;
    const expect = (BRIDGE_G * 2 * (r.m.T + E * I * kk * kk)) / r.m.L;
    const sigma = Math.log(goertzel(r.L, f, t1, t1 + W) / goertzel(r.L, f, t2, t2 + W)) / (2 * 2.0);
    assert.ok(rel(sigma, expect) < 0.01, `n=${n} (${f.toFixed(0)} Hz): σ ${sigma.toFixed(4)} vs ${expect.toFixed(4)}`);
    rows.push(`n=${n} ${(100 * (sigma / expect - 1)).toFixed(2)} %`);
  }
  console.log(`        σ measured vs closed form: ${rows.join(', ')}`);
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

test('voice stealing never takes a chord that has just been struck', () => {
  const eng = new PianoEngine(FS);
  eng.setParams({ maxModes: 1500 });
  eng.setSustain(true);
  const vd = (k) => buildVoiceData(computeKeyModel(k, P(), FS), P(), 1);
  const bl = 128, L = new Float32Array(bl), R = new Float32Array(bl);
  for (let k = 60; k <= 100 && eng.modeCount() + 60 < 1500; k++) { eng.noteOn(k, vd(k), 2.5); for (let i = 0; i < 10; i++) eng.process(L, R, bl); }
  const chord = [48, 52, 55, 59].map((k) => eng.noteOn(k, vd(k), 2.5)); // one block, unheard yet
  assert.ok(chord.every((v) => !v.killing), `killed: ${chord.filter((v) => v.killing).map((v) => v.key)}`);
  let live = 0;
  for (const v of eng.voices) if (!v.killing) live += v.N;
  assert.ok(live <= 1500, `${live} oscillators over the budget`);
});

test('live gains and stereo spread glide: no zipper click', () => {
  // ratio of the strongest 3rd-difference spike near the change to its RMS before it
  const click = (change) => {
    const p = P(), eng = new PianoEngine(FS), vdat = buildVoiceData(computeKeyModel(48, p, FS), p, 1);
    eng.noteOn(48, vdat, 2.5);
    const n = FS, x = new Float64Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
    for (let s = 0; s < n; s += bl) { if (s === 24064) change(eng); eng.process(bL, bR, bl); for (let i = 0; i < bl; i++) x[s + i] = bL[i]; }
    const d3 = (i) => x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3];
    let pk = 0, e = 0, c = 0;
    for (let i = 24064 - 192; i < 24064 + 192; i++) pk = Math.max(pk, Math.abs(d3(i)));
    for (let i = 24064 - 2300; i < 24064 - 400; i++) { e += d3(i) ** 2; c++; }
    return pk / Math.sqrt(e / c);
  };
  for (const [name, ch] of [['gainV 1 → 0.2', { gainV: 0.2 }], ['spread 0.6 → 0', { width: 0 }], ['gainH 0.35 → 1.5', { gainH: 1.5 }]]) {
    const r = click((e) => e.setParams(ch));
    assert.ok(r < 8, `${name}: spike ${r.toFixed(1)}× the background`);
  }
});

test('treble balance: C6–C8 within 8 dB of C4 at a medium blow, contact under 1 ms at the top', () => {
  const vel = 0.25 * 24 ** (64 / 127); // MIDI velocity 64 → 1.24 m/s
  const level = (key) => {
    const r = render(key, P(), 0.2, vel);
    let e = 0;
    for (let i = 0; i < r.L.length; i++) e += r.L[i] ** 2 + r.R[i] ** 2; // both channels: pan-independent
    return { db: 10 * Math.log10(e), ms: r.contactMs };
  };
  const ref = level(60).db;
  let worst = 0, wk = 0;
  for (let k = 84; k <= 108; k++) { const d = level(k).db - ref; if (d < worst) { worst = d; wk = k; } }
  assert.ok(worst > -8, `key ${wk}: ${worst.toFixed(1)} dB`);
  const c7 = level(96).ms, c8 = level(108).ms;
  assert.ok(c7 < 1 && c8 < 0.6 && c8 < c7, `contact C7 ${c7.toFixed(2)} ms, C8 ${c8.toFixed(2)} ms`);
  const hd = pianoHammer(108), h7 = pianoHammer(96);
  assert.ok(hd.p === h7.p && hd.mass <= h7.mass, 'no extrapolation of the felt beyond C7');
  console.log(`        quietest key above C6: ${worst.toFixed(1)} dB re C4 (key ${wk}); contact C7 ${c7.toFixed(2)} ms, C8 ${c8.toFixed(2)} ms`);
});

test('una corda: the missed string is driven through the bridge, and the aftersound grows', () => {
  const db = (x, a, b) => { let e = 0; for (let i = a; i < b; i++) e += x[i] * x[i]; return 10 * Math.log10(e / (b - a)); };
  const run = (una) => {
    const p = P({ unisons: 3, unisonDetune: 1, maxFreq: 1500 });
    const vdat = buildVoiceData(computeKeyModel(48, p, FS), p, 1);
    const eng = new PianoEngine(FS);
    eng.setParams({ unaCorda: una });
    const v = eng.noteOn(48, vdat, 2.5);
    const n = 4 * FS, x = new Float64Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
    let missed = 0, hit = 0;
    for (let s = 0; s < n; s += bl) {
      eng.process(bL, bR, bl);
      for (let i = 0; i < bl; i++) x[s + i] = bL[i] + bR[i];
      if (s === 128 * 20) { // 53 ms: largest modal amplitude on the missed string vs a struck one
        for (let i = 0; i < v.N; i++) {
          const u = vdat.uni[v.perm[i]], a = Math.abs(v.q[i]);
          if (u === 2) missed = Math.max(missed, a); else if (u === 0) hit = Math.max(hit, a);
        }
      }
    }
    return { early: db(x, 0.05 * FS, 0.3 * FS), late: db(x, 3 * FS, 4 * FS), missed, hit };
  };
  const normal = run(false), soft = run(true);
  assert.ok(soft.missed > 0 && soft.missed < 0.2 * soft.hit, `missed string ${soft.missed} vs struck ${soft.hit}`);
  assert.ok(normal.missed > 0.5 * normal.hit, 'without the pedal all three strings are struck');
  assert.ok(soft.early < normal.early, 'una corda is softer');
  assert.ok(soft.late - soft.early > normal.late - normal.early + 2, `aftersound: normal ${(normal.late - normal.early).toFixed(1)} dB, una corda ${(soft.late - soft.early).toFixed(1)} dB`);
  console.log(`        level 3–4 s after the strike re the attack: ${(normal.late - normal.early).toFixed(1)} dB → ${(soft.late - soft.early).toFixed(1)} dB with una corda`);
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
