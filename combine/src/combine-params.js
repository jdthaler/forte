// combine-params.js — the Combinations page without its DOM: the starting combinations, how a key
// reaches each instrument, and the page's saved state read back safely. No DOM, no Web Audio, so
// the tests (test/combine-tests.mjs) run it in Node.

export const MAX_PARTS = 4;
export const KEYS = [21, 108];      // the keys a part can be given: A0 to C8, a piano's
export const OCTAVES = 2;           // a part's octave: −2 … +2
export const LEVEL = { min: -30, max: 6, def: 0 }; // a part's level, dB
export const VOLUME = {
  id: 'volume', label: 'Volume', min: -30, max: 6, def: 0, step: 0.5, unit: 'dB', strip: true,
  hint: 'Every instrument here together, in decibels, before the limiter that keeps their sum from clipping. Each instrument\'s own Level sets how it sits against the others.',
};
export const STORE = 'forte/combine/v1';

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Combinations to start from: each instrument at one of its presets (or as on its own page), on
// the keys from lo to hi, its octave moved by oct, at a level in dB. The first is the default.
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
    .map((p) => ({ ...part(p), P: p.P && typeof p.P === 'object' && !Array.isArray(p.P) ? p.P : null }));
  const volume = Number.isFinite(s.volume) ? clamp(s.volume, VOLUME.min, VOLUME.max) : VOLUME.def;
  return { parts, volume, combination: typeof s.combination === 'string' ? s.combination : null };
}
