// layout.js — layout controls on every instrument page, built for tablets as
// much as for desktops:
//   header: Discover | Perform (below); the presets, moved here from the controls
//           so that they are always in view; Controls (a column on wide screens, a
//           slide-over panel on narrow ones); Views ▾ (show or hide each
//           visualisation); and, in Perform, Full screen;
//   footer: the performance controls (parameters marked `perform: true`, which the
//           page gives data-perform) in a strip above the keys, in both modes; the
//           on-screen keyboard's octave window (◀ ▶), size, and a pedal button for
//           whatever Space does on this page (<body data-space="Sustain">;
//           data-space-mode="tap" when Space toggles something instead of being held).
// Discover shows every view, with its explanations, and the rest of the controls in
// the Controls panel. Perform is for playing and for a projector: just the views
// marked data-perform (one or two), filling the screen, with no text in them (no
// titles, readouts, captions, legends or tables, and nothing drawn by fillText on
// their canvases; a card with data-keep-text keeps its own). The mode is the same on
// every page; which views show, and whether the Controls column does, are remembered
// per instrument and per mode. Also handles iOS audio quirks. Imported by
// shared/nav.js, so it runs before the page's own scripts.

const body = document.body;
const STORE = `forte/${body.dataset.instrument || 'page'}/layout/v1`;
const MODE = 'forte/mode/v1';
const touch = matchMedia('(pointer: coarse)').matches;
const phone = touch && Math.min(screen.width, screen.height) < 500;
const narrow = matchMedia('(max-width: 1050px)');
const DEFAULTS = { controls: true, hidden: [], kb: touch ? 'l' : 'm', octaves: phone ? 2 : touch ? 3 : 0, start: null };
if (touch && !navigator.requestMIDIAccess) body.classList.add('no-midi'); // every browser on iPhone and iPad
const strings = (a) => (Array.isArray(a) ? a.filter((k) => typeof k === 'string') : null);
const prefs = (() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { /* corrupt */ }
  const p = s.perform && typeof s.perform === 'object' ? s.perform : {};
  return { // keep only well-formed stored values
    controls: typeof s.controls === 'boolean' ? s.controls : DEFAULTS.controls,
    hidden: strings(s.hidden) ?? [],
    // Perform: the Controls column starts hidden, and so do views without a picture (null)
    perform: { controls: typeof p.controls === 'boolean' ? p.controls : false, hidden: strings(p.hidden) },
    kb: ['s', 'm', 'l', 'xl'].includes(s.kb) ? s.kb : DEFAULTS.kb,
    octaves: [0, 2, 3, 4, 5].includes(s.octaves) ? s.octaves : DEFAULTS.octaves,
    start: Number.isInteger(s.start) ? s.start : null,
  };
})();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch { /* storage unavailable */ } };
let mode = (() => { try { return localStorage.getItem(MODE) === 'perform' ? 'perform' : 'discover'; } catch { return 'discover'; } })();

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function button(text, title) { const b = el('button', '', text); b.type = 'button'; if (title) b.title = title; return b; }

// ---------------------------------------------------------------------------
// mode, presets, controls panel and views

