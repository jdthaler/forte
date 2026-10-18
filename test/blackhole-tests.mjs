// Black-hole keyboard checks. Run: node test/blackhole-tests.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solveQNM, trackQNM, separationConstant, SCHWARZSCHILD, C } from '../blackhole/src/qnm.js';
import { INSTRUMENT } from '../blackhole/src/blackhole-instrument.js';
import { wasmModel } from '../blackhole/src/blackhole-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { DEFAULTS, uFromSpin } from '../blackhole/src/ringdown-params.js';
import { header as tableHeader, headerFile } from '../tools/blackhole-native-table.mjs';

const RingdownEngine = await loadEngine(INSTRUMENT);
// the model the views call, in the same C++: the QNM bank (the table, interpolated), a key's voice
// and its strain in closed form
const { bank, swsh, strainCurve, keyVoice } = await wasmModel();
const MSUN_S = 4.925490947e-6;                            // G M☉ / c³ in seconds
const keyFreq = (m) => 440 * 2 ** ((m - 69) / 12);

let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const close = (z, re, im, tol) => Math.abs(z.re - re) < tol && Math.abs(z.im - im) < tol;
const table = JSON.parse(readFileSync(new URL('../blackhole/data/qnm-table.json', import.meta.url)));

console.log('Leaver continued fractions');
test('Schwarzschild modes l = 2–4, n = 0–2 match the literature to 1e-6', () => {
  for (const l of [2, 3, 4]) for (let n = 0; n <= 2; n++) {
    const g = SCHWARZSCHILD[l][n];
    const r = solveQNM({ l, m: 1, n, a: 0, guess: C.cx(g.re * 1.03, g.im * 0.96) });
    assert.ok(close(r.omega, g.re, g.im, 1.5e-6), `(${l},${n}) ${r.omega.re} ${r.omega.im}`);
  }
});
test('Kerr (2,2,0): a = 0.9 → 0.671613 − 0.064869i (Berti et al.)', () => {
  const tr = trackQNM(2, 2, 0, [0, 0.3, 0.6, 0.8, 0.9]);
  assert.ok(close(tr[4].omega, 0.671613, -0.064869, 2e-6), JSON.stringify(tr[4].omega));
});
test('spheroidal eigenvalue: dA/dc at c = 0 equals −2s²m/(l(l+1))', () => {
  for (const [l, m] of [[2, 2], [3, 2], [4, -3]]) {
    const A = separationConstant(C.cx(1e-5), l, m, -2);
    const slope = (A.re - (l * (l + 1) - 2)) / 1e-5, expect = (-2 * 4 * m) / (l * (l + 1));
    assert.ok(Math.abs(slope - expect) < 1e-3, `(${l},${m}) ${slope} vs ${expect}`);
  }
});
test('near extremality the l = m modes approach Hod: ω → mΩ_H − 2πiT_H(n + ½)', () => {
  const spins = [0, 0.5, 0.8, 0.9, 0.95, 0.99, 0.995, 0.999, 0.9995, 0.9999, 0.99995, 0.99999, 0.999995, 0.999999];
  for (const [l, n] of [[2, 0], [3, 0], [2, 1]]) {
    const p = trackQNM(l, l, n, spins).at(-1), a = p.a;
    const rp = 1 + Math.sqrt(1 - a * a), OmH = a / (2 * rp), kT = Math.sqrt(1 - a * a) / (2 * rp);
    assert.ok(Math.abs(p.omega.re / (l * OmH) - 1) < 2e-4, `(${l},${l},${n}) re`);
    assert.ok(Math.abs(-p.omega.im / (kT * (n + 0.5)) - 1) < 2e-3, `(${l},${l},${n}) im`);
  }
});
test('continued-fraction depth is converged (N vs 2N) at a = 1 − 10⁻⁵, overtone 2', () => {
  const a = 1 - 1e-5, w = bank.omega(2, 2, 2, a);
  const r1 = solveQNM({ l: 2, m: 2, n: 2, a, guess: C.cx(w.re, w.im) });
  const r2 = solveQNM({ l: 2, m: 2, n: 2, a, guess: C.cx(w.re, w.im), N: 2 * r1.depth });
  assert.ok(C.abs(C.sub(r1.omega, r2.omega)) < 1e-9);
});

