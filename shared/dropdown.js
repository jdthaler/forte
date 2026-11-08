// dropdown.js — what a dropdown opens, drawn as Forte's panels are. A <select> pressed with a
// mouse or a trackpad opens a bevelled panel, as the instrument menu in the title does
// (shared/forte.css): its choices in rows, the chosen one lit by a lamp in the instrument's colour,
// its groups headed in small engraved capitals. A finger keeps the system's own picker (the iPhone's
// wheel, Android's sheet), and so does a dropdown opened from the keyboard (Tab, then Space or
// Alt+Down), which screen readers know. The <select> stays the control: a pick sets its value
// and fires its input and change events, as the system's list would, so no page changes.
// Imported by shared/layout.js on every page, and by the plugins' window (native/plugin/editor.html).

const CSS = `
.forte-dropdown {
  position: fixed; z-index: 2147483000; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain;
  padding: 5px; border-radius: 9px; border: 1px solid #060608;
  background: linear-gradient(180deg, #24242a, #18181c 90px);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.09), 0 12px 34px rgb(0 0 0 / 0.65), 0 2px 6px rgb(0 0 0 / 0.5);
  font: 13px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; color: #ebebef;
  -webkit-user-select: none; user-select: none;
}
.forte-dropdown:focus { outline: none; }
.forte-dropdown-group {
  margin: 7px 8px 3px; color: #8a8a96; font: 600 10.5px/1.2 "Arial Narrow", "Roboto Condensed", "Helvetica Neue", system-ui, sans-serif;
  letter-spacing: 0.7px; text-transform: uppercase;
}
.forte-dropdown-group:first-child { margin-top: 3px; }
.forte-dropdown-option {
  position: relative; padding: 5px 12px 5px 26px; border-radius: 6px; cursor: pointer; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; border: 1px solid transparent;
}
.forte-dropdown-option::before { /* its lamp: dark, and lit for the one chosen */
  content: ""; position: absolute; left: 9px; top: 50%; width: 7px; height: 7px; margin-top: -3.5px; border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #34343a, #151518); box-shadow: inset 0 1px 1px rgb(0 0 0 / 0.8), 0 1px 0 rgb(255 255 255 / 0.06);
}
.forte-dropdown-option[aria-selected="true"]::before {
  background: radial-gradient(circle at 40% 35%, #fff, var(--accent, #f0b35a) 55%);
  box-shadow: 0 0 7px var(--accent, #f0b35a);
}
.forte-dropdown-option[aria-selected="true"] { color: #fff; }
.forte-dropdown-option.active { /* the row the pointer or the arrows are on: pressed into the panel */
  background: linear-gradient(180deg, #111114, #1b1b20); border-color: #060608;
  box-shadow: inset 0 1px 3px rgb(0 0 0 / 0.7), 0 1px 0 rgb(255 255 255 / 0.05);
}
.forte-dropdown-option[aria-disabled="true"] { opacity: 0.45; cursor: default; }
`;

let installed = false, open = null, lastPointer = 'mouse';

/** Install the panel for every <select> in this document (once). */
export function installDropdowns() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  document.addEventListener('pointerdown', (e) => {
    lastPointer = e.pointerType;
    if (open && !open.panel.contains(e.target) && e.target !== open.sel) close();
  }, true);
  document.addEventListener('mousedown', (e) => {
    const sel = e.target?.closest?.('select');
    if (!sel || e.button !== 0 || lastPointer !== 'mouse' || sel.multiple || sel.size > 1 || sel.disabled) return;
    e.preventDefault(); // the system's list stays shut
    if (open?.sel === sel) { close(); return; }
    close();
    sel.focus({ preventScroll: true });
    show(sel);
  }, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('scroll', (e) => { if (open && !open.panel.contains(e.target)) close(); }, true);
  addEventListener('resize', () => close());
  addEventListener('blur', () => close());
}

