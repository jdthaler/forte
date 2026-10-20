// notes.js — "How it works" on every instrument page: the instrument's README,
// rendered in a dialog, so the physics is one tap from the keys, with the
// instrument's version. The button sits next to the page title; a link to
// …/#about opens the notes straight away.
// The README's "Files" section (for developers) is left out; its links point
// at the repository. An instrument with plugins (`plugin.ready`) gets a second dialog, Plugin,
// with their downloads: the ↓ Plugin button by How it works opens it, as does …/#plugin, and on
// phones (no room for that button) a line at the top of the notes. Imported by shared/nav.js.

import { renderMarkdown } from './markdown.js';
import { byId, FORTE_VERSION } from './registry.js';
import { downloadLinks, INSTALL, latestRelease, releaseLine } from './plugins.js';

const REPO = 'https://github.com/jdthaler/forte/blob/live/';
const HASH = '#about';
const root = new URL(document.body.dataset.root ?? '../', location.href);
const here = new URL('.', location.href);
const dir = here.pathname.startsWith(root.pathname) ? here.pathname.slice(root.pathname.length) : ''; // e.g. 'gongs/'
const title = document.querySelector('body > header h1');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let dialog = null, body = null, loaded = null, plugDialog = null;
const inst = byId(document.body.dataset.instrument || '');
const hasPlugin = !!inst?.plugin?.ready;
const name = () => title?.textContent.trim() || 'Notes';

// A dialog with the notes' look: a bar (kicker, title, Close) over a scrolling body. Keys
// pressed in it scroll it instead of playing the instrument; keys already held when it opened
// still let go normally. Closing it takes its hash (if it has one) off the URL. Your presets
// (shared/user-presets.js) use it too.
export function sheet(kicker, id, hash, extra = '') {
  const d = document.createElement('dialog');
  d.className = `forte-notes ${extra}`;
  d.setAttribute('aria-labelledby', id);
  d.innerHTML = `
    <div class="forte-notes-bar">
      <div><span class="forte-notes-kicker">${kicker}</span><span class="forte-notes-ver"></span><h2 id="${id}"></h2></div>
      <button type="button" class="forte-notes-close">Close ✕</button>
    </div>
    <div class="forte-notes-body" tabindex="-1"></div>`;
  d.querySelector(`#${id}`).textContent = name();
  d.querySelector('.forte-notes-close').addEventListener('click', () => d.close());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // the backdrop
  const pressed = new Set();
  d.addEventListener('keydown', (e) => { pressed.add(e.code); e.stopPropagation(); });
  d.addEventListener('keyup', (e) => { if (pressed.delete(e.code)) e.stopPropagation(); });
  d.addEventListener('close', () => {
    pressed.clear();
    if (hash && location.hash === hash) history.replaceState(null, '', location.pathname + location.search);
  });
  document.body.appendChild(d);
  return d;
}
export function show(d, hash) {
  if (!d.open) {
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    d.querySelector('.forte-notes-body').focus({ preventScroll: true });
  }
  if (hash && location.hash !== hash) history.replaceState(null, '', hash);
}

// Plugin: the instrument's plugins, from the latest release (shared/plugins.js), and which one
export function openPlugin() {
  if (!plugDialog) {
    plugDialog = sheet('Plugin', 'forte-plugin-title', '#plugin', 'forte-sheet');
    plugDialog.querySelector('.forte-notes-body').innerHTML = `<section class="forte-plugin">
      <p><b>Play the ${esc(inst.name)} in your DAW:</b> the same physics in C++, as AU, VST3 and CLAP plugins and a standalone app: every format in one download (All), or one alone.</p>
      <div class="forte-plugin-get">${downloadLinks(inst.id)}</div>
      <p class="forte-plugin-more forte-plugin-rel" hidden></p>
      <p class="forte-plugin-more">Free and unsigned: on a Mac, one Terminal command lets them load. <a href="${INSTALL}" target="_blank" rel="noopener">How to install</a> · <a href="${root.href}#plugins">All Plugins</a></p>
    </section>`;
    // which release the downloads are, and whether this version's plugin is still to come
    latestRelease().then((rel) => {
      if (!rel) return;
      const { ok, html } = releaseLine(rel, inst), line = plugDialog.querySelector('.forte-plugin-rel');
      line.innerHTML = html;
      line.hidden = false;
      plugDialog.querySelector('.forte-plugin-get').hidden = !ok;
    });
  }
  dialog?.close();
  show(plugDialog, '#plugin');
}

// on phones, where the ↓ Plugin button doesn't fit, the notes point at the downloads
const pluginLink = () => (hasPlugin
  ? `<p class="forte-notes-plugin"><a href="#plugin">↓ Download the ${esc(inst.name)} as a plugin</a></p>`
  : '');

function build() {
  dialog = sheet('How it works', 'forte-notes-title', HASH);
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
  body.innerHTML = '<p class="forte-notes-status">Loading…</p>';
  // the contents' own links (#about-…) scroll within the notes; #plugin opens the downloads
  body.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    if (a.getAttribute('href') === '#plugin') openPlugin();
    else body.querySelector(a.getAttribute('href'))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

function load() {
  loaded ??= fetch(new URL('README.md', here))
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then((md) => {
      const { html, sections } = renderMarkdown(md, { base: REPO + dir, skip: ['Files'], idPrefix: 'about-' });
      const toc = sections.length > 2
        ? `<nav class="forte-notes-toc" aria-label="Contents">${sections.map((s) => `<a href="#${s.id}">${esc(s.text)}</a>`).join('')}</nav>`
        : '';
      body.innerHTML = `${pluginLink()}${toc}<article class="forte-notes-text">${html}</article>
        <p class="forte-notes-src">These notes are this instrument's <a href="${REPO}${dir}README.md" target="_blank" rel="noopener">README</a>, with its source code.</p>`;
    })
    .catch(() => {
      loaded = null; // try again next time
      body.innerHTML = `${pluginLink()}<p class="forte-notes-status">The notes didn't load. Read them on <a href="${REPO}${dir}README.md" target="_blank" rel="noopener">GitHub</a>.</p>`;
    });
  return loaded;
}

export function openNotes() {
  if (!dialog) build();
  plugDialog?.close();
  show(dialog, HASH);
  return load();
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
  // the plugin's downloads, in their own dialog
  if (hasPlugin) {
    const get = document.createElement('button');
    get.type = 'button';
    get.className = 'forte-about forte-get';
    get.title = `Download the ${inst.name} as a plugin for your DAW`;
    get.setAttribute('aria-label', 'Download the plugin');
    get.innerHTML = '<span class="forte-about-i" aria-hidden="true">↓</span><span class="forte-about-label">Plugin</span>';
    get.addEventListener('click', openPlugin);
    btn.after(get);
  }
  const fromHash = () => {
    if (location.hash === HASH) openNotes();
    else if (location.hash === '#plugin' && hasPlugin) openPlugin();
  };
  fromHash();
  window.addEventListener('hashchange', fromHash);
}
