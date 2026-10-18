// Singing Arc checks. Run: node test/arc-tests.mjs
//
// The arc against independent results: Ayrton's equation as its static limit, the analytic
// small-signal impedance against a numerical linearisation, Mayr's hysteresis loop (its area,
// direction and limits), the thermophone against first principles. The circuit: the quartic's
// roots against the state matrix's eigenvalues, the arc's inductance pulling the note about
// 1 % below Kelvin's formula. Then the engine against the model: growth rate and frequency
// from the linear analysis, the threshold, the ceiling τ sets, the steady notes the
// capacitors are cut for, capacitors in parallel, the first and second kinds, the hiss, the
// radiated pressure; and keys, arcs, the talking arc, levels, stability and CPU.
//
// The model and the engine are the C++ (native/instruments/arc), built as WebAssembly: the model's
// functions through arc-wasm.js. What they are checked against (Ayrton's formula, Z(jω) in closed
// form, Mayr's law linearised, integrated and as a state matrix, the thermophone) is arc-model.js.

import assert from 'node:assert/strict';
import {
  TAU, KEY_LO, KEY_HI, keyFreq, noteName, ayrtonV, zArc, zArcNumeric, negLimit, arcCycle, describing, loopArea,
  stateMatrix, kelvinC, tuneKey, pressureGain, pressureGainFirstPrinciples, polyRoots, AIR,
} from '../arc/src/arc-model.js';
import { INSTRUMENT } from '../arc/src/arc-instrument.js';
import { wasmModel } from '../arc/src/arc-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { DEFAULTS, GROUPS, PRESETS } from '../arc/src/arc-params.js';

const ArcEngine = await loadEngine(INSTRUMENT);
const { arcOp, staticV, circuit, linearAnalysis, thresholdR, thresholdCurrent, upperLimit, steadyNote, capFor, hissCurrent } = await wasmModel();
// the keyboard's capacitor bank, as the page cuts it and offers it to the engine (P.table)
const keyCaps = (p) => ({ key: tuneKey(p), lo: KEY_LO, caps: Float64Array.from({ length: KEY_HI - KEY_LO + 1 }, (_, i) => capFor(KEY_LO + i, p)) });

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const rel = (a, b) => Math.abs(a / b - 1);
const tables = new Map();
const table = (p) => { const k = JSON.stringify(p); if (!tables.has(k)) tables.set(k, keyCaps(p)); return tables.get(k); };

// Run the engine through events ([t, 'on', key] | [t, 'off', key] | [t, 'params', P] | [t, 'kick', amps]),
// in 128-sample blocks; tap(engine, t) after every block.
function run(params, events, sec, { fs = FS, seed = 1, opts = {}, tap, bl = 128 } = {}) {
  const e = new ArcEngine(fs, seed, opts);
  e.setParams(params);
  const n = Math.round(sec * fs), L = new Float64Array(n), R = new Float64Array(n), bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, ...r]) => [Math.round(t * fs), ...r]).sort((a, b) => a[0] - b[0]);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j][0] <= s) {
      const [, type, a] = ev[j++];
      if (type === 'on') e.noteOn(a, 0.8); else if (type === 'off') e.noteOff(a); else if (type === 'params') e.setParams(a); else if (type === 'kick') e.kick(a);
    }
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; R[s + i] = bR[i]; }
    tap?.(e, (s + bl) / fs);
  }
  return { L, R, e };
}
const peakAbs = (x, a = 0, b = x.length) => { let p = 0; for (let i = a; i < b; i++) p = Math.max(p, Math.abs(x[i])); return p; };
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
// complex amplitude of frequency f over [a, a + m) (Hann window)
function demod(x, f, a, m, fs = FS) {
  const w = (TAU * f) / fs; let re = 0, im = 0;
  for (let i = a; i < a + m; i++) { const h = 0.5 - 0.5 * Math.cos((TAU * (i - a)) / m); re += h * x[i] * Math.cos(w * i); im -= h * x[i] * Math.sin(w * i); }
  return [re, im];
}
const amp = (x, f, a, m) => Math.hypot(...demod(x, f, a, m));
// sounding frequency near f over [a, b): the phase advance of the demodulated signal
function freqAt(x, f, a, b, fs = FS) {
  const m = 4096, ph = (s, fr) => { const [re, im] = demod(x, fr, s, m, fs); return Math.atan2(im, re); };
  const wrap = (d) => d - TAU * Math.round(d / TAU);
  const f1 = f + (wrap(ph(a + 512, f) - ph(a, f)) * fs) / (TAU * 512);
  return f1 + (wrap(ph(b - m, f1) - ph(a, f1)) * fs) / (TAU * (b - m - a));
}
// largest sample-to-sample step in [a, b) of a signal
const maxStep = (x, a, b) => { let m = 0; for (let i = Math.max(1, a); i < b; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1])); return m; };

