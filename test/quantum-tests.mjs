// Quantum Keyboard checks. Run: node test/quantum-tests.mjs
//
// The C++ (native/instruments/quantum), built as WebAssembly: the model's packets through
// quantum-wasm.js, the engine through loadEngine. First the physics against independent results
// (finite-difference diagonalisation, exact radial integrals, tabulated Airy zeros, the
// Averbukh–Perelman fractional revivals), then the engine against the model.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, GROUPS } from '../quantum/src/quantum-instrument.js';
import { wasmModel } from '../quantum/src/quantum-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { symEig } from '../shared/linalg.js';
import { keyFreq } from '../shared/dsp.js';

const QuantumEngine = await loadEngine(INSTRUMENT);
const { makePacket } = await wasmModel();

const FS = 48000, PI = Math.PI;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const rel = (a, b) => Math.abs(a / b - 1);

// Render through the engine in 128-sample blocks (Float64 buffers), left channel.
function render(params, events, sec) {
  const e = new QuantumEngine(FS);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float64Array(n), R = new Float64Array(n), bl = 128, bL = new Float64Array(bl), bR = new Float64Array(bl);
  const ev = events.map(([t, ...r]) => [Math.round(t * FS), ...r]).sort((a, b) => a[0] - b[0]);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j][0] <= s) { const [, type, k, v] = ev[j++]; if (type === 'on') e.noteOn(k, v); else if (type === 'off') e.noteOff(k); }
    e.process(bL, bR, bl);
    L.set(bL.subarray(0, Math.min(bl, n - s)), s); R.set(bR.subarray(0, Math.min(bl, n - s)), s);
  }
  return { L, R, M: L.map((v, i) => v + R[i]), e };
}
const note = (params, key, sec, vel = 1) => render(params, [[0, 'on', key, vel]], sec);
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b) {
  const w = (2 * PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return (2 * Math.hypot(re, im)) / ((b - a) / 2);
}
function rms(x, a, b) { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); }
// Instantaneous frequency near the launch: demodulate at f0, Gaussian low-pass
// (σ_t = 1 period, which removes the other Bohr harmonics to 1e-8), and take the
// phase slope between two times.
function launchPitch(x, f0, t1, t2) {
  const st = 1 / f0, w = (2 * PI * f0) / FS;
  const ph = (t) => {
    const c = Math.round(t * FS), r = Math.round(4 * st * FS);
    let re = 0, im = 0;
    for (let i = Math.max(0, c - r); i <= c + r; i++) { const g = Math.exp(-0.5 * ((i - c) / (st * FS)) ** 2); re += g * x[i] * Math.cos(w * i); im -= g * x[i] * Math.sin(w * i); }
    return Math.atan2(im, re);
  };
  let d = ph(t2) - ph(t1);
  d -= 2 * PI * Math.round(d / (2 * PI));
  return f0 * (1 + d / (2 * PI * f0 * (t2 - t1)));
}
// Finite-difference eigenstates of −ψ″/2μ + Vψ (Dirichlet on [x0, x1]).
function fdEig(V, x0, x1, N, mu, count) {
  const h = (x1 - x0) / (N + 1), xs = Float64Array.from({ length: N }, (_, i) => x0 + (i + 1) * h);
  const A = Array.from({ length: N }, () => new Float64Array(N)), t = 1 / (2 * mu * h * h);
  for (let i = 0; i < N; i++) { A[i][i] = 2 * t + V(xs[i]); if (i) A[i][i - 1] = -t; if (i < N - 1) A[i][i + 1] = -t; }
  const d = symEig(A, N), idx = [...d.keys()].sort((a, b) => d[a] - d[b]).slice(0, count);
  const vecs = idx.map((c) => {
    const v = xs.map((_, r) => A[r][c]);
    let s = 0; for (const q of v) s += q * q * h;
    const k = v.findIndex((q) => Math.abs(q) > 1e-3 * Math.sqrt(s)), sg = v[k] < 0 ? -1 : 1; // first lobe on the inner side > 0
    return v.map((q) => (sg * q) / Math.sqrt(s));
  });
  const xmn = (m, n) => { let s = 0; for (let i = 0; i < N; i++) s += vecs[m][i] * vecs[n][i] * xs[i] * h; return s; };
  return { E: idx.map((i) => d[i]), xmn, h };
}
// Richardson-extrapolated (O(h²)) energies and matrix elements from two grids.
function fdPair(V, x0, x1, mu, count, N = 280) {
  const a = fdEig(V, x0, x1, N, mu, count), b = fdEig(V, x0, x1, 2 * N + 1, mu, count), r = b.h ** 2 / (a.h ** 2 - b.h ** 2);
  const ex = (u, v) => v + (v - u) * r;
  return { E: (n) => ex(a.E[n], b.E[n]), x: (m, n) => ex(a.xmn(m, n), b.xmn(m, n)) };
}

// The packet's observables in closed form, from its states (n, cₙ, Eₙ) and Bohr pairs.
// Autocorrelation |⟨ψ(0)|ψ(t)⟩|² = |Σ|cₙ|² e^(−iEₙt)|², and with pure dephasing (ρ_mn decays at
// (m−n)²/T_φ) the overlap Tr ρ(0)ρ(t). t in seconds.
function autocorr(pk, t, Tphi = Infinity) {
  const w = 2 * PI * pk.scale, N = pk.ns.length;
  if (!(Tphi < 1e6)) {
    let re = 0, im = 0;
    for (let i = 0; i < N; i++) { const p = pk.c[i] * pk.c[i], ph = w * (pk.E[i] - pk.E[0]) * t; re += p * Math.cos(ph); im -= p * Math.sin(ph); }
    return re * re + im * im;
  }
  let s = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const k = pk.ns[j] - pk.ns[i];
    s += pk.c[i] ** 2 * pk.c[j] ** 2 * Math.cos(w * (pk.E[j] - pk.E[i]) * t) * Math.exp((-k * k * t) / Tphi);
  }
  return s;
}
// The detector signal: Σ_pairs w·cos(2πft) (or −sin for the coil), times the decoherence of each
// Δn, minus the electrode's Franck–Condon reference, faded out over 60 ms (its AC coupling).
const DC_FADE = 0.06;
function signalAt(pk, t, { T1 = Infinity, Tphi = Infinity } = {}) {
  let y = t <= 0 ? -pk.dc : t < DC_FADE ? -0.5 * pk.dc * (1 + Math.cos((PI * t) / DC_FADE)) * Math.exp(-t / T1) : 0;
  for (const p of pk.pairs) {
    const ph = 2 * PI * p.f * t, dec = Math.exp(-t / T1 - (p.k * p.k * t) / Tphi);
    y += p.w * dec * (pk.d === 1 ? -Math.sin(ph) : Math.cos(ph));
  }
  return y;
}
// A packet's dipole matrix elements x_mn, read back from its pairs: on the electrode a pair's weight
// is 2c_m cₙ x_mn over the detector's gain, which the packet doesn't give, so they come out in units
// of it. Every pair the packet holds, keyed 'm,n'.
const allPairs = { maxPairs: 5000, rel: 0 };
function dipoles(pk) {
  const x = new Map();
  for (const p of pk.pairs) x.set(`${pk.ns[p.i]},${pk.ns[p.j]}`, p.w / (2 * pk.c[p.i] * pk.c[p.j]));
  return x;
}
// The gain that best fits a packet's x_mn to reference values (least squares), and the worst
// difference left: [[m, n, reference], …].
function fitDipoles(pk, refs) {
  const x = dipoles(pk), got = refs.map(([m, n, r]) => { const v = x.get(`${m},${n}`); assert.ok(v !== undefined, `pair ${m},${n} not in the packet`); return [m, n, r, v]; });
  let a = 0, b = 0;
  for (const [, , r, v] of got) { a += r * v; b += v * v; }
  const g = a / b;
  let worst = 0, at = '';
  for (const [m, n, r, v] of got) if (Math.abs(g * v - r) > worst) { worst = Math.abs(g * v - r); at = `x_${m},${n}: ${g * v} vs ${r}`; }
  return { worst, at, x: (m, n) => g * x.get(`${m},${n}`) };
}
const morseKappa = (nbar, eta) => (2 * (nbar + 0.5)) / (1 - Math.sqrt(1 - eta)); // κ from the packet's height in the well

