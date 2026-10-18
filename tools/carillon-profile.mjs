// Design the Carillon's bells as a founder does: start from a rib (the bell's cross-section), solve
// its modes by axisymmetric finite elements, and adjust the rib's thickness, radius and height at
// its ten stations until hum, prime, tierce, quint and nominal sit at 0.5 : 1 : 1.2 : 1.5 : 2 (minor
// third) or 0.5 : 1 : 1.25 : 1.5 : 2 (major third), moving the rib no further than it must. Each of
// three registers has its own rib, heavier towards the treble. Then tabulate every mode below
// 8–12 × the prime and write carillon/src/bell-table.js, and its C++ for the native port
// (native/instruments/carillon/bell-table.h, by tools/carillon-native-table.mjs).
// Usage: node tools/carillon-profile.mjs [minor|major …]     (about 10 minutes for both)

import { writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  MINOR_START, MAJOR_START, tuneRib, ribStations, ribModes, solveRib, named, cents, foldMargin, geomOf,
  STRIKE_GRID, MESH, CLAMP_R, BRONZE,
} from '../carillon/src/bell-profile.js';

// The registers' ribs, heavier towards the treble; each keeps its modes up to rMax × the prime
// (bass C3: 1.6 kHz; middle C4: 2.6 kHz, B5: 9.9 kHz; treble C6: 8.4 kHz, C7: Nyquist). The bass and
// treble ribs also hang the bells past the C3–C7 compass, F2–B2 and C♯7–C8 (the engine leaves out
// what lies above 0.45 × the sample rate).
export const REGISTERS = [
  { id: 'bass', lo: 41, hi: 59, heavy: 0.5, rMax: 12 },
  { id: 'middle', lo: 60, hi: 83, heavy: 0.72, rMax: 10 },
  { id: 'treble', lo: 84, hi: 108, heavy: 1, rMax: 8 },
];
// Soft targets, then the five exact: the major-third bell also aims its superquint and octave nominal at
// 3 and 4 × the prime and its deciem (4,1#) at 2.5 (weights 3 and 2 against the five tuned partials'
// 10). Of the minor-third ribs only the bass aims at the superquint and octave nominal, gently (weight
// 1): asked harder, or of the other ribs, the soft targets thin the walls far out of a bell's range.
export const PROFILES = {
  minor: { start: MINOR_START, tierce: 1.2, deciemW: 0, upperW: { bass: 1, middle: 0, treble: 0 } },
  major: { start: MAJOR_START, tierce: 1.25, deciemW: 2, upperW: { bass: 3, middle: 3, treble: 3 } },
};
const SENS_GROUPS = [[0, 1, 2], [3, 4], [5, 6], [7], [8, 9]]; // crown, shoulder, waist, lower waist, soundbow & lip
const SENS_STEP = 0.01;     // log-thickness step for the historic-bell sensitivities

const only = process.argv.slice(2);
let prev = null;
const tablePath = new URL('../carillon/src/bell-table.js', import.meta.url);
if (existsSync(tablePath) && !process.env.FRESH) prev = (await import(tablePath)).BELL_TABLE; // FRESH=1: tune from the start ribs

