// layout.js — the layout of every instrument page, the same on a phone, a tablet
// and a desktop. Top to bottom:
//   header    the instrument's name, which is also the menu (shared/nav.js); How it
//             works; audio, MIDI and Panic;
//   views     a bar, then the pictures only, the ones turned on sharing the space in rows.
//             The bar has a toggle for each view (a tap turns it on or off: at first the
//             main views, cards marked data-perform, are on and the rest off), then its
//             tools (Discover | Perform) and a button that folds the views away;
//   controls  a bar, then the Controls panel (#controls: any control surface a page marks
//             data-control, such as the organ's drawbars, then the groups, side by side).
//             The bar has a toggle for each surface and group of controls (all on at first),
//             then its tools (the presets, with "Default settings", which stands in for
//             the page's Reset button) and a button that folds the panel away. Its top
//             edge is a handle: dragged, it shares the height between the views and the
//             controls, down to nothing for either (the bars stay);
//   footer    the keyboard bar (⌨ for the page's computer-keyboard and MIDI hints, key size, ◀ an
//             overview of the whole range ▶, the few small controls you reach for mid-phrase,
//             marked `strip: true` (which the page gives data-perform): the volume, the
//             computer keys' velocity, a pedal; then the pedal button) and the
//             keys: as many as fit the width at the chosen key size.
// A phone has no room to share: there the page scrolls, the views above the controls, and
// the controls' bar sticks above the keys; its chevron scrolls the controls up into view.
// Explanations wait behind ⓘ buttons: a parameter's hint, a view's caption.
// Discover shows the toggles and every explanation. Perform is for playing and for a
// projector: the views turned on fill the screen with no toggles, no Controls panel
// until More controls, and no text in them
// (no titles, readouts, captions, legends or tables, and nothing drawn by fillText on
// their canvases; a card with data-keep-text keeps its own). The mode is the same on
// every page, and so is how the height is shared; everything else, what's turned on among
// it, is remembered per instrument. In Perform the controls' bar gives the views its room: the
// presets and More controls (its chevron) move to the keyboard bar's end, and back in Discover.
// Also handles iOS audio quirks, and keeps the screen awake in Perform while audio runs. Imported by
// shared/nav.js, so it runs before the page's own scripts. Other code can add its own
// tools to either bar: barTools('views') or barTools('controls').

const body = document.body;
const STORE = `forte/${body.dataset.instrument || 'page'}/layout/v1`;
const MODE = 'forte/mode/v1';
const touch = matchMedia('(pointer: coarse)').matches;
const phoneQuery = matchMedia('(max-width: 600px), (max-width: 1050px) and (max-height: 500px)'); // as shared/layout.css
const sidewaysQuery = matchMedia('(max-width: 1050px) and (max-height: 500px)'); // a phone held sideways, as layout.css
const SIZES = ['s', 'm', 'l', 'xl'];
const KEY_W = { s: 22, m: 30, l: 42, xl: 56 }; // the narrowest a white key may be, px
if (!navigator.requestMIDIAccess) body.classList.add('no-midi'); // Safari, and every browser on iPhone and iPad: no MIDI button (About Forte says where MIDI works)
const prefs = (() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { /* corrupt */ }
  const bool = (v, d) => (typeof v === 'boolean' ? v : d);
  const flags = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, v]) => typeof v === 'boolean'));
  return { // keep only well-formed stored values
    perform: { controls: bool(s.perform?.controls, false) }, // the controls panel in Perform (More controls)
    views: flags(s.views), // each view turned on or off; the rest as the page has them
    groups: flags(s.groups), // each group of controls turned on or off; the rest on
    kb: SIZES.includes(s.kb) ? s.kb : touch ? 'l' : 'm',
    start: Number.isInteger(s.start) ? s.start : null, // the first key shown
  };
})();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch { /* storage unavailable */ } };
let mode = (() => { try { return localStorage.getItem(MODE) === 'perform' ? 'perform' : 'discover'; } catch { return 'discover'; } })();
const performing = () => mode === 'perform';
// The views' share of the height the views and the controls have between them, on every page:
// 0 folds the views away, 1 the controls; `open` is the share to go back to from either.
const SPLIT = 'forte/split/v1', SHARE = 0.6;
const split = (() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SPLIT) || '{}') || {}; } catch { /* corrupt */ }
  const share = (v, d, ends) => (Number.isFinite(v) && v >= 0 && v <= 1 && (ends || (v > 0 && v < 1)) ? v : d);
  return { views: share(s.views, SHARE, true), open: share(s.open, SHARE, false) };
})();
const saveSplit = () => { try { localStorage.setItem(SPLIT, JSON.stringify(split)); } catch { /* storage unavailable */ } };

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function button(text, title) { const b = el('button', '', text); b.type = 'button'; if (title) b.title = title; return b; }
function infoButton(label) {
  const b = button('i');
  b.className = 'forte-info';
  b.setAttribute('aria-label', label);
  b.setAttribute('aria-expanded', 'false');
  return b;
}

const header = document.querySelector('body > header');
const mainEl = document.querySelector('body > main');
const sidebar = document.querySelector('#controls');
const footer = document.querySelector('body > footer');
const viewsEl = document.querySelector('#views');

// ---------------------------------------------------------------------------
// the bars: one heads the views and one the controls. Each has its toggles (which take what
// room is left, wrapping, or on a phone sliding sideways), then its tools, then a button
// that folds its panel away.

const CHEVRON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6 8 10.5 12.5 6"/></svg>';
function makeBar(kind, label, aria, panel) {
  const bar = el('div', `forte-bar forte-${kind}-bar`);
  const toggles = el('div', 'forte-toggles'), row = el('div', `forte-${kind === 'views' ? 'view' : 'control'}-toggles`);
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', aria);
  row.appendChild(el('span', 'forte-toggles-label', label));
  toggles.appendChild(row);
  const tools = el('div', 'forte-bar-tools');
  const fold = button('');
  fold.className = 'forte-fold';
  fold.innerHTML = CHEVRON;
  fold.setAttribute('aria-controls', panel.id);
  bar.append(toggles, tools, fold);
  panel.before(bar);
  return { bar, row, tools, fold };
}
const bars = {};
export function barTools(kind) { return bars[kind]?.tools ?? null; }

