// Sticky-pad piano checks. Run: node test/pianet-tests.mjs
//
// First the physics against independent results (beam theory, Kendall's
// pull-off, the closed-form limits of the crack law and of the pickups), then
// the engine against the model: pitch, decay, release, the advertised effects,
// level, stability and CPU.

import assert from 'node:assert/strict';
import { unitReed, tipMassRoots } from '../pianet/src/reed.js';
import {
  keyReed, Pluck, PlateRail, pullOff, pullOffFast, workOfAdhesion, emFlux, emH2, esCap, releaseCurve, PAD, ES, KEY_LO, KEY_HI,
} from '../pianet/src/pianet-model.js';
import { PianetEngine } from '../pianet/src/pianet-engine.js';
import { GROUPS, DEFAULTS, PRESETS } from '../pianet/src/pianet-params.js';
import { keyFreq } from '../shared/dsp.js';

const FS = 48000;
let failures = 0;
function test(name, fn) { try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const dB = (a, b) => 20 * Math.log10(a / b);

// Render through the engine in 128-sample blocks. events: [[t, 'on', key, vel] | [t, 'off', key] | [t, 'sus', on]]
function render(params, sec, events, msgs = []) {
  const e = new PianetEngine(FS);
  e.setParams(params);
  e.post = (m) => msgs.push(m);
  const n = Math.round(sec * FS), L = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, ...r]) => [Math.round(t * FS), ...r]).sort((a, b) => a[0] - b[0]);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j][0] <= s) {
      const [, type, a, b] = ev[j++];
      if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a); else e.setSustain(a);
    }
    e.process(bL, bR, bl);
    L.set(bL.subarray(0, Math.min(bl, n - s)), s);
  }
  return { L, e };
}
const note = (key, params, vel, sec, off) => render(params, sec, off === undefined ? [[0, 'on', key, vel]] : [[0, 'on', key, vel], [off, 'off', key]]).L;
function tone(x, f, a, b) { // Hann-windowed Goertzel amplitude
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const peak = (x) => { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p; };
// Fourier amplitudes of one period of a sampled periodic function.
function harmonics(fn, K = 4, N = 4096) {
  const out = [];
  for (let k = 1; k <= K; k++) { let re = 0, im = 0; for (let i = 0; i < N; i++) { const th = (2 * Math.PI * i) / N, v = fn(th); re += v * Math.cos(k * th); im += v * Math.sin(k * th); } out.push((2 * Math.hypot(re, im)) / N); }
  return out;
}

console.log('reed (Euler–Bernoulli strip + solder)');
test('FEM matches the exact cantilever-with-tip-mass frequency equation (Blevins)', () => {
  for (const R of [0, 0.5, 2]) {
    const ex = tipMassRoots(R, 3).map((b) => b * b), u = unitReed({ r: R, s: 1, j: 0, nModes: 3 });
    ex.forEach((x, n) => assert.ok(Math.abs(u.Lam[n] / x - 1) < 1e-4, `R=${R} mode ${n + 1}: ${u.Lam[n]} vs ${x}`));
  }
  const bare = unitReed({ nModes: 4 });
  [6.2669, 17.5475, 34.3861].forEach((r, i) => assert.ok(Math.abs(bare.Lam[i + 1] / bare.Lam[0] - r) < 2e-3 * r));
});
test('modal static compliance at the pad equals x³/(3EI) (point-loaded cantilever)', () => {
  const u = unitReed({ nModes: 30 }), x = 0.8;
  let c = 0; for (let n = 0; n < u.nModes; n++) c += u.shape(n, x) ** 2 / u.Lam[n] ** 2;
  assert.ok(Math.abs(c / (x ** 3 / 3) - 1) < 1e-4, `${c} vs ${x ** 3 / 3}`);
  for (const m of [36, 60, 96]) { // the engine's kept modes carry almost all of it
    const kr = keyReed(m, P()), exact = kr.xc ** 3 / (3 * kr.EI);
    assert.ok(1 / kr.kc / exact > 0.99 && 1 / kr.kc / exact <= 1, `${m}: ${(1 / kr.kc / exact).toFixed(4)}`);
  }
});
test('every key: the reed is cut to its pitch; heavier solder → shorter reed, higher overtones', () => {
  for (let m = KEY_LO; m <= KEY_HI; m++) {
    const kr = keyReed(m, P());
    assert.ok(Math.abs(cents(kr.modes[0].f, keyFreq(m))) < 0.01, `${m}`);
  }
  const lo = keyReed(48, P({ tipMass: 0.3 })), hi = keyReed(48, P({ tipMass: 3 }));
  assert.ok(hi.L < lo.L && hi.modes[1].ratio > lo.modes[1].ratio + 2, `L ${(lo.L * 1e3).toFixed(1)}→${(hi.L * 1e3).toFixed(1)} mm, f₂/f₁ ${lo.modes[1].ratio.toFixed(2)}→${hi.modes[1].ratio.toFixed(2)}`);
  const c2 = keyReed(36, P()), c7 = keyReed(96, P());
  console.log(`        reeds: C2 ${(c2.L * 1e3).toFixed(1)} mm, ${(c2.Msolder * 1e3).toFixed(2)} g solder, f₂/f₁ = ${c2.modes[1].ratio.toFixed(2)} · C7 ${(c7.L * 1e3).toFixed(1)} mm, f₂/f₁ = ${c7.modes[1].ratio.toFixed(2)}`);
});

console.log('adhesion (Kendall flat punch + Gent–Schultz / Maugis–Barquins kinetics)');
test('slow loading pulls off at Kendall\'s F₀ = √(8π a₀³ E* G₀)', () => {
  const F0 = 0.25, n = 0.6;
  assert.ok(Math.abs(Math.sqrt(8 * Math.PI * PAD.a0 ** 3 * PAD.Estar * workOfAdhesion(F0)) / F0 - 1) < 1e-12);
  const r = [1, 0.1, 0.01, 1e-3, 1e-4].map((R) => pullOff(R, F0, n, 1e-4 / R) / F0); // N/s
  for (let i = 1; i < r.length; i++) assert.ok(r[i] < r[i - 1] && r[i] > 1, r.join(', '));
  assert.ok(r[4] < 1.005, `F*/F₀ = ${r.map((x) => x.toFixed(4)).join(' → ')}`);
  console.log(`        G₀ = ${workOfAdhesion(F0).toFixed(2)} J/m² for F₀ = ${F0} N over a ${(PAD.a0 * 1e3).toFixed(2)} mm disc`);
});
test('fast loading: pull-off force → closed form ∝ R^(n/(2+n))', () => {
  for (const n of [0.4, 0.6, 1]) {
    const F0 = 0.25, R1 = 1e4, R2 = 1e5, f1 = pullOff(R1, F0, n, 2e-9), f2 = pullOff(R2, F0, n, 2e-10);
    assert.ok(Math.abs(f1 / pullOffFast(R1, F0, n) - 1) < 0.04, `n=${n}: ${f1} vs ${pullOffFast(R1, F0, n)}`);
    const slope = Math.log(f2 / f1) / Math.log(R2 / R1);
    assert.ok(Math.abs(slope - n / (2 + n)) < 0.01, `n=${n}: slope ${slope.toFixed(4)} vs ${(n / (2 + n)).toFixed(4)}`);
  }
});

console.log('pickups');
test('magnetic: dΦ/dt harmonics fall by the closed-form ratio 2ρ, ρ = (1 − √(1−ε²))/ε', () => {
  for (const [Y, g] of [[0.3e-3, 1e-3], [0.45e-3, 0.5e-3]]) {
    const dPhi = (th) => (emFlux(Y * Math.sin(th + 1e-6), g) - emFlux(Y * Math.sin(th - 1e-6), g)) / 2e-6;
    const h = harmonics(dPhi, 3);
    assert.ok(Math.abs(h[1] / h[0] / emH2(Y, g) - 1) < 1e-3, `${h[1] / h[0]} vs ${emH2(Y, g)}`);
  }
});
test('electrostatic: edge level with the reed gives no even harmonics; a raised edge gives a strong 2nd', () => {
  const g = 0.3e-3, Y = 0.3e-3;
  const lvl = harmonics((th) => esCap(Y * Math.sin(th), g, 0), 4), up = harmonics((th) => esCap(Y * Math.sin(th), g, 0.25e-3), 4);
  assert.ok(lvl[1] < 1e-9 * lvl[0] && lvl[3] < 1e-9 * lvl[0] && lvl[2] > 1e-3 * lvl[0], 'odd only');
  assert.ok(up[1] > 0.15 * up[0], `raised edge: H2/H1 = ${(up[1] / up[0]).toFixed(3)}`);
});
test('electrostatic rail: first-order high-pass at 1/(2πRC) between constant voltage and constant charge', () => {
  const fs = 96000, tau = ES.R * ES.Cbus, c = 1e-15;
  for (const f of [20, 1 / (2 * Math.PI * tau), 2000]) {
    const r = new PlateRail(fs), N = Math.round(fs * (0.2 + 40 / f)), w = 2 * Math.PI * f;
    let re = 0, im = 0, cnt = 0;
    for (let i = 0; i < N; i++) { const o = r.step(c * Math.sin((w * i) / fs)); if (i > fs * 0.1) { re += o * Math.cos((w * i) / fs); im += o * Math.sin((w * i) / fs); cnt++; } }
    const amp = (2 * Math.hypot(re, im)) / cnt, wt = w * tau, exact = ((ES.Vb * c) / ES.Cbus) * (wt / Math.sqrt(1 + wt * wt));
    assert.ok(Math.abs(amp / exact - 1) < 0.02, `${f.toFixed(0)} Hz: ${amp} vs ${exact}`);
  }
});

console.log('engine');
test('every key on pitch within ±3 ¢ of 12-TET A440 (measured from the output)', () => {
  let worst = 0;
  for (let m = KEY_LO; m <= KEY_HI; m++) {
    const f0 = keyFreq(m), x = note(m, P({ tone: 20000 }), 0.6, 0.65), a = Math.round(0.12 * FS), b = x.length;
    let bf = f0, best = 0;
    for (let c = -8; c <= 8; c += 0.5) { const f = f0 * 2 ** (c / 1200), g = tone(x, f, a, b); if (g > best) { best = g; bf = f; } }
    const gl = tone(x, bf * 2 ** (-0.5 / 1200), a, b), gr = tone(x, bf * 2 ** (0.5 / 1200), a, b); // parabolic refinement
    const c = cents(bf, f0) + (0.5 * 0.5 * (gl - gr)) / (gl - 2 * best + gr);
    worst = Math.max(worst, Math.abs(c));
    assert.ok(Math.abs(c) < 3, `${m}: ${c.toFixed(2)} ¢`);
  }
  console.log(`        worst key ${worst.toFixed(2)} ¢`);
});
test('held note decays at the model\'s σ₁ (reed loss + thermoelastic + air)', () => {
  for (const m of [60, 76]) {
    const kr = keyReed(m, P()), f = kr.f0, x = note(m, P({ tone: 20000 }), 0.6, 2.4), W = 8192, a = Math.round(0.2 * FS), b = a + FS;
    const got = dB(tone(x, f, b, b + W), tone(x, f, a, a + W)), want = -20 * Math.log10(Math.E) * kr.modes[0].sigma;
    assert.ok(Math.abs(got - want) < 0.5, `${m}: ${got.toFixed(2)} dB/s vs ${want.toFixed(2)}`);
  }
  const t60 = (m) => keyReed(m, P()).modes[0].T60;
  console.log(`        T60 while held: C2 ${t60(36).toFixed(1)} s · C4 ${t60(60).toFixed(1)} s · C6 ${t60(84).toFixed(2)} s · C7 ${t60(96).toFixed(2)} s`);
});
test('a slow key: the reed is dragged quasi-statically and released where force = k·deflection', () => {
  for (const m of [72, 96]) {
    const kr = keyReed(m, P()), [r] = releaseCurve(m, P(), [0]);
    assert.ok(Math.abs(r.y * kr.kc / r.F - 1) < 0.03, `${m}: k·y = ${(r.y * kr.kc).toFixed(3)} N, F = ${r.F.toFixed(3)} N`);
  }
});
test('rate-dependent tack: the reed lets go at the force the crack law predicts for its loading rate', () => {
  const m = 84, kr = keyReed(m, P()), ks = 1 / (1 / kr.kc + 1 / (P().padK * 1e3));
  const rc = releaseCurve(m, P(), [0, 0.5, 1]);
  for (const r of rc) {
    const want = pullOff(ks * r.V, P().tack, P().rate, 2e-6);
    assert.ok(Math.abs(r.F / want - 1) < 0.15, `V = ${(r.V * 100).toFixed(0)} cm/s: ${r.F.toFixed(3)} N vs ramp model ${want.toFixed(3)} N`);
  }
  assert.ok(rc[2].F > 1.3 * rc[0].F);
  console.log(`        C6 release force: pp ${rc[0].F.toFixed(2)} N → ff ${rc[2].F.toFixed(2)} N (static tack ${P().tack} N)`);
});
test('velocity: louder with a faster key on every register, but only by a few dB', () => {
  for (const m of [36, 41, 48, 60, 72, 84, 96]) {
    const lv = [0.1, 0.4, 0.7, 1].map((v) => rms(note(m, P({ tone: 20000 }), v, 0.35), Math.round(0.1 * FS), Math.round(0.35 * FS)));
    for (let i = 1; i < lv.length; i++) assert.ok(lv[i] > lv[i - 1], `${m}: ${lv.map((x) => x.toFixed(3))}`);
    const range = dB(lv[3], lv[0]);
    assert.ok(range > 2 && range < 12, `${m}: pp→ff ${range.toFixed(1)} dB`);
  }
});
test('aged pads: low tack makes notes quiet, and with no tack they barely speak', () => {
  const lvl = (tack) => rms(note(60, P({ tack }), 0.7, 0.4), Math.round(0.1 * FS), Math.round(0.4 * FS));
  const fresh = lvl(0.25), aged = lvl(0.03), dead = lvl(0.005);
  assert.ok(dB(aged, fresh) < -12 && dB(dead, fresh) < -25, `aged ${dB(aged, fresh).toFixed(1)} dB, dead ${dB(dead, fresh).toFixed(1)} dB`);
  console.log(`        C4 re fresh pads: tack 30 mN ${dB(aged, fresh).toFixed(1)} dB · 5 mN ${dB(dead, fresh).toFixed(1)} dB`);
});
test('key up: the pad lands and chokes the reed; sustain holds it off; limp foam chokes slowly', () => {
  const after = (o, sus) => {
    const ev = [[0, 'on', 48, 0.7], [0.3, 'off', 48]];
    if (sus) ev.push([0, 'sus', true]);
    const { L } = render(P(o), 0.6, ev), ref = rms(L, Math.round(0.25 * FS), Math.round(0.3 * FS));
    return dB(rms(L, Math.round(0.5 * FS), Math.round(0.6 * FS)), ref);
  };
  const choke = after({}), held = after({}, true), limp = after({ padC: 0.02 });
  assert.ok(choke < -40, `pad down: ${choke.toFixed(1)} dB`);
  assert.ok(held > -6, `sustain: ${held.toFixed(1)} dB`);
  assert.ok(limp > choke + 15, `limp foam: ${limp.toFixed(1)} dB`);
  console.log(`        C3, 0.2–0.3 s after key up: ${choke.toFixed(0)} dB (pad c_p 0.25), ${limp.toFixed(0)} dB (c_p 0.02), ${held.toFixed(1)} dB (sustain)`);
});
test('re-tacking: a pad that lands on a moving reed must wait for it to stop before it grips again', () => {
  const F = (waitMs) => {
    const p = new Pluck(keyReed(36, P(), 96000), P(), 96000);
    p.press(0.7); while (!p.released) p.step();
    for (let i = 0; i < 9600; i++) p.step();
    p.lift(); while (p.hv !== 0) p.step();
    for (let i = 0; i < waitMs * 96; i++) p.step();
    p.press(0.7); while (!p.released && p.t < 0.3) p.step();
    return p.released ? p.rel.F : 0;
  };
  const soon = F(5), rested = F(200);
  assert.ok(soon < 0.75 * rested, `5 ms after landing ${soon.toFixed(2)} N, rested ${rested.toFixed(2)} N`);
});
test('the T\'s pole piece is an end stop: a reed swinging past the gap bounces off it', () => {
  const p = new Pluck(keyReed(36, P(), 96000), P(), 96000), g = 0.5e-3;
  p.stop = g; p.press(1);
  let lo = 0;
  for (let i = 0; i < 0.3 * 96000; i++) lo = Math.min(lo, p.step());
  assert.ok(p.hits > 0 && lo > -g - 0.1e-3, `lowest tip ${(lo * 1e3).toFixed(3)} mm, pole at ${-g * 1e3} mm, ${p.hits} samples in contact`);
});
test('magnetic pickup: a closer pole is louder and barks more', () => {
  const h = (gap) => { const x = note(57, P({ gap, tone: 20000 }), 0.7, 0.5), a = Math.round(0.1 * FS), b = a + 16384; return [tone(x, 220, a, b), dB(tone(x, 440, a, b), tone(x, 220, a, b))]; };
  const [far, h2far] = h(2), [near, h2near] = h(0.4);
  assert.ok(near > 1.5 * far && h2near > h2far + 4, `far: H2 ${h2far.toFixed(1)} dB · near: H2 ${h2near.toFixed(1)} dB, ${dB(near, far).toFixed(1)} dB louder`);
});
test('electrostatic pickup: edge level → no 2nd harmonic in the output; raised edge → strong 2nd', () => {
  const h2 = (offset) => { const x = note(57, P({ pickup: 'es', offset, tone: 20000 }), 0.7, 0.5), a = Math.round(0.1 * FS), b = a + 16384; return dB(tone(x, 440, a, b), tone(x, 220, a, b)); };
  const level = h2(0), raised = h2(0.25);
  assert.ok(level < -40 && raised > -20, `edge level ${level.toFixed(1)} dB, raised ${raised.toFixed(1)} dB`);
});
test('the reed is heard through both pickups at the model\'s partials', () => {
  for (const pickup of ['em', 'es']) {
    const kr = keyReed(48, P()), x = note(48, P({ pickup, tone: 20000 }), 0.8, 0.4), a = Math.round(0.03 * FS), b = a + 8192;
    const f2 = kr.modes[1].f;
    assert.ok(tone(x, f2, a, b) > 10 * tone(x, f2 * 1.04, a, b), `${pickup}: mode 2 at ${f2.toFixed(0)} Hz`);
  }
});
test('every parameter at its limits: finite, bounded, silent after release', () => {
  const ps = GROUPS.flatMap((g) => g.params).filter((p) => p.type !== 'select' && !['room', 'volume', 'velocity'].includes(p.id));
  const cases = [];
  for (const p of ps) for (const v of [p.min, p.max]) for (const pickup of ['em', 'es']) cases.push({ [p.id]: v, pickup });
  for (const pr of PRESETS) cases.push(pr.p);
  cases.push(Object.fromEntries(ps.map((p) => [p.id, p.min])), Object.fromEntries(ps.map((p) => [p.id, p.max])), { amp: 'combo', drive: 1 });
  let worst = 0;
  for (const o of cases) {
    const { L, e } = render(P(o), 1.6, [[0, 'on', 36, 1], [0, 'on', 60, 1], [0, 'on', 96, 1], [0.05, 'on', 61, 0.05], [0.6, 'off', 36], [0.6, 'off', 60], [0.6, 'off', 96], [0.6, 'off', 61]]);
    for (const v of L) assert.ok(Number.isFinite(v), JSON.stringify(o));
    const pk = peak(L);
    worst = Math.max(worst, pk);
    assert.ok(pk < 2.5, `${JSON.stringify(o)}: peak ${pk.toFixed(2)}`); // four ff notes; the defaults give ≈ 1
    const tail = peak(L.subarray(L.length - 4800));
    // limp foam is meant to let released notes ring on (its hint); everything else falls silent
    assert.ok(tail < (o.padC <= 0.02 ? 0.1 * pk : 3e-3), `${JSON.stringify(o)}: tail ${tail.toExponential(1)}`);
    assert.ok(e.voiceCount() <= 4);
  }
  console.log(`        ${cases.length} cases, loudest 4-note chord peak ${worst.toFixed(2)}`);
});
test('level: a forte note peaks between 0.1 and 0.5 on every register, both pickups', () => {
  for (const pickup of ['em', 'es']) for (const m of [36, 48, 60, 72, 84, 96]) {
    const pk = peak(note(m, P({ pickup }), 1, 0.4));
    assert.ok(pk > 0.1 && pk < 0.5, `${pickup} ${m}: ${pk.toFixed(3)}`);
  }
});
test('CPU: 10 voices render well inside real time', () => {
  const e = new PianetEngine(FS); e.setParams(P());
  for (const k of [48, 52, 55, 59, 60, 64, 67, 71, 72, 76]) e.noteOn(k, 0.8);
  const bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl), sec = 3, t0 = performance.now();
  for (let s = 0; s < sec * FS; s += bl) e.process(bL, bR, bl);
  const load = (performance.now() - t0) / 1000 / sec;
  assert.ok(load < 0.3 && e.voiceCount() === 10, `${(load * 100).toFixed(1)} % of real time`);
  console.log(`        10 voices: ${(load * 100).toFixed(1)} % of real time`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