test('counter-rotating (m < 0) modes and overtones match Berti, Cardoso & Will (2006), Table II', () => {
  // [l, m, n, a, Re Mω, −Im Mω], quoted to 4 digits
  const ref = [
    [2, -2, 0, 0.5, 0.3243, 0.0890], [2, -1, 0, 0.5, 0.3515, 0.0881], [2, -2, 0, 0.9, 0.2972, 0.0883],
    [2, -2, 0, 0.98, 0.2927, 0.0881], [2, -1, 0, 0.98, 0.3439, 0.0837], [2, -2, 1, 0.98, 0.2515, 0.2768],
    [2, -2, 2, 0.98, 0.1858, 0.5051], [2, -1, 2, 0.98, 0.2686, 0.4527], [3, -3, 0, 0.9, 0.4735, 0.0913],
    [3, -2, 0, 0.98, 0.5146, 0.0894], [4, -4, 0, 0.98, 0.6235, 0.0919], [2, 1, 0, 0.98, 0.5642, 0.0516],
  ];
  for (const [l, m, n, a, re, im] of ref) {
    const w = bank.omega(l, m, n, a);
    assert.ok(Math.abs(w.re - re) < 6e-5 && Math.abs(-w.im - im) < 6e-5, `(${l},${m},${n}) a=${a}: ${w.re.toFixed(5)} ${w.im.toFixed(5)}`);
  }
});
test('separation constants match Berti, Cardoso & Will (2006), Table V', () => {
  for (const [m, re, im] of [[2, 2.1098, 0.2111], [-2, 4.6662, -0.1816]]) {
    const p = trackQNM(2, m, 0, [0, 0.3, 0.6, 0.8, 0.9]).at(-1);
    assert.ok(Math.abs(p.A.re - re) < 6e-5 && Math.abs(p.A.im - im) < 6e-5, `m=${m}: ${p.A.re} ${p.A.im}`);
  }
});
test('counter-rotating overtones are converged near extremality too (N vs 2N at a = 1 − 10⁻⁶)', () => {
  const a = 1 - 1e-6;
  for (const [l, m, n] of [[2, -2, 2], [2, -1, 2]]) {
    const w = bank.omega(l, m, n, a);
    const r1 = solveQNM({ l, m, n, a, guess: C.cx(w.re, w.im) });
    const r2 = solveQNM({ l, m, n, a, guess: r1.omega, N: 2 * r1.depth });
    assert.ok(C.abs(C.sub(r1.omega, r2.omega)) < 1e-7 && C.abs(C.sub(r1.omega, C.cx(w.re, w.im))) < 1e-6, `(${l},${m},${n})`);
  }
});

console.log('table and harmonics');
test('table interpolation matches fresh solves (< 0.02 ¢)', () => {
  for (const [l, m, n, a] of [[2, 2, 0, 0.42], [4, 4, 1, 0.97], [2, -2, 0, 0.88], [3, 2, 0, 0.99993], [2, 2, 2, 0.8817823], [2, 1, 2, 0.888197]]) {
    const w = bank.omega(l, m, n, a), ex = solveQNM({ l, m, n, a, guess: C.cx(w.re, w.im) }).omega;
    assert.ok(Math.abs(1200 * Math.log2(w.re / ex.re)) < 0.02 && Math.abs(w.im / ex.im - 1) < 1e-4, `(${l},${m},${n}) a=${a}`);
  }
});
test('interpolation is as good in the end intervals of the table (a → 0 and a → 1 − 10⁻⁶)', () => {
  const U = bank.u, ends = [];
  for (const f of [0.25, 0.5, 0.75]) {
    ends.push(1 - 10 ** -(f * U[1]));
    ends.push(1 - 10 ** -(U.at(-2) + f * (U.at(-1) - U.at(-2))));
  }
  for (const [l, m, n] of [[2, 2, 0], [2, 2, 2], [3, 3, 0], [2, 1, 0], [2, -2, 0], [4, 4, 0]]) for (const a of ends) {
    const w = bank.omega(l, m, n, a), ex = solveQNM({ l, m, n, a, guess: C.cx(w.re, w.im) }).omega;
    const dc = 1200 * Math.log2(w.re / ex.re), dg = w.im / ex.im - 1;
    assert.ok(Math.abs(dc) < 0.01 && Math.abs(dg) < 1e-4, `(${l},${m},${n}) a=${a}: ${dc.toFixed(4)} ¢, damping ${(100 * dg).toFixed(4)} %`);
  }
});
test('l = m modes become a harmonic series 2 : 3 : 4 as a → 1', () => {
  const a = 1 - 1e-6, f2 = bank.omega(2, 2, 0, a).re;
  assert.ok(Math.abs(bank.omega(3, 3, 0, a).re / f2 - 1.5) < 1e-3 && Math.abs(bank.omega(4, 4, 0, a).re / f2 - 2) < 1e-3);
});
test('spin-weighted spherical harmonics: closed forms and unit norm', () => {
  const th = 0.7;
  assert.ok(Math.abs(swsh(-2, 2, 2, th) - Math.sqrt(5 / (64 * Math.PI)) * (1 + Math.cos(th)) ** 2) < 1e-12);
  assert.ok(Math.abs(swsh(-2, 2, 0, th) - Math.sqrt(15 / (32 * Math.PI)) * Math.sin(th) ** 2) < 1e-12);
  for (const [l, m] of [[3, 1], [4, -4], [4, 2]]) {
    let s = 0;
    for (let i = 0; i < 2000; i++) { const t = (Math.PI * (i + 0.5)) / 2000; s += swsh(-2, l, m, t) ** 2 * Math.sin(t) * (Math.PI / 2000) * 2 * Math.PI; }
    assert.ok(Math.abs(s - 1) < 1e-5, `(${l},${m}) norm ${s}`);
  }
});

