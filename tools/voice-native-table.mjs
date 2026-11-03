// voice-native-table.mjs — the Singing Voice's vowels: an area function for each, fitted so that
// the tube's first three resonances land on Peterson and Barney's (1952) averages for men, written
// as a C++ header for the engine (native/instruments/voice/voice-vowels.h).
//
// The tract is a tube 17.5 cm long, from the glottis (closed) to the lips (open, into the
// radiation impedance of a piston in a baffle). Its first 2 cm are the larynx tube above the
// folds, kept at its own area (the engine sets it from a parameter); the rest has a log-area that
// is a short cosine series along the length (Mermelstein 1967, Schroeder 1967), fitted from the
// uniform tube with the smoothest shape that reaches the three formants.
//
// Usage: node tools/voice-native-table.mjs           writes native/instruments/voice/voice-vowels.h
//        node tools/voice-native-table.mjs --check   exit 1 if that file is stale

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const headerFile = new URL('../native/instruments/voice/voice-vowels.h', import.meta.url);

export const RHO = 1.14, C = 350;      // air at body temperature, saturated: kg/m³, m/s
export const LENGTH = 0.175;           // m: a man's tract (Fant 1960)
export const SECTIONS = 44;            // table points along it (Story, Titze and Hoffman 1996 use 44)
export const LARYNX = 5;               // sections of larynx tube (2 cm)
export const LARYNX_AREA = 1.5e-4;     // m²: its area when the vowels are fitted

// Peterson and Barney (1952), table II: average F1, F2, F3 of 33 men (Hz). The mod wheel sweeps
// these five, back to front: u, ɔ, ɑ, ɛ, i.
export const VOWELS = [
  { ipa: 'u', name: 'oo', word: 'who\'d', F: [300, 870, 2240] },
  { ipa: 'ɔ', name: 'aw', word: 'hawed', F: [570, 840, 2410] },
  { ipa: 'ɑ', name: 'ah', word: 'hod', F: [730, 1090, 2440] },
  { ipa: 'ɛ', name: 'eh', word: 'head', F: [530, 1840, 2480] },
  { ipa: 'i', name: 'ee', word: 'heed', F: [270, 2290, 3010] },
];

// The radiation impedance at the lips (Flanagan 1972): a resistance and an inductance in parallel.
export const radR = (A) => (128 * RHO * C) / (9 * Math.PI ** 2 * A);
export const radL = (A) => (8 * RHO) / (3 * Math.PI ** 2 * Math.sqrt(A / Math.PI));

// The lossless tube's resonances with the glottis closed and the lips loaded by their inductance:
// the zeros of D(ω) = K₂₂ − ωL·k₂₁, where [p, U]ᵀ at the glottis = K [p, U]ᵀ at the lips, K the
// product of each section's chain matrix [[cos kl, jZ sin kl], [j sin kl / Z, cos kl]].
export function resonances(areas, length = LENGTH, count = 3, fMax = 5000) {
  const l = length / areas.length, Lr = radL(areas[areas.length - 1]);
  const D = (f) => {
    const k = (2 * Math.PI * f) / C;
    const c = Math.cos(k * l), s = Math.sin(k * l);
    // K = [[a, j b], [j c', d]] stays of that form; carry a, b, c', d
    let a = 1, b = 0, cc = 0, d = 1;
    for (const A of areas) {
      const Z = (RHO * C) / A;
      const na = a * c - b * (s / Z), nb = a * Z * s + b * c;
      const nc = cc * c + d * (s / Z), nd = -cc * Z * s + d * c;
      a = na; b = nb; cc = nc; d = nd;
    }
    return d - 2 * Math.PI * f * Lr * cc;
  };
  const out = [];
  let f0 = 20, d0 = D(f0);
  for (let f = 25; f < fMax && out.length < count; f += 5) {
    const d1 = D(f);
    if (Math.sign(d1) !== Math.sign(d0)) {
      let lo = f - 5, hi = f, dl = d0;
      for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2, dm = D(m); if (Math.sign(dm) === Math.sign(dl)) { lo = m; dl = dm; } else hi = m; }
      out.push((lo + hi) / 2);
    }
    f0 = f; d0 = d1;
  }
  return out;
}

const COEFFS = 8;
// what a tract can do, which the fit keeps to: nowhere narrower than 0.25 cm² (narrower is a consonant's
// constriction) or wider than 9 cm², the lips' opening no wider than 7 cm²
const MIN_AREA = 0.25e-4, MAX_AREA = 9e-4, MAX_LIPS = 7e-4;
// The area function of a set of coefficients: the larynx tube, then exp of a cosine series.
export function shape(c) {
  const out = [];
  for (let i = 0; i < SECTIONS; i++) {
    if (i < LARYNX) { out.push(LARYNX_AREA); continue; }
    const x = (i - LARYNX + 0.5) / (SECTIONS - LARYNX);
    let la = c[0];
    for (let k = 1; k <= COEFFS; k++) la += c[k] * Math.cos(k * Math.PI * x);
    out.push(Math.exp(la) * 1e-4);
  }
  return out;
}

