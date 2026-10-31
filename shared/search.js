// search.js — the front page's search and filters (landing.js), over the registry: which
// instruments a query and the chosen filter options match, and where to mark what matched.
//
// A query matches an instrument when each of its words starts a word somewhere in the
// instrument's name, what it is after, its tagline, its physics or its section, ignoring case
// and accents ("karman" finds Kármán, "rhodes" the Tine Piano). The chosen options match when
// the instrument has one of each filter's chosen options (none chosen: any).

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
export function hits(s, ws) {
  if (!s || !ws.length) return [];
  const { text, at } = fold(s), out = [];
  for (const w of ws) {
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
  return ws.every((w) => hay.includes(` ${w}`));
}