console.log('physics');
test('square well: x_mn = −8mn/π²(m²−n²)² (quadrature), zero for m + n even, → −2/π²k² (triangle-wave Fourier series)', () => {
  const quad = (m, n) => { const N = 20000; let s = 0; for (let i = 0; i < N; i++) { const x = (i + 0.5) / N; s += 2 * x * Math.sin(m * PI * x) * Math.sin(n * PI * x); } return s / N; };
  for (const [nbar, sigma] of [[10, 2], [50, 1]]) {
    const pk = makePacket(36, P({ lock: false, nbar, sigma, detector: 'x' }), allPairs), refs = [];
    for (const p of pk.pairs) { const m = pk.ns[p.i], n = pk.ns[p.j]; assert.ok((m + n) % 2, `x_${m},${n} should vanish`); refs.push([m, n, quad(m, n)]); }
    const f = fitDipoles(pk, refs);
    assert.ok(refs.length > 40 && f.worst < 1e-7, `${refs.length} pairs, worst ${f.at}`);
    console.log(`        n̄ = ${nbar}: ${refs.length} pairs, worst ${f.worst.toExponential(1)}`);
  }
  const pk = makePacket(36, P({ lock: false, nbar: 2000, sigma: 1, detector: 'x' }), allPairs), refs = [];
  for (const k of [1, 3, 5]) refs.push([2000, 2000 + k, -2 / (PI * PI * k * k)]);
  const f = fitDipoles(pk, refs);
  for (const [m, n, r] of refs) assert.ok(rel(f.x(m, n), r) < 1e-3, `k = ${n - m}: ${f.x(m, n)} vs ${r}`);
});
test('Morse: E_v and x_mn (Vasan & Cross) match a finite-difference diagonalisation', () => {
  // a packet in the κ = 24 well: n̄ = 3 at η = ½
  const kap = 24, D = kap / 4, fd = fdPair((x) => D * (1 - Math.exp(-x)) ** 2, -1.5, 14, 2 * D, 9);
  const pk = makePacket(36, P({ potential: 'morse', lock: false, eta: 0.5, nbar: (kap * (1 - Math.sqrt(0.5))) / 2 - 0.5, sigma: 2, detector: 'x' }), allPairs);
  assert.ok(rel(pk.kap, kap) < 1e-12 && pk.ns[0] === 0, `κ ${pk.kap}, from v = ${pk.ns[0]}`);
  for (let v = 0; v < 9; v++) assert.ok(Math.abs(fd.E(v) - pk.E[v]) < 5e-4, `E_${v}: ${fd.E(v)} vs ${pk.E[v]}`);
  const refs = [];
  for (let m = 0; m < 9; m++) for (let n = m + 1; n < 9; n++) refs.push([m, n, fd.x(m, n)]);
  const f = fitDipoles(pk, refs);
  assert.ok(f.worst < 2e-4, f.at);
  console.log(`        ${refs.length} pairs, worst ${f.worst.toExponential(1)}`);
});
test('bouncer: Eₙ = |aₙ| (A&S Table 10.13, and the asymptotic series above it, against a finite-difference diagonalisation), z_mn = −2/(z_m−zₙ)², ⟨z⟩ₙ = 2Eₙ/3 (virial)', () => {
  const AIRY = [2.338107410459767, 4.087949444130970, 5.520559828095551, 6.786708090071759, 7.944133587120853,
    9.022650853340980, 10.04017434155809, 11.00852430373326, 11.93601556323626, 12.82877675286576];
  const pk = makePacket(36, P({ potential: 'bouncer', lock: false, nbar: 7, sigma: 1.5, detector: 'x' }), allPairs);
  assert.ok(pk.ns[0] === 1 && pk.ns.length >= 14, `states ${pk.ns[0]}–${pk.ns[pk.ns.length - 1]}`);
  for (let n = 0; n < 10; n++) assert.ok(Math.abs(pk.E[n] - AIRY[n]) < 1e-12, `a_${n + 1}: ${pk.E[n]}`);
  const fd = fdPair((z) => z, 0, 36, 0.5, 14, 400);
  for (let n = 0; n < 14; n++) assert.ok(Math.abs(fd.E(n) - pk.E[n]) < 2e-4, `E_${n + 1}: ${fd.E(n)} vs ${pk.E[n]}`);
  const refs = [];
  for (let m = 0; m < 8; m++) for (let n = m + 1; n < 8; n++) refs.push([m + 1, n + 1, fd.x(m, n)]);
  const f = fitDipoles(pk, refs);
  assert.ok(f.worst < 2e-4, f.at);
  console.log(`        ${refs.length} pairs, worst ${f.worst.toExponential(1)}`);
  for (const n of [0, 3, 6]) assert.ok(Math.abs(fd.x(n, n) - (2 * pk.E[n]) / 3) < 2e-4, `virial n=${n + 1}`);
});
test('hydrogen: Kepler-orbit ⟨n|r|n+k⟩ vs exact radial integrals (l = 1), against ⟨n|r|n+1⟩ and from n to n + 5', () => {
  const lag = (deg, al, x) => { let a = 1, b = 1 + al - x; if (!deg) return 1; for (let j = 1; j < deg; j++) { const c = ((2 * j + 1 + al - x) * b - (j + al) * a) / (j + 1); a = b; b = c; } return b; };
  const u = (n, r) => { const rho = (2 * r) / n; return r * rho * Math.exp(-rho / 2) * lag(n - 2, 3, rho); }; // l = 1
  const exact = (n1, n2) => {
    const R = 2.5 * n2 * n2 + 40, M = 60000, h = R / M;
    let a = 0, b = 0, c = 0;
    for (let i = 1; i < M; i++) { const r = i * h, p = u(n1, r), q = u(n2, r); a += p * p; b += q * q; c += p * q * r; }
    return c / Math.sqrt(a * b);
  };
  // (the packet's matrix elements are in units of its gain: each is checked against the n → n + 1 line,
  // whose own error, 0.3 %, adds to its tolerance)
  const tol = { 1: 0.003, 2: 0.006, 5: 0.03 };
  for (const n of [20, 40]) {
    const pk = makePacket(36, P({ potential: 'hydrogen', lock: false, nbar: n + 2.5, sigma: 1.2, detector: 'x' }), allPairs), x = dipoles(pk), x1 = x.get(`${n},${n + 1}`), e1 = exact(n, n + 1);
    for (const [m, k] of [[n + 5, 1], [n, 2], [n, 5]]) {
      const ex = exact(m, m + k) / e1, sc = x.get(`${m},${m + k}`) / x1;
      assert.ok(rel(sc, ex) < tol[k] + tol[1], `⟨${m}|r|${m + k}⟩ / ⟨${n}|r|${n + 1}⟩: ${sc.toFixed(4)} vs ${ex.toFixed(4)}`);
      console.log(`        ⟨${m}|r|${m + k}⟩ / ⟨${n}|r|${n + 1}⟩ ${sc.toFixed(4)}, exact ${ex.toFixed(4)}`);
    }
  }
});
test('time scales from E″ and E‴: T_rev = 2πħ/(|E″|/2), T_sr = 2πħ/(|E‴|/6): |E″| = 2 (box), 2/κ (Morse), 3/n̄⁴ (hydrogen), (2/9)E/(n̄−¼)² (bouncer, from Eₙ ∝ (n−¼)^⅔); T_sr/T_rev = 3n̄/4 (hydrogen); the spectra n², (v+½) − (v+½)²/κ, −1/2n², n + ½', () => {
  // (the packet's scale s turns energy into Hz: T_rev·s = 2/|E″|, T_sr·s = 6/|E‴|)
  const pk = (o) => makePacket(57, P({ lock: false, ...o }));
  const box = pk({ nbar: 50 });
  assert.ok(rel(box.Trev * box.scale, 1) < 1e-12 && box.ns.every((n, i) => box.E[i] === n * n), `box ${box.Trev * box.scale}`);
  const mo = pk({ potential: 'morse', nbar: 30, eta: 0.5 }), kap = morseKappa(30, 0.5);
  assert.ok(rel(mo.kap, kap) < 1e-12 && rel(mo.Trev * mo.scale, kap) < 1e-12, `Morse κ ${mo.kap}, T_rev·s ${mo.Trev * mo.scale}`);
  assert.ok(mo.ns.every((v, i) => Math.abs(mo.E[i] - ((v + 0.5) - (v + 0.5) ** 2 / kap)) < 1e-12), 'Morse levels');
  const h = pk({ potential: 'hydrogen', nbar: 60 });
  assert.ok(rel(h.Trev * h.scale, (2 * 60 ** 4) / 3) < 1e-12 && rel(h.Tsr / h.Trev, 45) < 1e-12, `H ${h.Trev * h.scale}, ${h.Tsr / h.Trev}`);
  assert.ok(h.ns.every((n, i) => rel(h.E[i], -0.5 / (n * n)) < 1e-15), 'hydrogen levels');
  const b = pk({ potential: 'bouncer', nbar: 200 }), E200 = b.E[b.ns.indexOf(200)], d2 = 2 / (b.Trev * b.scale);
  assert.ok(rel(d2, (2 / 9) * E200 / 199.75 ** 2) < 1e-4, `bouncer |E″| ${d2}`);
  const ho = pk({ potential: 'harmonic', nbar: 30 });
  assert.ok(ho.ns.every((n, i) => ho.E[i] === n + 0.5) && ho.Trev === Infinity, 'harmonic levels');
  // the packet's own clock agrees to O(σ²/n̄) (its pitch is the mean Bohr frequency)
  const clock = makePacket(57, P({ lock: false, nbar: 200, detector: 'x' }));
  assert.ok(rel(clock.Trev / clock.Tcl, 400) < 1e-3, `box packet ${clock.Trev / clock.Tcl}`);
});
test('autocorrelation: exact revival in the box; Averbukh–Perelman fractions in Morse (½ at T/4, ⅓ at T/3 and T/6, 1 at T/2)', () => {
  const near = (pk, t) => { let b = 0; for (let u = t - pk.Tcl; u <= t + pk.Tcl; u += pk.Tcl / 64) b = Math.max(b, autocorr(pk, u)); return b; };
  const box = makePacket(57, P({ lock: false, nbar: 40 }));
  assert.ok(Math.abs(autocorr(box, box.Trev) - 1) < 1e-9, `box |A(T_rev)|² = ${autocorr(box, box.Trev)}`);
  const pk = makePacket(57, P({ potential: 'morse', lock: false, nbar: 40, eta: 0.5 }));
  const want = [[1 / 4, 0.5], [1 / 3, 1 / 3], [1 / 6, 1 / 3], [1 / 8, 0.25], [1 / 2, 1], [1, 1]];
  for (const [f, a] of want) { const v = near(pk, f * pk.Trev); assert.ok(Math.abs(v - a) < 0.03, `T_rev·${f.toFixed(3)}: ${v.toFixed(3)} (want ${a.toFixed(3)})`); }
});
test('hydrogen: revivals degrade (cubic term) and return at T_sr/6 (n̄ = 44, a multiple of 4)', () => {
  const pk = makePacket(48, P({ potential: 'hydrogen', lock: false, nbar: 44, sigma: 1.3 }));
  const near = (t) => { let b = 0; for (let u = t - 0.6 * pk.Trev; u <= t + 0.6 * pk.Trev; u += pk.Tcl / 48) b = Math.max(b, autocorr(pk, u)); return b; };
  const s6 = near(pk.Tsr / 6), q8 = near(pk.Tsr / 8), q4 = near(pk.Tsr / 4);
  assert.ok(s6 > 0.92 && q8 < 0.86 && q4 < 0.84, `T_sr/6 ${s6.toFixed(2)}, T_sr/8 ${q8.toFixed(2)}, T_sr/4 ${q4.toFixed(2)}`);
});

