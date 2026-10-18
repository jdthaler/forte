// sync-main.js — the page: UI, audio graph, keyboard / MIDI, lock analysis, views.
// The instrument itself (parameters, engine, chain) is huygens-instrument.js.
// The worklet runs the WebAssembly build (huygens-wasm.js), and the views call its model.

import { INSTRUMENT, GROUPS, DEFAULTS, PRESETS } from './huygens-instrument.js';
import { ALL_PARAMS } from './sync-params.js';
import { keyFreq, noteName, nearestRatio, intervalName, KEY_LO, KEY_HI } from './tuning.js';
import { wasmModel } from './huygens-wasm.js';
import { createChain } from '../../shared/chain.js';
import { StairView, RasterView } from './sync-viz.js';
import { FiringLog } from './lock-analysis.js';
import { createKeyboard } from '../../shared/keyboard.js';
import { startMIDI, resumeMIDI, wheelValue, createSostenuto } from '../../shared/midi.js';
import { controlOwns } from '../../shared/focus.js';
import { trimGain } from '../../shared/registry.js';

const $ = (s) => document.querySelector(s);
const STORE = 'huygens-keyboard/params/v1';
function load() { try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); return s ? { ...DEFAULTS, ...s } : { ...DEFAULTS }; } catch { return { ...DEFAULTS }; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(P)); } catch { /* unavailable */ } }

let P = load();
let base = 48, holding = false;
const log = new FiringLog(3); // the last 3 s of every sounding lamp's firings
const held = new Map(), sounding = new Map(), latched = new Set();

const paramsMessage = () => ({ type: 'params', P: { ...P } });

// The WebAssembly model (huygens-wasm.js): each key's design frequency (the lock map's theory and
// engine are its too, staircase.js in its worker)
const { tunedFreq } = await wasmModel();

// ---------------------------------------------------------------------------
// audio

let audio = null, starting = null, live = false; // live: the context has resumed; until then notes queue in order
function startAudio() {
  if (live) { if (audio.ctx.state !== 'running') audio.ctx.resume(); return Promise.resolve(audio); }
  if (starting) return starting;
  starting = (async () => {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    if (!ctx.audioWorklet) throw new Error(window.isSecureContext ? 'this browser has no AudioWorklet support' : 'audio needs a secure page — open it with https://');
    // the engine, the WebAssembly build: its bytes go to the worklet, which compiles them
    const bytes = await (await fetch(INSTRUMENT.wasm.binary)).arrayBuffer();
    await ctx.audioWorklet.addModule(INSTRUMENT.wasm.module);
    await ctx.audioWorklet.addModule(new URL('../../shared/worklet.js', import.meta.url));
    const node = new AudioWorkletNode(ctx, 'forte-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { wasm: { name: INSTRUMENT.wasm.name, bytes } },
    });
    const chain = createChain(ctx, node, INSTRUMENT.chain); // tone → dry + body → room → limiter
    node.port.onmessage = (e) => onWorklet(e.data);
    audio = { ctx, node, chain };
    applyMix();
    node.port.postMessage(paramsMessage());
    if (ctx.state !== 'running') await ctx.resume();
    live = true;
    $('#start').textContent = `Audio on · ${(ctx.sampleRate / 1000).toFixed(1)} kHz`;
    $('#start').classList.add('running');
    return audio;
  })();
  starting.catch((err) => { toast(`Audio failed to start: ${err.message}`); starting = null; });
  return starting;
}
const post = (m) => { if (live) audio.node.port.postMessage(m); else if (starting) starting.then((a) => a.node.port.postMessage(m), () => {}); };
function applyMix() { if (audio) audio.chain.apply(P, trimGain('huygens')); } // trim: level-matched across instruments

let lastTable = 0;
function onWorklet(m) {
  if (m.type === 'state') {
    log.ingest(m);
    if (m.fires.length || raster.state?.fires.length) raster.set(log.recent(1));
    const now = performance.now();
    if (now - lastTable > 120) { lastTable = now; updateTables(log.analyze(), log.hold); }
  } else if (m.type === 'stats') {
    const el = $('#cpu');
    el.textContent = `CPU ${(m.load * 100).toFixed(0)} %`;
    el.classList.toggle('hot', m.load > 0.7);
  } else if (m.type === 'error') toast(m.message);
}

