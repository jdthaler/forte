// Tune the regal's reeds as a voicer does, at the default wind: for each resonator shape and each
// semitone a rank can sound (A−1 to C8; the 4′ breaks back past C8), blow the reed alone in its
// tube (the C++ engine's own step, built as WebAssembly), measure how far from its tongue's natural
// frequency it sounds, and recut the tongue until it sounds its note. The resonator is cut a quarter
// of a harmonic below one of the note's; where the note then falls between two of the tongue's
// locks, a cut a little nearer or further is tried. Writes native/instruments/regal/regal-tuning.h.
//
// Then, with --voicing, the voicer's retuning: for each shape, every other semitone, and each voicing
// knob (and the weight on the bellows) set away from its default, how many cents the reed cut for
// the defaults sounds from its note; the engine runs each reed that much faster or slower (the
// whole reed scaled in time), the knobs' cents added. Writes native/instruments/regal/regal-voicing.h.
//
//   node tools/regal-tuning.mjs            # make the table (then rebuild the wasm, then --voicing)
//   node tools/regal-tuning.mjs --voicing  # make the voicing table (then rebuild the wasm)
//   node tools/regal-tuning.mjs --check    # measure every key of every rank on the build as it is

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { wasmModel } from '../regal/src/regal-wasm.js';
import { DEFAULTS, RESONATORS } from '../regal/src/regal-params.js';

const LO = 9, N = 100, P0 = DEFAULTS.pressure, FS = 48000;
const M = await wasmModel();
const freq = (n) => 440 * 2 ** ((n - 69) / 12);

// The voicing table's grid: each knob's points (its default among them), and the notes. Shallot
// facing is not a knob here: each facing has a table of its own.
export const VOICING = [
  ['pressure', [400, 450, 500, 550, 600, 650, 700, 775, 850, 950, 1050, 1150, 1250]],
  ['curve', [0.3, 0.38, 0.47, 0.6, 0.72, 0.85, 1, 1.2]],
  ['thickness', [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4]],
  ['q', [30, 45, 70, 120, 190, 280, 400]],
  ['resLength', [0.6, 0.7, 0.8, 0.9, 1, 1.12, 1.25, 1.4, 1.6, 1.7]],
];
const FACINGS = ['brass', 'leather'];
const VG_LO = 9, VG_N = 100;
// the reed sounding note n (its 8′ rank's, or its 16′'s below A0)
const keyRank = (n) => (n >= 21 ? [n, 1] : [n + 12, 0]);
const centsOff = (P, n, P0) => { const [key, rank] = keyRank(n), f = M.measure(key, rank, P, FS, P0); return f > 0 ? 1200 * Math.log2(f / freq(n)) : NaN; };

