// keyboard.js — the on-screen keyboard on every Forte page. Multi-touch,
// glissando (slide a finger across the keys), velocity from how far down the
// key you strike it (or from Apple Pencil pressure), and a window onto the
// instrument's range that shared/layout.js sizes to the screen: as many keys as
// fit at the chosen key width, moved with ◀ ▶ or the overview above the keys.
//
//   const kb = createKeyboard(root, { lo, hi, onDown(key, f), onUp(key), onPressure?(key, p) })
//   f ∈ [0, 1]: 0 at the top of the key, 1 at the front edge (map it to your velocity)
//   p ∈ [0, 1]: aftertouch from a held key — Pencil pressure, or leaning: sliding the finger
//               along the key, toward you or away, by a third of a white key's length (past a
//               few pixels, so an ordinary touch, which wobbles, sends 0). A slide along the key
//               stays on it; a glissando is a slide across the keys.
//   kb.set(key, on)  kb.focus(key)  kb.clearAll()  kb.labels(Map key → text)
//   kb.setBounds(lo, hi)   a new range (an instrument's compass opened or closed)

import { attachKeyboard } from './layout.js';

const BLACK = new Set([1, 3, 6, 8, 10]);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function createKeyboard(root, { lo, hi, onDown, onUp, onPressure }) {
  let wLo = lo, wHi = hi, focusKey = null, labelMap = new Map();
  const isDown = new Set(), els = new Map(), listeners = [], keyListeners = [], boundListeners = [];
  const keysChanged = () => { for (const fn of keyListeners) fn(isDown); };

  function build() {
    root.replaceChildren(); els.clear();
    let nw = 0;
    for (let m = wLo; m <= wHi; m++) if (!BLACK.has(m % 12)) nw++;
    const ww = 100 / nw;
    let wi = 0;
    for (let m = wLo; m <= wHi; m++) {
      const el = document.createElement('div');
      el.dataset.key = m;
      if (BLACK.has(m % 12)) { el.className = 'bk'; el.style.left = `${(wi - 0.32) * ww}%`; el.style.width = `${0.64 * ww}%`; }
      else {
        el.className = 'wk'; el.style.left = `${wi * ww}%`; el.style.width = `${ww}%`;
        if (m % 12 === 0) { const c = document.createElement('span'); c.className = 'c-label'; c.textContent = noteName(m); el.appendChild(c); }
        wi++;
      }
      const lbl = document.createElement('span'); lbl.className = 'k-label'; lbl.textContent = labelMap.get(m) ?? '';
      el.appendChild(lbl);
      el.classList.toggle('mapped', labelMap.has(m));
      el.classList.toggle('down', isDown.has(m));
      el.classList.toggle('focus', m === focusKey);
      root.appendChild(el); els.set(m, el);
    }
    for (const fn of listeners) fn(wLo, wHi);
  }

  // ---- pointers: each finger is independent; a key sounds while any finger is on it
  const fingers = new Map(), count = new Map();
  const press = (key, f) => { const n = (count.get(key) || 0) + 1; count.set(key, n); if (n === 1) onDown(key, f); };
  const release = (key) => { const n = (count.get(key) || 0) - 1; if (n > 0) { count.set(key, n); return; } count.delete(key); onUp(key); };
  const depth = (e, el) => {
    if (e.pointerType === 'pen' && e.pressure > 0) return clamp(e.pressure, 0, 1);
    const r = el.getBoundingClientRect();
    return clamp((e.clientY - r.top) / r.height, 0, 1);
  };
  const keyAt = (x, y) => { const el = document.elementFromPoint(x, y)?.closest?.('[data-key]'); return el && root.contains(el) ? el : null; };
  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-key]');
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try { root.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const key = +el.dataset.key, f = depth(e, el);
    fingers.set(e.pointerId, { key, f, y0: e.clientY, h: root.getBoundingClientRect().height, p: 0 });
    press(key, f);
  });
  root.addEventListener('pointermove', (e) => {
    const p = fingers.get(e.pointerId);
    if (!p) return;
    const el = keyAt(e.clientX, e.clientY);
    if (el && +el.dataset.key !== p.key) {
      // a glissando once the finger leaves the key sideways; up or down it is a lean (a black
      // key's finger slides onto the white key below it, and a white key's onto a black one)
      const r = els.get(p.key)?.getBoundingClientRect();
      if (!r || e.clientX < r.left || e.clientX >= r.right) {
        const key = +el.dataset.key;
        release(p.key); p.key = key; press(key, p.f); p.y0 = e.clientY; p.p = 0;
        return;
      }
    }
    if (!onPressure) return;
    const v = e.pointerType === 'pen' ? clamp(e.pressure, 0, 1) : clamp((Math.abs(e.clientY - p.y0) - 4) / (p.h / 3), 0, 1);
    if (Math.abs(v - p.p) > 0.01 || (v === 0) !== (p.p === 0)) { p.p = v; onPressure(p.key, v); }
  });
  const end = (e) => { const p = fingers.get(e.pointerId); if (!p) return; fingers.delete(e.pointerId); release(p.key); };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) root.addEventListener(ev, end);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  const kb = {
    set(m, on) { if (on) isDown.add(m); else isDown.delete(m); els.get(m)?.classList.toggle('down', on); keysChanged(); },
    focus(m) { focusKey = m; for (const [k, el] of els) el.classList.toggle('focus', k === m); },
    clearAll() { isDown.clear(); for (const el of els.values()) el.classList.remove('down'); keysChanged(); },
    labels(map) { labelMap = map; for (const [m, el] of els) { el.querySelector('.k-label').textContent = map.get(m) ?? ''; el.classList.toggle('mapped', map.has(m)); } },
    // the window onto the range (used by shared/layout.js)
    range: () => [wLo, wHi],
    bounds: () => [lo, hi],
    isBlack: (m) => BLACK.has(((m % 12) + 12) % 12),
    setWindow(a, b) {
      a = clamp(a, lo, hi); b = clamp(b, a, hi);
      if (a === wLo && b === wHi && els.size) return;
      wLo = a; wHi = b; build();
    },
    onWindow(fn) { listeners.push(fn); },
    setBounds(a, b) {
      if (a === lo && b === hi) return;
      lo = a; hi = b;
      wLo = clamp(wLo, lo, hi); wHi = clamp(wHi, wLo, hi);
      build();
      for (const fn of boundListeners) fn(lo, hi);
    },
    onBounds(fn) { boundListeners.push(fn); }, // fn(lo, hi), after setBounds
    onKeys(fn) { keyListeners.push(fn); }, // fn(set of keys down), on every change
  };
  build();
  attachKeyboard(kb);
  return kb;
}
