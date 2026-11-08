// combine-params.js — the Combinations page without its DOM: the starting combinations, how a key
// reaches each instrument, the page's saved state read back safely, and your own combinations as
// files and links. No DOM, no Web Audio, so the tests (test/combine-tests.mjs) run it in Node.

export const MAX_PARTS = 4;
export const KEYS = [21, 108];      // the keys a part can be given: A0 to C8, a piano's
export const OCTAVES = 2;           // a part's octave: −2 … +2
export const LEVEL = { min: -30, max: 6, def: 0 }; // a part's level, dB
export const VOLUME = {
  id: 'volume', label: 'Volume', min: -30, max: 6, def: 0, step: 0.5, unit: 'dB', strip: true,
  hint: 'Every instrument here together, in decibels, before the limiter that keeps their sum from clipping. Each instrument\'s own Level sets how it sits against the others.',
};
export const STORE = 'forte/combine/v1';
export const MINE = 'forte/combine/combinations/v1'; // your combinations, in this browser

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Combinations to start from: each instrument at one of its presets (or as on its own page), on
// the keys from lo to hi, its octave moved by oct, at a level in dB. The first is the default.
// A preset is named as its instrument names it (a label, below, without its 'f:').
export const COMBINATIONS = [
  { name: 'Piano and strings', parts: [
    { id: 'piano' },
    { id: 'bowed', level: -4 },
  ] },
  { name: 'Vibes over a tine piano', parts: [
    { id: 'tines' },
    { id: 'vibraphone', level: -3 },
  ] },
  { name: 'Organ bass, electric grand above', parts: [
    { id: 'organ', preset: 'Ballad — 80 8000 000', lo: 21, hi: 47 },
    { id: 'grand', lo: 48 },
  ] },
  { name: 'Gedackt and harpsichord', parts: [
    { id: 'pipes', preset: 'Gedackt 8′: stopped pipes, odd harmonics', level: -6 },
    { id: 'harpsichord' },
  ] },
  { name: 'Chimes and celesta', parts: [
    { id: 'tubular' },
    { id: 'celesta', level: -2 },
  ] },
  { name: 'Gong below a gamelan', parts: [
    { id: 'gongs', preset: 'Bronze gong: bell when soft, crash when hard', lo: 21, hi: 47 },
    { id: 'gamelan', preset: 'Gangsa pair: the shimmer', lo: 48 },
  ] },
  { name: 'Timpani, marimba and armonica', parts: [
    { id: 'drums', preset: 'Timpani, felt mallets', lo: 21, hi: 47 },
    { id: 'marimba', lo: 48, hi: 71 },
    { id: 'glass', lo: 72 },
  ] },
  { name: 'Stars over a black hole', parts: [
    { id: 'blackhole', lo: 21, hi: 47, oct: 1 },
    { id: 'stars', lo: 48 },
  ] },
];

// What a part's Presets menu names, as a label: 'f:<name>' one of the instrument's presets,
// 'u:<name>' one of yours for it (saved on its own page), 'default' its default settings, 'own'
// its settings as on its own page; null once a control has moved them since. A bare name is one
// of the instrument's presets (the starting combinations name them so).
export function label(v) {
  if (typeof v !== 'string' || !v) return null;
  if (v === 'default' || v === 'own' || /^[fu]:./s.test(v)) return v;
  return `f:${v}`;
}

// A part as the page keeps it, with its key range, octave and level made whole and in bounds.
export function part(p) {
  let lo = Number.isInteger(p.lo) ? clamp(p.lo, ...KEYS) : KEYS[0];
  let hi = Number.isInteger(p.hi) ? clamp(p.hi, ...KEYS) : KEYS[1];
  if (lo > hi) [lo, hi] = [hi, lo];
  return {
    id: p.id, lo, hi,
    oct: Number.isInteger(p.oct) ? clamp(p.oct, -OCTAVES, OCTAVES) : 0,
    level: Number.isFinite(p.level) ? clamp(p.level, LEVEL.min, LEVEL.max) : LEVEL.def,
    on: p.on !== false,
  };
}