console.log('engine');
test('every key is on pitch at the launch (±3 ¢): square well, tempo-locked', () => {
  let worst = 0, wk = 0;
  for (let k = INSTRUMENT.range[0]; k <= INSTRUMENT.range[1]; k++) {
    const pk = makePacket(k, P()), f0 = keyFreq(k), { L } = note(P(), k, 0.12);
    const f = launchPitch(L, f0, 2.5 / f0, 2.5 / f0 + 0.3 * pk.tColl);
    if (Math.abs(cents(f, f0)) > Math.abs(worst)) { worst = cents(f, f0); wk = k; }
  }
  assert.ok(Math.abs(worst) < 3, `worst ${worst.toFixed(2)} ¢ at key ${wk}`);
  console.log(`        worst key ${wk}: ${worst.toFixed(2)} ¢`);
});
test('…and for every well and detector, tempo-locked or at fixed n̄', () => {
  // fixed n̄ chosen so the launch lasts ≥ 8 periods (T_rev ≥ 200 T_cl); a packet that
  // collapses within a few periods has no sharper pitch than its mean Bohr frequency.
  const fixed = { box: 100, morse: 45, hydrogen: 300, bouncer: 34, harmonic: 60 };
  let worst = 0, what = '';
  for (const potential of Object.keys(fixed)) for (const detector of ['x', 'v', 'a']) for (const lock of [true, false]) for (const k of [48, 69, 90]) {
    const p = P({ potential, detector, lock, nbar: fixed[potential] }), pk = makePacket(k, p), f0 = keyFreq(k), { L } = note(p, k, 0.12);
    const t1 = 2.5 / f0, c = cents(launchPitch(L, f0, t1, t1 + Math.min(0.03, 0.3 * pk.tColl)), f0);
    if (Math.abs(c) > Math.abs(worst)) { worst = c; what = `${potential}/${detector}/${lock ? 'tempo' : `n̄=${fixed[potential]}`}/key ${k}`; }
  }
  assert.ok(Math.abs(worst) < 3, `worst ${worst.toFixed(2)} ¢ (${what})`);
  console.log(`        worst ${worst.toFixed(2)} ¢ (${what})`);
});
test('the keyboard\'s tuning: at A = 415 Hz a key launches at 440·2^((m−69)/12)·415/440 (±3 ¢), tempo-locked (its revival still on the beat) or at fixed n̄; in ¼-comma meantone on C the packet\'s pitch is E4 3.42 ¢ flat of equal temperament, C4 10.26 ¢ sharp, A4 on 440 Hz', () => {
  for (const lock of [true, false]) for (const k of [48, 64]) {
    const p = P({ lock, pitch: 415 }), pk = makePacket(k, p), f0 = (keyFreq(k) * 415) / 440, { L } = note(p, k, 0.12);
    const c = cents(launchPitch(L, f0, 2.5 / f0, 2.5 / f0 + 0.3 * pk.tColl), f0);
    assert.ok(Math.abs(c) < 3, `key ${k}${lock ? ', locked' : ''}: ${c.toFixed(2)} ¢`);
    if (lock) assert.ok(rel(pk.Trev, makePacket(k, P()).Trev) < 1e-9 && !pk.offBeat, `key ${k}: the revival moved, T_rev ${pk.Trev}`);
  }
  for (const [k, want] of [[64, -3.42], [60, 10.26], [69, 0]]) {
    const c = cents(makePacket(k, P({ temperament: 'meantone' })).pitch, keyFreq(k));
    assert.ok(Math.abs(c - want) < 0.01, `key ${k} in meantone: ${c.toFixed(3)} ¢, not ${want}`);
  }
});
test('engine = model: every well and detector, sample for sample, with T₁ and T_φ', () => {
  for (const potential of ['box', 'morse', 'hydrogen', 'bouncer', 'harmonic']) for (const detector of ['x', 'v', 'a']) {
    const p = P({ potential, detector, T1: 2, dephase: 1 / 0.7 }), e = new QuantumEngine(FS);
    e.setParams(p); e.noteOn(60, 1);
    const v = e.voices[0], c0 = v.count, n = Math.round(1.4 * FS), bl = 128, bL = new Float64Array(bl), bR = new Float64Array(bl), L = new Float64Array(n);
    for (let s = 0; s < n; s += bl) { bL.fill(0); bR.fill(0); e.process(bL, bR, bl); L.set(bL.subarray(0, Math.min(bl, n - s)), s); }
    for (const t of [0.003, 0.2, 0.5, 0.6667, 1.0, 1.3333]) {
      const i = Math.round(t * FS), m = 0.3 * v.pan[0] * signalAt(v.pk, (c0 + i + 1) / FS, { T1: 2, Tphi: 0.7 });
      assert.ok(Math.abs(L[i] - m) < 1e-9, `${potential}/${detector} t=${t}: ${L[i]} vs ${m}`);
    }
  }
});
test('revivals are sample-accurate: the square well repeats its launch after T_rev = 1 s', () => {
  const p = P({ bpm: 120, beats: 2, T1: 1e9 }), { L } = render(p, [[0, 'on', 57, 1]], 1.1);
  let err = 0, pk = 0;
  for (let i = 1000; i < 4800; i++) { err = Math.max(err, Math.abs(L[i + FS] - L[i])); pk = Math.max(pk, Math.abs(L[i])); }
  assert.ok(err < 1e-9 * pk + 1e-12, `max difference ${err.toExponential(2)} (peak ${pk.toFixed(3)})`);
});
test('fractional revivals: Morse plays the octave at T_rev/4, the twelfth at T_rev/3; the box is silent at T_rev/4', () => {
  const k = 57, f0 = keyFreq(k), T = (2 * 60) / 90; // default tempo: T_rev = 4/3 s
  const dom = (x, t) => { const a = Math.round((t - 0.04) * FS), b = Math.round((t + 0.04) * FS); return [1, 2, 3, 4, 5].map((h) => tone(x, h * f0, a, b)); };
  const { L: M } = note(P({ potential: 'morse', T1: 1e9 }), k, 0.5);
  const q4 = dom(M, T / 4), q3 = dom(M, T / 3);
  assert.ok(q4[1] > 4 * Math.max(q4[0], q4[2], q4[3]), `Morse T/4: ${q4.map((v) => v.toFixed(4))}`);
  assert.ok(q3[2] > 4 * Math.max(q3[0], q3[1], q3[3]), `Morse T/3: ${q3.map((v) => v.toFixed(4))}`);
  const { L: B } = note(P({ T1: 1e9 }), k, 0.5);
  const b0 = rms(B, Math.round(0.005 * FS), Math.round(0.045 * FS)), b4 = rms(B, Math.round((T / 4 - 0.02) * FS), Math.round((T / 4 + 0.02) * FS));
  assert.ok(b4 < 0.03 * b0, `box rms at T/4 is ${(20 * Math.log10(b4 / b0)).toFixed(1)} dB re launch`);
});
test('harmonic oscillator never dephases: one pure line whose amplitude follows T₁ only', () => {
  const { L } = note(P({ potential: 'harmonic', T1: 2, detector: 'a' }), 57, 3.1), f0 = keyFreq(57);
  const a = tone(L, f0, 4800, 4800 + 9600), b = tone(L, f0, 4800 + 2 * FS, 4800 + 2 * FS + 9600);
  assert.ok(Math.abs(b / a - Math.exp(-1)) < 1e-3, `ratio ${b / a}`);
  assert.ok(tone(L, 2 * f0, 4800, 14400) < 1e-4 * a && tone(L, 3 * f0, 4800, 14400) < 1e-4 * a);
});
test('T₁: the revival returns e^(−T_rev/T₁) quieter', () => {
  const T1 = 1.5, { L } = render(P({ bpm: 120, beats: 2, T1 }), [[0, 'on', 57, 1]], 1.1);
  const r = rms(L, FS + 300, FS + 2700) / rms(L, 300, 2700);
  assert.ok(Math.abs(r / Math.exp(-1 / T1) - 1) < 1e-6, `ratio ${r} vs ${Math.exp(-1 / T1)}`);
});
test('pure dephasing (rate k²/T_φ) kills the revival, not the attack', () => {
  const base = P({ bpm: 120, beats: 2, T1: 1e9 }), Tphi = 0.4, f0 = keyFreq(57);
  const { L: A } = note(base, 57, 1.1), { L: D } = note({ ...base, dephase: 1 / Tphi }, 57, 1.1);
  // the fundamental is the Δn = 1 coherences: e^(−t/T_φ) at the attack and at the revival
  const g0 = tone(D, f0, 0, 960) / tone(A, f0, 0, 960), g1 = tone(D, f0, FS - 1200, FS + 1200) / tone(A, f0, FS - 1200, FS + 1200);
  assert.ok(g0 > 0.97, `attack (first 20 ms) keeps ${g0.toFixed(3)} of its fundamental`);
  assert.ok(Math.abs(g1 / Math.exp(-1 / Tphi) - 1) < 0.02, `revival keeps ${g1.toFixed(4)} vs e^(−T_rev/T_φ) = ${Math.exp(-1 / Tphi).toFixed(4)}`);
  // Δn = 3 (the third harmonic): e^(−9 T_rev/T_φ)
  const g3 = tone(D, 3 * f0, FS - 1200, FS + 1200) / tone(A, 3 * f0, FS - 1200, FS + 1200);
  assert.ok(g3 < 1e-6, `3rd harmonic kept ${g3.toExponential(2)}`);
});
test('fixed n̄: revival time ∝ 1/f, so C–G revive in 3:2 polyrhythm (engine envelope)', () => {
  const p = P({ lock: false, nbar: 50, T1: 1e9 }), env = [];
  for (const k of [60, 67]) {
    const pk = makePacket(k, p), { L } = note(p, k, 0.5 * pk.Trev + 0.05);
    let best = 0, bt = 0; // the half revival: loudest point near T_rev/2
    for (let t = 0.42 * pk.Trev; t < 0.58 * pk.Trev; t += 0.0005) { const r = rms(L, Math.round((t - 0.004) * FS), Math.round((t + 0.004) * FS)); if (r > best) { best = r; bt = t; } }
    env.push({ pk, bt });
    assert.ok(Math.abs(bt - 0.5 * pk.Trev) < 0.01 * pk.Trev, `key ${k}: peak at ${bt.toFixed(4)} s, T_rev/2 = ${(pk.Trev / 2).toFixed(4)} s`);
  }
  assert.ok(Math.abs(env[0].pk.Trev / env[1].pk.Trev - 2 ** (7 / 12)) < 1e-3);
});
test('the spectrum is the Bohr lines: a 3-level packet in the box has lines at (2n+1)E₁/h', () => {
  const p = P({ lock: false, nbar: 20, sigma: 0.6, detector: 'x', T1: 1e9 }), pk = makePacket(57, p);
  const { L } = note(p, 57, 3);
  for (const pr of pk.pairs.filter((q) => q.k === 1 && Math.abs(q.w) > 0.1)) {
    const f = pr.f, a = tone(L, f, 4800, 4800 + 2 * FS);
    assert.ok(a > 20 * tone(L, f + 0.25 * (2 / pk.Trev), 4800, 4800 + 2 * FS), `line ${f.toFixed(2)} Hz`);
    assert.ok(Math.abs((f * pk.Trev) - (2 * pk.ns[pr.i] + 1)) < 1e-6, `${f * pk.Trev} vs 2n+1`);
  }
});
test('level: a forte note peaks 0.1–0.5 for every well and detector (0.09 below C2)', () => {
  for (const potential of ['box', 'morse', 'hydrogen', 'bouncer', 'harmonic']) for (const detector of ['x', 'v', 'a']) for (const k of [21, 36, 60, 96, 108]) {
    const { L, R } = note(P({ potential, detector }), k, 0.6);
    let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    // below C2, hydrogen's antenna peaks a little under 0.1 (0.096 from A0 to E1, 0.13 at A1, 0.15 at C2)
    const floor = k < 36 ? 0.09 : 0.1;
    assert.ok(pk > floor && pk < 0.5, `${potential}/${detector}/${k}: peak ${pk.toFixed(3)}`);
  }
});
test('every knob at its extremes: finite, no blow-up, peak < 0.6', () => {
  const ranged = GROUPS.flatMap((g) => g.params).filter((q) => q.min !== undefined);
  for (const potential of ['box', 'morse', 'hydrogen', 'bouncer', 'harmonic']) for (const detector of ['x', 'v', 'a']) for (const q of ranged) for (const v of [q.min, q.max]) for (const lock of [true, false]) for (const [lo, hi] of [[36, 96], [21, 108]]) {
    const p = P({ potential, detector, lock, [q.id]: v }), { L, e } = render(p, [[0, 'on', lo, 1], [0, 'on', hi, 1], [0.15, 'off', lo], [0.15, 'off', hi]], 0.3);
    e.destroy(); // some 1400 engines: give each one's memory back
    let pk = 0; for (const x of L) { assert.ok(Number.isFinite(x), `${potential}/${detector} ${q.id}=${v} keys ${lo}, ${hi}: NaN`); pk = Math.max(pk, Math.abs(x)); }
    assert.ok(pk < 0.6, `${potential}/${detector} ${q.id}=${v} keys ${lo}, ${hi}: peak ${pk}`);
  }
});
test('no clicks: the launch is no steeper than the packet\'s own first bounces; release is smooth; silence after the quench', () => {
  for (const potential of ['box', 'morse', 'hydrogen', 'bouncer', 'harmonic']) for (const detector of ['x', 'v', 'a']) for (const k of [21, 36, 60, 84, 96, 108]) {
    const p = P({ potential, detector, release: 0.05 }), { M } = render(p, [[0, 'on', k, 1], [0.3, 'off', k]], 1.2), T = 1 / keyFreq(k);
    const slope = (a, b) => { let m = 0; for (let i = Math.max(1, Math.round(a * FS)); i < Math.round(b * FS); i++) m = Math.max(m, Math.abs(M[i] - M[i - 1])); return m; };
    const on = slope(0, 0.75 * T), own = slope(0.75 * T, 3 * T);
    // Past C2–C7 the tempo lock gives the bass small packets (n̄ ≈ 6–55 at A0) that spread within their
    // first period, so their later bounces are softer than the launch itself: there the onset is held to
    // the packet's own launch-to-bounces ratio (the model's signal, without the pump ramp).
    let own0 = 1;
    if (k < 36 || k > 96) {
      const pk = makePacket(k, p), y = (i) => signalAt(pk, i / FS);
      const ms = (a, b) => { let m = 0; for (let i = Math.max(1, Math.round(a * FS)); i < Math.round(b * FS); i++) m = Math.max(m, Math.abs(y(i) - y(i - 1))); return m; };
      own0 = Math.max(1, ms(0, 0.75 * T) / ms(0.75 * T, 3 * T));
    }
    assert.ok(on < 1.6 * own0 * own, `${potential}/${detector}/${k}: onset slope ${(on / own).toFixed(2)}× the note's own (the packet's own launch ${own0.toFixed(2)}×)`);
    const around = slope(0.3 - 0.001, 0.3 + 0.001), local = Math.max(slope(0.3 - 0.006, 0.3 - 0.001), slope(0.3 + 0.001, 0.3 + 0.006));
    assert.ok(around < 1.2 * local, `${potential}/${detector}/${k}: release ${(around / local).toFixed(2)}`);
    assert.ok(rms(M, Math.round(1.0 * FS), M.length) < 1e-4 * rms(M, 0, Math.round(0.3 * FS)), `${potential}/${detector}/${k}: not silent`);
  }
});
test('regression: tempo extremes keep every key on pitch; a revival the well cannot reach falls off the beat, flagged', () => {
  // was: n̄ clamped to its range with no fallback, so hydrogen at 40 BPM × 8 beats played C7 3181 ¢ flat
  let worst = 0, wk = '', off = 0;
  for (const potential of ['box', 'morse', 'hydrogen', 'bouncer']) for (const [bpm, beats] of [[40, 8], [200, 0.5], [40, 0.5], [200, 8], [90, 2]]) for (const key of [21, 36, 48, 60, 72, 84, 96, 108]) {
    const p = P({ potential, bpm, beats }), pk = makePacket(key, p), c = cents(pk.pitch, keyFreq(key)), T = (beats * 60) / bpm;
    if (Math.abs(c) > Math.abs(worst)) { worst = c; wk = `${potential} ${bpm}×${beats} key ${key}`; }
    if (pk.offBeat) off++; else assert.ok(rel(pk.Trev, T) < 1e-6, `${potential} ${bpm}×${beats} key ${key}: locked, T_rev ${pk.Trev} vs ${T}`);
  }
  assert.ok(Math.abs(worst) < 0.01, `model pitch: worst ${worst.toFixed(3)} ¢ (${wk})`);
  assert.ok(makePacket(96, P({ potential: 'hydrogen', bpm: 40, beats: 8 })).offBeat && makePacket(36, P({ potential: 'hydrogen', bpm: 200, beats: 0.5 })).offBeat, 'and the extremes say so');
  // from the engine's output, where the packet is classical enough to have a pitch for a few periods
  // (at n̄ = 12, the hydrogen floor, it collapses within one: the model's launch pitch is the check there)
  for (const [potential, bpm, beats, key] of [['hydrogen', 40, 8, 96], ['hydrogen', 40, 8, 72], ['box', 40, 8, 96]]) {
    const p = P({ potential, bpm, beats, detector: 'x' }), f0 = keyFreq(key), { M } = note(p, key, 0.2), t1 = 0.03, f = launchPitch(M, f0, t1, t1 + 3 / f0);
    assert.ok(Math.abs(cents(f, f0)) < 3, `${potential} ${bpm}×${beats} key ${key}: ${cents(f, f0).toFixed(2)} ¢ from the output`);
  }
  console.log(`        ${off} of 160 keys × tempos off the beat; pitch exact everywhere`);
});
test('regression: the electrode\'s Franck–Condon reference is in its gain: notes peak ≤ 0.3, six-note chords ≈ 1', () => {
  // was: the fade of the reference was left out of the normalisation (notes 0.36, chords 1.24, the Rydberg preset 1.41)
  for (const potential of ['box', 'morse', 'hydrogen', 'bouncer', 'harmonic']) for (const k of [36, 57, 84]) {
    const { L, R, e } = note(P({ potential, detector: 'x' }), k, 0.3), [gl, gr] = e.voices[0].pan;
    let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]) / gl, Math.abs(R[i]) / gr); // (before the pan)
    assert.ok(pk <= 0.3 * 1.001, `${potential}/${k}: peak ${pk.toFixed(3)} before the pan`);
  }
  for (const o of [{ detector: 'x' }, { potential: 'hydrogen', lock: false, nbar: 44, sigma: 1.3, detector: 'x', T1: 20 }, { sigma: 0.6, detector: 'x' }]) {
    const { L, R } = render(P(o), [48, 52, 55, 60, 64, 67].map((k) => [0, 'on', k, 1]), 0.4);
    let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    assert.ok(pk < 1.15, `${JSON.stringify(o)}: six-note chord peaks ${pk.toFixed(2)}`);
  }
});
// (six notes struck at once on the electrode all start on the same side: their first swings add)
test('chords: six forte notes stay under 1.3 for every well and detector, locked and at fixed n̄', () => {
  let worst = 0, wc = '';
  for (const potential of ['box', 'morse', 'hydrogen', 'bouncer', 'harmonic']) for (const detector of ['x', 'v', 'a']) for (const lock of [true, false]) {
    const { L, R } = render(P({ potential, detector, lock }), [36, 48, 55, 60, 64, 72].map((k) => [0, 'on', k, 1]), 0.25);
    let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    if (pk > worst) { worst = pk; wc = `${potential}/${detector}/${lock ? 'locked' : 'fixed n̄'}`; }
  }
  assert.ok(worst < 1.3, `loudest chord ${worst.toFixed(2)} (${wc})`);
  console.log(`        loudest six-note chord ${worst.toFixed(2)} (${wc})`);
});
test('polyphony: all voices together sum at most 3000 pairs, the weakest dropped first', () => {
  // was: 24 hydrogen voices at σ = 4 with the antenna summed 7200 pairs (67 % of a core)
  const p = P({ potential: 'hydrogen', sigma: 4, detector: 'a', T1: 30 }), e = new QuantumEngine(FS); e.setParams(p); e.setSustain(true);
  const bl = new Float64Array(128), br = new Float64Array(128);
  for (let i = 0; i < 24; i++) { e.noteOn(48 + i, 0.8); for (let b = 0; b < 8; b++) e.process(bl, br, 128); }
  const total = e.voices.reduce((s, v) => s + v.active, 0), last = e.voices[e.voices.length - 1], first = e.voices[0];
  assert.ok(total <= 3000 * 1.02, `${total} pairs summed`);
  // the newest note keeps its strongest lines: what it drops is a small part of its signal
  const kept = (v) => { let a = 0, s = 0; for (let g = 0; g < v.G; g++) for (let i = v.ga[g], q = v.gw[g]; i < v.gb[g]; i++, q++) a += v.w[q] ** 2; for (const q of v.pk.pairs) s += q.w ** 2; return a / s; };
  assert.ok(kept(last) > 0.85 && last.active >= first.active, `newest note keeps ${(100 * kept(last)).toFixed(1)} % of its power (${last.active} pairs; the oldest ${first.active})`);
  console.log(`        24 voices: ${total} pairs; the newest keeps ${last.active} (${(100 * kept(last)).toFixed(1)} % of its power), the oldest ${first.active}`);
});
// ---- coherent restrike: Ramsey fringes between two pulses -----------------------------------------

