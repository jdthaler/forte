// tuning.js — the keyboard's tuning, the same for every instrument and, operation for operation,
// in the plugins (native/core tuning.h): a pitch standard (A4 in Hz), a temperament built on a
// root key, and a custom temperament that a Scala file (.scl) can fill. No DOM: the tests use it
// in Node; shared/tuning-ui.js is the pages' "Load a Scala file" button.
//
// A temperament gives each note of the octave its place above the root, in cents. The historical
// ones are built from their circle of fifths: the eleven fifths from E♭ to G♯, each made narrower
// than a pure 3 : 2 by a share of a comma (the twelfth, G♯–E♭, closes the circle and takes what
// is left: meantone's wolf). Just intonation is a table of 5-limit ratios. Then the tuning is moved
// so that A4 sounds at the pitch standard, whatever the temperament makes of A.
//
// Every instrument has the parameters TUNING_GROUP (or, as the harpsichord, in a group of its
// own), and keeps them across presets (TUNING_KEEP). Its engine asks the C++ for each key's
// frequency ratio to equal temperament at A = 440 Hz, which is exactly 1 at the defaults, so an
// instrument sounds as it did until its tuning changes.

const LOG2 = (x) => Math.log(x) / Math.LN2;
export const PURE_FIFTH = 1200 * LOG2(3 / 2);
export const PYTHAGOREAN_COMMA = 1200 * LOG2(531441 / 524288); // twelve pure fifths over seven octaves
export const SYNTONIC_COMMA = 1200 * LOG2(81 / 80);             // four pure fifths over a pure major third and two octaves
export const SCHISMA = PYTHAGOREAN_COMMA - SYNTONIC_COMMA;

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

// The pitch standards, by A4 (Hz). 440 and 415 come first: the harpsichord had them, in that order.
export const PITCHES = [
  [440, 'A = 440 Hz (modern)'],
  [415, 'A = 415 Hz (baroque pitch)'],
  [392, 'A = 392 Hz (French baroque, ton de chambre)'],
  [422.5, 'A = 422.5 Hz (Handel’s tuning fork, 1751)'],
  [430, 'A = 430 Hz (classical)'],
  [435, 'A = 435 Hz (diapason normal, 1859)'],
  [442, 'A = 442 Hz (many orchestras today)'],
  [443, 'A = 443 Hz (Berlin, Vienna)'],
  [466, 'A = 466 Hz (Chorton, German organs)'],
];

// The fifths along the circle from E♭ to G♯: the pitch classes in that order, and the eleven fifths
// between them (fifth j joins CHAIN[j] to CHAIN[j + 1]).
const CHAIN = [3, 10, 5, 0, 7, 2, 9, 4, 11, 6, 1, 8];
const FIFTH = { 'E♭–B♭': 0, 'B♭–F': 1, 'F–C': 2, 'C–G': 3, 'G–D': 4, 'D–A': 5, 'A–E': 6, 'E–B': 7, 'B–F♯': 8, 'F♯–C♯': 9, 'C♯–G♯': 10 };
// eleven fifths, each `by` cents narrower than pure, except those named in `tempered` (the rest pure)
const fifths = (by, tempered = Object.keys(FIFTH)) => Array.from({ length: 11 }, (_, j) => (tempered.some((f) => FIFTH[f] === j) ? by : 0));

// The temperaments, in the order of the choice. The first three are the harpsichord's own, kept in
// its order; the others follow. `narrow`: how much narrower than pure each fifth E♭–B♭ … C♯–G♯ is.
export const TEMPERAMENTS = [
  { id: 'equal', name: 'Equal temperament' },
  { id: 'meantone', name: '¼-comma meantone', narrow: fifths(SYNTONIC_COMMA / 4) },
  { id: 'werckmeister', name: 'Werckmeister III (1691)', narrow: fifths(PYTHAGOREAN_COMMA / 4, ['C–G', 'G–D', 'D–A', 'B–F♯']) },
  { id: 'sixth', name: '⅙-comma meantone (Silbermann)', narrow: fifths(SYNTONIC_COMMA / 6) },
  { id: 'kirnberger', name: 'Kirnberger III (1779)', narrow: fifths(SYNTONIC_COMMA / 4, ['C–G', 'G–D', 'D–A', 'A–E']).map((t, j) => (j === FIFTH['F♯–C♯'] ? SCHISMA : t)) },
  { id: 'vallotti', name: 'Vallotti', narrow: fifths(PYTHAGOREAN_COMMA / 6, ['F–C', 'C–G', 'G–D', 'D–A', 'A–E', 'E–B']) },
  { id: 'young', name: 'Young (1799)', narrow: fifths(PYTHAGOREAN_COMMA / 6, ['C–G', 'G–D', 'D–A', 'A–E', 'E–B', 'B–F♯']) },
  { id: 'pythagorean', name: 'Pythagorean', narrow: fifths(0) },
  { id: 'just', name: 'Just intonation (5-limit)', ratios: [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 16 / 9, 15 / 8] },
  { id: 'custom', name: 'Custom (or a Scala file)' },
];