console.log('the arc');
test('static limit is Ayrton\'s equation V = a + b·l + (c + d·l)/I (above the floor), and its heat loss u·i = A·I + B', () => {
  assert.ok(Math.abs(ayrtonV(4, 3) - (38.88 + 2.074 * 3 + (11.66 + 10.54 * 3) / 4)) < 1e-12);
  for (const l of [1, 3, 6]) for (const I0 of [2, 4, 8, 14]) {
    const op = arcOp(P({ current: I0, gap: l }));
    for (const I of [I0, 1.5 * I0, 3 * op.Xm, 5 * op.Xm]) {
      if (I < 2 * op.Xm) continue;
      assert.ok(rel(staticV(I, op), ayrtonV(I, l)) < 1e-3, `l ${l}, I ${I}: ${staticV(I, op)} vs ${ayrtonV(I, l)}`);
      assert.ok(rel(staticV(I, op) * I, op.A * I + op.B) < 1e-3, 'heat loss');
    }
    // R_d = R₀ − K is a small difference of large numbers: the floor's rounding shows at the 1 % level
    assert.ok(rel(op.Rd, -op.B / (I0 * I0)) < 0.01, `R_d = ${op.Rd}, −B/I² = ${-op.B / I0 / I0}`);
    // the floor: the curve peaks near the re-strike voltage and is ohmic below X_m
    let vmax = 0; for (let I = 0.05; I < I0; I += 0.01) vmax = Math.max(vmax, staticV(I, op));
    assert.ok(Math.abs(vmax / op.Ur - 1) < 0.08, `peak ${vmax.toFixed(1)} V vs U_r ${op.Ur.toFixed(1)} V`);
  }
});
test('small-signal Z(jω) equals a numerical linearisation of the arc, 10 Hz – 100 kHz', () => {
  for (const o of [{}, { current: 8, gap: 1 }, { current: 2, gap: 6, tau: 200 }]) {
    const op = arcOp(P(o));
    for (let f = 10; f <= 1e5; f *= 1.7) {
      const a = zArc(TAU * f, op), b = zArcNumeric(TAU * f, op), m = Math.hypot(...a);
      assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-5 * m, `${f} Hz: ${a} vs ${b}`);
    }
  }
});
test('Z(jω): −B/I² at low frequency, R₀ at high, inductive throughout, negative only below ωτ = 2w√(K/R₀ − 1)', () => {
  const op = arcOp(P()), lo = zArc(1e-3, op), hi = zArc(1e9, op);
  assert.ok(rel(lo[0], op.Rd) < 1e-9 && rel(op.Rd, -op.B / op.I0 ** 2) < 0.01 && Math.abs(lo[1]) < 1e-6, `${lo}`);
  assert.ok(rel(hi[0], op.R0) < 1e-6, `${hi}`);
  for (let f = 1; f < 1e6; f *= 2) assert.ok(zArc(TAU * f, op)[1] > 0, `inductive at ${f} Hz`);
  const wl = negLimit(op);
  assert.ok(Math.abs(zArc(wl, op)[0]) < 1e-9 * op.R0 && zArc(0.99 * wl, op)[0] < 0 && zArc(1.01 * wl, op)[0] > 0, `${(wl / TAU).toFixed(0)} Hz`);
  // the inductance at low frequency: L_arc = Kτ/(2w)
  const w = TAU * 50; assert.ok(rel(zArc(w, op)[1] / w, op.Larc) < 1e-3);
});
test('Mayr hysteresis: a small loop has area π I₁² Im Z and runs clockwise; it collapses onto the static curve as ωτ → 0 and onto a line of slope R₀ as ωτ → ∞', () => {
  const op = arcOp(P()), I1 = 0.01 * op.I0;
  for (const f of [100, 1000, 6000]) {
    const cyc = arcCycle(op, I1, TAU * f, { M: 2048, cycles: 6 }), area = loopArea(cyc), want = Math.PI * I1 * I1 * zArc(TAU * f, op)[1];
    assert.ok(area > 0, 'clockwise (the voltage is higher while the current rises)');
    assert.ok(rel(area, want) < 0.02, `${f} Hz: area ${area.toExponential(3)} vs ${want.toExponential(3)}`);
  }
  // large swing: the loop's widest gap from the static curve shrinks with ωτ
  const gap = (f) => { const c = arcCycle(op, 0.5 * op.I0, TAU * f, { M: 2048, cycles: 6 }); let m = 0; for (let k = 0; k < c.i.length; k++) m = Math.max(m, Math.abs(c.u[k] - staticV(c.i[k], op))); return m; };
  const g = [10, 100, 1000].map(gap);
  assert.ok(g[0] < 0.15 && g[0] < g[1] / 5 && g[1] < g[2], `max distance from the static curve ${g.map((v) => v.toFixed(3))} V`);
  const fast = arcCycle(op, 0.2 * op.I0, TAU * 2e5, { M: 2048, cycles: 6 });
  let dev = 0; for (let k = 0; k < fast.i.length; k++) dev = Math.max(dev, Math.abs(fast.u[k] - fast.U0 - op.R0 * (fast.i[k] - op.I0) * (fast.U0 / op.u0)));
  assert.ok(dev < 0.03 * op.u0, `fast loop deviates ${dev.toFixed(3)} V from a straight line`);
});
test('the hyperbola alone cannot hold a sinusoidal swing (subcritical); the hot-carbon floor turns it back before the current reaches zero', () => {
  for (const f of [131, 523]) {
    const bare = arcOp(P({ restrike: 50 })), op = arcOp(P()), w = TAU * f;
    const re = (o, a) => describing(o, a * o.I0, w, { M: 1024, cycles: 4 })[0];
    const xs = [0.02, 0.3, 0.6, 0.8, 0.9], b = xs.map((a) => re(bare, a)), d = xs.map((a) => re(op, a));
    for (let k = 1; k < xs.length; k++) assert.ok(b[k] < b[k - 1], `bare arc at ${f} Hz: Re Z₁ ${b.map((v) => v.toFixed(2))}`);
    assert.ok(d[4] > Math.min(...d), `floor at ${f} Hz: Re Z₁ ${d.map((v) => v.toFixed(2))} turns back`);
  }
});
test('thermophone: (γ − 1)/(4π c² r) equals 1/(4π r c_p T) for air, and falls as 1/r', () => {
  assert.ok(rel(pressureGain(1), pressureGainFirstPrinciples(1)) < 5e-3, `${pressureGain(1)} vs ${pressureGainFirstPrinciples(1)}`);
  assert.ok(rel(pressureGain(2), pressureGain(1) / 2) < 1e-12);
  assert.ok(rel(AIR.c * AIR.c, (AIR.gamma * 101325) / AIR.rho) < 0.01, 'c² = γ p₀/ρ');
});