// ---------------------------------------------------------------------------
// notes, hold

async function noteOn(key) {
  if (key < KEY_LO || key > KEY_HI) return;
  latched.delete(key); sost.strike(key);
  sounding.set(key, (sounding.get(key) || 0) + 1);
  keyboardView.set(key, true);
  const a = await startAudio();
  a.node.port.postMessage({ type: 'noteOn', key, velocity: 1, data: { f: tunedFreq(key, P) } }); // the design frequency the views mark
  refreshMarks();
}
function noteOff(key) {
  const n = (sounding.get(key) || 0) - 1;
  if (n > 0) { sounding.set(key, n); return; }
  sounding.delete(key);
  if (!sost.holds(key)) release(key);
}
function release(key) {
  if (holding) { latched.add(key); return; }
  keyboardView.set(key, false);
  post({ type: 'noteOff', key });
  refreshMarks();
}
function setHold(on) {
  holding = on;
  $('#hold').textContent = on ? 'on' : 'off';
  $('#hold').className = on ? 'on' : 'off';
  if (!on) {
    for (const key of latched) { keyboardView.set(key, false); post({ type: 'noteOff', key }); }
    latched.clear();
    refreshMarks();
  }
  document.dispatchEvent(new CustomEvent('forte-sustain', { detail: on })); // the on-screen pedal and Latch follow
}
function panic() { post({ type: 'panic' }); log.clear(); sounding.clear(); latched.clear(); sost.clear(); held.clear(); keyboardView.clearAll(); if (holding) setHold(false); refreshMarks(); }
const activeKeys = () => [...new Set([...sounding.keys(), ...latched, ...sost.keys()])].sort((a, b) => a - b);

const LOW = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM', 'Comma', 'KeyL', 'Period', 'Semicolon', 'Slash'];
const LOW_LBL = ['z', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', 'm', ',', 'l', '.', ';', '/'];
const HIGH = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU', 'KeyI', 'Digit9', 'KeyO', 'Digit0', 'KeyP', 'BracketLeft', 'Equal', 'BracketRight'];
const HIGH_LBL = ['q', '2', 'w', '3', 'e', 'r', '5', 't', '6', 'y', '7', 'u', 'i', '9', 'o', '0', 'p', '[', '=', ']'];
function codeToKey(code) { let i = LOW.indexOf(code); if (i >= 0) return base + i; i = HIGH.indexOf(code); return i >= 0 ? base + 12 + i : null; }
function keyLabels() { const m = new Map(); LOW_LBL.forEach((l, i) => m.set(base + i, l)); HIGH_LBL.forEach((l, i) => { if (!m.has(base + 12 + i)) m.set(base + 12 + i, l); }); return m; }
const typing = (t) => t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox'].includes(t.type)));

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
  // a focused <select> would swallow note keys (or type-ahead into a preset): hand them back
  if (controlOwns(e)) return; // a control reached with Tab keeps its own keys (shared/focus.js)
  if (e.target?.tagName === 'SELECT') { if (e.code === 'Space' || e.code.startsWith('Arrow') || codeToKey(e.code) !== null) e.target.blur(); else return; }
  if (e.code === 'Space') { e.preventDefault(); if (e.isTrusted) spaceHeld = true; if (!e.repeat) setHold(true); return; }
  if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { e.preventDefault(); shiftOctave(e.code === 'ArrowLeft' ? -12 : 12); return; }
  if ((e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
    e.preventDefault();
    setParam('kick', Math.round(Math.min(0.15, Math.max(0, P.kick + (e.code === 'ArrowUp' ? 0.005 : -0.005))) * 1000) / 1000);
    return;
  }
  const key = codeToKey(e.code);
  if (key === null) return;
  e.preventDefault();
  if (e.repeat || held.has(e.code)) return;
  held.set(e.code, key);
  noteOn(key);
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !controlOwns(e)) { if (e.isTrusted) spaceHeld = false; setHold(false); return; }
  const key = held.get(e.code);
  if (key !== undefined) { held.delete(e.code); noteOff(key); }
});
// Losing focus means no keyup will come: release held keys and a held Space bar.
let spaceHeld = false;
const letGo = () => { for (const k of held.values()) noteOff(k); held.clear(); if (spaceHeld) { spaceHeld = false; setHold(false); } };
window.addEventListener('blur', letGo);
document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });
function shiftOctave(d) {
  const nb = base + d;
  if (nb + 11 < KEY_LO || nb > KEY_HI - 12) return; // never a whole row of computer keys out of range
  for (const k of held.values()) noteOff(k);
  held.clear(); base = nb; keyboardView.labels(keyLabels()); updateHelp();
}
function updateHelp() {
  $('#oct').textContent = `${noteName(Math.max(KEY_LO, base))}–${noteName(Math.min(KEY_HI, base + 31))}`;
  $('#kick-read').textContent = P.kick ? `${(P.kick * 100).toFixed(1)} %` : 'off';
}

