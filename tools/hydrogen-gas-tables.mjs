// hydrogen-gas-tables.mjs — the Hydrogen Lamp's other two gases, helium and molecular hydrogen,
// for its C++ (native/instruments/hydrogen/hydrogen-gases.h), from the published tables and,
// for the one band no table gives, from the molecule's constants:
//
//  * helium (He I): NIST's Atomic Spectra Database (Kramida et al.): the levels 1snl up to
//    n = 25 (Drake's calculations, every J), and every line with a transition probability
//    (n ≤ 10, every J, with the intercombination and forbidden lines). The C++ gathers the J
//    levels into terms and adds what NIST has no rates for (hydrogen-model.cpp heliumGas);
//  * molecular hydrogen, its ground state X¹Σg⁺: the rovibrational levels and their electric
//    quadrupole lines of Roueff, Abgrall, Czachorowski, Pachucki, Puchalski & Komasa (2019,
//    A&A 630, A58), as ExoMol serves them (RACPPK: Gordon et al., the ExoMol database);
//  * its Lyman (B¹Σu⁺ → X) and Werner (C¹Πu± → X) bands: Abgrall, Roueff, Launay, Roncin &
//    Subtil (1994, Can. J. Phys. 72, 856), every rovibronic line with its transition probability,
//    from MOLAT (Observatoire de Paris);
//  * its visible Fulcher-α band (d³Πu → a³Σg⁺), which no open table lists line by line: from
//    the two states' constants (Huber & Herzberg 1979), their Morse potentials' Franck–Condon
//    factors, the Hönl–London factors and the d state's lifetime (about 40 ns). The tests check
//    its Q₁ lines against the measured wavelengths.
//
// Usage: node tools/hydrogen-gas-tables.mjs   (downloads the tables once into tools/.gas-data,
//                                              then writes the header in a few seconds)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export const headerFile = new URL('../native/instruments/hydrogen/hydrogen-gases.h', import.meta.url);
const CACHE = new URL('./.gas-data/', import.meta.url);

export const HE_NMAX = 25;               // helium's levels: n ≤ 25
const NIST = 'https://physics.nist.gov/cgi-bin/ASD';
export const SOURCES = {
  heLevels: `${NIST}/energy1.pl?de=0&spectrum=He+I&submit=Retrieve+Data&units=0&format=2&output=0&page_size=15&multiplet_ordered=0&conf_out=on&term_out=on&level_out=on&unc_out=1&j_out=on&g_out=on&lande_out=on&perc_out=on&biblio=on&temp=`,
  heLines: `${NIST}/lines1.pl?spectra=He+I&limits_type=0&low_w=&upp_w=&unit=1&de=0&I_scale_type=1&format=2&line_out=0&remove_js=on&en_unit=0&output=0&bibrefs=1&page_size=15&show_obs_wl=1&show_calc_wl=1&unc_out=1&order_out=0&max_low_enrg=&show_av=3&max_upp_enrg=&tsb_value=0&min_str=&A_out=0&intens_out=on&max_str=&allowed_out=1&forbid_out=1&min_accur=&min_intens=&conf_out=on&term_out=on&enrg_out=on&J_out=on&g_out=on&submit=Retrieve+Data`,
  h2States: 'https://www.exomol.com/db/H2/1H2/RACPPK/1H2__RACPPK.states.bz2',
  h2Trans: 'https://www.exomol.com/db/H2/1H2/RACPPK/1H2__RACPPK.trans.bz2',
  lyman: 'https://molat.obspm.fr/pages/Molecules/H2/telechargement.php?file=fichiers/BCan94',
  wernerMinus: 'https://molat.obspm.fr/pages/Molecules/H2/telechargement.php?file=fichiers/CmCan94',
  wernerPlus: 'https://molat.obspm.fr/pages/Molecules/H2/telechargement.php?file=fichiers/CpCan94',
};