const header = document.querySelector('body > header');
const sidebar = document.querySelector('#controls');
const footer = document.querySelector('body > footer');
const views = [...document.querySelectorAll('#views .card')].map((card, i) => {
  const label = card.dataset.view || card.querySelector('h2')?.textContent.trim() || `View ${i + 1}`;
  return { card, label, key: card.id || label.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
});
// Perform starts with the views marked data-perform (else those with a picture)
const staged = views.filter((v) => v.card.hasAttribute('data-perform'));
const offStage = views.filter((v) => (staged.length ? !staged.includes(v) : !v.card.querySelector('canvas'))).map((v) => v.key);
const performing = () => mode === 'perform';
const hiddenViews = () => (performing() ? prefs.perform.hidden ?? offStage : prefs.hidden);
const setHidden = (list) => { if (performing()) prefs.perform.hidden = list; else prefs.hidden = list; save(); apply(); };
const showControls = () => (performing() ? prefs.perform.controls : prefs.controls);
let drawerOpen = false, ctlBtn = null;
const modeBtns = [];
const drawerMode = () => narrow.matches && !body.classList.contains('no-views');

// The performance controls live in a strip above the keys in both modes, so nothing
// moves when the mode changes; the Controls panel keeps the rest. (The page keeps its
// references to them.) In Discover, a control with a hint gets an ⓘ button that opens
// the hint in a bubble above it: a tap works where a tooltip would not (iPad, phones).
const strip = el('div', 'forte-perform');
strip.setAttribute('role', 'group');
strip.setAttribute('aria-label', 'Performance controls');
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
function placePerform() {
  if (!sidebar || !footer) return;
  for (const p of sidebar.querySelectorAll('.param[data-perform]')) {
    const lab = p.querySelector('label'), label = lab?.textContent ?? '', hint = p.querySelector('.hint')?.textContent;
    if (!p.title) p.title = label; // the whole name, when the tile cuts it short
    if (hint && lab) {
      const info = button('i');
      info.className = 'forte-info';
      info.setAttribute('aria-label', `About ${label}`);
      info.setAttribute('aria-expanded', 'false');
      info.setAttribute('aria-controls', bubble.id);
      info.addEventListener('click', () => { openHint(info, p, label, hint); info.blur(); });
      // first in the tile's top line: before the label (and the checkbox), or with the
      // label in a line of its own above a dropdown
      const row = lab.closest('.row');
      if (row) row.prepend(info);
      else if (p.classList.contains('check')) p.prepend(info);
      else { const head = el('div', 'forte-tile-head'); lab.before(head); head.append(info, lab); }
    }
    strip.appendChild(p);
  }
  if (strip.childElementCount && !strip.isConnected) footer.prepend(strip);
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

function apply() {
  const hidden = hiddenViews();
  let shown = 0;
  for (const v of views) {
    const off = hidden.includes(v.key);
    v.card.classList.toggle('view-hidden', off);
    if (v.box) v.box.checked = !off;
    if (!off) shown++;
  }
  body.classList.toggle('perform', performing());
  document.documentElement.classList.toggle('perform', performing()); // for :root's colours (shared/layout.css)
  for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  body.classList.toggle('no-views', views.length > 0 && shown === 0);
  body.classList.toggle('hide-controls', !!sidebar && !drawerMode() && !showControls());
  body.classList.toggle('drawer-open', drawerMode() && drawerOpen);
  ctlBtn?.setAttribute('aria-pressed', String(drawerMode() ? drawerOpen : showControls()));
  for (const s of ['s', 'm', 'l', 'xl']) body.classList.toggle(`kb-${s}`, prefs.kb === s);
  placePerform();
  window.dispatchEvent(new Event('resize')); // let pages that size on resize refit
}
function setMode(m) {
  if (m === mode) return;
  mode = m; drawerOpen = false;
  try { localStorage.setItem(MODE, m); } catch { /* storage unavailable */ }
  apply();
}

if (header && (sidebar || views.length)) {
  const status = header.querySelector('.status');
  // the middle of the header: the mode and the presets
  const play = el('div', 'forte-play');
  const seg = el('div', 'forte-mode');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Mode');
  for (const [m, text, title] of [
    ['discover', 'Discover', 'Every control and every view, with the explanations'],
    ['perform', 'Perform', 'The pictures, large, and the controls to play with'],
  ]) {
    const b = button(text, title);
    b.dataset.mode = m;
    b.addEventListener('click', () => { setMode(m); b.blur(); });
    seg.appendChild(b); modeBtns.push(b);
  }
  play.appendChild(seg);
  const presets = sidebar?.querySelector('.preset-row');
  if (presets) { presets.classList.add('forte-presets'); play.appendChild(presets); }
  header.insertBefore(play, status);

  const bar = el('div', 'forte-layout');
  if (sidebar) {
    ctlBtn = button('Controls', 'Show or hide the controls panel');
    ctlBtn.addEventListener('click', () => {
      if (drawerMode()) drawerOpen = !drawerOpen;
      else if (performing()) { prefs.perform.controls = !prefs.perform.controls; save(); }
      else { prefs.controls = !prefs.controls; save(); }
      apply();
    });
    bar.appendChild(ctlBtn);
    const close = button('Close ✕');
    close.className = 'drawer-close';
    close.addEventListener('click', () => { drawerOpen = false; apply(); });
    sidebar.prepend(close);
  }
  if (views.length) {
    const det = el('details', 'forte-views');
    det.appendChild(el('summary', '', 'Views'));
    const menu = el('div', 'forte-views-menu');
    for (const v of views) {
      const row = el('label', 'forte-views-item');
      v.box = el('input'); v.box.type = 'checkbox';
      v.box.addEventListener('change', () => {
        const h = hiddenViews();
        setHidden(v.box.checked ? h.filter((k) => k !== v.key) : [...h, v.key]);
      });
      row.append(v.box, el('span', '', v.label));
      menu.appendChild(row);
    }
    const all = button('Show all'), none = button('Hide all');
    all.addEventListener('click', () => setHidden([]));
    none.addEventListener('click', () => setHidden(views.map((v) => v.key)));
    const foot = el('div', 'forte-views-foot');
    foot.append(all, none);
    menu.appendChild(foot);
    det.appendChild(menu);
    bar.appendChild(det);
    document.addEventListener('click', (e) => { if (!det.contains(e.target)) det.open = false; });
  }
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
    bar.appendChild(fs);
  }
  if (status) status.prepend(bar); else header.appendChild(bar);
  // "MIDI off" says no more than "Enable MIDI" does: the status shows once MIDI is asked for
  const midi = header.querySelector('#midi'), midiBtn = header.querySelector('#midi-btn');
  if (midi && midiBtn) { midi.hidden = true; midiBtn.addEventListener('click', () => { midi.hidden = false; }); }
}
// The page's script builds its controls after this module runs (module scripts run in
// order, then DOMContentLoaded fires): place them once it has. apply() can run twice.
document.addEventListener('DOMContentLoaded', apply);
window.addEventListener('load', apply);
narrow.addEventListener('change', apply);
apply();
document.querySelector('#toast')?.setAttribute('role', 'status');
// --footer-h: toasts sit just above the keyboard and its tools, however they wrap
if (footer && window.ResizeObserver) new ResizeObserver(() => body.style.setProperty('--footer-h', `${footer.offsetHeight}px`)).observe(footer);

// ---------------------------------------------------------------------------
// keyboard tools (called by shared/keyboard.js once the page builds its keys)

export function attachKeyboard(kb) {
  const kbEl = document.querySelector('#keyboard');
  let row = document.querySelector('footer .kb-help');
  if (!row) { row = el('div', 'kb-help'); kbEl.before(row); }
  const tools = el('div', 'forte-kbtools');

  const prev = button('◀', 'Lower octave'), next = button('▶', 'Higher octave'), where = el('span', 'forte-kbrange');
  const remember = () => { prefs.start = kb.range()[0]; save(); };
  prev.addEventListener('click', () => { kb.shift(-12); remember(); });
  next.addEventListener('click', () => { kb.shift(12); remember(); });
  kb.onWindow((a, b) => {
    const [lo, hi] = kb.bounds();
    where.textContent = `${noteName(a)}–${noteName(b)}`;
    prev.disabled = !prefs.octaves || a <= lo;
    next.disabled = !prefs.octaves || b >= hi;
  });

  const span = el('select'); span.title = 'How many keys to show';
  for (const [v, t] of [[0, 'All keys'], [2, '2 octaves'], [3, '3 octaves'], [4, '4 octaves'], [5, '5 octaves']]) span.add(new Option(t, v));
  span.value = prefs.octaves;
  span.addEventListener('change', () => { prefs.octaves = +span.value; prefs.start = null; kb.setOctaves(prefs.octaves); save(); span.blur(); });

  const size = el('select'); size.title = 'Key size';
  for (const [v, t] of [['s', 'Small keys'], ['m', 'Medium keys'], ['l', 'Large keys'], ['xl', 'Huge keys']]) size.add(new Option(t, v));
  size.value = prefs.kb;
  size.addEventListener('change', () => { prefs.kb = size.value; save(); apply(); size.blur(); });

  tools.append(prev, where, next, span, size);

  // The pedal: a button that presses Space, so pages need no touch-specific code.
  const label = body.dataset.space;
  if (label) {
    const space = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'Space', key: ' ' }));
    const pedal = button(label, `Same as holding Space`);
    pedal.className = 'forte-pedal';
    if (body.dataset.spaceMode === 'tap') {
      pedal.addEventListener('click', () => { space('keydown'); space('keyup'); });
      tools.appendChild(pedal);
    } else {
      let down = false, latched = false;
      const latch = button('Latch', `Keep ${label.toLowerCase()} on until tapped again`);
      latch.className = 'forte-latch';
      const set = (on) => { if (on === down) return; down = on; space(on ? 'keydown' : 'keyup'); pedal.classList.toggle('on', on); };
      const setLatch = (on) => { latched = on; latch.classList.toggle('on', on); set(on); };
      pedal.addEventListener('pointerdown', (e) => { e.preventDefault(); try { pedal.setPointerCapture(e.pointerId); } catch { /* gone */ } if (latched) setLatch(false); else set(true); });
      for (const ev of ['pointerup', 'pointercancel']) pedal.addEventListener(ev, () => { if (!latched) set(false); });
      latch.addEventListener('click', () => setLatch(!latched));
      tools.append(pedal, latch);
    }
  }
  row.appendChild(tools);
  kb.setOctaves(prefs.octaves, prefs.start ?? undefined);
}

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
      this.addEventListener('statechange', () => { if (this.state === 'closed') contexts.delete(this); });
    }
  };
}
const unlock = () => { for (const c of contexts) if (c.state !== 'running' && c.state !== 'closed') c.resume().catch(() => {}); };
for (const ev of ['pointerup', 'touchend', 'keydown']) document.addEventListener(ev, unlock, true);
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* not supported */ }
