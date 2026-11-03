// Singing Dunes checks. Run: node test/dunes-tests.mjs
//
// The physics against what is independent of it (the dunes Douady and his colleagues measured,
// Vriend's waveguide, Kuramoto's threshold and his self-consistency, Folk and Ward's sorting),
// then the engine (native/instruments/dunes, built as WebAssembly) against the model: the pitch,
// the threshold, the sorting, the water, the collisions, the layer, the stop and the level.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS } from '../dunes/src/dunes-instrument.js';
import { wasmModel } from '../dunes/src/dunes-wasm.js';
import { loadEngine } from '../tools/engine.mjs';

const DunesEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const QUIET = { hiss: 0 }; // the song alone, for measuring
const cents = (a, b) => 1200 * Math.log2(a / b);
const db = (a, b) => 20 * Math.log10(a / b);
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const keyFreq = (k) => 440 * 2 ** ((k - 69) / 12);

// Render through the engine, 128-sample blocks like the AudioWorklet: events [t, 'on'|'off'|'pressure'|'slide', …];
// watch(e, t) is called every block.
function render(params, events, sec, { quality, watch } = {}) {
  const e = new DunesEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  const n = Math.ceil((sec * FS) / 128) * 128, L = new Float32Array(n), R = new Float32Array(n), bL = new Float32Array(128), bR = new Float32Array(128);
  const ev = [...events].sort((a, b) => a[0] - b[0]);
  let k = 0;
  for (let s = 0; s < n; s += 128) {
    while (k < ev.length && ev[k][0] * FS <= s) {
      const [, type, a, b] = ev[k++];
      if (type === 'on') e.noteOn(a, b ?? 0.8);
      else if (type === 'off') e.noteOff(a);
      else if (type === 'pressure') e.handle({ type: 'pressure', value: b, key: a });
      else if (type === 'slide') e.handle({ type: 'slide', value: b, key: a });
      else if (type === 'params') e.setParams(a);
    }
    e.process(bL, bR, 128); L.set(bL, s); R.set(bR, s);
    watch?.(e, s / FS);
  }
  return { x: L, y: R, e };
}
// Amplitude of frequency f in x[a, b) (Hann-windowed, so a steady sine of amplitude A gives A).
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0, sw = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); sw += h; re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return (2 * Math.hypot(re, im)) / sw;
}
// The strongest frequency within ±60 ¢ of f0 in x[a, b) (a scan, then golden-section search on tone).
function peak(x, f0, a, b) {
  let best = f0, top = -1;
  for (let c = -60; c <= 60; c += 4) { const f = f0 * 2 ** (c / 1200), v = tone(x, f, a, b); if (v > top) { top = v; best = f; } }
  let lo = best * 2 ** (-4 / 1200), hi = best * 2 ** (4 / 1200);
  for (let i = 0; i < 40; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
// The mean R of a key's grains from t0 to t1 (s).
function meanR(params, key, vel, t0, t1, events = []) {
  let s = 0, n = 0;
  render(params, [[0, 'on', key, vel], ...events], t1, { watch: (e, t) => { if (t >= t0) { s += e.voice(key).R; n++; } } });
  return s / n;
}

console.log('the grains\' law (Douady et al. 2006)');
test('f = 0.4 √(g/d) gives Douady\'s predicted notes for the four dunes\' sands (100, 87, 77, 68 Hz), within the field\'s spread of what each sang', () => {
  const table = [[160e-6, 100, 105, 10], [210e-6, 87, 90, 10], [270e-6, 77, 75, 10], [340e-6, 68, 63, 5]];
  for (const [d, predicted, sang, spread] of table) {
    const f = M.shearFreq(d);
    assert.ok(Math.abs(f - predicted) < 1.5, `${d * 1e6} µm: ${f.toFixed(1)} Hz, Douady predicted ${predicted}`);
    assert.ok(Math.abs(f - sang) <= spread + 1, `${d * 1e6} µm: ${f.toFixed(1)} Hz; the dune sang ${sang} ± ${spread}`);
    assert.ok(Math.abs(M.grainDiameter(f) / d - 1) < 1e-12, 'the key\'s grain inverts the law');
  }
});
test('the keys a real dune sings (63 – 105 Hz, C2 – A♭2) are fine and medium sand, A0 is just past sand (2.1 mm granules), and C8 is clay-sized: the law carried on', () => {
  const cls = (k) => M.wentworth(M.grainDiameter(keyFreq(k)));
  for (let k = 36; k <= 44; k++) assert.ok(cls(k) === 2 || cls(k) === 3, `key ${k}: class ${cls(k)}`);
  assert.equal(cls(21), 6);
  assert.equal(cls(22), 5);
  assert.ok(M.grainDiameter(keyFreq(108)) < 3.9e-6, 'C8: under 3.9 µm, clay');
});
test('Folk and Ward\'s sorting σφ is the spread of log₂ d, and f ∝ d^−½ halves it: σ_f / f = σφ ln 2 / 2', () => {
  for (const phi of [0.2, 0.3, 0.7, 1.2]) assert.ok(Math.abs(M.freqSpread(phi) - (phi * Math.LN2) / 2) < 1e-15);
});

console.log('the layer\'s waveguide (Vriend et al. 2007)');
test('f_n = n c₁ / (2H √(1 − c₁²/c₂²)): with Dumont Dunes\' c₁ 180 m/s over c₂ 300 m/s, an 83 Hz boom needs a 1.36 m layer, inside their 1.2 ± 0.3 m', () => {
  const H = M.layerDepth(83);
  assert.ok(Math.abs(H - 180 / (2 * 83 * 0.8)) < 1e-12, `${H}`);
  assert.ok(Math.abs(H - 1.2) <= 0.3, `${H.toFixed(2)} m`);
  for (const n of [1, 2, 3, 5]) assert.ok(Math.abs(M.layerMode(n, H) - 83 * n) < 1e-9, `mode ${n}`);
});

console.log('falling into step (Kuramoto)');
test('the threshold: K_c = √(8/π)·σ for a Gaussian spread without noise (Kuramoto 1975), 2D for identical patches with noise, 2(γ + D) where both are Lorentzian-like', () => {
  for (const s of [0.02, 0.1, 0.3]) assert.ok(Math.abs(M.criticalCoupling(s, 0) / (Math.sqrt(8 / Math.PI) * s) - 1) < 1e-12);
  assert.ok(Math.abs(M.criticalCoupling(0, 0.01) - 0.02) < 1e-12);
  // a small noise on a wide spread adds about D to its threshold; on a narrow one it takes over
  const s = 0.1, D = 0.002, kc = M.criticalCoupling(s, D);
  assert.ok(kc > M.criticalCoupling(s, 0) && kc < M.criticalCoupling(s, 0) + 2 * D + 1e-3, `${kc}`);
  assert.ok(Math.abs(M.criticalCoupling(1e-4, 0.05) / 0.1 - 1) < 0.01);
});
test('2000 patches settle where Kuramoto\'s self-consistency r = K r ∫ cos²θ g(K r sin θ) dθ puts them, and stay scattered below K_c', () => {
  const s = 0.1, kc = M.criticalCoupling(s, 0);
  const g = (v) => Math.exp(-0.5 * (v / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  const selfR = (K) => { // bisection on r ↦ K ∫ cos²θ g(K r sin θ) dθ − 1
    let lo = 1e-6, hi = 1;
    const F = (r) => { let a = 0; const N = 2000; for (let i = 0; i < N; i++) { const th = -Math.PI / 2 + (Math.PI * (i + 0.5)) / N; a += Math.cos(th) ** 2 * g(K * r * Math.sin(th)); } return (K * a * Math.PI) / N - 1; };
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (F(m) > 0) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  for (const ratio of [1.5, 2.5]) {
    const K = ratio * kc, want = selfR(K), got = M.simulateR(2000, s, K, 0, 100, 2);
    assert.ok(Math.abs(got - want) < 0.05, `K = ${ratio} K_c: R ${got.toFixed(3)}, self-consistency ${want.toFixed(3)}`);
  }
  const below = M.simulateR(2000, s, 0.7 * kc, 0, 100, 2);
  assert.ok(below < 0.08, `K = 0.7 K_c: R ${below.toFixed(3)}`);
});
test('the default sand starts to sing at Douady\'s 0.23 m/s; a wider spread and water both raise the speed it needs', () => {
  assert.ok(Math.abs(M.onsetSpeed(0.3, 0) - 0.23) < 1e-9);
  assert.ok(Math.abs(M.coupling(0.23, 0) / M.criticalCoupling(M.freqSpread(0.3), M.NOISE) - 1) < 1e-9);
  assert.ok(M.onsetSpeed(0.6, 0) > 1.8 * 0.23 && M.onsetSpeed(1.2, 0) > 3.5 * 0.23);
  assert.ok(Math.abs(M.onsetSpeed(0.3, 0.15) / 0.23 - Math.E) < 1e-9, 'water: e for every 0.15 %');
});
test('the collision pulse: harmonics of a Gaussian, exp(−n²w²/2), RMS 1; shorter collisions keep more of them', () => {
  for (const c of [0.12, 0.25, 0.45]) {
    let e = 0;
    for (let n = 1; n <= 32; n++) e += M.pulseHarmonic(n, c) ** 2 / 2;
    assert.ok(Math.abs(e - 1) < 1e-12, `contact ${c}: RMS² ${e}`);
    const w = (2 * Math.PI * c) / (2 * Math.sqrt(2 * Math.LN2));
    assert.ok(Math.abs(M.pulseHarmonic(3, c) / M.pulseHarmonic(1, c) - Math.exp(-4 * w * w)) < 1e-12);
  }
  assert.ok(M.pulseHarmonic(3, 0.12) / M.pulseHarmonic(1, 0.12) > 5 * (M.pulseHarmonic(3, 0.45) / M.pulseHarmonic(1, 0.45)));
});

console.log('the engine');
test('a song in step sounds the key\'s note: G2, C2, A♭2 and C4 within 6 ¢, averaged over two seconds of song', () => {
  for (const k of [43, 36, 44, 60]) {
    const { x } = render(P(QUIET), [[0, 'on', k, 0.9]], 3), f = keyFreq(k);
    const c = cents(peak(x, f, FS, 3 * FS), f);
    assert.ok(Math.abs(c) < 6, `key ${k}: ${c.toFixed(2)} ¢`);
  }
});
test('the keyboard\'s tuning: at A = 415 Hz the grains are coarser and the song moves with the pitch (A2 within 6 ¢)', () => {
  const f = keyFreq(45) * 415 / 440, { x } = render(P({ ...QUIET, pitch: 415 }), [[0, 'on', 45, 0.9]], 3);
  assert.ok(Math.abs(cents(peak(x, f, FS, 3 * FS), f)) < 6);
});
test('the threshold: a hard avalanche falls into step (R > 0.85) within half a second; one below 0.23 m/s stays scattered (R < 0.4) and is 15 dB quieter at its note', () => {
  const hard = meanR(P(QUIET), 45, 0.9, 0.5, 2), soft = meanR(P(QUIET), 45, 0.4, 0.5, 2); // 0.81 and 0.16 m/s
  assert.ok(hard > 0.85, `hard: R ${hard.toFixed(2)}`);
  assert.ok(soft < 0.4, `soft: R ${soft.toFixed(2)}`);
  const f = keyFreq(45), a = render(P(QUIET), [[0, 'on', 45, 0.9]], 2).x, b = render(P(QUIET), [[0, 'on', 45, 0.4]], 2).x;
  assert.ok(db(tone(a, f, FS / 2, 2 * FS), tone(b, f, FS / 2, 2 * FS)) > 15, `${db(tone(a, f, FS / 2, 2 * FS), tone(b, f, FS / 2, 2 * FS)).toFixed(1)} dB`);
});
test('near the threshold the song takes longer to start: R passes 0.6 later at 0.26 m/s than at 0.9 m/s', () => {
  const when = (U) => { let t60 = Infinity; render(P({ ...QUIET, speed: U }), [[0, 'on', 45, 1]], 4, { watch: (e, t) => { if (t60 === Infinity && e.voice(45).R > 0.6) t60 = t; } }); return t60; };
  const fast = when(0.9), slow = when(0.26);
  assert.ok(fast < 0.2 && slow > fast + 0.3, `0.9 m/s: ${fast.toFixed(2)} s, 0.3 m/s: ${slow.toFixed(2)} s`);
});
test('sorting: a poorly sorted sand at the same speed never falls into step (R < 0.4); water does the same to a well-sorted one', () => {
  const poor = meanR(P({ ...QUIET, sorting: 1.2 }), 45, 0.8, 0.5, 2), damp = meanR(P({ ...QUIET, damp: 0.3 }), 45, 0.8, 0.5, 2), dry = meanR(P(QUIET), 45, 0.8, 0.5, 2);
  assert.ok(dry > 0.85 && poor < 0.4 && damp < 0.4, `dry ${dry.toFixed(2)}, poorly sorted ${poor.toFixed(2)}, damp ${damp.toFixed(2)}`);
});
test('push: the mod wheel (and aftertouch, and MPE slide) runs a soft avalanche up past the threshold, so it starts to sing', () => {
  const ev = (type) => [[0, 'on', 45, 0.4], [1, type, 45, 1]];
  const wheel = meanR(P({ ...QUIET, push: 1 }), 45, 0.4, 0.5, 2);
  const after = meanR(P(QUIET), 45, 0.4, 1.6, 2.6, ev('pressure').slice(1)), slid = meanR(P(QUIET), 45, 0.4, 1.6, 2.6, ev('slide').slice(1));
  assert.ok(wheel > 0.85 && after > 0.85 && slid > 0.85, `wheel ${wheel.toFixed(2)}, aftertouch ${after.toFixed(2)}, slide ${slid.toFixed(2)}`);
});
test('collisions: short ones carry a stronger third harmonic than long ones (by more than 12 dB, against the note)', () => {
  const f = keyFreq(45), h3 = (c) => { const { x } = render(P({ ...QUIET, contact: c }), [[0, 'on', 45, 0.9]], 2); return db(tone(x, 3 * f, FS / 2, 2 * FS), tone(x, f, FS / 2, 2 * FS)); };
  const short = h3(0.12), long = h3(0.45);
  assert.ok(short - long > 12, `short ${short.toFixed(1)} dB, long ${long.toFixed(1)} dB`);
});
test('stereo: a scattered avalanche is wide (left and right less alike) and a song in step is centred', () => {
  const corr = (vel) => { const { x, y } = render(P({ ...QUIET, speed: 1 }), [[0, 'on', 45, vel]], 2); let xy = 0, xx = 0, yy = 0; for (let i = FS; i < 2 * FS; i++) { xy += x[i] * y[i]; xx += x[i] * x[i]; yy += y[i] * y[i]; } return xy / Math.sqrt(xx * yy); };
  const song = corr(0.9), rumble = corr(0.35);
  assert.ok(song > 0.95 && rumble < song - 0.1, `in step ${song.toFixed(3)}, scattered ${rumble.toFixed(3)}`);
});
test('the layer\'s theory: eight modes, lines at n × the note, and no threshold (a soft avalanche rings the same note)', () => {
  for (const vel of [0.4, 0.9]) {
    const { x } = render(P({ ...QUIET, theory: 'layer' }), [[0, 'on', 45, vel]], 3), f = keyFreq(45);
    // a line rung by noise wanders across its width: its centre, power-weighted over ±100 ¢
    let sw = 0, sf = 0;
    for (let c2 = -100; c2 <= 100; c2 += 2) { const fc = f * 2 ** (c2 / 1200), p2 = tone(x, fc, FS / 2, 3 * FS) ** 2; sw += p2; sf += p2 * c2; }
    assert.ok(Math.abs(sf / sw) < 8, `${vel}: centred ${(sf / sw).toFixed(1)} ¢ from the note`);
    for (const n of [1, 2, 3]) assert.ok(tone(x, n * f, FS / 2, 3 * FS) > 4 * tone(x, (n + 0.5) * f, FS / 2, 3 * FS), `${vel}: harmonic ${n} stands out`);
  }
  assert.equal(render(P({ ...QUIET, theory: 'layer' }), [[0, 'on', 45, 0.9]], 0.2).e.voice(45).modes, 8);
});
test('the stop: let go, the avalanche slows at a constant rate, falls out of step, and is silent by the stopping time', () => {
  const R = [];
  const { x, e } = render(P({ stop: 1 }), [[0, 'on', 45, 0.9], [1, 'off', 45]], 2.4, { watch: (e2, t) => { if (Math.abs(t - 1.5) < 0.002 || Math.abs(t - 1.2) < 0.002) R.push(e2.voice(45)); } });
  const [early, half] = R;
  assert.ok(Math.abs(half.U / early.U - (0.5 / 0.8)) < 0.08, `U at 0.2 s ${early.U.toFixed(3)}, at 0.5 s ${half.U.toFixed(3)}: a straight line to rest at 1 s`);
  assert.ok(rms(x, Math.round(2.05 * FS), Math.round(2.4 * FS)) < 1e-6, `silent after it stops: ${rms(x, Math.round(2.05 * FS), Math.round(2.4 * FS))}`);
  assert.equal(e.voiceCount(), 0);
});
test('output level is sane (a forte avalanche peaks 0.1 – 0.8), no NaNs, from A0 to C8, in both theories', () => {
  for (const theory of ['grains', 'layer']) {
    let pk = 0, ok = true;
    for (const k of [21, 36, 45, 60, 84, 108]) for (const v of render(P({ theory }), [[0, 'on', k, 1]], 1).x) { pk = Math.max(pk, Math.abs(v)); ok &&= Number.isFinite(v); }
    assert.ok(ok, `${theory}: NaN`);
    assert.ok(pk > 0.1 && pk < 0.8, `${theory}: peak ${pk.toFixed(3)}`);
  }
});
test('the hiss grows with the speed of the sand, and water quietens it', () => {
  const hi = (o, vel) => { const { x } = render(P({ hiss: 1, theory: 'layer', ...o }), [[0, 'on', 45, vel]], 1.5); return tone(x, 3000, FS / 2, 1.5 * FS) + tone(x, 4000, FS / 2, 1.5 * FS); };
  assert.ok(hi({}, 1) > 2 * hi({}, 0.6), 'faster: louder hiss');
  assert.ok(hi({ damp: 0.3 }, 1) < 0.3 * hi({}, 1), 'damp: quieter');
});

// What the Quality setting trims (the README says it): fewer patches, layer modes and avalanches.
test('Quality: 24, 14 and 8 patches; 8, 4 and 2 layer modes; past 24, 12 and 6 avalanches the oldest comes to rest; a song keeps its note and level', () => {
  const bL = new Float32Array(128), bR = new Float32Array(128);
  for (const [quality, patches, modes, cap] of [['high', 24, 8, 24], ['medium', 14, 4, 12], ['low', 8, 2, 6]]) {
    assert.equal(render(P(), [[0, 'on', 45, 0.9]], 0.1, { quality }).e.voice(45).patches, patches, `${quality}: patches`);
    assert.equal(render(P({ theory: 'layer' }), [[0, 'on', 45, 0.9]], 0.1, { quality }).e.voice(45).modes, modes, `${quality}: layer modes`);
    const e = new DunesEngine(FS);
    e.setQuality(quality); e.setParams(P());
    for (let i = 0; i < 30; i++) { e.noteOn(30 + i, 0.8); for (let b = 0; b < 4; b++) e.process(bL, bR, 128); }
    for (let b = 0; b < 20; b++) e.process(bL, bR, 128);
    assert.equal(e.voiceCount(), cap, `${quality}: avalanches`);
  }
  for (const k of [36, 45, 57]) {
    const f = keyFreq(k), hi = render(P(QUIET), [[0, 'on', k, 0.9]], 2.5).x;
    for (const quality of ['medium', 'low']) {
      const x = render(P(QUIET), [[0, 'on', k, 0.9]], 2.5, { quality }).x, c = cents(peak(x, f, FS, 2.5 * FS), f), d = db(rms(x, FS, 2.5 * FS), rms(hi, FS, 2.5 * FS));
      assert.ok(Math.abs(c) < 8 && Math.abs(d) < 1.5, `key ${k} at ${quality}: ${c.toFixed(2)} ¢, ${d.toFixed(2)} dB`);
    }
  }
});
test('CPU: ten avalanches in step render faster than real time with a wide margin (under 25 % of a core)', () => {
  const e = new DunesEngine(FS); e.setParams(P());
  for (let i = 0; i < 10; i++) e.noteOn(36 + 2 * i, 0.9);
  const bL = new Float32Array(128), bR = new Float32Array(128), blocks = Math.round((2 * FS) / 128);
  for (let b = 0; b < 40; b++) e.process(bL, bR, 128);
  const t0 = performance.now();
  for (let b = 0; b < blocks; b++) e.process(bL, bR, 128);
  const share = (performance.now() - t0) / 2000;
  assert.ok(share < 0.25, `${(share * 100).toFixed(1)} % of real time`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
