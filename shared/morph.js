// morph.js — Morph, inside the Presets section of every instrument page's drawer: a switch that
// lets the Presets menu morph, and with it on, a second preset and a slider between the two.
//   Off    the Presets menu plays one preset, as it always has
//   On     the Presets menu is the preset you morph from, To the one you morph to, and the slider
//          how far: 0 % is From, 100 % is To; between, every parameter the presets set is part way
//          (shared/presets.js morph: numbers glide, a choice or a switch changes halfway).
//          Choosing a preset from the menu makes it From, with the slider back at 0
//   Off again puts the slider back at 0 %: the sound is the From preset's once more. Keep this mix
//          switches it off leaving the sound and the controls where the slider put them, a new mix
//          to change or save (at 100 %, it is To's, which the menu names)
// An FC-300's EXP 2 moves the slider, switching Morph on (shared/midi.js morphControl).
// What a preset leaves alone when chosen (the page's `keep`: volume, room, venue, the tuning…)
// stays as it is. The switch, From, To and the slider are kept in this browser, per instrument;
// they are in no preset or link. A plugin has the same as parameters (native/plugin/plugin.cpp),
// so a song can automate it; its window has the same switch (native/plugin/editor.html).

import { morph } from './presets.js';
import { unfocus } from './focus.js';
import { morphControl } from './midi.js';

const DEFAULT = 'default';