console.log('the circuit');
test('linear analysis: the quartic\'s roots are the eigenvalues of the circuit\'s state matrix', () => {
  // characteristic polynomial of the 4×4 state matrix (Faddeev–LeVerrier)
  const charPoly = (A) => {
    const n = A.length, I = A.map((r, i) => r.map((_, j) => +(i === j))), c = new Array(n + 1).fill(0); c[n] = 1;
    let Mk = A.map((r) => r.map(() => 0));
    const mul = (X, Y) => X.map((r) => Y[0].map((_, j) => r.reduce((s, a, l) => s + a * Y[l][j], 0)));
    for (let k = 1; k <= n; k++) { Mk = mul(A, Mk).map((r, i) => r.map((v, j) => v + c[n - k + 1] * I[i][j])); c[n - k] = -mul(A, Mk).reduce((s, r, i) => s + r[i], 0) / k; }
    return c;
  };
  for (const [o, key] of [[{}, 48], [{}, 72], [{ current: 6, tau: 120, coil: 5 }, 60], [{ current: 2, gap: 6 }, 84]]) {
    const p = P(o), C = kelvinC(keyFreq(key), p.coil * 1e-3), la = linearAnalysis(circuit(p, C)), r = la.s;
    const ev = polyRoots(charPoly(stateMatrix(p, C, arcOp(p))));
    for (const q of la.roots) {
      const near = Math.min(...ev.map((e) => Math.hypot(e[0] - q[0], e[1] - q[1])));
      assert.ok(near < 1e-6 * Math.hypot(...q) + 1e-6, `root ${q} (nearest eigenvalue ${near})`);
    }
    assert.ok(la.roots.some((q) => q[0] === r[0] && q[1] === r[1]), 'the musical root is one of them');
    assert.ok(la.sigma === r[0] && rel(la.f, r[1] / TAU) < 1e-12, 'σ and f are the root\'s');
  }
});
test('the arc\'s thermal lag acts as an inductance: notes start about 1 % below Kelvin\'s formula', () => {
  const p = P(), op = arcOp(p), L = p.coil * 1e-3, want = op.Larc / (2 * L);
  for (const key of [60, 67, 72, 79, 84]) {
    const f = keyFreq(key), la = linearAnalysis(circuit(p, kelvinC(f, L))), shift = 1 - la.f / f;
    assert.ok(shift > 0.008 && shift < 0.013, `${noteName(key)}: ${(shift * 100).toFixed(2)} %`);
    assert.ok(Math.abs(shift - want) < 0.003, `${noteName(key)}: ${(shift * 100).toFixed(2)} % vs L_arc/2L = ${(want * 100).toFixed(2)} %`);
  }
});
// growth rate and frequency of the engine in the linear regime, from a 1 mA kick with no noise
function growth(p, key) {
  const C = kelvinC(keyFreq(key), p.coil * 1e-3), la = linearAnalysis(circuit(p, C)), f = la.f;
  const { L } = run({ ...p, tune: 'kelvin' }, [[0, 'on', key], [0.002, 'kick', 1e-3]], 0.08, { opts: { quiet: true } });
  const m = Math.round((2 * FS) / f), t1 = 0.012, t2 = Math.min(0.05, t1 + 3 / Math.max(la.sigma, 30));
  const a1 = Math.round(t1 * FS), a2 = Math.round(t2 * FS), z1 = demod(L, f, a1, m), z2 = demod(L, f, a2, m);
  const sigma = Math.log(Math.hypot(...z2) / Math.hypot(...z1)) / ((a2 - a1) / FS);
  let dph = Math.atan2(z2[1], z2[0]) - Math.atan2(z1[1], z1[0]); dph -= TAU * Math.round(dph / TAU);
  return { sigma, f: f + dph / (TAU * ((a2 - a1) / FS)), la };
}
test('start: the engine\'s note grows at the linear analysis\'s rate (within 3 %) and starts at its frequency (within 2 cents)', () => {
  for (const [o, key] of [[{}, 60], [{}, 72], [{ coilR: 2.5 }, 67], [{ current: 2.2, coil: 50 }, 55]]) {
    const p = P(o), g = growth(p, key);
    assert.ok(rel(g.sigma, g.la.sigma) < 0.03, `${noteName(key)} ${JSON.stringify(o)}: σ ${g.sigma.toFixed(2)} vs ${g.la.sigma.toFixed(2)} /s`);
    assert.ok(Math.abs(cents(g.f, g.la.f)) < 2, `${noteName(key)}: ${g.f.toFixed(3)} vs ${g.la.f.toFixed(3)} Hz`);
  }
});
test('threshold: with the coil\'s resistance 3 % under the analysed R_th the note grows; 3 % over, it dies', () => {
  const p = P(), key = 64, C = kelvinC(keyFreq(key), p.coil * 1e-3), Rth = thresholdR(p, C);
  assert.ok(Rth > 3 && Rth < 6, `R_th = ${Rth.toFixed(3)} Ω (|R_d| = ${(-arcOp(p).Rd).toFixed(3)} Ω)`);
  const lvl = (R) => { const { L } = run({ ...p, coilR: R, tune: 'kelvin' }, [[0, 'on', key], [0.002, 'kick', 2e-3]], 0.6, { opts: { quiet: true } }); return [rms(L, 4800, 9600), rms(L, 24000, 28800)]; };
  const [a0, a1] = lvl(0.97 * Rth), [b0, b1] = lvl(1.03 * Rth);
  assert.ok(a1 > 1.2 * a0, `under: ${a0.toExponential(2)} → ${a1.toExponential(2)}`);
  assert.ok(b1 < 0.85 * b0, `over: ${b0.toExponential(2)} → ${b1.toExponential(2)}`);
});
test('ceiling: a slow column (τ = 150 µs) sings below the analysed upper limit and is silent above it', () => {
  const p = P({ tau: 150 }), fl = upperLimit(p), kc = table(p);
  assert.ok(fl > 650 && fl < 1000, `upper limit ${fl.toFixed(0)} Hz`);
  assert.ok(upperLimit(P()) > 4 * fl, 'the default column sings far higher');
  const lvl = (key) => { const { L } = run({ ...p, table: kc }, [[0, 'on', key]], 0.9); return rms(L, 33600, 43200); };
  const below = [64, 67, 72].filter((k) => keyFreq(k) < 0.85 * fl), above = [79, 81, 84].filter((k) => keyFreq(k) > 1.05 * fl);
  assert.ok(below.length && above.length);
  for (const k of below) assert.ok(lvl(k) > 0.01, `${noteName(k)} (${keyFreq(k).toFixed(0)} Hz) sings: ${lvl(k)}`);
  for (const k of above) assert.ok(lvl(k) < 1e-3, `${noteName(k)} (${keyFreq(k).toFixed(0)} Hz) silent: ${lvl(k)}`);
});

