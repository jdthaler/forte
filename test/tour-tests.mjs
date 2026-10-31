// Guided tour checks (shared/tour.js): every instrument has a tour, its page loads it, and each
// step names views the page has, presets the instrument has, parameters of its contract with
// values in their ranges, and keys it plays.
// Run: node test/tour-tests.mjs

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { INSTRUMENTS } from '../shared/registry.js';
import { presetParams, valid, complete } from '../shared/presets.js';
import { renderMarkdown } from '../shared/markdown.js';
import { midi, note, chord, run, score, length } from '../shared/tour.js';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message.replace(/\n/g, '\n        ')); }
}
const R = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, R), 'utf8');

// the views a page has, as shared/layout.js names them: data-view, or the card's <h2>
function viewsOf(html) {
  const i = html.indexOf('id="views"');
  const out = [];
  if (i < 0) return out;
  const re = /<div class="card"([^>]*)>([\s\S]*?)(?=<div class="card"|<\/section>|<\/main>|$)/g;
  let m;
  const from = html.slice(i);
  while ((m = re.exec(from))) {
    if (/data-control/.test(m[1])) continue;
    const name = /data-view="([^"]*)"/.exec(m[1])?.[1] ?? /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(m[2])?.[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const id = /\bid="([^"]*)"/.exec(m[1])?.[1];
    if (name) out.push({ name, key: id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
  }
  return out;
}

await test('notes: names, chords and runs', () => {
  assert.equal(midi('C4'), 60);
  assert.equal(midi('A4'), 69);
  assert.equal(midi('F#3'), 54);
  assert.equal(midi('Bb2'), 46);
  assert.equal(midi('C-1'), 0);
  assert.equal(midi(61), 61);
  assert.throws(() => midi('H2'));
  assert.deepEqual(chord('C4 E4', { at: 1, dur: 2 }).map((n) => [n.key, n.at, n.dur]), [[60, 1, 2], [64, 1, 2]]);
  const r = run('C4 D4 E4', { at: 1, step: 0.5 });
  assert.deepEqual(r.map((n) => n.at), [1, 1.5, 2]);
  assert.ok(r.every((n) => n.dur < 0.5));
  const step = { play: [note('C4', { at: 2, dur: 3 }), [chord('E4 G4', { dur: 1 })], { at: 1, set: { x: 1 } }] };
  assert.deepEqual(score(step).map((e) => e.at), [0, 0, 1, 2]);
  assert.equal(length(step), 5);
});

const PAGES = [{ id: 'template', dir: 'docs/template/', name: 'Template' }, ...INSTRUMENTS.filter((i) => i.ready).map((i) => ({ id: i.id, dir: `${i.id}/`, name: i.name }))];
for (const P of PAGES) {
  await test(`${P.name}: a guided tour of its physics`, async () => {
    const file = `${P.dir}src/${P.id}-tour.js`;
    assert.ok(existsSync(new URL(file, R)), `no tour: write ${file} (docs/INSTRUMENT_GUIDE.md, "The guided tour")`);
    const html = read(`${P.dir}index.html`);
    assert.ok(html.includes(`<script type="module" src="src/${P.id}-tour.js"></script>`), `${P.dir}index.html doesn't load src/${P.id}-tour.js`);
    const { TOUR } = await import(new URL(file, R));
    const { INSTRUMENT: I } = await import(new URL(`${P.dir}src/${P.id}-instrument.js`, R));
    assert.equal(TOUR.id, P.id, 'the tour names another instrument');
    assert.ok(TOUR.steps.length >= 3 && TOUR.steps.length <= 8, `${TOUR.steps.length} steps (3 to 8)`);
    const params = presetParams(I), byId = new Map(params.map((p) => [p.id, p]));
    const views = viewsOf(html), problems = [];
    const lower = (s) => s.toLowerCase();
    TOUR.steps.forEach((s, i) => {
      const at = `step ${i + 1} (${s.title ?? 'untitled'})`, bad = (m) => problems.push(`${at}: ${m}`);
      if (!s.title || s.title.length > 48) bad('a title of a few words');
      if (!s.text || s.text.length < 80) bad('text saying what to listen for');
      if (s.text?.length > 900) bad(`text of ${s.text.length} characters (900 at most: the card is small)`);
      try { renderMarkdown(s.text ?? ''); } catch (e) { bad(`its Markdown: ${e.message}`); }
      if (i === 0 && !s.views?.length) bad('the first step names the views it shows');
      for (const v of s.views ?? []) if (!views.some((w) => lower(w.name) === lower(v) || w.key === lower(v))) bad(`no view "${v}" (the page has ${views.map((w) => w.name).join(', ')})`);
      const pr = s.preset ? I.presets.find((p) => p.name === s.preset) : null;
      if (s.preset && !pr) bad(`no preset "${s.preset}"`);
      for (const k of Object.keys(pr?.p ?? {})) if (!byId.has(k)) bad(`preset "${s.preset}" sets ${k}, which isn't a contract parameter: use set instead`);
      const sets = [s.set ?? {}, ...score(s).filter((e) => e.set).map((e) => e.set)];
      for (const o of sets) {
        for (const [k, v] of Object.entries(o)) {
          const p = byId.get(k);
          if (!p) bad(`no parameter ${k}`);
          else if (valid(p, v) !== v) bad(`${k} = ${JSON.stringify(v)} is out of its range or not one of its options`);
        }
      }
      // the keys that play: the whole range, or a historical compass until its checkbox opens it
      const vals = complete(params, { ...pr?.p, ...s.set });
      for (const e of score(s)) {
        if (e.set) Object.assign(vals, e.set);
        if (e.key === undefined) {
          if (!e.set && e.pedal === undefined) bad(`an event that is neither a note, a set nor the pedal: ${JSON.stringify(e)}`);
          continue;
        }
        const [lo, hi] = I.compass && !vals[I.compass.param] ? I.compass.keys : I.range ?? [36, 96];
        if (!Number.isInteger(e.key) || e.key < lo || e.key > hi) bad(`key ${e.key} is outside ${lo}–${hi}`);
        if (!(e.at >= 0) || !(e.dur > 0) || !(e.vel > 0 && e.vel <= 1)) bad(`a note needs at ≥ 0, dur > 0 and 0 < vel ≤ 1: ${JSON.stringify(e)}`);
      }
      if (score(s).some((e) => e.pedal !== undefined) && !I.space) bad('the pedal, on an instrument with none');
      if (length(s) > 20) bad(`plays for ${length(s).toFixed(1)} s (20 at most)`);
    });
    assert.ok(!problems.length, problems.join('\n'));
  });
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