// A key struck at t = 0 (velocity v1) and again `delay` seconds later (v2, or the velocity that
// makes the second pulse's amplitude equal to what is left of the first's), rendered in blocks that
// put the second note-on at exactly round(delay·FS) samples. Returns the output from the restrike
// on, the ratio ρ of the two pulses' amplitudes at the second's centre, how many samples after the
// note-on that centre is (the pump's lead), and the engine.
function restrike(params, key, delay, after, { v1 = 0.8, v2, match = false } = {}) {
  const e = new QuantumEngine(FS); e.setParams(params);
  const at = Math.round(delay * FS), n = at + Math.round(after * FS), L = new Float64Array(n), R = new Float64Array(n);
  e.noteOn(key, v1);
  let s = 0, rho = 0, lead = 0;
  while (s < n) {
    if (s === at) {
      // the first packet's level now, and at the second pulse's centre: T₁ acts from a sample's output on
      const probe = new QuantumEngine(FS); probe.setParams(params); probe.noteOn(key, 1);
      lead = -probe.voices[0].count;
      const env1 = e.voices.at(-1).env * Math.exp(-(lead - 1) / (FS * params.T1));
      const vel = match ? env1 / 0.3 : v2; // OUT = 0.3 at full velocity
      e.noteOn(key, vel);
      rho = Math.sqrt(env1 / (0.3 * vel));
    }
    const m = Math.min(128, (s < at ? at : n) - s), bL = new Float64Array(m), bR = new Float64Array(m);
    e.process(bL, bR, m);
    L.set(bL, s); R.set(bR, s); s += m;
  }
  return { y: L.subarray(at), rho, lead, e };
}
const TREV = Math.round((2 * 60 / 90) * FS); // the default lock: T_rev = 2 beats at 90 BPM, 64 000 samples