function fetched(name) {
  const file = new URL(name, CACHE);
  if (!existsSync(file)) {
    mkdirSync(CACHE, { recursive: true });
    const url = SOURCES[name];
    const bz = url.endsWith('.bz2'), out = new URL(`${name}${bz ? '.bz2' : ''}`, CACHE);
    execFileSync('curl', ['-sSfL', '-m', '300', '-o', out.pathname, url]);
    if (bz) execFileSync('bunzip2', ['-f', out.pathname]);
  }
  return readFileSync(file, 'utf8');
}

// NIST's CSV: every cell written ="…".
function csv(text) {
  const [head, ...rows] = text.trim().split('\n');
  const keys = head.split(',');
  return rows.map((r) => Object.fromEntries(r.split(',').map((c, i) => [keys[i], c.replace(/^"=""|"""$/g, '').replace(/^"|"$/g, '').replace(/[[\]]/g, '')])));
}

const L_LETTERS = 'spdfghiklmnoqrtuv';
// "1s.4f", "3F*" → { n: 4, L: 3, S: 1 }; the ground state 1s2 is { n: 1, L: 0, S: 0 }.
function term(conf, t) {
  if (conf === '1s2') return { n: 1, L: 0, S: 0 };
  const m = conf.match(/^1s\.(\d+)([a-z])$/);
  if (!m) return null;
  const L = L_LETTERS.indexOf(m[2]), S = t.startsWith('3') ? 1 : 0;
  return { n: Number(m[1]), L, S };
}
const termKey = ({ n, L, S }) => `${n},${L},${S}`;

// ---- helium ---------------------------------------------------------------------------------

// The terms nLS with n ≤ HE_NMAX: their J levels (cm⁻¹ above 1¹S); and the lines between the J
// levels (n ≤ 10) with their A, grouped by the terms they join.
export function helium() {
  const levels = new Map(); // termKey → { n, L, S, J: Map(J → E) }
  for (const r of csv(fetched('heLevels'))) {
    const t = term(r.Configuration, r.Term);
    if (!t || t.n > HE_NMAX || r['Level (cm-1)'] === '') continue;
    const k = termKey(t);
    if (!levels.has(k)) levels.set(k, { ...t, J: new Map() });
    levels.get(k).J.set(Number(r.J), Number(r['Level (cm-1)']));
  }
  const terms = [...levels.values()].sort((a, b) => centroid(a) - centroid(b));
  const index = new Map(terms.map((t, i) => [termKey(t), i]));
  const lines = new Map(); // `${u},${l}` → { u, l, comps: [{ Ju, Jl, gA }] }
  for (const r of csv(fetched('heLines'))) {
    const A = Number(r['Aki(s^-1)']);
    if (!(A > 0)) continue;
    const lo = term(r.conf_i, r.term_i), up = term(r.conf_k, r.term_k);
    if (!lo || !up) continue;
    const u = index.get(termKey(up)), l = index.get(termKey(lo));
    if (u === undefined || l === undefined) continue;
    const Ju = Number(r.J_k), Jl = Number(r.J_i);
    if (!terms[u].J.has(Ju) || !terms[l].J.has(Jl)) continue;
    const key = `${u},${l}`;
    if (!lines.has(key)) lines.set(key, { u, l, comps: [] });
    lines.get(key).comps.push({ Ju, Jl, gA: (2 * Ju + 1) * A, type: r.Type });
  }
  return { terms, lines: [...lines.values()].sort((a, b) => a.u - b.u || a.l - b.l) };
}
// a term's energy: its J levels' mean by weight 2J + 1
export function centroid(t) {
  let s = 0, g = 0;
  for (const [J, E] of t.J) { s += (2 * J + 1) * E; g += 2 * J + 1; }
  return s / g;
}

// ---- molecular hydrogen ---------------------------------------------------------------------

// The ground state's levels and quadrupole lines (ExoMol: id, E cm⁻¹, g with the nuclear spin's,
// J, v; upper id, lower id, A).
export function groundState() {
  const levels = fetched('h2States').trim().split('\n').map((l) => {
    const [id, E, g, J, v] = l.trim().split(/\s+/).map(Number);
    return { id, E, g, J, v };
  });
  const byId = new Map(levels.map((x, i) => [x.id, i]));
  const lines = fetched('h2Trans').trim().split('\n').map((l) => {
    const [u, lo, A] = l.trim().split(/\s+/).map(Number);
    return { u: byId.get(u), l: byId.get(lo), A };
  });
  return { levels, lines };
}

