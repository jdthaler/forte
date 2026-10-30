// hydrogen-native-table.mjs — hydrogen's recombination coefficients α_nl(T) for the Hydrogen Lamp's
// C++ (native/instruments/hydrogen/hydrogen-recombination.h), from first principles: the
// photoionisation cross-section of every level nl up to n = 50, from numerical Coulomb functions,
// turned into recombination by the Milne relation and averaged over a Maxwellian.
//
// Usage: node tools/hydrogen-native-table.mjs      (about 15 minutes; writes the header)
//
// In atomic units (lengths a₀, energies hartree):
//  * the bound functions u_nl = r R_nl are the closed-form Laguerre ones;
//  * the continuum functions u_εl′, normalised per unit energy, solve u″ = [l′(l′+1)/r² − 2/r − 2ε] u,
//    integrated outward by Numerov's method from the regular series at the origin, where the
//    normalisation is known exactly: u → √(2/πk) C_l′(η) (kr)^(l′+1), η = −1/k (so no asymptotic
//    matching is needed; the check against the WKB amplitude far out agrees to 10⁻³);
//  * σ_nl(ω) = (4π² α ω / 3) Σ_l′ (l_max/(2l + 1)) |⟨εl′|r|nl⟩|²;
//  * Milne: σ_rec(ε) = 2(2l + 1) (ω/c)² / k² · σ_nl (the bound level's 2(2l + 1) states over the
//    free electron's 2 spins and the bare proton's 1, and the photon's 2 polarisations);
//  * α_nl(T) = ∫ σ_rec v f(ε) dε, with f the Maxwellian.
// The tests check σ_1s at threshold (6.30 × 10⁻¹⁸ cm²), α_1s, α_A and α_B at 10⁴ K against
// Osterbrock & Ferland, and recompute the n ≤ 3 entries here.

import { writeFileSync } from 'node:fs';

export const NMAX = 50;
export const LOG_T0 = 3, DLOG_T = 0.25, TEMPS = 9; // 10³ … 10⁵ K
export const headerFile = new URL('../native/instruments/hydrogen/hydrogen-recombination.h', import.meta.url);

const ALPHA = 7.2973525693e-3, C = 1 / ALPHA, A0CM = 0.529177210903e-8, AUT = 2.4188843265857e-17, KB = 3.166811563e-6;
const lnFact = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
function laguerre(k, a, y) {
  if (k === 0) return 1;
  let l0 = 1, l1 = 1 + a - y;
  for (let i = 1; i < k; i++) { const l2 = ((2 * i + 1 + a - y) * l1 - (i + a) * l0) / (i + 1); l0 = l1; l1 = l2; }
  return l1;
}
function bound(n, l, r) {
  const lnN = 0.5 * (3 * Math.log(2 / n) + lnFact(n - l - 1) - Math.log(2 * n) - lnFact(n + l)), y = 2 * r / n;
  return r * Math.exp(lnN + l * Math.log(y) - r / n) * laguerre(n - l - 1, 2 * l + 1, y);
}

// The energy grid (hartree) the cross-sections are computed on.
export const ENERGIES = Array.from({ length: 81 }, (_, i) => 1e-6 * 10 ** ((i * 6.5) / 80));

// u_εl on the grid r = iH, i < count, energy-normalised.
function continuum(eps, l, H, count) {
  const u = new Float64Array(count), h2 = (H * H) / 12;
  const Q = (r) => 2 * eps + 2 / r - (l * (l + 1)) / (r * r);
  const series = (r) => { // u / r^(l+1) near the origin: a_j j(j + 2l + 1) = −2 a_(j−1) − 2ε a_(j−2)
    let a2 = 0, a1 = 1, s = 1, p = 1;
    for (let j = 1; j < 40; j++) { const a = (-2 * a1 - 2 * eps * a2) / (j * (j + 2 * l + 1)); p *= r; s += a * p; a2 = a1; a1 = a; }
    return s;
  };
  // start where Numerov's error on r^(l+1) is small, in units of r0^(l+1)
  const i0 = 20 * (l + 1), r0 = i0 * H;
  for (let i = 1; i <= i0 + 1; i++) u[i] = (i / i0) ** (l + 1) * series(i * H);
  let f1 = 1 + h2 * Q(r0), f2 = 1 + h2 * Q(r0 + H), lnScale = 0;
  for (let i = i0 + 1; i < count - 1; i++) {
    const f3 = 1 + h2 * Q((i + 1) * H);
    u[i + 1] = ((12 - 10 * f2) * u[i] - f1 * u[i - 1]) / f3;
    f1 = f2; f2 = f3;
    if (Math.abs(u[i + 1]) > 1e200) { for (let j = 0; j <= i + 1; j++) u[j] *= 1e-200; lnScale -= 200 * Math.LN10; }
  }
  const k = Math.sqrt(2 * eps);
  let lnC2 = 2 * l * Math.LN2 + Math.log((2 * Math.PI / k) / -Math.expm1(-2 * Math.PI / k)) - 2 * lnFact(2 * l + 1);
  for (let s = 1; s <= l; s++) lnC2 += Math.log(s * s + 1 / (k * k));
  const norm = Math.exp(0.5 * Math.log(2 / (Math.PI * k)) + 0.5 * lnC2 + (l + 1) * Math.log(k * r0) + lnScale);
  for (let i = 0; i < count; i++) u[i] *= norm;
  return u;
}

