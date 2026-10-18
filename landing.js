// landing.js — the front page: tabs for the four kinds of instrument (from the
// registry's SECTIONS; the URL's #hash remembers the choice), instrument cards
// with demo playback, three overlays (About, All Plugins and Credits, also at
// #about, #plugins and #credits), and a background of standing waves (a
// string's normal modes, slowly beating).

import { INSTRUMENTS, SECTIONS, FORTE_VERSION } from './shared/registry.js';
import { downloadLinks, withPlugins } from './shared/plugins.js';
import { renderMarkdown } from './shared/markdown.js';

const $ = (s) => document.querySelector(s);
const attr = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const main = $('#instruments'), cats = $('#cats'), player = $('#player');
let examples = {};
let playing = null;

const ALL = 'all';
const SHEETS = ['about', 'plugins', 'credits']; // the overlays, by id and hash
let shown = ALL; // the tab, kept while the hash names an overlay
const current = () => {
  const h = location.hash.slice(1);
  if (SHEETS.includes(h)) return shown;
  return (shown = SECTIONS.some((s) => s.id === h) ? h : ALL);
};
const ready = (sec) => INSTRUMENTS.filter((i) => i.section === sec && i.ready);

function renderTabs() {
  const cur = current();
  const tab = (id, label, n, title) => `<a href="#${id}" data-cat="${id}" title="${attr(title)}"${id === cur ? ' aria-current="true"' : ''}>${label}<span class="n">${n}</span></a>`;
  cats.innerHTML = `<div class="cats-inner">${[
    tab(ALL, 'All', INSTRUMENTS.filter((i) => i.ready).length, 'Every instrument'),
    ...SECTIONS.map((s) => tab(s.id, s.short, ready(s.id).length, s.title)),
  ].join('')}</div>`;
}

function card(inst) {
  const demo = (examples[inst.id] || [])[0];
  return `
    <article class="card ready" style="--c: ${inst.accent}">
      <h3><a class="card-link" href="${inst.id}/">${inst.name}</a><span class="ver">v${inst.version}</span></h3>
      ${inst.after ? `<div class="after">after ${inst.after}</div>` : ''}
      <p>${inst.tagline}</p>
      <div class="tags">${inst.physics}</div>
      <div class="actions">
        <a class="play" href="${inst.id}/" tabindex="-1" aria-hidden="true">Play <span>→</span></a>
        ${demo ? `<button type="button" data-src="examples/${inst.id}/${demo.file}" title="${attr(demo.title)}">▶ Listen</button>` : ''}
        <a href="${inst.id}/#about" title="The physics of the ${inst.name}">How it works</a>
        ${inst.plugin?.ready ? `<a href="${inst.id}/#plugin" title="Download the ${inst.name} as a plugin for your DAW">Plugin</a>` : ''}
      </div>
    </article>`;
}

function render() {
  if (playing) player.pause();
  const cur = current();
  renderTabs();
  main.innerHTML = SECTIONS.filter((s) => cur === ALL || s.id === cur).map((sec) => {
    const list = INSTRUMENTS.filter((i) => i.section === sec.id);
    const soon = list.filter((i) => !i.ready);
    return `
      <section class="section" id="sec-${sec.id}" aria-labelledby="h-${sec.id}">
        <div class="section-head"><h2 id="h-${sec.id}">${sec.title}</h2><p>${sec.blurb.replace('prior art and credits', '<a href="credits/" data-sheet="credits">prior art and credits</a>')}</p></div>
        <div class="grid">${list.filter((i) => i.ready).map(card).join('')}</div>
        ${soon.length ? `<p class="workshop"><span class="muted">In the workshop:</span> ${soon.map((i) => `<span class="soon" style="--c: ${i.accent}" title="${attr(i.tagline)}">${i.name}</span>`).join(' ')}</p>` : ''}
      </section>`;
  }).join('');
  for (const b of main.querySelectorAll('button[data-src]')) {
    b.addEventListener('click', () => {
      if (playing === b) { player.pause(); return; }
      if (playing) { playing.classList.remove('on'); playing.textContent = '▶ Listen'; }
      player.src = b.dataset.src;
      player.play().catch(() => {});
      playing = b;
      b.classList.add('on'); b.textContent = '■ Stop';
    });
  }
}
player.addEventListener('pause', () => { if (playing) { playing.classList.remove('on'); playing.textContent = '▶ Listen'; playing = null; } });
player.addEventListener('ended', () => player.dispatchEvent(new Event('pause')));