// ---------------------------------------------------------------------------
// views: a toggle for each view in the views' bar, and the views turned on, in a grid

const cards = viewsEl ? [...viewsEl.querySelectorAll('.card')] : [];
const surfaces = cards.filter((c) => c.hasAttribute('data-control')); // controls, not views
let shown = cards.filter((c) => !surfaces.includes(c));
let main = shown.filter((c) => c.hasAttribute('data-perform'));
if (!main.length) main = shown.filter((c) => c.querySelector('canvas')).slice(0, 2);
shown = [...main, ...shown.filter((c) => !main.includes(c))]; // the main ones first
const viewName = (c, i) => c.dataset.view || c.querySelector('h2')?.textContent.trim() || `View ${i + 1}`;
const viewKey = (c, i) => c.id || viewName(c, i).toLowerCase().replace(/[^a-z0-9]+/g, '-');
// the key once, from the page as written: a title changes (its note, its ⓘ), the key mustn't
const views = shown.map((card, i) => { const key = viewKey(card, i); return { card, key, on: () => prefs.views[key] ?? main.includes(card) }; });
let stage = null, hint = null;
if (viewsEl && shown.length && mainEl) {
  bars.views = makeBar('views', 'Views', 'Views to show', viewsEl);
  for (const v of views) {
    v.toggle = button(viewName(v.card, 0), 'Show or hide this view');
    v.toggle.addEventListener('click', () => { prefs.views[v.key] = !v.on(); save(); apply(); v.toggle.blur(); });
    bars.views.row.appendChild(v.toggle);
  }
  stage = el('div', 'forte-stage');
  hint = el('p', 'forte-no-view', 'Every view is off: turn one on above.');
  stage.append(...shown, hint);
  viewsEl.replaceChildren(stage);
}
// The views turned on fill the stage in rows, as even as they go: the first rows take the
// extra one, and a short last row stretches across. As many abreast (up to four) as gives
// each the most room, so a short stage puts them side by side and a tall one stacks them;
// on a phone, where the page scrolls, one above another (two abreast in landscape).
const tall = matchMedia('(orientation: portrait)');
const GAP = 12, ASPECT = 1.6, NARROWEST = 260; // the stage's gap; a view's shape, and its narrowest, px
function columns(n) {
  if (phoneQuery.matches) return tall.matches ? 1 : Math.min(n, 2);
  const W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H) return null; // folded away: as it was
  let best = 1, room = 0;
  for (let c = 1; c <= Math.min(n, 4); c++) {
    const r = Math.ceil(n / c), w = (W - GAP * (c - 1)) / c, h = (H - GAP * (r - 1)) / r;
    if (c > 1 && w < NARROWEST) break;
    const fit = Math.min(w / ASPECT, h); // the largest view of that shape the cell holds
    if (fit > room + 1) { room = fit; best = c; }
  }
  return best;
}
let cols = 1;
function arrange() {
  if (!stage) return;
  const on = views.filter((v) => v.on()), n = on.length;
  cols = columns(n) ?? cols;
  const rows = Math.ceil(n / Math.max(1, Math.min(cols, n)));
  let i = 0;
  for (let r = 0; r < rows; r++) {
    const k = Math.ceil((n - i) / (rows - r)); // views in this row
    for (let j = 0; j < k; j++, i++) on[i].card.style.gridColumn = `span ${12 / k}`;
  }
  for (const v of views) {
    v.card.hidden = !v.on();
    v.toggle.setAttribute('aria-pressed', String(v.on()));
  }
  stage.style.setProperty('--rows', rows);
  hint.hidden = n > 0;
}

// The groups of controls in the Controls panel (the page builds them, maybe after this runs,
// so each gets its toggle once it has its parameters). A group whose parameters have all moved
// above the keys has none. The groups start on; folding a group gives way to its toggle.
const groups = [];
let groupHint = null;
if (sidebar && mainEl) {
  bars.controls = makeBar('controls', 'Controls', 'Controls to show', sidebar);
  // the views first in the page's order too, as on screen: Tab and screen readers reach them before the controls
  if (bars.views && viewsEl.parentElement === bars.controls.bar.parentElement) bars.controls.bar.before(bars.views.bar, viewsEl);
  groupHint = el('p', 'forte-no-view', 'Every group of controls is off: turn one on above.');
  groupHint.hidden = true;
  sidebar.prepend(groupHint);
}
// A control surface (the organ's drawbars) comes first among the groups, two columns wide, with
// a toggle of its own.
if (bars.controls && surfaces.length) {
  const at = sidebar.querySelector('#groups');
  for (const s of [...surfaces].reverse()) {
    s.classList.add('forte-surface');
    if (at) at.prepend(s); else sidebar.appendChild(s);
  }
}
function addGroups() {
  if (!bars.controls) return;
  for (const det of sidebar.querySelectorAll('.forte-surface:not([data-key]), details.group:not([data-key])')) {
    const surface = det.classList.contains('forte-surface');
    if (!surface && !det.querySelector('.param')) continue;
    const sum = det.querySelector('summary'), name = (surface ? det.dataset.view : sum?.textContent.trim()) || `Controls ${groups.length + 1}`;
    const key = det.dataset.key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    sum?.addEventListener('click', (e) => e.preventDefault());
    const g = { det, key, on: () => prefs.groups[key] ?? true, toggle: button(name, 'Show or hide these controls') };
    g.toggle.addEventListener('click', () => { prefs.groups[key] = !g.on(); save(); apply(); g.toggle.blur(); });
    bars.controls.row.appendChild(g.toggle);
    groups.push(g);
  }
  for (const g of groups) {
    if (g.det.tagName === 'DETAILS') g.det.open = true;
    g.det.hidden = !g.on();
    g.toggle.setAttribute('aria-pressed', String(g.on()));
  }
  if (groupHint) groupHint.hidden = !groups.length || groups.some((g) => g.on());
}
// a view's caption waits behind ⓘ in its title
for (const c of shown) {
  const h2 = c.querySelector('.card-head h2') || c.querySelector('h2');
  if (!h2 || !c.querySelector('.caption')) continue;
  const b = infoButton(`What ${viewName(c, 0)} shows`);
  b.addEventListener('click', () => { b.setAttribute('aria-expanded', String(c.classList.toggle('notes-open'))); b.blur(); });
  h2.appendChild(b);
  c.classList.add('has-notes');
}

