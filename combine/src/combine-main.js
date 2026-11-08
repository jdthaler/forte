// combine-main.js — the Combinations page: up to four of Forte's instruments played together from
// one keyboard, each on the keys it is given (the same keys layer them, keys apart split them),
// with its own octave, preset and level, as a pedalboard holds pedals.
//
// Each instrument is hosted from its descriptor alone (<slug>/src/<slug>-instrument.js), as the
// Forte app hosts it: its WebAssembly engine in an AudioWorkletNode of its own (shared/worklet.js),
// through its own output chain (shared/chain.js), then its level, into the page's Volume and one
// more limiter on the sum (chain.js SUM_LIMITER). It comes onto the page as it was left on its own
// page (its settings in this browser), and keeps its settings here from then on; its Presets menu
// names the preset it plays (until a control moves its settings), and can take its settings from
// its page again, or one of your own presets for it from there. The page's own Presets menu has
// the starting combinations, then your own (combine-mine.js). Notes from the screen, the computer keys, MIDI and Songs
// reach each instrument whose keys they fall on (combine-params.js routed); the pedals, the
// wheels, aftertouch, bend, MPE and Panic reach every one.

import { INSTRUMENTS, SECTIONS, FORTE_VERSION, byId, trimGain, paramsStore } from '../../shared/registry.js';
import { createChain, createLimiter, SUM_LIMITER } from '../../shared/chain.js';
import { createKeyboard } from '../../shared/keyboard.js';
import { startMIDI, resumeMIDI, pageMIDI, touched, SOFT_PEDAL, wheelValue, pageMpe, controllersOf, controlled } from '../../shared/midi.js';
import { connectQuality, qualityControl } from '../../shared/quality.js';
import { complete, pick, presetParams } from '../../shared/presets.js';
import { withExpression, slideOf } from '../../shared/expression.js';
import { controlOwns, unfocus } from '../../shared/focus.js';
import { SpectrumView, SpectrogramView, animate, fit, css } from '../../shared/views.js';
import { MAX_PARTS, KEYS, OCTAVES, LEVEL, VOLUME, STORE, COMBINATIONS, noteName, part, label, routed, describe, restore } from './combine-params.js';
import { attachMine } from './combine-mine.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const dB = (x) => 10 ** (x / 20);
const keyFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const fmtDb = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)} dB`;
const nameOf = (id) => byId(id)?.name ?? id;
const ready = (id) => typeof id === 'string' && !!byId(id)?.ready;

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

// ---- what is kept ---------------------------------------------------------------------------------
let saved = null;
try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { /* none, or corrupt */ }
const state = restore(saved, ready);
let parts = []; // { uid, id, lo, hi, oct, level, on, preset, P, I, params, node, chain, gain, queue, sounding, latched, … }
let uids = 0;
function save() {
  const all = { volume: state.volume, combination: state.combination, parts: parts.map(({ id, lo, hi, oct, level, on, preset, P }) => ({ id, lo, hi, oct, level, on, preset, P })) };
  try { localStorage.setItem(STORE, JSON.stringify(all)); } catch { /* storage blocked: for this visit */ }
}

// ---- an instrument, from its descriptor --------------------------------------------------------------
const consoleDefaults = (I) => structuredClone(I.console?.defaults ?? {});
const defaultsOf = (s) => ({ ...consoleDefaults(s.I), ...Object.fromEntries(s.params.map((p) => [p.id, p.def])) });
// as it was left on its own page
function ownSettings(s) {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(paramsStore(s.id)) || 'null'); } catch { /* none */ }
  return settings(s, stored);
}
// values made whole against the instrument's parameters, with a console's state (the organ's
// drawbars): as a page keeps it, or from its parameters' values where they are a preset's
function settings(s, values) {
  const P = { ...consoleDefaults(s.I), ...complete(s.params, values ?? {}) };
  const C = s.I.console;
  if (values && C) {
    // a page's P has the console's own state (the drawbars as one array), a preset only its parameters
    const ids = new Set(C.groups.flatMap((g) => g.params.map((p) => p.id)));
    const page = Object.keys(C.defaults ?? {}).some((k) => !ids.has(k) && Object.hasOwn(values, k));
    if (page) { for (const k of Object.keys(C.defaults ?? {})) if (Object.hasOwn(values, k)) P[k] = values[k]; }
    else Object.assign(P, C.put(P, P));
  }
  return P;
}
// a preset, as its page plays one: the defaults, what the instrument keeps across presets, the preset
function presetOf(s, i) {
  const keep = Object.fromEntries((s.I.keep ?? []).map((k) => [k, s.P[k]]));
  return { ...defaultsOf(s), ...keep, ...s.I.presets[i].p };
}
// your own presets for it, saved on its own page (shared/user-presets.js): [{ name, values }]
function yoursFor(id) {
  let s = [];
  try { s = JSON.parse(localStorage.getItem(`forte/${id}/presets/v1`) || '[]'); } catch { /* none, or corrupt */ }
  return (Array.isArray(s) ? s : []).filter((pr) => pr && typeof pr.name === 'string' && pr.values && typeof pr.values === 'object');
}
// the settings a part's Presets menu names (combine-params.js label), or null when there is no such preset
function settingsOf(s, what) {
  if (what === 'own') return ownSettings(s);
  if (what === 'default') return defaultsOf(s);
  const name = what?.slice(2);
  if (what?.startsWith('f:')) { const i = (s.I.presets ?? []).findIndex((p) => p.name === name); return i >= 0 ? presetOf(s, i) : null; }
  if (what?.startsWith('u:')) { const pr = yoursFor(s.id).find((p) => p.name === name); return pr ? settings(s, pr.values) : null; }
  return null;
}
// its settings by its contract's parameter ids, as a preset has them (shared/presets.js)
const valuesOf = (s) => (s.I ? pick(presetParams(s.I), s.I.console ? { ...s.P, ...s.I.console.get(s.P) } : s.P) : { ...(s.P ?? {}) });
// the keys its engine plays: its compass, or its whole range once that is opened
function rangeOf(s) {
  const c = s.I.compass;
  return c && !s.P[c.param] ? c.keys : s.I.range ?? [36, 96];
}

// its descriptor, and its settings: those it was given, or else those its Presets menu names
async function load(s) {
  const { INSTRUMENT: I } = await import(new URL(`../../${s.id}/src/${s.id}-instrument.js`, import.meta.url).href);
  await I.load?.();
  s.I = I;
  s.params = [...withExpression(I.groups), ...(I.console?.groups ?? [])].flatMap((g) => g.params); // with its Expression switches (shared/expression.js)
  const given = !!s.P;
  s.P = given ? settings(s, s.P) : ownSettings(s);
  if (!given && s.preset !== 'own') {
    const P = settingsOf(s, s.preset);
    if (P) s.P = P; else s.preset = 'own';
  }
  s.mpe = pageMpe({ post: (m) => post(s, m), params: () => s.P, slide: slideOf(I), groups: I.groups });
  s.ccs = controllersOf(I);
  refreshControllers();
  if (ctx) wake(s);
}
// its engine, on the page's audio context once there is one
async function wake(s) {
  if (s.node || s.waking || !ctx || !s.I) return;
  s.waking = true;
  try {
    const bytes = await (await fetch(s.I.wasm.binary)).arrayBuffer();
    await ctx.audioWorklet.addModule(s.I.wasm.module);
    if (!parts.includes(s)) return; // taken off meanwhile
    const node = new AudioWorkletNode(ctx, 'forte-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { wasm: { name: s.I.wasm.name, bytes }, keyVelocity: s.I.keyVelocity },
    });
    node.port.onmessage = (e) => {
      const m = e.data;
      if (m?.type === 'stats') { s.load = m.load; s.peak = m.peak ?? m.load; s.voices = m.voices; showLoad(); }
      else if (m?.type === 'error') toast(`${nameOf(s.id)}: ${m.message}`);
    };
    node.onprocessorerror = () => toast(`${nameOf(s.id)} stopped. Take it off and add it again.`);
    s.gain = ctx.createGain();
    s.gain.gain.value = dB(s.level);
    s.gain.connect(bus);
    s.chain = createChain(ctx, node, s.I.chain || {}, s.gain);
    s.chain.apply(s.P, trimGain(s.id));
    s.unquality = connectQuality(node, { toast });
    node.port.postMessage({ type: 'params', P: { ...s.P } });
    if (s.I.space === 'sustain') node.port.postMessage({ type: 'sustain', on: s.sustain });
    s.node = node;
    for (const m of s.queue.splice(0)) node.port.postMessage(m);
  } catch (err) {
    toast(`${nameOf(s.id)} didn't start: ${err.message}`);
  } finally { s.waking = false; }
}
function post(s, m) { if (s.node) s.node.port.postMessage(m); else { s.queue.push(m); if (s.queue.length > 500) s.queue.shift(); } }
function dispose(s) {
  post(s, { type: 'panic' });
  s.unquality?.();
  if (s.node) {
    const { node, chain, gain } = s;
    setTimeout(() => { chain.dispose(); gain.disconnect(); node.disconnect(); node.port.close?.(); }, 60); // after the panic's fade
  }
  s.node = null;
}
function setParams(s, P, swap = false) {
  s.P = P;
  post(s, { type: 'params', P: { ...P }, ...(swap && { swap }) }); // swap: a preset's change, faded across (shared/worklet.js)
  if (s.chain) s.chain.apply(P, trimGain(s.id));
  save();
}
// a control (a MIDI controller's) moved a part's settings: its menu and the page's name no preset now
function moved(s) {
  if (s.preset !== null) { s.preset = null; if (s.menu) s.menu.value = ''; }
  edited();
}

