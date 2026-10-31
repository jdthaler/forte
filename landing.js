// landing.js — the front page: tabs for the kinds of instrument (from the registry's
// SECTIONS; the URL's #hash remembers the choice), a search box and filter chips (the
// registry's FILTERS, matched by shared/search.js; the URL's ?q=…&vibrates=…&notes=…
// remembers them), instrument cards with demo playback, three overlays (About, All Plugins and
// Credits, also at #about, #plugins and #credits), and a background of standing waves (a
// string's normal modes, slowly beating).

import { INSTRUMENTS, SECTIONS, FILTERS, FORTE_VERSION } from './shared/registry.js';
import { downloadLinks, withPlugins, latestRelease, releaseLine } from './shared/plugins.js';
import { renderMarkdown } from './shared/markdown.js';
import { FIELDS, words, hits, matches } from './shared/search.js';

const $ = (s) => document.querySelector(s);
const attr = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const main = $('#instruments'), cats = $('#cats'), bar = $('#bar'), player = $('#player');
const box = $('#q'), chips = $('#filters'), found = $('#found');
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
const ready = INSTRUMENTS.filter((i) => i.ready);
const sectionOf = (id) => SECTIONS.find((s) => s.id === id);

// The search and the chosen filter options, kept in the URL's query (?q=…&vibrates=strings,air)
const chosen = new Map(FILTERS.map((f) => [f.id, new Set()]));
function readQuery() {
  const u = new URLSearchParams(location.search);
  box.value = u.get('q') ?? '';
  for (const f of FILTERS) {
    const set = chosen.get(f.id);
    set.clear();
    for (const v of (u.get(f.id) ?? '').split(',')) if (f.options.some((o) => o.id === v)) set.add(v);
  }
}
function writeQuery() {
  const u = new URLSearchParams();
  if (box.value.trim()) u.set('q', box.value.trim());
  for (const f of FILTERS) if (chosen.get(f.id).size) u.set(f.id, [...chosen.get(f.id)].join(','));
  const s = u.toString().replace(/%2C/g, ',');
  const url = `${location.pathname}${s ? `?${s}` : ''}${location.hash}`;
  if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', url);
}
const filtering = () => words(box.value).length > 0 || [...chosen.values()].some((s) => s.size);

// The text of a card's field, with what the search matched marked
function marked(s, ws) {
  let out = '', k = 0;
  for (const [a, b] of hits(s, ws)) { out += attr(s.slice(k, a)) + `<mark>${attr(s.slice(a, b))}</mark>`; k = b; }
  return out + attr(s.slice(k));
}

function card(inst) {
  const demo = (examples[inst.id] || [])[0];
  return `
    <article class="card ready" style="--c: ${inst.accent}" data-id="${inst.id}">
      <h3><a class="card-link" href="${inst.id}/" data-f="name">${attr(inst.name)}</a><span class="meta">${inst.plugin?.ready ? `<a class="plug" href="${inst.id}/#plugin" title="Download the ${attr(inst.name)} as a plugin for your DAW">↓ Plugin</a>` : ''}<span class="ver">v${inst.version}</span></span></h3>
      ${inst.after ? `<div class="after">after <span data-f="after">${attr(inst.after)}</span></div>` : ''}
      <p data-f="tagline">${attr(inst.tagline)}</p>
      <div class="tags" data-f="physics">${attr(inst.physics)}</div>
      <div class="actions">
        <a class="play" href="${inst.id}/" tabindex="-1" aria-hidden="true">Play <span>→</span></a>
        ${demo ? `<button type="button" data-src="examples/${inst.id}/${demo.file}" title="${attr(demo.title)}">▶ Listen</button>` : ''}
        <a href="${inst.id}/#about" title="The physics of the ${attr(inst.name)}">How it works</a>
      </div>
    </article>`;
}