test('coherent restrike is off by default: a restruck key adds a fresh packet (two voices); on, the second pulse takes the first\'s packet over (one voice)', () => {
  assert.equal(DEFAULTS.ramsey, false);
  const off = restrike(P(), 60, 0.3, 0.05, { v2: 0.8 }), on = restrike(P({ ramsey: true }), 60, 0.3, 0.05, { v2: 0.8 });
  assert.equal(off.e.voices.length, 2);
  assert.equal(on.e.voices.length, 1);
  assert.ok(on.e.voices[0].coh && !off.e.voices[1].coh);
  // a knob that changes the well since: the packets differ, so the restrike is a fresh atom again
  const e = new QuantumEngine(FS); e.setParams(P({ ramsey: true }));
  e.noteOn(60, 0.8); e.process(new Float64Array(128), new Float64Array(128), 128);
  e.setParams(P({ ramsey: true, sigma: 3 })); e.noteOn(60, 0.8);
  assert.equal(e.voices.length, 2);
});

test('Ramsey\'s formula: restruck on a full revival of the square well, the note is |1 + ρe^(i(2πδT − φ))|² times a fresh one, for any detuning δ and phase φ', () => {
  const T = TREV / FS;
  for (const [d, ph] of [[0, 0], [0, 180], [0, 90], [0.25, 0], [-1.3, 45], [3.7, 300]]) {
    const p = P({ ramsey: true, ramseyDetune: d, ramseyPhase: ph, T1: 30 });
    const { y, rho } = restrike(p, 57, T, 0.25, { v2: 0.6 });
    const single = note(p, 57, 0.25, 0.6).L;
    const Phi = 2 * PI * d * T - (ph * PI) / 180, want = 1 + rho * rho + 2 * rho * Math.cos(Phi);
    let worst = 0, peak = 0;
    for (let i = 960; i < single.length; i++) { worst = Math.max(worst, Math.abs(y[i] - want * single[i])); peak = Math.max(peak, Math.abs(single[i])); } // past the pump (20 ms)
    assert.ok(worst < 1e-6 * peak * Math.max(want, 1), `δ = ${d} Hz, φ = ${ph}°: off by ${(worst / peak).toExponential(2)} (×${want.toFixed(3)} wanted)`);
  }
  // equal amplitudes, out of phase: the second pulse takes the packet back (the atom is in its ground state)
  const p = P({ ramsey: true, ramseyPhase: 180, T1: 30 });
  const { y, e } = restrike(p, 57, T, 0.25, { match: true });
  assert.ok(rms(y, 960, y.length) < 1e-6, `${rms(y, 960, y.length)}`);
  assert.equal(e.voices.length, 0, 'nothing left to radiate: the voice ends');
});