console.log('notes');
test('every key sounds its note within 1 cent (one arc, one key, capacitors cut for the sounding note)', () => {
  const p = P(), kc = table(p);
  let worst = 0;
  for (let key = KEY_LO; key <= KEY_HI; key++) {
    const { L } = run({ ...p, table: kc }, [[0, 'on', key]], 0.75), f = freqAt(L, keyFreq(key), 14400, 36000);
    worst = Math.max(worst, Math.abs(cents(f, keyFreq(key))));
    assert.ok(Math.abs(cents(f, keyFreq(key))) < 1, `${noteName(key)}: ${cents(f, keyFreq(key)).toFixed(2)} ¢`);
  }
  console.log(`        (worst ${worst.toFixed(2)} ¢)`);
});
test('every key speaks within 120 ms at the defaults (half its final level)', () => {
  const p = P(), kc = table(p);
  for (let key = KEY_LO; key <= KEY_HI; key += 3) {
    const { L } = run({ ...p, table: kc }, [[0, 'on', key]], 0.5), W = 480, fin = rms(L, L.length - 4800, L.length);
    let t = Infinity; for (let a = 0; a + W < L.length; a += W) if (rms(L, a, a + W) > 0.5 * fin) { t = a / FS; break; }
    assert.ok(t < 0.12, `${noteName(key)}: ${(t * 1000).toFixed(0)} ms`);
  }
});
test('capacitors cut by Kelvin\'s formula: every note sounds flat, by 1 % at the top and more in the bass', () => {
  const p = P({ tune: 'kelvin' }), sh = [];
  for (const key of [48, 60, 72, 84]) { const { L } = run(p, [[0, 'on', key]], 0.7), f = freqAt(L, keyFreq(key) * 0.98, 14400, 33600); sh.push(1 - f / keyFreq(key)); }
  assert.ok(sh[3] > 0.007 && sh[3] < 0.015, `C6 ${(sh[3] * 100).toFixed(2)} % flat`);
  for (let k = 1; k < sh.length; k++) assert.ok(sh[k] < sh[k - 1] + 1e-3, `${sh.map((v) => (v * 100).toFixed(2))} %`);
});
test('a quick tune on one arc: every note of a detached melody speaks, in tune', () => {
  const p = P(), kc = table(p), notes = [67, 67, 69, 66, 67, 69, 71, 71, 72, 71, 69, 67], d = 0.32, gap = 0.04;
  const ev = notes.flatMap((k, i) => [[0.05 + i * d, 'on', k], [0.05 + (i + 1) * d - gap, 'off', k]]);
  const { L } = run({ ...p, table: kc }, ev, 0.1 + notes.length * d);
  notes.forEach((k, i) => {
    const a = Math.round((0.05 + i * d + 0.16) * FS), b = Math.round((0.05 + (i + 1) * d - gap - 0.005) * FS);
    assert.ok(rms(L, a, b) > 0.015, `note ${i + 1} (${noteName(k)}) speaks: ${rms(L, a, b).toFixed(4)}`);
    const f = freqAt(L, keyFreq(k), a, b);
    assert.ok(Math.abs(cents(f, keyFreq(k))) < 3, `note ${i + 1} (${noteName(k)}): ${cents(f, keyFreq(k)).toFixed(2)} ¢`);
  });
});
test('one arc, two keys: the capacitors add and the pitch drops to the parallel value', () => {
  const p = P(), kc = table(p);
  for (const [a, b] of [[60, 64], [67, 79]]) {
    const C = kc.caps[a - KEY_LO] + kc.caps[b - KEY_LO], want = steadyNote(p, C).f;
    const { L, e } = run({ ...p, table: kc }, [[0, 'on', a], [0, 'on', b]], 0.9), f = freqAt(L, want, 19200, 43200);
    assert.ok(Math.abs(cents(f, want)) < 1.5, `${noteName(a)}+${noteName(b)}: ${f.toFixed(2)} Hz vs ${want.toFixed(2)} Hz`);
    assert.ok(f < keyFreq(a) && e.voiceCount() === 1, 'below both notes, on one arc');
  }
});
test('first kind at the default re-strike voltage; above it the arc goes out and re-strikes every cycle (the second kind)', () => {
  const first = P(), second = P({ restrike: 2.2 });
  const s1 = steadyNote(first, table(first).caps[12]), s2 = steadyNote(second, table(second).caps[12]);
  assert.ok(s1.iaMin > 0.15 * first.current && s1.uMax < arcOp(first).Ur, `first kind: current ${s1.iaMin.toFixed(2)}–${s1.iaMax.toFixed(2)} A`);
  assert.ok(s2.iaMin < 0.05 * second.current, `second kind: the current falls to ${s2.iaMin.toFixed(3)} A`);
  assert.ok(rel(s2.uMax, arcOp(second).Ur) < 0.05, `re-strike at ${s2.uMax.toFixed(1)} V vs U_r ${arcOp(second).Ur.toFixed(1)} V`);
  // the engine agrees: the arc's voltage peaks at the re-strike voltage
  let um = 0; run({ ...second, table: table(second) }, [[0, 'on', 60]], 0.6, { tap: (e, t) => { if (t > 0.3) um = Math.max(um, e.arcs[0].stUmax); } });
  assert.ok(rel(um, arcOp(second).Ur) < 0.05, `engine re-strikes at ${um.toFixed(1)} V`);
});
test('bistable: between the linear threshold current and the fold, a silent arc stays silent and a singing one keeps singing', () => {
  const p = P({ hiss: 0 }), key = 64, kc = table(p), C = kc.caps[key - KEY_LO], Ith = thresholdCurrent(p, kelvinC(keyFreq(key), p.coil * 1e-3));
  assert.ok(Ith > 10 && Ith < 14, `linear threshold ${Ith.toFixed(2)} A`);
  const I = 1.12 * Ith, hot = { ...p, current: I, table: kc };
  assert.ok(steadyNote(hot, C, { kick: 0.8 * I }).f > 0, 'a singing cycle exists past the threshold');
  const silent = run(hot, [[0, 'on', key]], 0.8).L;
  const ev = [[0, 'on', key]]; for (let t = 0.1; t < 0.9; t += 0.02) ev.push([t, 'params', { ...p, table: kc, current: 3 + (I - 3) * Math.min(1, (t - 0.1) / 0.6) }]);
  const held = run({ ...p, table: kc }, ev, 1.4).L;
  assert.ok(rms(silent, 28800, 38400) < 1e-3, `started at ${I.toFixed(1)} A: ${rms(silent, 28800, 38400).toExponential(2)}`);
  assert.ok(rms(held, 57600, 67200) > 0.03, `raised to ${I.toFixed(1)} A while singing: ${rms(held, 57600, 67200).toFixed(3)}`);
});
test('hiss: the arc is quiet below Ayrton\'s hissing current and hisses, broadband, above it', () => {
  const p = P(), Ih = hissCurrent(p.gap);
  const quiet = run(P({ current: 0.9 * Ih }), [], 0.5).L, loud = run(P({ current: 1.3 * Ih }), [], 0.5).L, off = run(P({ current: 1.3 * Ih, hiss: 0 }), [], 0.5).L;
  const q = rms(quiet, 9600, 24000), l = rms(loud, 9600, 24000), o = rms(off, 9600, 24000);
  assert.ok(q < 1e-3 && l > 30 * q && o < 1e-3, `rms ${q.toExponential(2)} below, ${l.toExponential(2)} above (${o.toExponential(2)} with hissing off)`);
  assert.ok(amp(loud, 6000, 9600, 8192) > 0.2 * amp(loud, 500, 9600, 8192), 'broadband');
});
test('radiated pressure: the output is (γ − 1)/(4π c² r)·dP/dt of the arc\'s own power, and halves at twice the distance', () => {
  for (const dist of [1, 2]) {
    const e = new ArcEngine(FS, 1, { os: 1 }); e.setParams(P({ dist })); e.noteOn(60);
    const L = new Float32Array(1), R = new Float32Array(1);
    let prev = e.arcs[0].P, err = 0, big = 0;
    for (let n = 0; n < 12000; n++) {
      e.process(L, R, 1);
      const Pn = e.arcs[0].P, want = pressureGain(dist) * (Pn - prev) * FS * Math.SQRT1_2;
      if (n > 6000) { err = Math.max(err, Math.abs(L[0] - want)); big = Math.max(big, Math.abs(want)); }
      prev = Pn;
    }
    assert.ok(err < 1e-5 * big + 1e-9, `r = ${dist} m: error ${err.toExponential(2)} of ${big.toExponential(2)}`);
  }
});

