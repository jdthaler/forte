// notes.js — "How it works" on every instrument page: the instrument's README,
// rendered in a dialog, so the physics is one tap from the keys, with the
// instrument's version. The button sits next to the page title; a link to
// …/#about opens the notes straight away.
// The README's "Files" section (for developers) is left out; its links point
// at the repository. Imported by shared/nav.js.

import { renderMarkdown } from './markdown.js';
import { byId, FORTE_VERSION } from './registry.js';

const REPO = 'https://github.com/jdthaler/forte/blob/main/';
const HASH = '#about';
const root = new URL(document.body.dataset.root ?? '../', location.href);
const here = new URL('.', location.href);
const dir = here.pathname.startsWith(root.pathname) ? here.pathname.slice(root.pathname.length) : ''; // e.g. 'gongs/'
const title = document.querySelector('body > header h1');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let dialog = null, body = null, loaded = null;

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'forte-notes';
  dialog.setAttribute('aria-labelledby', 'forte-notes-title');
  dialog.innerHTML = `
    <div class="forte-notes-bar">
      <div><span class="forte-notes-kicker">How it works</span><span class="forte-notes-ver"></span><h2 id="forte-notes-title"></h2></div>
      <button type="button" class="forte-notes-close">Close ✕</button>
    </div>
    <div class="forte-notes-body" tabindex="-1"><p class="forte-notes-status">Loading…</p></div>`;
  dialog.querySelector('#forte-notes-title').textContent = title?.textContent.trim() || 'Notes';
  const inst = byId(document.body.dataset.instrument || '');
  if (inst?.version) {
    const v = document.createElement('a');
    v.className = 'forte-version';
    v.href = `${REPO}CHANGELOG.md`;
    v.target = '_blank'; v.rel = 'noopener';
    v.textContent = `v${inst.version}`;
    v.title = `${inst.name} ${inst.version} · Forte ${FORTE_VERSION} — changelog`;
    dialog.querySelector('.forte-notes-ver').append(v);
  }
  body = dialog.querySelector('.forte-notes-body');
  dialog.querySelector('.forte-notes-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // the backdrop
  // Keys pressed while reading scroll the notes instead of playing the instrument;
  // keys already held when the notes opened still let go normally.
  const pressed = new Set();
  dialog.addEventListener('keydown', (e) => { pressed.add(e.code); e.stopPropagation(); });
  dialog.addEventListener('keyup', (e) => { if (pressed.delete(e.code)) e.stopPropagation(); });
  dialog.addEventListener('close', () => {
    pressed.clear();
    if (location.hash === HASH) history.replaceState(null, '', location.pathname + location.search);
  });
  // the contents' own links (#about-…) scroll within the notes
  body.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    body.querySelector(a.getAttribute('href'))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  document.body.appendChild(dialog);
}

function load() {
  loaded ??= fetch(new URL('README.md', here))
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then((md) => {
      const { html, sections } = renderMarkdown(md, { base: REPO + dir, skip: ['Files'], idPrefix: 'about-' });
      const toc = sections.length > 2
        ? `<nav class="forte-notes-toc" aria-label="Contents">${sections.map((s) => `<a href="#${s.id}">${esc(s.text)}</a>`).join('')}</nav>`
        : '';
      body.innerHTML = `${toc}<article class="forte-notes-text">${html}</article>
        <p class="forte-notes-src">These notes are this instrument's <a href="${REPO}${dir}README.md" target="_blank" rel="noopener">README</a>, with its source code.</p>`;
    })
    .catch(() => {
      loaded = null; // try again next time
      body.innerHTML = `<p class="forte-notes-status">The notes didn't load. Read them on <a href="${REPO}${dir}README.md" target="_blank" rel="noopener">GitHub</a>.</p>`;
    });
  return loaded;
}

export function openNotes() {
  if (!dialog) build();
  if (!dialog.open) {
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    body.focus({ preventScroll: true });
  }
  if (location.hash !== HASH) history.replaceState(null, '', HASH);
  load();
}

if (title) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'forte-about';
  btn.title = 'The physics of this instrument';
  btn.setAttribute('aria-label', 'How it works');
  btn.innerHTML = '<span class="forte-about-i" aria-hidden="true">i</span><span class="forte-about-label">How it works</span>';
  btn.addEventListener('click', openNotes);
  title.after(btn);
  if (location.hash === HASH) openNotes();
}