test('the native port\'s copy of the table (native/instruments/blackhole/qnm-table.h) is this one, converted number for number', () => {
  assert.ok(readFileSync(headerFile, 'utf8') === tableHeader(), 'stale: run node tools/blackhole-native-table.mjs');
});

console.log('merger excitation and sound');
test('mode amplitudes follow the NR fits (Gossan et al. 2012, Eqs. 5–8): equal masses switch off odd-m modes, lopsided mergers switch them on', () => {
  for (const q of [1, 1.2, 3, 8, 20]) {
    const nu = q / (1 + q) ** 2, d = Math.max(0, 1 - 4 * nu), A22 = 0.864 * nu;
    const fit = { '2,2': A22, '2,1': 0.52 * d ** 0.71 * A22, '3,3': 0.44 * d ** 0.45 * A22, '4,4': (5.4 * (nu - 0.22) ** 2 + 0.04) * A22 };
    const modes = keyVoice(60, { ...DEFAULTS, massRatio: q }, 48000).modes.filter((m) => m.n === 0);
    for (const [lm, A] of Object.entries(fit)) {
      const md = modes.find((m) => `${m.l},${m.m}` === lm);
      if (A === 0) assert.ok(!md, `q = ${q}: (${lm},0) should be silent`);
      else assert.ok(md && Math.abs(md.amp / A - 1) < 1e-12, `q = ${q}: (${lm},0) amplitude ${md?.amp} vs ${A}`);
    }
    assert.equal(modes.length, Object.values(fit).filter((A) => A > 0).length, `q = ${q}: no other fundamentals (no counter-rotating ones by default)`);
    if (q === 8) assert.ok(fit['3,3'] > 0.2 * fit['2,2']);
  }
});
test('face-on: circular polarisation (C₊ = C×); edge-on: h× vanishes for (2,2)', () => {
  const v0 = keyVoice(60, { ...DEFAULTS, inclination: 0 }, 48000).modes.find((m) => m.l === 2 && m.m === 2 && m.n === 0);
  assert.ok(Math.abs(v0.cpr - v0.cxr) < 1e-12 && Math.abs(v0.cpi - v0.cxi) < 1e-12);
  const v90 = keyVoice(60, { ...DEFAULTS, inclination: 90, massRatio: 1 }, 48000).modes.find((m) => m.l === 2 && m.m === 2 && m.n === 0);
  assert.ok(Math.hypot(v90.cxr, v90.cxi) < 1e-12 * Math.hypot(v90.cpr, v90.cpi) + 1e-15);
});
test('each key is tuned on its (2,2,0) mode; rendered pitch and decay match', () => {
  const P = { ...DEFAULTS, spinU: uFromSpin(0.999), massRatio: 1, overtones: 0, inclination: 0 };
  const v = keyVoice(57, P, 48000);
  const m220 = v.modes.find((m) => m.l === 2 && m.m === 2 && m.n === 0);
  assert.ok(Math.abs(m220.f / keyFreq(57) - 1) < 1e-9);
  v.modes = [m220];
  const e = new RingdownEngine(48000); e.noteOn(v.key, 1, v);
  const n = 48000 * 0.3, L = new Float32Array(n), R = new Float32Array(n), bL = new Float32Array(128), bR = new Float32Array(128);
  for (let s = 0; s < n; s += 128) { e.process(bL, bR, 128); L.set(bL.subarray(0, Math.min(128, n - s)), s); }
  const zc = []; for (let i = 1; i < n; i++) if (L[i - 1] < 0 && L[i] >= 0) zc.push(i - 1 + L[i - 1] / (L[i - 1] - L[i]));
  const f = (48000 * (zc.length - 1)) / (zc.at(-1) - zc[0]);
  assert.ok(Math.abs(f / m220.f - 1) < 1e-4, `f ${f}`);
  const rms = (a, b) => Math.sqrt(L.slice(a, b).reduce((s, x) => s + x * x, 0) / (b - a));
  const gamma = Math.log(rms(2400, 4800) / rms(9600, 12000)) / 0.15;
  assert.ok(Math.abs(gamma / m220.gamma - 1) < 0.02, `γ ${gamma} vs ${m220.gamma}`);
});
test('inspiral chirps up and hands over to the ringdown', () => {
  const v = keyVoice(57, { ...DEFAULTS, inspiral: true, inspiralOct: 2 }, 48000);
  const e = new RingdownEngine(48000); e.noteOn(v.key, 1, v);
  const L = new Float32Array(128), R = new Float32Array(128);
  let fPrev = 0, mono = true, ringAt = null;
  for (let s = 0; s < 48000 * 3 && !ringAt; s += 128) {
    e.process(L, R, 128);
    const c = e.voices[0].chirp;
    if (c.stage < 3) { if (c.f < fPrev - 1e-9) mono = false; fPrev = c.f; }
    if (e.voices[0].ring) ringAt = s;
  }
  assert.ok(mono && ringAt > 0);
});
test('the strain is continuous through the handover: no notch at the merger', () => {
  // face-on, |h| = √(h₊² + h×²) is the envelope; it must follow the ringdown's, |Σ C ζ(t)|
  for (const [key, spinU, overtones] of [[45, DEFAULTS.spinU, 1], [69, DEFAULTS.spinU, 0], [57, 3, 1], [81, 3, 0]]) {
    const v = keyVoice(key, { ...DEFAULTS, inspiral: true, inspiralOct: 1.5, inclination: 0, spinU, overtones }, 48000);
    const e = new RingdownEngine(48000); e.noteOn(v.key, 1, v);
    const L = new Float32Array(1), R = new Float32Array(1), h = [];
    let at = -1;
    for (let s = 0; s < 48000 * 3 && (at < 0 || s < at + 2000); s++) { e.process(L, R, 1); h.push(Math.hypot(L[0], R[0])); if (at < 0 && e.voices[0].ring) at = s; }
    const per = 48000 / keyFreq(key);
    for (let i = 0; i < per; i++) {
      const t = i / 48000;
      let sr = 0, si = 0;
      for (const md of v.modes) { const g = Math.exp(-md.gamma * t), th = 2 * Math.PI * md.f * t; sr += g * (md.cpr * Math.cos(th) + md.cpi * Math.sin(th)); si += g * (md.cpi * Math.cos(th) - md.cpr * Math.sin(th)); }
      const ratio = h[at + i] / (0.35 * Math.hypot(sr, si));
      assert.ok(ratio > 0.97 && ratio < 1.15, `key ${key}: |h| at ${(i / per).toFixed(2)} cycles is ${ratio.toFixed(3)} of the ringdown's`);
    }
    assert.ok(Math.abs(h[at - 1] / (0.35 * Math.hypot(...v.modes.reduce(([x, y], m) => [x + m.cpr, y + m.cpi], [0, 0]))) - 1) < 0.03, 'chirp ends at the ringdown amplitude');
  }
});
test('the plotted strain (closed form) is what the engine plays', () => {
  for (const P of [{ ...DEFAULTS }, { ...DEFAULTS, spinU: 4, massRatio: 4, inclination: 70, retrograde: 0.5 }, { ...DEFAULTS, inspiral: true, inspiralOct: 1 }]) {
    const v = keyVoice(60, P, 48000), n = 1200, cv = strainCurve(v, n);
    const total = Math.round(cv.dur * 48000) + 1, e = new RingdownEngine(48000); e.noteOn(v.key, 1, v);
    const hp = new Float32Array(total + 128), hx = new Float32Array(total + 128), L = new Float32Array(128), R = new Float32Array(128);
    for (let s = 0; s < total; s += 128) { e.process(L, R, 128); hp.set(L, s); hx.set(R, s); }
    let err = 0, mx = 0, dot = 0, nA = 0, nB = 0;
    for (let i = 0; i < n; i++) {
      const t = (cv.dur * i * 48000) / (n - 1), s = Math.floor(t), u = t - s;   // engine output, interpolated
      const a = 0.35 * cv.hp[i], b = hp[s] + u * (hp[s + 1] - hp[s]), x = 0.35 * cv.hx[i], y = hx[s] + u * (hx[s + 1] - hx[s]);
      err = Math.max(err, Math.abs(a - b), Math.abs(x - y)); mx = Math.max(mx, Math.abs(b), Math.abs(y));
      dot += a * b + x * y; nA += a * a + x * x; nB += b * b + y * y;
    }
    const corr = dot / Math.sqrt(nA * nB);
    if (P.inspiral) assert.ok(corr > 0.98, `chirp: correlation ${corr}`);
    else assert.ok(err < 2e-3 * mx, `ringdown: worst ${(err / mx).toExponential(2)} of peak`);
  }
  const v = keyVoice(36, { ...DEFAULTS, spinU: 6, retrograde: 1, massRatio: 3, overtones: 2 }, 48000), t0 = performance.now();
  for (let i = 0; i < 10; i++) strainCurve(v, 2000);
  const ms = (performance.now() - t0) / 10;
  assert.ok(ms < 10, `${ms.toFixed(1)} ms per plot`);
  console.log(`        strain plot: ${ms.toFixed(2)} ms for 2000 points, ${v.modes.length} modes (was an offline render of up to 2.5 s)`);
});
test('the inspiral starts a set number of octaves below ISCO, and lasts at most 2 s', () => {
  const at = (key, oct) => keyVoice(key, { ...DEFAULTS, inspiral: true, inspiralOct: oct }, 48000).chirp;
  for (const key of [48, 60, 84]) {
    const c1 = at(key, 0.5), c2 = at(key, 1);
    assert.ok(Math.abs(c1.fStart / c1.fIsco - 2 ** -0.5) < 1e-12 && Math.abs(c2.fStart / c2.fIsco - 0.5) < 1e-12, `${key}`);
  }
  for (let key = 36; key <= 96; key += 6) for (const oct of [1.5, 3]) {
    const c = at(key, oct), e = new RingdownEngine(48000), L = new Float32Array(128), R = new Float32Array(128);
    e.setParams({ ...DEFAULTS, inspiral: true, inspiralOct: oct }); e.noteOn(key, 1);
    let s = 0;
    while (!e.voices[0].ring && s < 48000 * 3) { e.process(L, R, 128); s += 128; }
    assert.ok(c.tc <= 2 + 1e-9 && s / 48000 < 2.1, `${key}, ${oct} octaves: τ_c ${c.tc.toFixed(2)} s, ringdown from ${(s / 48000).toFixed(2)} s`);
  }
});
test('voice stealing fades the quietest voice instead of cutting the oldest', () => {
  const P = { ...DEFAULTS, spinU: 6, t0: 10, overtones: 0.4, massRatio: 1, inclination: 0 };
  const loud = keyVoice(36, P, 48000), quiet = keyVoice(36, P, 48000);
  const play = (max) => {
    const e = new RingdownEngine(48000); e.setParams({ maxVoices: max });
    const arr = e.voices, L = new Float32Array(128), R = new Float32Array(128), out = [];
    e.noteOn(loud.key, 1, loud);
    for (let i = 0; i < 20; i++) e.process(L, R, 128);
    e.noteOn(quiet.key, 0.05, quiet);
    for (let i = 0; i < 20; i++) e.process(L, R, 128);
    e.noteOn(loud.key, 1, loud);                           // over the limit when max = 2
    for (let i = 0; i < 40; i++) { e.process(L, R, 128); out.push(...L); }
    assert.equal(e.voices, arr, 'voices compacted in place');
    return { out, e };
  };
  const { out: a, e } = play(2), { out: b } = play(10);
  assert.equal(e.voices.length, 2);
  assert.ok(e.voices.every((v) => v.vel === 1), 'the quiet voice went');
  let jump = 0, amp = 0;
  for (let i = 1; i < a.length; i++) { jump = Math.max(jump, Math.abs((a[i] - b[i]) - (a[i - 1] - b[i - 1]))); amp = Math.max(amp, Math.abs(a[i] - b[i])); }
  assert.ok(amp > 0 && jump < 0.05 * amp, `largest step ${(jump / amp).toFixed(3)} of the stolen voice's level`);
});
test('near extremality the l = m modes, and some l ≠ m overtones, ring at mΩ_H', () => {
  const a = 1 - 1e-6, OmH = a / (2 * (1 + Math.sqrt(1 - a * a)));
  const long = new Set(['2,1,2', '3,2,1', '3,2,2', '4,3,0', '4,3,1', '4,3,2']);
  for (const md of bank.modes) if (md.m > 0) {
    const w = bank.omega(md.l, md.m, md.n, a), Q = w.re / (-2 * w.im), k = `${md.l},${md.m},${md.n}`;
    if (md.l === md.m || long.has(k)) assert.ok(Q > 140 && Math.abs(w.re / (md.m * OmH) - 1) < 4e-3, `${k}: Q ${Q.toFixed(0)}`);
    else assert.ok(Q < 30, `${k}: Q ${Q.toFixed(1)}`);
  }
});
test('GW150914’s remnant (62 M☉, a ≈ 0.67) rings near middle C: ≈ 271 Hz in its own frame, ≈ 249 Hz as observed', () => {
  const w = bank.omega(2, 2, 0, 0.67), f = (M) => w.re / (2 * Math.PI * M * MSUN_S);
  assert.ok(Math.abs(f(62) - 271) < 1.5 && Math.abs(f(62 * 1.09) - 249) < 1.5, `${f(62)}, ${f(62 * 1.09)}`);
  const c4 = keyVoice(60, DEFAULTS, 48000).info;
  assert.ok(Math.abs(c4.a - 0.69) < 1e-3 && Math.abs(c4.Msun - 65.2) < 0.1 && Math.abs(c4.rPlusKm - 166) < 1);
});

