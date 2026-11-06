// layer.js — a second instrument on any instrument's page, layered with the page's (both play
// every key) or split from it (the second plays the keys below the split point, the page's
// instrument the rest), as in the Forte app (native/plugin/plugin.cpp, Suite).
//
// "+ Layer" in the keyboard bar (shared/layout.js) opens its panel: the second instrument, Layer or
// Split and the split point (any key, or the next one played), the second's preset and volume.
// The second plays with its settings from its own page, and its preset and volume here are its
// settings there too. Each page remembers its own second (localStorage forte/layer/v1).
//
// The page's instrument doesn't know: shared/taps.js gives the second its share of each note
// before the page sees it (MIDI in shared/midi.js, the keys on screen in shared/keyboard.js, the
// computer keys in each page). The second's engine runs in an AudioWorkletNode of its own on the
// page's audio context (shared/worklet.js), through its own output chain (shared/chain.js), and
// the two go out through one more limiter (chain.js limitTogether). The pedals, the wheels,
// aftertouch, bend, MPE and Panic reach both; a program change is the page's.

import { INSTRUMENTS, SECTIONS, byId, trimGain } from './registry.js';
import { createChain, onAudioContext, limitTogether } from './chain.js';
import { touched, SOFT_PEDAL, wheelValue, pageMpe, controllersOf, controlled } from './midi.js';
import { connectQuality } from './quality.js';
import { complete } from './presets.js';
import { tap } from './taps.js';

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const STORE = 'forte/layer/v1';
// where each instrument's page keeps its settings (the five older pages have their own names)
const OWN_STORES = { piano: 'ribbon-piano/params/v1', organ: 'tonewheel-organ/params/v1', tines: 'tine-piano/params/v1', huygens: 'huygens-keyboard/params/v1', blackhole: 'blackhole-keyboard/params/v1' };
export const paramsStore = (id) => OWN_STORES[id] ?? `forte/${id}/params/v1`;
export const SPLIT_KEYS = [24, 96]; // the split point's choices: C1 to C7

const page = () => document.body?.dataset.instrument;
const readAll = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}') ?? {}; } catch { return {}; } };
function remember() {
  const all = readAll();
  all[page()] = { id: state.id, mode: state.mode, split: state.split };
  try { localStorage.setItem(STORE, JSON.stringify(all)); } catch { /* storage blocked: for this visit */ }
}
function recall() {
  const s = readAll()[page()] ?? {};
  const ok = (id) => id && id !== page() && byId(id)?.ready;
  return { id: ok(s.id) ? s.id : null, mode: s.mode === 'split' ? 'split' : 'layer', split: Number.isInteger(s.split) ? clamp(s.split, ...SPLIT_KEYS) : 60 };
}

// The second's share of the keys: in a split, a key below the split point is the second's alone.
// own: the page plays it; other: the second does.
export function route(mode, split, key) {
  if (mode !== 'split') return { own: true, other: true };
  return key >= split ? { own: true, other: false } : { own: false, other: true };
}

let state = { id: null, mode: 'layer', split: 60 };
let second = null; // the instrument playing: { I, P, params, node, chain, sounding, latched, ... }
let kb = null, ui = null, learning = false;
let ctx = null;
onAudioContext((c) => { ctx = c; if (second && !second.node) wake(second); });