// ---- the parts --------------------------------------------------------------------------------------
// a part: spec { id, lo, hi, oct, level, on, preset } (preset: what its menu names, combine-params.js
// label), with its settings P, or else those of the preset named (as on its own page without one)
function add(spec, P = null) {
  if (parts.length >= MAX_PARTS || !ready(spec.id)) return null;
  const s = {
    uid: ++uids, ...part(spec), preset: label(spec.preset) ?? (P ? null : 'own'), P, I: null, params: [], node: null, chain: null, gain: null, queue: [],
    sounding: new Map(), latched: new Set(), sustain: pedalDown, soft: false, ccLast: {}, load: 0, peak: 0, menu: null,
  };
  parts.push(s);
  load(s).then(() => { save(); draw(); }, (err) => {
    toast(`${nameOf(spec.id)} couldn't load: ${err.message}`);
    remove(s);
  });
  return s;
}
function remove(s) {
  const i = parts.indexOf(s);
  if (i < 0) return;
  for (const [src, list] of held) held.set(src, list.filter(([p]) => p !== s));
  parts.splice(i, 1);
  dispose(s);
  refreshControllers(); showLoad(); save(); draw();
}
// a combination in place of the instruments here: a starting one, or one of yours (each part with its values)
function combine(c, mine = false) {
  panic();
  for (const s of [...parts]) { parts.splice(parts.indexOf(s), 1); dispose(s); }
  state.combination = mine ? `u:${c.name}` : c.name;
  basis = c.name;
  for (const spec of c.parts) add(spec, spec.values ?? null);
  save(); draw(); showCombination();
}
const live = () => parts.filter((s) => s.I);
// what the parts' instruments take as their own controllers (an organ's CC11): theirs, not the page's
const ccs = {};
function refreshControllers() {
  for (const k of Object.keys(ccs)) delete ccs[k];
  for (const s of live()) Object.assign(ccs, s.ccs);
}

