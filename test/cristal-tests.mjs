// Cristal Baschet checks: the stem's beam elements against the exact beam, the friction law and
// its threshold against the engine's growth, the stick–slip, tuning, the strokes, the radiators and
// whiskers, Quality and CPU.
// Run: node test/cristal-tests.mjs

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../cristal/src/cristal-instrument.js';
import { wasmModel } from '../cristal/src/cristal-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { rodPitch } from '../tools/cristal-tuning.mjs';
import { keyFreq } from '../shared/dsp.js';

const CristalEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, strokes: 'endless', ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);

// Play one key; every block, call each(e, t) (t in seconds); return the output (left).
function play(key, params, { vel = 0.6, sec = 2, off = Infinity, quality, each } = {}) {
  const e = new CristalEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  e.noteOn(key, vel);
  const n = Math.round(sec * FS), L = new Float32Array(n);
  for (let s = 0; s < n; s += bl) {
    if (s / FS >= off && off >= 0) { e.noteOff(key); off = -1; }
    e.process(bL, bR, bl); L.set(bL.subarray(0, Math.min(bl, n - s)), s);
    each?.(e, s / FS);
  }
  return L;
}
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
// the rod's velocity, continuously, from the engine's trace (read every 1024 samples)
function rodTrace(key, params, { vel = 0.6, from = 1, to = 1.5 } = {}) {
  const e = new CristalEngine(FS);
  e.setParams(params); e.noteOn(key, vel);
  const T = 1024, a = Math.round((from * FS) / T), b = Math.round((to * FS) / T), v = [], u = [];
  for (let c = 0; c < b; c++) {
    for (let i = 0; i < T / bl; i++) e.process(bL, bR, bl);
    if (c >= a) { const V = e.trV, U = e.trU, tw = e.tw; for (let i = 0; i < T; i++) { v.push(V[(tw + i) % T]); u.push(U[(tw + i) % T]); } }
  }
  return { v, u };
}
const periods = (v) => { const z = []; for (let i = 1; i < v.length; i++) if (v[i - 1] < 0 && v[i] >= 0) z.push(i - 1 + -v[i - 1] / (v[i] - v[i - 1])); return z.slice(1).map((t, i) => t - z[i]); };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

