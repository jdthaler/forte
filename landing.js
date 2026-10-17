// landing.js — the front page: tabs for the four kinds of instrument (from the
// registry's SECTIONS; the URL's #hash remembers the choice), instrument cards
// with demo playback, the About dialog, and a background of standing waves
// (a string's normal modes, slowly beating).

import { INSTRUMENTS, SECTIONS, FORTE_VERSION } from './shared/registry.js';

const $ = (s) => document.querySelector(s);
const attr = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const main = $('#instruments'), cats = $('#cats'), player = $('#player');
let examples = {};
let playing = null;

const ALL = 'all';
let shown = ALL; // the tab, kept while the hash is #about or #plugins
const current = () => {
  const h = location.hash.slice(1);
  if (h === 'about' || h === 'plugins') return shown;
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
        <span class="play" aria-hidden="true">Play →</span>
        ${demo ? `<button type="button" data-src="examples/${inst.id}/${demo.file}" title="${attr(demo.title)}">▶ Listen</button>` : ''}
        <a href="${inst.id}/#about" title="The physics of the ${inst.name}">How it works</a>
        ${inst.plugin?.ready ? `<a href="#plugins" title="The ${inst.name} as a plugin for your DAW">Plugin</a>` : ''}
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
        <div class="section-head"><h2 id="h-${sec.id}">${sec.title}</h2><p>${sec.blurb.replace('prior art and credits', '<a href="credits/">prior art and credits</a>')}</p></div>
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
  if (location.hash === '#about') openAbout();
  else if (location.hash === '#plugins') toPlugins();
  else render();
});

// Plugins (also at …/#plugins): the instruments ported to C++, downloaded from the latest
// GitHub Release (the release-plugins workflow). The hash leaves the tabs as they are.
const plugins = INSTRUMENTS.filter((i) => i.ready && i.plugin?.ready);
const names = plugins.map((i) => `the <a href="${i.id}/">${i.name}</a>`);
$('#plugin-list').innerHTML = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? '';
function toPlugins() { $('#plugins').scrollIntoView(); }

// About (also at …/#about)
const about = $('#about');
function openAbout() {
  if (about.open) return;
  if (about.showModal) about.showModal(); else about.setAttribute('open', '');
  about.querySelector('.forte-notes-body').focus({ preventScroll: true });
}
$('#about-open').addEventListener('click', openAbout);
$('#about-close').addEventListener('click', () => about.close());
about.addEventListener('click', (e) => { if (e.target === about) about.close(); }); // the backdrop
about.addEventListener('close', () => { if (location.hash === '#about') history.replaceState(null, '', location.pathname + location.search); });
if (location.hash === '#about') openAbout();

$('#forte-version').textContent = FORTE_VERSION;
$('#about-version').textContent = FORTE_VERSION;
render();
if (location.hash === '#plugins') toPlugins();
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