// σ_nl on ENERGIES (a₀²) for every n ≤ nmax. `only(n, l)` limits the levels computed.
export function crossSections(nmax, { H = 0.01, only = () => true } = {}) {
  const rmax = Math.max(400, 4.5 * nmax * nmax + 60 * nmax), count = Math.ceil(rmax / H) + 1, stride = 4;
  const sig = new Map();
  for (let lp = 0; lp <= nmax; lp++) {
    const levels = [];
    for (const l of [lp - 1, lp + 1]) if (l >= 0 && l < nmax) for (let n = l + 1; n <= nmax; n++) if (only(n, l)) levels.push([n, l]);
    if (!levels.length) continue;
    const cont = ENERGIES.map((e) => continuum(e, lp, H, count));
    for (const [n, l] of levels) {
      const end = Math.min(count - 1, Math.ceil((4.5 * n * n + 60 * n + 50) / H));
      const ub = new Float64Array(end + 1);
      for (let i = stride; i <= end; i += stride) ub[i] = bound(n, l, i * H);
      const key = `${n},${l}`;
      if (!sig.has(key)) sig.set(key, new Float64Array(ENERGIES.length));
      const s = sig.get(key);
      ENERGIES.forEach((e, j) => {
        const u = cont[j];
        let d = 0;
        for (let i = stride; i <= end; i += stride) d += ub[i] * u[i] * i * H;
        d *= stride * H;
        const w = e + 0.5 / (n * n);
        s[j] += ((4 * Math.PI * Math.PI * ALPHA * w) / 3) * (Math.max(l, lp) / (2 * l + 1)) * d * d;
      });
    }
  }
  return sig;
}

// σ at threshold (cm²), from the lowest energy of the grid
export const thresholdCm2 = (s) => s[0] * A0CM * A0CM;

// α_nl(T) in cm³ s⁻¹ from its cross-sections.
export function recombination(s, n, l, T) {
  const kT = KB * T;
  const f = (j) => {
    const e = ENERGIES[j], v = Math.sqrt(2 * e), w = e + 0.5 / (n * n);
    const rec = (2 * (2 * l + 1) * w * w) / (C * C * v * v) * s[j];
    return rec * v * 2 * Math.sqrt(e / Math.PI) * kT ** -1.5 * Math.exp(-e / kT) * e; // × ε: in d(ln ε)
  };
  let a = 0;
  for (let j = 0; j < ENERGIES.length - 1; j++) a += 0.5 * (f(j) + f(j + 1)) * Math.log(ENERGIES[j + 1] / ENERGIES[j]);
  return (a * A0CM ** 3) / AUT;
}

export const temperature = (i) => 10 ** (LOG_T0 + i * DLOG_T);

export function header(sig) {
  const rows = [];
  for (let n = 1; n <= NMAX; n++) {
    for (let l = 0; l < n; l++) {
      const s = sig.get(`${n},${l}`);
      const v = Array.from({ length: TEMPS }, (_, i) => Math.log10(recombination(s, n, l, temperature(i))).toFixed(5));
      rows.push(`  {${v.join(', ')}}, // ${n},${l}`);
    }
  }
  return `// hydrogen-recombination.h — generated by tools/hydrogen-native-table.mjs. Do not edit.
// log10 of hydrogen's recombination coefficient into each level nl (cm³ s⁻¹), indexed by
// stateOf(n, l), at T = 10^(${LOG_T0} + ${DLOG_T} i) K, i = 0 … ${TEMPS - 1}.
#pragma once

namespace forte::hydrogen {

constexpr int RECOMB_T = ${TEMPS};
constexpr double RECOMB_LOG_T0 = ${LOG_T0}, RECOMB_DLOG_T = ${DLOG_T};
inline const float kRecombination[${(NMAX * (NMAX + 1)) / 2}][RECOMB_T] = {
${rows.join('\n')}
};

} // namespace forte::hydrogen
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const sig = crossSections(NMAX);
  writeFileSync(headerFile, header(sig));
  console.log(`wrote ${headerFile.pathname} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