// In Perform the views carry no text, including what their canvases draw: fillText and
// strokeText do nothing on a canvas in #views, unless its card has data-keep-text.
const quiet = new WeakMap();
const silenced = (cv) => {
  if (!quiet.has(cv)) quiet.set(cv, !!cv?.closest?.('#views') && !cv.closest('[data-keep-text]'));
  return quiet.get(cv);
};
for (const name of ['fillText', 'strokeText']) {
  const proto = window.CanvasRenderingContext2D?.prototype, draw = proto?.[name];
  if (draw) proto[name] = function (...args) { if (!(performing() && silenced(this.canvas))) draw.apply(this, args); };
}

// ---------------------------------------------------------------------------
// sharing the height: the views' share, as shown. In Discover it is the one chosen; in Perform
// the views fill the room until More controls, which opens the panel at the share last chosen
// short of either end (on a phone, in place of the views).

function share() {
  if (!bars.controls) return 1;
  if (!bars.views) return 0;
  if (performing()) return !prefs.perform.controls ? 1 : phoneQuery.matches ? 0 : split.views > 0 && split.views < 1 ? split.views : split.open;
  return groups.length ? split.views : 1;
}
// what the handle and the fold buttons do: only in Discover, with both bars
const sharing = () => !performing() && !!bars.views && !!bars.controls;
function setShare(v, keep = true) {
  split.views = clamp(v, 0, 1);
  if (keep) {
    if (split.views > 0 && split.views < 1) split.open = split.views;
    saveSplit();
  }
  apply();
}
let handle = null;
if (bars.views && bars.controls) {
  // the handle on the controls' bar's top edge: drag it, or the bar itself where it has
  // nothing to tap; arrows, Home and End move it from the keyboard; a double click goes back
  // to the usual share
  handle = el('div', 'forte-split');
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'horizontal');
  handle.setAttribute('aria-controls', `${viewsEl.id} ${sidebar.id}`);
  handle.setAttribute('aria-label', 'Share the height between the views and the controls');
  handle.setAttribute('aria-valuemin', '0');
  handle.setAttribute('aria-valuemax', '100');
  handle.title = 'Drag to share the height between the views and the controls (double-click: as it was)';
  bars.controls.bar.prepend(handle);
  const SNAP = 56; // px: a panel smaller than this folds away
  let drag = null, tapped = 0;
  const grab = (e) => {
    if (!sharing() || phoneQuery.matches || e.button > 0) return;
    if (e.target !== handle && e.target.closest('button, select, input, a, label')) return;
    e.preventDefault();
    try { bars.controls.bar.setPointerCapture(e.pointerId); } catch { /* gone */ }
    const v = viewsEl.getBoundingClientRect().height, c = sidebar.getBoundingClientRect().height;
    drag = { id: e.pointerId, y: e.clientY, v, total: v + c, moved: false, onHandle: e.target === handle };
    body.classList.add('sharing');
  };
  bars.controls.bar.addEventListener('pointerdown', grab);
  bars.controls.bar.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id || !drag.total) return;
    if (Math.abs(e.clientY - drag.y) > 3) drag.moved = true;
    if (!drag.moved) return;
    let v = clamp(drag.v + e.clientY - drag.y, 0, drag.total);
    if (v < SNAP) v = 0; else if (drag.total - v < SNAP) v = drag.total;
    setShare(v / drag.total, false);
  });
  for (const ev of ['pointerup', 'pointercancel']) {
    bars.controls.bar.addEventListener(ev, (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { moved, onHandle } = drag;
      drag = null; body.classList.remove('sharing');
      if (moved) { setShare(split.views); return; }
      // two taps on the handle: the usual share
      if (onHandle && e.timeStamp - tapped < 400) { tapped = 0; setShare(SHARE); } else tapped = onHandle ? e.timeStamp : 0;
    });
  }
  handle.addEventListener('keydown', (e) => {
    const to = { ArrowUp: split.views - 0.05, ArrowDown: split.views + 0.05, Home: 0, End: 1 }[e.key];
    if (to === undefined || !sharing()) return;
    e.preventDefault();
    setShare(Math.round(to * 20) / 20);
  });
}
// Each bar's fold button folds its panel away, and brings it back at the share it had.
// In Perform the controls' one is More controls.
function fold(kind) {
  if (kind === 'controls' && performing()) { prefs.perform.controls = !prefs.perform.controls; save(); apply(); return; }
  const end = kind === 'views' ? 0 : 1;
  if (kind === 'controls' && phoneQuery.matches) {
    // a phone scrolls instead: controls out of sight below come up, rather than fold away unseen,
    // and controls opened are scrolled to
    if (controlsBelow()) { toControls(); return; }
    if (split.views === end) { setShare(split.open); toControls(); return; }
  }
  setShare(split.views === end ? split.open : end);
}
for (const kind of ['views', 'controls']) {
  const b = bars[kind]?.fold;
  b?.addEventListener('click', () => { fold(kind); b.blur(); });
}
// On a phone the controls' bar sticks above the keys with the controls out of sight below it
// until the page scrolls them up: so long as it does, its chevron points up and brings them up.
function controlsBelow() {
  if (!bars.controls || !phoneQuery.matches || performing() || body.classList.contains('controls-folded')) return false;
  const kb = footer?.getBoundingClientRect().top ?? innerHeight;
  return sidebar.getBoundingClientRect().top > Math.min(kb, innerHeight) - 48; // less than a row of them shows
}
function toControls() {
  const bar = bars.controls.bar, stuck = parseFloat(getComputedStyle(bar).top) || 0; // under the status bar
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  scrollTo({ top: scrollY + sidebar.getBoundingClientRect().top - bar.offsetHeight - stuck, behavior: smooth ? 'smooth' : 'auto' });
}
// the fold buttons' labels, and which way they point
function labelFolds() {
  const v = share();
  for (const [kind, folded, name] of [['views', v === 0, 'views'], ['controls', v === 1, 'controls']]) {
    const b = bars[kind]?.fold;
    if (!b) continue;
    const below = kind === 'controls' && controlsBelow();
    bars[kind].bar.classList.toggle('below', below);
    b.setAttribute('aria-expanded', String(!folded));
    b.title = kind === 'controls' && performing() ? (folded ? 'More controls' : 'Fewer controls: the views take the room')
      : below ? 'Show the controls'
      : folded ? `Show the ${name}` : `Hide the ${name}: the ${name === 'views' ? 'controls' : 'views'} take their room`;
    b.setAttribute('aria-label', b.title);
  }
}
if (bars.controls) {
  let queued = false;
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; labelFolds(); }); } };
  addEventListener('scroll', later, { passive: true });
  addEventListener('resize', later);
}