test('a restrike on the box\'s half revival keeps every other level: its dipole, which joins levels of opposite parity only, goes silent (a dark state); the Morse well\'s, with every Δn, does not', () => {
  const p = P({ ramsey: true, T1: 30 });
  const box = restrike(p, 57, TREV / 2 / FS, 0.25, { match: true }), single = note(p, 57, 0.25, 0.8).L;
  const quiet = rms(box.y, 960, box.y.length) / rms(single, 960, single.length);
  assert.ok(quiet < 1e-5, `box at T_rev/2: ${(20 * Math.log10(quiet)).toFixed(0)} dB`);
  const pm = P({ ramsey: true, T1: 30, potential: 'morse' });
  const morse = restrike(pm, 57, TREV / 2 / FS, 0.25, { match: true }), sm = note(pm, 57, 0.25, 0.8).L;
  assert.ok(rms(morse.y, 960, morse.y.length) > 0.3 * rms(sm, 960, sm.length), 'Morse at T_rev/2');
});

test('averaged over the second pulse\'s phase (0°, 90°, 180°, 270°), a coherent restrike is two separate packets, sample for sample from its centre on, at any delay and in any well', () => {
  for (const [potential, key, delay] of [['box', 57, 0.3137], ['morse', 45, 0.0517], ['hydrogen', 64, 0.9], ['bouncer', 70, 0.5]]) {
    const p = P({ potential, T1: 30 });
    const { y: inc, lead } = restrike(p, key, delay, 0.3, { v2: 0.5 });
    const mean = new Float64Array(inc.length);
    for (const ph of [0, 90, 180, 270]) restrike({ ...p, ramsey: true, ramseyPhase: ph }, key, delay, 0.3, { v2: 0.5 }).y.forEach((v, i) => { mean[i] += v / 4; });
    // (from the second pulse's centre on: over the pump's lead the first packet's T₁ decay waits for it)
    let worst = 0, peak = 0;
    for (let i = lead; i < inc.length; i++) { worst = Math.max(worst, Math.abs(mean[i] - inc[i])); peak = Math.max(peak, Math.abs(inc[i])); }
    assert.ok(worst < 1e-6 * peak, `${potential}: ${(worst / peak).toExponential(2)}`);
  }
});

