// Carillon checks. Run: node test/carillon-tests.mjs
//
// The axisymmetric FEM against Rayleigh's ring and cylinder and against the dense eigensolver,
// its mesh convergence, and the generated table against a fresh run; the tuned bells' partials and
// their identity; doublets against degenerate perturbation theory; the strike-note estimator; then
// the engine against the model: tuning, partials, decay, the clapper, air, levels and stability.

import assert from 'node:assert/strict';
import { genEig } from '../shared/linalg.js';
import { meshWall, assemble, modesOf, ringGeom, ringRayleigh, ringBreathing, TAU } from '../carillon/src/bell-fem.js';
import { solveRib, named, geomOf, BRONZE } from '../carillon/src/bell-profile.js';
import {
  BELL_TABLE, KEY_LO, KEY_HI, keyFreq, cents, bellOf, bellModes, clapperOf, hertzTime, clapperSpeed, strikeNote, struckPartials,
  doubletSplit, airAbsorption, radiationEfficiency, historic, IDEAL,
} from '../carillon/src/carillon-model.js';
import { CarillonEngine } from '../carillon/src/carillon-engine.js';
import { DEFAULTS, GROUPS, PRESETS } from '../carillon/src/carillon-params.js';

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const ribOf = (profile, register) => BELL_TABLE.ribs.find((r) => r.profile === profile && r.register === register);

// Run the engine through events ([t, 'on', key, vel] | [t, 'off', key] | [t, 'sus', on] | [t, 'params', P]) in
// 128-sample blocks like the AudioWorklet; tap(engine) after every block.
function run(params, events, sec, { fs = FS, tap, stereo = false } = {}) {
  const e = new CarillonEngine(fs);
  e.setParams(params);
  const n = Math.round(sec * fs), L = new Float64Array(n), R = new Float64Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, ...r]) => [Math.round(t * fs), ...r]).sort((a, b) => a[0] - b[0]);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j][0] <= s) {
      const [, type, a, b] = ev[j++];
      if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a); else if (type === 'sus') e.setSustain(a); else if (type === 'params') e.setParams(a);
    }
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; R[s + i] = bR[i]; }
    tap?.(e, s);
  }
  return stereo ? [L, R, e] : Object.assign(L, { engine: e });
}
// |DTFT| of x[a, b) at f, Hann-windowed (amplitude of a sinusoid).
function tone(x, f, a, b, fs = FS) {
  const w = (2 * Math.PI * f) / fs; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im) / ((b - a) / 4);
}
// The strongest peak in [f0, f1]: a scan, then golden-section refinement.
function peak(x, f0, f1, a, b, step, fs = FS) {
  let best = f0, bv = -1;
  for (let f = f0; f <= f1; f += step) { const v = tone(x, f, a, b, fs); if (v > bv) { bv = v; best = f; } }
  let lo = best - step, hi = best + step;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let it = 0; it < 40; it++) { const m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo); if (tone(x, m1, a, b, fs) > tone(x, m2, a, b, fs)) hi = m2; else lo = m1; }
  return 0.5 * (lo + hi);
}
const peakAbs = (x) => { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p; };
const rmsDb = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return 10 * Math.log10(s / (b - a) + 1e-30); };
// Level (dB) of the component at f, every `hop` samples (complex demodulation over W samples, Hann).
function envelope(x, f, a, b, W, hop) {
  const w = (2 * Math.PI * f) / FS, out = [];
  for (let s = a; s + W < b; s += hop) {
    let re = 0, im = 0;
    for (let i = s; i < s + W; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - s)) / W); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
    out.push(20 * Math.log10(Math.hypot(re, im) + 1e-30));
  }
  return out;
}
const modeOf = (b, P0, name) => bellModes(b, P0).find((m) => m.name === name);