const sost = createSostenuto(); // CC66
function initMIDI() {
  startMIDI({ onMIDI, status: (t) => { $('#midi').textContent = t; }, button: $('#midi-btn') });
}
function onMIDI(ev) {
  const [st, d1, d2] = ev.data, cmd = st & 0xf0;
  if (cmd === 0x90 && d2 > 0) noteOn(d1);
  else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) noteOff(d1);
  else if (cmd === 0xb0 && d1 === 1) setParam(INSTRUMENT.modWheel, wheelValue(ALL_PARAMS.find((q) => q.id === INSTRUMENT.modWheel), d2)); // at rest: the default coupling
  else if (cmd === 0xb0 && d1 === 64) setHold(d2 >= 64);
  else if (cmd === 0xb0 && d1 === 66) { for (const k of sost.set(d2 >= 64, [...sounding.keys(), ...latched])) if (!sounding.has(k)) release(k); }
  else if (cmd === 0xb0 && (d1 === 120 || d1 === 123)) panic();
}

// ---------------------------------------------------------------------------
// on-screen keyboard

const keyboardView = createKeyboard($('#keyboard'), { lo: KEY_LO, hi: KEY_HI, onDown: (k) => noteOn(k), onUp: noteOff });

// ---------------------------------------------------------------------------
// parameters