// Every section's cards, built once (and again when the demos arrive); the tabs, the search and
// the filters then only hide what they leave out (apply).
function render() {
  if (playing) player.pause();
  main.innerHTML = SECTIONS.map((sec) => {
    const list = INSTRUMENTS.filter((i) => i.section === sec.id);
    const soon = list.filter((i) => !i.ready);
    return `
      <section class="section" id="sec-${sec.id}" data-sec="${sec.id}" aria-labelledby="h-${sec.id}">
        <div class="section-head"><h2 id="h-${sec.id}">${sec.title}</h2><p>${sec.blurb.replace('prior art and credits', '<a href="credits/" data-sheet="credits">prior art and credits</a>')}</p></div>
        <div class="grid">${list.filter((i) => i.ready).map(card).join('')}</div>
        ${soon.length ? `<p class="workshop"><span class="muted">In the workshop:</span> ${soon.map((i) => `<span class="soon" style="--c: ${i.accent}" title="${attr(i.tagline)}">${i.name}</span>`).join(' ')}</p>` : ''}
      </section>`;
  }).join('') + '<p class="none" id="none" hidden></p>';
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
  apply();
}
player.addEventListener('pause', () => { if (playing) { playing.classList.remove('on'); playing.textContent = '▶ Listen'; playing = null; } });
player.addEventListener('ended', () => player.dispatchEvent(new Event('pause')));

function renderTabs(counts, cur) {
  const on = filtering();
  const tab = (id, label, n, title) => `<a href="#${id}" data-cat="${id}" title="${attr(title)}"${id === cur ? ' aria-current="true"' : ''}${on && !n ? ' class="empty"' : ''}>${label}<span class="n">${n}</span></a>`;
  cats.innerHTML = [
    tab(ALL, 'All', counts.all, on ? 'Every instrument that matches' : 'Every instrument'),
    ...SECTIONS.map((s) => tab(s.id, s.short, counts[s.id], s.title)),
  ].join('');
}

// The filter chips, each with how many instruments it would show among the others' choices
function renderChips(ws, cur) {
  const inTab = ready.filter((i) => cur === ALL || i.section === cur);
  chips.innerHTML = FILTERS.map((f) => {
    const others = new Map([...chosen].filter(([k]) => k !== f.id));
    const left = inTab.filter((i) => matches(i, ws, others));
    return `<div class="fgroup" role="group" aria-label="${attr(f.label)}"><span class="flabel">${f.label}</span>${f.options.map((o) => {
      const n = left.filter((i) => i[f.id] === o.id).length, on = chosen.get(f.id).has(o.id);
      return `<button type="button" class="chip${!n && !on ? ' empty' : ''}" data-filter="${f.id}" data-option="${o.id}" aria-pressed="${on}" title="${attr(o.title)}">${attr(o.label)}<span class="n">${n}</span></button>`;
    }).join('')}</div>`;
  }).join('');
}

// Show what the tab, the search and the filters leave in, with the search's words marked
function apply() {
  const cur = current(), ws = words(box.value), on = filtering();
  const hit = new Set(ready.filter((i) => matches(i, ws, chosen)).map((i) => i.id));
  const counts = { all: hit.size };
  for (const s of SECTIONS) counts[s.id] = ready.filter((i) => i.section === s.id && hit.has(i.id)).length;
  renderTabs(counts, cur);
  renderChips(ws, cur);
  let shownCards = 0;
  for (const sec of main.querySelectorAll('section[data-sec]')) {
    const inTab = cur === ALL || sec.dataset.sec === cur;
    let n = 0;
    for (const c of sec.querySelectorAll('.card[data-id]')) {
      const show = inTab && hit.has(c.dataset.id);
      c.hidden = !show;
      if (show) {
        n++;
        const inst = INSTRUMENTS.find((i) => i.id === c.dataset.id);
        for (const el of c.querySelectorAll('[data-f]')) {
          const html = marked(inst[el.dataset.f], ws);
          if (el.innerHTML !== html) el.innerHTML = html;
        }
      } else if (playing && c.contains(playing)) player.pause();
    }
    sec.hidden = !inTab || (on && !n);
    sec.querySelector('.workshop')?.toggleAttribute('hidden', on);
    shownCards += n;
  }
  // what was found, and a way back
  const none = $('#none');
  if (none) {
    none.hidden = !(on && !shownCards);
    if (!none.hidden) {
      const elsewhere = cur !== ALL && counts.all;
      none.innerHTML = elsewhere
        ? `Nothing in ${attr(sectionOf(cur).short)} matches, but ${counts.all} instrument${counts.all > 1 ? 's' : ''} in other sections ${counts.all > 1 ? 'do' : 'does'}. <button type="button" data-go="all">Show ${counts.all > 1 ? 'them' : 'it'}</button>`
        : `No instrument matches${ws.length ? ` “${attr(box.value.trim())}”` : ''}. <button type="button" data-go="clear">Clear the search${[...chosen.values()].some((s) => s.size) ? ' and filters' : ''}</button>`;
    }
  }
  found.hidden = !on || !shownCards; // (with nothing to show, #none says so)
  if (!found.hidden) found.innerHTML = `${shownCards} of ${cur === ALL ? ready.length : ready.filter((i) => i.section === cur).length} instruments <button type="button" data-go="clear">Clear</button>`;
}