// The tabs change the hash without jumping: if the bar is stuck to the top of the
// window, the new list starts just under it.
cats.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-cat]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const id = a.dataset.cat;
  if (id === current()) return;
  history.pushState(null, '', id === ALL ? location.pathname + location.search : `#${id}`);
  render();
  const top = cats.offsetTop;
  if (window.scrollY > top) window.scrollTo({ top });
  cats.querySelector(`[data-cat="${id}"]`)?.focus({ preventScroll: true });
});
window.addEventListener('popstate', render);
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (SHEETS.includes(h)) openSheet(h); else render();
});

// The overlays: dialogs over the page, each with its hash while it is open.
function openSheet(id) {
  const d = $(`#${id}`);
  if (id === 'credits') loadCredits();
  for (const o of SHEETS) if (o !== id) $(`#${o}`).close();
  if (!d.open) {
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    d.querySelector('.forte-notes-body').focus({ preventScroll: true });
  }
  if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
}
for (const id of SHEETS) {
  const d = $(`#${id}`);
  d.querySelector('.forte-notes-close').addEventListener('click', () => d.close());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // the backdrop
  d.addEventListener('close', () => { if (location.hash === `#${id}`) history.replaceState(null, '', location.pathname + location.search); });
}
// anything marked data-sheet opens its overlay (a link still works in a new tab)
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-sheet]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  openSheet(a.dataset.sheet);
});

// All Plugins: every instrument ported to C++ in one download from the latest GitHub Release
// (the release-plugins workflow); each instrument's own download is on its page.
$('#plugin-list').textContent = `all ${withPlugins().length} instruments`;
$('#plugins .forte-plugin-get').innerHTML = downloadLinks(); // with each format alone too

// Credits: docs/PRIOR_ART.md, rendered as on credits/ (credits/credits.js), on first opening
const REPO = 'https://github.com/jdthaler/forte/blob/main/';
const credits = $('#credits'), cbody = credits.querySelector('.forte-notes-body');
let creditsLoaded = null;
function loadCredits() {
  creditsLoaded ??= fetch('docs/PRIOR_ART.md')
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((md) => {
      const { html, sections } = renderMarkdown(md, { base: `${REPO}docs/`, idPrefix: 'c-', skip: ['Contents'] });
      cbody.querySelector('.forte-notes-text').innerHTML = html;
      cbody.querySelector('.forte-notes-toc').innerHTML = sections.map((s) => `<a href="#${s.id}">${attr(s.text)}</a>`).join('');
    })
    .catch(() => {
      creditsLoaded = null; // try again next time
      cbody.querySelector('.forte-notes-text').innerHTML = `<p class="forte-notes-status">The credits didn't load. Read them on <a href="${REPO}docs/PRIOR_ART.md">GitHub</a>.</p>`;
    });
}
// the contents' own links (#c-…) scroll within the credits
cbody.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#c-"]');
  if (!a) return;
  e.preventDefault();
  cbody.querySelector(a.getAttribute('href'))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
});

$('#forte-version').textContent = FORTE_VERSION;
$('#about-version').textContent = FORTE_VERSION;
render();
if (SHEETS.includes(location.hash.slice(1))) openSheet(location.hash.slice(1));
fetch('examples/index.json').then((r) => (r.ok ? r.json() : {})).then((j) => { examples = j; render(); }).catch(() => {});

// --- background: the first few modes of a plucked string, drifting ---------
const cv = $('#modes');
const ctx = cv.getContext('2d');
const colors = INSTRUMENTS.map((i) => i.accent);
function frame(t) {
  const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
  if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = r.width, h = r.height;
  ctx.clearRect(0, 0, w, h);
  const s = t / 1000;
  for (let n = 1; n <= 7; n++) {
    const amp = (h * 0.2) / n ** 0.8;
    const y0 = h * (0.12 + 0.11 * n);
    ctx.strokeStyle = colors[(n * 3) % colors.length];
    ctx.globalAlpha = 0.16 + 0.05 * Math.sin(s * 0.3 + n);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const u = x / w;
      // standing wave n with a little stiffness-like stretch and slow beating
      const y = y0 + amp * Math.sin(Math.PI * n * u) * Math.cos(s * (0.6 + 0.15 * n * Math.sqrt(1 + 0.02 * n * n)));
      if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  requestAnimationFrame(frame);
}
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(frame);