// ---- the second instrument ------------------------------------------------------------------------
async function load(id) {
  const { INSTRUMENT: I } = await import(new URL(`../${id}/src/${id}-instrument.js`, import.meta.url).href);
  await I.load?.();
  const params = [...I.groups, ...(I.console?.groups ?? [])].flatMap((g) => g.params);
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(paramsStore(id)) || 'null'); } catch { /* none */ }
  const P = { ...structuredClone(I.console?.defaults ?? {}), ...complete(params, stored ?? {}) };
  // a console's own state as the page keeps it (the organ's drawbars), when it was saved
  if (stored && I.console) for (const k of Object.keys(I.console.defaults ?? {})) if (Object.hasOwn(stored, k)) P[k] = stored[k];
  const s = { id, I, P, params, node: null, chain: null, queue: [], sounding: new Map(), latched: new Set(), sustain: false, soft: false, ccLast: {}, held: new Map() };
  s.mpe = pageMpe({ post: (m) => post(s, m), params: () => s.P, modWheel: I.modWheel, groups: I.groups });
  s.ccs = controllersOf(I);
  return s;
}
// its engine, on the page's audio context once there is one
async function wake(s) {
  if (s.node || s.waking || !ctx) return;
  s.waking = true;
  try {
    const bytes = await (await fetch(s.I.wasm.binary)).arrayBuffer();
    await ctx.audioWorklet.addModule(s.I.wasm.module);
    if (second !== s) return; // taken away meanwhile
    const node = new AudioWorkletNode(ctx, 'forte-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { wasm: { name: s.I.wasm.name, bytes } },
    });
    node.port.onmessage = (e) => { if (e.data?.type === 'error') toast(`${byId(s.id).name}: ${e.data.message}`); };
    s.chain = createChain(ctx, node, s.I.chain || {});
    s.chain.apply(s.P, trimGain(s.id));
    s.unquality = connectQuality(node, { toast });
    node.port.postMessage({ type: 'params', P: { ...s.P } });
    if (s.I.space === 'sustain') node.port.postMessage({ type: 'sustain', on: s.sustain });
    s.node = node;
    limitTogether(ctx, true);
    for (const m of s.queue.splice(0)) node.port.postMessage(m);
  } catch (err) {
    toast(`The second instrument didn't start: ${err.message}`);
  } finally { s.waking = false; }
}
function post(s, m) { if (s.node) s.node.port.postMessage(m); else { s.queue.push(m); if (s.queue.length > 500) s.queue.shift(); } }
function drop(s) {
  if (!s) return;
  post(s, { type: 'panic' });
  for (const k of s.sounding.keys()) kb?.setOther(k, false);
  if (s.node) {
    const { node, chain } = s;
    setTimeout(() => { chain.dispose(); node.disconnect(); node.port.close?.(); }, 60); // after the panic's fade
    s.unquality?.();
  }
  if (ctx) limitTogether(ctx, false);
}
function setParams(s, P, keep = true, swap = false) {
  s.P = P;
  post(s, { type: 'params', P: { ...P }, ...(swap && { swap }) }); // swap: a preset's change, faded across (shared/worklet.js)
  if (s.chain) s.chain.apply(P, trimGain(s.id));
  if (keep) { try { localStorage.setItem(paramsStore(s.id), JSON.stringify(P)); } catch { /* blocked */ } }
}

// ---- its notes --------------------------------------------------------------------------------------
// the keys it plays: its compass, or its whole range once that is opened
function rangeOf(s) {
  const c = s.I.compass;
  return c && !s.P[c.param] ? c.keys : s.I.range ?? [36, 96];
}
function down(s, key, vel, own) {
  const [lo, hi] = rangeOf(s);
  if (key < lo || key > hi) return;
  s.latched.delete(key);
  s.sounding.set(key, (s.sounding.get(key) || 0) + 1);
  for (const m of s.mpe.strike(key, own)) post(s, m);
  post(s, { type: 'noteOn', key, velocity: vel });
  kb?.setOther(key, true);
}
function up(s, key, velocity) {
  const n = (s.sounding.get(key) || 0) - 1;
  if (n > 0) { s.sounding.set(key, n); return; }
  if (n < 0) return;
  s.sounding.delete(key);
  if (s.I.space === 'hold' && s.sustain) { s.latched.add(key); return; }
  post(s, { type: 'noteOff', key, velocity });
  kb?.setOther(key, false);
}
function pedal(s, on) {
  if (s.sustain === on) return;
  s.sustain = on;
  if (s.I.space === 'sustain') post(s, { type: 'sustain', on });
  if (s.I.space === 'hold' && !on) { for (const k of s.latched) { post(s, { type: 'noteOff', key: k }); kb?.setOther(k, false); } s.latched.clear(); }
}
function panic(s) {
  s.sounding.clear(); s.latched.clear(); s.held.clear(); s.soft = false;
  s.sustain = false;
  post(s, { type: 'panic' });
  for (let k = 0; k < 128; k++) kb?.setOther(k, false);
}
// how hard: as the second's own page would play it
const velocityOf = (s, from, value) => {
  const I = s.I, mv = (v) => (I.midiVelocity ? I.midiVelocity(v) : v);
  if (from === 'midi') return mv(touched(value) * (s.soft ? SOFT_PEDAL : 1));
  if (from === 'screen') return mv(0.2 + 0.8 * value);
  return s.P.velocity ?? I.keyVelocity ?? 0.75;
};