// ---- notes --------------------------------------------------------------------------------------------
// a part's note: own is the note's own expression (MPE), posted just before it
function down(s, key, vel, own) {
  s.latched.delete(key);
  s.sounding.set(key, (s.sounding.get(key) || 0) + 1);
  for (const m of s.mpe.strike(key, own)) post(s, m);
  post(s, { type: 'noteOn', key, velocity: vel });
}
function up(s, key, velocity) {
  const n = (s.sounding.get(key) || 0) - 1;
  if (n > 0) { s.sounding.set(key, n); return; }
  if (n < 0) return;
  s.sounding.delete(key);
  if (s.I.space === 'hold' && s.sustain) { s.latched.add(key); return; }
  post(s, { type: 'noteOff', key, velocity });
}
function pedal(s, on) {
  if (s.sustain === on) return;
  s.sustain = on;
  if (!s.I) return;
  if (s.I.space === 'sustain') post(s, { type: 'sustain', on });
  if (s.I.space === 'hold' && !on) { for (const k of s.latched) post(s, { type: 'noteOff', key: k }); s.latched.clear(); }
}
// how hard: as each instrument's own page would play it
function velocityOf(s, from, value) {
  const I = s.I, mv = (v) => (I.midiVelocity ? I.midiVelocity(v) : v);
  if (from === 'midi') return mv(touched(value) * (s.soft ? SOFT_PEDAL : 1));
  if (from === 'screen') return mv(0.2 + 0.8 * value);
  return s.P.velocity ?? I.keyVelocity ?? 0.75;
}

// Each key down, from wherever it came ('screen:60', 'keys:KeyZ', 'midi:0:60'), and the parts and
// keys it plays, so that its note-off goes where its note-on went whatever changes meanwhile.
const held = new Map();
const lit = new Map(); // a key on screen: how many sources hold it
let learning = null;   // { s, end: 'lo' | 'hi' }: the next key played sets a part's lowest or highest key
let lastKey = 60;
function noteOn(src, key, from, value, decoded = null) {
  if (held.has(src)) noteOff(src, key);
  if (learning) { learnt(key); return; }
  if (!ctx) start();
  const list = [];
  for (const s of live()) {
    const k = routed(s, key, rangeOf(s));
    if (k === null) continue;
    down(s, k, velocityOf(s, from, value), decoded?.get(s)?.with);
    list.push([s, k]);
  }
  held.set(src, list);
  lit.set(key, (lit.get(key) || 0) + 1);
  kb.set(key, true);
  lastKey = key;
  spectrum.set(keyFreq(key));
}
function noteOff(src, key, velocity) {
  const list = held.get(src);
  if (!list) return;
  held.delete(src);
  for (const [s, k] of list) if (parts.includes(s) && s.I) up(s, k, velocity);
  const n = (lit.get(key) || 1) - 1;
  if (n > 0) lit.set(key, n); else { lit.delete(key); kb.set(key, false); }
}
let pedalDown = false;
function setSustain(on) {
  pedalDown = on;
  for (const s of parts) pedal(s, on);
  const h = $('#hold');
  if (h) { h.textContent = on ? 'on' : 'off'; h.className = on ? 'on' : 'off'; }
  document.dispatchEvent(new CustomEvent('forte-sustain', { detail: on })); // the on-screen pedal and Latch follow
}
function panic() {
  held.clear(); lit.clear();
  for (const s of parts) {
    s.sounding.clear(); s.latched.clear(); s.soft = false;
    if (s.I && s.sustain && s.I.space === 'sustain') post(s, { type: 'sustain', on: false });
    s.sustain = false;
    post(s, { type: 'panic' });
  }
  if (pedalDown) setSustain(false);
  kb?.clearAll();
}