// ---------------------------------------------------------------------------
// the strip: the few small controls you play with, in the keyboard bar (shared/keyboard.js has it
// call attachKeyboard; until then, at the top of the footer)

const strip = el('div', 'forte-perform');
strip.setAttribute('role', 'group');
strip.setAttribute('aria-label', 'Controls to play with');
if (footer && sidebar) footer.prepend(strip);

// The hint of a control above the keys opens in a bubble over it; in the Controls
// panel it slides open under the control. Either way, a tap: tooltips need a mouse.
const bubble = el('div', 'forte-hint-pop');
bubble.id = 'forte-hint-pop';
bubble.setAttribute('role', 'note');
bubble.hidden = true;
let bubbleFor = null;
function closeHint() {
  if (!bubbleFor) return;
  bubbleFor.setAttribute('aria-expanded', 'false');
  bubbleFor = null; bubble.hidden = true;
}
function openHint(btn, tile, title, text) {
  if (bubbleFor === btn) { closeHint(); return; }
  closeHint();
  bubble.replaceChildren(el('b', '', title), el('span', '', text));
  if (!bubble.isConnected) body.appendChild(bubble);
  bubble.hidden = false; bubbleFor = btn;
  btn.setAttribute('aria-expanded', 'true');
  // above the control, inside the window
  const r = tile.getBoundingClientRect(), w = bubble.offsetWidth;
  bubble.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  bubble.style.bottom = `${innerHeight - r.top + 6}px`;
}
document.addEventListener('pointerdown', (e) => { if (bubbleFor && !bubble.contains(e.target) && !bubbleFor.contains(e.target)) closeHint(); }, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHint(); });
window.addEventListener('resize', closeHint);
document.addEventListener('scroll', closeHint, true);

// A dropdown above the keys with a few short choices becomes a row of buttons: one tap.
function shortLabels(texts) {
  for (const cut of [/\s*[(:,].*$/, /\s*\(.*$/, null]) {
    const s = texts.map((t) => (cut ? t.replace(cut, '') : t).trim());
    if (new Set(s).size === s.length && s.every((x) => x && x.length <= 18)) return s;
  }
  return null;
}
function segment(p, label) {
  const sel = p.querySelector('select');
  if (!sel || sel.options.length < 2 || sel.options.length > 4) return;
  const opts = [...sel.options], names = shortLabels(opts.map((o) => o.text));
  if (!names) return;
  const seg = el('div', 'forte-seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', label);
  const btns = opts.map((o, i) => {
    const b = button(names[i], o.text);
    b.addEventListener('click', () => {
      if (sel.value !== o.value) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      b.blur();
    });
    return b;
  });
  const sync = () => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i].selected)));
  // the page sets the dropdown's value itself (presets, Reset): follow it
  const v = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(sel, 'value', { configurable: true, get() { return v.get.call(this); }, set(x) { v.set.call(this, x); sync(); } });
  sel.addEventListener('change', sync);
  seg.append(...btns);
  sel.hidden = true; sel.after(seg);
  p.classList.add('segmented');
  sync();
}

// A tile above the keys shows its label, slider and value on one line; its tooltip has the
// whole name and the value.
function titled(p, name) {
  const val = p.querySelector('.val');
  if (!val) return;
  const title = () => { p.title = `${name}: ${val.textContent}`; };
  new MutationObserver(title).observe(val, { childList: true, characterData: true, subtree: true });
  title();
}
// A pedal, drawn: a brass shoe that goes down when it's on (shared/layout.css), for the pedal button
// and a checkbox marked `pedal` above the keys. Its brass is defined once, in a hidden <svg>.
const SVG = 'http://www.w3.org/2000/svg';
function pedalGlyph() {
  if (!document.querySelector('#forte-brass')) {
    const defs = document.createElementNS(SVG, 'svg');
    defs.setAttribute('aria-hidden', 'true');
    defs.style.cssText = 'position:absolute;width:0;height:0';
    defs.innerHTML = '<defs><linearGradient id="forte-brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".45" stop-color="#d4a63e"/><stop offset="1" stop-color="#7c5a1c"/></linearGradient>' +
      '<linearGradient id="forte-brass-down" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9b75e"/><stop offset=".5" stop-color="#9c7526"/><stop offset="1" stop-color="#5a3f12"/></linearGradient></defs>';
    document.body.appendChild(defs);
  }
  const g = document.createElementNS(SVG, 'svg');
  g.setAttribute('class', 'forte-pedal-glyph');
  g.setAttribute('viewBox', '0 0 18 22');
  g.setAttribute('aria-hidden', 'true');
  g.innerHTML = '<rect x="7" y="0" width="4" height="4" rx="1" fill="#55555e"/><path d="M5 3h8l2 13c.3 3-2.4 5-6 5s-6.3-2-6-5z"/>';
  return g;
}
// Above the keys a label drops its explanation, "(…)" or "= …": "Dome rise (curvature)" is
// "Dome rise". The whole name stays the control's name, its tooltip and its ⓘ's title.
const shortLabel = (t) => t.replace(/\s*\([^()]*\)\s*$/, '').replace(/\s+=\s.*$/, '').trim() || t;