console.log('the WebAssembly (native/instruments/blackhole)');
test('its QNM table is data/qnm-table.json (tools/qnm-table.mjs), number for number', () => {
  assert.deepEqual(Array.from(bank.u), table.u);
  assert.equal(bank.modes.length, table.modes.length);
  table.modes.forEach((md, i) => {
    const w = bank.modes[i];
    assert.ok(w.l === md.l && w.m === md.m && w.n === md.n, `mode ${i}`);
    assert.deepEqual(Array.from(w.re), md.re);
    assert.deepEqual(Array.from(w.lim), md.im.map((v) => Math.log(-v)), `(${md.l},${md.m},${md.n}) log damping`);
    for (const k of [0, 17, table.u.length - 1]) {             // on a node, the interpolation is the node (to the rounding of a = 1 − 10⁻ᵘ)
      const z = bank.omega(md.l, md.m, md.n, 1 - 10 ** -table.u[k]);
      assert.ok(Math.abs(z.re / md.re[k] - 1) < 1e-9 && Math.abs(z.im / md.im[k] - 1) < 1e-9, `(${md.l},${md.m},${md.n}) at u = ${table.u[k]}`);
    }
  });
  assert.equal(bank.omega(5, 0, 0, 0.5), null);
});
test('the engine plays the voice the views show: a note without data is a note with the model\'s keyVoice, bit for bit', () => {
  const P = { ...DEFAULTS, spinU: 4, inspiral: true, massRatio: 2, retrograde: 0.3 };
  const out = (offer) => {
    const e = new RingdownEngine(44100), L = new Float32Array(64), R = new Float32Array(64), got = [];
    e.setParams({ ...P, stereo: 0, releaseMute: 1, maxVoices: 4 });
    for (let b = 0; b < 400; b++) {
      if (b % 40 === 0) { const key = 40 + (b / 40) * 5; e.noteOn(key, 0.3 + b / 800, offer ? keyVoice(key, P, 44100) : undefined); }
      if (b % 40 === 20) e.noteOff(40 + ((b - 20) / 40) * 5);
      e.process(L, R, 64); got.push(...L, ...R);
    }
    return got;
  };
  const a = out(false);
  assert.ok(a.some((x) => x !== 0));
  assert.deepEqual(a, out(true));
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