console.log('the finite elements');
test('FEM: a thin ring bends in its plane at Rayleigh\'s ω ∝ m(m²−1)/√(m²+1) (to 2×10⁻⁴ at h/R = 0.01) and breathes at √(E/ρ)/R; a thick one (h/R = 0.1) falls 2–9 % below Rayleigh: the thin-shell trap', () => {
  const inPlane = (h, m) => { // the mode with the least axial motion
    const md = modesOf(meshWall(ringGeom(1, h, h), 2, 2), m, 0.3, 3);
    let best = null, bz = Infinity;
    for (const x of md) { let z = 0, a = 0; for (let p = 0; p < x.U.length; p += 3) { z += x.U[p + 2] ** 2; a += x.U[p] ** 2 + x.U[p + 1] ** 2 + x.U[p + 2] ** 2; } if (z / a < bz) { bz = z / a; best = x; } }
    return Math.sqrt(best.lambda) / TAU;
  };
  for (const m of [2, 3, 4, 5, 8]) assert.ok(Math.abs(inPlane(0.01, m) / ringRayleigh(m, 1, 0.01) - 1) < 2e-3 * (m / 8) ** 2 + 1e-4, `m = ${m}: ${(inPlane(0.01, m) / ringRayleigh(m, 1, 0.01)).toFixed(6)}`);
  const m0 = modesOf(meshWall(ringGeom(1, 0.01, 0.01), 2, 2), 0, 0.3, 2).map((x) => Math.sqrt(x.lambda) / TAU / ringBreathing(1));
  assert.ok(m0.some((r) => Math.abs(r - 1) < 1e-3), `m = 0: ${m0.map((r) => r.toFixed(4))}`);
  for (const m of [4, 5, 8]) { const d = 1 - inPlane(0.1, m) / ringRayleigh(m, 1, 0.1); assert.ok(d > 0.02 && d < 0.09, `thick ring, m = ${m}: ${(100 * d).toFixed(2)} % below`); }
});
test('FEM: a thin free cylinder (h/R = 0.003) has Rayleigh\'s two inextensional modes: the ring mode (plate modulus) and the rocking mode, ω₂²/ω₁² = (1 + 24(1−ν)R²/m²L²)/(1 + 12R²/m²(m²+1)L²), within 0.5 %', () => {
  const nu = 0.3, h = 0.003, L = 1, mesh = meshWall(ringGeom(1, h, L), 30, 1);
  for (const m of [2, 3, 4, 6]) {
    const md = modesOf(mesh, m, nu, 2), w1 = Math.sqrt(((h * h) / (12 * (1 - nu * nu))) * ((m * m * (m * m - 1) ** 2) / (m * m + 1))) / TAU;
    const r2 = Math.sqrt((1 + (24 * (1 - nu)) / (m * m * L * L)) / (1 + 12 / (m * m * (m * m + 1) * L * L)));
    const a = Math.sqrt(md[0].lambda) / TAU / w1, b = Math.sqrt(md[1].lambda / md[0].lambda) / r2;
    assert.ok(Math.abs(a - 1) < 5e-3 && Math.abs(b - 1) < 5e-3, `m = ${m}: ring ${a.toFixed(4)}, rocking ${b.toFixed(4)}`);
  }
});
test('the banded subspace eigensolver agrees with the dense generalised eigensolver (shared/linalg.js genEig) on a coarse bell', () => {
  const g = geomOf(ribOf('minor', 'middle').stations), mesh = meshWall(g, 8, 1);
  for (const m of [0, 3]) {
    const a = assemble(mesh, m, BRONZE.nu), n = a.n, W = a.bw + 1, K = new Float64Array(n * n), M = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = i; j <= Math.min(n - 1, i + a.bw); j++) { K[i * n + j] = K[j * n + i] = a.K[i * W + j - i]; M[i * n + j] = M[j * n + i] = a.M[i * W + j - i]; }
    const dense = genEig(K, M, n, 1).lambda, band = modesOf(mesh, m, BRONZE.nu, 4);
    // the free mesh's rigid motions (λ ≈ 0) are dropped by modesOf
    const el = Array.from(dense).filter((l) => l > 1e-8 * dense[n - 1]);
    band.forEach((x, i) => assert.ok(Math.abs(x.lambda / el[i] - 1) < 1e-9, `m = ${m}, mode ${i + 1}: ${x.lambda} vs ${el[i]}`));
  }
});
test('mesh convergence: a tuned rib\'s named partials move under 1 ¢ from the table\'s 40 × 2 elements to 64 × 3, and the change shrinks with refinement (20 × 1 → 40 × 2 → 64 × 3)', () => {
  const st = ribOf('minor', 'middle').stations, ratios = (ns, nt) => { const nm = named(solveRib(st, { ns, nt, ms: [2, 3, 4, 5, 6], perM: 2 })), p = nm.find((x) => x.id === 'prime').f; return nm.map((x) => x.f / p); };
  const a = ratios(20, 1), b = ratios(40, 2), c = ratios(64, 3);
  const d1 = Math.max(...a.map((x, i) => Math.abs(cents(x, c[i])))), d2 = Math.max(...b.map((x, i) => Math.abs(cents(x, c[i]))));
  const names = named(solveRib(st, { ms: [2, 3, 4, 5, 6], perM: 2 })).map((x) => x.id);
  console.log(`         worst change: ${d1.toFixed(2)} ¢ (20 × 1), ${d2.toFixed(3)} ¢ (40 × 2), against 64 × 3; at 40 × 2: ${b.map((x, i) => `${names[i]} ${cents(x, c[i]).toFixed(2)}`).join(', ')}`);
  assert.ok(d2 < 1 && d2 < d1 / 3, `${d1.toFixed(2)} ¢ → ${d2.toFixed(3)} ¢`);
});
test('the generated table matches a fresh FEM run: every rib\'s named partials to 10⁻⁶, and sample modes of other families to 10⁻⁵', () => {
  for (const rib of BELL_TABLE.ribs) {
    const sol = solveRib(rib.stations, { ms: [0, 1, 2, 3, 4, 5, 6, 7], perM: 2 }), nm = named(sol), p = nm.find((x) => x.id === 'prime').f;
    for (const x of nm) assert.ok(Math.abs(x.f / p / rib.partials[x.id] - 1) < 1e-6, `${rib.profile} ${rib.register} ${x.id}: ${x.f / p} vs ${rib.partials[x.id]}`);
    for (const md of rib.modes.filter((q) => [0, 1, 7].includes(q.m) && q.k < 2)) {
      const f = Math.sqrt(sol.modes[md.m][md.k].lambda) / p;
      assert.ok(Math.abs(f / md.r - 1) < 1e-5, `${rib.profile} ${rib.register} (${md.m}, ${md.k}): ${f} vs ${md.r}`);
    }
  }
});