console.log('physics');
// A clamped–clamped beam with a mass M at its middle: its symmetric modes, exactly. Half the beam,
// w = a(cosh βx − cos βx) + b(sinh βx − sin βx) (clamped at 0), flat at the middle, and the mass's
// inertia balanced by the two halves' shear: a 2×2 determinant in β.
function exactCentred(L, M, d = M.STEM_D) {
  const A = Math.PI * d * d / 4, EI = 2.2e11 * Math.PI * d ** 4 / 64, rA = 7900 * A, l = L / 2;
  const det = (beta) => {
    const x = beta * l, sh = Math.sinh(x), ch = Math.cosh(x), s = Math.sin(x), c = Math.cos(x), g = (M * beta) / rA;
    // w'(l) = 0: a(sh + s) + b(ch − c) = 0; the two halves' shear moves the mass, 2 EI w'''(l) = −M ω² w(l):
    // 2(a(sh − s) + b(ch + c)) = −g (a(ch − c) + b(sh − s))
    return (sh + s) * (2 * (ch + c) + g * (sh - s)) - (ch - c) * (2 * (sh - s) + g * (ch - c));
  };
  let lo = 0.5 / l, hi = 2.3651 / l; // the first root lies below the bare beam's βl = 2.365
  for (let i = 0; i < 200 && det(lo) * det(hi) > 0; i++) lo *= 0.9;
  for (let i = 0; i < 80; i++) { const m = 0.5 * (lo + hi); if (det(lo) * det(m) <= 0) hi = m; else lo = m; }
  const beta = 0.5 * (lo + hi);
  return (beta * beta * Math.sqrt(EI / rA)) / (2 * Math.PI);
}
test('the stem\'s beam elements: with the rod in the middle, its note is the exact clamped–clamped beam\'s with a mass at its centre (within 0.05 %)', () => {
  for (const [len, w] of [[0.3, 0.04], [0.15, 0.01], [0.07, 0.003]]) {
    const modes = M.stemModes(len, 0.5, w, 9e-4), f = exactCentred(len, M.ROD_M + w, M.STEM_D);
    const main = modes.reduce((b, m) => (m.tip ** 2 > b.tip ** 2 ? m : b));
    assert.ok(Math.abs(main.f / f - 1) < 5e-4, `${len} m: ${main.f.toFixed(2)} Hz against ${f.toFixed(2)}`);
  }
});
test('…and the bare beam\'s limit: βL = 4.730 as the mass goes to nothing', () => {
  const L = 0.2, f = exactCentred(L, 1e-9, M.STEM_D), A = Math.PI * M.STEM_D ** 2 / 4, EI = 2.2e11 * Math.PI * M.STEM_D ** 4 / 64;
  const bare = (4.730041 ** 2 / (2 * Math.PI * L * L)) * Math.sqrt(EI / (7900 * A));
  assert.ok(Math.abs(f / bare - 1) < 1e-4, `${f} against ${bare}`);
});
test('the rod is 27.9 g of glass (243 × Ø 7.8 mm at 2400 kg/m³; Couineaux et al. 2025)', () => {
  assert.ok(Math.abs(M.ROD_M - 2400 * Math.PI * 0.0039 ** 2 * 0.243) < 1e-12 && Math.abs(M.ROD_M - 0.0279) < 1e-4);
});
test('every stem is cut so the note is its speaking mode: within 0.01 ¢ of the note times its playing cut, C2–C6, shorter as the note rises', () => {
  let last = Infinity;
  for (let k = 21; k <= 108; k++) {
    const s = M.stem(k, DEFAULTS), m = s.modes[s.main];
    assert.ok(Math.abs(cents(m.f, keyFreq(k)) - M.cut(k)) < 0.01, `${k}: ${cents(m.f, keyFreq(k)).toFixed(3)} ¢ against the cut ${M.cut(k).toFixed(2)}`);
    assert.ok(s.len < last, `${k}: stem ${s.len}`); last = s.len;
    // the speaking mode has the lowest threshold of the stem's modes
    for (const o of s.modes) assert.ok(M.threshold(o, 0.1, 0.85) >= M.threshold(m, 0.1, 0.85) - 1e-12);
  }
});
test('Couineaux\'s friction law: μ = 2 still, 0.3 sliding fast, halfway at V₀ = 2 cm/s (a wet finger)', () => {
  assert.ok(Math.abs(M.mu(0, 0.85) - 2) < 1e-9);
  assert.ok(Math.abs(M.mu(0.02, 0.85) - 1.15) < 1e-9);
  assert.ok(Math.abs(M.mu(100, 0.85) - 0.3) < 1e-3);
  assert.ok(M.friction(0.1).mus - M.friction(0.1).mud < 0.1, 'dry skin hardly lets go');
});
test('the threshold at C♯4 for 10 cm/s is the order of the 0.06 N Couineaux found (30–100 mN); thresholds rise up the compass', () => {
  const t = (k) => M.regulation(k);
  assert.ok(t(61) > 0.03 && t(61) < 0.1, `${t(61)}`);
  for (let k = 37; k <= 84; k++) assert.ok(t(k) > t(k - 1), `${k}`);
});
test('the playing range: F_max/F_min = π u/(4 ζ V₀ (1 + u/V₀)²), the same for every key (121 at 10 cm/s)', () => {
  const u = 0.1, want = (Math.PI * u) / (4 * 9e-4 * 0.02 * (1 + u / 0.02) ** 2);
  for (const k of [36, 60, 84]) {
    const s = M.stem(k, DEFAULTS), m = s.modes[s.main];
    assert.ok(Math.abs(M.maxForce(m, u, 0.85) / M.threshold(m, u, 0.85) / want - 1) < 1e-9);
  }
  assert.ok(Math.abs(want - 121.2) < 0.1, `${want}`);
});
test('a rod off-centre rocks: at 30 % a mode below the note shares the finger\'s pull (C4); in the middle none does', () => {
  const mid = M.stem(60, P({ height: 0.5 })), low = M.stem(60, P({ height: 0.3 }));
  assert.equal(mid.main, 0);
  assert.ok(low.main >= 1);
  const b = low.modes[low.main - 1], n = low.modes[low.main];
  assert.ok(n.tip ** 2 / b.tip ** 2 < 5, `mass below ${(1 / b.tip ** 2).toFixed(3)} kg, the note's ${(1 / n.tip ** 2).toFixed(3)}`);
});
test('the whiskers: clamped–free steel wires, stretching at (2n − 1)c/4L and swaying at 1.875²/(2πL²)·(d/4)·c (cos βL cosh βL = −1)', () => {
  const c = Math.sqrt(2.2e11 / 7900), b1 = 1.8751040687;
  assert.ok(Math.abs(Math.cos(b1) * Math.cosh(b1) + 1) < 1e-8);
  for (const i of [0, 11, 23]) {
    const L = M.whiskerLength(i);
    assert.ok(L >= 0.6 - 1e-12 && L <= 1.5 + 1e-12);
    assert.ok(Math.abs(M.whiskerStretch(i, 2) - (3 * c) / (4 * L)) < 1e-9);
    assert.ok(Math.abs(M.whiskerSway(i) - ((b1 * b1) / (2 * Math.PI * L * L)) * (1e-3 / 4) * c) < 1e-9);
  }
  // Couineaux et al. 2025: an 80 cm whisker sways at about 1.1 Hz
  const i80 = [...Array(24).keys()].reduce((b, i) => (Math.abs(M.whiskerLength(i) - 0.8) < Math.abs(M.whiskerLength(b) - 0.8) ? i : b), 0);
  assert.ok(Math.abs(M.whiskerSway(i80) * (M.whiskerLength(i80) / 0.8) ** 2 - 1.15) < 0.1);
});