// Once the page has built its parameters: each gets its ⓘ, and the ones marked
// data-perform move to the strip in the keyboard bar (the page keeps its references to them).
function placeControls() {
  if (!sidebar) return;
  const fresh = sidebar.querySelectorAll('.param:not([data-placed])');
  for (const p of fresh) {
    p.dataset.placed = '';
    const lab = p.querySelector('label'), label = lab?.textContent ?? '', hint = p.querySelector('.hint')?.textContent;
    const row = lab?.closest('.row');
    let info = null;
    if (hint && lab) {
      info = infoButton(`About ${label}`);
      if (row) lab.after(info);
      else if (p.classList.contains('check')) lab.after(info);
      else { const head = el('div', 'forte-param-head'); lab.before(head); head.append(lab, info); }
    }
    if (p.hasAttribute('data-perform')) {
      if (!p.title) p.title = label; // the whole name, when the tile cuts it short
      if (info) {
        info.setAttribute('aria-controls', bubble.id);
        info.addEventListener('click', () => { openHint(info, p, label, hint); info.blur(); });
      }
      segment(p, label);
      const short = shortLabel(label);
      if (lab && short !== label) {
        lab.textContent = short;
        p.querySelector('input, select')?.setAttribute('aria-label', label);
      }
      titled(p, label);
      if (p.hasAttribute('data-pedal') && lab) lab.prepend(pedalGlyph());
      // velocity for the computer keys: a touch sets it by where it strikes, MIDI by the note
      if (p.querySelector('#p-velocity')) p.classList.add('keys-only');
      strip.appendChild(p);
    } else if (info) {
      info.addEventListener('click', () => { info.setAttribute('aria-expanded', String(p.classList.toggle('hint-open'))); info.blur(); });
    }
  }
}

// The presets menu offers "Default settings", which presses the page's Reset.
function addDefaults() {
  const ps = document.querySelector('#preset'), reset = document.querySelector('#reset');
  const blank = ps && [...ps.options].findIndex((o) => o.value === ''); // "Presets…", once the page has filled the menu
  if (!reset || !(blank >= 0) || ps.querySelector('option[value="__default"]')) return;
  ps.add(new Option('Default settings', '__default'), ps.options[blank + 1] ?? null);
}

// ---------------------------------------------------------------------------
// the bars' tools: Discover | Perform for the views, the presets for the controls; and in the
// header Full screen and MIDI

const modeBtns = [];
function setMode(m) {
  if (m === mode) return;
  mode = m;
  try { localStorage.setItem(MODE, m); } catch { /* storage unavailable */ }
  apply();
}
{
  const seg = el('div', 'forte-mode');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Mode');
  for (const [m, text, title] of [
    ['discover', 'Discover', 'Every control, the views you chose and the explanations'],
    ['perform', 'Perform', 'The views you chose filling the screen, for playing or a projector'],
  ]) {
    const b = button(text, title);
    b.dataset.mode = m;
    b.addEventListener('click', () => { setMode(m); b.blur(); });
    seg.appendChild(b); modeBtns.push(b);
  }
  if (bars.views) bars.views.tools.appendChild(seg);
  else if (header) header.insertBefore(seg, header.querySelector('.status'));
}
const presets = sidebar?.querySelector('.preset-row');
if (presets) {
  presets.classList.add('forte-presets');
  bars.controls?.tools.appendChild(presets);
  // "Default settings": stop the page seeing it as a preset, and reset instead
  presets.addEventListener('change', (e) => {
    if (e.target.value !== '__default') return;
    e.stopPropagation();
    e.target.value = '';
    presets.querySelector('#reset')?.click();
    e.target.blur();
  }, true);
}
// In Perform the presets and More controls join the keyboard bar (once it's built), and the
// controls' bar goes, so the views have its room; in Discover they go back. Not on a phone held
// sideways: its keyboard bar has no room, and its controls' bar scrolls with the panel, out of sight.
let kbTools = null, restack = () => {};
function placeTools() {
  const perf = performing() && !!kbTools && !sidewaysQuery.matches;
  if (presets && bars.controls) (perf ? kbTools : bars.controls.tools).appendChild(presets);
  const f = bars.controls?.fold;
  if (f) (perf ? kbTools : bars.controls.bar).appendChild(f);
  body.classList.toggle('tools-below', perf && !!bars.controls);
  restack();
}
if (header) {
  const status = header.querySelector('.status');
  // Full screen, for a projector or a stage (not on iPhone, which has no such thing for pages)
  const d = document, root = d.documentElement;
  if (d.fullscreenEnabled || d.webkitFullscreenEnabled) {
    const fs = button('Full screen', 'Fill the screen with the instrument (Esc to leave)');
    fs.className = 'forte-fullscreen';
    const isFull = () => !!(d.fullscreenElement || d.webkitFullscreenElement);
    fs.addEventListener('click', () => {
      if (isFull()) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else Promise.resolve((root.requestFullscreen || root.webkitRequestFullscreen).call(root)).catch(() => {});
      fs.blur();
    });
    const label = () => { fs.textContent = isFull() ? 'Leave full screen' : 'Full screen'; };
    d.addEventListener('fullscreenchange', label);
    d.addEventListener('webkitfullscreenchange', label);
    if (status) status.prepend(fs); else header.appendChild(fs);
  }
  // "MIDI off" says no more than "Enable MIDI" does: the status shows once MIDI is asked for
  // (by the button, or by MIDI turning itself on again, which hides the button with no click)
  const midi = header.querySelector('#midi');
  if (midi && header.querySelector('#midi-btn')) {
    midi.hidden = true;
    new MutationObserver(() => { midi.hidden = false; }).observe(midi, { childList: true, characterData: true, subtree: true });
  }
}

