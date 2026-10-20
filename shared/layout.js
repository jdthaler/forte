// layout.js — the layout of every instrument page, the same on a phone, a tablet
// and a desktop. Three parts, top to bottom:
//   header  the instrument's name, which is also the menu (shared/nav.js); How it
//           works; Discover | Perform (and C++ | JS, shared/shell.js); audio, MIDI
//           and Panic;
//   views   the pictures only, with a row of toggles above them, one for each view: a
//           tap turns it on or off. The ones turned on share the space in rows. At
//           first the main ones (cards marked data-perform) are on and the rest off;
//   footer  the controls you play with, right above the keys: any control surface
//           a page marks data-control (the organ's drawbars) and the parameters
//           marked `perform: true` (which the page gives data-perform), then "More
//           controls" for the rest (#controls: a column on wide screens, a panel
//           that slides over the views on narrow ones). A handle folds them away.
//           Then the keyboard bar (◀ an overview of the whole range ▶, the presets
//           (with "Default settings", which stands in for the page's Reset button;
//           on a phone they lead the controls above the keys instead), key size,
//           the pedal, and ⌨ for the page's computer-keyboard and MIDI hints) and
//           the keys: as many as fit the width at the chosen key size.
// Explanations wait behind ⓘ buttons: a parameter's hint, a view's caption.
// Discover shows the toggles and every explanation. Perform is for playing and for a
// projector: the views turned on fill the screen with no toggles and no text in them
// (no titles, readouts, captions, legends or tables, and nothing drawn by fillText on
// their canvases; a card with data-keep-text keeps its own). The mode is the same on
// every page; everything else, the views turned on among it, is remembered per
// instrument. Also handles iOS audio quirks. Imported by
// shared/nav.js, so it runs before the page's own scripts.

const body = document.body;
const STORE = `forte/${body.dataset.instrument || 'page'}/layout/v1`;
const MODE = 'forte/mode/v1';
const touch = matchMedia('(pointer: coarse)').matches;
const narrow = matchMedia('(max-width: 1050px)');
const phoneQuery = matchMedia('(max-width: 600px), (max-width: 1050px) and (max-height: 500px)'); // as shared/layout.css
const SIZES = ['s', 'm', 'l', 'xl'];
const KEY_W = { s: 22, m: 30, l: 42, xl: 56 }; // the narrowest a white key may be, px
if (touch && !navigator.requestMIDIAccess) body.classList.add('no-midi'); // every browser on iPhone and iPad
const prefs = (() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { /* corrupt */ }
  const bool = (v, d) => (typeof v === 'boolean' ? v : d);
  return { // keep only well-formed stored values
    controls: bool(s.controls, true), // the Controls column, on wide screens in Discover
    perform: { controls: bool(s.perform?.controls, false) }, // … and in Perform
    deck: bool(s.deck, true), // the controls above the keys
    views: Object.fromEntries(Object.entries(s.views && typeof s.views === 'object' ? s.views : {})
      .filter(([, v]) => typeof v === 'boolean')), // each view turned on or off; the rest as the page has them
    kb: SIZES.includes(s.kb) ? s.kb : touch ? 'l' : 'm',
    start: Number.isInteger(s.start) ? s.start : null, // the first key shown
  };
})();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch { /* storage unavailable */ } };
let mode = (() => { try { return localStorage.getItem(MODE) === 'perform' ? 'perform' : 'discover'; } catch { return 'discover'; } })();
const performing = () => mode === 'perform';

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
const sidebar = document.querySelector('#controls');
const footer = document.querySelector('body > footer');
const viewsEl = document.querySelector('#views');
let drawerOpen = false;
const drawerMode = () => narrow.matches && !body.classList.contains('no-views');

// ---------------------------------------------------------------------------
// views: a row of toggles, one for each view, and the views turned on, in a grid

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
if (viewsEl && shown.length) {
  const bar = el('div', 'forte-view-toggles');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Views to show');
  for (const v of views) {
    v.toggle = button(viewName(v.card, 0), 'Show or hide this view');
    v.toggle.addEventListener('click', () => { prefs.views[v.key] = !v.on(); save(); apply(); v.toggle.blur(); });
    bar.appendChild(v.toggle);
  }
  stage = el('div', 'forte-stage');
  hint = el('p', 'forte-no-view', 'Every view is off: turn one on above.');
  stage.append(...shown, hint);
  viewsEl.replaceChildren(bar, stage);
}
// The views turned on fill the stage in rows, as even as they go: the first rows take
// the extra one, and a short last row stretches across. Side by side on a wide screen,
// stacked on a tall one (two abreast from four), one above another on a phone.
const tall = matchMedia('(orientation: portrait)');
function arrange() {
  if (!stage) return;
  const on = views.filter((v) => v.on()), n = on.length;
  const phone = phoneQuery.matches;
  const cols = phone ? (tall.matches ? 1 : Math.min(n, 2))
    : tall.matches ? (n <= 3 ? 1 : 2)
      : n <= 2 ? n : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / Math.max(1, cols));
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
// controls: the deck above the keys, and More controls for the rest