// ---- MIDI: notes by their keys, the rest to every instrument ---------------------------------------------
function onMIDI(ev) {
  const [st, d1, d2] = ev.data, cmd = st & 0xf0, ch = st & 15;
  const decoded = new Map(live().map((s) => [s, s.mpe.midi(ev.data)])); // each instrument's MPE
  if (cmd === 0x90 && d2 > 0) { noteOn(`midi:${ch}:${d1}`, d1, 'midi', d2 / 127, decoded); return; }
  if (cmd === 0x80 || cmd === 0x90) { noteOff(`midi:${ch}:${d1}`, d1, cmd === 0x80 ? d2 / 127 : undefined); return; }
  if (cmd === 0xb0 && d1 === 64) { setSustain(d2 >= 64); return; }
  if (cmd === 0xb0 && (d1 === 120 || d1 === 123)) { panic(); return; }
  for (const s of live()) {
    if (decoded.get(s).own) continue; // a member channel's bend, slide or pressure: its own decoder took it
    if (cmd === 0xb0) {
      if (d1 === 67 && !(67 in s.ccs)) s.soft = d2 >= 64;
      else if (d1 === 1 && s.I.modWheel) {
        const mw = typeof s.I.modWheel === 'string' ? { param: s.I.modWheel } : s.I.modWheel;
        const p = s.params.find((q) => q.id === mw.param);
        if (p) { setParams(s, { ...s.P, [p.id]: wheelValue(p, d2, mw.max ?? p.max) }); moved(s); }
      } else {
        const set = controlled(s.ccs, s.params, s.P, d1, d2, s.ccLast);
        if (set) { setParams(s, { ...s.P, [set[0]]: set[1] }); moved(s); }
      }
    } else if (cmd === 0xd0) post(s, { type: 'pressure', value: d1 / 127, key: null });
    else if (cmd === 0xa0) for (const [p, k] of held.get(`midi:${ch}:${d1}`) ?? []) { if (p === s) post(s, { type: 'pressure', value: d2 / 127, key: k }); }
    else if (cmd === 0xe0) post(s, { type: 'bend', value: Math.max(-1, ((d2 << 7) + d1 - 8192) / 8191) });
  }
}
function initMIDI() {
  startMIDI({ onMIDI, status: (t) => { $('#midi').textContent = t; }, button: $('#midi-btn'), controllers: ccs });
}
pageMIDI({ onMIDI, controllers: ccs }); // a song from a MIDI file (shared/songs.js) plays as a keyboard would

// ---- audio ----------------------------------------------------------------------------------------------
let ctx = null, bus = null, starting = null;
function start() {
  if (ctx) { if (ctx.state !== 'running') ctx.resume(); return Promise.resolve(ctx); }
  if (starting) return starting;
  starting = (async () => {
    const c = new AudioContext({ latencyHint: 'interactive' });
    if (!c.audioWorklet) throw new Error(window.isSecureContext ? 'this browser has no AudioWorklet support' : 'audio needs a secure page — open it with https://');
    await c.audioWorklet.addModule(new URL('../../shared/worklet.js', import.meta.url)); // forte-processor, and the limiters
    const master = c.createGain();
    master.gain.value = dB(state.volume);
    const limiter = createLimiter(c, SUM_LIMITER);
    master.connect(limiter).connect(c.destination);
    const analyser = c.createAnalyser(); analyser.fftSize = 8192; analyser.smoothingTimeConstant = 0.55;
    limiter.connect(analyser);
    spectrum.setAnalyser(analyser);
    bus = master; ctx = c;
    if (c.state !== 'running') await c.resume();
    const btn = $('#start');
    btn.textContent = `Audio on · ${(c.sampleRate / 1000).toFixed(1)} kHz`; btn.classList.add('running');
    for (const s of parts) wake(s);
    return c;
  })();
  starting.catch((err) => { toast(`Audio failed to start: ${err.message}`); starting = null; ctx = null; });
  return starting;
}
// every instrument's share of the audio thread, together
function showLoad() {
  const c = $('#cpu');
  if (!c || !ctx) return;
  const on = parts.filter((s) => s.node), load = on.reduce((a, s) => a + (s.load || 0), 0), peak = on.reduce((a, s) => a + (s.peak || 0), 0);
  const pct = (x) => `${(x * 100).toFixed(0)} %`;
  c.textContent = `CPU ${pct(load)}`;
  c.title = `${pct(load)} of the time available, on average, for ${on.length} instrument${on.length === 1 ? '' : 's'}: ${on.map((s) => `${nameOf(s.id)} ${pct(s.load || 0)}`).join(', ')}. A block over 100 % is an audible dropout.`;
  c.classList.toggle('hot', peak > 0.8);
}