function show(sel) {
  const panel = document.createElement('div');
  panel.className = 'forte-dropdown';
  panel.setAttribute('role', 'listbox');
  panel.setAttribute('aria-label', sel.getAttribute('aria-label') || sel.title || sel.labels?.[0]?.textContent || 'Choices');
  const accent = getComputedStyle(sel).getPropertyValue('--accent').trim();
  if (accent) panel.style.setProperty('--accent', accent);
  const rows = [];
  let group = null;
  for (const o of sel.options) {
    if (o.hidden) continue;
    const g = o.parentElement?.tagName === 'OPTGROUP' ? o.parentElement : null;
    if (g && g !== group) {
      const h = document.createElement('div');
      h.className = 'forte-dropdown-group';
      h.textContent = g.label;
      panel.appendChild(h);
    }
    group = g;
    const r = document.createElement('div');
    r.className = 'forte-dropdown-option';
    r.setAttribute('role', 'option');
    r.textContent = o.label || o.text;
    r.title = r.textContent;
    r.setAttribute('aria-selected', String(o.selected));
    const disabled = o.disabled || g?.disabled;
    if (disabled) r.setAttribute('aria-disabled', 'true');
    r.addEventListener('pointerenter', () => { if (!disabled) activate(rows.indexOf(entry)); });
    r.addEventListener('click', () => { if (!disabled) choose(o); });
    const entry = { r, o, disabled };
    rows.push(entry);
    panel.appendChild(r);
  }
  document.body.appendChild(panel);
  sel.classList.add('forte-open');
  open = { sel, panel, rows, at: -1 };
  place(sel, panel);
  const at = rows.findIndex((x) => x.o.selected);
  activate(at >= 0 ? at : rows.findIndex((x) => !x.disabled), true);
}

function place(sel, panel) {
  const r = sel.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, gap = 4, margin = 8;
  const width = Math.min(Math.max(r.width, 180), vw - 2 * margin);
  panel.style.minWidth = `${width}px`;
  panel.style.maxWidth = `${Math.max(width, Math.min(420, vw - 2 * margin))}px`;
  const below = vh - r.bottom - gap - margin, above = r.top - gap - margin;
  const natural = panel.scrollHeight + 2;
  const down = natural <= below || below >= above;
  const room = Math.max(120, down ? below : above);
  panel.style.maxHeight = `${room}px`;
  const h = Math.min(natural, room);
  panel.style.top = `${Math.max(margin, down ? r.bottom + gap : r.top - gap - h)}px`;
  const w = panel.getBoundingClientRect().width;
  panel.style.left = `${Math.max(margin, Math.min(r.left, vw - margin - w))}px`;
}

function activate(i, center) {
  if (!open || i < 0 || i >= open.rows.length) return;
  open.rows[open.at]?.r.classList.remove('active');
  open.at = i;
  const { r } = open.rows[i], p = open.panel;
  r.classList.add('active');
  if (center) p.scrollTop = r.offsetTop - (p.clientHeight - r.offsetHeight) / 2;
  else if (r.offsetTop < p.scrollTop) p.scrollTop = r.offsetTop - 5;
  else if (r.offsetTop + r.offsetHeight > p.scrollTop + p.clientHeight) p.scrollTop = r.offsetTop + r.offsetHeight - p.clientHeight + 5;
}

function step(dir) {
  const rows = open.rows;
  for (let i = open.at + dir; i >= 0 && i < rows.length; i += dir) if (!rows[i].disabled) { activate(i); return; }
}

function onKey(e) {
  if (!open) return;
  const k = e.key;
  if (k === 'ArrowDown' || k === 'ArrowUp') step(k === 'ArrowDown' ? 1 : -1);
  else if (k === 'Home' || k === 'End') { const order = open.rows.map((_, i) => i); if (k === 'End') order.reverse(); const i = order.find((j) => !open.rows[j].disabled); if (i !== undefined) activate(i); }
  else if (k === 'Enter' || k === ' ') { const x = open.rows[open.at]; if (x && !x.disabled) choose(x.o); else close(); }
  else if (k === 'Escape') close();
  else { close(); return; } // anything else (a note's key, Tab): the list shuts and the key goes on
  e.preventDefault();
  e.stopPropagation();
}

function choose(o) {
  const { sel } = open;
  close();
  sel.focus({ preventScroll: true });
  if (o.selected) return; // as the system's list: picking what is shown changes nothing
  o.selected = true;
  sel.dispatchEvent(new Event('input', { bubbles: true }));
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

function close() {
  if (!open) return;
  open.panel.remove();
  open.sel.classList.remove('forte-open');
  open = null;
}
