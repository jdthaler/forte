// markdown.js — a small Markdown renderer, so each instrument page can show its
// README (shared/notes.js). It covers what the READMEs use: headings,
// paragraphs, lists (nested, with continuation paragraphs), pipe tables,
// fenced code, inline code, bold, italics and links. A paragraph indented by
// two or more spaces is a display equation and is kept exactly as written.
// All text is escaped; no HTML in the source passes through.
//
//   renderMarkdown(src, { base, skip, idPrefix })
//     → { title, html, sections: [{ id, text }] }
//   base      URL that relative links resolve against (e.g. the file's folder on GitHub)
//   skip      titles of ## sections to leave out (e.g. ['Files'])
//   idPrefix  prefix for heading ids, so they cannot clash with the page's own
//   title is the first # heading (not included in html); sections are the ## headings.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => s.replace(/[&<>"]/g, (c) => ESC[c]);
const indentOf = (l) => l.match(/^ */)[0].length;
const blank = (l) => !l.trim();
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const FENCE = /^ {0,3}```/;
const LIST = /^( {0,3})([*+-]|\d{1,9}[.)])( +|$)/;
const isTableAt = (lines, i) => /^\s*\|/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1]);
// lines that end a paragraph (an ordered list interrupts one only if it starts at 1)
const interrupts = (lines, i) => {
  const l = lines[i], m = l.match(LIST);
  return HEADING.test(l) || FENCE.test(l) || isTableAt(lines, i) || (!!m && m[3] !== '' && (!/\d/.test(m[2]) || /^1\D/.test(m[2])));
};

export function renderMarkdown(src, { base = '', skip = [], idPrefix = '' } = {}) {
  const ctx = { base, idPrefix, ids: new Set(), title: '', sections: [], held: [] };
  const lines = dropSections(src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'), skip);
  const html = blocks(lines, ctx);
  return { title: ctx.title, html, sections: ctx.sections };
}

// Leave out each ## section whose title is in `skip`, up to the next # or ## heading.
function dropSections(lines, skip) {
  if (!skip.length) return lines;
  const out = [];
  let fence = false, skipping = false;
  for (const l of lines) {
    if (FENCE.test(l)) fence = !fence;
    const m = !fence && l.match(HEADING);
    if (m && m[1].length <= 2) skipping = m[1].length === 2 && skip.includes(m[2].trim());
    if (!skipping) out.push(l);
  }
  return out;
}

function blocks(lines, ctx) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }
    let m;
    if ((m = line.match(HEADING))) { out.push(heading(m[1].length, m[2], ctx)); i++; continue; }
    if (FENCE.test(line)) {
      const body = [];
      for (i++; i < lines.length && !FENCE.test(lines[i]); i++) body.push(lines[i]);
      i++; // the closing fence
      out.push(`<pre><code>${esc(dedent(body).join('\n'))}</code></pre>`);
      continue;
    }
    if (isTableAt(lines, i)) { i = table(lines, i, out, ctx); continue; }
    if ((m = line.match(LIST)) && m[3] !== '') { i = list(lines, i, out, ctx); continue; }
    const para = [line];
    for (i++; i < lines.length && !blank(lines[i]) && !interrupts(lines, i); i++) para.push(lines[i]);
    if (para.every((l) => indentOf(l) >= 2)) out.push(`<pre class="eq">${esc(dedent(para).join('\n'))}</pre>`);
    else out.push(`<p>${inline(para.map((l) => l.trim()).join('\n'), ctx)}</p>`);
  }
  return out.join('\n');
}

function dedent(lines) {
  const n = Math.min(...lines.filter((l) => !blank(l)).map(indentOf));
  return lines.map((l) => l.slice(Number.isFinite(n) ? n : 0));
}

function heading(level, text, ctx) {
  if (level === 1 && !ctx.title) { ctx.title = text.replace(/[*_`]/g, ''); return ''; }
  const plain = text.replace(/[*_`]/g, '');
  const slug = `${ctx.idPrefix}${plain.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section'}`;
  let id = slug;
  for (let k = 2; ctx.ids.has(id); k++) id = `${slug}-${k}`;
  ctx.ids.add(id);
  if (level === 2) ctx.sections.push({ id, text: plain });
  return `<h${level} id="${id}">${inline(text, ctx)}</h${level}>`;
}

// Pipe tables: a header row, a |---|:---:| row (alignment), then rows up to a blank line.
function table(lines, i, out, ctx) {
  const cells = (l) => {
    let s = l.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
  };
  const head = cells(lines[i]);
  const align = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : /^:-/.test(c) ? 'left' : ''));
  const td = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c, ctx)}</${tag}>`;
  const rows = [];
  for (i += 2; i < lines.length && !blank(lines[i]) && /\|/.test(lines[i]) && !HEADING.test(lines[i]); i++) {
    const r = cells(lines[i]);
    rows.push(`<tr>${head.map((_, k) => td('td', r[k] ?? '', k)).join('')}</tr>`);
  }
  out.push(`<div class="table"><table><thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`);
  return i;
}

// A list: items with the same kind of marker. An item holds its first line and
// every following line indented as far as its text (blank lines included when
// such a line follows), plus unindented lines that continue its paragraph.
function list(lines, i, out, ctx) {
  const first = lines[i].match(LIST);
  const ordered = /\d/.test(first[2]);
  const items = [];
  let loose = false;
  while (i < lines.length) {
    const m = lines[i].match(LIST);
    if (!m || m[3] === '' || /\d/.test(m[2]) !== ordered) break;
    const w = m[1].length + m[2].length + Math.min(m[3].length, 4);
    const body = [lines[i].slice(w)];
    for (i++; i < lines.length; i++) {
      const l = lines[i];
      if (blank(l)) {
        let j = i;
        while (j < lines.length && blank(lines[j])) j++;
        if (j < lines.length && indentOf(lines[j]) >= w) { body.push(...lines.slice(i, j).map(() => '')); i = j - 1; loose = true; continue; }
        break;
      }
      const marker = l.match(LIST);
      if (indentOf(l) >= w) body.push(l.slice(w));
      else if (marker && marker[3] !== '') break; // the next item
      else if (!blank(body[body.length - 1]) && !interrupts(lines, i)) body.push(l.trim()); // lazy continuation
      else break;
    }
    items.push(body);
    let j = i; // blank lines between items keep the list going
    while (j < lines.length && blank(lines[j])) j++;
    const next = j < lines.length && lines[j].match(LIST);
    if (j > i && next && next[3] !== '' && /\d/.test(next[2]) === ordered) { loose = true; i = j; }
    else if (j > i) break;
  }
  const start = ordered ? parseInt(first[2], 10) : 1;
  const tag = ordered ? 'ol' : 'ul';
  const lis = items.map((b) => {
    let h = blocks(b, ctx);
    if (!loose) h = h.replace(/^<p>([\s\S]*?)<\/p>/, '$1'); // tight list: no paragraph around the text
    return `<li>${h}</li>`;
  });
  out.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>${lis.join('\n')}</${tag}>`);
  return i;
}