// A band file of Abgrall et al. (1994): v′ J′ v″ J″ A ν, under a title, a header and a count.
function band(text) {
  return text.trim().split('\n').slice(3).map((l) => l.trim().split(/\s+/).map(Number)).filter((x) => x.length === 6);
}

// The Lyman and Werner bands: the upper levels (their energies from X's and the lines' wavenumbers,
// averaged) up to J′ = 12 and every line, the weakest of each level's (under 10⁻³ of its
// strongest, together a share of its decay under 0.2 %) left out.
export const KEEP_UV = 1e-3, UV_JMAX = 12;
export function ultraviolet(X) {
  const xOf = new Map(X.levels.map((x, i) => [`${x.v},${x.J}`, i]));
  const up = [], lines = [];
  for (const [state, name] of [[0, 'lyman'], [1, 'wernerPlus'], [2, 'wernerMinus']]) {
    const levels = new Map();
    for (const [vu, ju, vl, jl, A, nu] of band(fetched(name))) {
      const l = xOf.get(`${vl},${jl}`);
      if (l === undefined || ju > UV_JMAX) continue;
      const k = `${vu},${ju}`;
      if (!levels.has(k)) levels.set(k, { state, v: vu, J: ju, sum: 0, count: 0, lines: [] });
      const lev = levels.get(k);
      lev.sum += X.levels[l].E + nu; lev.count++;
      lev.lines.push({ l, A });
    }
    for (const lev of levels.values()) {
      // the nuclear spin's weight follows the lower levels' (ortho: odd J in X)
      const gns = X.levels[lev.lines[0].l].J % 2 ? 3 : 1;
      const top = Math.max(...lev.lines.map((x) => x.A));
      const u = up.length;
      up.push({ state, v: lev.v, J: lev.J, E: lev.sum / lev.count, g: gns * (2 * lev.J + 1), extra: 0 });
      for (const x of lev.lines) if (x.A >= KEEP_UV * top) lines.push({ u, l: x.l, A: x.A });
    }
  }
  return { up, lines };
}

// The Fulcher-α band from the constants (cm⁻¹; Huber & Herzberg 1979, re in Å). Te of d is set so
// that Q₁(0–0) falls at its measured 601.83 nm (air); the rest follows from the constants.
export const FULCHER = {
  X: { we: 4401.21, wexe: 121.34, re: 0.74144 },
  a: { Te: 95936.1, we: 2664.83, wexe: 71.65, Be: 34.216, ae: 1.671, De: 0.0216, re: 0.98879 },
  d: { we: 2371.58, wexe: 66.27, Be: 30.364, ae: 1.545, De: 0.0191, re: 1.0496 },
  Q100: 601.83,                      // nm (air): Q₁(0–0)
  tau: 40e-9,                        // s: d³Πu v′ = 0's radiative lifetime
  tauA: 11e-9,                       // s: a³Σg⁺'s, to the b³Σu⁺ continuum (left out as light)
  vd: 6, va: 7, N: 9,                // levels kept: d v′ < 6, a v″ < 7, N ≤ 9
};
const HB = 16.857629 / 0.50391261;   // ħ²/2μ for H₂ (cm⁻¹ Å²)
export const airToVacuum = (nm) => { // Edlén's dispersion of standard air (Ciddor's to 10⁻⁸ here)
  const s2 = (1e3 / nm) ** 2;
  return nm * (1 + 8.34254e-5 + 2.406147e-2 / (130 - s2) + 1.5998e-4 / (38.9 - s2));
};