const deck = el('div', 'forte-deck');
deck.id = 'forte-deck';
const strip = el('div', 'forte-perform');
strip.setAttribute('role', 'group');
strip.setAttribute('aria-label', 'Controls to play with');
let more = null, grab = null;
if (footer && (sidebar || surfaces.length)) {
  for (const s of surfaces) { s.classList.add('forte-surface'); deck.appendChild(s); }
  deck.appendChild(strip);
  if (sidebar) {
    more = button('More controls', 'Every other control, grouped');
    more.className = 'forte-more';
    more.addEventListener('click', () => {
      if (drawerMode()) drawerOpen = !drawerOpen;
      else if (performing()) { prefs.perform.controls = !prefs.perform.controls; save(); }
      else { prefs.controls = !prefs.controls; save(); }
      apply(); more.blur();
    });
    strip.appendChild(more);
    const close = button('Close ✕');
    close.className = 'drawer-close';
    close.addEventListener('click', () => { drawerOpen = false; apply(); });
    sidebar.prepend(close);
  }
  grab = button('');
  grab.className = 'forte-grab';
  grab.setAttribute('aria-controls', deck.id);
  grab.addEventListener('click', () => { prefs.deck = !prefs.deck; save(); apply(); grab.blur(); });
  footer.prepend(grab, deck);
}

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

// A tile above the keys shows its label at rest, with the value beside it only if both fit whole
// (.tight when they don't), and its value while the value moves (a drag, the arrows, the mod
// wheel, a preset) and for a moment after, so it can be read (.live). Its tooltip has both.
function live(p, name) {
  const row = p.querySelector('.row'), lab = row?.querySelector('label'), val = row?.querySelector('.val');
  if (!lab || !val) return;
  const title = () => { p.title = `${name}: ${val.textContent}`; };
  const input = p.querySelector('input[type=range]');
  const fit = () => {
    const info = row.querySelector('.forte-info'), gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    const need = lab.scrollWidth + gap + val.scrollWidth + (info?.offsetWidth ? info.offsetWidth + gap : 0);
    p.classList.toggle('tight', need > row.clientWidth + 0.5);
  };
  let timer = 0, held = false;
  const show = () => {
    p.classList.add('live'); clearTimeout(timer);
    if (!held) timer = setTimeout(() => p.classList.remove('live'), 1500);
  };
  new MutationObserver(() => { show(); fit(); title(); }).observe(val, { childList: true, characterData: true, subtree: true });
  if (window.ResizeObserver) new ResizeObserver(fit).observe(row);
  fit(); title();
  if (!input) return;
  input.addEventListener('pointerdown', () => { held = true; show(); });
  for (const ev of ['pointerup', 'pointercancel']) input.addEventListener(ev, () => { held = false; show(); });
}
// Above the keys a label drops its explanation, "(…)" or "= …": "Dome rise (curvature)" is
// "Dome rise". The whole name stays the control's name, its tooltip and its ⓘ's title.
const shortLabel = (t) => t.replace(/\s*\([^()]*\)\s*$/, '').replace(/\s+=\s.*$/, '').trim() || t;