const controls = new Map();
const toSlider = (p, v) => (p.log ? (1000 * Math.log(v / p.min)) / Math.log(p.max / p.min) : (1000 * (v - p.min)) / (p.max - p.min));
function fromSlider(p, t) {
  let v = p.log ? p.min * (p.max / p.min) ** (t / 1000) : p.min + ((p.max - p.min) * t) / 1000;
  if (p.step) v = Math.round(v / p.step) * p.step;
  return Math.min(p.max, Math.max(p.min, v));
}
function buildControls() {
  for (const g of GROUPS) {
    const det = document.createElement('details');
    det.className = 'group'; det.open = g.id !== 'sound';
    det.innerHTML = `<summary>${g.title}</summary>`;
    for (const p of g.params) {
      const wrap = document.createElement('div');
      wrap.className = 'param';
      if (p.perform) wrap.dataset.perform = ''; // above the keys in Perform (shared/layout.js)
      let input, val = null;
      if (p.type === 'select') {
        wrap.innerHTML = `<label for="p-${p.id}">${p.label}</label>`;
        input = document.createElement('select'); input.id = `p-${p.id}`;
        for (const [k, name] of p.options) input.add(new Option(name, k));
        input.addEventListener('change', () => { setParam(p.id, typeof p.def === 'number' ? +input.value : input.value); input.blur(); });
        wrap.appendChild(input);
      } else if (p.type === 'checkbox') {
        wrap.classList.add('check');
        input = document.createElement('input'); input.type = 'checkbox'; input.id = `p-${p.id}`;
        input.addEventListener('change', () => setParam(p.id, input.checked));
        const lab = document.createElement('label'); lab.htmlFor = input.id; lab.textContent = p.label;
        wrap.append(input, lab);
      } else {
        wrap.innerHTML = `<div class="row"><label for="p-${p.id}">${p.label}</label><span class="val"></span></div>`;
        val = wrap.querySelector('.val');
        input = document.createElement('input');
        input.type = 'range'; input.min = 0; input.max = 1000; input.step = 1; input.id = `p-${p.id}`;
        input.addEventListener('input', () => setParam(p.id, fromSlider(p, +input.value), true));
        input.addEventListener('dblclick', () => setParam(p.id, p.def));
        wrap.appendChild(input);
      }
      if (p.hint) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = p.hint; wrap.appendChild(h); }
      det.appendChild(wrap);
      controls.set(p.id, { p, input, val, wrap });
    }
    $('#groups').appendChild(det);
  }
  const ps = $('#preset');
  ps.add(new Option('Presets…', ''));
  PRESETS.forEach((pr, i) => ps.add(new Option(pr.name, i)));
  ps.addEventListener('change', () => {
    if (ps.value === '') return;
    setAll({ ...DEFAULTS, ...Object.fromEntries(INSTRUMENT.keep.map((k) => [k, P[k]])), ...PRESETS[+ps.value].p });
    ps.blur();
  });
  $('#reset').addEventListener('click', () => { setAll({ ...DEFAULTS }); $('#preset').value = ''; });
}
function refreshControl(id, dragging = false) {
  const c = controls.get(id);
  if (!c) return;
  const v = P[id];
  if (c.p.type === 'select') c.input.value = v;
  else if (c.p.type === 'checkbox') c.input.checked = !!v;
  else { if (!dragging) c.input.value = toSlider(c.p, v); c.val.textContent = c.p.fmt ? c.p.fmt(v) : String(v); }
}
function refreshVisibility() { for (const { p, wrap } of controls.values()) wrap.hidden = p.showIf ? !p.showIf(P) : false; }
function retuneSounding() { post({ type: 'retune', list: activeKeys().map((k) => [k, tunedFreq(k, P)]) }); refreshMarks(); }
function setAll(np) {
  P = np;
  for (const id of controls.keys()) refreshControl(id);
  refreshVisibility(); post(paramsMessage()); applyMix(); retuneSounding(); updateHelp(); save();
  recomputeStair(true);
}
function setParam(id, v, dragging = false) {
  const p = ALL_PARAMS.find((q) => q.id === id);
  if (P[id] === v) return;
  P[id] = v;
  refreshControl(id, dragging); refreshVisibility(); save(); updateHelp();
  $('#preset').value = '';
  if (p.kind === 'mix') applyMix();
  else if (p.kind === 'tune') { post(paramsMessage()); retuneSounding(); } // the engine tunes new notes itself
  else {
    post(paramsMessage());
    if (['kick'].includes(id)) recomputeStair(false);
    else if (['rSrc', 'vNom', 'vStrike', 'vExt'].includes(id)) recomputeStair(true);
  }
}

// ---------------------------------------------------------------------------
// analysis + views

const stair = new StairView($('#stair'));
const raster = new RasterView($('#raster'));
let worker = null, stairTimer = 0;
function recomputeStair(full) {
  stair.kick = P.kick; stair.touch();
  clearTimeout(stairTimer);
  stairTimer = setTimeout(() => {
    if (!worker) {
      worker = new Worker('src/staircase-worker.js', { type: 'module' });
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'stair') {
          stair.stair = { xs: m.xs, ys: m.ys };
          $('#stair-read').textContent = `C4 plus a second lamp · coupling ${(P.kick * 100).toFixed(1)} %${m.delta !== undefined ? ` (δ = ${m.delta.toFixed(4)})` : ''}${m.exact ? '' : ' · simulated'}`;
        } else if (m.type === 'row') { stair.nRows = m.rows; stair.rows[m.r] = m; }
        stair.touch();
      };
    }
    stair.reset(full);
    worker.postMessage({ P: { ...P }, rows: 24, kmax: 0.15, full });
  }, 250);
}