// The vibrational wavefunctions of a Morse potential, ψ_v on a grid (finite differences, by
// inverse iteration from Dunham's G(v)), so that Franck–Condon factors are ∫ψ′ψ″ dr squared.
const GRID = { r0: 0.25, r1: 4, n: 3000 };
function morseStates(c, count) {
  const De = (c.we * c.we) / (4 * c.wexe), a = c.we / (2 * Math.sqrt(De * HB));
  const h = (GRID.r1 - GRID.r0) / (GRID.n - 1), r = Float64Array.from({ length: GRID.n }, (_, i) => GRID.r0 + i * h);
  const V = r.map((x) => De * (1 - Math.exp(-a * (x - c.re))) ** 2), off = HB / (h * h);
  const out = [];
  for (let v = 0; v < count; v++) {
    const E = c.we * (v + 0.5) - c.wexe * (v + 0.5) ** 2 + 0.3; // a shift near the level
    let psi = new Float64Array(GRID.n).fill(1);
    for (let it = 0; it < 12; it++) {
      // solve (H − E) x = ψ (tridiagonal: diagonal 2·off + V − E, off-diagonals −off)
      const d = V.map((x) => 2 * off + x - E), x = new Float64Array(GRID.n), cp = new Float64Array(GRID.n);
      cp[0] = -off / d[0]; x[0] = psi[0] / d[0];
      for (let i = 1; i < GRID.n; i++) { const m = d[i] + off * cp[i - 1]; cp[i] = -off / m; x[i] = (psi[i] + off * x[i - 1]) / m; }
      for (let i = GRID.n - 2; i >= 0; i--) x[i] -= cp[i] * x[i + 1];
      let s = 0;
      for (let i = 0; i < GRID.n; i++) s += x[i] * x[i];
      s = Math.sqrt(s * h);
      psi = x.map((y) => y / s);
    }
    if (psi[GRID.n >> 1] < 0 && v === 0) psi = psi.map((y) => -y);
    out.push(psi);
  }
  return { psi: out, h };
}
export function franckCondon(c1, n1, c2, n2) {
  const A = morseStates(c1, n1), B = morseStates(c2, n2);
  return A.psi.map((p) => B.psi.map((q) => { let s = 0; for (let i = 0; i < GRID.n; i++) s += p[i] * q[i]; return (s * A.h) ** 2; }));
}

// Wigner's 3-j symbol (j1 j2 j3; m1 m2 m3), integer arguments, by Racah's formula.
const lf = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
export function threeJ(j1, j2, j3, m1, m2, m3) {
  if (m1 + m2 + m3 !== 0 || j3 < Math.abs(j1 - j2) || j3 > j1 + j2 || Math.abs(m1) > j1 || Math.abs(m2) > j2 || Math.abs(m3) > j3) return 0;
  const tri = 0.5 * (lf(j1 + j2 - j3) + lf(j1 - j2 + j3) + lf(-j1 + j2 + j3) - lf(j1 + j2 + j3 + 1));
  const pre = tri + 0.5 * (lf(j1 + m1) + lf(j1 - m1) + lf(j2 + m2) + lf(j2 - m2) + lf(j3 + m3) + lf(j3 - m3));
  let s = 0;
  for (let k = Math.max(0, j2 - j3 - m1, j1 - j3 + m2); k <= Math.min(j1 + j2 - j3, j1 - m1, j2 + m2); k++) {
    s += (k % 2 ? -1 : 1) * Math.exp(pre - lf(k) - lf(j1 + j2 - j3 - k) - lf(j1 - m1 - k) - lf(j2 + m2 - k) - lf(j3 - j2 + m1 + k) - lf(j3 - j1 - m2 + k));
  }
  return ((j1 - j2 - m3) % 2 ? -1 : 1) * s;
}