test('dephasing before the restrike washes the fringes out: on a full revival the contrast between φ = 0° and 180° falls as Γ_φ grows', () => {
  const contrast = (dephase) => {
    const p = P({ ramsey: true, T1: 30, dephase });
    const [a, b] = [0, 180].map((ph) => restrike({ ...p, ramseyPhase: ph }, 57, TREV / FS, 0.12, { match: true }).y).map((y) => rms(y, 960, y.length));
    return (a - b) / (a + b);
  };
  const c = [0, 0.3, 1, 3].map(contrast);
  assert.ok(c[0] > 0.999, `Γ_φ = 0: ${c[0]}`);
  for (let i = 1; i < c.length; i++) assert.ok(c[i] < c[i - 1], c.map((v) => v.toFixed(3)).join(' '));
  assert.ok(c[3] < 0.5 * c[0], c.map((v) => v.toFixed(3)).join(' '));
  console.log(`        contrast at Γ_φ = 0, 0.3, 1, 3 s⁻¹: ${c.map((v) => v.toFixed(3)).join(', ')}`);
});

test('a coherent restrike has no click: at the second pulse the output moves no more than the note\'s own swing, for every detector', () => {
  for (const detector of ['x', 'v', 'a']) for (const delay of [0.02, 0.3137, TREV / 2 / FS]) {
    const p = P({ ramsey: true, detector, T1: 30 });
    const { y } = restrike(p, 45, delay, 0.05, { v2: 0.8 }), single = note(p, 45, 0.05, 0.8).L;
    let jump = 0, swing = 0;
    for (let i = 1; i < 48; i++) jump = Math.max(jump, Math.abs(y[i] - y[i - 1]));
    for (let i = 1; i < single.length; i++) swing = Math.max(swing, Math.abs(single[i] - single[i - 1]));
    assert.ok(jump < 4 * swing, `${detector} at ${delay.toFixed(3)} s: step ${jump.toExponential(2)} vs the note's ${swing.toExponential(2)}`);
  }
});

