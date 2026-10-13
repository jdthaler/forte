// layout.js — layout controls on every instrument page, built for tablets as
// much as for desktops:
//   header: Controls (a column on wide screens, a slide-over panel on narrow
//           ones) and Views ▾ (show or hide each visualisation);
//   footer: the on-screen keyboard's octave window (◀ ▶), size, and a pedal
//           button for whatever Space does on this page (<body data-space="Sustain">;
//           data-space-mode="tap" when Space toggles something instead of being held).
// Choices are remembered per instrument. Also handles iOS audio quirks.
// Imported by shared/nav.js, so it runs before the page's own scripts.

const body = document.body;
const STORE = `forte/${body.dataset.instrument || 'page'}/layout/v1`;
const touch = matchMedia('(pointer: coarse)').matches;
const narrow = matchMedia('(max-width: 1050px)');
const DEFAULTS = { controls: true, hidden: [], kb: touch ? 'l' : 'm', octaves: touch ? 3 : 0, start: null };
const prefs = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch { return { ...DEFAULTS }; } })();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch { /* storage unavailable */ } };

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function button(text, title) { const b = el('button', '', text); b.type = 'button'; if (title) b.title = title; return b; }

// ---------------------------------------------------------------------------
// controls panel and views

const header = document.querySelector('body > header');
const sidebar = document.querySelector('#controls');
const views = [...document.querySelectorAll('#views .card')].map((card, i) => {
  const label = card.dataset.view || card.querySelector('h2')?.textContent.trim() || `View ${i + 1}`;
  return { card, label, key: card.id || label.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
});
let drawerOpen = false, ctlBtn = null;
const drawerMode = () => narrow.matches && !body.classList.contains('no-views');

function apply() {
  let shown = 0;
  for (const v of views) {
    const off = prefs.hidden.includes(v.key);
    v.card.classList.toggle('view-hidden', off);
    if (v.box) v.box.checked = !off;
    if (!off) shown++;
  }
  body.classList.toggle('no-views', views.length > 0 && shown === 0);
  body.classList.toggle('hide-controls', !!sidebar && !drawerMode() && !prefs.controls);
  body.classList.toggle('drawer-open', drawerMode() && drawerOpen);
  ctlBtn?.setAttribute('aria-pressed', String(drawerMode() ? drawerOpen : prefs.controls));
  for (const s of ['s', 'm', 'l', 'xl']) body.classList.toggle(`kb-${s}`, prefs.kb === s);
  window.dispatchEvent(new Event('resize')); // let pages that size on resize refit
}

if (header && (sidebar || views.length)) {
  const bar = el('div', 'forte-layout');
  if (sidebar) {
    ctlBtn = button('Controls', 'Show or hide the controls panel');
    ctlBtn.addEventListener('click', () => {
      if (drawerMode()) drawerOpen = !drawerOpen; else { prefs.controls = !prefs.controls; save(); }
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
        prefs.hidden = v.box.checked ? prefs.hidden.filter((k) => k !== v.key) : [...prefs.hidden, v.key];
        save(); apply();
      });
      row.append(v.box, el('span', '', v.label));
      menu.appendChild(row);
    }
    const all = button('Show all'), none = button('Hide all');
    all.addEventListener('click', () => { prefs.hidden = []; save(); apply(); });
    none.addEventListener('click', () => { prefs.hidden = views.map((v) => v.key); save(); apply(); });
    const foot = el('div', 'forte-views-foot');
    foot.append(all, none);
    menu.appendChild(foot);
    det.appendChild(menu);
    bar.appendChild(det);
    document.addEventListener('click', (e) => { if (!det.contains(e.target)) det.open = false; });
  }
  const status = header.querySelector('.status');
  if (status) status.prepend(bar); else header.appendChild(bar);
}
narrow.addEventListener('change', apply);
apply();

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
  window[name] = class extends Base { constructor(...a) { super(...a); contexts.add(this); } };
}
const unlock = () => { for (const c of contexts) if (c.state !== 'running' && c.state !== 'closed') c.resume().catch(() => {}); };
for (const ev of ['pointerup', 'touchend', 'keydown']) document.addEventListener(ev, unlock, true);
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* not supported */ }
