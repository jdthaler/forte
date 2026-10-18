// gen-native-params.mjs — the C++ parameter and preset tables of an instrument, from its
// JavaScript descriptor (<slug>/src/<slug>-instrument.js), which stays the single source of
// the metadata (docs/PLUGINS.md, step 1). For a ported instrument (one with a
// native/instruments/<slug>/ folder) it writes
//   native/instruments/<slug>/<slug>-params.h   ids, labels, ranges, log scaling, steps, choices,
//                                               defaults, units, presets, keys, pedal, wheel, chain
//   native/instruments/<slug>/<slug>-info.cmake the plugin's name, version, AU subtype and colour
// from the descriptor, shared/registry.js and native/ids.json.
//
// Units: a parameter's JavaScript `fmt` is a function, so its text is inferred by sampling it:
// piecewise "prefix number suffix" segments (ms below a second, s above; a word such as "flat"
// at one end), each number scale·v + offset, scale·log10(v) + offset or scale·10^(−v) + offset,
// written fixed or exponential (1.0e5, or 1.0×10⁵ with a superscript exponent). The report says
// how often the C++ text equals fmt's over the parameter's whole travel.
//
// Usage: node tools/gen-native-params.mjs [slug…]   (no slug: every ported instrument)
//        node tools/gen-native-params.mjs --vectors  (native/tests/format-vectors.h, for the C++ tests)
//        node tools/gen-native-params.mjs --check    (exit 1 if a written file is stale)
//        node tools/gen-native-params.mjs --report [slug…]   (any instrument: the format fit)

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { loadInstrument, paramsOf } from './headless.mjs';
import { INSTRUMENTS, TEMPLATE, FORTE_VERSION, byId } from '../shared/registry.js';
import { PAGE_ONLY } from '../shared/wasm.js'; // parameters only a page uses: the computer keys' velocity

const R = new URL('../', import.meta.url);

const CPP_KEYWORDS = new Set('alignas alignof and asm auto bitand bitor bool break case catch char class compl concept const consteval constexpr constinit const_cast continue default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not nullptr operator or private protected public register reinterpret_cast requires return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while xor count'.split(' '));
const ident = (s) => (CPP_KEYWORDS.has(s) ? `${s}_` : s);
const isIdent = (s) => typeof s === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);