// Levels: G(v) + B_v N(N + 1) − Λ² B_v − D N²(N + 1)², above X(0, 0) (X's zero-point energy is
// ωe/2 − ωexe/4). d's Te from Q₁(0–0).
function level(c, Te, v, N, Lambda) {
  const G = c.we * (v + 0.5) - c.wexe * (v + 0.5) ** 2, B = c.Be - c.ae * (v + 0.5), x = N * (N + 1);
  return Te + G + B * (x - Lambda * Lambda) - c.De * x * x;
}
export function fulcher() {
  const F = FULCHER, zpe = F.X.we / 2 - F.X.wexe / 4;
  const aE = (v, N) => level(F.a, F.a.Te, v, N, 0) - zpe;
  const target = 1e7 / airToVacuum(F.Q100);
  const dTe = target - (level(F.d, 0, 0, 1, 1) - zpe) + aE(0, 1);
  const dE = (v, N) => level(F.d, dTe, v, N, 1) - zpe;
  const q = franckCondon(F.d, F.vd, F.a, F.va);
  // the d levels: v′, N ≥ 1, each Λ-doubling component (Π⁻: Q lines; Π⁺: P and R lines)
  const up = [], lines = [], low = [];
  const lowOf = new Map();
  for (let v = 0; v < F.va; v++) for (let N = 0; N <= F.N + 1; N++) {
    lowOf.set(`${v},${N}`, low.length);
    // a³Σg⁺ like X: even N para, odd ortho; the triplet's three spin states
    low.push({ state: 5, v, J: N, E: aE(v, N), g: 3 * (N % 2 ? 3 : 1) * (2 * N + 1), extra: 1 / F.tauA });
  }
  // the electronic factor: Σ_v″ q ν³ for v′ = 0 sets A_el so that d(0) lives τ
  const nu0 = (v1, v2) => dE(v1, 1) - aE(v2, 1);
  let s0 = 0;
  for (let v2 = 0; v2 < F.va; v2++) s0 += q[0][v2] * nu0(0, v2) ** 3;
  const Ael = 1 / F.tau / s0;
  for (let v = 0; v < F.vd; v++) for (let N = 1; N <= F.N; N++) for (const sign of [-1, 1]) {
    // Π⁻ (sign −1) emits Q lines (N″ = N), Π⁺ P and R (N″ = N ± 1); the nuclear spin is kept
    const targets = sign < 0 ? [N] : [N - 1, N + 1];
    const share = targets.map((N2) => (2 * N2 + 1) * threeJ(N2, 1, N, 0, 1, -1) ** 2), total = share.reduce((a, b) => a + b, 0);
    const gns = (sign < 0 ? N : N + 1) % 2 ? 3 : 1;
    const u = up.length;
    up.push({ state: sign < 0 ? 4 : 3, v, J: N, E: dE(v, N), g: 3 * gns * (2 * N + 1), extra: 0 });
    for (let v2 = 0; v2 < F.va; v2++) targets.forEach((N2, i) => {
      const l = lowOf.get(`${v2},${N2}`), nu = dE(v, N) - aE(v2, N2);
      lines.push({ u, l, A: Ael * q[v][v2] * nu ** 3 * (share[i] / total) });
    });
  }
  return { up, low, lines, q, Ael, dTe, Xq: franckCondon(F.X, 1, F.d, F.vd)[0] };
}

// ---- the header -----------------------------------------------------------------------------

const f = (x) => (Number.isInteger(x) ? `${x}` : x.toPrecision(10));
const g6 = (x) => x.toExponential(4);
function rows(name, type, list, fmt, per = 6) {
  const out = [];
  for (let i = 0; i < list.length; i += per) out.push('  ' + list.slice(i, i + per).map(fmt).join(', ') + ',');
  return `inline constexpr ${type} ${name}[] = {\n${out.join('\n')}\n};\n`;
}