console.log('engine');
test('every key in the compass sounds its note within 1 ¢ at the reference touch (each stem cut by playing it)', () => {
  for (let k = 36; k <= 84; k += 4) { const c = cents(rodPitch(k), keyFreq(k)); assert.ok(Math.abs(c) < 1, `${k}: ${c.toFixed(2)} ¢`); }
});
test('the keyboard\'s tuning: at A = 415 Hz, and in ¼-comma meantone (E4 −3.42 ¢), the rod sounds there (within 1 ¢)', () => {
  for (const [k, o, c] of [[69, { pitch: 415 }, cents(415, 440)], [64, { temperament: 'meantone' }, -3.42]]) {
    const f = keyFreq(k) * 2 ** (c / 1200), got = rodPitch(k, P(o));
    assert.ok(Math.abs(cents(got, f)) < 1, `${k}: ${cents(got, f).toFixed(2)} ¢`);
  }
});
// The rod's peak speed per block, from t0 to t1, with the landing's firm press long gone.
// the rod's peak speed through a note, every block, from a bare collector (nothing rings but the rod)
function peaks(key, press, sec) {
  const pk = [];
  play(key, P({ press, radiator: 'bare', whiskers: 0 }), { sec, each: (e) => pk.push(e.voices[0].peak) });
  return (t) => pk[Math.round((t * FS) / bl)];
}
test('the threshold: below it the rod only shivers with the ridges\' noise; above it the note grows at the rate (N/N_th − 1)ζω the stability analysis gives (within 30 %)', () => {
  const k = 72, s = M.stem(k, DEFAULTS), m = s.modes[s.main], zw = m.zeta * 2 * Math.PI * m.f;
  const under = peaks(k, 0.5, 4);
  for (const t of [1, 2, 3, 3.9]) assert.ok(under(t) < 1e-3, `0.5×: ${under(t).toExponential(2)} m/s at ${t} s`);
  const over = peaks(k, 1.5, 2.6), r = Math.log(over(2.5) / over(1)) / 1.5, want = 0.5 * zw;
  assert.ok(Math.abs(r / want - 1) < 0.3, `1.5×: ${r.toFixed(3)}/s against ${want.toFixed(3)}/s`);
});
test('once speaking, the finger sticks to the rod once a cycle, and the rod swings by about the finger\'s speed', () => {
  const { v, u } = rodTrace(60, P(), { from: 1.5, to: 2 });
  const z = []; for (let i = 1; i < v.length; i++) if (v[i - 1] < 0 && v[i] >= 0) z.push(i);
  let stuck = 0, top = 0;
  for (let c = 1; c < z.length; c++) {
    let st = false;
    for (let i = z[c - 1]; i < z[c]; i++) { if (Math.abs(v[i] - u[i]) < 1e-6) st = true; top = Math.max(top, v[i]); }
    if (st) stuck++;
  }
  const cycles = z.length - 1, want = 0.5 * keyFreq(60);
  assert.ok(Math.abs(cycles / want - 1) < 0.02 && stuck === cycles, `${stuck} of ${cycles} cycles stick`);
  assert.ok(Math.abs(top / u[0] - 1) < 0.1, `rod at most ${top.toFixed(3)} m/s, finger ${u[0].toFixed(3)}`);
});
test('the stroke is the loudness: the rod\'s swing follows the finger\'s speed (5 → 20 cm/s: ×4 within 20 %)', () => {
  const amp = (stroke) => Math.max(...rodTrace(60, P({ stroke }), { from: 1.5, to: 1.7 }).v);
  const r = amp(0.2 / 1.0) / amp(0.05 / 1.0);
  assert.ok(Math.abs(r / 4 - 1) < 0.2, `×${r.toFixed(2)}`);
});
test('dry fingers barely sound: 25 dB under wet ones', () => {
  const wet = play(60, P(), { sec: 2.5 }), dry = play(60, P({ wet: 0.15 }), { sec: 2.5 });
  const d = 20 * Math.log10(rms(dry, 1.5 * FS) / rms(wet, 1.5 * FS));
  assert.ok(d < -25, `${d.toFixed(1)} dB`);
});
test('pressed far too hard (120×), the tone is rough: its cycles vary 20× more than at the default', () => {
  const a = sd(periods(rodTrace(60, P(), { from: 1.5, to: 2 }).v)), b = sd(periods(rodTrace(60, P({ press: 120 }), { from: 1.5, to: 2 }).v));
  assert.ok(b > 20 * a, `period spread ${a.toExponential(2)} → ${b.toExponential(2)} samples`);
});
test('back and forth, the finger turns round after 20 cm (2 s at 10 cm/s); toward you, it lifts and lands again', () => {
  let flip = -1, lift = -1, land = -1, low = false;
  play(60, P({ strokes: 'back' }), { sec: 2.4, each: (e, t) => { const v = e.voices[0]; if (flip < 0 && v.uf < 0) flip = t; } });
  play(60, P({ strokes: 'down' }), { sec: 2.6, each: (e, t) => { const v = e.voices[0]; if (lift < 0 && t > 1 && v.Nn < 0.5 * 10 * v.Nreg) lift = t; if (lift > 0 && v.Nn < 0.01 * v.Nreg) low = true; if (low && land < 0 && v.Nn > 5 * v.Nreg) land = t; } });
  assert.ok(Math.abs(flip - 2.04) < 0.05, `turned at ${flip.toFixed(3)} s`);
  assert.ok(Math.abs(lift - 2.0) < 0.03 && land - lift > 0.1 && land - lift < 0.2, `lifted at ${lift.toFixed(3)} s, landed at ${land.toFixed(3)} s`);
});
test('a rod rings on after the finger lifts, its T60 the stem\'s 6.91/ζω (within 10 %)', () => {
  const k = 60, s = M.stem(k, DEFAULTS), m = s.modes[s.main], t60 = 6.91 / (m.zeta * 2 * Math.PI * m.f), pk = [];
  play(k, P({ radiator: 'bare', whiskers: 0 }), { sec: 4.5, off: 1.5, each: (e, t) => { if (e.voices[0]) pk.push([t, e.voices[0].peak]); } });
  const at = (t) => pk.filter(([s2]) => Math.abs(s2 - t) < 0.02).map(([, p]) => p)[0];
  const got = (60 / 20) * (2 / Math.log10(at(2) / at(4)));
  assert.ok(Math.abs(got / t60 - 1) < 0.1, `T60 ${got.toFixed(2)} s against ${t60.toFixed(2)}`);
});
test('aftertouch presses harder; an MPE slide strokes one finger faster', () => {
  const e = new CristalEngine(FS);
  e.setParams(P()); e.noteOn(60, 0.6); e.noteOn(67, 0.6);
  for (let i = 0; i < 400; i++) e.process(bL, bR, bl); // past the landing
  const n0 = e.voices[0].Nn;
  e.handle({ type: 'pressure', value: 1, key: 60 }); e.handle({ type: 'slide', value: 0.2, key: 67 });
  for (let i = 0; i < 200; i++) e.process(bL, bR, bl);
  const [a, b] = e.voices;
  assert.ok(a.Nn > 1.5 * n0, `${n0} → ${a.Nn}`);
  assert.ok(Math.abs(Math.abs(b.uf) / Math.abs(a.uf) - 2) < 1e-9, `${b.uf} against ${a.uf}`);
});
test('the radiators: the bare collector is 10 dB quieter than cones and flame; the cones carry the bass', () => {
  const both = play(48, P(), { sec: 2 }), bare = play(48, P({ radiator: 'bare' }), { sec: 2 }), cones = play(48, P({ radiator: 'cones' }), { sec: 2 });
  const d = 20 * Math.log10(rms(bare, FS) / rms(both, FS));
  assert.ok(d < -10, `bare ${d.toFixed(1)} dB`);
  assert.ok(rms(cones, FS) > 3 * rms(bare, FS));
});
test('the whiskers pull on the collector, and swaying makes them come and go; none, none', () => {
  let pull = 0, none = 0;
  play(84, P({ sway: 1 }), { sec: 2, each: (e) => { pull = Math.max(pull, Math.abs(e.whiskers)); } });
  play(84, P({ whiskers: 0 }), { sec: 2, each: (e) => { none = Math.max(none, Math.abs(e.whiskers)); } });
  assert.ok(pull > 0 && none === 0);
  const x = play(84, P({ sway: 1 }), { sec: 4 }), y = play(84, P({ sway: 0, whiskers: 0 }), { sec: 4 });
  const env = (z) => Array.from({ length: 12 }, (_, i) => rms(z, Math.round((1.5 + i * 0.2) * FS), Math.round((1.7 + i * 0.2) * FS)));
  const spread = (a) => 20 * Math.log10(Math.max(...a) / Math.min(...a));
  assert.ok(spread(env(x)) > 1 && spread(env(y)) < 0.3, `level swings ${spread(env(x)).toFixed(2)} dB with them, ${spread(env(y)).toFixed(2)} without`);
});
test('output level is sane: a forte note peaks 0.05–0.8 in the compass (1.2 beyond it), nothing is NaN, and every key falls silent after its release', () => {
  for (const k of [21, 36, 60, 84, 108]) {
    let voices = 0;
    const x = play(k, P({ strokes: 'back' }), { vel: 1, sec: k < 40 ? 90 : 12, off: 2, each: (e) => { voices = e.voiceCount(); } });
    let pk = 0; for (const v of x) { assert.ok(Number.isFinite(v)); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk > 0.05 && pk < (k >= 36 && k <= 84 ? 0.8 : 1.2), `${k}: peak ${pk.toFixed(3)}`);
    assert.equal(voices, 0, `${k}: still ringing`);
  }
});
test('every preset plays (no NaN, a note within the level)', () => {
  for (const pr of PRESETS) {
    const x = play(60, { ...DEFAULTS, ...pr.p }, { sec: 1.5 });
    let pk = 0; for (const v of x) { assert.ok(Number.isFinite(v), pr.name); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk < 1.5, `${pr.name}: ${pk}`);
  }
});

