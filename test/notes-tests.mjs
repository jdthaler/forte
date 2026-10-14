// How it works checks: shared/markdown.js renders every instrument's README for
// the page's notes (shared/notes.js) without losing or mangling anything.
// Run: node test/notes-tests.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderMarkdown } from '../shared/markdown.js';
import { INSTRUMENTS } from '../shared/registry.js';

let failures = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const R = new URL('../', import.meta.url);
const REPO = 'https://github.com/jdthaler/forte/blob/main/';
const md = (src, o) => renderMarkdown(src, o).html;
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// The tags the renderer writes must nest properly.
function balanced(html) {
  const stack = [];
  for (const [, close, tag] of html.matchAll(/<(\/?)(h[1-6]|p|ul|ol|li|div|table|thead|tbody|tr|th|td|pre|code|strong|em|a)\b[^>]*>/g)) {
    if (!close) stack.push(tag);
    else assert.equal(stack.pop(), tag, `</${tag}> closes <${stack[stack.length] ?? 'nothing'}>`);
  }
  assert.deepEqual(stack, [], 'unclosed tags');
}

console.log('markdown');
test('headings, paragraphs, bold, italics, code and links', () => {
  const h = md('# Title\n\nSome **bold**, *italic*, _also_ and `x*y_z`.\nSee [the guide](docs/a.md) or <https://example.org/>.\n\n## Part two\n\n### Sub', { base: 'https://h.test/r/', idPrefix: 'about-' });
  assert.match(h, /<p>Some <strong>bold<\/strong>, <em>italic<\/em>, <em>also<\/em> and <code>x\*y_z<\/code>\./);
  assert.match(h, /<a href="https:\/\/h\.test\/r\/docs\/a\.md" target="_blank" rel="noopener">the guide<\/a>/);
  assert.match(h, /<a href="https:\/\/example\.org\/"[^>]*>https:\/\/example\.org\/<\/a>/);
  assert.match(h, /<h2 id="about-part-two">Part two<\/h2>/);
  assert.match(h, /<h3 id="about-sub">Sub<\/h3>/);
  assert.ok(!h.includes('Title'), 'the # title is returned separately');
  assert.equal(renderMarkdown('# Title\n\n## A\n\n## A').sections.map((s) => s.id).join(' '), 'a a-2');
});
test('math notation stays as written: E*, F*/F₀, Φ_ms, x_k + ω_k², 2 * 3 * 4', () => {
  for (const s of ['the modulus E* of the pair', 'F*/F₀ = 1.004 and G = F²/(8π a³ E*)', 'modes Φ_ms(r, θ) and J_m', 'ẍ_k + ω_k² x_k', 'so 2 * 3 * 4 = 24']) {
    const h = md(s);
    assert.ok(!/<em>|<strong>/.test(h), `${s} → ${h}`);
    assert.equal(text(h).trim(), s);
  }
});
test('escaped: HTML in the source is shown, never run; no javascript: links', () => {
  const h = md('<script>alert(1)</script> & <b>x</b> [click](javascript:alert(1)) `<i>`');
  assert.ok(!/<script|<b>|<i>|javascript:/.test(h), h);
  assert.match(h, /&lt;script&gt;/);
});
test('lists: nested, numbered, with continuation lines and paragraphs', () => {
  const h = md('1. **One**: a\n   b\n2. Two:\n   * x\n   * y\n     still y\n3. Three\n\n* p\n\n  more of p\n* q');
  assert.match(h, /<ol><li><strong>One<\/strong>: a\nb<\/li>/);
  assert.match(h, /<li>Two:\n<ul><li>x<\/li>\n<li>y\nstill y<\/li><\/ul><\/li>/);
  assert.match(h, /<li>Three<\/li><\/ol>/);
  assert.match(h, /<ul><li><p>p<\/p>\n<p>more of p<\/p><\/li>\n<li><p>q<\/p><\/li><\/ul>/);
  assert.match(md('3. three\n4. four'), /<ol start="3">/);
});
test('tables: alignment, inline markup and escaped pipes in cells', () => {
  const h = md('| a | b |\n|---|--:|\n| `x` | **2** |\n| \\|z\\| | |');
  assert.match(h, /<th>a<\/th><th style="text-align:right">b<\/th>/);
  assert.match(h, /<td><code>x<\/code><\/td><td style="text-align:right"><strong>2<\/strong><\/td>/);
  assert.match(h, /<td>\|z\|<\/td>/);
});
test('an indented paragraph is a display equation, kept exactly', () => {
  const h = md('The modes are\n\n  Φ(r) = J_m(λr) + C I_m(λr),   ω = λ²/τ,\n  with *no* markup\n\nafter.');
  assert.match(h, /<pre class="eq">Φ\(r\) = J_m\(λr\) \+ C I_m\(λr\),   ω = λ²\/τ,\nwith \*no\* markup<\/pre>/);
});
test('fenced code is kept as written; skipped sections are left out', () => {
  assert.match(md('```\n  a  *b*\n```'), /<pre><code>a  \*b\*<\/code><\/pre>/);
  const h = md('## Keep\n\nx\n\n## Files\n\n```\n## not a heading\n```\n\n## Also kept\n\ny', { skip: ['Files'] });
  assert.ok(/Keep/.test(h) && /Also kept/.test(h) && !/Files|not a heading/.test(h), h);
});

console.log('every instrument README');
for (const inst of INSTRUMENTS.filter((i) => i.ready)) {
  test(`${inst.name}: renders whole, with its name as the title`, () => {
    const src = readFileSync(new URL(`${inst.id}/README.md`, R), 'utf8');
    const { title, html, sections } = renderMarkdown(src, { base: `${REPO}${inst.id}/`, skip: ['Files'], idPrefix: 'about-' });
    assert.equal(title, inst.name);
    assert.ok(sections.length >= 2, 'at least two ## sections');
    balanced(html);
    const t = text(html.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<code>[\s\S]*?<\/code>/g, ''));
    assert.ok(!/\*\*|\]\(|```/.test(t), `Markdown left in the text: ${t.match(/.{0,30}(\*\*|\]\(|```).{0,30}/)?.[0]}`);
    const delimiterRows = src.replace(/```[\s\S]*?```/g, '').split('\n').filter((l) => /^\s*\|\s*:?-+:?\s*\|/.test(l)).length;
    assert.equal((html.match(/<table>/g) ?? []).length, delimiterRows, 'every |---| table in the README becomes a table');
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) assert.match(href, /^(https?:|mailto:)/, href);
    for (const table of html.match(/<table>[\s\S]*?<\/table>/g) ?? []) {
      const cols = (table.match(/<th[ >]/g) ?? []).length;
      for (const row of table.match(/<tr>[\s\S]*?<\/tr>/g)) assert.equal((row.match(/<t[hd][ >]/g) ?? []).length, cols, 'ragged table');
    }
  });
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