// Inline: code spans, links and backslash escapes are set aside first, the rest
// is escaped, then ** and * or _ emphasis. Emphasis cannot start inside a word,
// so E*, F*/F₀ and Φ_ms stay as written. (Set-aside pieces share one list per
// document, since a link's text is rendered by a call of its own.)
function inline(s, ctx) {
  const held = ctx.held;
  const hold = (html) => `\uE000${held.push(html) - 1}\uE001`;
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, __, code) => hold(`<code>${esc(code.replace(/\n/g, ' ').trim())}</code>`));
  s = s.replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/g, (_, url) => hold(link(url, esc(url), ctx)));
  // the destination may contain balanced parentheses, as DOIs often do: 10.1016/0022-460X(83)90…
  s = s.replace(/\[((?:[^[\]]|\[[^\]]*\])+)\]\(\s*<?((?:[^()\s<>]|\([^()\s]*\))+)>?(?:\s+"[^"]*")?\s*\)/g, (_, text, url) => hold(link(url, inline(text, ctx), ctx)));
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!|<>~])/g, (_, c) => hold(esc(c)));
  s = esc(s);
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<![\p{L}\p{N}*\\])\*(?=[^\s*])([\s\S]*?[^\s*])\*(?![\p{L}\p{N}*])/gu, '<em>$1</em>');
  s = s.replace(/(?<![\p{L}\p{N}_\\])_(?=[^\s_])([\s\S]*?[^\s_])_(?![\p{L}\p{N}_])/gu, '<em>$1</em>');
  for (let k = 0; k < 3 && s.includes('\uE000'); k++) s = s.replace(/\uE000(\d+)\uE001/g, (_, n) => held[n]);
  return s;
}

// Absolute http(s) and mailto links open in a new tab; relative ones resolve
// against `base`; anything else (e.g. javascript:) stays plain text.
function link(url, html, ctx) {
  let href;
  try { href = new URL(url, ctx.base || undefined).href; } catch { return html; }
  if (!/^(https?|mailto):/.test(href)) return html;
  return `<a href="${esc(href)}" target="_blank" rel="noopener">${html}</a>`;
}