test('seeded random combinations of knob extremes at 44.1 and 48 kHz: no NaN, bounded output', () => {
  const ranged = GROUPS.flatMap((g) => g.params).filter((q) => !['volume', 'room', 'velocity'].includes(q.id));
  let seed = 12345, worst = { pk: 0 };
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const fs of [44100, 48000]) for (let c = 0; c < 15; c++) {
    const p = P();
    for (const q of ranged) {
      if (rnd() < 0.5) continue;
      if (q.type === 'select') p[q.id] = q.options[Math.floor(rnd() * q.options.length)][0];
      else if (q.type === 'checkbox') p[q.id] = rnd() < 0.5;
      else p[q.id] = rnd() < 0.5 ? q.min : q.max;
    }
    const e = new QuantumEngine(fs); e.setParams(p);
    const n = Math.round(1.5 * fs), bl = new Float64Array(128), br = new Float64Array(128);
    let pk = 0;
    for (let s = 0; s < n; s += 128) {
      if (s === 0) [36, 50, 57, 64, 71, 84, 96].forEach((k) => e.noteOn(k, 1, makePacket(k, p, { fMax: Math.min(20000, 0.45 * fs) })));
      if (s === Math.round(0.06 * fs / 128) * 128) [36, 50, 57, 64, 71, 84, 96].forEach((k) => e.noteOn(k, 1));
      if (s === Math.round(1.2 * fs / 128) * 128) [36, 50, 57, 64, 71, 84, 96].forEach((k) => e.noteOff(k));
      e.process(bl, br, 128);
      for (let i = 0; i < 128; i++) { assert.ok(Number.isFinite(bl[i] + br[i]), `${fs} Hz ${JSON.stringify(p)}: NaN`); pk = Math.max(pk, Math.abs(bl[i]), Math.abs(br[i])); }
    }
    // (a coherent restrike can add the two pulses' amplitudes: up to 4× one's power, twice two atoms')
    if (pk / (p.ramsey ? 2 : 1) > worst.pk) worst = { pk: pk / (p.ramsey ? 2 : 1), p, fs };
  }
  assert.ok(worst.pk < 2, `${worst.fs} Hz: seven notes struck twice peak ${worst.pk.toFixed(2)} (half that if coherent) with ${JSON.stringify(worst.p)}`);
  console.log(`        loudest of 30 (seven notes struck twice): ${worst.pk.toFixed(2)}`);
});
test('CPU: 10 voices render well under real time', () => {
  const run = (p) => {
    const e = new QuantumEngine(FS); e.setParams(p);
    for (const k of [36, 43, 48, 52, 55, 60, 64, 67, 72, 84]) e.noteOn(k, 0.8);
    const bl = 128, L = new Float32Array(bl), R = new Float32Array(bl), n = Math.round((2 * FS) / bl);
    for (let i = 0; i < 100; i++) e.process(L, R, bl);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) e.process(L, R, bl);
    return (performance.now() - t0) / 1000 / 2;
  };
  const def = run(P({ T1: 30 })), worst = run(P({ potential: 'hydrogen', sigma: 4, detector: 'a', T1: 30 }));
  console.log(`        10 voices: ${(100 * def).toFixed(1)} % of real time (defaults), ${(100 * worst).toFixed(1)} % (hydrogen, σ = 4, antenna: 300 pairs each)`);
  assert.ok(def < 0.3 && worst < 0.4, `${def}, ${worst}`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
