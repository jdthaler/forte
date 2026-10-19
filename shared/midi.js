// midi.js — Web MIDI for every page.
//
//   startMIDI({ onMIDI, status, button }) asks for MIDI access, listens to every input (and to any
//   plugged in later), and remembers the choice: the next page turns MIDI on by itself when the
//   browser still grants it (resumeMIDI). Each input's messages are cleaned on the way to onMIDI:
//   - a note-on for a note already down on that channel first lets it go (a re-strike, never two
//     presses that one note-off can't undo);
//   - a note-off for a note that isn't down is dropped;
//   - a device that goes away lets go of its notes and of its pedals (CC64, 66 and 67);
//   - until the page has had a click or a key press, notes are dropped with a toast saying so:
//     a MIDI key is not a user gesture, so the browser would not let it start the sound (and
//     MIDI turned on by resumeMIDI comes before any click).
//   wheelValue(p, cc, max?) maps the mod wheel onto a parameter: at rest (0) its default, fully up
//   its maximum, so a wheel at rest never drags the instrument to the bottom of its range.
//   touch() is the velocity curve the player chose (every page shares it, from the menu startMIDI
//   puts beside the #midi status), touched(v) a MIDI velocity (0..1) through it; SOFT_PEDAL
//   scales the velocity of keys struck under CC67; createSostenuto() keeps the keys CC66 holds.
//   mpeMode() is MPE's mode the player chose (shared/mpe.js: 'auto', 'on' or 'off'; every page
//   shares it, from a menu beside the velocity curve's).
//   The plugins do the same (native/plugin/plugin.cpp: kTouchGamma, kSoftPedal, sostenutoPedal, kMpeId).

import { MODES } from './mpe.js';

const KEY = 'forte/midi/v1';
const TOUCH_KEY = 'forte/touch/v1';
const MPE_KEY = 'forte/mpe/v1';

// The velocity curve: v^γ. Soft makes a light touch louder, Hard asks for a firmer one.
export const TOUCH = [{ name: 'Soft', gamma: 0.6 }, { name: 'Normal', gamma: 1 }, { name: 'Hard', gamma: 1.6 }];
export const SOFT_PEDAL = 0.6;
let touchIndex = 1;
try { const t = localStorage.getItem(TOUCH_KEY); if (t !== null && TOUCH[+t]) touchIndex = +t; } catch { /* storage blocked, or Node */ }
export const touch = () => touchIndex;
export function setTouch(i) {
  if (!TOUCH[i]) return;
  touchIndex = i;
  try { localStorage.setItem(TOUCH_KEY, String(i)); } catch { /* storage blocked */ }
}
export const touched = (v) => v ** TOUCH[touchIndex].gamma;
let mpe = 'auto';
try { const m = localStorage.getItem(MPE_KEY); if (MODES.some(([id]) => id === m)) mpe = m; } catch { /* storage blocked, or Node */ }
export const mpeMode = () => mpe;
export function setMpeMode(m) {
  if (!MODES.some(([id]) => id === m)) return;
  mpe = m;
  try { localStorage.setItem(MPE_KEY, m); } catch { /* storage blocked */ }
}
// Without the User Activation API (older browsers), let the notes through as before.
const mayPlay = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;
// (shell.js is imported here only when needed: the tools import this module in Node)
const needClick = () => import('./shell.js').then(({ toast }) => toast('MIDI is on: click the page once to let the browser make sound'));