// Show every tab, or clear the search and the filters
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-go]');
  if (!b) return;
  if (b.dataset.go === 'all') { history.pushState(null, '', location.pathname + location.search); apply(); return; }
  box.value = '';
  for (const s of chosen.values()) s.clear();
  writeQuery();
  apply();
  box.focus({ preventScroll: true });
});

// When the search or the filters change with the bar stuck to the top of the window, the list
// starts again just under it.
// (measured from the filters, under the bar: a stuck bar's own offsetTop is where it is stuck)
const toTop = () => { const top = $('.filters-wrap').offsetTop - bar.offsetHeight; if (window.scrollY > top) window.scrollTo({ top }); };
box.addEventListener('input', () => { writeQuery(); apply(); toTop(); });
box.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (box.value) { box.value = ''; writeQuery(); apply(); } else box.blur(); e.preventDefault(); }
  if (e.key === 'Enter') {
    e.preventDefault();
    const shownNow = [...main.querySelectorAll('.card[data-id]')].filter((c) => !c.hidden && !c.closest('section').hidden);
    if (shownNow.length === 1) shownNow[0].querySelector('.card-link').click(); // the only one: open it
    else box.blur(); // (puts a phone's keyboard away, to see the list)
  }
});
chips.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-filter]');
  if (!b) return;
  const set = chosen.get(b.dataset.filter), o = b.dataset.option;
  if (set.has(o)) set.delete(o); else set.add(o);
  writeQuery();
  apply();
  toTop();
  chips.querySelector(`[data-filter="${b.dataset.filter}"][data-option="${o}"]`)?.focus({ preventScroll: true });
});
// "/" goes to the search, as on many sites
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  e.preventDefault();
  box.focus();
  box.select();
});

// The tabs change the hash without jumping: if the bar is stuck to the top of the window, the
// new list starts just under it.
cats.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-cat]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const id = a.dataset.cat;
  if (id === current()) return;
  history.pushState(null, '', `${location.pathname}${location.search}${id === ALL ? '' : `#${id}`}`);
  apply();
  toTop();
  cats.querySelector(`[data-cat="${id}"]`)?.focus({ preventScroll: true });
});
window.addEventListener('popstate', () => { readQuery(); apply(); });
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (SHEETS.includes(h)) openSheet(h); else apply();
});

// The overlays: dialogs over the page, each with its hash while it is open.
function openSheet(id) {
  const d = $(`#${id}`);
  if (id === 'credits') loadCredits();
  if (id === 'plugins') showRelease();
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
// and which release they are, on first opening (the site can be newer than its plugins)
let releaseShown = false;
function showRelease() {
  if (releaseShown) return;
  releaseShown = true;
  latestRelease().then((rel) => {
    if (!rel) { releaseShown = false; return; } // try again next time
    const line = $('#plugins .forte-plugin-rel');
    line.innerHTML = releaseLine(rel).html;
    line.hidden = false;
  });
}

// Credits: docs/PRIOR_ART.md, rendered as on credits/ (credits/credits.js), on first opening
const REPO = 'https://github.com/jdthaler/forte/blob/live/';
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
readQuery();
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
