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
//   shares it, from a menu beside the velocity curve's); pageMpe() decodes it for a page.
//   FADERS are a controller's five touch controls (a Seaboard RISE's three faders and XY pad):
//   controllersOf(I) is the descriptor's controllers with its `faders` among them, controlled(…)
//   what one of them sets, ccValue(p, v) a controller across a parameter's whole range.
//   A Seaboard plays as MPE from the start: startMIDI announces its zone for it.
//   A foot controller (a Roland FC-300 as it comes) works on every page, in startMIDI:
//   - SWITCHES: its general-purpose switches CC80, 81 and 82 are the sustain, sostenuto and soft
//     pedals (CC64, 66, 67), so they do whatever those do on each instrument;
//   - the volume (CC7) and expression (CC11) pedals turn the page's output down (pedalGain, which
//     shared/chain.js applies after the limiter): full until a pedal moves, silent heel down;
//     an instrument that maps CC11 itself (an organ's swell) keeps it;
//   - a program change n plays the menu's preset n + 1 (pedal 1 the first preset, then your own
//     after the instrument's): choosePreset.
//   The plugins do the same (native/plugin/plugin.cpp: kTouchGamma, kSoftPedal, sostenutoPedal,
//   kMpeId, controller, footSwitch, levels, programChange; the faders reach them as the
//   descriptor's controllers).

import { MODES, createMpe, bendRatio } from './mpe.js';

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

/**
 * A foot controller's switches as the pedals Forte knows: CC80 (General Purpose 5) is the
 * sustain pedal, CC81 the sostenuto, CC82 the soft pedal. A Roland FC-300 sends them from its
 * CTL 1 and CTL 2 pedals and the toe switch of its EXP 1 pedal.
 */
export const SWITCHES = { 80: 64, 81: 66, 82: 67 };

/**
 * The volume (CC7) and expression (CC11) pedals: one gain on the output, (v/127)² for each
 * (General MIDI's 40·log10), so both at the top (127, and before either moves) leave the
 * instrument as it is and a pedal heel down silences it.
 */
const levels = { 7: 127, 11: 127 };
const gainListeners = new Set();
export const levelGain = (v7, v11) => (v7 / 127) ** 2 * (v11 / 127) ** 2;
export const pedalGain = () => levelGain(levels[7], levels[11]);
/** fn(gain) now and whenever a pedal moves; returns a function that stops it. */
export function onPedalGain(fn) { gainListeners.add(fn); fn(pedalGain()); return () => gainListeners.delete(fn); }
export function setLevel(cc, v) {
  if (!(cc in levels)) return;
  v = Math.min(127, Math.max(0, v | 0));
  if (levels[cc] === v) return;
  levels[cc] = v;
  const g = pedalGain();
  for (const fn of gainListeners) fn(g);
}

/**
 * Program change n: the page's preset menu (#preset) plays its preset n + 1, counting the
 * instrument's presets and then your own (shared/user-presets.js), as the menu lists them. A
 * toast says which, or that there is no such preset.
 */