export const portedSlugs = () => (existsSync(new URL('native/instruments/', R))
  ? readdirSync(new URL('native/instruments/', R), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  : []);

// ---- text formats ----------------------------------------------------------------------------

// Parse one fmt output: prefix, the first number (and how it is written), suffix. A second
// figure after the first (" (3.1 beats/s at A4)", " · 30 rpm") is a gloss and is left out; `text`
// is what remains, the text the plugin aims at. With `superscripts`, a number written with a
// superscript exponent (1.0×10⁻⁴) is the one that carries the value, wherever it stands; without,
// the exponent is a unit (10.0 in units of 10⁻⁵, as some pages write the top of a decade).
const NUM = /([+\-−±]?)(\d+(?:\.\d+)?)(?:e([+-]?\d+))?/g;
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUP = /([+\-−±]?)(\d+(?:\.\d+)?)×10([⁺⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)/;
const superscript = (e) => String(e).replace('-', '⁻').replace(/\d/g, (d) => SUPERSCRIPT[d]);
const unsuperscript = (t) => t.replace('⁻', '-').replace('⁺', '').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (d) => SUPERSCRIPT.indexOf(d));
function parse(s, which = 0, superscripts = false) { // which: the number that carries the value (the first, unless it never changes)
  const sup = superscripts && s.match(SUP);
  const m = sup ? [sup[0], sup[1], sup[2], unsuperscript(sup[3])] : [...s.matchAll(NUM)][which];
  if (sup) m.index = sup.index;
  if (!m) return { prefix: s, suffix: '', none: true, text: s };
  let prefix = s.slice(0, m.index), sign = m[1];
  if (sign === '±') { prefix += '±'; sign = ''; }
  let suffix = s.slice(m.index + m[0].length);
  const cut = suffix.search(/ \(| · |, | = | → /);
  if (cut >= 0 && /\d/.test(suffix.slice(cut))) suffix = suffix.slice(0, cut).trimEnd();
  const digits = m[2], decimals = digits.includes('.') ? digits.length - digits.indexOf('.') - 1 : 0;
  const value = Number(digits) * (m[3] !== undefined ? 10 ** Number(m[3]) : 1) * (sign === '-' || sign === '−' ? -1 : 1);
  return { prefix, suffix, value, decimals, exp: m[3] !== undefined, sup: !!sup, plus: sign === '+', minus: sign, text: `${s.slice(0, m.index)}${m[0]}${suffix}` };
}

// The C++ formatValue, in JavaScript (native/core/src/params.cpp): the text of v by its segments.
export function formatBy(segs, v) {
  const s = segs.find((g) => v <= g.upTo) ?? segs[segs.length - 1];
  if (s.decimals < 0) return s.prefix;
  let n = s.scale * (s.log10 ? Math.log10(Math.max(v, 1e-300)) : s.pow10neg ? 10 ** -v : v) + s.offset;
  let body;
  if (s.exp) {
    const [m, e] = Math.abs(n).toExponential(s.decimals).split('e');
    body = s.superscript ? `${m}×10${superscript(Number(e))}` : `${m}e${Number(e)}`;
  } else body = Math.abs(n).toFixed(s.decimals);
  if (!s.exp && Number(body) === 0) n = 0;
  const sign = n < 0 ? (s.unicodeMinus ? '−' : '-') : s.plus ? '+' : '';
  return `${s.prefix}${sign}${body}${s.suffix}`;
}

// Where a parameter's control can be: its whole travel, snapped to its step.
function travel(p, N) {
  const xs = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let v = p.log ? p.min * (p.max / p.min) ** t : p.min + (p.max - p.min) * t;
    if (p.step) v = Math.min(p.max, Math.max(p.min, Math.round(v / p.step) * p.step));
    xs.push(v);
  }
  return xs;
}

// Fit segments to fmt over the parameter's travel; `match` is the share of the travel where
// the plugin's text is fmt's (without its gloss). Below 90 %, a plain number: never a wrong text.
// Superscript exponents are read as exponents only where that writes every text the reading
// as a unit does, and more.
export function inferFormat(p) {
  const a = fitFormat(p, false);
  if (!a.superscripts) return a;
  const b = fitFormat(p, true);
  return b.match > a.match && a.hits.every((hit, i) => !hit || b.hits[i]) ? b : a;
}
function fitFormat(p, sup) {
  // plain: the step's decimals, or three significant figures at the small end (exponential if tiny)
  const small = Math.min(...[p.min, p.max].map(Math.abs).filter((x) => x > 0)), big = Math.max(Math.abs(p.min), Math.abs(p.max));
  const tiny = !p.step && (big < 0.01 || (p.log && small < 1e-3));
  const decimals = tiny ? 2 : p.step ? Math.max(0, Math.min(4, -Math.floor(Math.log10(p.step) + 1e-9)))
    : Math.max(0, Math.min(4, 2 - Math.floor(Math.log10(small || 1))));
  const plain = [{ upTo: Infinity, prefix: '', suffix: '', scale: 1, offset: 0, decimals, log10: false, exp: tiny, plus: false, unicodeMinus: true, pow10neg: false, superscript: false }];
  const fmt = p.fmt ?? ((v) => formatBy(plain, v));
  const vs = [...new Set([...travel(p, 400), p.def])].sort((a, b) => a - b), texts = vs.map((v) => String(fmt(v)));
  const firsts = new Set(texts.map((t) => parse(t).value));
  const which = firsts.size === 1 && new Set(texts).size > 1 && texts.every((t) => [...t.matchAll(NUM)].length > 1) ? 1 : 0;
  const samples = vs.map((v, i) => ({ v, ...parse(texts[i], which, sup) }));
  const key = (x) => (x.none ? `none|${x.prefix}` : `${x.prefix}|${x.suffix}|${x.decimals}|${x.exp}|${x.sup}`);
  const runs = [];
  for (const x of samples) {
    const last = runs[runs.length - 1];
    if (last && last.key === key(x)) last.xs.push(x); else runs.push({ key: key(x), xs: [x] });
  }
  const segs = [];
  const fitRun = (xs, depth) => split(xs, fitModel(xs), depth);
  const okAt = (g, x) => formatBy([{ ...g, upTo: Infinity }], x.v) === x.text;
  const fitModel = (xs) => {
    const x0 = xs[0];
    const base = { prefix: x0.prefix, suffix: x0.suffix, decimals: x0.none ? -1 : x0.decimals, exp: !!x0.exp,
      plus: xs.some((x) => x.plus), unicodeMinus: xs.some((x) => x.minus === '−'), scale: 1, offset: 0, log10: false,
      pow10neg: false, superscript: !!x0.sup };
    if (x0.none) return { ...base, offset: x0.v }; // a word: offset holds the value it stands for
    const cands = [];
    for (const k of [1, 100, 1000, 1e6, 0.001, 1e-6, -1]) cands.push({ ...base, scale: k });
    for (const k of [20, 10]) cands.push({ ...base, scale: k, log10: true });
    for (const [k, c] of [[1, 0], [-1, 1]]) cands.push({ ...base, scale: k, offset: c, pow10neg: true }); // 10^(−v), 1 − 10^(−v)
    const pos = xs.filter((x) => x.v > 0);
    for (const [f, lg, pts, p10] of [[(v) => v, false, xs], [(v) => Math.log10(v), true, pos], [(v) => 10 ** -v, false, xs, true]]) {
      if (pts.length < 2) continue;
      const u = pts.map((x) => f(x.v)), y = pts.map((x) => x.value), m = u.length;
      const su = u.reduce((a, b) => a + b, 0), sy = y.reduce((a, b) => a + b, 0);
      const suu = u.reduce((a, b) => a + b * b, 0), suy = u.reduce((a, b, k) => a + b * y[k], 0), d = m * suu - su * su;
      if (Math.abs(d) > 1e-300) { const a = (m * suy - su * sy) / d; cands.push({ ...base, scale: tidy(a), offset: tidy((sy - a * su) / m), log10: lg, pow10neg: !!p10 }); }
    }
    if (xs.length === 1) cands.push({ ...base, scale: 0, offset: x0.value });
    return cands.reduce((a, b) => (xs.filter((x) => okAt(b, x)).length > xs.filter((x) => okAt(a, x)).length ? b : a));
  };
  // where the best model stops fitting, split and fit the pieces apart
  const split = (xs, best, depth) => {
    const good = xs.map((x) => okAt(best, x));
    if (best.decimals < 0 || good.every(Boolean) || depth > 3) return [{ ...best, xs }];
    const out = [];
    let i = 0;
    while (i < xs.length) {
      let j = i;
      while (j < xs.length && good[j] === good[i]) j++;
      const piece = xs.slice(i, j);
      out.push(...(good[i] ? [{ ...best, xs: piece }] : fitRun(piece, depth + 1)));
      i = j;
    }
    return out;
  };
  for (const r of runs) segs.push(...fitRun(r.xs, 0));
  // each segment ends where fmt stops writing it: found by bisection between the samples on either
  // side, to the last double (so a value written as the next segment's reads back into it)
  const fits = (g, v) => formatBy([{ ...g, upTo: Infinity }], v) === parse(String(fmt(v)), which, sup).text;
  const merged = segs.map((g, i) => {
    const { xs, ...seg } = g;
    if (i + 1 >= segs.length) return { ...seg, upTo: Infinity };
    let a = xs[xs.length - 1].v, b = segs[i + 1].xs[0].v;
    for (let mid = (a + b) / 2; mid > a && mid < b; mid = a + (b - a) / 2) if (fits(seg, mid)) a = mid; else b = mid;
    return { ...seg, upTo: a };
  });
  // where on the travel the plugin's text is fmt's
  const hits = (segments) => travel(p, 1000).map((v) => formatBy(segments, v) === parse(String(fmt(v)), which).text);
  const share = (h) => h.filter(Boolean).length / h.length;
  const h = merged.length <= 12 ? hits(merged) : null, m = h ? share(h) : 0;
  const superscripts = texts.some((t) => SUP.test(t));
  return m >= 0.9 ? { segs: merged, match: m, hits: h, superscripts } : { segs: plain, match: m, plain: true, hits: hits(plain), superscripts };
}
// round a fitted coefficient to the simple number it almost certainly is (100, 1000, 20, 1/60…)
function tidy(x) {
  for (const d of [1, 2, 3, 4, 6, 8, 9, 10, 12, 60, 100, 1000]) {
    const r = Math.round(x * d) / d;
    if (Math.abs(r - x) <= 1e-9 * Math.max(1, Math.abs(x))) return r;
  }
  return x;
}

// ---- the tables -------------------------------------------------------------------------------

const cstr = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const num = (x) => (x === Infinity ? 'kNoLimit' : Number.isInteger(x) ? String(x) : String(x));
const cppNamespace = (slug) => ident(slug.replace(/-/g, '_'));
// a FormatSegment's initializer; the fields after unicodeMinus only when they are set
const segment = (g) => `{${num(g.upTo)}, ${cstr(g.prefix)}, ${cstr(g.suffix)}, ${num(g.scale)}, ${num(g.offset)}, ${g.decimals}, ${g.log10}, ${g.exp}, ${g.plus}, ${g.unicodeMinus}${g.pow10neg || g.superscript ? `, ${!!g.pow10neg}, ${!!g.superscript}` : ''}}`;

// The VST3 class id as Steinberg's validator prints it ("cid = …") → its 16 bytes (clap-wrapper's
// COMPONENT_ID: the first two words byte-swapped as a COM GUID, the rest in order).
export function vst3Bytes(hex) {
  const g = [0, 8, 16, 24].map((i) => parseInt(hex.slice(i, i + 8), 16));
  const b = [g[0] & 0xff, (g[0] >>> 8) & 0xff, (g[0] >>> 16) & 0xff, g[0] >>> 24,
    (g[1] >>> 16) & 0xff, g[1] >>> 24, g[1] & 0xff, (g[1] >>> 8) & 0xff];
  for (const w of [g[2], g[3]]) b.push(w >>> 24, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff);
  return b;
}

export async function generate(slug) {
  const I = await loadInstrument(slug);
  // an instrument not yet in the registry names its plugin in its descriptor (tools/new-instrument.mjs)
  const reg = slug === 'template' ? TEMPLATE : byId(slug) ?? (I.plugin && { name: I.plugin.name, plugin: { code: I.plugin.code }, version: '0.0.0' });
  if (!reg) throw new Error(`${slug} is not in shared/registry.js`);
  const ids = JSON.parse(readFileSync(new URL('native/ids.json', R), 'utf8'));
  if (!ids[slug]) throw new Error(`${slug} has no VST3 class id in native/ids.json`);
  const version = slug === 'template' ? FORTE_VERSION : reg.version ?? '0.0.0';
  const pageOnly = I.pageOnly ?? PAGE_ONLY;
  const params = [];
  for (const g of I.groups) for (const p of g.params) if (!pageOnly.includes(p.id)) params.push({ ...p, group: g.title });
  // a console (the organ's drawbars and switches): state the page keeps in P beside the groups,
  // plugin parameters after them; console.get(P) gives their values
  const consoleIds = new Set();
  for (const g of I.console?.groups ?? []) for (const p of g.params) { params.push({ ...p, group: g.title }); consoleIds.add(p.id); }
  const index = new Map(params.map((p, i) => [p.id, i]));
  const ns = cppNamespace(slug), report = [], out = [];
  const valueOf = (p, v) => {
    if (p.type === 'select') { const k = p.options.findIndex(([x]) => x === v); if (k < 0) throw new Error(`${slug}.${p.id}: ${v} is not an option`); return k; }
    if (p.type === 'checkbox') return v ? 1 : 0;
    return v;
  };
  const w = (s = '') => out.push(s);
  const src = slug === 'template' ? 'docs/template/src/template-instrument.js' : `${slug}/src/${slug}-instrument.js`;
  w(`// ${slug}-params.h — generated by tools/gen-native-params.mjs from ${src},`);
  w('// shared/registry.js and native/ids.json. Do not edit; after changing those, run');
  w(`//   node tools/gen-native-params.mjs ${slug}`);
  w('#pragma once');
  w();
  w('#include <cmath>');
  w();
  w('#include "forte/instrument.h"');
  w();
  w(`namespace forte::${ns} {`);
  w();
  w('namespace p { // parameter indices, in the descriptor\'s order');
  w(`enum : int { ${params.map((p) => ident(p.id)).join(', ')}, count };`);
  w('}');
  w();
  w('constexpr double kNoLimit = INFINITY;');
  for (const p of params) {
    if (p.type === 'select') {
      w(`inline const char *const kChoices_${p.id}[] = {${p.options.map(([, l]) => cstr(l)).join(', ')}};`);
      if (p.options.every(([v]) => isIdent(v))) w(`namespace ${ident(p.id)}_ { enum : int { ${p.options.map(([v]) => ident(v)).join(', ')} }; }`);
    } else if (p.type !== 'checkbox') {
      const { segs, match } = inferFormat(p);
      const { plain } = inferFormat(p);
      report.push({ id: p.id, match, plain, text: [p.min, p.def, p.max].map((v) => formatBy(segs, v)).join(' | ') });
      w(`inline const FormatSegment kFormat_${p.id}[] = {${segs.map(segment).join(', ')}};`);
    }
  }
  w();
  w('inline const ParamInfo kParams[p::count] = {');
  for (const p of params) {
    const kind = p.type === 'select' ? 'choice' : p.type === 'checkbox' ? 'toggle' : 'continuous';
    const [min, max, def, step] = p.type === 'select' ? [0, p.options.length - 1, valueOf(p, p.def), 1]
      : p.type === 'checkbox' ? [0, 1, p.def ? 1 : 0, 1] : [p.min, p.max, p.def, p.step ?? 0];
    const choices = p.type === 'select' ? `kChoices_${p.id}, ${p.options.length}` : 'nullptr, 0';
    const format = p.type === 'select' || p.type === 'checkbox' ? 'nullptr, 0' : `kFormat_${p.id}, ${inferFormat(p).segs.length}`;
    w(`  {${cstr(p.id)}, ${cstr(p.label)}, ${cstr(p.group)}, ParamKind::${kind}, ${num(min)}, ${num(max)}, ${num(def)}, ${num(step)}, ${!!p.log}, ${!!p.perform}, ${choices}, ${format}},`);
  }
  w('};');
  w();
  const skipped = new Set(), consoleFields = Object.keys(I.console?.defaults ?? {});
  // a preset sets the whole console, as the page's (its defaults, then the preset's)
  const presetValues = (pr) => [
    ...Object.entries(pr.p).filter(([id]) => {
      if (index.has(id) && !consoleIds.has(id)) return true;
      if (!pageOnly.includes(id) && !consoleFields.includes(id)) skipped.add(id);
      return false;
    }),
    ...(I.console ? Object.entries(I.console.get({ ...structuredClone(I.console.defaults), ...pr.p })).filter(([id]) => consoleIds.has(id)) : []),
  ];
  I.presets.forEach((pr, k) => {
    const vals = presetValues(pr);
    if (vals.length) w(`inline const PresetValue kPreset${k}[] = {${vals.map(([id, v]) => `{p::${ident(id)}, ${num(valueOf(params[index.get(id)], v))}}`).join(', ')}};`);
  });
  w('inline const Preset kPresets[] = {');
  I.presets.forEach((pr, k) => {
    const n = presetValues(pr).length;
    w(`  {${cstr(pr.name)}, ${n ? `kPreset${k}` : 'nullptr'}, ${n}},`);
  });
  w('};');
  const keep = (I.keep || []).filter((id) => index.has(id));
  w(`inline const uint16_t kKeep[] = {${keep.length ? keep.map((id) => `p::${ident(id)}`).join(', ') : '0'}};`);
  // a controller: a parameter's id, or a switch between two of a choice's values (instrument.h)
  const ccs = Object.entries(I.controllers || {}).filter(([, c]) => index.has(typeof c === 'string' ? c : c.param));
  const controller = ([n, c]) => {
    if (typeof c === 'string') return `{${n}, p::${ident(c)}}`;
    const p = params[index.get(c.param)], [a, b] = (c.values ?? c.toggle).map((v) => valueOf(p, v));
    return `{${n}, p::${ident(c.param)}, Controller::${c.values ? 'values' : 'toggle'}, ${a}, ${b}}`;
  };
  w(`inline const Controller kControllers[] = {${ccs.length ? ccs.map(controller).join(', ') : '{0, -1}'}};`);
  w();
  const ch = I.chain || {}, at = (id) => (id && index.has(id) ? `p::${ident(id)}` : '-1');
  const mw = typeof I.modWheel === 'string' ? { param: I.modWheel } : I.modWheel;
  const mwParam = mw ? params[index.get(mw.param)] : null;
  const [lo, hi] = I.range || [36, 96];
  w('// The plugin\'s description. The port supplies its engine, and midiVelocity when the');
  w(`// descriptor maps MIDI velocity itself (${I.midiVelocity ? 'this one does' : 'this one does not'}).`);
  w('inline InstrumentInfo info(Engine *(*create)(double fs), double (*midiVelocity)(double) = nullptr) {');
  w('  return InstrumentInfo{');
  w(`    .slug = ${cstr(slug)}, .name = ${cstr(reg.name)}, .version = ${cstr(version)},`);
  w(`    .description = ${cstr(reg.tagline ?? '')}, .auSubtype = ${cstr(reg.plugin.code)},`);
  w(`    .vst3Id = {${vst3Bytes(ids[slug].vst3).map((b) => `0x${b.toString(16).padStart(2, '0')}`).join(', ')}},`);
  w(`    .params = kParams, .paramCount = p::count,`);
  w(`    .presets = kPresets, .presetCount = ${I.presets.length},`);
  w(`    .keep = kKeep, .keepCount = ${keep.length},`);
  w(`    .keyLo = ${lo}, .keyHi = ${hi}, .space = Space::${I.space ?? 'none'},`);
  w(`    .modWheel = ${mw ? at(mw.param) : -1}, .modWheelMax = ${mwParam ? num(valueOf(mwParam, mw.max ?? mwParam.max)) : 0},`);
  w(`    .controllers = kControllers, .controllerCount = ${ccs.length},`);
  const body = ch.body ? ` .body = ${at(ch.body.param)}, .bodySeconds = ${num(ch.body.seconds)}, .bodyDry = ${num(ch.body.dry)}, .bodyWet = ${num(ch.body.wet)},` : '';
  const L = ch.limiter || {};
  const lim = ['threshold', 'knee', 'ratio', 'attack', 'release'].filter((k) => k in L).map((k) => ` .limiter${k[0].toUpperCase()}${k.slice(1)} = ${num(L[k])},`).join('');
  w(`    .chain = {.volume = ${at(ch.volume)}, .room = ${at(ch.room)}, .roomSeconds = ${num(ch.roomSeconds ?? 2)}, .roomGain = ${num(ch.roomGain ?? 0.6)}, .tone = ${at(ch.tone)},${body}${lim} .trimDb = ${num(reg.trim ?? 0)}},`);
  w('    .midiVelocity = midiVelocity, .create = create,');
  w('  };');
  w('}');
  w();
  w(`} // namespace forte::${ns}`);
  const cmake = [
    `# ${slug}-info.cmake — generated by tools/gen-native-params.mjs. Do not edit.`,
    `set(FORTE_NAME ${cstr(reg.name)})`,
    `set(FORTE_VERSION ${cstr(version)})`,
    `set(FORTE_AU_SUBTYPE ${cstr(reg.plugin.code)})`,
    `set(FORTE_ACCENT ${cstr(reg.accent ?? '#f0b35a')})`,
    '',
  ].join('\n');
  return { header: `${out.join('\n')}\n`, cmake, report, skipped: [...skipped] };
}

// Test vectors for native/tests: every continuous parameter of every instrument, its segments,
// and the text (formatBy, which the report compares with fmt) at a few values on its travel.
export async function vectors() {
  const out = ['// format-vectors.h — generated by tools/gen-native-params.mjs --vectors. Do not edit.',
    '// For each continuous parameter of every instrument: its text format, and the text the',
    '// JavaScript gives at some values (native/tests/core-tests.cpp checks the C++ agrees).', '#pragma once', '',
    '#include <cmath>', '', '#include "forte/params.h"', '', 'namespace vectors {', 'constexpr double kNoLimit = INFINITY;',
    'struct Case { double v; const char *text; };',
    'struct Vector { const char *name; forte::ParamInfo param; const Case *cases; int count; };', ''];
  const list = [];
  let k = 0;
  for (const slug of ['template', ...INSTRUMENTS.filter((i) => i.ready).map((i) => i.id)]) {
    const I = await loadInstrument(slug);
    for (const g of I.groups) for (const p of g.params) {
      if (p.type) continue;
      const { segs } = inferFormat(p), vs = travel(p, 6);
      out.push(`inline const forte::FormatSegment kF${k}[] = {${segs.map(segment).join(', ')}};`);
      out.push(`inline const Case kC${k}[] = {${[...new Set([...vs, p.def])].map((v) => `{${v}, ${cstr(formatBy(segs, v))}}`).join(', ')}};`);
      list.push(`  {${cstr(`${slug}.${p.id}`)}, {${cstr(p.id)}, "", "", forte::ParamKind::continuous, ${num(p.min)}, ${num(p.max)}, ${num(p.def)}, ${num(p.step ?? 0)}, ${!!p.log}, false, nullptr, 0, kF${k}, ${segs.length}}, kC${k}, ${[...new Set([...vs, p.def])].length}},`);
      k++;
    }
  }
  out.push('', 'inline const Vector kAll[] = {', ...list, '};', '} // namespace vectors', '');
  return out.join('\n');
}

// ---- command line -----------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), check = args.includes('--check'), reportOnly = args.includes('--report');
  let slugs = args.filter((a) => !a.startsWith('--'));
  if (!slugs.length) slugs = reportOnly ? ['template', ...INSTRUMENTS.filter((i) => i.ready).map((i) => i.id)] : portedSlugs();
  let stale = 0;
  if (args.includes('--vectors') || check) { // the C++ tests' vectors (native/tests/format-vectors.h)
    const url = new URL('native/tests/format-vectors.h', R), text = await vectors();
    if (!existsSync(url) || readFileSync(url, 'utf8') !== text) {
      if (check) { stale++; console.error('stale: native/tests/format-vectors.h (run node tools/gen-native-params.mjs --vectors)'); }
      else { writeFileSync(url, text); console.log('native/tests/format-vectors.h'); }
    }
    if (!check) slugs = slugs.filter(() => args.some((a) => !a.startsWith('--')));
  }
  for (const slug of slugs) {
    const { header, cmake, report, skipped } = await generate(slug);
    if (reportOnly) {
      for (const r of report) if (r.match < 0.98 || r.plain) console.log(`${slug}.${r.id}: ${r.plain ? 'a plain number' : 'its text'} (${r.text}); fmt fits ${(100 * r.match).toFixed(1)} % of the travel`);
      if (skipped.length) console.log(`${slug}: presets set ${skipped.join(', ')}, which are not parameters`);
      continue;
    }
    const dir = new URL(`native/instruments/${slug}/`, R);
    if (!existsSync(dir)) { console.error(`${slug}: no native/instruments/${slug}/ (not ported); use --report`); process.exitCode = 1; continue; }
    for (const [file, text] of [[`${slug}-params.h`, header], [`${slug}-info.cmake`, cmake]]) {
      const url = new URL(file, dir), old = existsSync(url) ? readFileSync(url, 'utf8') : null;
      if (old === text) continue;
      if (check) { stale++; console.error(`stale: native/instruments/${slug}/${file} (run node tools/gen-native-params.mjs ${slug})`); }
      else { writeFileSync(url, text); console.log(`native/instruments/${slug}/${file}`); }
    }
  }
  if (stale) process.exit(1);
}