console.log('keys and arcs');
test('release: the contact opens, the note dies within 25 ms, without a click', () => {
  const p = P(), kc = table(p);
  for (const key of [48, 66, 84]) {
    const { L } = run({ ...p, table: kc }, [[0, 'on', key], [0.4, 'off', key]], 0.6, { opts: { quiet: true } }), r0 = Math.round(0.4 * FS);
    const sus = rms(L, r0 - 9600, r0), after = rms(L, r0 + 1200, r0 + 2400);
    assert.ok(after < 0.01 * sus, `${noteName(key)}: ${after.toExponential(2)} vs ${sus.toExponential(2)}`);
    assert.ok(maxStep(L, r0 - 128, r0 + 2400) < 1.2 * maxStep(L, r0 - 9600, r0), `${noteName(key)}: no click at release`);
  }
});
test('several arcs: a chord puts one key on each lamp, each at its own note', () => {
  const p = P({ mode: 'poly', arcs: 4 }), kc = table(P()), keys = [60, 64, 67, 72];
  const { L, R, e } = run({ ...p, table: kc }, keys.map((k) => [0, 'on', k]), 0.8);
  assert.equal(e.voiceCount(), 4);
  for (let k = 0; k < 4; k++) assert.equal(e.arcs[k].nM, 1, `arc ${k} holds one key`);
  const mix = L.map((v, i) => v + R[i]);
  for (const k of keys) {
    const a = amp(mix, keyFreq(k), 19200, 16384), b = amp(mix, keyFreq(k) * 1.03, 19200, 16384);
    assert.ok(a > 20 * b, `${noteName(k)} present`);
    assert.ok(Math.abs(cents(freqAt(mix, keyFreq(k), 19200, 38400), keyFreq(k))) < 2, `${noteName(k)} in tune`);
  }
});
test('re-pressing a key adds no voice; stealing waits until a note has sounded, then fades the oldest', () => {
  const p = P({ mode: 'poly', arcs: 2 }), kc = table(P());
  const { L, e } = run({ ...p, table: kc }, [[0, 'on', 60], [0, 'on', 64], [0.01, 'on', 67], [0.2, 'on', 64], [0.3, 'on', 72]], 0.6, {
    tap: (e, t) => {
      if (Math.abs(t - 0.1) < 0.002) assert.ok(!e.arcs.some((a) => a.has(67)), 'a note was stolen before it sounded');
      if (Math.abs(t - 0.25) < 0.002) assert.equal(e.voiceCount(), 2, 're-press made a voice');
    },
  });
  assert.ok(e.arcs[0].holds(72) || e.arcs[1].holds(72), 'C5 took an arc');
  assert.ok(amp(L, keyFreq(72), Math.round(0.5 * FS), 4096) > 10 * amp(L, keyFreq(60), Math.round(0.5 * FS), 4096), 'C5 sings on the stolen arc; C4 is gone');
  assert.ok(!e.arcs[0].holds(60) && !e.arcs[1].holds(60), 'the oldest note (C4) was stolen');
  assert.ok(e.arcs[0].holds(64) || e.arcs[1].holds(64), 'E4 kept');
  // no click: the switch-over's steepest step is no steeper than the new pair's own
  const s0 = Math.round(0.3 * FS);
  assert.ok(maxStep(L, s0 - 64, s0 + 2400) < 1.2 * maxStep(L, s0 + 9600, s0 + 14400), `the stolen note fades without a click: ${maxStep(L, s0 - 64, s0 + 2400).toFixed(4)} vs ${maxStep(L, s0 + 9600, s0 + 14400).toFixed(4)}`);
});
test('talking arc: the arc reproduces the singer at the microphone (its pitch and vowels), and falls quiet after', () => {
  const p = P({ mode: 'talk' });
  const { L } = run(p, [[0.05, 'on', 55], [1.6, 'off', 55]], 2);
  const f0 = keyFreq(55), during = rms(L, 24000, 72000), after = rms(L, 86400, 96000);
  assert.ok(during > 0.01 && after < 0.05 * during, `rms ${during.toFixed(4)} while singing, ${after.toExponential(2)} after`);
  for (const k of [1, 2, 3]) assert.ok(amp(L, k * f0, 24000, 16384) > 8 * amp(L, (k + 0.5) * f0, 24000, 16384), `harmonic ${k} of the voice`);
  // the vowel changes the spectrum: /a/ (F1 730 Hz) against /i/ (F1 270 Hz, F2 2290 Hz)
  const ratio = (a) => amp(L, 4 * f0, a, 8192) / amp(L, f0, a, 8192);
  const tA = Math.round((0.05 + 0.1) * FS), tI = Math.round((0.05 + 0.88) * FS);
  assert.ok(ratio(tA) > 1.5 * ratio(tI), `4th harmonic (${(4 * f0).toFixed(0)} Hz) relative to the 1st: /a/ ${ratio(tA).toFixed(2)}, /i/ ${ratio(tI).toFixed(2)}`);
});