// a key from the screen or the computer: the second's share, and whether the page has it
tap('key', (key, on, from, value) => {
  const s = second;
  if (!s && !learning) return true;
  if (learning && on) { learnt(key); return false; }
  const id = `${from}:${key}`;
  if (on) {
    const r = route(state.mode, state.split, key);
    s.held.set(id, r);
    if (r.other) down(s, key, velocityOf(s, from, value));
    return r.own;
  }
  const r = s.held.get(id) ?? { own: true, other: true };
  s.held.delete(id);
  if (r.other) up(s, key);
  return r.own;
});
// a MIDI message: notes by their key, the rest to both but a program change
tap('midi', (data) => {
  const s = second;
  if (!s && !learning) return true;
  const [st, d1, d2] = data, cmd = st & 0xf0;
  if (learning && cmd === 0x90 && d2 > 0) { learnt(d1); return false; }
  if (!s) return true;
  const { own: its, with: own } = s.mpe.midi(data);
  const id = `midi:${st & 15}:${d1}`;
  if (cmd === 0x90 && d2 > 0) {
    const r = route(state.mode, state.split, d1);
    s.held.set(id, r);
    if (r.other) down(s, d1, velocityOf(s, 'midi', d2 / 127), own);
    return r.own;
  }
  if (cmd === 0x80 || cmd === 0x90) {
    const r = s.held.get(id) ?? { own: true, other: true };
    s.held.delete(id);
    if (r.other) up(s, d1, cmd === 0x80 ? d2 / 127 : undefined);
    return r.own;
  }
  if (its) return true; // a member channel's bend, slide or pressure: each instrument's own decoder took it
  if (cmd === 0xb0) {
    if (d1 === 64) pedal(s, d2 >= 64);
    else if (d1 === 67) s.soft = d2 >= 64;
    else if (d1 === 1 && s.I.modWheel) {
      const mw = typeof s.I.modWheel === 'string' ? { param: s.I.modWheel } : s.I.modWheel;
      const p = s.params.find((q) => q.id === mw.param);
      if (p) setParams(s, { ...s.P, [p.id]: wheelValue(p, d2, mw.max ?? p.max) }, false);
    } else if (d1 === 120 || d1 === 123) panic(s);
    else {
      const set = controlled(s.ccs, s.params, s.P, d1, d2, s.ccLast);
      if (set) setParams(s, { ...s.P, [set[0]]: set[1] }, false);
    }
  } else if (cmd === 0xd0 || cmd === 0xa0) post(s, { type: 'pressure', value: (cmd === 0xd0 ? d1 : d2) / 127, key: cmd === 0xa0 ? d1 : null });
  else if (cmd === 0xe0) post(s, { type: 'bend', value: Math.max(-1, ((d2 << 7) + d1 - 8192) / 8191) });
  return true;
});
// the page's own pedal (Space, the on-screen pedal, CC64) and Panic reach the second too
if (typeof document !== 'undefined') {
  document.addEventListener('forte-sustain', (e) => { if (second) pedal(second, !!e.detail); });
  document.addEventListener('click', (e) => { if (second && e.target?.closest?.('#panic')) panic(second); });
}

