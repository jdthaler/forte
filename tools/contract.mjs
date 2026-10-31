// contract.mjs — what a song saved with a Forte plugin relies on, and whether a change keeps it.
//
// tools/gen-native-params.mjs writes each ported instrument's native/instruments/<slug>/
// <slug>-contract.json from its descriptor: every parameter by id with its kind, range, step,
// scaling and default, the options of a choice in order, and the presets in order. A host saves
// the plugin's state by parameter id (native/plugin/plugin.cpp), keeps automation as VST3's
// normalised values (so a parameter's range is part of it) and the Preset choice by position. So
// a change breaks saved songs when it removes or renames a parameter, changes its kind, range,
// step, scaling or default, removes, renames or moves a choice's option or a preset, or changes a
// preset's values. Adding parameters, options at the end and presets at the end breaks nothing.
//
// From 1.0 on an instrument whose contract breaks needs a major release note (changes/README.md);
// `node tools/release.mjs --check-pr` enforces it, and warns about the breaks before 1.0.
//
// The saved states in native/tests/states/<slug>-<version>.state are what that instrument's
// plugin saved at a release; native/tests/suite-plugin-tests.cpp loads every one into today's
// plugins. They are never rewritten: one that no longer loads is a broken contract (before 1.0,
// delete it and say so in the release note).
//
// Usage: node tools/contract.mjs [<ref>]      the breaks and additions since <ref> (default origin/main)
//        node tools/contract.mjs --save-states  writes a state for each instrument whose version has none

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { byId } from '../shared/registry.js';

const R = new URL('..', import.meta.url);
export const contractPath = (slug) => `native/instruments/${slug}/${slug}-contract.json`;
export const STATES = 'native/tests/states/';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// What changed from one contract to the next: breaks (saved songs change) and additions.
export function compare(before, after) {
  const breaks = [], added = [];
  const now = new Map(after.params.map((p) => [p.id, p]));
  for (const p of before.params) {
    const q = now.get(p.id);
    if (!q) { breaks.push(`parameter ${p.id} is gone`); continue; }
    if (p.kind !== q.kind) { breaks.push(`parameter ${p.id} goes from ${p.kind} to ${q.kind}`); continue; }
    for (const k of ['min', 'max', 'step', 'log', 'def']) {
      if (k in p && !same(p[k], q[k])) breaks.push(`parameter ${p.id}: ${k} goes from ${JSON.stringify(p[k])} to ${JSON.stringify(q[k])}`);
    }
    if (p.options) {
      const kept = p.options.every((o, i) => q.options[i] === o);
      if (!kept) breaks.push(`parameter ${p.id}: its options go from ${p.options.join(', ')} to ${q.options.join(', ')}`);
      else if (q.options.length > p.options.length) added.push(`parameter ${p.id}: options ${q.options.slice(p.options.length).join(', ')}`);
    }
  }
  const had = new Set(before.params.map((p) => p.id));
  for (const q of after.params) if (!had.has(q.id)) added.push(`parameter ${q.id}`);
  before.presets.forEach((pr, i) => {
    const q = after.presets[i];
    if (!q) breaks.push(`preset ${i + 1}, ${pr.name}, is gone`);
    else if (q.name !== pr.name) breaks.push(`preset ${i + 1} goes from ${pr.name} to ${q.name}`);
    else if (!same(pr.values, q.values)) breaks.push(`preset ${pr.name}: its values change`);
  });
  for (const q of after.presets.slice(before.presets.length)) added.push(`preset ${q.name}`);
  return { breaks, added };
}

const git = (...a) => execFileSync('git', a, { cwd: R, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
const atRef = (ref, path) => { try { return JSON.parse(git('show', `${ref}:${path}`)); } catch { return null; } };
const slugsAt = (ref) => git('ls-tree', '--name-only', `${ref}:native/instruments`).split('\n').filter(Boolean);

// Every instrument's changes between two commits (one without a contract at base is new: nothing breaks).
export function changesBetween(base, head) {
  const out = [];
  for (const slug of slugsAt(head)) {
    const a = atRef(base, contractPath(slug)), b = atRef(head, contractPath(slug));
    if (!a || !b) continue;
    const c = compare(a, b);
    if (c.breaks.length || c.added.length) out.push({ slug, ...c });
  }
  return out;
}

// The state the plugin saves (plugin.cpp's save): the header, each parameter's value by id, then
// the Preset choice. Here: the last preset chosen, so the values are not the defaults.
// A value off its step is saved on it, as params.cpp's constrain() rounds it (half away from zero).
export function stateOf(contract, version) {
  const k = contract.presets.length, pr = contract.presets[k - 1];
  const onStep = (p, v) => {
    if (!p.step || v === p.def) return v;
    const x = v / p.step, s = Math.sign(x) * Math.round(Math.abs(x)) * p.step;
    return Math.abs(s - v) > 1e-9 * p.step ? s : v;
  };
  const value = (p, v) => (p.kind === 'choice' ? p.options.indexOf(v) : p.kind === 'toggle' ? (v ? 1 : 0) : onStep(p, v));
  // 17 digits, with the mantissa's trailing zeros dropped (not the exponent's: 1e-10 is not 1e-1)
  const text = (v) => v.toPrecision(17).replace(/\.?0+(?=e|$)/, '');
  const lines = [`forte ${contract.slug} ${version}`];
  for (const p of contract.params) lines.push(`${p.id} ${text(value(p, pr && p.id in pr.values ? pr.values[p.id] : p.def))}`);
  if (k) lines.push(`preset ${k}`);
  return `${lines.join('\n')}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args[0] === '--save-states') {
    mkdirSync(new URL(STATES, R), { recursive: true });
    for (const slug of readdirSync(new URL('native/instruments/', R))) {
      const reg = byId(slug), path = new URL(contractPath(slug), R);
      if (!reg?.ready || !existsSync(path)) continue; // the template has no state to keep
      const file = new URL(`${STATES}${slug}-${reg.version}.state`, R);
      if (existsSync(file)) continue;
      writeFileSync(file, stateOf(JSON.parse(readFileSync(path, 'utf8')), reg.version));
      console.log(`${STATES}${slug}-${reg.version}.state`);
    }
  } else {
    const base = args[0] ?? 'origin/main';
    const changes = changesBetween(base, 'HEAD');
    for (const c of changes) {
      for (const b of c.breaks) console.log(`${c.slug}: breaks: ${b}`);
      for (const a of c.added) console.log(`${c.slug}: adds: ${a}`);
    }
    if (!changes.length) console.log(`no contract changes since ${base}`);
  }
}