const mod1200 = (c) => ((c % 1200) + 1200) % 1200;

// Each note's place above the root (cents, 0 … 1200), for a temperament with no custom cents.
export function temperamentCents(id) {
  const t = TEMPERAMENTS.find((x) => x.id === id) ?? TEMPERAMENTS[0];
  if (t.ratios) return t.ratios.map((r) => 1200 * LOG2(r));
  if (!t.narrow) return Array.from({ length: 12 }, (_, d) => 100 * d);
  const c = new Array(12);
  const C = CHAIN.indexOf(0);
  c[0] = 0;
  for (let j = C, x = 0; j < 11; j++) { x += PURE_FIFTH - t.narrow[j]; c[CHAIN[j + 1]] = mod1200(x); }
  for (let j = C - 1, x = 0; j >= 0; j--) { x -= PURE_FIFTH - t.narrow[j]; c[CHAIN[j]] = mod1200(x); }
  return c;
}

// The custom temperament's parameters: how far each note above the root lies from its place in
// equal temperament.
export const INTERVALS = ['Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th', 'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th'];
export const CENTS_RANGE = 100;
const signedCents = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)} ¢`;
const isCustom = (P) => P.temperament === 'custom';

export const PITCH = {
  id: 'pitch', label: 'Pitch', type: 'select', def: 440, options: PITCHES,
  hint: 'The pitch standard: what A above middle C sounds at. Forte\'s instruments are built at 440 Hz; at another pitch the same strings, bars or pipes are retuned to it (at 415 a string\'s tension is 11 % lower).',
};
export const TEMPERAMENT = {
  id: 'temperament', label: 'Temperament', type: 'select', def: 'equal', options: TEMPERAMENTS.map((t) => [t.id, t.name]),
  hint: 'How the octave is shared out. Equal temperament makes every fifth and third a little out of tune, the same in every key. Meantone makes eight major thirds pure (C–E, F–A, …) at the cost of a wolf fifth G♯–E♭; the well temperaments (Werckmeister, Kirnberger, Vallotti, Young) can play in every key, each key with its own colour; Pythagorean tuning makes the fifths pure, just intonation the chords on the root. Custom is yours, or a Scala file\'s.',
};
export const TUNING_ROOT = {
  id: 'tuningRoot', label: 'Temperament root', type: 'select', def: 0, options: NOTE_NAMES.map((n, i) => [i, n]),
  showIf: (P) => P.temperament !== 'equal',
  hint: 'The key the temperament is built on, where its C would be: a meantone or just tuning on D is purest in D. A4 stays at the pitch standard.',
};
export const CENTS = INTERVALS.map((name, i) => ({
  id: `cents${i + 1}`, label: `${name} (custom)`, min: -CENTS_RANGE, max: CENTS_RANGE, def: 0, step: 0.01, fmt: signedCents,
  showIf: isCustom,
  ...(i === 0 ? { hint: 'The custom temperament, note by note: how far each note above the root lies from equal temperament, in cents (a cent is a hundredth of a semitone). Loading a Scala file sets them.' } : {}),
}));
export const TUNING_PARAMS = [PITCH, TEMPERAMENT, TUNING_ROOT, ...CENTS];
export const TUNING_GROUP = { title: 'Tuning', open: false, params: TUNING_PARAMS };
export const TUNING_KEEP = TUNING_PARAMS.map((p) => p.id); // kept when a preset is chosen

const pitchOf = (v) => (PITCHES.some(([hz]) => hz === Number(v)) ? Number(v) : 440);

// Each pitch class's departure from equal temperament at A = 440 Hz (cents), C first: the
// temperament on its root, moved so that A4 is at the pitch standard.
export function tuningCents(P) {
  const id = TEMPERAMENTS.some((t) => t.id === P.temperament) ? P.temperament : 'equal';
  const root = ((Math.round(Number(P.tuningRoot) || 0) % 12) + 12) % 12;
  const dev = id === 'custom'
    ? [0, ...CENTS.map((p) => Math.min(CENTS_RANGE, Math.max(-CENTS_RANGE, Number(P[p.id]) || 0)))]
    : temperamentCents(id).map((c, d) => c - 100 * d);
  const a = dev[(9 - root + 12) % 12];
  const shift = 1200 * LOG2(pitchOf(P.pitch) / 440);
  return Array.from({ length: 12 }, (_, pc) => dev[(pc - root + 12) % 12] - a + shift);
}

// A key's frequency over equal temperament's at A = 440 Hz: exactly 1 at the defaults.
export function tuningRatio(P, m) {
  const c = tuningCents(P);
  const at = (k) => 2 ** (c[((k % 12) + 12) % 12] / 1200);
  const k = Math.floor(m), t = m - k;
  return t === 0 ? at(k) : at(k) ** (1 - t) * at(k + 1) ** t; // between keys, the cents in between
}
export const tunedFreq = (P, m) => 440 * 2 ** ((m - 69) / 12) * tuningRatio(P, m);
export const isEqual440 = (P) => tuningCents(P).every((c) => c === 0);

// ---- Scala files ----------------------------------------------------------------------------------
// The Scala format (https://www.huygens-fokker.org/scala/scl_format.html): lines starting with !
// are comments; the first other line is a description, the next the number of notes, then one
// pitch a line above the 1/1 (which is not listed), the last being the period: a number with a
// period in it is cents, else a ratio (3/2, or 2 for 2/1). Anything after the pitch is ignored.

// A Scala file's text: { name, cents (the 11 custom values), notes }, or an Error saying what is
// wrong. Forte plays twelve notes to the octave, so the scale must have 12 notes and repeat at 2/1.
export function readScala(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => !l.startsWith('!'));
  if (lines.length < 2) throw new Error('This is not a Scala file (.scl): it has no description and number of notes.');
  const name = lines[0].trim();
  const n = Number(lines[1].trim().split(/\s+/)[0]);
  if (!Number.isInteger(n) || n < 1) throw new Error('This is not a Scala file (.scl): its second line is not the number of notes.');
  const pitches = [];
  for (const raw of lines.slice(2)) {
    const s = raw.trim().split(/\s+/)[0];
    if (!s) continue;
    pitches.push(pitchCents(s, pitches.length + 1));
    if (pitches.length === n) break;
  }
  if (pitches.length < n) throw new Error(`This Scala file says it has ${n} notes but lists ${pitches.length}.`);
  if (n !== 12) throw new Error(`This scale has ${n} notes to its period; Forte plays 12 notes to the octave.`);
  if (Math.abs(pitches[11] - 1200) > 0.01) throw new Error(`This scale repeats every ${pitches[11].toFixed(2)} cents, not at the octave (1200 cents).`);
  const cents = pitches.slice(0, 11).map((c, i) => c - 100 * (i + 1));
  const far = cents.findIndex((c) => Math.abs(c) > CENTS_RANGE);
  if (far >= 0) throw new Error(`Its note ${far + 1} lies ${Math.abs(cents[far]).toFixed(1)} cents from equal temperament; Forte keeps each note within ${CENTS_RANGE}.`);
  return { name, notes: n, cents: cents.map((c) => Math.round(c * 100) / 100) };
}
function pitchCents(s, k) {
  if (s.includes('.')) {
    const c = Number(s);
    if (!Number.isFinite(c)) throw new Error(`Its note ${k} (${s}) is not a number of cents.`);
    return c;
  }
  const m = s.match(/^(\d+)(?:\/(\d+))?$/);
  const r = m ? Number(m[1]) / Number(m[2] ?? 1) : NaN;
  if (!(r > 0) || !Number.isFinite(r)) throw new Error(`Its note ${k} (${s}) is not a ratio such as 3/2.`);
  return 1200 * LOG2(r);
}

// The parameters a Scala file sets: the custom temperament, its cents (on the root as it is).
export const scalaValues = (scale) => ({ temperament: 'custom', ...Object.fromEntries(CENTS.map((p, i) => [p.id, scale.cents[i]])) });