const round = (x, d = 5) => (x === 0 ? 0 : +x.toPrecision(d));
const ribs = [];
const t0 = performance.now();
for (const [pid, P] of Object.entries(PROFILES)) {
  for (const [ri, reg] of REGISTERS.entries()) {
    const old = prev?.ribs.find((r) => r.profile === pid && r.register === reg.id);
    if (only.length && !only.includes(pid) && old) { ribs.push(old); continue; }
    const t1 = performance.now();
    // tune: start from the previous answer if there is one, else from the register below's
    const below = ribs.find((r) => r.profile === pid && r.register === REGISTERS[ri - 1]?.id);
    const tuned = tuneRib(P.start, { tierce: P.tierce, heavy: reg.heavy, deciemW: P.deciemW, upperW: P.upperW[reg.id], h0: old?.h ?? below?.h ?? {} });
    const stations = ribStations(P.start, tuned.h, reg.heavy).map((s) => s.map((v) => round(v, 7)));
    const data = ribModes(stations, { rMax: reg.rMax, viewMax: { m: 6, k: 2 } });
    // the historic bell: how each mode moves (d ln f) when a group of stations is cast 1 % thicker
    const ms = [...new Set(data.modes.map((m) => m.m))], perM = {};
    for (const m of ms) perM[m] = Math.max(...data.modes.filter((x) => x.m === m).map((x) => x.k)) + 1;
    const base = solveRib(stations, { ms, perM });
    const sens = data.modes.map(() => []);
    for (const grp of SENS_GROUPS) {
      const st = stations.map(([r, z, t], i) => [r, z, grp.includes(i) ? t * Math.exp(SENS_STEP) : t]);
      const sol = solveRib(st, { ms, perM });
      data.modes.forEach((md, j) => sens[j].push(round(Math.log(Math.sqrt(sol.modes[md.m][md.k].lambda / base.modes[md.m][md.k].lambda)) / SENS_STEP, 2)));
    }
    const nm = named(data.sol), fp = nm.find((x) => x.id === 'prime').f;
    const partials = Object.fromEntries(nm.map((x) => [x.id, round(x.f / fp, 7)]));
    const rib = {
      profile: pid, register: reg.id, lo: reg.lo, hi: reg.hi, heavy: reg.heavy, tierce: P.tierce,
      h: Object.fromEntries(Object.entries(tuned.h).map(([k, v]) => [k, round(v, 6)])),
      stations, H: round(data.H, 6), volume: round(data.volume, 6), lamPrime: round(fp * fp, 9), partials,
      modes: data.modes.map((m, j) => {
        const o = { m: m.m, k: m.k, r: round(m.ratio, 7), kap: round(m.kappa, 3), c: m.circles.map((x) => round(x, 2)), w: m.win.map((x) => round(x, 3)), I: round(m.rad.I, 3), a: round(m.rad.a, 3), s: sens[j] };
        if (m.view) o.v = m.view.map((x) => round(x, 3));
        if (m.name) o.n = m.name;
        return o;
      }),
    };
    ribs.push(rib);
    const fold = foldMargin(geomOf(stations));
    console.log(`${pid} ${reg.id} (×${reg.heavy}): ${tuned.iterations} iterations, ${tuned.evaluations} FEM solves, ${((performance.now() - t1) / 1000).toFixed(1)} s; fold margin κt/2 = ${fold.toFixed(2)}; ${rib.modes.length} modes`);
    console.log('   ' + nm.map((x) => `${x.id} ${(x.f / fp).toFixed(4)} (${cents(x.f / fp, x.id === 'tierce' ? P.tierce : x.ideal).toFixed(2)} ¢)`).join('  '));
    console.log('   handles ' + Object.entries(tuned.h).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(' '));
  }
}

const src = `// bell-table.js — generated by tools/carillon-profile.mjs; do not edit.
// The tuned ribs (bell cross-sections) and their modes, from the axisymmetric FEM in bell-fem.js
// (${MESH.ns} × ${MESH.nt} eight-node elements, crown clamped out to r = ${CLAMP_R} D, ν = ${BRONZE.nu}).
// Lengths in units of the lip's diameter D; modes non-dimensional (E = ρ = 1, D = 1, unit modal mass).
// Per rib: profile ('minor' | 'major'), register and its keys [lo, hi], thickness factor heavy, the
// tuning handles h, stations [r, z, t] (crown → lip), height H, volume (D³), λ of the prime, the named
// partials' ratios to the prime, and modes up to rMax × the prime, each:
//   m (family: 2m nodal meridians), k (order within m), r (ratio to the prime), kap (doublet factor:
//   kinetic energy in u_r, u_z minus u_θ, over the total), c (nodal circles, heights / H), w (normal
//   motion of the inner surface at the heights STRIKE_GRID × H), I (∫ w² dS over the outer surface)
//   and a (its w²-weighted radius), s (d ln f / d ln t for the station groups ${JSON.stringify(SENS_GROUPS)}),
//   v (normal motion along the mid-surface, crown → lip, for drawing; m ≤ 6, k ≤ 2), n (name).
export const STRIKE_GRID = ${JSON.stringify(STRIKE_GRID.map((x) => round(x, 6)))};
export const SENS_GROUPS = ${JSON.stringify(SENS_GROUPS)};
export const BELL_TABLE = { ribs: [
${ribs.map((r) => `  ${JSON.stringify(r)},`).join('\n')}
] };
`;
writeFileSync(tablePath, src);
console.log(`carillon/src/bell-table.js: ${ribs.length} ribs, ${(src.length / 1024).toFixed(0)} KB, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
// the native port's copy (in a fresh process: this one holds the old table)
execFileSync(process.execPath, [new URL('./carillon-native-table.mjs', import.meta.url).pathname], { stdio: 'inherit' });