// ---- the computer keys --------------------------------------------------------------------------------
const LOW = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM', 'Comma', 'KeyL', 'Period', 'Semicolon', 'Slash'];
const LOW_LBL = ['z', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', 'm', ',', 'l', '.', ';', '/'];
const HIGH = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU', 'KeyI', 'Digit9', 'KeyO', 'Digit0', 'KeyP', 'BracketLeft', 'Equal', 'BracketRight'];
const HIGH_LBL = ['q', '2', 'w', '3', 'e', 'r', '5', 't', '6', 'y', '7', 'u', 'i', '9', 'o', '0', 'p', '[', '=', ']'];
let base = 48;
const codeToKey = (code) => { let i = LOW.indexOf(code); if (i >= 0) return base + i; i = HIGH.indexOf(code); return i >= 0 ? base + 12 + i : null; };
const labels = () => { const m = new Map(); LOW_LBL.forEach((l, i) => m.set(base + i, l)); HIGH_LBL.forEach((l, i) => { if (!m.has(base + 12 + i)) m.set(base + 12 + i, l); }); return m; };
const typing = (t) => t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox'].includes(t.type)));
const keysDown = new Map(); // code → key
let spaceHeld = false;
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
  if (controlOwns(e)) return; // a control reached with Tab keeps its own keys (shared/focus.js)
  if (e.target?.tagName === 'SELECT') { if (e.code === 'Space' || e.code.startsWith('Arrow') || codeToKey(e.code) !== null) e.target.blur(); else return; }
  if (e.code === 'Space') { e.preventDefault(); if (e.isTrusted) spaceHeld = true; if (!e.repeat) setSustain(true); return; }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); shiftOctave(e.code === 'ArrowLeft' ? -12 : 12); return; }
  const key = codeToKey(e.code);
  if (key === null) return;
  e.preventDefault();
  if (e.repeat || keysDown.has(e.code)) return;
  keysDown.set(e.code, key);
  noteOn(`keys:${e.code}`, key, 'keys');
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !controlOwns(e)) { if (e.isTrusted) spaceHeld = false; setSustain(false); return; }
  const key = keysDown.get(e.code);
  if (key !== undefined) { keysDown.delete(e.code); noteOff(`keys:${e.code}`, key); }
});
// losing focus means no keyup will come: let go of the keys held, and a held Space bar
const letGo = () => { for (const [code, key] of keysDown) noteOff(`keys:${code}`, key); keysDown.clear(); if (spaceHeld) { spaceHeld = false; setSustain(false); } };
window.addEventListener('blur', letGo);
document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });
function shiftOctave(d) {
  const nb = base + d;
  if (nb + 11 < KEYS[0] || nb > KEYS[1] - 12) return;
  for (const [code, key] of keysDown) noteOff(`keys:${code}`, key);
  keysDown.clear(); base = nb; kb.labels(labels()); help();
}
function help() { $('#oct').textContent = `${noteName(Math.max(KEYS[0], base))}–${noteName(Math.min(KEYS[1], base + 31))}`; }

// ---- the keys on screen -----------------------------------------------------------------------------
const kb = createKeyboard($('#keyboard'), {
  lo: KEYS[0], hi: KEYS[1],
  onDown: (key, f) => noteOn(`screen:${key}`, key, 'screen', f),
  onUp: (key) => noteOff(`screen:${key}`, key),
  onPressure: (key, value) => { for (const [s, k] of held.get(`screen:${key}`) ?? []) post(s, { type: 'pressure', value, key: k }); }, // as MIDI poly aftertouch
});
kb.labels(labels());
help();
const colourOf = (s) => byId(s.id)?.accent ?? '#999';
const zones = () => kb.zones(parts.length ? (m) => parts.map((s) => (s.on && m >= s.lo && m <= s.hi ? colourOf(s) : null)) : null);