// ---------------------------------------------------------------------------

function apply() {
  placeControls();
  addDefaults();
  body.classList.toggle('perform', performing());
  placeTools();
  document.documentElement.classList.toggle('perform', performing()); // for :root's colours (shared/layout.css)
  for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  body.classList.toggle('no-views', !shown.length);
  // the controls: the groups turned on (in Discover the panel stays, with its toggles, even
  // with every group off)
  addGroups();
  // the height, shared: a panel with no share folds away, leaving its bar
  const v = share();
  body.classList.toggle('views-folded', !!bars.views && v === 0);
  body.classList.toggle('controls-folded', !!bars.controls && v === 1);
  body.style.setProperty('--split-rows', `auto minmax(0, ${v}fr) auto minmax(0, ${1 - v}fr)`);
  if (handle) {
    handle.setAttribute('aria-valuenow', String(Math.round(100 * split.views)));
    handle.setAttribute('aria-valuetext', `views ${Math.round(100 * split.views)} %, controls ${Math.round(100 * (1 - split.views))} %`);
  }
  arrange();
  labelFolds(); // once laid out: on a phone, whether the controls are out of sight below
  for (const s of SIZES) body.classList.toggle(`kb-${s}`, prefs.kb === s);
  window.dispatchEvent(new Event('resize')); // let pages that size on resize refit
  document.dispatchEvent(new Event('forte-layout')); // for the wake lock, below
}
// The page's script builds its controls after this module runs: place them once it has.
// DOMContentLoaded and load are not enough, as a page that awaits its model (top-level
// await) builds them after both, so new parameters and presets also apply when they land.
// apply() can run more than once.
document.addEventListener('DOMContentLoaded', apply);
window.addEventListener('load', apply);
const unplaced = () => sidebar?.querySelector('.param:not([data-placed])')
  || (document.querySelector('#reset') && document.querySelector('#preset option[value=""]') && !document.querySelector('#preset option[value="__default"]'));
const lateControls = new MutationObserver(() => { if (unplaced()) apply(); });
for (const t of [sidebar, document.querySelector('#preset')]) if (t) lateControls.observe(t, { childList: true, subtree: true });
phoneQuery.addEventListener('change', apply);
sidewaysQuery.addEventListener('change', placeTools);
tall.addEventListener('change', arrange);
apply();
document.querySelector('#toast')?.setAttribute('role', 'status');
if (window.ResizeObserver) {
  // the views rearrange as their room changes shape (a drag of the handle, the window)
  if (stage) new ResizeObserver(() => { const c = cols; arrange(); if (cols !== c) window.dispatchEvent(new Event('resize')); }).observe(stage);
  // --footer-h: toasts sit just above the keyboard and its tools, however they wrap;
  // --bar-h: on a phone the controls' bar sticks above them; --header-h: and below the header
  if (footer) new ResizeObserver(() => body.style.setProperty('--footer-h', `${footer.offsetHeight}px`)).observe(footer);
  if (bars.controls) new ResizeObserver(() => body.style.setProperty('--bar-h', `${bars.controls.bar.offsetHeight}px`)).observe(bars.controls.bar);
  if (header) new ResizeObserver(() => body.style.setProperty('--header-h', `${header.offsetHeight}px`)).observe(header);
}

// ---------------------------------------------------------------------------
// the keyboard bar (called by shared/keyboard.js once the page builds its keys)