export function choosePreset(n) {
  const sel = typeof document !== 'undefined' && document.querySelector('#preset');
  if (!sel) return;
  const presets = [...sel.options].filter((o) => o.value !== '' && (!o.value.startsWith('__') || o.value.startsWith('__user:')));
  const o = presets[n];
  import('./shell.js').then(({ toast }) => toast(o ? `Preset ${n + 1}: ${o.text}` : `No preset ${n + 1} here (there are ${presets.length})`), () => {});
  if (!o) return;
  sel.value = o.value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * startMIDI({ onMIDI, status, button, controllers }): controllers is the page's map of the
 * controllers its instrument takes (controllersOf): one it maps (an organ's CC11) is the
 * instrument's and not the shared one's.
 */
export function startMIDI({ onMIDI, status = () => {}, button = null, controllers = {} }) {
  if (!navigator.requestMIDIAccess) { status('No Web MIDI in this browser (try Chrome, Edge or Firefox)'); return; }
  navigator.requestMIDIAccess().then((acc) => {
    try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked */ }
    const down = new Map(); // input id → { notes: Set('channel:key'), pedals: Set('channel:cc'), levels: Set(cc) }
    const send = (data) => onMIDI({ data });
    const mine = (cc) => Object.hasOwn(controllers, cc); // the instrument's own
    const letGo = (id) => {
      const s = down.get(id);
      if (!s) return;
      for (const nk of s.notes) { const [ch, k] = nk.split(':').map(Number); send([0x80 | ch, k, 0]); }
      for (const pc of s.pedals) { const [ch, cc] = pc.split(':').map(Number); send([0xb0 | ch, cc, 0]); }
      for (const cc of s.levels) setLevel(cc, 127); // a volume pedal unplugged heel down: full again
      down.delete(id);
    };
    const clean = (id, data) => {
      // a foot controller's switches are the pedals (SWITCHES), unless the instrument maps them
      if ((data[0] & 0xf0) === 0xb0 && SWITCHES[data[1]] && !mine(data[1])) data = [data[0], SWITCHES[data[1]], data[2]];
      const [st, d1, d2] = data, cmd = st & 0xf0, ch = st & 0x0f, nk = `${ch}:${d1}`;
      let s = down.get(id);
      if (!s) down.set(id, (s = { notes: new Set(), pedals: new Set(), levels: new Set() }));
      if (cmd === 0xc0) choosePreset(d1);
      if (cmd === 0xb0 && (d1 === 7 || d1 === 11) && !mine(d1)) { setLevel(d1, d2); if (d2 < 127) s.levels.add(d1); else s.levels.delete(d1); }
      if (cmd === 0xb0 && d1 === 121) { for (const cc of [7, 11]) if (!mine(cc)) setLevel(cc, 127); s.levels.clear(); } // Reset All Controllers
      if (cmd === 0x90 && d2 > 0 && !mayPlay()) { needClick(); return; }
      if (cmd === 0x90 && d2 > 0) { if (s.notes.has(nk)) send([0x80 | ch, d1, 0]); s.notes.add(nk); }
      else if (cmd === 0x80 || cmd === 0x90) { if (!s.notes.delete(nk)) return; }
      else if (cmd === 0xb0 && (d1 === 64 || d1 === 66 || d1 === 67)) { if (d2 >= 64) s.pedals.add(`${ch}:${d1}`); else s.pedals.delete(`${ch}:${d1}`); }
      else if (cmd === 0xb0 && (d1 === 120 || d1 === 123)) { s.notes.clear(); s.pedals.clear(); }
      send(data);
    };
    const seaboards = new Set();
    const bind = () => {
      const names = [];
      for (const inp of acc.inputs.values()) {
        if (inp.state === 'disconnected') { letGo(inp.id); seaboards.delete(inp.id); continue; }
        names.push(inp.name);
        inp.onmidimessage = (ev) => clean(inp.id, ev.data);
        // A Seaboard sends MPE (notes on channels 2–16, each bending ±48 semitones, ROLI
        // Dashboard's defaults) but may not say so: announce its lower zone of 15 for it, as the
        // MPE Configuration Message would (MPE on Auto then decodes it; Off still ignores it)
        if (/seaboard/i.test(inp.name ?? '') && !seaboards.has(inp.id)) {
          seaboards.add(inp.id);
          for (const [d1, d2] of [[101, 0], [100, 6], [6, 15], [101, 127], [100, 127]]) send([0xb0, d1, d2]);
        }
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

/**
 * A page's MPE (shared/mpe.js, in the mode the player chose): each note's own bend, slide and
 * pressure as the engine's messages, which shared/shell.js and the pages with their own MIDI post.
 *   const notes = pageMpe({ post, params: () => P, modWheel })   (modWheel: the descriptor's, or none)
 *   const r = notes.midi(data)   r.own: MPE's own message (the page does nothing more with it);
 *                                r.with: a note-on's own expression, to post just before its noteOn
 *   notes.strike(key, own)       what to post before a key's noteOn: its own (r.with), or, for a note
 *                                without, a reset if the key had some
 * A bend becomes { type: 'noteBend', key, value: the frequency ratio along the tuning }, a slide
 * { type: 'slide', key, value: the mod wheel's parameter as the wheel would set it (NaN: none) },
 * pressure { type: 'pressure', value, key }.
 */
export function pageMpe({ post, params, modWheel, groups = [] }) {
  const wheel = modWheel && (typeof modWheel === 'string' ? { param: modWheel } : modWheel);
  const p = wheel && groups.flatMap((g) => g.params).find((q) => q.id === wheel.param);
  const expressed = new Set(); // keys the engine was given their own bend or slide
  let gathering = null;        // a note-on's own, gathered to go with it
  const express = (m) => { expressed.add(m.key); if (gathering) gathering.push(m); else post(m); };
  const mpe = createMpe({
    noteBend: (key, semitones) => express({ type: 'noteBend', key, value: bendRatio(params(), key, semitones) }),
    noteSlide: (key, u) => { if (p) express({ type: 'slide', key, value: Number.isNaN(u) ? NaN : wheelValue(p, u * 127, wheel.max ?? p.max) }); },
    notePressure: (key, value) => post({ type: 'pressure', value, key }),
  });
  let on = false;
  return {
    mpe,
    midi(data) {
      mpe.mode = mpeMode();
      gathering = (data[0] & 0xf0) === 0x90 && data[2] > 0 ? [] : null;
      const own = mpe.midi(data), got = gathering;
      gathering = null;
      if (mpe.active() !== on) {
        on = mpe.active();
        if (mpe.mode === 'auto') import('./shell.js').then(({ toast }) => toast(on ? `MPE on: each note on a channel of its own (${mpe.members(0) + mpe.members(1)} channels)` : 'MPE off'));
      }
      return { own, with: got?.length ? got : undefined };
    },
    strike(key, own) {
      if (own) return own;
      if (!expressed.has(key)) return [];
      expressed.delete(key);
      return [{ type: 'noteBend', key, value: 1 }, { type: 'slide', key, value: NaN }];
    },
  };
}

/**
 * A controller's five touch controls, as a Seaboard RISE sends them in its MIDI mode (white
 * lights; ROLI Dashboard can move them to other CCs): three faders, then the XY pad's X and Y.
 * An instrument's descriptor gives each a parameter in `faders` ([fader 1, 2, 3, X, Y]).
 */
export const FADERS = [[107, 'Fader 1'], [109, 'Fader 2'], [111, 'Fader 3'], [113, 'Pad X'], [114, 'Pad Y']];

/** The MIDI controllers a descriptor maps (CC → a parameter's id, or a switch): its `controllers` and its `faders`. */
export function controllersOf(I) {
  const out = {};
  (I.faders ?? []).forEach((id, i) => { if (id && FADERS[i]) out[FADERS[i][0]] = id; });
  return { ...out, ...I.controllers };
}

/**
 * A controller (0..127) across parameter p's whole range, as its slider moves it (in log(value)
 * for a log one): a checkbox is on at 64 and above, a choice's options follow in turn.
 */
export function ccValue(p, v) {
  const u = Math.min(1, Math.max(0, v / 127));
  if (p.type === 'checkbox') return v >= 64;
  if (p.type === 'select') return p.options[Math.round(u * (p.options.length - 1))][0];
  let x = p.log ? p.min * (p.max / p.min) ** u : p.min + (p.max - p.min) * u;
  if (p.step) x = Math.round(x / p.step) * p.step;
  return Math.min(p.max, Math.max(p.min, x));
}

/**
 * What controller cc at v sets, from the map controllersOf gives: [param id, value], or null.
 * A switch ({ param, values: [a, b] }: b from 64 up; { param, toggle: [a, b] }: flipped by each
 * press) leaves alone a parameter on neither of its values. `last` keeps each controller's last
 * value (a press is a rise through 64); `P` the page's parameters; `params` their descriptions.
 */
export function controlled(map, params, P, cc, v, last) {
  const before = last[cc] ?? 0, c = map[cc];
  last[cc] = v;
  if (c === undefined) return null;
  if (typeof c === 'object') {
    const [a, b] = c.values ?? c.toggle, now = P[c.param];
    if (now !== a && now !== b) return null;
    if (c.values) return [c.param, v >= 64 ? b : a];
    return v >= 64 && before < 64 ? [c.param, now === a ? b : a] : null;
  }
  const p = params.find((q) => q.id === c);
  return p ? [c, ccValue(p, v)] : null;
}

// The first time a fader or the pad moves a control, a toast says which
const told = new Set();
export function tellFader(cc, p) {
  const f = FADERS.find(([n]) => n === cc);
  if (!f || !p || told.has(cc)) return;
  told.add(cc);
  import('./shell.js').then(({ toast }) => toast(`${f[1]} (CC${cc}): ${p.label}`));
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
