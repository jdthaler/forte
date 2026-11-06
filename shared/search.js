// search.js — the front page's search and filters (landing.js), over the registry: which
// instruments a query and the chosen filter options match, and where to mark what matched.
//
// A query matches an instrument when each of its words starts a word somewhere in the
// instrument's name, what it is after, its tagline, its physics or its section, ignoring case
// and accents ("karman" finds Kármán, "rhodes" the Tine Piano). A word of four letters or more
// that starts no word of any instrument is taken as a typing slip (correct): it stands for the
// word starts one letter away (two from nine letters on), a letter wrong, missing, extra or two
// swapped ("harpsicord", "vibrophone", "schroedinger"). The chosen options match when the
// instrument has one of each filter's chosen options (none chosen: any).

import { SECTIONS, FILTERS } from './registry.js';

// The text a card shows, and so marks: the name, what it is after, the tagline, the physics.
export const FIELDS = ['name', 'after', 'tagline', 'physics'];

// Lower case, accents off, every character that is no letter or digit a space. `at[j]` is where
// the folded text's j-th character came from in s, and at[length] is s.length.
export function fold(s) {
  let text = '';
  const at = [];
  for (let i = 0; i < s.length;) {
    const ch = String.fromCodePoint(s.codePointAt(i));
    let f = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    if (!/^[\p{L}\p{N}]+$/u.test(f)) f = ' ';
    for (const c of f) { text += c; at.push(i); }
    i += ch.length;
  }
  at.push(s.length);
  return { text, at };
}

// A query's words, folded.
export const words = (query) => fold(query || '').text.split(' ').filter(Boolean);

// Where each word starts a word of s: [start, end) pairs in s's own indices, in order, merged.
// A word may be a list of words (correct): each of them is marked.
export function hits(s, ws) {
  if (!s || !ws.length) return [];
  const { text, at } = fold(s), out = [];
  for (const w of ws.flat()) {
    for (let j = text.indexOf(w); j >= 0; j = text.indexOf(w, j + 1)) {
      if (j === 0 || text[j - 1] === ' ') out.push([at[j], at[j + w.length]]);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([...r]);
  }
  return merged;
}

// Everything a query looks through for instrument i, folded.
const looked = new Map();
function haystack(i) {
  if (!looked.has(i)) {
    const sec = SECTIONS.find((s) => s.id === i.section);
    const all = [i.id, ...FIELDS.map((k) => i[k]), sec?.title, sec?.short].filter(Boolean).join(' · ');
    looked.set(i, ` ${fold(all).text}`);
  }
  return looked.get(i);
}

// Does instrument i match the query's words and the chosen options (filter id → Set of option ids)?
export function matches(i, ws, chosen = new Map()) {
  for (const f of FILTERS) {
    const set = chosen.get(f.id);
    if (set?.size && !set.has(i[f.id])) return false;
  }
  const hay = haystack(i);
  return ws.every((w) => (Array.isArray(w) ? w : [w]).some((v) => hay.includes(` ${v}`)));
}

// Optimal string alignment distance (Damerau–Levenshtein without repeated edits), stopping at max + 1.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      cur.push(d);
      low = Math.min(low, d);
    }
    if (low > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}

// The query's words with each slip replaced by the word starts it could have meant, over the
// instruments `list`: a word that starts a word of one of them stays as it is; a word of four
// letters or more that starts none becomes the list of the starts of their words that are within
// one edit of it (two from nine letters on). A start is as long as the word, give or take the
// edits, so "harpsicord" stands for "harpsichor" and "harpsichord".
export function correct(ws, list) {
  const hays = list.map(haystack);
  let vocab = null;
  return ws.map((w) => {
    if (w.length < 4 || hays.some((h) => h.includes(` ${w}`))) return w;
    vocab ??= [...new Set(hays.join(' ').split(' ').filter((v) => v.length >= 3))];
    const max = w.length >= 9 ? 2 : 1, near = new Set();
    for (const v of vocab) {
      for (let n = Math.max(1, w.length - max); n <= Math.min(v.length, w.length + max); n++) {
        if (distance(w, v.slice(0, n), max) <= max) near.add(v.slice(0, n));
      }
    }
    return near.size ? [...near] : w;
  });
}