const part = process.argv.indexOf('--voicing-part');
if (part > 0) { // one shape's and facing's part of the table, as JSON on stdout: [point][note]
  const s = +process.argv[part + 1], facing = FACINGS[+process.argv[part + 2]];
  const base = { ...DEFAULTS, resonator: RESONATORS[s][0], facing };
  // each knob against this facing's defaults; the pressure's from the note itself, so that it carries
  // the facing's own cents and what the tongue's cut leaves (the knobs' cents add)
  const refF = Array.from({ length: VG_N }, (_, i) => centsOff(base, VG_LO + i, P0));
  const out = [];
  for (const [id, xs] of VOICING) for (const x of xs) {
    const P = { ...base, [id]: x };
    out.push(Array.from({ length: VG_N }, (_, i) => {
      if (id === 'pressure') return x === DEFAULTS[id] ? refF[i] : centsOff(P, VG_LO + i, P.pressure);
      return x === DEFAULTS[id] ? 0 : centsOff(P, VG_LO + i, P.pressure) - refF[i];
    }));
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}
if (process.argv.includes('--voicing')) {
  const { execFile } = await import('node:child_process');
  const self = fileURLToPath(import.meta.url), jobs = [];
  for (let f = 0; f < FACINGS.length; f++) for (let s = 0; s < RESONATORS.length; s++) jobs.push([s, f]);
  const parts = {};
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < jobs.length) {
      const [s, f] = jobs[next++];
      parts[`${f},${s}`] = await new Promise((done, fail) => execFile(process.execPath, [self, '--voicing-part', String(s), String(f)], { maxBuffer: 1 << 26 }, (err, out) => (err ? fail(err) : done(JSON.parse(out)))));
      console.log(`  ${FACINGS[f]} ${RESONATORS[s][0]} measured`);
    }
  }));
  // where a reed does not speak: its neighbour's cents along the knob (then 0)
  let holes = 0;
  const OFF = [];
  let at = 0;
  for (const [, xs] of VOICING) { OFF.push(at); at += xs.length; }
  for (const rows of Object.values(parts)) for (let k = 0; k < VOICING.length; k++) for (let i = 0; i < VG_N; i++) {
    const n = VOICING[k][1].length, col = Array.from({ length: n }, (_, j) => rows[OFF[k] + j][i]);
    holes += col.filter((c) => !Number.isFinite(c)).length;
    for (let j = 1; j < n; j++) if (!Number.isFinite(col[j]) && Number.isFinite(col[j - 1])) col[j] = col[j - 1];
    for (let j = n - 2; j >= 0; j--) if (!Number.isFinite(col[j]) && Number.isFinite(col[j + 1])) col[j] = col[j + 1];
    col.forEach((c, j) => { rows[OFF[k] + j][i] = Number.isFinite(c) ? c : 0; });
  }
  const fmt = (r) => { const o = []; for (let i = 0; i < r.length; i += 20) o.push(`      ${r.slice(i, i + 20).map((c) => Math.max(-32767, Math.min(32767, Math.round(10 * c)))).join(', ')},`); return o.join('\n'); };
  const body = FACINGS.map((fc, f) => `  { // ${fc}\n${RESONATORS.map(([id], s) => `   { // ${id}\n${parts[`${f},${s}`].map((r, j) => `    { // ${VOICING.find((_, k) => OFF[k] <= j && j < OFF[k] + VOICING[k][1].length)[0]}\n${fmt(r)}\n    },`).join('\n')}\n   },`).join('\n')}\n  },`).join('\n');
  writeFileSync(new URL('../native/instruments/regal/regal-voicing.h', import.meta.url), `// regal-voicing.h — generated by tools/regal-tuning.mjs --voicing; do not edit.
// The voicer's retuning. For each shallot facing (${FACINGS.join(', ')}), resonator shape, knob
// (${VOICING.map(([id]) => id).join(', ')}) set to each of its points and semitone from MIDI ${VG_LO}, how
// many tenths of a cent a reed cut for the defaults (regal-tuning.h) sounds from its note (the pressure's)
// or from what it sounds at the defaults (the others'). The engine adds the knobs' cents (interpolated in each knob's log and the
// note) and runs each reed that much slower.
#pragma once
#include <cstdint>

namespace forte::regal {

enum VoicingKnob { VG_PRESSURE, VG_CURVE, VG_THICK, VG_Q, VG_RESLEN, VG_KNOBS };
inline constexpr int VG_LO = ${VG_LO}, VG_N = ${VG_N}, VG_PTS = ${at};
inline constexpr int VG_NX[VG_KNOBS] = {${VOICING.map(([, v]) => v.length).join(', ')}};
inline constexpr int VG_OFF[VG_KNOBS] = {${OFF.join(', ')}};
inline constexpr double VG_X[VG_PTS] = {
${VOICING.map(([id, v]) => `  ${v.join(', ')}, // ${id}`).join('\n')}
};
inline constexpr int16_t VG_C[${FACINGS.length}][${RESONATORS.length}][VG_PTS][VG_N] = {
${body}
};

} // namespace forte::regal
`);
  console.log(`wrote native/instruments/regal/regal-voicing.h (${holes} silent points filled from their neighbours)`);
  process.exit(0);
}

if (process.argv.includes('--check')) {
  let worst = 0, silent = [];
  for (let s = 0; s < RESONATORS.length; s++) {
    const P = { ...DEFAULTS, resonator: RESONATORS[s][0] };
    let w = 0;
    for (let key = 21; key <= 108; key++) for (let rank = 0; rank < 3; rank++) {
      const n = key + 12 * (rank - 1);
      if (n < LO || n >= LO + N) continue;
      const f = M.measure(key, rank, P, FS, P0);
      if (!(f > 0)) { silent.push(`${RESONATORS[s][0]} ${key}/${rank}`); continue; }
      const c = 1200 * Math.log2(f / (freq(key) * 2 ** (rank - 1)));
      if (Math.abs(c) > 3 && process.argv.includes("-v")) console.log(`  ${RESONATORS[s][0]} key ${key} rank ${rank}: ${c.toFixed(1)} ¢`);
      if (Math.abs(c) > Math.abs(w)) w = c;
    }
    console.log(`${RESONATORS[s][0].padEnd(8)} worst ${w.toFixed(3)} ¢`);
    if (Math.abs(w) > Math.abs(worst)) worst = w;
  }
  console.log(`worst ${worst.toFixed(3)} ¢; silent: ${silent.length ? silent.join(', ') : 'none'}`);
  process.exit(0);
}

// A note's cut: the first offset whose reed comes within 0.05 ¢ and holds its regime when the wind
// moves (a reed that falls off its beat when the chest dips, or jumps to another as the wind rises,
// is no use), else the best of those that hold, else the best.
const OFFSETS = [-0.25, -0.15, -0.35, -0.05, -0.45, -0.55, -0.65, -0.75, -0.85];
// Whether a reed so cut holds its regime as the wind moves from 0.8 to 1.45 times P0 (no step of more
// than 60 ¢ between neighbouring winds), and sounds within `tol` ¢ at P0 (0: any): its cents, or false.
const WINDS = [0.8, 0.9, 1, 1.1, 1.25, 1.45];
function holdsWind(f0, s, tune, o, tol) {
  const c = WINDS.map((x) => { const f = M.measureCut(f0, s, tune, o, FS, x * P0); return f > 0 ? 1200 * Math.log2(f / f0) : NaN; });
  for (let i = 1; i < c.length; i++) if (!(Math.abs(c[i] - c[i - 1]) < 60)) return false;
  return tol && !(Math.abs(c[2]) < tol) ? false : c[2];
}
function cutFor(s, f0) {
  let best = null;
  for (const o of OFFSETS) {
    const t = M.tune(f0, s, FS, P0, o);
    if (!(t.tune > 0)) continue;
    const holds = holdsWind(f0, s, t.tune, o, 0) !== false;
    const c = { ...t, off: o, holds };
    if (!best || (holds && !best.holds) || (holds === best.holds && t.err < best.err)) best = c;
    if (best.holds && best.err < 0.05) break;
  }
  // none holds: a tongue cut a little sharp or flat that does (the voicing table's cents put it right)
  if (best && !best.holds) {
    for (let k = 1; k <= 8 && !best.holds; k++) for (const sgn of [1, -1]) for (const o of OFFSETS) {
      const t = M.tune(f0, s, FS, P0, o);
      if (!(t.tune > 0)) continue;
      const tune = t.tune * (1 + sgn * 0.004 * k), c0 = holdsWind(f0, s, tune, o, 40);
      if (c0 !== false) { best = { tune, err: Math.abs(c0), off: o, holds: true }; break; }
    }
  }
  return best;
}
const tunePart = process.argv.indexOf('--tune-part');
if (tunePart > 0) {
  const s = +process.argv[tunePart + 1], row = [], off = [], notes = [];
  for (let i = 0; i < N; i++) {
    const best = cutFor(s, freq(LO + i));
    row.push(best ? best.tune : 0); off.push(best ? best.off : -0.25);
    if (!best || best.err > 1 || !best.holds) notes.push(`  ${RESONATORS[s][0]} ${LO + i}: ${best ? `${best.err.toFixed(2)} ¢ off${best.holds ? '' : ', falls off its beat as the wind moves'}` : 'silent'}`);
  }
  for (let i = 1; i < N; i++) if (!(row[i] > 0)) row[i] = row[i - 1];
  for (let i = N - 2; i >= 0; i--) if (!(row[i] > 0)) row[i] = row[i + 1];
  process.stdout.write(JSON.stringify({ row, off, notes }));
  process.exit(0);
}
const { execFile } = await import('node:child_process');
const self = fileURLToPath(import.meta.url);
const done = await Promise.all(RESONATORS.map((_, s) => new Promise((ok, fail) => execFile(process.execPath, [self, '--tune-part', String(s)], { maxBuffer: 1 << 26 }, (err, out) => (err ? fail(err) : ok(JSON.parse(out)))))));
const rows = done.map((d) => d.row), offs = done.map((d) => d.off);
for (const d of done) for (const line of d.notes) console.log(line);
const fmt = (row) => {
  const out = [];
  for (let i = 0; i < row.length; i += 12) out.push(`    ${row.slice(i, i + 12).map((r) => +r.toFixed(6)).join(', ')},`);
  return out.join('\n');
};
writeFileSync(new URL('../native/instruments/regal/regal-tuning.h', import.meta.url), `// regal-tuning.h — generated by tools/regal-tuning.mjs; do not edit.
// For each resonator shape (${RESONATORS.map((r) => r[0]).join(', ')}) and each semitone from MIDI ${LO}
// (A−1, the Sordun's lowest with the full range) to ${LO + N - 1} (C8, the highest any rank sounds), the ratio of a
// reed's sounding frequency at the default wind (${P0} Pa) and voicing to its tongue's natural
// frequency: the model cuts each tongue to fNat = f0 / ratio.
#pragma once

namespace forte::regal {

inline constexpr int TUNE_LO = ${LO}, TUNE_N = ${N};
inline constexpr double TUNE[${RESONATORS.length}][TUNE_N] = {
${rows.map((r) => `  {\n${fmt(r)}\n  },`).join('\n')}
};
// How far from one of the note's harmonics (in harmonics) its resonator's first peak is cut.
inline constexpr double TUNE_OFF[${RESONATORS.length}][TUNE_N] = {
${offs.map((r) => `  {\n${fmt(r)}\n  },`).join('\n')}
};

} // namespace forte::regal
`);
console.log('wrote native/instruments/regal/regal-tuning.h');