export function attachKeyboard(kb) {
  const kbEl = document.querySelector('#keyboard');
  let row = document.querySelector('footer .kb-help');
  if (!row) { row = el('div', 'kb-help'); kbEl.before(row); }
  const bar = el('div', 'forte-kbbar');

  // The page's hints (computer keys, MIDI) and readouts wait behind ⌨.
  const hints = [...row.children];
  if (hints.length) {
    const pop = el('div', 'forte-keys-pop');
    pop.id = 'forte-keys-pop';
    pop.hidden = true;
    pop.append(...hints);
    const kbtn = button('⌨', 'The computer keyboard and MIDI: which keys do what');
    kbtn.className = 'forte-keys';
    kbtn.setAttribute('aria-expanded', 'false');
    kbtn.setAttribute('aria-controls', pop.id);
    const show = (on) => { pop.hidden = !on; kbtn.setAttribute('aria-expanded', String(on)); };
    kbtn.addEventListener('click', () => { show(pop.hidden); kbtn.blur(); });
    document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !kbtn.contains(e.target)) show(false); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') show(false); });
    bar.appendChild(kbtn);
    row.appendChild(pop);
  }

  // The window onto the range: as many white keys as fit at the chosen width, moved
  // an octave at a time with ◀ ▶ or anywhere by dragging the overview.
  let [lo, hi] = kb.bounds(), whites = [];
  for (let m = lo; m <= hi; m++) if (!kb.isBlack(m)) whites.push(m);
  let first = 0, count = whites.length;
  const prev = button('◀', 'Lower keys (an octave)'), next = button('▶', 'Higher keys (an octave)');
  prev.className = next.className = 'forte-kbstep';
  const map = el('div', 'forte-kbmap');
  map.setAttribute('role', 'slider');
  map.setAttribute('aria-label', 'Which keys are shown');
  map.tabIndex = 0;
  const cv = el('canvas');
  map.appendChild(cv);
  const show = (f, remember = true) => {
    first = clamp(Math.round(f), 0, whites.length - count);
    kb.setWindow(whites[first], whites[first + count - 1]);
    if (remember) { prefs.start = whites[first]; save(); }
    draw();
  };
  function fit(zooming = false) {
    const w = kbEl.clientWidth || innerWidth;
    const n = Math.min(whites.length, Math.max(5, Math.floor(w / KEY_W[prefs.kb])));
    if (first === 0 && count === whites.length && n < whites.length && !zooming) {
      // first fit: where the player left it, or the octaves around middle C
      const at = prefs.start !== null ? whites.findIndex((m) => m >= prefs.start) : -1;
      count = n;
      if (at >= 0) first = at;
      else { first = Math.max(0, whites.indexOf(60) - Math.floor(n / 2)); while (first > 0 && whites[first] % 12) first--; }
    } else if (n !== count) {
      first += Math.round((count - n) / 2); // zoom about the middle
      count = n;
    }
    bar.classList.toggle('all-keys', count === whites.length);
    stack();
    show(first, false);
  }
  // The strip (and in Perform the presets) shares the bar's line where it fits beside the rest,
  // with room left for the overview; otherwise it takes a line of its own above it. A phone held
  // sideways keeps one line.
  function stack() {
    bar.classList.remove('stacked');
    if (!(strip.parentNode === bar && strip.childElementCount) && !kbTools?.childElementCount || sidewaysQuery.matches || !bar.isConnected) return;
    bar.classList.add('measure');
    const over = bar.scrollWidth > bar.clientWidth + 1;
    bar.classList.remove('measure');
    bar.classList.toggle('stacked', over);
  }
  prev.addEventListener('click', () => { show(first - 7); prev.blur(); });
  next.addEventListener('click', () => { show(first + 7); next.blur(); });
  map.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: -1, ArrowRight: 1, PageDown: -7, PageUp: 7 }[e.key];
    if (d) { e.preventDefault(); e.stopPropagation(); show(first + d); }
  });
  // drag the window, or tap elsewhere on the overview to jump there
  let drag = null;
  map.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { map.setPointerCapture(e.pointerId); } catch { /* gone */ }
    const r = map.getBoundingClientRect(), per = r.width / whites.length, at = (e.clientX - r.left) / per;
    if (at < first || at > first + count) show(at - count / 2);
    drag = { x: e.clientX, first, per };
  });
  map.addEventListener('pointermove', (e) => { if (drag) show(drag.first + (e.clientX - drag.x) / drag.per); });
  for (const ev of ['pointerup', 'pointercancel']) map.addEventListener(ev, () => { drag = null; });
  let down = new Set();
  kb.onKeys((keys) => { down = keys; draw(); });
  function draw() {
    const dpr = window.devicePixelRatio || 1, r = map.getBoundingClientRect();
    if (!r.width) return;
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = r.width, h = r.height, per = w / whites.length, css = getComputedStyle(body);
    const accent = css.getPropertyValue('--accent').trim() || '#f0b35a';
    g.clearRect(0, 0, w, h);
    whites.forEach((m, i) => { g.fillStyle = down.has(m) ? accent : '#d9d9d4'; g.fillRect(i * per + 0.5, 0, per - 1, h); });
    whites.forEach((m, i) => {
      if (m + 1 > hi || !kb.isBlack(m + 1)) return;
      g.fillStyle = down.has(m + 1) ? accent : '#1b1b1f';
      g.fillRect((i + 1) * per - per * 0.3, 0, per * 0.6, h * 0.6);
    });
    // dim what is off the keyboard; frame what is on it
    const x0 = first * per, x1 = (first + count) * per;
    g.fillStyle = 'rgba(10, 10, 14, 0.62)';
    g.fillRect(0, 0, x0, h); g.fillRect(x1, 0, w - x1, h);
    g.strokeStyle = accent; g.lineWidth = 2;
    g.strokeRect(x0 + 1, 1, x1 - x0 - 2, h - 2);
    const [a, b] = kb.range();
    map.setAttribute('aria-valuetext', `${noteName(a)} to ${noteName(b)}`);
    map.title = `${noteName(a)}–${noteName(b)}: drag to move`;
    prev.disabled = first <= 0;
    next.disabled = first + count >= whites.length;
  }

  // key size: wider keys, fewer of them
  const smaller = button('−', 'Smaller keys (more of them)'), larger = button('+', 'Larger keys (fewer of them)');
  const zoomed = () => { smaller.disabled = prefs.kb === SIZES[0]; larger.disabled = prefs.kb === SIZES.at(-1); };
  const zoom = (d) => {
    prefs.kb = SIZES[clamp(SIZES.indexOf(prefs.kb) + d, 0, SIZES.length - 1)];
    save(); apply(); fit(true); zoomed();
  };
  smaller.addEventListener('click', () => { zoom(-1); smaller.blur(); });
  larger.addEventListener('click', () => { zoom(1); larger.blur(); });
  zoomed();
  const sizes = el('div', 'forte-kbsize');
  sizes.setAttribute('role', 'group');
  sizes.setAttribute('aria-label', 'Key size');
  sizes.append(smaller, larger);
  // the keyboard's own tools on the left (key size, then which keys), what you play with on the right
  bar.append(sizes, prev, map, next);
  if (strip.parentNode === footer) bar.appendChild(strip); // the page's own strip, if any

  // The pedal: a button that presses Space, so pages need no touch-specific code.
  const label = body.dataset.space;
  if (label) {
    const space = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'Space', key: ' ' }));
    const pedal = button(label, `Same as holding Space`);
    pedal.className = 'forte-pedal';
    if (label === 'Sustain' || label === 'Hold') pedal.prepend(pedalGlyph()); // a pedal (not the organ's Leslie switch or the Clavinet's mute bar)
    if (body.dataset.spaceMode === 'tap') {
      pedal.addEventListener('click', () => { space('keydown'); space('keyup'); });
      bar.appendChild(pedal);
    } else {
      let on = false, latched = false;
      const latch = button('Latch', `Keep ${label.toLowerCase()} on until tapped again`);
      latch.className = 'forte-latch';
      // on or off for a screen reader too, as the toggles say
      const show = (b, v) => { b.classList.toggle('on', v); b.setAttribute('aria-pressed', String(v)); };
      show(pedal, false); show(latch, false);
      const set = (v) => { if (v === on) return; on = v; space(v ? 'keydown' : 'keyup'); show(pedal, v); };
      const setLatch = (v) => { latched = v; show(latch, v); set(v); };
      pedal.addEventListener('pointerdown', (e) => { e.preventDefault(); try { pedal.setPointerCapture(e.pointerId); } catch { /* gone */ } if (latched) setLatch(false); else set(true); });
      for (const ev of ['pointerup', 'pointercancel']) pedal.addEventListener(ev, () => { if (!latched) set(false); });
      latch.addEventListener('click', () => setLatch(!latched));
      // the pedal follows the page: Space, a MIDI pedal and Panic light it or let it go too
      document.addEventListener('forte-sustain', (e) => {
        on = e.detail; show(pedal, on);
        if (!on && latched) { latched = false; show(latch, false); }
      });
      bar.append(pedal, latch);
    }
  }
  // in Perform, the presets and More controls, at the end (placeTools)
  kbTools = el('div', 'forte-kbtools');
  bar.appendChild(kbTools);
  row.appendChild(bar);
  restack = stack;
  placeTools();
  new MutationObserver(stack).observe(strip, { childList: true }); // the page builds its controls later
  document.fonts?.ready.then(stack);
  // the range can change (a historical compass opened to every key): the window keeps its first key
  kb.onBounds(() => {
    const start = whites[first];
    [lo, hi] = kb.bounds(); whites = [];
    for (let m = lo; m <= hi; m++) if (!kb.isBlack(m)) whites.push(m);
    first = Math.max(0, whites.findIndex((m) => m >= start));
    count = Math.min(count, whites.length);
    fit(true);
  });
  if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(kbEl);
  else window.addEventListener('resize', () => fit());
  fit();
}