// attachMorph({ instrument, params, factory, mine, now, set, keep, shown, naming, toast }) once the page
// has its presets: factory is the instrument's presets [{ name, values }] and mine() yours, both
// complete by contract id; now() the page's values; set(values) applies them as a preset would;
// shown(key) puts the Presets menu on the preset a key names (null: none); naming() whether it
// names one now; toast(text) the page's. Returns { refresh, picked, moved, on, exact }: refresh() after your presets
// change, picked(key) when the Presets menu plays one, moved() when a control moves by hand; on()
// whether Morph is on (the menu then names From, whatever the sound), exact() whether the sound
// is From's as it was chosen (the slider at 0, nothing moved since).
export function attachMorph({ instrument: I, params, factory, mine, now, set, keep = [], shown = () => {}, naming = () => true, toast = () => {} }) {
  if (!factory.length) return { refresh() {}, picked() {}, moved() {}, on: () => false, exact: () => true };
  const STORE = `forte/${I.id}/morph/v1`;
  const kept = new Set(keep);

  // the switch, at the head of the Presets section (shared/layout.js), and under the menu To and
  // the slider; on a page without a drawer (a plugin's window shows the views alone), a group
  const head = el('div', 'forte-morph-switch');
  head.innerHTML = `<span id="forte-morph-label">Morph</span><button type="button" class="forte-slide" role="switch" aria-checked="false" aria-labelledby="forte-morph-label" title="Morph from the preset in the menu to another"><i></i></button>`;
  const det = el('div', 'forte-morph');
  det.innerHTML = `<p class="forte-morph-from" title="The preset in the Presets menu">From <b></b></p>
    <div class="param"><label for="forte-morph-to">To</label><select id="forte-morph-to" class="forte-display"></select></div>
    <div class="param"><div class="row"><label for="forte-morph-t">Morph</label><span class="val"></span></div>
      <input type="range" id="forte-morph-t" min="0" max="1000" step="1">
      <div class="hint">Slide from the preset in the Presets menu to the one in To: every setting the two presets give moves part of the way, a number smoothly and a choice or a switch halfway across. Volume, the room and the tuning stay as you have them. Choosing a preset from the menu makes it the one you morph from; switching Morph off goes back to it. Keep this mix switches Morph off and leaves the controls where the slider put them, to change or save as they are.</div></div>
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
  const sw = head.querySelector('.forte-slide'), to = det.querySelector('#forte-morph-to');
  const slider = det.querySelector('#forte-morph-t'), val = det.querySelector('.val'), keeper = det.querySelector('.forte-morph-keep');
  val.dataset.widest = '100 %'; // its room, as it changes (shared/layout.css)

  // ---- the state, kept in this browser -------------------------------------------------------------
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { /* corrupt */ }
  const t0 = Number.isFinite(s.t) ? Math.min(1, Math.max(0, s.t)) : 0;
  const state = { on: s.on === true || t0 > 0, from: String(s.from ?? DEFAULT), to: String(s.to ?? 'f:0'), t: t0 };
  let exact = false; // the sound is From's, as chosen
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* storage off */ } };

  // a key's preset: 'default', 'f:<index>' (the instrument's) or 'u:<name>' (yours)
  const defaults = Object.fromEntries(params.map((p) => [p.id, p.def]));
  function valuesOf(key) {
    if (key.startsWith('f:')) return factory[+key.slice(2)]?.values;
    if (key.startsWith('u:')) return mine().find((pr) => pr.name === key.slice(2))?.values;
    return key === DEFAULT ? defaults : undefined;
  }
  const nameOf = (key) => (key === DEFAULT ? 'Default settings' : key.startsWith('f:') ? factory[+key.slice(2)]?.name : key.slice(2)) ?? '';

  function refresh() {
    const g = (label, list, pre) => {
      const og = document.createElement('optgroup');
      og.label = label;
      list.forEach((pr, i) => og.append(new Option(pr.name, pre === 'u:' ? pre + pr.name : pre + i)));
      return og;
    };
    to.replaceChildren(new Option('Default settings', DEFAULT), g('Presets', factory, 'f:'));
    if (mine().length) to.append(g('Your presets', mine(), 'u:'));
    to.value = state.to;
    if (to.value !== state.to) { state.to = 'f:0'; to.value = state.to; }
    if (!valuesOf(state.from)) state.from = DEFAULT;
    show();
  }
  function show() {
    sw.setAttribute('aria-checked', String(state.on));
    head.classList.toggle('on', state.on);
    det.hidden = !state.on;
    (section ?? det).classList.toggle('morphing', state.on);
    slider.value = String(Math.round(state.t * 1000));
    slider.style.setProperty('--fill', `${state.t * 100}%`);
    val.textContent = `${Math.round(state.t * 100)} %`;
    det.querySelector('.forte-morph-from b').textContent = nameOf(state.from);
    slider.setAttribute('aria-valuetext', `${val.textContent} of the way from ${nameOf(state.from)} to ${nameOf(state.to)}`);
    keeper.disabled = state.t === 0;
    keeper.title = state.t === 0 ? 'At 0 % the sound is the From preset: move the slider to make a mix' : 'Switch Morph off, keeping the sound as it is now';
    document.querySelector('#preset')?.setAttribute('title', state.on ? 'Morph from' : '');
  }

  // ---- the sound: at most one change a frame while the slider moves ---------------------------------
  let frame = 0;
  function apply() {
    frame = 0;
    const a = valuesOf(state.from), b = valuesOf(state.to);
    if (!a || !b) return;
    const v = morph(params, a, b, state.t), cur = now();
    for (const id of kept) if (Object.hasOwn(cur, id)) v[id] = cur[id];
    set(v);
    exact = state.t === 0;
    shown(state.from);
  }
  const soon = () => { if (!frame) frame = requestAnimationFrame(apply); };
  // on: the menu names From; off: back to From, if the slider had left it (or the menu names
  // nothing, if a control has moved since)
  function turn(on) {
    if (on === state.on) return;
    if (on) exact = naming();
    state.on = on;
    const back = !on && state.t > 0;
    if (!on) state.t = 0;
    show(); save();
    if (back) apply(); else shown(on || exact ? state.from : null);
  }

  // Keep this mix: off, the sound as it is (at 100 %, To's, which is where the morph starts now)
  function keepMix() {
    if (!state.on || state.t === 0) return;
    if (frame) { cancelAnimationFrame(frame); apply(); } // the slider's last move first
    const whole = state.t >= 1;
    state.on = false; state.t = 0;
    if (whole) { state.from = state.to; exact = true; }
    show(); save();
    shown(whole ? state.from : null);
    toast(whole ? `Playing “${nameOf(state.from)}”.` : 'Kept the mix. To play it again later, save it from the Presets menu.');
  }

  sw.addEventListener('click', () => { turn(!state.on); unfocus(sw); });
  keeper.addEventListener('click', () => { keepMix(); unfocus(keeper); });
  head.querySelector('span').addEventListener('click', () => turn(!state.on));
  slider.addEventListener('input', () => { state.t = +slider.value / 1000; show(); save(); soon(); });
  // an FC-300's EXP 2 (shared/midi.js): it switches Morph on as it moves
  morphControl((v) => { state.t = Math.min(1, Math.max(0, v / 127)); state.on ||= state.t > 0; show(); save(); soon(); });
  slider.addEventListener('dblclick', () => { state.t = 0; show(); save(); soon(); });
  slider.addEventListener('change', () => unfocus(slider));
  to.addEventListener('change', () => { state.to = to.value; show(); save(); apply(); unfocus(to); });

  // the Presets menu played one: it is where the morph starts now, with the slider back at 0
  function picked(key) {
    if (!key) return;
    state.from = key; state.t = 0; exact = true;
    show(); save();
    if (state.on) shown(key); // (Default settings resets the page, which empties the menu)
  }

  refresh();
  if (state.on) queueMicrotask(() => shown(state.from)); // once the menu has its options
  return { refresh, picked, moved: () => { exact = false; }, on: () => state.on, exact: () => state.on ? exact && state.t === 0 : true };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