// ---- choosing -------------------------------------------------------------------------------------
async function choose(id) {
  learning = false;
  const was = second;
  second = null;
  drop(was);
  state.id = id && byId(id)?.ready && id !== page() ? id : null;
  remember();
  if (!state.id) { shown(); return; }
  try {
    const s = await load(state.id);
    if (state.id !== id) return; // another choice meanwhile
    second = s;
    if (ctx) wake(s);
  } catch (err) {
    toast(`${byId(id).name} couldn't load: ${err.message}`);
    state.id = null; remember();
  }
  shown();
}
function arrange(mode, split = state.split) {
  learning = false;
  state.mode = mode === 'split' ? 'split' : 'layer';
  state.split = clamp(split, ...SPLIT_KEYS);
  remember();
  shown();
}
function learnt(key) { arrange('split', key); toast(`Split at ${noteName(clamp(key, ...SPLIT_KEYS))}: ${byId(state.id)?.name ?? 'the second'} below it`); }

// ---- the panel, and the keyboard's marks ------------------------------------------------------------
let toastTimer = 0;
function toast(msg) {
  const t = document.querySelector('#toast');
  if (!t) return;
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

// the keyboard's marks, the button and the panel as things are now
function shown() {
  const I = second?.I, entry = state.id && byId(state.id);
  const root = document.documentElement.style;
  if (entry) { root.setProperty('--layer-accent', entry.accent); root.setProperty('--layer-down', mix(entry.accent, 0.55)); }
  if (kb) {
    kb.extend(I ? rangeOf(second) : null);
    if (entry && state.mode === 'split') kb.mark((m) => (m >= state.split ? 'own' : 'other'), state.split);
    else kb.mark(null);
  }
  if (!ui) return;
  ui.button.replaceChildren();
  if (entry) {
    const dot = el('i', 'forte-layer-dot'); dot.style.background = entry.accent;
    ui.button.append(dot, el('span', 'forte-layer-name', entry.name));
    ui.button.title = `${entry.name} ${state.mode === 'split' ? `below ${noteName(state.split)}` : 'layered'}: change it or take it away`;
  } else { ui.button.append('+ Layer'); ui.button.title = 'Play a second instrument with this one: layered, or split across the keys'; }
  ui.button.classList.toggle('on', !!entry);
  ui.pick.value = state.id ?? '';
  ui.more.hidden = !entry;
  for (const b of ui.modes) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  ui.at.hidden = state.mode !== 'split';
  ui.split.value = learning ? 'learn' : String(state.split);
  if (second) {
    const presets = second.I.presets ?? [];
    ui.preset.replaceChildren(new Option('Its settings', ''), ...presets.map((p, i) => new Option(p.name, i)));
    ui.preset.value = '';
    ui.preset.parentNode.hidden = !presets.length;
    const v = second.I.chain?.volume && second.params.find((p) => p.id === second.I.chain.volume);
    ui.volumeRow.hidden = !v;
    if (v) { ui.volume.min = v.min; ui.volume.max = v.max; ui.volume.step = v.step ?? (v.max - v.min) / 1000; ui.volume.value = second.P[v.id]; ui.volumeText.textContent = v.fmt ? v.fmt(second.P[v.id]) : String(second.P[v.id]); }
    ui.link.href = `../${state.id}/`;
    ui.link.textContent = `Its page, for every setting →`;
  }
  ui.note.textContent = entry ? (state.mode === 'split' ? `${entry.name} plays the keys below ${noteName(state.split)}, this one from there up.` : `${entry.name} plays every key with this one.`) : 'A second instrument plays with this one, on every key or on the keys below a split.';
}
function mix(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  if (hex.length !== 7 || Number.isNaN(n)) return hex;
  return `rgb(${[n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t)).join(',')})`;
}

// The keyboard bar's button and its panel (shared/layout.js puts the button in the bar). Returns
// the button and the panel, or null on a page that isn't an instrument's.
export function attachLayer(keyboard) {
  if (!page() || !byId(page())) return null;
  kb = keyboard;
  state = recall();
  const button = el('button', 'forte-layer');
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  const pop = el('div', 'forte-keys-pop forte-layer-pop');
  pop.id = 'forte-layer-pop';
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'A second instrument');
  button.setAttribute('aria-controls', pop.id);
  const head = el('div', 'forte-layer-row');
  const pick = el('select');
  pick.setAttribute('aria-label', 'Second instrument');
  pick.add(new Option('No second instrument', ''));
  for (const sec of SECTIONS) {
    const g = el('optgroup'); g.label = sec.short;
    for (const i of INSTRUMENTS) if (i.section === sec.id && i.ready && i.id !== page()) g.appendChild(new Option(i.name, i.id));
    if (g.children.length) pick.appendChild(g);
  }
  pick.addEventListener('change', () => { pick.blur(); choose(pick.value); });
  head.append(el('span', 'forte-layer-label', 'Second instrument'), pick);
  const note = el('p', 'forte-layer-note');
  const more = el('div', 'forte-layer-more');
  const seg = el('div', 'forte-seg forte-layer-modes');
  seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'How the two share the keys');
  const modes = [['layer', 'Layer', 'Both play every key'], ['split', 'Split', 'The second plays the keys below the split, this one the rest']].map(([m, name, title]) => {
    const b = el('button', '', name); b.type = 'button'; b.dataset.mode = m; b.title = title;
    b.addEventListener('click', () => { b.blur(); arrange(m); });
    seg.appendChild(b);
    return b;
  });
  const at = el('label', 'forte-layer-at', 'at ');
  const split = el('select');
  split.setAttribute('aria-label', 'Split point: the second instrument plays the keys below it');
  for (let m = SPLIT_KEYS[0]; m <= SPLIT_KEYS[1]; m++) split.add(new Option(noteName(m), m));
  split.add(new Option('Press a key…', 'learn'));
  split.addEventListener('change', () => {
    split.blur();
    if (split.value !== 'learn') { arrange('split', +split.value); return; }
    learning = true;
    toast('Press the key this instrument starts on');
  });
  at.appendChild(split);
  const modeRow = el('div', 'forte-layer-row');
  modeRow.append(seg, at);
  const preset = el('select');
  preset.setAttribute('aria-label', 'The second instrument\'s preset');
  preset.addEventListener('change', () => {
    preset.blur();
    if (!second || preset.value === '') return;
    const I = second.I, keep = Object.fromEntries((I.keep ?? []).map((k) => [k, second.P[k]]));
    const defaults = { ...structuredClone(I.console?.defaults ?? {}), ...Object.fromEntries(second.params.map((p) => [p.id, p.def])) };
    const chosen = preset.value;
    setParams(second, { ...defaults, ...keep, ...I.presets[+chosen].p }, true, true);
    shown();
    preset.value = chosen;
  });
  const volumeRow = el('label', 'forte-layer-row forte-layer-volume');
  const volume = el('input'); volume.type = 'range';
  const volumeText = el('span', 'val');
  volumeRow.append(el('span', 'forte-layer-label', 'Volume'), volume, volumeText);
  volume.addEventListener('input', () => {
    if (!second) return;
    const id = second.I.chain.volume, p = second.params.find((q) => q.id === id);
    setParams(second, { ...second.P, [id]: +volume.value });
    volumeText.textContent = p.fmt ? p.fmt(+volume.value) : volume.value;
  });
  const link = el('a', 'forte-layer-link');
  const presetRow = el('label', 'forte-layer-row');
  presetRow.append(el('span', 'forte-layer-label', 'Preset'), preset);
  more.append(modeRow, presetRow, volumeRow, link);
  pop.append(head, more, note);
  const open = (on) => { pop.hidden = !on; button.setAttribute('aria-expanded', String(on)); };
  button.addEventListener('click', () => { open(pop.hidden); button.blur(); });
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !button.contains(e.target)) open(false); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  ui = { button, pick, more, modes, at, split, preset, volume, volumeRow, volumeText, link, note };
  if (state.id) choose(state.id); else shown();
  return { button, pop };
}