// Once the page has built its parameters: each gets its ⓘ, and the ones marked
// data-perform move above the keys (the page keeps its references to them).
function placeControls() {
  if (!sidebar) return;
  const fresh = sidebar.querySelectorAll('.param:not([data-placed])');
  if (fresh.length) requestAnimationFrame(() => { deck.scrollTop = 0; }); // the first row, once laid out
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
      live(p, label);
      // velocity for the computer keys: a touch sets it by where it strikes, MIDI by the note
      if (p.querySelector('#p-velocity')) p.classList.add('keys-only');
      strip.insertBefore(p, more);
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
// header: the mode, Full screen and MIDI (and the presets' "Default settings")

const modeBtns = [];
let presetTile = null, presetSlot = null;
function placePresets() {
  if (!presetTile) return;
  if (presetSlot && !phoneQuery.matches) presetSlot.appendChild(presetTile);
  else if (presetTile.parentNode !== strip) strip.prepend(presetTile);
}
function setMode(m) {
  if (m === mode) return;
  mode = m; drawerOpen = false;
  try { localStorage.setItem(MODE, m); } catch { /* storage unavailable */ }
  apply();
}
if (header) {
  const status = header.querySelector('.status');
  const play = el('div', 'forte-play');
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
  play.appendChild(seg);
  // the presets: in the keyboard bar, or on a phone (where the bar is full) the first tile of
  // the controls above the keys; on a page with neither, the top of the Controls panel
  const presets = sidebar?.querySelector('.preset-row');
  if (presets) {
    presets.classList.add('forte-presets');
    if (strip.isConnected) {
      presetTile = el('div', 'forte-preset-tile');
      const lab = el('label', '', 'Preset');
      const sel = presets.querySelector('select');
      if (sel?.id) lab.htmlFor = sel.id;
      presetTile.append(lab, presets);
      placePresets();
      phoneQuery.addEventListener('change', placePresets);
    }
    // "Default settings": stop the page seeing it as a preset, and reset instead
    presets.addEventListener('change', (e) => {
      if (e.target.value !== '__default') return;
      e.stopPropagation();
      e.target.value = '';
      presets.querySelector('#reset')?.click();
      e.target.blur();
    }, true);
  }
  header.insertBefore(play, status);

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
  document.documentElement.classList.toggle('perform', performing()); // for :root's colours (shared/layout.css)
  for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  body.classList.toggle('no-views', !shown.length);
  arrange();
  // the controls
  const panel = performing() ? prefs.perform.controls : prefs.controls;
  body.classList.toggle('hide-controls', !!sidebar && !drawerMode() && !panel);
  body.classList.toggle('drawer-open', drawerMode() && drawerOpen);
  more?.setAttribute('aria-pressed', String(drawerMode() ? drawerOpen : panel));
  body.classList.toggle('deck-shut', !prefs.deck);
  if (grab) {
    grab.setAttribute('aria-expanded', String(prefs.deck));
    grab.title = prefs.deck ? 'Fold the controls away' : 'Show the controls above the keys';
    grab.setAttribute('aria-label', grab.title);
  }
  for (const s of SIZES) body.classList.toggle(`kb-${s}`, prefs.kb === s);
  window.dispatchEvent(new Event('resize')); // let pages that size on resize refit
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
narrow.addEventListener('change', apply);
for (const q of [phoneQuery, tall]) q.addEventListener('change', arrange);
apply();
document.querySelector('#toast')?.setAttribute('role', 'status');
// --footer-h: toasts sit just above the keyboard and its tools, however they wrap
if (footer && window.ResizeObserver) new ResizeObserver(() => body.style.setProperty('--footer-h', `${footer.offsetHeight}px`)).observe(footer);

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
    show(first, false);
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
  presetSlot = el('div', 'forte-kbpresets');
  bar.append(prev, map, next, presetSlot, sizes);
  placePresets();

  // The pedal: a button that presses Space, so pages need no touch-specific code.
  const label = body.dataset.space;
  if (label) {
    const space = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'Space', key: ' ' }));
    const pedal = button(label, `Same as holding Space`);
    pedal.className = 'forte-pedal';
    if (body.dataset.spaceMode === 'tap') {
      pedal.addEventListener('click', () => { space('keydown'); space('keyup'); });
      bar.appendChild(pedal);
    } else {
      let on = false, latched = false;
      const latch = button('Latch', `Keep ${label.toLowerCase()} on until tapped again`);
      latch.className = 'forte-latch';
      const set = (v) => { if (v === on) return; on = v; space(v ? 'keydown' : 'keyup'); pedal.classList.toggle('on', v); };
      const setLatch = (v) => { latched = v; latch.classList.toggle('on', v); set(v); };
      pedal.addEventListener('pointerdown', (e) => { e.preventDefault(); try { pedal.setPointerCapture(e.pointerId); } catch { /* gone */ } if (latched) setLatch(false); else set(true); });
      for (const ev of ['pointerup', 'pointercancel']) pedal.addEventListener(ev, () => { if (!latched) set(false); });
      latch.addEventListener('click', () => setLatch(!latched));
      // the pedal follows the page: Space, a MIDI pedal and Panic light it or let it go too
      document.addEventListener('forte-sustain', (e) => {
        on = e.detail; pedal.classList.toggle('on', on);
        if (!on && latched) { latched = false; latch.classList.remove('on'); }
      });
      bar.append(pedal, latch);
    }
  }
  row.appendChild(bar);
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
      });
    }
  };
}

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
