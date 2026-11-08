// morph.js — Morph, the last group in every instrument page's Controls panel: one slider that
// takes the sound from one preset to another. user-presets.js attaches it with the presets:
//   From   a preset (the instrument's, Default settings or one of yours); choosing a preset
//          from the Presets menu makes it the one you morph from, with the slider back at 0
//   To     another; the Presets menu choosing it puts the slider at 100 %
//   Morph  0 % is From, 100 % is To: between, every parameter the presets set is part way
//          (shared/presets.js morph: numbers glide, a choice or a switch changes halfway)
// What a preset leaves alone when chosen (the page's `keep`: volume, room, venue, the tuning…)
// stays as it is. The three are kept in this browser, per instrument; they are in no preset or link.
// A plugin has the same three as parameters (native/plugin/plugin.cpp), so a song can automate it.

import { morph } from './presets.js';
import { unfocus } from './focus.js';
import { morphControl } from './midi.js';

const DEFAULT = 'default';

// attachMorph({ instrument, params, factory, mine, now, set, keep, shown }) once the page has its
// groups: factory is the instrument's presets [{ name, values }] and mine() yours, both complete
// by contract id; now() the page's values; set(values) applies them as a preset would; shown(key)
// puts the Presets menu on the preset a key names (null: none). Returns { refresh, picked }:
// refresh() after your presets change, picked(key) when the Presets menu plays one.
export function attachMorph({ instrument: I, params, factory, mine, now, set, keep = [], shown = () => {} }) {
  const groups = document.querySelector('#groups');
  if (!groups || !factory.length) return { refresh() {}, picked() {} };
  const STORE = `forte/${I.id}/morph/v1`;
  const kept = new Set(keep);

  const det = document.createElement('details');
  det.className = 'group forte-morph';
  det.open = true;
  det.innerHTML = `<summary>Morph</summary>
    <div class="param"><label for="forte-morph-from">From</label><select id="forte-morph-from" class="forte-display"></select></div>
    <div class="param"><label for="forte-morph-to">To</label><select id="forte-morph-to" class="forte-display"></select></div>
    <div class="param"><div class="row"><label for="forte-morph-t">Morph</label><span class="val"></span></div>
      <input type="range" id="forte-morph-t" min="0" max="1000" step="1">
      <div class="hint">Slide from one preset to another: every setting the two presets give moves part of the way, a number smoothly and a choice or a switch halfway across. Volume, the room and the tuning stay as you have them. Choosing a preset from the Presets menu makes it the one you morph from.</div></div>`;
  groups.appendChild(det);
  const from = det.querySelector('#forte-morph-from'), to = det.querySelector('#forte-morph-to');
  const slider = det.querySelector('#forte-morph-t'), val = det.querySelector('.val');
  val.dataset.widest = '100 %'; // its room, as it changes (shared/layout.css)

  // ---- the state, kept in this browser -------------------------------------------------------------
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { /* corrupt */ }
  const state = { from: String(s.from ?? DEFAULT), to: String(s.to ?? 'f:0'), t: Number.isFinite(s.t) ? Math.min(1, Math.max(0, s.t)) : 0 };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* storage off */ } };

  // a key's preset: 'default', 'f:<index>' (the instrument's) or 'u:<name>' (yours)
  const defaults = Object.fromEntries(params.map((p) => [p.id, p.def]));
  function valuesOf(key) {
    if (key.startsWith('f:')) return factory[+key.slice(2)]?.values;
    if (key.startsWith('u:')) return mine().find((pr) => pr.name === key.slice(2))?.values;
    return key === DEFAULT ? defaults : undefined;
  }

  function options(select, value) {
    const g = (label, list, pre) => {
      const og = document.createElement('optgroup');
      og.label = label;
      list.forEach((pr, i) => og.append(new Option(pr.name, pre === 'u:' ? pre + pr.name : pre + i)));
      return og;
    };
    select.replaceChildren(new Option('Default settings', DEFAULT), g('Presets', factory, 'f:'));
    if (mine().length) select.append(g('Your presets', mine(), 'u:'));
    select.value = value;
    return select.value === value;
  }
  function refresh() {
    if (!options(from, state.from)) { state.from = DEFAULT; from.value = DEFAULT; }
    if (!options(to, state.to)) { state.to = 'f:0'; to.value = state.to; }
    show();
  }
  function show() {
    slider.value = String(Math.round(state.t * 1000));
    slider.style.setProperty('--fill', `${state.t * 100}%`);
    val.textContent = `${Math.round(state.t * 100)} %`;
    slider.setAttribute('aria-valuetext', `${val.textContent} of the way from ${from.selectedOptions[0]?.text ?? ''} to ${to.selectedOptions[0]?.text ?? ''}`);
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
    shown(state.t === 0 ? state.from : state.t === 1 ? state.to : null);
  }
  const soon = () => { if (!frame) frame = requestAnimationFrame(apply); };

  slider.addEventListener('input', () => { state.t = +slider.value / 1000; show(); save(); soon(); });
  morphControl((v) => { state.t = Math.min(1, Math.max(0, v / 127)); show(); save(); soon(); }); // an FC-300's EXP 2 (shared/midi.js)
  slider.addEventListener('dblclick', () => { state.t = 0; show(); save(); soon(); });
  slider.addEventListener('change', () => unfocus(slider));
  for (const [sel, k] of [[from, 'from'], [to, 'to']]) {
    sel.addEventListener('change', () => { state[k] = sel.value; show(); save(); apply(); unfocus(sel); });
  }

  // the Presets menu played one: it is where the morph starts now, unless it is where it ends
  function picked(key) {
    if (!key) return;
    if (key === state.to && key !== state.from) state.t = 1;
    else { state.from = key; from.value = key; state.t = 0; }
    show(); save();
  }

  refresh();
  return { refresh, picked };
}
