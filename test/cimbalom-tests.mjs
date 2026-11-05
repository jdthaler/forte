// Cimbalom checks: the physics against independent results (the stiff string, the string's
// impedance under a hammer, Weinreich's coupled strings, the dulcimer's divided strings), then the
// engine against the model and each advertised effect.
// Run: node test/cimbalom-tests.mjs

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../cimbalom/src/cimbalom-instrument.js';
import { wasmModel } from '../cimbalom/src/cimbalom-wasm.js';
import { loadEngine } from '../tools/engine.mjs';

const CimbalomEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const et = (key) => 440 * 2 ** ((key - 69) / 12);

// Play a script ([t, 'on', key, vel] | [t, 'off', key] | [t, 'pedal', on] | [t, 'slide', value, key] |
// [t, 'pressure', value, key]) for sec seconds in 128-sample blocks; hook(e, sample) after each block.
function run(params, script, sec, { quality, hook } = {}) {
  const e = new CimbalomEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float32Array(n), R = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = [...script].sort((a, b) => a[0] - b[0]);
  let k = 0;
  for (let s = 0; s < n; s += bl) {
    while (k < ev.length && ev[k][0] * FS <= s) {
      const [, what, a, b] = ev[k++];
      if (what === 'on') e.noteOn(a, b); else if (what === 'off') e.noteOff(a); else if (what === 'pedal') e.setSustain(a);
      else e.handle({ type: what, value: a, key: b });
    }
    e.process(bL, bR, bl);
    L.set(bL.subarray(0, Math.min(bl, n - s)), s); R.set(bR.subarray(0, Math.min(bl, n - s)), s);
    hook?.(e, s + bl);
  }
  return { L, R, e };
}
const note = (key, params = P(), sec = 1.5, vel = 0.7, opts) => run(params, [[0, 'on', key, vel]], sec, opts);
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im) / (b - a);
}
function peak(x, f0, a, b) {
  let lo = f0 * 2 ** (-25 / 1200), hi = f0 * 2 ** (25 / 1200);
  for (let i = 0; i < 40; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const cents = (a, b) => 1200 * Math.log2(a / b);
const dB = (x) => 20 * Math.log10(x);
const maxAbs = (x, a = 0, b = x.length) => { let m = 0; for (let i = a; i < b; i++) m = Math.max(m, Math.abs(x[i])); return m; };
// energy above 2 kHz (or from) over energy below 1.5 kHz in the first 85 ms (dB)
function brightness(x, from = 2000) {
  const N = 4096; let lo = 0, hi = 0;
  for (let f = 50; f < 4 * from; f += FS / N) { const e = tone(x, f, 0, N) ** 2; if (f < 1500) lo += e; else if (f > from) hi += e; }
  return 10 * Math.log10(hi / lo);
}
// the slope (dB/s) of f's level between t0 and t1, by least squares on 50 ms windows
function slope(x, f, t0, t1) {
  const pts = [];
  for (let t = t0; t < t1; t += 0.05) { const a = Math.round(t * FS); pts.push([t, dB(tone(x, f, a, a + 4800))]); }
  const n = pts.length, mt = pts.reduce((s, p) => s + p[0], 0) / n, md = pts.reduce((s, p) => s + p[1], 0) / n;
  return pts.reduce((s, p) => s + (p[0] - mt) * (p[1] - md), 0) / pts.reduce((s, p) => s + (p[0] - mt) ** 2, 0);
}

console.log('physics');
test('a stiff string: fₙ = n f₁ √((1 + Bn²)/(1 + B)), B = π²EI/(TL²), T = μ(2Lf)²', () => {
  for (const build of ['cimbalom', 'dulcimer']) for (const key of [30, 45, 57, 69, 81, 100]) {
    const p = P({ build, detune: 0 }), c = M.course(key, p), ps = M.partials(key, p, { nmax: 20 });
    const T = c.mu * (2 * c.L * c.f0) ** 2, B = (Math.PI ** 2 * c.EI) / (T * c.L * c.L);
    assert.ok(Math.abs(T / c.T - 1) < 1e-9 && Math.abs(B / c.B - 1) < 1e-9, `${build} ${key}: T ${c.T} B ${c.B}`);
    ps.forEach((q, i) => { const n = i + 1, f = n * c.f0 * Math.sqrt((1 + B * n * n) / (1 + B)); assert.ok(Math.abs(cents(q.f, f)) < 1e-6, `${key} n=${n}: ${q.f} vs ${f}`); });
    assert.ok(Math.abs(cents(ps[0].f, et(key))) < 1e-6, `${key}: the fundamental is the note`);
  }
});
test('the scale: plain steel within its strength, four strings (three wound) on the cimbalom, two on the dulcimer', () => {
  for (let key = 21; key <= 108; key++) {
    const c = M.course(key, P()), d = M.course(key, P({ build: 'dulcimer' }));
    assert.ok(c.stress < 1.5e9 && d.stress < 1.5e9, `${key}: ${(c.stress / 1e9).toFixed(2)} GPa`); // music wire breaks above 2 GPa
    assert.equal(c.strings, c.wound ? 3 : 4, `${key}`);
    assert.equal(c.wound, key < 52); assert.equal(d.strings, 2);
    if (key >= 33 && key <= 93 && !c.wound) assert.ok(c.stress > 0.4e9, `${key}: ${c.stress}`);
  }
});
test('the bridge drains a partial at Re Y·β²/2ω², G·T/L for the fundamental of a flexible string', () => {
  for (const key of [48, 60, 72]) {
    const p = P({ detune: 0 }), c = M.course(key, p), q = M.partials(key, p, { nmax: 1 })[0];
    const Y = M.admittance('cimbalom', c.place, q.f).re, w = 2 * Math.PI * q.f;
    const beta = Math.sqrt(2 / (c.mu * c.L)) * (c.T * q.k + c.EI * q.k ** 3);
    assert.ok(Math.abs(q.sigB / ((Y * beta * beta) / (2 * w * w)) - 1) < 1e-9, `${key}`);
    assert.ok(Math.abs(q.sigB / ((Y * c.T) / c.L) - 1) < 0.01, `${key}: ${q.sigB} vs G T/L ${(Y * c.T) / c.L}`);
  }
});
test('the dulcimer\'s treble bridge divides 2 : 3: one tension, so the far side sounds f·L/L′, a fifth away', () => {
  const p = P({ build: 'dulcimer' });
  for (const [key, side, ratio] of [[62, 'right', 1.5], [69, 'right', 1.5], [74, 'left', 2 / 3], [86, 'left', 2 / 3]]) {
    const c = M.course(key, p);
    assert.equal(c.side, side);
    assert.ok(Math.abs(c.Lfar / c.L - 1 / ratio) < 1e-12 && Math.abs(c.ffar / c.f0 - ratio) < 1e-12, `${key}`);
    assert.ok(Math.abs((c.f0 * c.L) / (c.ffar * c.Lfar) - 1) < 1e-12, `${key}: wave speed`);
    // the struck side's 3rd and the far side's 2nd (right) meet, within the strings' stiffness
    const near = M.partials(key, p, { nmax: 3 }), far = M.partials(key, p, { far: true, nmax: 3 });
    if (side === 'right') assert.ok(Math.abs(cents(near[2].f, far[1].f)) < 1, `${cents(near[2].f, far[1].f)}`);
  }
  assert.equal(M.course(55, p).Lfar, 0); assert.equal(M.course(69, P()).Lfar, 0);
});
test('a hammer on the strings feels their impedance: v = v₀e^(−t/τ), τ = m/(2νZ), before the reflection returns', () => {
  // a long wound bass course struck at its middle (the reflections take 9 ms), bare wood, a stiff stick
  const p = P({ head: 'wood', stick: 2000, strike: 0.5, mass: 6 }), key = 33, c = M.course(key, p);
  const tau = 6e-3 / (2 * c.strings * c.Z), v0 = M.hammerSpeed(0.7);
  let hv = null;
  note(key, p, 0.01, 0.7, { hook: (e, s) => { if (hv === null && s >= 3 * tau * FS) { const v = e.voices[0]; hv = (v.mHead * v.hv + v.mStick * v.vs) / (v.mHead + v.mStick); } } });
  const blocks = Math.ceil((3 * tau * FS) / 128) * 128 / FS, want = v0 * Math.exp(-blocks / tau);
  assert.ok(Math.abs(hv - want) < 0.12 * v0, `after ${(blocks * 1e3).toFixed(2)} ms: ${hv.toFixed(3)} m/s, want ${want.toFixed(3)} (τ ${(tau * 1e3).toFixed(2)} ms)`);
});

console.log('engine');
test('tuning: every key\'s fundamental is the model\'s, and the note, within 3 ¢', () => {
  for (const key of [48, 55, 60, 64, 67, 72, 76, 79]) for (const build of ['cimbalom', 'dulcimer']) {
    const p = P({ build, detune: 0 }), { L } = note(key, p, 0.8), f = peak(L, et(key), 4800, 4800 + 32768);
    assert.ok(Math.abs(cents(f, et(key))) < 3, `${build} ${key}: ${cents(f, et(key)).toFixed(2)} ¢`);
  }
});
test('the engine plays the model\'s stretched partials (2nd–4th within 3 ¢)', () => {
  const key = 57, p = P({ detune: 0, head: 'wood' }), ps = M.partials(key, p, { nmax: 4 }), { L } = note(key, p, 0.8);
  for (const n of [1, 2, 3]) { const f = peak(L, ps[n].f, 4800, 4800 + 32768); assert.ok(Math.abs(cents(f, ps[n].f)) < 3, `n=${n + 1}: ${cents(f, ps[n].f).toFixed(2)} ¢`); }
});
test('Weinreich: unison strings in step decay at σ + νσ_B, four times one string\'s bridge loss', () => {
  for (const [build, key] of [['cimbalom', 60], ['dulcimer', 55]]) {
    const p = P({ build, detune: 0, sympathy: 0, dampers: 'none' }), q = M.partials(key, p, { nmax: 1 })[0], nu = M.course(key, p).strings;
    const { L } = note(key, p, 2.5), s = slope(L, q.f, 0.3, 2.3), want = -(20 / Math.log(10)) * (q.sigma + nu * q.sigB);
    assert.ok(Math.abs(s / want - 1) < 0.15, `${build}: ${s.toFixed(2)} dB/s, want ${want.toFixed(2)} (ν ${nu})`);
  }
});
test('mistuned unisons fall out of step: the decay slows (two stages) and beats', () => {
  // the bridge's coupling turned up, so that it, not the strings' own losses, sets the decay
  const p = (d) => P({ detune: d, bridge: 3, sympathy: 0, dampers: 'none' }), f = et(60);
  const same = note(60, p(0), 7).L, spread = note(60, p(4), 7).L;
  const power = (x, t0, t1) => { let s = 0, n = 0; for (let t = t0; t < t1; t += 0.1) { const a = Math.round(t * FS); s += tone(x, f, a, a + 9600) ** 2; n++; } return s / n; };
  const late = (x) => 10 * Math.log10(power(x, 4, 6.5) / power(x, 0.1, 0.35)); // averaged over the beats
  assert.ok(late(spread) > late(same) + 6, `4–6.5 s after: ${late(spread).toFixed(1)} vs in tune ${late(same).toFixed(1)} dB`);
});
test('where the hammer lands: at the middle the even partials vanish', () => {
  const amp = (strike) => { const { e } = note(57, P({ strike, detune: 0 }), 0.3); const v = e.voices[0], q = v.q(0), q1 = v.q(1); return [0, 1, 2, 3].map((i) => Math.hypot(q[i], q1[i])); };
  const mid = amp(0.5), near = amp(0.12);
  assert.ok(dB(mid[1] / mid[0]) < -40 && dB(mid[3] / mid[2]) < -30, `middle: 2nd ${dB(mid[1] / mid[0]).toFixed(1)}, 4th ${dB(mid[3] / mid[2]).toFixed(1)} dB`);
  assert.ok(dB(near[1] / near[0]) > -20, `12 %: 2nd ${dB(near[1] / near[0]).toFixed(1)} dB`);
});
test('near the bridge the fundamental weakens beside the upper partials', () => {
  const ratio = (strike) => { const { e } = note(57, P({ strike, detune: 0 }), 0.3); const v = e.voices[0], q = v.q(0), q1 = v.q(1); const a = (i) => Math.hypot(q[i], q1[i]); return a(0) / (a(1) + a(2) + a(3)); };
  // the mode shapes alone, sin(nπx/L), give 0.69 between 4 % and 15 %
  assert.ok(ratio(0.04) < 0.8 * ratio(0.15), `${ratio(0.04).toFixed(2)} vs ${ratio(0.15).toFixed(2)}`);
});
test('hammer faces: bare wood brighter than leather, leather than cotton', () => {
  // the top of the spectrum, 4–16 kHz against the partials under 1.5 kHz, in the first 85 ms
  const b = (head) => brightness(note(72, P({ head }), 0.1).L, 4000);
  const [c, l, w] = ['cotton', 'leather', 'wood'].map(b);
  assert.ok(w > l + 2 && l > c + 2, `cotton ${c.toFixed(1)}, leather ${l.toFixed(1)}, wood ${w.toFixed(1)} dB`);
});
test('a heavier hammer stays on the strings longer', () => {
  const on = (mass) => { let t = 0; note(60, P({ mass }), 0.06, 0.7, { hook: (e) => { const v = e.voices[0]; if (v) t = v.onTime; } }); return t; };
  const light = on(1.5), heavy = on(12);
  assert.ok(heavy > 1.5 * light, `${(light * 1e3).toFixed(2)} ms vs ${(heavy * 1e3).toFixed(2)} ms`);
});
test('a whippy stick: the head strikes alone and comes back, a brighter, softer stroke', () => {
  const stroke = (stick) => { let c = 0; const { L } = note(60, P({ stick, head: 'leather' }), 0.2, 0.7, { hook: (e) => { const v = e.voices[0]; if (v) c = v.contacts; } }); return { c, b: brightness(L), pk: maxAbs(L) }; };
  const whip = stroke(40), stiff = stroke(800);
  assert.ok(whip.c > stiff.c && whip.b > stiff.b + 2, `contacts ${whip.c} vs ${stiff.c}, brightness ${whip.b.toFixed(1)} vs ${stiff.b.toFixed(1)}`);
});
test('the dulcimer\'s far side rings along, strongest where its partials meet the struck side\'s', () => {
  const { e } = note(69, P({ build: 'dulcimer', dampers: 'none', sympathy: 0 }), 0.6);
  const v = e.voices[0], q = v.q(0), q1 = v.q(1), b = v.q(2), a = (i) => Math.hypot(q[i], q1[i]) * b[i];
  const s = v.nStruck, far2 = a(s + 1), near3 = a(2), far1 = a(s), near1 = a(0);
  assert.ok(v.nFar > 0 && dB(far2 / near3) > -15, `far 2nd ${dB(far2 / near3).toFixed(1)} dB under the struck 3rd`);
  assert.ok(dB(far1 / near1) < dB(far2 / near3) - 15, `far fundamental ${dB(far1 / near1).toFixed(1)} dB`);
  assert.equal(note(69, P(), 0.05).e.voices[0].nFar, 0);
});
test('dampers: a released key stops, unless the pedal is down; "Pedal" damps held keys; "None" never', () => {
  const lvl = (dampers, script) => { const { L } = run(P({ dampers, sympathy: 0 }), [[0, 'on', 60, 0.7], ...script], 1.6); return dB(maxAbs(L, 1.2 * FS, 1.6 * FS) / maxAbs(L, 0, 0.2 * FS)); };
  const keysUp = lvl('keys', [[0.5, 'off', 60]]), keysHeld = lvl('keys', []), pedalHeld = lvl('pedal', []), pedalDown = lvl('pedal', [[0, 'pedal', true]]), none = lvl('none', [[0.5, 'off', 60]]);
  assert.ok(keysUp < -60 && keysHeld > -40, `keys: up ${keysUp.toFixed(0)}, held ${keysHeld.toFixed(0)} dB`);
  assert.ok(pedalHeld < -60 && pedalDown > -40, `pedal: held ${pedalHeld.toFixed(0)}, with the pedal ${pedalDown.toFixed(0)} dB`);
  assert.ok(none > -40, `none: ${none.toFixed(0)} dB`);
});
test('sympathetic strings: undamped courses ring along, the more with Sympathetic strings up', () => {
  const energy = (o) => { let E = 0; run(P({ dampers: 'none', ...o }), [[0, 'on', 60, 0.8]], 1, { hook: (e, s) => { if (s >= 0.9 * FS && !E) E = e.symEnergy(67) + e.symEnergy(72); } }); return E; };
  const none = energy({ sympathy: 0 }), half = energy({ sympathy: 0.5 }), full = energy({ sympathy: 1 }), damped = energy({ dampers: 'keys' });
  assert.ok(none === 0 && half > 0 && full > 2 * half, `${none} ${half} ${full}`);
  assert.ok(damped < 0.01 * half, `with the dampers on: ${damped} vs ${half}`);
});
test('the tremolo strikes again at its rate while the key is held, and stops when it is let go', () => {
  let strokes = 0, after = 0;
  run(P({ roll: 10 }), [[0, 'on', 60, 0.7], [1, 'off', 60]], 1.6, { hook: (e, s) => { const v = e.voices.find((x) => x.key === 60); if (v) { if (s <= FS) strokes = v.strokes; else after = v.strokes; } } });
  assert.ok(strokes >= 9 && strokes <= 12, `${strokes} strokes in 1 s`);
  assert.ok(after === strokes || after === 0, `${after} after release`);
});
test('MPE slide: a note with its own strike point', () => {
  const { e } = run(P({ detune: 0 }), [[0, 'slide', 0.5, 60], [0, 'on', 60, 0.7], [0, 'on', 64, 0.7]], 0.05);
  const xs = Object.fromEntries(e.voices.map((v) => [v.key, v.xh / M.course(v.key, P()).L]));
  assert.ok(Math.abs(xs[60] - 0.5) < 1e-9 && Math.abs(xs[64] - DEFAULTS.strike) < 1e-9, JSON.stringify(xs));
});
test('level: a forte note peaks within 0.03–0.5, nothing blows up, and the voices end', () => {
  for (const key of [33, 48, 60, 72, 84, 93]) for (const build of ['cimbalom', 'dulcimer']) {
    const { L, e } = run(P({ build }), [[0, 'on', key, 1], [0.5, 'off', key]], 2.5);
    const pk = maxAbs(L);
    assert.ok(pk > 0.03 && pk < 0.5 && L.every(Number.isFinite), `${build} ${key}: ${pk}`);
    if (build === 'cimbalom') assert.equal(e.voiceCount(), 0, `${key}: still sounding`);
  }
});
test('every preset plays', () => {
  for (const pr of PRESETS) { const { L } = run({ ...DEFAULTS, ...pr.p }, [[0, 'on', 64, 0.8], [0, 'on', 69, 0.8]], 0.4); assert.ok(L.every(Number.isFinite) && maxAbs(L) > 0.005, pr.name); }
});
test('Quality: Medium and Low sound fewer courses, partials and strings, and keep the note\'s level', () => {
  const at = (q) => { let v = null; const { L, e } = note(60, P({ dampers: 'none' }), 0.3, 0.7, { quality: q, hook: (x) => { v ??= x.voices[0]; } }); return { L, v: e.voices[0], sym: e.symRunning }; };
  const hi = at('high'), med = at('medium'), lo = at('low');
  assert.ok(hi.v.nStruck > 24 && med.v.nStruck <= 24 && lo.v.nStruck <= 12, `${hi.v.nStruck} ${med.v.nStruck} ${lo.v.nStruck}`);
  assert.ok(hi.v.strings === 4 && lo.v.strings === 2, `${lo.v.strings}`);
  assert.ok(lo.sym === 0 && med.sym < hi.sym, `${hi.sym} ${med.sym} ${lo.sym}`);
  for (const r of [med, lo]) { const d = dB(maxAbs(r.L) / maxAbs(hi.L)); assert.ok(Math.abs(d) < 4, `${d.toFixed(1)} dB`); }
  const f = et(60); assert.ok(Math.abs(cents(peak(lo.L, f, 2400, 2400 + 8192), f)) < 5);
});
test('CPU: twelve ringing dulcimer courses render well faster than real time', () => {
  const keys = [48, 52, 55, 60, 64, 67, 72, 76, 79, 84, 88, 91], t0 = performance.now();
  run(P({ build: 'dulcimer', dampers: 'none' }), keys.map((k, i) => [i * 0.05, 'on', k, 0.8]), 3);
  const ratio = (performance.now() - t0) / 3000;
  assert.ok(ratio < 0.35, `${(ratio * 100).toFixed(0)} % of real time`);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