// ---- the views --------------------------------------------------------------------------------------
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum });
const lanes = $('#lanes');
animate(() => {
  const { ctx: g, w, h } = fit(lanes);
  g.clearRect(0, 0, w, h);
  const n = KEYS[1] - KEYS[0] + 1, padL = 6, padR = 6, padT = 6, axis = 16;
  const X = (m) => padL + ((w - padL - padR) * (m - KEYS[0])) / n;
  const rows = Math.max(parts.length, 1), lane = (h - padT - axis) / rows;
  // the octaves, and the keys held
  g.font = '10px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = css('--muted'); g.strokeStyle = css('--grid');
  for (let m = 24; m <= KEYS[1]; m += 12) { g.beginPath(); g.moveTo(X(m), padT); g.lineTo(X(m), h - axis); g.stroke(); g.fillText(noteName(m), X(m), h - 4); }
  g.fillStyle = css('--accent');
  for (const m of lit.keys()) g.fillRect(X(m), h - axis - 3, Math.max(2, X(m + 1) - X(m)), 3);
  if (!parts.length) { g.textAlign = 'center'; g.fillStyle = css('--muted'); g.fillText('No instruments: add one in Controls', w / 2, padT + lane / 2); return; }
  parts.forEach((s, i) => {
    const y = padT + i * lane, c = colourOf(s), bar = Math.max(4, lane - 6);
    g.globalAlpha = s.on ? 0.3 : 0.12; g.fillStyle = c;
    g.fillRect(X(s.lo), y + 2, X(s.hi + 1) - X(s.lo), bar);
    g.globalAlpha = 1;
    // its notes as they sound, at the keys that play them
    for (const k of [...s.sounding.keys(), ...s.latched]) {
      const m = k - 12 * s.oct;
      g.fillRect(X(m), y + 2, Math.max(2, X(m + 1) - X(m)), bar);
    }
    g.textAlign = 'left'; g.fillStyle = css('--text');
    const arrow = s.oct > 0 ? ` ↑${s.oct > 1 ? s.oct : ''}` : s.oct < 0 ? ` ↓${s.oct < -1 ? -s.oct : ''}` : '';
    if (bar >= 12) g.fillText(`${nameOf(s.id)}${arrow}`, X(s.lo) + 4, y + 2 + bar / 2 + 3.5);
  });
}, lanes);
lanes.setAttribute('role', 'img');

// ---- the controls: the instruments, as cards ----------------------------------------------------------
const list = $('#parts'), says = $('#says'), addSel = $('#add');
const KEY_OPTIONS = () => Array.from({ length: KEYS[1] - KEYS[0] + 1 }, (_, i) => new Option(noteName(KEYS[0] + i), KEYS[0] + i));
function learnt(key) {
  const { s, end } = learning;
  learning = null;
  if (!parts.includes(s)) return;
  if (end === 'lo') { s.lo = key; if (s.hi < key) s.hi = key; } else { s.hi = key; if (s.lo > key) s.lo = key; }
  toast(`${nameOf(s.id)}: ${end === 'lo' ? 'from' : 'up to'} ${noteName(key)}`);
  changed();
}
// the combination's name stays on the page's menu only while nothing has changed since it was chosen
function edited() { if (state.combination !== null) { state.combination = null; showCombination(); } save(); }
const changed = () => { edited(); draw(); };