export function startMIDI({ onMIDI, status = () => {}, button = null }) {
  if (!navigator.requestMIDIAccess) { status('No Web MIDI in this browser (try Chrome, Edge or Firefox)'); return; }
  navigator.requestMIDIAccess().then((acc) => {
    try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked */ }
    const down = new Map(); // input id → { notes: Set('channel:key'), pedals: Set('channel:cc') }
    const send = (data) => onMIDI({ data });
    const letGo = (id) => {
      const s = down.get(id);
      if (!s) return;
      for (const nk of s.notes) { const [ch, k] = nk.split(':').map(Number); send([0x80 | ch, k, 0]); }
      for (const pc of s.pedals) { const [ch, cc] = pc.split(':').map(Number); send([0xb0 | ch, cc, 0]); }
      down.delete(id);
    };
    const clean = (id, data) => {
      const [st, d1, d2] = data, cmd = st & 0xf0, ch = st & 0x0f, nk = `${ch}:${d1}`;
      let s = down.get(id);
      if (!s) down.set(id, (s = { notes: new Set(), pedals: new Set() }));
      if (cmd === 0x90 && d2 > 0 && !mayPlay()) { needClick(); return; }
      if (cmd === 0x90 && d2 > 0) { if (s.notes.has(nk)) send([0x80 | ch, d1, 0]); s.notes.add(nk); }
      else if (cmd === 0x80 || cmd === 0x90) { if (!s.notes.delete(nk)) return; }
      else if (cmd === 0xb0 && (d1 === 64 || d1 === 66 || d1 === 67)) { if (d2 >= 64) s.pedals.add(`${ch}:${d1}`); else s.pedals.delete(`${ch}:${d1}`); }
      else if (cmd === 0xb0 && (d1 === 120 || d1 === 123)) { s.notes.clear(); s.pedals.clear(); }
      send(data);
    };
    const bind = () => {
      const names = [];
      for (const inp of acc.inputs.values()) {
        if (inp.state === 'disconnected') { letGo(inp.id); continue; }
        names.push(inp.name);
        inp.onmidimessage = (ev) => clean(inp.id, ev.data);
      }
      for (const id of [...down.keys()]) if (!acc.inputs.has(id)) letGo(id);
      status(names.length ? `MIDI: ${names.join(', ')}` : 'MIDI: no devices');
    };
    bind();
    acc.onstatechange = bind;
    if (button) button.hidden = true;
    touchMenu();
    mpeMenu();
  }, () => status('MIDI: permission denied'));
}

// The velocity curve's menu, beside the MIDI status once MIDI is on.
function touchMenu() {
  const pill = document.querySelector('#midi');
  if (!pill || document.querySelector('#touch')) return;
  const el = document.createElement('select');
  el.id = 'touch';
  el.title = 'Velocity curve: how hard a MIDI key has to be struck. Soft makes a light touch louder, Hard asks for a firmer one.';
  el.setAttribute('aria-label', 'Velocity curve');
  TOUCH.forEach((t, i) => el.add(new Option(`Touch: ${t.name.toLowerCase()}`, i)));
  el.value = String(touchIndex);
  el.addEventListener('change', () => { setTouch(+el.value); el.blur(); });
  pill.after(el);
}

// MPE's menu, after the velocity curve's.
function mpeMenu() {
  const after = document.querySelector('#touch') ?? document.querySelector('#midi');
  if (!after || document.querySelector('#mpe')) return;
  const el = document.createElement('select');
  el.id = 'mpe';
  el.title = 'MPE: a controller that gives each note a MIDI channel of its own, so each finger bends, slides and presses its own note. Auto turns it on when the controller says it sends MPE.';
  el.setAttribute('aria-label', 'MPE');
  for (const [id, name] of MODES) el.add(new Option(`MPE: ${name.toLowerCase()}`, id));
  el.value = mpe;
  el.addEventListener('change', () => { setMpeMode(el.value); el.blur(); });
  after.after(el);
}

/**
 * The sostenuto pedal (CC66): it holds the keys sounding as it goes down, and only those, until
 * it comes up (a piano's middle pedal).
 *   set(on, sounding)  the pedal; sounding: the keys sounding now. Coming up, it returns the keys
 *                      it was holding: those no hand holds now are the page's to let go
 *   holds(key)         a key let go: true if the pedal keeps it sounding
 *   strike(key)        a key struck again (no longer the pedal's)
 */
export function createSostenuto() {
  let on = false;
  const caught = new Set(), holding = new Set();
  return {
    set(down, sounding) {
      if (down === on) return [];
      on = down;
      if (down) { for (const k of sounding) caught.add(k); return []; }
      const out = [...holding];
      caught.clear(); holding.clear();
      return out;
    },
    holds(key) { if (on && caught.has(key)) { holding.add(key); return true; } return false; },
    strike(key) { holding.delete(key); },
    keys: () => holding,
    clear() { on = false; caught.clear(); holding.clear(); },
  };
}

/** Turn MIDI on without a click when this site turned it on before and the browser still grants it. */
export async function resumeMIDI(start) {
  let wanted = false;
  try { wanted = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked */ }
  if (!wanted || !navigator.requestMIDIAccess || !navigator.permissions?.query) return;
  try {
    if ((await navigator.permissions.query({ name: 'midi' })).state === 'granted') start();
  } catch { /* 'midi' is not a permission this browser can be asked about: wait for the button */ }
}

/** The mod wheel (CC value 0..127) on parameter p: at rest its default, fully up `top` (its max). */
export function wheelValue(p, cc, top = p.max) {
  if (cc <= 0) return p.def;
  const u = cc / 127;
  let v = p.log ? p.def * (top / p.def) ** u : p.def + (top - p.def) * u;
  if (p.step) v = Math.round(v / p.step) * p.step;
  return Math.min(p.max, Math.max(p.min, v));
}
