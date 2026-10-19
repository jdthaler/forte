// presets.js — the format of your own presets and of a shared link, the same on the site and in
// the plugins (native/plugin/presets.cpp reads and writes it too). No DOM: the tests use it in
// Node; shared/user-presets.js is the pages' menu and dialog on top of it.
//
// A preset is the instrument's parameters as its contract has them (<slug>-contract.json,
// tools/contract.mjs): by parameter id, a number, a choice's option key, or a toggle's true or
// false. The contract promises from 1.0 that these ids, ranges and options keep meaning the same
// sound, so a preset saved today keeps working; an id an instrument no longer has is ignored and
// a parameter a preset doesn't name takes its default. The parameters are nativeParams(I)
// (shared/wasm.js): the descriptor's, less the page-only ones (the computer keys' velocity), then
// its console's (the organ's drawbars and switches).
//
// A preset file (.json), one preset or many:
//   { "forte": "presets", "format": 1, "instrument": "gongs", "instrumentVersion": "0.4.1",
//     "presets": [{ "name": "Dark tam-tam", "values": { "thick": 0.004, "material": "bronze", … } }] }
// format: this layout's version (FORMAT), so a later one can be read and migrated;
// instrumentVersion: the instrument's version that saved it (for a migration after a major one).
//
// A shared link carries the parameters that differ from the defaults in the page's fragment:
//   https://forte.jthaler.net/gongs/#_v=1&_n=Dark%20tam-tam&thick=0.004&strike=0.3
// _v is FORMAT, _n the preset's name (optional). Opening it gives every other parameter its
// default. Numbers keep six significant figures; a toggle is 1 or 0.

import { nativeParams } from './wasm.js';

export const FORMAT = 1;
export const KIND = 'presets';
export const presetParams = (I) => nativeParams(I);

// a value as the contract has it, or the parameter's default when it isn't one of its values
export function valid(p, v) {
  if (p.type === 'select') {
    const o = p.options.find(([k]) => k === v) ?? p.options.find(([k]) => String(k) === String(v));
    return o ? o[0] : p.def;
  }
  if (p.type === 'checkbox') return typeof v === 'boolean' ? v : v === 1 || v === 0 ? v === 1 : p.def;
  if (typeof v === 'string' && v.trim() !== '') v = Number(v);
  if (typeof v !== 'number' || !Number.isFinite(v)) return p.def;
  return Math.min(p.max, Math.max(p.min, v));
}

// every parameter: the given value where there is a valid one, else the default
export function complete(params, values = {}) {
  return Object.fromEntries(params.map((p) => [p.id, values && Object.hasOwn(values, p.id) ? valid(p, values[p.id]) : p.def]));
}

// the parameters' values from a page's P (only those the contract has)
export const pick = (params, P) => complete(params, Object.fromEntries(params.filter((p) => Object.hasOwn(P, p.id)).map((p) => [p.id, P[p.id]])));

export const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

// a preset file's text, for presets [{ name, values }]
export function presetFile(I, version, presets) {
  const params = presetParams(I);
  return `${JSON.stringify({
    forte: KIND, format: FORMAT, instrument: I.id, instrumentVersion: version || '',
    presets: presets.map((pr) => ({ name: cleanName(pr.name), values: complete(params, pr.values) })),
  }, null, 2)}\n`;
}

// A preset file's presets, each complete: { presets: [{ name, values }], warning? }. Throws an
// Error saying what is wrong when the text is not a preset file for this instrument. `names`
// maps an instrument's id to its name, for the message about a file for another instrument.
export function readPresetFile(text, I, names = {}) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('This file is not a Forte preset file (it is not JSON).'); }
  if (!d || typeof d !== 'object' || d.forte !== KIND || !Array.isArray(d.presets)) throw new Error('This file is not a Forte preset file.');
  if (d.instrument !== I.id) throw new Error(`These presets are for the ${names[d.instrument] ?? d.instrument ?? 'another instrument'}.`);
  const params = presetParams(I);
  const presets = d.presets
    .filter((pr) => pr && typeof pr === 'object' && pr.values && typeof pr.values === 'object')
    .map((pr, i) => ({ name: cleanName(pr.name) || `Preset ${i + 1}`, values: complete(params, pr.values) }));
  if (!presets.length) throw new Error('This preset file holds no presets.');
  const warning = Number(d.format) > FORMAT ? 'These presets come from a newer Forte: some settings may be left out.' : undefined;
  return { presets, warning };
}

// ---- shared links -------------------------------------------------------------------------------
const num = (v) => String(Number(v.toPrecision(6)));
const same = (p, a, b) => (typeof a === 'number' && typeof b === 'number' ? num(a) === num(b) : a === b);

// the fragment ('#_v=1&…') of a link to these values
export function linkHash(params, values, name = '') {
  const q = new URLSearchParams();
  q.set('_v', String(FORMAT));
  if (cleanName(name)) q.set('_n', cleanName(name));
  for (const p of params) {
    const v = valid(p, values[p.id]);
    if (same(p, v, p.def)) continue;
    q.set(p.id, p.type === 'checkbox' ? (v ? '1' : '0') : p.type === 'select' ? String(v) : num(v));
  }
  return `#${q.toString()}`;
}

// A link's fragment read back: { name, values (complete) }, or null when it is not one
export function readLinkHash(hash, params) {
  const h = String(hash ?? '').replace(/^#/, '');
  if (!/^_v=\d+(&|$)/.test(h)) return null;
  const q = new URLSearchParams(h);
  const given = {};
  for (const p of params) {
    if (!q.has(p.id)) continue;
    const s = q.get(p.id);
    given[p.id] = p.type === 'checkbox' ? s === '1' || s === 'true' : s;
  }
  return { name: cleanName(q.get('_n')), values: complete(params, given) };
}