function card(s) {
  const entry = byId(s.id), li = el('li', `combine-part${s.on ? '' : ' off'}`);
  li.style.setProperty('--part', entry.accent);
  const head = el('div', 'combine-part-head');
  const link = el('a', '', entry.name);
  link.href = `../${s.id}/`;
  link.title = `The ${entry.name}'s own page, with every setting, its views and How it works`;
  const on = el('button', 'combine-on', s.on ? 'On' : 'Off');
  on.type = 'button';
  on.setAttribute('aria-pressed', String(s.on));
  on.setAttribute('aria-label', `Play the ${entry.name}`);
  on.title = 'Turn it off to hear the others without it (its settings stay)';
  on.addEventListener('click', () => { s.on = !s.on; if (!s.on) for (const k of [...s.sounding.keys()]) { s.sounding.set(k, 1); up(s, k); } unfocus(on); changed(); });
  const x = el('button', 'combine-remove', '✕');
  x.type = 'button';
  x.setAttribute('aria-label', `Remove the ${entry.name}`);
  x.title = 'Take it off';
  x.addEventListener('click', () => remove(s));
  const dot = el('i', 'dot');
  dot.setAttribute('aria-hidden', 'true');
  head.append(dot, link, el('span', 'spacer'), on, x);
  li.appendChild(head);
  if (!s.I) { li.appendChild(el('p', 'loading', 'Loading…')); return li; }

  // its keys, lowest to highest, either one from the next key played
  const keys = el('div', 'combine-row');
  const end = (which, label) => {
    const sel = el('select');
    sel.setAttribute('aria-label', `${label} key the ${entry.name} plays`);
    sel.append(...KEY_OPTIONS(), new Option('Press a key…', 'learn'));
    sel.value = learning?.s === s && learning.end === which ? 'learn' : String(s[which]);
    sel.addEventListener('change', () => {
      unfocus(sel);
      if (sel.value === 'learn') { learning = { s, end: which }; toast(`Press the ${which === 'lo' ? 'lowest' : 'highest'} key for the ${entry.name}`); return; }
      s[which] = +sel.value;
      if (s.lo > s.hi) { if (which === 'lo') s.hi = s.lo; else s.lo = s.hi; }
      changed();
    });
    return sel;
  };
  keys.append(el('span', '', 'Keys'), end('lo', 'Lowest'), el('span', 'to', 'to'), end('hi', 'Highest'));
  const r = rangeOf(s);
  keys.title = `The keys it plays. Its own keys are ${noteName(r[0])} to ${noteName(r[1])}${s.I.compass && !s.P[s.I.compass.param] ? ' (its compass: its own page can open the rest)' : ''}.`;
  // its octave
  const oct = el('select');
  oct.setAttribute('aria-label', `The ${entry.name}'s octave`);
  for (let o = -OCTAVES; o <= OCTAVES; o++) oct.add(new Option(o === 0 ? 'as played' : `${o > 0 ? '+' : '−'}${Math.abs(o)} octave${Math.abs(o) > 1 ? 's' : ''}`, o));
  oct.value = String(s.oct);
  oct.addEventListener('change', () => { unfocus(oct); s.oct = +oct.value; changed(); });
  const octRow = el('div', 'combine-row');
  octRow.append(el('span', '', 'Octave'), oct);
  // its presets, yours for it from its own page, its default settings and those on its own page:
  // the menu names the one it plays, until a control moves its settings
  const pre = el('select');
  pre.setAttribute('aria-label', `The ${entry.name}'s preset`);
  pre.append(new Option('Presets…', ''), ...(s.I.presets ?? []).map((p) => new Option(p.name, `f:${p.name}`)));
  const yours = yoursFor(s.id);
  if (yours.length) { const g = el('optgroup'); g.label = 'Your presets'; g.append(...yours.map((p) => new Option(p.name, `u:${p.name}`))); pre.append(g); }
  pre.append(new Option('Default settings', 'default'), new Option('As on its own page', 'own'));
  pre.value = s.preset ?? '';
  if (pre.selectedIndex < 0) pre.value = '';
  pre.title = 'Its preset: one of its own, one of yours saved on its own page, or its settings as on its own page';
  s.menu = pre;
  pre.addEventListener('change', () => {
    const v = pre.value;
    unfocus(pre);
    const P = v && settingsOf(s, v);
    if (!P) { pre.value = s.preset ?? ''; return; }
    s.preset = v;
    setParams(s, P, true);
    edited();
    toast(`${entry.name}: ${v === 'own' ? 'as on its own page' : v === 'default' ? 'default settings' : v.slice(2)}`);
  });
  const preRow = el('div', 'combine-row');
  preRow.append(el('span', '', 'Preset'), pre);
  // its level against the others
  const level = el('div', 'param combine-level');
  level.innerHTML = '<div class="row"><label></label><span class="val"></span></div>';
  level.querySelector('label').textContent = 'Level';
  const val = level.querySelector('.val'), slider = el('input');
  slider.type = 'range'; slider.min = LEVEL.min; slider.max = LEVEL.max; slider.step = 0.5; slider.value = s.level;
  slider.setAttribute('aria-label', `The ${entry.name}'s level`);
  const show = () => { val.textContent = fmtDb(s.level); slider.setAttribute('aria-valuetext', val.textContent); slider.style.setProperty('--fill', `${(100 * (s.level - LEVEL.min)) / (LEVEL.max - LEVEL.min)}%`); };
  slider.addEventListener('input', () => { s.level = +slider.value; if (s.gain) s.gain.gain.setTargetAtTime(dB(s.level), ctx.currentTime, 0.02); show(); edited(); });
  slider.addEventListener('dblclick', () => { slider.value = LEVEL.def; slider.dispatchEvent(new Event('input')); });
  show();
  level.appendChild(slider);
  li.append(keys, octRow, preRow, level);
  return li;
}
function draw() {
  list.replaceChildren(...parts.map(card));
  if (!parts.length) list.append(el('li', 'combine-empty', 'No instruments yet: add one below, or pick a combination.'));
  says.textContent = describe(parts, nameOf);
  addSel.disabled = parts.length >= MAX_PARTS;
  addSel.options[0].text = parts.length >= MAX_PARTS ? 'Four at most: take one off first' : 'Choose…';
  $('#keys-read').textContent = parts.length ? `${parts.length} instrument${parts.length === 1 ? '' : 's'}` : 'none yet';
  lanes.setAttribute('aria-label', `The keys: ${describe(parts, nameOf)}`);
  zones();
}
addSel.add(new Option('Choose…', ''));
for (const sec of SECTIONS) {
  const g = el('optgroup'); g.label = sec.short;
  for (const i of INSTRUMENTS) if (i.section === sec.id && i.ready) g.appendChild(new Option(i.name, i.id));
  addSel.appendChild(g);
}
addSel.addEventListener('change', () => {
  const id = addSel.value;
  addSel.value = '';
  unfocus(addSel);
  if (!id) return;
  const s = add({ id }); // on every key: layered with the rest, until its keys are moved
  if (s) { if (ctx) wake(s); changed(); }
});