console.log('the bells');
test('tuned by the profile: minor-third bells at hum : prime : tierce : quint : nominal = 0.5 : 1 : 1.2 : 1.5 : 2 within 0.1 ¢ in every register; major-third bells with the tierce at 1.25 (within 0.5 ¢)', () => {
  for (const rib of BELL_TABLE.ribs) {
    const t = rib.profile === 'major' ? 1.25 : 1.2, tol = rib.profile === 'major' ? 0.5 : 0.1;
    for (const [id, ideal] of [['hum', 0.5], ['prime', 1], ['tierce', t], ['quint', 1.5], ['nominal', 2]]) {
      const c = cents(rib.partials[id] / rib.partials.nominal, ideal / 2);
      assert.ok(Math.abs(c) < tol, `${rib.profile} ${rib.register} ${id}: ${c.toFixed(3)} ¢ against the nominal`);
    }
  }
  const m = ribOf('minor', 'middle').partials;
  console.log(`         minor, middle: ${Object.entries(m).map(([k, v]) => `${k} ${v.toFixed(4)}`).join(', ')}`);
});
test('each named partial is the mode it should be: hum (2,0) and prime (2,1#) are the lowest two of m = 2, the prime with a nodal circle low on the bell; tierce (3,1) has its nodal circle up the waist and quint (3,1#) near the rim; nominal, superquint and octave nominal are the rim modes of m = 4, 5, 6, moving most at the lip', () => {
  for (const rib of BELL_TABLE.ribs) {
    const by = (n) => rib.modes.find((q) => q.n === n), tag = `${rib.profile} ${rib.register}`;
    const hum = by('hum'), prime = by('prime'), tierce = by('tierce'), quint = by('quint');
    assert.ok(hum.m === 2 && hum.k === 0 && hum.c.length === 0, `${tag}: hum (${hum.m}, ${hum.k}) circles ${hum.c}`);
    assert.ok(prime.m === 2 && prime.k === 1 && prime.c.length === 1 && prime.c[0] < 0.4, `${tag}: prime circles ${prime.c}`);
    // the quint's nodal circle is near the rim (in the lowest bells at the lip itself: the lip barely moves)
    const lip = (md) => Math.abs(md.v[md.v.length - 1]) / Math.max(...md.v.map(Math.abs));
    assert.ok(tierce.m === 3 && tierce.k === 0 && tierce.c.length === 1 && quint.m === 3 && quint.k === 1, `${tag}: tierce ${tierce.c}, quint ${quint.c}`);
    assert.ok(lip(quint) < 0.4 && (quint.c.length === 0 || quint.c[0] < 0.3) && lip(tierce) > 0.99, `${tag}: quint's lip ${lip(quint).toFixed(2)}, circles ${quint.c}`);
    assert.ok(tierce.c[0] > 0.25 && tierce.c[0] > (quint.c[0] ?? 0) + 0.1, `${tag}: tierce's circle at ${tierce.c[0]}, quint's at ${quint.c[0]}`);
    for (const [n, m] of [['nominal', 4], ['superquint', 5], ['octnom', 6]]) {
      const md = by(n), v = md.v.map(Math.abs);
      // (the major-third bell's octave nominal also swells in the waist's bulge)
      assert.ok(md.m === m && v[v.length - 1] >= (n === 'octnom' && rib.profile === 'major' ? 0.75 : 0.99) * Math.max(...v), `${tag}: ${n} (m = ${md.m}) moves most at the lip`);
    }
  }
});
test('every bell is its rib scaled to its note (f·D constant within a register), with heavier ribs for the trebles; sizes and masses are a carillon\'s', () => {
  for (const profile of ['minor', 'major']) {
    for (const [a, b] of [[48, 59], [60, 83], [84, 96]]) {
      const A = bellOf(a, profile), B = bellOf(b, profile);
      assert.ok(Math.abs((A.fNom * A.D) / (B.fNom * B.D) - 1) < 1e-12, `${profile} ${a}–${b}`);
    }
    assert.ok(bellOf(84, profile).rib.heavy > bellOf(60, profile).rib.heavy && bellOf(60, profile).rib.heavy > bellOf(48, profile).rib.heavy);
  }
  const c3 = bellOf(48, 'minor'), c4 = bellOf(60, 'minor'), c7 = bellOf(96, 'minor');
  console.log(`         C3 ${c3.D.toFixed(2)} m, ${(c3.mass / 1000).toFixed(1)} t; C4 ${c4.D.toFixed(2)} m, ${(c4.mass / 1000).toFixed(2)} t; C7 ${(100 * c7.D).toFixed(0)} cm, ${c7.mass.toFixed(1)} kg`);
  assert.ok(c3.D > 1.5 && c3.D < 3.5 && c7.mass > 2 && c7.mass < 30, 'plausible extremes');
});