// What the Quality setting trims (the README says it): modes a stem, rods at once, counted rather
// than timed, and the sound a note keeps.
test('Quality: six, three and two modes a stem, 36, 16 and 10 rods (held ones too); a note keeps its pitch and level', () => {
  for (const [quality, modes, cap] of [['high', 6, 36], ['medium', 3, 16], ['low', 2, 10]]) {
    const e = new CristalEngine(FS);
    e.setQuality(quality); e.setParams(P());
    e.noteOn(36, 0.6);
    e.process(bL, bR, bl);
    assert.equal(e.voices[0].N, Math.min(modes, e.voices[0].stem.modes.length), `${quality}: modes`);
    for (let k = 37; k < 36 + 48; k++) { e.noteOn(k, 0.6); e.noteOff(k); }
    for (let i = 0; i < 4; i++) e.process(bL, bR, bl);
    assert.ok(e.voiceCount() <= cap, `${quality}: ${e.voiceCount()} rods`);
    for (let k = 37; k < 36 + 48; k++) e.noteOn(k, 0.6); // all held, as with Space: the oldest go
    for (let i = 0; i < 4; i++) e.process(bL, bR, bl);
    assert.ok(e.voiceCount() <= cap && e.voices.at(-1).key === 36 + 47, `${quality}: ${e.voiceCount()} rods held`);
  }
  for (const k of [48, 72]) {
    const hi = rodPitch(k), f = keyFreq(k), h = play(k, P(), { sec: 2 });
    for (const quality of ['medium', 'low']) {
      const x = play(k, P(), { sec: 2, quality }), d = 20 * Math.log10(rms(x, FS) / rms(h, FS));
      assert.ok(Math.abs(cents(hi, f)) < 1 && Math.abs(d) < 1.5, `key ${k} at ${quality}: ${d.toFixed(2)} dB`);
    }
  }
});
test('CPU: ten rods render faster than 5× real time', () => {
  const e = new CristalEngine(FS);
  e.setParams(P());
  for (let k = 48; k < 68; k += 2) e.noteOn(k, 0.6);
  const n = FS * 2, t0 = performance.now();
  for (let s = 0; s < n; s += bl) e.process(bL, bR, bl);
  const x = (n / FS) / ((performance.now() - t0) / 1000);
  assert.ok(x > 5, `${x.toFixed(1)}× real time`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