function refreshMarks() {
  const keys = activeKeys();
  stair.touch();
  if (keys.length < 2) { stair.marks = []; return; }
  const f0 = tunedFreq(keys[0], P);
  stair.marks = keys.slice(1).map((k) => 1200 * Math.log2(tunedFreq(k, P) / f0));
}

// an: log.analyze(). Locks come from shared firings, so their ratios are exact.
function updateTables(an, hold) {
  const live = an.notes;
  $('#hold-read').textContent = hold ? `supply servo ${(1200 * -hold).toFixed(1)} ¢` : '';
  if (!live.length) {
    $('#notes').innerHTML = '<tr><td class="free">Play or hold a chord (Space latches notes)</td></tr>';
    $('#pairs').innerHTML = '';
    return;
  }
  const meter = (c, d) => {
    const pos = (v) => `${50 + Math.max(-50, Math.min(50, (v / 30) * 50))}%`;
    return `<span class="meter"><b></b><u style="left:${pos(d)}"></u><i style="left:${pos(c)}"></i></span>`;
  };
  $('#notes').innerHTML = '<tr><th>note</th><th>designed</th><th>playing</th><th>vs equal temperament (±30 ¢)</th></tr>'
    + live.map((o) => {
      const et = keyFreq(o.key), cd = 1200 * Math.log2(o.fTarget / et), cp = 1200 * Math.log2(o.f / et);
      return `<tr><td>${noteName(o.key)}</td><td>${cd >= 0 ? '+' : ''}${cd.toFixed(1)} ¢</td><td>${cp >= 0 ? '+' : ''}${cp.toFixed(1)} ¢</td><td>${meter(cp, cd)}</td></tr>`;
    }).join('');
  const rows = [];
  for (const { a, b, lock, ratio: r, design, beat } of an.pairs) {
    const nr = nearestRatio(r, 9);
    rows.push(`<tr><td>${noteName(a.key)}–${noteName(b.key)} <span class="muted">${intervalName(b.key - a.key)}</span></td>`
      + `<td>${(1200 * Math.log2(b.fTarget / a.fTarget)).toFixed(1)} ¢</td><td>${(1200 * Math.log2(r)).toFixed(1)} ¢</td>`
      + `<td>${nr.p}:${nr.q} = ${(1200 * Math.log2(nr.p / nr.q)).toFixed(1)} ¢</td>`
      + (lock ? `<td class="locked">locked ${lock.p}:${lock.q}${lock.q > 16 ? ' (long pattern)' : ''}</td>`
        : `<td class="free">${design.p}:${design.q} off by ${(1200 * Math.log2(r / (design.p / design.q))).toFixed(1)} ¢ · beats ${beat.toFixed(1)} Hz</td>`)
      + '</tr>');
  }
  $('#pairs').innerHTML = rows.length ? '<tr><th>pair</th><th>designed</th><th>now</th><th>nearest simple ratio</th><th>status</th></tr>' + rows.slice(0, 15).join('') : '';
}

// views redraw only when something changed (and only while visible)
function frame() { requestAnimationFrame(frame); stair.frame(); raster.frame(); }

let toastTimer = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500); }
$('#start').addEventListener('click', (e) => { startAudio(); e.currentTarget.blur(); });
$('#midi-btn').addEventListener('click', (e) => { initMIDI(); e.currentTarget.blur(); });
resumeMIDI(initMIDI); // MIDI was on before and the browser still grants it: on again, no click
$('#panic').addEventListener('click', (e) => { panic(); e.currentTarget.blur(); });

buildControls();
for (const id of controls.keys()) refreshControl(id);
refreshVisibility();
keyboardView.labels(keyLabels());
updateHelp();
updateTables({ notes: [], pairs: [] }, 0);
recomputeStair(true);
requestAnimationFrame(frame);