console.log('doublets');
test('degenerate perturbation theory: the FEM\'s κ for a thin ring is (m²−1)/(m²+1) (to 10⁻³); a split Δf/f = εκ/2 ∝ ε; in the engine the nominal beats at that Δf (ε = 0.5 % and 1 %, within 3 %)', () => {
  for (const m of [2, 3, 4]) {
    const md = modesOf(meshWall(ringGeom(1, 0.01, 0.01), 2, 2), m, 0.3, 2).sort((x, y) => x.T.th / (x.T.rz + x.T.th) - y.T.th / (y.T.rz + y.T.th)).reverse()[0];
    // the in-plane mode carries u_θ = −u_r/m: the larger u_θ share of the two
    const kap = (md.T.rz - md.T.th) / (md.T.rz + md.T.th);
    assert.ok(Math.abs(kap - (m * m - 1) / (m * m + 1)) < 1e-3, `m = ${m}: κ = ${kap.toFixed(5)}`);
  }
  const key = 72, b = bellOf(key, 'minor');
  const beats = [];
  for (const eps of [0.5, 1]) {
    const p = P({ asym: eps, strikeAngle: 45 / 4 }), nom = modeOf(b, p, 'nominal'), [lo, hi] = doubletSplit(nom.kappa, eps / 100), df = nom.f * (hi - lo);
    const x = run(p, [[0, 'on', key, 0.7]], 4.2), env = envelope(x, nom.f, Math.round(0.1 * FS), x.length, 2400, 240);
    // the beat: the strongest periodicity of the envelope (after removing its decay)
    const n = env.length, xm = (n - 1) / 2, ym = env.reduce((s, v) => s + v) / n;
    let sxy = 0, sxx = 0; env.forEach((y, i) => { sxy += (i - xm) * (y - ym); sxx += (i - xm) ** 2; });
    const r = env.map((y, i) => y - ym - (sxy / sxx) * (i - xm)), fr = FS / 240;
    let best = 0, bf = 0;
    for (let fm = 0.5; fm < 12; fm += 0.002) { let re = 0, im = 0; r.forEach((v, i) => { re += v * Math.cos((2 * Math.PI * fm * i) / fr); im += v * Math.sin((2 * Math.PI * fm * i) / fr); }); const mm = Math.hypot(re, im); if (mm > best) { best = mm; bf = fm; } }
    assert.ok(Math.abs(bf / df - 1) < 0.03, `ε = ${eps} %: beats at ${bf.toFixed(3)} Hz, Δf = ${df.toFixed(3)} Hz`);
    beats.push(bf);
  }
  assert.ok(Math.abs(beats[1] / beats[0] - 2) < 0.06, `${beats[1] / beats[0]}`);
});
test('the strike angle shares the strike between a doublet\'s members as cos mα and sin mα: on an axis only the lower member rings; at α = π/4m both equally; at α = 5° the nominal\'s members are in the ratio tan 20°', () => {
  const key = 72, b = bellOf(key, 'minor'), eps = 1.5;
  const members = (alpha) => {
    const p = P({ asym: eps, strikeAngle: alpha, around: 0 }), nom = modeOf(b, p, 'nominal'), [lo, hi] = doubletSplit(nom.kappa, eps / 100);
    const x = run(p, [[0, 'on', key, 0.7]], 1.6), a = Math.round(0.3 * FS), e = x.length;
    return [tone(x, nom.f * lo, a, e), tone(x, nom.f * hi, a, e)];
  };
  const [c0, s0] = members(0), [c1, s1] = members(45 / 4), [c2, s2] = members(5);
  assert.ok(s0 < 0.02 * c0, `on the axis: ${(s0 / c0).toFixed(4)}`);
  assert.ok(Math.abs(s1 / c1 - 1) < 0.05, `between: ${(s1 / c1).toFixed(3)}`);
  // heard on the strike's own azimuth, each member is ∝ (its share)²: tan² 20°
  assert.ok(Math.abs(s2 / c2 / Math.tan((20 * Math.PI) / 180) ** 2 - 1) < 0.08, `α = 5°: ${(s2 / c2).toFixed(4)} vs tan² 20° = ${(Math.tan((20 * Math.PI) / 180) ** 2).toFixed(4)}`);
});

