// keyboard.js — the on-screen keyboard on every Forte page. Multi-touch,
// glissando (slide a finger across the keys), velocity from how far down the
// key you strike it (or from Apple Pencil pressure), and a window of a few
// octaves with ◀ ▶ shifting, for touch screens (set from shared/layout.js).
//
//   const kb = createKeyboard(root, { lo, hi, onDown(key, f), onUp(key) })
//   f ∈ [0, 1]: 0 at the top of the key, 1 at the front edge (map it to your velocity)
//   kb.set(key, on)  kb.focus(key)  kb.clearAll()  kb.labels(Map key → text)

import { attachKeyboard } from './layout.js';

const BLACK = new Set([1, 3, 6, 8, 10]);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function createKeyboard(root, { lo, hi, onDown, onUp }) {
  let wLo = lo, wHi = hi, octaves = 0, focusKey = null, labelMap = new Map();
  const isDown = new Set(), els = new Map(), listeners = [];

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

  // A window of n octaves from C to C (n = 0: every key), kept inside [lo, hi].
  function place(start) {
    if (!octaves || hi - lo <= 12 * octaves) { wLo = lo; wHi = hi; return; }
    const span = 12 * octaves;
    wLo = clamp(start, lo, hi - span);
    wHi = wLo + span;
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
    fingers.set(e.pointerId, { key, f });
    press(key, f);
  });
  root.addEventListener('pointermove', (e) => {
    const p = fingers.get(e.pointerId);
    if (!p) return;
    const el = keyAt(e.clientX, e.clientY);
    if (!el || +el.dataset.key === p.key) return;
    const key = +el.dataset.key;
    release(p.key); p.key = key; press(key, p.f);
  });
  const end = (e) => { const p = fingers.get(e.pointerId); if (!p) return; fingers.delete(e.pointerId); release(p.key); };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) root.addEventListener(ev, end);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  const kb = {
    set(m, on) { if (on) isDown.add(m); else isDown.delete(m); els.get(m)?.classList.toggle('down', on); },
    focus(m) { focusKey = m; for (const [k, el] of els) el.classList.toggle('focus', k === m); },
    clearAll() { isDown.clear(); for (const el of els.values()) el.classList.remove('down'); },
    labels(map) { labelMap = map; for (const [m, el] of els) { el.querySelector('.k-label').textContent = map.get(m) ?? ''; el.classList.toggle('mapped', map.has(m)); } },
    // window control (used by shared/layout.js)
    range: () => [wLo, wHi],
    bounds: () => [lo, hi],
    setOctaves(n, start) { octaves = n; place(start ?? 12 * Math.floor((wLo + wHi) / 24) - 12 * Math.floor(n / 2)); build(); },
    shift(d) { if (!octaves) return; place(wLo + d); build(); },
    onWindow(fn) { listeners.push(fn); },
  };
  build();
  attachKeyboard(kb);
  return kb;
}