// ---------------------------------------------------------------------------
// A second finger: while one finger holds a key, a tap with another gets no click from the
// browser (it sees a two-finger gesture), so a stop, Latch, ◀ ▶ or a tab would not answer.
// Such a tap, lifted where it landed, clicks the control itself.

const TAPPABLE = 'button, label, summary, input[type=checkbox], input[type=radio], [role=button], [role=tab], [role=switch]';
const taps = new Map(); // pointer id → the control it landed on, and where
let tapped = null;      // our click, should the browser click as well
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || e.isPrimary) return;
  const t = e.target.closest?.(TAPPABLE);
  if (t && !t.closest('#keyboard')) taps.set(e.pointerId, { t, x: e.clientX, y: e.clientY });
}, true);
document.addEventListener('pointercancel', (e) => taps.delete(e.pointerId), true);
document.addEventListener('pointerup', (e) => {
  const tap = taps.get(e.pointerId);
  if (!tap) return;
  taps.delete(e.pointerId);
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(TAPPABLE);
  if (over !== tap.t || tap.t.disabled || Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12) return;
  tapped = { t: tap.t, at: performance.now() };
  tap.t.click();
}, true);
document.addEventListener('click', (e) => {
  if (!tapped || !e.isTrusted) return;
  const mine = performance.now() - tapped.at < 700 && tapped.t.contains(e.target);
  tapped = null;
  if (mine) { e.preventDefault(); e.stopImmediatePropagation(); } // one tap, one click
}, true);

// ---------------------------------------------------------------------------
// iOS / Safari audio: resume any AudioContext on the next touch (a context made
// in pointerdown can start suspended), and play through the silent switch.

const contexts = new Set();
for (const name of ['AudioContext', 'webkitAudioContext']) {
  const Base = window[name];
  if (!Base) continue;
  window[name] = class extends Base {
    constructor(...a) {
      super(...a);
      contexts.add(this);
      this.addEventListener('statechange', () => {
        if (this.state === 'closed') contexts.delete(this);
        if (this.state === 'running') setTimeout(() => warnLatency(this), 1500); // outputLatency settles once sound flows
        keepAwake();
      });
    }
  };
}

// Perform keeps the screen awake while the audio runs (where the browser can: the Screen Wake
// Lock API, Safari 16.4 on), so a phone or tablet on a stand doesn't dim mid-piece; Discover
// lets it sleep. The browser lets go when the page is hidden: it's asked again on coming back.
let wakeLock = null, asking = false;
async function keepAwake() {
  if (!navigator.wakeLock || asking) return;
  const want = performing() && document.visibilityState === 'visible' && [...contexts].some((c) => c.state === 'running');
  if (!want) { const l = wakeLock; wakeLock = null; l?.release().catch(() => {}); return; }
  if (wakeLock && !wakeLock.released) return;
  asking = true;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch { wakeLock = null; } // refused (battery saver, a frame)
  asking = false;
  if (wakeLock) keepAwake(); // the mode or the audio may have changed meanwhile
}
document.addEventListener('forte-layout', keepAwake);
document.addEventListener('visibilitychange', keepAwake);

// Bluetooth headphones and speakers delay the sound 100–200 ms, more than everything else
// together: say so once per visit when the browser reports that much (Safari reports only its
// own buffer, so there the README's note has to do).
const LATE_MS = 80;
function warnLatency(ctx) {
  const ms = Math.round(1000 * ((ctx.baseLatency || 0) + (ctx.outputLatency || 0)));
  const t = document.getElementById('toast');
  if (ms < LATE_MS || !t || ctx.state !== 'running') return;
  try { if (sessionStorage.getItem('forte/latency-warned')) return; sessionStorage.setItem('forte/latency-warned', '1'); } catch { /* storage unavailable */ }
  t.textContent = `The sound reaches you about ${ms} ms after each key. Bluetooth headphones and speakers add most of that: wired ones play much sooner.`;
  t.hidden = false;
  setTimeout(() => { t.hidden = true; }, 8000);
}
const unlock = () => { for (const c of contexts) if (c.state !== 'running' && c.state !== 'closed') c.resume().catch(() => {}); };
for (const ev of ['pointerup', 'touchend', 'keydown']) document.addEventListener(ev, unlock, true);
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* not supported */ }
