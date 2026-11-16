// morph.js — Morph, inside the Presets section of every instrument page's drawer: a switch that
// lets the Presets menu morph, and with it on, a second menu under it and a slider that runs down
// between the two.
//   Off    the Presets menu plays one preset, as it always has
//   On     the Presets menu is the top of the morph, the menu under it the bottom, and the slider
//          how far down the sound is: at the top it is the top one's, at the bottom the bottom
//          one's; between, every parameter the two set is part way (shared/presets.js morph:
//          numbers glide, a choice or a switch changes halfway). Choosing a preset from the
//          Presets menu puts it at the top, with the slider there too. A control moved by hand
//          makes the top the sound as it is then, with the slider at the top: the preset it is,
//          or else a Custom configuration. Swap trades the top and the bottom, the slider turning
//          over with them, so the sound stays as it is
//   Off again puts the slider back at the top: the sound is the top one's once more. Keep this mix
//          switches it off leaving the sound and the controls where the slider put them, a new mix
//          to change or save
// An FC-300's EXP 2 moves the slider, toe down the top and heel down the bottom (Jesse,
// 2026-11-16: the way the foot leans), switching Morph on as it leaves the toe (shared/midi.js
// morphControl).
// What a preset leaves alone when chosen (the page's `keep`: volume, room, venue, the tuning…)
// stays as it is. The switch, the two ends and the slider are kept in this browser, per
// instrument; they are in no preset or link. A plugin has the same as parameters
// (native/plugin/plugin.cpp), so a song can automate it; its window has the same switch, menus,
// slider and Swap (native/plugin/editor.html).

import { morph, complete } from './presets.js';
import { unfocus } from './focus.js';
import { morphControl } from './midi.js';

export const CUSTOM = 'custom', CUSTOM_NAME = 'Custom configuration';
const SWAP = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 13V3M2 6l3-3 3 3M11 3v10M8 10l3 3 3-3"/></svg>';
const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