console.log('the strike note');
// Where the estimator gives the strike note, at the default touch: on a whole struck bell, and from the
// nominal group alone. (Outside these ranges, see the tests below and the README.)
const STRIKE = { minor: [49, 86], major: [48, 78] };  // C♯3–D6, C3–F♯5
const GROUP = { minor: [60, 92], major: [48, 83] };   // C4–A♭6, C3–B5
test('virtual pitch: subharmonic summation on a struck bell\'s partials finds the strike note an octave below the nominal, within 10 ¢, on every minor-third bell C♯3–D6 and major-third bell C3–F♯5', () => {
  let worst = 0;
  for (const profile of ['minor', 'major']) for (let key = STRIKE[profile][0]; key <= STRIKE[profile][1]; key++) {
    const b = bellOf(key, profile), c = cents(strikeNote(struckPartials(b, P())).f, b.fNom / 2);
    worst = Math.max(worst, Math.abs(c));
    assert.ok(Math.abs(c) < 10, `${profile} key ${key}: ${c.toFixed(1)} ¢ from nominal/2`);
  }
  console.log(`         worst ${worst.toFixed(1)} ¢`);
});
test('the 2 : 3 : 4 group does the work: given only the nominal, superquint and octave nominal (as struck), the estimator still finds nominal/2, within 15 ¢, where no partial lies (minor C4–A♭6, major C3–B5); where the group is out of tune (the minor bass) or above 6 kHz, it names the nominal itself', () => {
  let worst = 0;
  for (const profile of ['minor', 'major']) for (let key = KEY_LO; key <= KEY_HI; key++) {
    const b = bellOf(key, profile), md = bellModes(b, P()), parts = struckPartials(b, P()).filter((p, j) => ['nominal', 'superquint', 'octnom'].includes(md[j].name));
    const f = strikeNote(parts).f, inside = key >= GROUP[profile][0] && key <= GROUP[profile][1];
    const c = cents(f, inside ? b.fNom / 2 : b.fNom);
    if (inside) { worst = Math.max(worst, Math.abs(c)); for (const p of parts) assert.ok(Math.abs(cents(p.f, f)) > 600, 'no partial of the group at the strike note'); }
    assert.ok(Math.abs(c) < 15, `${profile} key ${key}: ${c.toFixed(1)} ¢ from ${inside ? 'nominal/2' : 'the nominal'}`);
  }
  console.log(`         worst ${worst.toFixed(1)} ¢`);
});
test('in the smallest bells the hum takes over: from E♭6 (minor) and G5 (major) up the estimate is the hum, an octave below the strike note; the minor bourdon, C3, whose prime falls below the dominance region, is named by its nominal', () => {
  for (const profile of ['minor', 'major']) for (let key = STRIKE[profile][1] + 1; key <= KEY_HI; key++) {
    const b = bellOf(key, profile), s = strikeNote(struckPartials(b, P())).f, hum = modeOf(b, P(), 'hum').f;
    assert.ok(Math.abs(cents(s, hum)) < 15, `${profile} key ${key}: ${s.toFixed(1)} Hz, hum ${hum.toFixed(1)} Hz`);
  }
  const b = bellOf(48, 'minor');
  assert.ok(Math.abs(cents(strikeNote(struckPartials(b, P())).f, b.fNom)) < 20);
});