// The key a part's engine plays for a key pressed, or null when the part doesn't play it: off,
// outside the keys it was given, or moved by its octave past the instrument's own keys (range:
// [lo, hi], its compass while that is closed).
export function routed(p, key, range) {
  if (!p.on || key < p.lo || key > p.hi) return null;
  const k = key + 12 * p.oct;
  return range && (k < range[0] || k > range[1]) ? null : k;
}

// Whether two parts share a key: layered there, rather than split.
export const overlap = (a, b) => a.lo <= b.hi && b.lo <= a.hi;

// What the parts do, in words: "Ribbon Piano on every key, Viola Organista on every key", or "…
// below C3, … from C3".
export function describe(parts, nameOf) {
  if (!parts.length) return 'No instruments yet: add one.';
  return parts.map((p) => {
    const where = p.lo === KEYS[0] && p.hi === KEYS[1] ? 'every key'
      : p.lo === KEYS[0] ? `the keys below ${noteName(p.hi + 1)}`
        : p.hi === KEYS[1] ? `the keys from ${noteName(p.lo)}` : `${noteName(p.lo)} to ${noteName(p.hi)}`;
    const oct = p.oct ? `, ${Math.abs(p.oct) === 1 ? 'an octave' : `${Math.abs(p.oct)} octaves`} ${p.oct > 0 ? 'up' : 'down'}` : '';
    return `${nameOf(p.id)} on ${where}${oct}${p.on ? '' : ' (off)'}`;
  }).join('; ');
}

// The page's saved state, read back: only instruments that are ready, at most MAX_PARTS, each
// part whole and its settings an object (the page completes them against the instrument's
// parameters as it loads it).
export function restore(saved, ready) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const parts = (Array.isArray(s.parts) ? s.parts : [])
    .filter((p) => p && typeof p === 'object' && ready(p.id))
    .slice(0, MAX_PARTS)
    .map((p) => ({ ...part(p), P: isObject(p.P) ? p.P : null, preset: label(p.preset) }));
  const volume = Number.isFinite(s.volume) ? clamp(s.volume, VOLUME.min, VOLUME.max) : VOLUME.def;
  return { parts, volume, combination: typeof s.combination === 'string' ? s.combination : null };
}
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// ---- your combinations -----------------------------------------------------------------------------
// A combination of yours: its name, and each part's keys, octave, level and on/off, what its
// Presets menu named (label, above) and its settings, by its contract's parameter ids as an
// instrument's own presets have them (shared/presets.js). The page completes the settings against
// the instrument's parameters as it loads it, so an id it no longer has is ignored and one left
// out takes its default.
export const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
export function combination(c, ready, i = 0) {
  if (!isObject(c) || !Array.isArray(c.parts)) return null;
  const parts = c.parts
    .filter((p) => isObject(p) && ready(p.id))
    .slice(0, MAX_PARTS)
    .map((p) => ({ ...part(p), preset: label(p.preset), values: isObject(p.values) ? p.values : {} }));
  return parts.length ? { name: cleanName(c.name) || `Combination ${i + 1}`, parts } : null;
}