console.log('levels and stability');
test('levels: single notes peak 0.05–0.5 across the keyboard (quieter in the bass: p ∝ dP/dt); six arcs in a chord stay under 1', () => {
  const p = P(), kc = table(p);
  for (const key of [48, 60, 72, 84]) { const pk = peakAbs(run({ ...p, table: kc }, [[0, 'on', key]], 0.5).L); assert.ok(pk > 0.05 && pk < 0.5, `${noteName(key)}: ${pk.toFixed(3)}`); }
  const r = run({ ...p, mode: 'poly', arcs: 6, table: kc }, [60, 64, 67, 72, 76, 84].map((k) => [0, 'on', k]), 0.6);
  const pk = Math.max(peakAbs(r.L), peakAbs(r.R));
  assert.ok(pk < 1, `chord ${pk.toFixed(3)}`);
});
test('no NaN or blow-up with extreme settings at 44.1 and 48 kHz', () => {
  const ranges = Object.fromEntries(GROUPS.flatMap((g) => g.params).filter((q) => q.min !== undefined).map((q) => [q.id, [q.min, q.max]]));
  const combos = [
    { current: ranges.current[0], gap: ranges.gap[1], tau: ranges.tau[0], restrike: ranges.restrike[1], coil: ranges.coil[0], coilR: ranges.coilR[0] },
    { current: ranges.current[1], gap: ranges.gap[0], tau: ranges.tau[1], restrike: ranges.restrike[0], coil: ranges.coil[1], coilR: ranges.coilR[1], hiss: 2 },
    { current: ranges.current[0], gap: ranges.gap[0], tau: ranges.tau[0], restrike: ranges.restrike[1], coil: ranges.coil[1], coilR: ranges.coilR[0], dist: 0.3 },
    { current: ranges.current[1], gap: ranges.gap[1], tau: ranges.tau[0], restrike: ranges.restrike[1], coil: ranges.coil[0], coilR: ranges.coilR[0], hiss: 2, dist: 0.3 },
    { current: ranges.current[0], gap: ranges.gap[1], tau: ranges.tau[1], restrike: ranges.restrike[0], mode: 'talk', voice: 6 },
    { current: 1.5, gap: 8, tau: 5, restrike: 2.5, mode: 'poly', arcs: 6, coil: 3, coilR: 0.02, tune: 'kelvin' },
  ];
  for (const fs of [44100, 48000]) for (const o of combos) {
    const p = P(o);
    const ev = [[0, 'on', 48], [0, 'on', 60], [0.05, 'on', 84], [0.1, 'params', P({ ...o, current: 4, gap: 2 })], [0.15, 'params', p], [0.25, 'off', 60], [0.3, 'off', 48]];
    const r = run(p, ev, 0.4, { fs });
    for (const x of [r.L, r.R]) for (const v of x) assert.ok(Number.isFinite(v) && Math.abs(v) < 4, `${fs} Hz ${JSON.stringify(o)}: ${v}`);
  }
});
test('seeded: the same seed gives the same sound; another seed, a different hiss', () => {
  const p = P({ current: 9 }), a = run(p, [[0, 'on', 60]], 0.2, { seed: 3 }).L, b = run(p, [[0, 'on', 60]], 0.2, { seed: 3 }).L, c = run(p, [[0, 'on', 60]], 0.2, { seed: 4 }).L;
  assert.ok(a.every((v, i) => v === b[i]));
  assert.ok(a.some((v, i) => v !== c[i]));
});
test('switching between one arc, several and the talking arc mid-note releases cleanly, and the arc sings again after', () => {
  const kc = table(P());
  const ev = [[0, 'on', 60], [0.2, 'params', P({ mode: 'talk', table: kc })], [0.25, 'on', 55], [0.5, 'params', P({ mode: 'poly', arcs: 3, table: kc })],
    [0.55, 'on', 64], [0.55, 'on', 67], [0.8, 'params', P({ table: kc })], [0.9, 'on', 72]];
  const { L, e } = run(P({ table: kc }), ev, 1.4);
  assert.ok(L.every(Number.isFinite));
  assert.ok(e.arcs[0].holds(72) && !e.arcs[0].holds(-1) && e.voiceCount() === 1, 'one arc, holding only C5');
  assert.ok(Math.abs(cents(freqAt(L, keyFreq(72), 52800, 67200), keyFreq(72))) < 2 && rms(L, 52800, 67200) > 0.02, 'C5 sings');
});
test('presets use real parameters', () => {
  const ids = new Set(GROUPS.flatMap((g) => g.params).map((q) => q.id));
  for (const pr of PRESETS) for (const k of Object.keys(pr.p)) assert.ok(ids.has(k), `${pr.name}: ${k}`);
});
test('CPU: six arcs singing take under 30 % of one core', () => {
  const e = new ArcEngine(FS); e.setParams(P({ mode: 'poly', arcs: 6, table: table(P()) }));
  for (const k of [55, 60, 64, 67, 72, 79]) e.noteOn(k);
  const L = new Float32Array(128), R = new Float32Array(128);
  for (let i = 0; i < 200; i++) e.process(L, R, 128);
  const t0 = performance.now(), N = 750;
  for (let i = 0; i < N; i++) e.process(L, R, 128);
  const load = (performance.now() - t0) / 1000 / ((N * 128) / FS);
  console.log(`        (${(load * 100).toFixed(1)} % of one core)`);
  assert.ok(load < 0.3, `${(load * 100).toFixed(1)} %`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