// attachMorph({ instrument, params, book, now, set, keep, rename, toast }) once the page has its
// presets. book is the menu's presets by key, 'default', 'f:<index>' (the instrument's) or
// 'u:<name>' (yours), from shared/user-presets.js: { factory (how many the instrument has),
// keys(), valuesOf(key) (complete by contract id), nameOf(key), match(values, prefer) (the key
// of the preset whose sound the values are, prefer tried first, or null) }. now() is the page's
// values; set(values) applies them as a preset would; rename() puts the Presets menu on the
// preset the sound is (with Morph on, on the top); toast(text) the page's. Returns { refresh,
// picked, moved, on, top }: refresh() after your presets change, picked(key) when the Presets
// menu plays one, moved() when a control moves by hand; on() whether Morph is on, top() the key at
// the top (CUSTOM: a custom configuration).
export function attachMorph({ instrument: I, params, book, now, set, keep = [], rename = () => {}, toast = () => {} }) {
  if (!book.factory) return { refresh() {}, picked() {}, moved() {}, on: () => false, top: () => null };
  const STORE = `forte/${I.id}/morph/v1`;
  const kept = new Set(keep);

  // the switch, at the head of the Presets section (shared/layout.js); under the menu, the slider
  // with Swap and its ⓘ, the bottom's menu and Keep this mix. On a page without a drawer, a group
  const head = el('div', 'forte-morph-switch');
  head.innerHTML = `<span id="forte-morph-label">Morph</span><button type="button" class="forte-slide" role="switch" aria-checked="false" aria-labelledby="forte-morph-label" title="Morph from the preset in the menu to another"><i></i></button>`;
  const det = el('div', 'forte-morph');
  det.innerHTML = `<p class="forte-morph-from" title="The top: the preset in the Presets menu">From <b></b></p>
    <div class="param forte-morph-fade" data-placed>
      <div class="forte-fader" id="forte-morph-t" role="slider" tabindex="0" aria-label="Morph" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="100" aria-describedby="forte-morph-hint"><i></i></div>
      <button type="button" class="forte-morph-swap" title="Swap the top and the bottom: the slider turns over with them, so the sound stays as it is">${SWAP}Swap</button>
      <button type="button" class="forte-info" aria-label="About Morph" aria-expanded="false" aria-controls="forte-morph-hint">i</button>
      <div class="hint" id="forte-morph-hint">Slide down from the preset at the top, the Presets menu, to the one at the bottom: every setting the two give moves part of the way, a number smoothly and a choice or a switch halfway down. Volume, the room and the tuning stay as you have them. Choosing a preset from the Presets menu puts it at the top. Moving a control yourself makes the top the sound as it is then, a custom configuration unless it is a preset’s, with the slider at the top. Swap trades the top and the bottom, leaving the sound as it is. Switching Morph off goes back to the top; Keep this mix switches it off and leaves the controls where the slider put them, to change or save as they are. An FC-300’s EXP 2 pedal moves the slider: toe down is the top, heel down the bottom.</div>
    </div>
    <select id="forte-morph-to" class="forte-display" aria-label="Morph to: the bottom" title="Morph to: the bottom"></select>
    <button type="button" class="forte-morph-keep">Keep this mix</button>`;
  const section = document.querySelector('#forte-drawer [data-drawer="presets"]');
  if (section) {
    section.querySelector('.forte-drawer-presets-head')?.append(head);
    section.append(det);
  } else {
    const box = el('details', 'group forte-morph-group');
    box.open = true;
    box.append(el('summary', '', 'Morph'), head, det);
    document.querySelector('#groups')?.append(box);
  }
  const sw = head.querySelector('.forte-slide'), to = det.querySelector('#forte-morph-to'), fade = det.querySelector('.forte-morph-fade');
  const fader = det.querySelector('.forte-fader'), cap = fader.querySelector('i'), info = det.querySelector('.forte-info');
  const keeper = det.querySelector('.forte-morph-keep');

  // ---- the state, kept in this browser: each end a preset's key or CUSTOM, with its values ------------
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { /* corrupt */ }
  const snap = (v) => (v && typeof v === 'object' ? complete(params, v) : null);
  const state = {
    on: s.on === true, from: String(s.from ?? 'default'), to: String(s.to ?? 'f:0'), t: s.on === true ? clamp01(s.t) : 0,
    custom: { from: snap(s.custom?.from), to: snap(s.custom?.to) },
  };
  const save = () => {
    const custom = { from: state.from === CUSTOM ? state.custom.from : undefined, to: state.to === CUSTOM ? state.custom.to : undefined };
    try { localStorage.setItem(STORE, JSON.stringify({ ...state, custom })); } catch { /* storage off */ }
  };
  const ends = (end) => (state[end] === CUSTOM ? state.custom[end] : book.valuesOf(state[end]));
  const name = (end) => (state[end] === CUSTOM ? CUSTOM_NAME : book.nameOf(state[end]));
  // the top is the sound as it is, with the slider there: the preset it is, or a custom configuration
  function anchor() {
    const v = now(), k = book.match(v, state.from);
    state.from = k ?? CUSTOM;
    state.custom.from = k ? null : v;
    state.t = 0;
  }

  function refresh() {
    const g = (label, keys) => {
      const og = document.createElement('optgroup');
      og.label = label;
      og.append(...keys.map((k) => new Option(book.nameOf(k), k)));
      return og;
    };
    const keys = book.keys();
    to.replaceChildren(new Option(book.nameOf('default'), 'default'), g('Presets', keys.filter((k) => k.startsWith('f:'))));
    const yours = keys.filter((k) => k.startsWith('u:'));
    if (yours.length) to.append(g('Your presets', yours));
    // a custom configuration that is a preset now (one you saved) is that preset; a preset of yours
    // gone from an end: the bottom goes back to the first preset, the top to the sound as it is
    for (const end of ['from', 'to']) {
      if (state[end] === CUSTOM) {
        const k = state.custom[end] && book.match(state.custom[end]);
        if (k) { state[end] = k; state.custom[end] = null; } else if (!state.custom[end]) state[end] = end === 'to' ? 'f:0' : 'default';
      } else if (!book.valuesOf(state[end])) {
        if (end === 'to') state.to = 'f:0'; else if (state.on) anchor(); else state.from = 'default';
      }
    }
    show();
  }
  function show() {
    sw.setAttribute('aria-checked', String(state.on));
    head.classList.toggle('on', state.on);
    det.hidden = !state.on;
    (section ?? det).classList.toggle('morphing', state.on);
    fader.style.setProperty('--t', String(state.t));
    const pct = Math.round(state.t * 100);
    fader.setAttribute('aria-valuenow', String(pct));
    fader.setAttribute('aria-valuetext', state.t === 0 ? `At the top, ${name('from')}` : state.t === 1 ? `At the bottom, ${name('to')}` : `${pct} % of the way down from ${name('from')} to ${name('to')}`);
    // the bottom's menu offers a custom configuration only while it is one
    let c = to.querySelector(`option[value="${CUSTOM}"]`);
    if (state.to === CUSTOM && !c) to.prepend(c = new Option(CUSTOM_NAME, CUSTOM));
    else if (state.to !== CUSTOM) c?.remove();
    to.value = state.to;
    det.querySelector('.forte-morph-from b').textContent = name('from');
    keeper.disabled = state.t === 0;
    keeper.title = state.t === 0 ? 'At the top the sound is the top preset’s: move the slider down to make a mix' : 'Switch Morph off, keeping the sound as it is now';
    document.querySelector('#preset')?.setAttribute('title', state.on ? 'Morph from: the top' : '');
  }

  // ---- the sound: at most one change a frame while the slider moves ---------------------------------
  let frame = 0, applying = false;
  function apply() {
    frame = 0;
    const a = ends('from'), b = ends('to');
    if (!a || !b) return;
    const v = morph(params, a, b, state.t), cur = now();
    for (const id of kept) if (Object.hasOwn(cur, id)) v[id] = cur[id];
    applying = true;
    try { set(v); } finally { applying = false; }
    rename();
  }
  const soon = () => { if (!frame) frame = requestAnimationFrame(apply); };
  const settle = () => { if (frame) { cancelAnimationFrame(frame); apply(); } }; // the slider's last move first
  function slide(t) {
    if (t === state.t) return;
    if (!state.on) { anchor(); state.on = true; rename(); }
    state.t = t;
    show(); save(); soon();
  }
  // on: the top is the sound as it is; off: back to the top, if the slider had left it
  function turn(on) {
    if (on === state.on) return;
    if (on) anchor();
    const back = !on && state.t > 0;
    state.on = on;
    if (!on) state.t = 0;
    show(); save();
    if (back) apply(); else rename();
  }
  // Keep this mix: off, the sound as it is
  function keepMix() {
    if (!state.on || state.t === 0) return;
    settle();
    const whole = state.t >= 1 && state.to !== CUSTOM ? name('to') : '';
    state.on = false; state.t = 0;
    show(); save(); rename();
    toast(whole ? `Playing “${whole}”.` : 'Kept the mix. To play it again later, save it from the Presets menu.');
  }
  // Swap: the top the bottom and the bottom the top, the slider turned over, the sound the same
  function swap() {
    settle();
    [state.from, state.to] = [state.to, state.from];
    [state.custom.from, state.custom.to] = [state.custom.to, state.custom.from];
    state.t = 1 - state.t;
    show(); save(); rename();
  }

  sw.addEventListener('click', () => { turn(!state.on); unfocus(sw); });
  head.querySelector('span').addEventListener('click', () => turn(!state.on));
  keeper.addEventListener('click', () => { keepMix(); unfocus(keeper); });
  det.querySelector('.forte-morph-swap').addEventListener('click', (e) => { swap(); unfocus(e.currentTarget); });
  info.addEventListener('click', () => { info.setAttribute('aria-expanded', String(fade.classList.toggle('hint-open'))); unfocus(info); });
  to.addEventListener('change', () => {
    state.to = to.value;
    if (state.to !== CUSTOM) state.custom.to = null;
    show(); save(); apply(); unfocus(to);
  });
  // the slider runs down, from the top (0) to the bottom (1): dragged by its cap, or touched where it
  // should go; the arrows (Shift: finer), Page Up and Down, Home (the top) and End; a double click
  // goes back to the top
  const along = (y) => {
    const r = fader.getBoundingClientRect(), h = cap.offsetHeight;
    return clamp01(Math.round(((y - r.top - h / 2) / Math.max(1, r.height - h)) * 1000) / 1000);
  };
  let grab = null;
  fader.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    fader.setPointerCapture?.(e.pointerId);
    const r = cap.getBoundingClientRect();
    grab = { id: e.pointerId, off: e.target === cap ? e.clientY - (r.top + r.height / 2) : 0 };
    slide(along(e.clientY - grab.off));
  });
  fader.addEventListener('pointermove', (e) => { if (grab?.id === e.pointerId) slide(along(e.clientY - grab.off)); });
  const letGo = (e) => { if (grab?.id === e.pointerId) grab = null; };
  fader.addEventListener('pointerup', letGo);
  fader.addEventListener('pointercancel', letGo);
  fader.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, PageDown: 10, PageUp: -10 }[e.key];
    const t = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : step ? state.t + (step * (e.shiftKey ? 0.1 : 1)) / 100 : null;
    if (t === null) return;
    e.preventDefault();
    slide(clamp01(Math.round(t * 1000) / 1000));
  });
  fader.addEventListener('dblclick', () => slide(0));
  // an FC-300's EXP 2 (shared/midi.js): toe down (127) the top, heel down (0) the bottom; it switches
  // Morph on as it leaves the toe
  morphControl((v) => { const t = clamp01(1 - v / 127); if (state.on || t > 0) slide(t); });

  refresh();
  return {
    refresh,
    // the Presets menu played one: it is the top now, with the slider there
    picked(key) {
      if (!key || !state.on) return;
      state.from = key; state.custom.from = null; state.t = 0;
      show(); save();
    },
    // a control moved by hand: the top is the sound as it is now
    moved() {
      if (!state.on || applying) return;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      anchor();
      show(); save();
    },
    on: () => state.on,
    top: () => state.from,
  };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