// A combinations file (.json), one combination or many, which the Forte app reads and writes too
// (native/plugin/presets.cpp):
//   { "forte": "combinations", "format": 1, "forteVersion": "0.49.0",
//     "combinations": [{ "name": "Felt timpani under glass",
//       "parts": [{ "instrument": "drums", "instrumentVersion": "0.9.0", "lo": 21, "hi": 47, "oct": 0,
//                   "level": 0, "on": true, "preset": "f:Timpani, felt mallets", "values": { … } }, …] }] }
// lo and hi are MIDI's key numbers; oct moves the part by octaves (−2…+2); level is in dB.
export const FORMAT = 1;
export const KIND = 'combinations';
export function combinationsFile(list, versions = {}) {
  return `${JSON.stringify({
    forte: KIND, format: FORMAT, forteVersion: versions.forte ?? '',
    combinations: list.map((c) => ({
      name: cleanName(c.name),
      parts: c.parts.map((p) => ({
        instrument: p.id, instrumentVersion: versions[p.id] ?? '', lo: p.lo, hi: p.hi, oct: p.oct, level: p.level, on: p.on,
        ...(p.preset && { preset: p.preset }), values: p.values,
      })),
    })),
  }, null, 2)}\n`;
}
// A file's combinations, each whole: { combinations, warning? }. Throws an Error saying what is
// wrong when the text is not a combinations file. An instrument this site doesn't have (or not
// yet) is left out of its combination, and the warning names it.
export function readCombinationsFile(text, ready, nameOf = (id) => id) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('This file is not a Forte combinations file (it is not JSON).'); }
  if (isObject(d) && d.forte === 'presets') throw new Error('This is an instrument’s preset file: open it on that instrument’s own page.');
  if (!isObject(d) || d.forte !== KIND || !Array.isArray(d.combinations)) throw new Error('This file is not a Forte combinations file.');
  const missing = new Set();
  const combinations = d.combinations.map((c, i) => {
    if (!isObject(c) || !Array.isArray(c.parts)) return null;
    const parts = c.parts.filter(isObject).map((p) => ({ ...p, id: p.instrument }));
    for (const p of parts) if (!ready(p.id)) missing.add(typeof p.id === 'string' ? nameOf(p.id) : 'an instrument');
    return combination({ name: c.name, parts }, ready, i);
  }).filter(Boolean);
  if (!combinations.length) throw new Error(missing.size ? `This file’s combinations need instruments this site doesn’t have: ${[...missing].join(', ')}.` : 'This file holds no combinations.');
  const notes = [];
  if (missing.size) notes.push(`Left out: ${[...missing].join(', ')} (not on this site).`);
  if (Number(d.format) > FORMAT) notes.push('These combinations come from a newer Forte: some settings may be left out.');
  return { combinations, ...(notes.length && { warning: notes.join(' ') }) };
}

// A link to a combination carries it in the page's fragment, each part as p1…p4 (its instrument,
// keys, octave, level, on or off and what its menu named), then its settings that differ from
// the defaults as p1.<id>:
//   https://forte.jthaler.net/combine/#_c=1&_n=Mine&p1=piano,21,59,0,0,1,f:Concert&p1.hammer=0.4&p2=…
// paramsOf(id) gives an instrument's parameters (shared/presets.js presetParams), to leave its
// defaults out; without them every value goes in. A value reads back as a number where it is one,
// true or false, or else text (a choice's key), and the page makes it whole as it loads the part.
const num = (v) => String(Number(v.toPrecision(6)));
const text = (v) => (typeof v === 'number' ? num(v) : String(v));
export function combinationHash(c, paramsOf = () => null) {
  const q = new URLSearchParams();
  q.set('_c', String(FORMAT));
  if (cleanName(c.name)) q.set('_n', cleanName(c.name));
  c.parts.forEach((p, i) => {
    const k = `p${i + 1}`;
    q.set(k, [p.id, p.lo, p.hi, p.oct, num(p.level), p.on ? 1 : 0, ...(p.preset ? [p.preset] : [])].join(','));
    const params = paramsOf(p.id);
    const defs = params ? Object.fromEntries(params.map((x) => [x.id, x.def])) : null;
    for (const [id, v] of Object.entries(p.values ?? {})) {
      if (!['number', 'string', 'boolean'].includes(typeof v) || (typeof v === 'number' && !Number.isFinite(v))) continue;
      if (defs && (!Object.hasOwn(defs, id) || text(v) === text(defs[id]))) continue;
      q.set(`${k}.${id}`, text(v));
    }
  });
  return `#${q.toString()}`;
}
// A link's fragment read back: a combination (whole), or null when it is not one
export function readCombinationHash(hash, ready) {
  const h = String(hash ?? '').replace(/^#/, '');
  if (!/^_c=\d+(&|$)/.test(h)) return null;
  const q = new URLSearchParams(h);
  const value = (s) => (s === 'true' ? true : s === 'false' ? false : s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : s);
  const parts = [];
  for (let i = 1; i <= MAX_PARTS; i++) {
    const head = q.get(`p${i}`);
    if (!head) continue;
    const [id, lo, hi, oct, level, on, ...rest] = head.split(',');
    const values = {};
    for (const [k, v] of q) if (k.startsWith(`p${i}.`)) values[k.slice(`p${i}.`.length)] = value(v);
    parts.push({ id, lo: Number(lo), hi: Number(hi), oct: Number(oct), level: Number(level), on: on !== '0', preset: rest.join(',') || null, values });
  }
  return combination({ name: q.get('_n'), parts }, ready);
}