// What the fit makes small: the formants' misses (in log frequency), the shape's roughness, and
// any area beyond what a tract can do.
function residuals(c, F) {
  const A = shape(c), R = resonances(A), out = [];
  for (let k = 0; k < 3; k++) out.push(R.length > k ? 20 * Math.log(R[k] / F[k]) * (k < 2 ? 1 : 0.7) : 20);
  for (let k = 1; k <= COEFFS; k++) out.push(0.03 * k * c[k]);
  out.push(0.03 * (c[0] - Math.log(3)));
  A.forEach((a, i) => {
    const hi = i >= SECTIONS - 3 ? MAX_LIPS : MAX_AREA;
    out.push(a < MIN_AREA ? 3 * Math.log(MIN_AREA / a) : a > hi ? 3 * Math.log(a / hi) : 0);
  });
  return out;
}
const sumsq = (r) => r.reduce((s, x) => s + x * x, 0);

// Levenberg–Marquardt, with a numerical Jacobian.
function minimise(F, x0) {
  let x = x0.slice(), r = residuals(x, F), s = sumsq(r), lambda = 1e-2;
  const n = x.length;
  for (let it = 0; it < 200; it++) {
    const J = [];
    for (let j = 0; j < n; j++) { const y = x.slice(); y[j] += 1e-5; const ry = residuals(y, F); J.push(ry.map((v, i) => (v - r[i]) / 1e-5)); }
    const A = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J[a].reduce((t, v, i) => t + v * J[b][i], 0)));
    const g = Array.from({ length: n }, (_, a) => J[a].reduce((t, v, i) => t + v * r[i], 0));
    let improved = false;
    for (let tries = 0; tries < 10 && !improved; tries++) {
      const M = A.map((row, a) => row.map((v, b) => v + (a === b ? lambda * (1 + v) : 0)));
      const step = solve(M, g.map((v) => -v));
      const y = x.map((v, j) => v + step[j]), ry = residuals(y, F), sy = sumsq(ry);
      if (sy < s) { x = y; r = ry; improved = s - sy > 1e-12; s = sy; lambda = Math.max(lambda / 3, 1e-7); } else lambda *= 4;
    }
    if (!improved) break;
  }
  return { x, s };
}
function solve(M, b) { // Gaussian elimination with partial pivoting
  const n = b.length, A = M.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]];
    for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j <= n; j++) A[k][j] -= f * A[i][j]; }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let t = A[i][n]; for (let j = i + 1; j < n; j++) t -= A[i][j] * x[j]; x[i] = t / A[i][i]; }
  return x;
}

export function fit() {
  return VOWELS.map((v) => {
    let best = null, fb = Infinity;
    // a few starts: the uniform tube, and a constriction toward the back or the front
    // start from the best of a coarse grid over the first three coefficients, then refine
    const starts = [];
    for (let a = -1.5; a <= 1.5; a += 0.5) for (let b = -1.5; b <= 1.5; b += 0.5) for (let d = -1.5; d <= 1.5; d += 0.5) {
      const x = [Math.log(3), a, b, d, ...Array(COEFFS - 3).fill(0)];
      starts.push({ x, s: sumsq(residuals(x, v.F)) });
    }
    starts.sort((p, q) => p.s - q.s);
    for (const start of starts.slice(0, 4)) {
      const { x, s } = minimise(v.F, start.x);
      if (s < fb) { fb = s; best = x; }
    }
    const areas = shape(best);
    return { ...v, areas, fitted: resonances(areas) };
  });
}

const num = (x) => { const s = String(+x.toPrecision(6)); return /[.e]/.test(s) ? s : `${s}.0`; };

export function header(V = fit()) {
  const out = [
    '// voice-vowels.h — generated by tools/voice-native-table.mjs. Do not edit; after changing the fit,',
    '// run node tools/voice-native-table.mjs',
    '//',
    `// Each vowel's area function (cm²), ${SECTIONS} sections from the glottis to the lips of a ${LENGTH * 100} cm tract,`,
    '// fitted so that the tube\'s first three resonances are Peterson and Barney\'s (1952) averages',
    '// for men. The first sections are the larynx tube, whose area the engine sets.',
    '#pragma once',
    '',
    'namespace forte::voice::vowels {',
    '',
    `constexpr int COUNT = ${V.length}, SECTIONS = ${SECTIONS}, LARYNX = ${LARYNX};`,
    `constexpr double LENGTH = ${num(LENGTH)}; // m`,
    '',
    'struct Vowel { const char *ipa, *name; double F[3], fitted[3], area[SECTIONS]; };',
    '',
    'inline constexpr Vowel kVowels[COUNT] = {',
  ];
  for (const v of V) {
    out.push(`  {"${v.ipa}", "${v.name}", {${v.F.map(num).join(', ')}}, {${v.fitted.map((f) => num(Math.round(f))).join(', ')}},`);
    out.push(`   {${v.areas.map((a) => num(a * 1e4)).join(', ')}}},`);
  }
  out.push('};', '', '} // namespace forte::voice::vowels', '');
  return out.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const V = fit();
  for (const v of V) console.log(`${v.ipa.padEnd(2)} target ${v.F.join(' ')}  fitted ${v.fitted.map((f) => f.toFixed(0)).join(' ')}  areas ${v.areas.map((a) => (a * 1e4).toFixed(1)).join(' ')}`);
  const text = header(V);
  if (process.argv.includes('--check')) {
    if (!existsSync(headerFile) || readFileSync(headerFile, 'utf8') !== text) { console.error('voice-vowels.h is stale: run node tools/voice-native-table.mjs'); process.exit(1); }
  } else writeFileSync(headerFile, text);
}