// the page's Volume, in the strip above the keys (shared/layout.js) and in Output
{
  const p = VOLUME, wrap = el('div', 'param');
  wrap.dataset.perform = '';
  wrap.innerHTML = `<div class="row"><label for="p-${p.id}">${p.label}</label><span class="val"></span></div>`;
  const input = el('input');
  input.type = 'range'; input.id = `p-${p.id}`; input.min = p.min; input.max = p.max; input.step = p.step; input.value = state.volume;
  const val = wrap.querySelector('.val');
  const show = () => { val.textContent = fmtDb(state.volume); input.setAttribute('aria-valuetext', val.textContent); input.style.setProperty('--fill', `${(100 * (state.volume - p.min)) / (p.max - p.min)}%`); };
  input.addEventListener('input', () => { state.volume = +input.value; if (bus) bus.gain.setTargetAtTime(dB(state.volume), ctx.currentTime, 0.02); show(); save(); });
  input.addEventListener('dblclick', () => { input.value = p.def; input.dispatchEvent(new Event('input')); });
  const hint = el('div', 'hint', p.hint);
  wrap.append(input, hint);
  show();
  $('#output').appendChild(wrap);
}

// the combinations, in the Presets menu (shared/layout.js adds Default settings, which presses Reset:
// the first combination), then yours (combine-mine.js); a MIDI program change picks one too
// (shared/midi.js choosePreset). The menu names the combination playing until something changes.
const ps = $('#preset');
ps.add(new Option('Combinations…', ''));
COMBINATIONS.forEach((c, i) => ps.add(new Option(c.name, i)));
let basis = state.combination?.replace(/^u:/, '') ?? null; // the name the combination here came from, to save it again
// the combination playing now, as one of yours would keep it
const now = () => ({ name: basis ?? '', parts: parts.map((s) => ({ id: s.id, lo: s.lo, hi: s.hi, oct: s.oct, level: s.level, on: s.on, preset: s.preset, values: valuesOf(s) })) });
const versions = () => ({ forte: FORTE_VERSION, ...Object.fromEntries(parts.map((s) => [s.id, byId(s.id)?.version ?? ''])) });
const mine = attachMine({
  menu: ps, now, versions, toast,
  play: (c) => { combine(c, true); toast(`${c.name}: ${describe(parts, nameOf)}`); },
  paramsOf: (id) => { const I = parts.find((s) => s.id === id)?.I; return I ? presetParams(I) : null; },
});
ps.addEventListener('forte-saved', (e) => { state.combination = `u:${e.detail}`; basis = e.detail; save(); });
function showCombination() {
  const c = state.combination;
  if (c?.startsWith('u:')) { mine.shown(c.slice(2)); return; }
  mine.shown(null);
  const i = COMBINATIONS.findIndex((x) => x.name === c);
  ps.value = i >= 0 ? String(i) : '';
}
ps.addEventListener('change', () => {
  const v = ps.value;
  if (v === '' || v.startsWith('__')) return;
  unfocus(ps);
  combine(COMBINATIONS[+v]);
  toast(`${COMBINATIONS[+v].name}: ${describe(parts, nameOf)}`);
});
$('#reset').addEventListener('click', () => combine(COMBINATIONS[0]));

$('#start').addEventListener('click', (e) => { start(); unfocus(e.currentTarget); });
$('#midi-btn').addEventListener('click', (e) => { initMIDI(); unfocus(e.currentTarget); });
$('#panic').addEventListener('click', (e) => { panic(); unfocus(e.currentTarget); });
resumeMIDI(initMIDI); // MIDI was on before and the browser still grants it: on again, no click
qualityControl();

// what was here last time, or the first combination
if (saved) for (const p of state.parts) add(p, p.P);
else { const c = COMBINATIONS.find((x) => x.parts.every((p) => ready(p.id))); if (c) { state.combination = basis = c.name; for (const spec of c.parts) add(spec); } }
draw();
showCombination();