export function build() {
  const he = helium();
  const X = groundState(), uv = ultraviolet(X), fa = fulcher();
  // the molecule's upper levels: B, C⁺, C⁻ (from the tables), then d⁺, d⁻ and a (computed), by energy
  const upper = [...uv.up, ...fa.up, ...fa.low];
  const order = upper.map((_, i) => i).sort((a, b) => upper[a].E - upper[b].E), at = new Map(order.map((i, k) => [i, k]));
  const nUv = uv.up.length, nUp = fa.up.length;
  const electronic = [
    ...uv.lines.map((x) => ({ u: at.get(x.u), l: x.l, A: x.A, toX: 1 })),
    ...fa.lines.map((x) => ({ u: at.get(nUv + x.u), l: at.get(nUv + nUp + x.l), A: x.A, toX: 0 })),
  ];
  const lines = he.lines.flatMap((x) => x.comps.map((c) => ({ ...c, u: x.u, l: x.l })));
  let h = `// hydrogen-gases.h — written by tools/hydrogen-gas-tables.mjs; do not edit.
// Helium's levels and lines (NIST ASD) and molecular hydrogen's (ExoMol RACPPK: Roueff et al. 2019;
// MOLAT: Abgrall et al. 1994; the Fulcher-α band from the constants): see the tool for the sources.
#pragma once

#include <cstdint>

namespace forte::hydrogen::tables {

// Helium: each term nLS (n ≤ ${HE_NMAX}) NIST lists, by energy, and its J levels (cm⁻¹ above 1¹S).
struct HeTerm { uint8_t n, L, S, levels; };
struct HeLevel { uint8_t J; double E; };
// Its lines, J level to J level: the terms they join (indices into kHeTerms), J′ and J″, and gA
// (s⁻¹, the upper level's weight 2J + 1 times A); type 0 electric dipole, 1 forbidden (M1, E2, M2).
struct HeLine { uint16_t upper, lower; uint8_t Ju, Jl, type; float gA; };
`;
  h += rows('kHeTerms', 'HeTerm', he.terms, (t) => `{${t.n}, ${t.L}, ${t.S}, ${t.J.size}}`, 8);
  h += rows('kHeLevels', 'HeLevel', he.terms.flatMap((t) => [...t.J].sort((a, b) => a[0] - b[0])), ([J, E]) => `{${J}, ${f(E)}}`, 5);
  h += rows('kHeLines', 'HeLine', lines, (c) => `{${c.u}, ${c.l}, ${c.Ju}, ${c.Jl}, ${c.type ? 1 : 0}, ${g6(c.gA)}f}`, 4);
  h += `
// Molecular hydrogen. The ground state's levels (v, J, energy cm⁻¹ above v = 0, J = 0, weight with
// the nuclear spin's) and quadrupole lines (indices, A s⁻¹).
struct H2Level { uint8_t state, v, J; double E; float g, extra; };
struct H2Line { uint16_t upper, lower; float A; };
`;
  h += rows('kH2Ground', 'H2Level', X.levels, (x) => `{0, ${x.v}, ${x.J}, ${f(x.E)}, ${x.g}, 0}`, 4);
  h += rows('kH2Quadrupole', 'H2Line', X.lines, (x) => `{${x.u}, ${x.l}, ${g6(x.A)}f}`, 6);
  h += `
// The excited levels, by energy: state 1 B¹Σu⁺, 2 C¹Πu⁺, 3 C¹Πu⁻ (Abgrall et al. 1994), 4 d³Πu⁺,
// 5 d³Πu⁻, 6 a³Σg⁺ (from the constants); extra: a decay that makes no line (a³Σg⁺ → b³Σu⁺, s⁻¹).
`;
  h += rows('kH2Excited', 'H2Level', order.map((i) => upper[i]), (x) => `{${x.state + 1}, ${x.v}, ${x.J}, ${f(x.E)}, ${x.g}, ${x.extra ? g6(x.extra) + 'f' : 0}}`, 3);
  h += `// Their lines: into the ground state's levels (Lyman and Werner bands), then among themselves
// (Fulcher-α, d → a).
inline constexpr int kH2ToGround = ${electronic.filter((x) => x.toX).length};
`;
  h += rows('kH2Electronic', 'H2Line', electronic, (x) => `{${x.u}, ${x.l}, ${g6(x.A)}f}`, 6);
  h += `// The Franck–Condon factors from X v = 0 into d v′ (electron impact lights d through them).
`;
  h += rows('kH2FulcherFromGround', 'float', fa.Xq, (x) => `${g6(x)}f`, 6);
  h += `\n} // namespace forte::hydrogen::tables\n`;
  return { h, he, X, uv, fa };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { h, he, X, uv, fa } = build();
  writeFileSync(headerFile, h);
  console.log(`helium: ${he.terms.length} terms, ${he.lines.length} term pairs; H₂: ${X.levels.length} ground levels, ${X.lines.length} quadrupole lines, ${uv.up.length} B/C levels, ${uv.lines.length} UV lines, ${fa.up.length + fa.low.length} d/a levels, ${fa.lines.length} Fulcher lines; ${(h.length / 1024).toFixed(0)} KB`);
}