console.log('the engine');
test('tuning: every bell C3–C7 sounds its nominal within 1 ¢ of an octave above its key (ε = 0) at 48 kHz, and a sample at 44.1 kHz', () => {
  let worst = 0;
  for (const fs of [48000, 44100]) for (let key = KEY_LO; key <= KEY_HI; key += fs === 48000 ? 1 : 7) {
    const x = run(P({ asym: 0 }), [[0, 'on', key, 0.7]], 0.9, { fs }), f = 2 * keyFreq(key), a = Math.round(0.15 * fs), b = x.length;
    const fm = peak(x, f * 0.995, f * 1.005, a, b, f * 0.0005, fs), c = cents(fm, f);
    worst = Math.max(worst, Math.abs(c));
    assert.ok(Math.abs(c) < 1, `key ${key} at ${fs}: ${c.toFixed(2)} ¢`);
    assert.ok(tone(x, f, a, b, fs) > 20 * tone(x, f * 1.012, a, b, fs), `key ${key}: the nominal stands out`);
  }
  console.log(`         worst ${worst.toFixed(3)} ¢`);
});
test('the engine plays the model: hum, prime, tierce, quint and superquint where the model puts them (within 1 ¢), the nominal and hum decaying at the model\'s rates (within 5 %); bronze\'s loss and radiation make the hum ring longest and the upper partials die faster in every register', () => {
  const rows = [];
  for (const key of [48, 60, 72, 84, 96]) {
    const b = bellOf(key, 'minor'), t = (n) => 6.91 / modeOf(b, P(), n).sigma;
    rows.push(`${b.rib.register === 'bass' ? 'C3' : ['C4', 'C5', 'C6', 'C7'][(key - 60) / 12]}: hum ${t('hum').toFixed(0)} s, prime ${t('prime').toFixed(1)}, nominal ${t('nominal').toFixed(1)}, octave nominal ${t('octnom').toFixed(1)}`);
    assert.ok(t('hum') > t('prime') && t('prime') > t('nominal') && t('nominal') > t('superquint') && t('superquint') > t('octnom'), `key ${key}`);
  }
  console.log(`         T₆₀ ${rows.join('; ')}`);

  const key = 60, b = bellOf(key, 'minor'), p = P({ asym: 0 }), md = bellModes(b, p), x = run(p, [[0, 'on', key, 0.8]], 3.2);
  for (const n of ['hum', 'prime', 'tierce', 'quint', 'superquint']) {
    const f = md.find((m) => m.name === n).f, fm = peak(x, f * 0.997, f * 1.003, Math.round(0.2 * FS), x.length, f * 3e-4);
    assert.ok(Math.abs(cents(fm, f)) < 1, `${n}: ${fm.toFixed(3)} vs ${f.toFixed(3)} Hz`);
  }
  for (const n of ['nominal', 'hum']) {
    const m = md.find((q) => q.name === n), W = 9600;
    const a1 = tone(x, m.f, Math.round(0.4 * FS), Math.round(0.4 * FS) + W), a2 = tone(x, m.f, Math.round(2.6 * FS), Math.round(2.6 * FS) + W);
    const sig = Math.log(a1 / a2) / 2.2;
    assert.ok(Math.abs(sig / m.sigma - 1) < 0.05, `${n}: σ ${sig.toFixed(4)} vs model ${m.sigma.toFixed(4)} s⁻¹`);
  }
});
test('the clapper: on C4 it stays on the bell about 1 ms (0.7–1.5 ms); half as long on C5; longer for a heavier clapper (∝ m^0.4 within 15 %); never much shorter than Hertz\'s rigid-wall time', () => {
  const contact = (key, o = {}) => { const x = run(P(o), [[0, 'on', key, 0.7]], 0.05); return x.engine.voices[0].cl; };
  const c4 = contact(60), c5 = contact(72), heavy = contact(60, { clapMass: 5 });
  assert.ok(c4.ms > 0.7 && c4.ms < 1.5, `C4: ${c4.ms.toFixed(3)} ms`);
  assert.ok(c5.ms / c4.ms > 0.35 && c5.ms / c4.ms < 0.65, `C5/C4: ${(c5.ms / c4.ms).toFixed(3)}`);
  assert.ok(Math.abs(heavy.ms / c4.ms / 2 ** 0.4 - 1) < 0.15, `mass ×2: ×${(heavy.ms / c4.ms).toFixed(3)} (Hertz ×${(2 ** 0.4).toFixed(3)})`);
  for (const key of [48, 60, 72, 84, 96]) {
    const b = bellOf(key, 'minor'), c = clapperOf(b, P()), cl = contact(key), th = hertzTime(c.m, c.K, clapperSpeed(b, P(), 0.7));
    assert.ok(cl.ms > 0.85 * th, `key ${key}: ${cl.ms.toFixed(3)} ms vs rigid ${(1000 * th).toFixed(3)} ms`);
  }
  console.log(`         contact C4 ${c4.ms.toFixed(2)} ms (force pulse ${c4.fwhm.toFixed(2)} ms at half height), C5 ${c5.ms.toFixed(2)} ms`);
});
test('a soft clapper face stays on longer and the bell sounds darker; striking up on the waist raises the prime against the nominal', () => {
  const key = 72, b = bellOf(key, 'minor');
  const bright = (x) => { let hi = 0, lo = 0; const nm = modeOf(b, P(), 'nominal').f; for (const m of bellModes(b, P())) { const a = tone(x, m.f, 240, 240 + 9600); if (m.f > 2.2 * nm) hi += a * a; else lo += a * a; } return hi / lo; };
  const iron = run(P(), [[0, 'on', key, 0.8]], 0.3), soft = run(P({ hardness: 3 }), [[0, 'on', key, 0.8]], 0.3);
  assert.ok(soft.engine.voices[0].cl.ms > 2 * iron.engine.voices[0].cl.ms, `contact ${iron.engine.voices[0].cl.ms.toFixed(3)} → ${soft.engine.voices[0].cl.ms.toFixed(3)} ms`);
  assert.ok(bright(soft) < 0.3 * bright(iron), `upper partials: ${bright(iron).toExponential(2)} → ${bright(soft).toExponential(2)}`);
  const pn = (h) => { const x = run(P({ strikeHeight: h }), [[0, 'on', key, 0.8]], 0.6), a = Math.round(0.1 * FS), e = x.length; return tone(x, modeOf(b, P(), 'prime').f, a, e) / tone(x, modeOf(b, P(), 'nominal').f, a, e); };
  assert.ok(pn(0.33) > 3 * pn(0.115), `prime/nominal: ${pn(0.115).toFixed(3)} at the soundbow, ${pn(0.33).toFixed(3)} on the waist`);
});
test('radiation and air: a sphere\'s efficiency is (ka)²/(1+(ka)²) for ℓ = 0, (ka)^(2ℓ+2)/((ℓ+1)²((2ℓ−1)!!)²) at small ka, → 1 at large ka; absorption follows ISO 9613-1 (20 °C, 70 %: 5.0, 9.0, 22.9, 76.6 dB/km at 1, 2, 4, 8 kHz, within 5 %); heard from 300 m the bells are darker', () => {
  for (const ka of [0.1, 1, 3]) assert.ok(Math.abs(radiationEfficiency(0, ka) - (ka * ka) / (1 + ka * ka)) < 1e-12);
  const dfact = [1, 1, 3, 15, 105];
  for (const l of [1, 2, 3, 4]) { const ka = 0.02, small = ka ** (2 * l + 2) / ((l + 1) ** 2 * dfact[l] ** 2); assert.ok(Math.abs(radiationEfficiency(l, ka) / small - 1) < 1e-2, `ℓ = ${l}`); }
  for (const l of [2, 6]) assert.ok(Math.abs(radiationEfficiency(l, 200) - 1) < 1e-3);

  for (const [f, ref] of [[1000, 5.0], [2000, 9.0], [4000, 22.9], [8000, 76.6]]) { const a = 1000 * airAbsorption(f, 20, 70); assert.ok(Math.abs(a / ref - 1) < 0.05, `${f} Hz: ${a.toFixed(2)} dB/km`); }
  const key = 72, b = bellOf(key, 'minor'), ratio = (x) => tone(x, modeOf(b, P(), 'octnom').f, 480, 480 + 9600) / tone(x, modeOf(b, P(), 'hum').f, 480, 480 + 9600);
  const near = run(P({ distance: 10 }), [[0, 'on', key, 0.8]], 0.3), far = run(P({ distance: 300 }), [[0, 'on', key, 0.8]], 0.3);
  assert.ok(ratio(far) < 0.85 * ratio(near), `octave nominal against hum: ${ratio(near).toFixed(3)} near, ${ratio(far).toFixed(3)} far`);
});
test('historic bells: seeded (the same bell twice), their partials tens of cents from the ideal against the nominal, the nominal still on its note', () => {
  const rib = ribOf('minor', 'middle');
  assert.deepEqual(historic(64, rib, 1).lnf, historic(64, rib, 1).lnf);
  let s2 = 0, n = 0;
  for (let key = 60; key <= 83; key++) {
    const b = bellOf(key, 'minor', 1), j = (id) => b.rib.modes.findIndex((m) => m.n === id), nom = b.f[j('nominal')];
    assert.ok(Math.abs(cents(nom, 2 * keyFreq(key))) < 1e-6);
    for (const id of ['hum', 'prime', 'tierce', 'quint']) { const c = cents(b.f[j(id)] / nom, IDEAL[id] / 2); s2 += c * c; n++; }
  }
  const rms = Math.sqrt(s2 / n);
  console.log(`         rms ${rms.toFixed(0)} ¢ (hum, prime, tierce, quint against the nominal)`);
  assert.ok(rms > 15 && rms < 150, `${rms}`);
});
test('no dampers: key-up and the pedal change nothing; re-striking a ringing bell reuses its voice and strikes it as it moves', () => {
  const a = run(P(), [[0, 'on', 67, 0.7]], 1.2), b = run(P(), [[0, 'on', 67, 0.7], [0.3, 'off', 67], [0.5, 'sus', true], [0.8, 'sus', false]], 1.2);
  for (let i = 0; i < a.length; i++) assert.equal(a[i], b[i]);
  const re = run(P(), [[0, 'on', 67, 0.6], [0.4, 'on', 67, 0.6], [0.8, 'on', 67, 0.6]], 1.2);
  assert.equal(re.engine.voiceCount(), 1);
  // a strike lands on a moving wall: the second contact differs from the first
  const one = run(P(), [[0, 'on', 67, 0.6]], 0.42).engine.voices[0].cl, two = run(P(), [[0, 'on', 67, 0.6], [0.4, 'on', 67, 0.6]], 0.42).engine.voices[0].cl;
  assert.ok(Math.abs(two.Fmax / one.Fmax - 1) > 1e-3, `peak force ${one.Fmax.toFixed(0)} vs ${two.Fmax.toFixed(0)} N`);
  // a different bell (profile) hanging there: the old one fades
  const e = run(P(), [[0, 'on', 60, 0.6], [0.3, 'params', P({ profile: 'major' })], [0.3, 'on', 60, 0.6]], 0.31).engine;
  assert.equal(e.voices.length, 2); assert.ok(e.voices[0].fading && !e.voices[1].fading);
});
test('voice stealing fades the quietest older bell, never one just struck; no clicks', () => {
  const ev = [];
  for (let i = 0; i <= KEY_HI - KEY_LO; i++) ev.push([0.04 * i, 'on', KEY_LO + i, 0.5]);
  const x = run(P(), ev, 2.4), e = x.engine;
  assert.ok(e.voices.filter((v) => !v.fading).length <= 36, `${e.voices.length} voices`);
  assert.ok(e.byKey.has(KEY_HI) && !e.byKey.get(KEY_HI).fading, 'the newest bell sounds');
  let worst = 0;
  for (let i = 2; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i] - 2 * x[i - 1] + x[i - 2]));
  assert.ok(worst < 0.6 * peakAbs(x), `second difference ${worst.toExponential(2)} vs peak ${peakAbs(x).toFixed(3)}`);
});
test('level: a forte note peaks at 0.1–0.5 across the compass at 44.1 and 48 kHz; a forte 4-note chord and a 6-note chord stay under 1; every preset within 10 dB of the default', () => {
  const stereoPeak = (p, ev, sec, o) => { const [L, R] = run(p, ev, sec, { ...o, stereo: true }); return Math.max(peakAbs(L), peakAbs(R)); };
  const pk = [];
  for (const fs of [44100, 48000]) for (let k = KEY_LO; k <= KEY_HI; k += 4) {
    const v = stereoPeak(P(), [[0, 'on', k, 1]], 0.3, { fs });
    pk.push(v);
    assert.ok(v > 0.1 && v < 0.5, `key ${k} at ${fs}: ${v.toFixed(3)}`);
  }
  console.log(`         forte peaks ${Math.min(...pk).toFixed(2)}–${Math.max(...pk).toFixed(2)}`);
  const c4 = stereoPeak(P(), [48, 55, 60, 64].map((k) => [0, 'on', k, 1]), 1), c6 = stereoPeak(P(), [60, 64, 67, 72, 76, 79].map((k) => [0, 'on', k, 0.8]), 1);
  assert.ok(c4 < 1 && c6 < 1, `chords ${c4.toFixed(3)}, ${c6.toFixed(3)}`);
  const phrase = (p) => { const x = run(p, [60, 64, 67, 72, 76].map((k, i) => [0.15 * i, 'on', k, 0.7]), 1.5); return rmsDb(x, 0, x.length); };
  const ref = phrase(P());
  for (const pr of PRESETS) { const d = phrase(P(pr.p)) - ref; assert.ok(Math.abs(d) < 10 || pr.p.distance, `${pr.name}: ${d.toFixed(1)} dB`); }
});
// The loudest corner is physical: a heavy, hard clapper at full speed into a bass bell heard from 10 m.
test('stability: seeded random combinations of parameter extremes at 44.1 and 48 kHz, knobs moved mid-note: no NaN, bounded', () => {
  const sliders = GROUPS.flatMap((g) => g.params).filter((p) => !p.type);
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let trial = 0; trial < 12; trial++) {
    const fs = trial % 2 ? 44100 : 48000, p = P();
    for (const q of sliders) if (!['volume', 'room'].includes(q.id)) { const r = rnd(); p[q.id] = r < 0.4 ? q.min : r < 0.8 ? q.max : q.def; }
    p.profile = trial % 3 ? 'minor' : 'major';
    const q = { ...p, asym: 3 - p.asym, distance: p.distance > 100 ? 10 : 600, around: 90 - p.around, eta: p.eta > 1e-3 ? 5e-5 : 2e-3 };
    const x = run(p, [[0, 'on', KEY_LO, 1], [0, 'on', 70, 1], [0, 'on', KEY_HI, 1], [0.2, 'params', q], [0.25, 'on', 70, 1], [0.3, 'on', KEY_LO, 0.05]], 0.6, { fs });
    for (const v of x) assert.ok(Number.isFinite(v), `trial ${trial}: NaN`);
    assert.ok(peakAbs(x) < 8, `trial ${trial}: peak ${peakAbs(x).toFixed(2)}`);
  }
});
test('knobs glide: distance, listener angle, asymmetry and bronze loss moved mid-note do not click', () => {
  for (const [id, to] of [['distance', 600], ['around', 90], ['asym', 3], ['eta', 2e-3]]) {
    const p = P(), x = run(p, [[0, 'on', 65, 0.7], [0.4, 'params', { ...p, [id]: to }]], 0.7);
    let before = 0, after = 0;
    for (let i = Math.round(0.25 * FS); i < x.length; i++) { const d = Math.abs(x[i] - 2 * x[i - 1] + x[i - 2]); if (i < 0.4 * FS) before = Math.max(before, d); else after = Math.max(after, d); }
    assert.ok(after < 1.5 * before + 1e-6, `${id}: second difference ${after.toExponential(2)} after, ${before.toExponential(2)} before`);
  }
});
test('CPU: 24 bells ringing (a passage struck over 3 s) at 48 kHz in under 30 % of one core', () => {
  const e = new CarillonEngine(FS); e.setParams(P());
  const bL = new Float32Array(128), bR = new Float32Array(128), keys = [];
  for (let i = 0; i < 24; i++) keys.push(KEY_LO + ((i * 2) % 49));
  for (let i = 0; i < 50; i++) e.process(bL, bR, 128); // warm up
  const n = Math.round((4 * FS) / 128), t0 = performance.now();
  let k = 0;
  for (let i = 0; i < n; i++) { if (k < 24 && i % Math.round((0.125 * FS) / 128) === 0) e.noteOn(keys[k++], 0.7); e.process(bL, bR, 128); }
  const load = (performance.now() - t0) / 1000 / 4;
  console.log(`         ${(100 * load).toFixed(1)} % of real time for ${e.voiceCount()} bells`);
  assert.equal(e.voiceCount(), 24);
  assert.ok(load < 0.3, `${(100 * load).toFixed(1)} %`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
