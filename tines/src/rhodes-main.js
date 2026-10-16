// rhodes-main.js — UI, audio graph, keyboard / MIDI, model cache, views.

import { GROUPS, ALL_PARAMS, DEFAULTS, PRESETS } from './rhodes-params.js';
import { computeKey, pickupFor, noteName, KEY_LO, KEY_HI } from './tine.js';
import { RhodesEngine } from './rhodes-engine.js';
import { roomIR } from '../../shared/impulses.js';
import { MotionView, PickupView, SpectrumView, MODE_COLORS, modeKind } from './rhodes-viz.js';
import { createKeyboard } from '../../shared/keyboard.js';
import { controlOwns } from '../../shared/focus.js';
import { trimGain } from '../../shared/registry.js';

const $ = (s) => document.querySelector(s);
const STORE = 'tine-piano/params/v1';

function load() {
  try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); return s ? { ...DEFAULTS, ...s } : { ...DEFAULTS }; } catch { return { ...DEFAULTS }; }
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(P)); } catch { /* unavailable */ } }

let P = load();
let version = 1, fs = 48000, base = 48, focusKey = 60, lastVel = 1.8, sustain = false;
const cache = new Map(), sent = new Set(), held = new Map(), sounding = new Map();

function keyData(key) {
  let c = cache.get(key);
  if (!c || c.version !== version) {
    const model = computeKey(key, P, fs);
    c = { version, model, data: { ...model.voice, version } };
    cache.set(key, c);
  }
  return c;
}
const engineParams = () => ({
  damper: P.damper, cable: P.cable, resQ: P.resQ, tremRate: P.tremRate, tremDepth: P.tremDepth, drive: P.drive, tone: P.tone,
  gap: P.gap, offset: P.offset, poleRadius: P.poleRadius, voicing: P.voicing, // pickups: the engine moves them live
});
// The pickup settings don't change the modes: patch the cached keys instead of recomputing them.
function repickup() {
  for (const [key, c] of cache) {
    const { gap, wid, yoff, gain } = pickupFor(key, P);
    c.model.info.gap = gap; c.model.info.wid = wid;
    c.model.voice.pickup = c.data.pickup = { wid, yoff, gain };
  }
}

// ---------------------------------------------------------------------------
// audio

let audio = null, starting = null, live = false; // live: the context has resumed; until then notes queue in order
function startAudio() {
  if (live) { if (audio.ctx.state !== 'running') audio.ctx.resume(); return Promise.resolve(audio); }
  if (starting) return starting;
  starting = (async () => {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    if (!ctx.audioWorklet) throw new Error(window.isSecureContext ? 'this browser has no AudioWorklet support' : 'audio needs a secure page — open it with https://');
    await ctx.audioWorklet.addModule('src/rhodes-engine.js');
    await ctx.audioWorklet.addModule('src/rhodes-worklet.js');
    const node = new AudioWorkletNode(ctx, 'rhodes-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 8192; analyser.smoothingTimeConstant = 0.55;
    const room = ctx.createConvolver(), roomGain = ctx.createGain(), master = ctx.createGain(), limiter = ctx.createDynamicsCompressor();
    room.buffer = roomIR(ctx, 1.8);
    limiter.threshold.value = -3; limiter.knee.value = 3; limiter.ratio.value = 12; limiter.attack.value = 0.002; limiter.release.value = 0.15;
    node.connect(analyser);
    node.connect(master);
    node.connect(room).connect(roomGain).connect(master);
    master.connect(limiter).connect(ctx.destination);
    node.port.onmessage = (e) => onWorklet(e.data);
    if (ctx.sampleRate !== fs) { fs = ctx.sampleRate; bump(); }
    audio = { ctx, node, analyser, roomGain, master };
    applyMix();
    node.port.postMessage({ type: 'params', params: engineParams() });
    node.port.postMessage({ type: 'sustain', on: sustain });
    spectrum.setAnalyser(analyser);
    if (ctx.state !== 'running') await ctx.resume();
    live = true;
    $('#start').textContent = `Audio on · ${(fs / 1000).toFixed(1)} kHz`;
    $('#start').classList.add('running');
    return audio;
  })();
  starting.catch((err) => { toast(`Audio failed to start: ${err.message}`); starting = null; });
  return starting;
}
const post = (m) => { if (live) audio.node.port.postMessage(m); else if (starting) starting.then((a) => a.node.port.postMessage(m), () => {}); };
function applyMix() {
  if (!audio) return;
  const t = audio.ctx.currentTime;
  audio.roomGain.gain.setTargetAtTime(0.6 * P.room, t, 0.02);
  audio.master.gain.setTargetAtTime(P.volume * trimGain('tines'), t, 0.02); // level-matched across instruments
}
function onWorklet(m) {
  if (m.type === 'stats') {
    const el = $('#cpu');
    el.textContent = `CPU ${(m.load * 100).toFixed(0)} % · ${m.voices} voices`;
    el.classList.toggle('hot', m.load > 0.7);
  } else if (m.type === 'error') toast(m.key !== undefined ? `${noteName(m.key)}: ${m.message}` : m.message);
}

// ---------------------------------------------------------------------------
// notes

async function noteOn(key, velocity) {
  if (key < KEY_LO || key > KEY_HI) return;
  sounding.set(key, (sounding.get(key) || 0) + 1);
  keyboardView.set(key, true);
  const a = await startAudio();
  const c = keyData(key);
  const msg = { type: 'noteOn', key, velocity };
  if (!sent.has(key)) { msg.data = c.data; sent.add(key); }
  a.node.port.postMessage(msg);
  setFocus(key, velocity);
}
function noteOff(key) {
  const n = (sounding.get(key) || 0) - 1;
  if (n > 0) { sounding.set(key, n); return; }
  sounding.delete(key);
  keyboardView.set(key, false);
  post({ type: 'noteOff', key });
}
function setSustain(on) {
  sustain = on;
  $('#sus').textContent = on ? 'on' : 'off';
  $('#sus').className = on ? 'on' : 'off';
  post({ type: 'sustain', on });
}
function panic() { post({ type: 'panic' }); sounding.clear(); held.clear(); keyboardView.clearAll(); }

const LOW = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM', 'Comma', 'KeyL', 'Period', 'Semicolon', 'Slash'];
const LOW_LBL = ['z', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', 'm', ',', 'l', '.', ';', '/'];
const HIGH = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU', 'KeyI', 'Digit9', 'KeyO', 'Digit0', 'KeyP', 'BracketLeft', 'Equal', 'BracketRight'];
const HIGH_LBL = ['q', '2', 'w', '3', 'e', 'r', '5', 't', '6', 'y', '7', 'u', 'i', '9', 'o', '0', 'p', '[', '=', ']'];
function codeToKey(code) {
  let i = LOW.indexOf(code);
  if (i >= 0) return base + i;
  i = HIGH.indexOf(code);
  return i >= 0 ? base + 12 + i : null;
}
function keyLabels() {
  const m = new Map();
  LOW_LBL.forEach((l, i) => m.set(base + i, l));
  HIGH_LBL.forEach((l, i) => { if (!m.has(base + 12 + i)) m.set(base + 12 + i, l); });
  return m;
}
const typing = (t) => t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox'].includes(t.type)));

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
  // a focused <select> would swallow note keys (or type-ahead into a preset): hand them back
  if (controlOwns(e)) return; // a control reached with Tab keeps its own keys (shared/focus.js)
  if (e.target?.tagName === 'SELECT') { if (e.code === 'Space' || e.code.startsWith('Arrow') || codeToKey(e.code) !== null) e.target.blur(); else return; }
  if (e.code === 'Space') { e.preventDefault(); if (e.isTrusted) spaceHeld = true; if (!e.repeat) setSustain(true); return; }
  if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { e.preventDefault(); shiftOctave(e.code === 'ArrowLeft' ? -12 : 12); return; }
  if ((e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
    e.preventDefault();
    setParam('velocity', Math.min(5, Math.max(0.2, P.velocity * (e.code === 'ArrowUp' ? 1.25 : 0.8))));
    return;
  }
  const key = codeToKey(e.code);
  if (key === null) return;
  e.preventDefault();
  if (e.repeat || held.has(e.code)) return;
  held.set(e.code, key);
  noteOn(key, P.velocity);
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !controlOwns(e)) { if (e.isTrusted) spaceHeld = false; setSustain(false); return; }
  const key = held.get(e.code);
  if (key !== undefined) { held.delete(e.code); noteOff(key); }
});
// Losing focus means no keyup will come: release held keys and a held Space bar.
let spaceHeld = false;
const letGo = () => { for (const k of held.values()) noteOff(k); held.clear(); if (spaceHeld) { spaceHeld = false; setSustain(false); } };
window.addEventListener('blur', letGo);
document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });

function shiftOctave(d) {
  const nb = base + d;
  if (nb < KEY_LO - 12 || nb > KEY_HI - 12) return;
  for (const k of held.values()) noteOff(k);
  held.clear();
  base = nb;
  keyboardView.labels(keyLabels());
  updateHelp();
}
function updateHelp() {
  $('#oct').textContent = `${noteName(Math.max(KEY_LO, base))}–${noteName(Math.min(KEY_HI, base + 31))}`;
  $('#vel').textContent = `${P.velocity.toFixed(2)} m/s`;
}

const velFromMidi = (v) => 0.25 * 20 ** (v / 127); // 0.25 … 5 m/s
function initMIDI() {
  if (!navigator.requestMIDIAccess) { $('#midi').textContent = 'No Web MIDI in this browser (try Chrome, Edge or Firefox)'; return; }
  navigator.requestMIDIAccess().then((acc) => {
    const bind = () => {
      const names = [];
      for (const inp of acc.inputs.values()) { inp.onmidimessage = onMIDI; names.push(inp.name); }
      $('#midi').textContent = names.length ? `MIDI: ${names.join(', ')}` : 'MIDI: no devices';
    };
    bind(); acc.onstatechange = bind; $('#midi-btn').hidden = true;
  }, () => { $('#midi').textContent = 'MIDI: permission denied'; });
}
function onMIDI(ev) {
  const [st, d1, d2] = ev.data, cmd = st & 0xf0;
  if (cmd === 0x90 && d2 > 0) noteOn(d1, velFromMidi(d2));
  else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) noteOff(d1);
  else if (cmd === 0xb0 && d1 === 64) setSustain(d2 >= 64);
  else if (cmd === 0xb0 && (d1 === 120 || d1 === 123)) panic();
}

// ---------------------------------------------------------------------------
// on-screen keyboard (73 keys)

const keyboardView = createKeyboard($('#keyboard'), { lo: KEY_LO, hi: KEY_HI, onDown: (k, f) => noteOn(k, 0.3 + 4.2 * f ** 1.5), onUp: noteOff }); // depth into the key → hammer speed (m/s)

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
    det.className = 'group';
    det.open = ['tine', 'bar', 'pickup'].includes(g.id);
    det.innerHTML = `<summary>${g.title}</summary>`;
    for (const p of g.params) {
      const wrap = document.createElement('div');
      wrap.className = 'param';
      if (p.perform) wrap.dataset.perform = ''; // above the keys in Perform (shared/layout.js)
      wrap.innerHTML = `<div class="row"><label for="p-${p.id}">${p.label}</label><span class="val"></span></div>`;
      const input = document.createElement('input');
      input.type = 'range'; input.min = 0; input.max = 1000; input.step = 1; input.id = `p-${p.id}`;
      input.addEventListener('input', () => setParam(p.id, fromSlider(p, +input.value), true));
      input.addEventListener('dblclick', () => setParam(p.id, p.def));
      wrap.appendChild(input);
      if (p.hint) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = p.hint; wrap.appendChild(h); }
      det.appendChild(wrap);
      controls.set(p.id, { p, input, val: wrap.querySelector('.val') });
    }
    $('#groups').appendChild(det);
  }
  const ps = $('#preset');
  ps.add(new Option('Presets…', ''));
  PRESETS.forEach((pr, i) => ps.add(new Option(pr.name, i)));
  ps.addEventListener('change', () => {
    if (ps.value === '') return;
    const keep = { volume: P.volume, room: P.room, velocity: P.velocity };
    setAll({ ...DEFAULTS, ...keep, ...PRESETS[+ps.value].p });
    ps.blur();
  });
  $('#reset').addEventListener('click', () => { setAll({ ...DEFAULTS }); $('#preset').value = ''; });
}
function refreshControl(id, dragging = false) {
  const c = controls.get(id);
  if (!c) return;
  if (!dragging) c.input.value = toSlider(c.p, P[id]);
  c.val.textContent = c.p.fmt ? c.p.fmt(P[id]) : String(P[id]);
}
function bump() { version++; sent.clear(); }
function setAll(np) {
  P = np;
  for (const id of controls.keys()) refreshControl(id);
  bump(); post({ type: 'params', params: engineParams() }); applyMix(); updateHelp(); save();
  modelChanged();
}
let mcTimer = 0;
function setParam(id, v, dragging = false) {
  const p = ALL_PARAMS.find((q) => q.id === id);
  if (P[id] === v) return;
  P[id] = v;
  refreshControl(id, dragging);
  save();
  $('#preset').value = '';
  if (p.kind === 'play') { updateHelp(); return; }
  if (p.kind === 'mix') { applyMix(); return; }
  if (p.kind === 'pickup') repickup();
  if (p.kind === 'engine' || p.kind === 'pickup') post({ type: 'params', params: engineParams() });
  else bump();
  clearTimeout(mcTimer);
  mcTimer = setTimeout(modelChanged, 120);
}
function modelChanged() { setFocus(focusKey, lastVel); precompute(); }

let pq = [], pqTimer = 0;
function precompute() {
  pq = [];
  for (let m = KEY_LO; m <= KEY_HI; m++) pq.push(m);
  pq.sort((a, b) => Math.abs(a - base - 15) - Math.abs(b - base - 15));
  clearTimeout(pqTimer);
  pqTimer = setTimeout(function tick() {
    const t0 = performance.now();
    while (pq.length && performance.now() - t0 < 8) keyData(pq.shift());
    if (pq.length) pqTimer = setTimeout(tick, 4);
  }, 60);
}

// ---------------------------------------------------------------------------
// focus key: info, mode table, slow motion, pickup transfer

const motion = new MotionView($('#motion'));
const pickupView = new PickupView($('#pickup'));
const spectrum = new SpectrumView($('#spectrum'));
let simTimer = 0;

function setFocus(key, vel) {
  focusKey = key; lastVel = vel;
  keyboardView.focus(key);
  const { model } = keyData(key);
  showInfo(model);
  spectrum.set(model.info.f0, model.modes);
  clearTimeout(simTimer);
  simTimer = setTimeout(() => runSim(key, vel), 30);
}

function runSim(key, vel) {
  const { model, data } = keyData(key);
  const eng = new RhodesEngine(fs);
  eng.setParams({ ...engineParams(), cable: 100, tone: 20000, drive: 0, tremDepth: 0 });
  const v = eng.noteOn(key, data, vel);
  const f0 = model.info.f0;
  const total = Math.round(Math.min(0.06, Math.max(0.006, 5 / f0)) * fs);
  const stride = Math.max(1, Math.ceil(total / 600));
  const L = new Float32Array(Math.max(stride, 4096)), R = new Float32Array(L.length);
  const frames = [], eta = [];
  let hEta = 0, hVel = 0;
  for (let s = 0; s < total; s += stride) {
    frames.push(v.snapshot(new Float64Array(v.N)));
    if (v.hammerOn) { hEta = v.eta; hVel = (v.eta - v.etaPrev) * eng.fs2; } else hEta += hVel * (stride / fs);
    eta.push(hEta);
    eng.process(L, R, stride);
  }
  for (let g = 0; v.hammerOn && g < 200; g++) eng.process(L, R, 64);
  // a few cycles of pickup output after the attack
  const nw = Math.min(4096, Math.round((3 / f0) * fs));
  eng.process(L, R, Math.min(4096, Math.round(0.02 * fs))); // skip past the attack
  eng.process(L, R, nw);
  motion.set({ frames, eta: Float64Array.from(eta), dt: stride / fs, model, P: { ...P }, title: `${noteName(key)} · ${vel.toFixed(2)} m/s` });
  pickupView.set({ wid: data.pickup.wid, yoff: data.pickup.yoff, yMin: v.yMin, yMax: v.yMax, wave: Float32Array.from(L.subarray(0, nw)) });
  $('#pickup-read').textContent = `swing ${(v.yMin * 1000).toFixed(2)}…+${(v.yMax * 1000).toFixed(2)} mm across a ${(data.pickup.wid * 1000).toFixed(2)} mm bump · contact ${(v.contactSamples / eng.fs2 * 1000).toFixed(2)} ms`;
}

function showInfo(model) {
  const i = model.info;
  $('#info-title').textContent = `${i.name} · ${i.f0.toFixed(2)} Hz`;
  $('#info-sub').textContent = `${P.tineDiameter.toFixed(2)} mm tine`;
  $('#focus-name').textContent = i.name;
  const rows = [
    ['Tine length', `${(i.L * 1000).toFixed(1)} mm (solved to tune)`],
    ['Tine + spring', `${(i.mt * 1000).toFixed(2)} g, spring ${(i.ms * 1000).toFixed(2)} g at ${(i.s * 1000).toFixed(1)} mm`],
    ['Bell partial', i.tineRatios.length > 1 ? `${i.tineRatios[1].toFixed(2)} × f₁ (bare cantilever: 6.27)` : 'above the audio band'],
    ['Strike', `${(i.xh * 1000).toFixed(1)} mm from the clamp (${((100 * i.xh) / i.L).toFixed(0)} % of length)`],
    ['Tone bar', `${(i.Mb * 1000).toFixed(1)} g, tuned ${P.barTune > 0 ? '+' : ''}${P.barTune.toFixed(0)} ¢`],
    ['Pickup', `gap ${(i.gap * 1000).toFixed(2)} mm, bump width ${(i.wid * 1000).toFixed(2)} mm, voiced ${P.offset.toFixed(2)} w`],
  ];
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('#modes').innerHTML = '<tr><th>mode</th><th>× f₀</th><th>T60</th><th>where the energy is</th></tr>'
    + model.modes.map((md) => {
      const kind = modeKind(md);
      return `<tr><td>${md.f.toFixed(1)} Hz</td><td>${(md.f / i.f0).toFixed(3)}</td><td>${(6.91 / md.sigma).toFixed(2)} s</td>`
        + `<td><span style="color:${MODE_COLORS[kind]}">●</span> tine ${(100 * md.tineFrac).toFixed(0)}% · bar ${(100 * md.barFrac).toFixed(0)}% · block ${(100 * md.blockFrac).toFixed(0)}%</td></tr>`;
    }).join('');
  $('#legend').innerHTML = Object.entries(MODE_COLORS).map(([k, c]) => `<span><i style="background:${c}"></i>${{ tine: 'tine-dominated', bar: 'tone-bar-dominated', block: 'mount / block' }[k]} mode</span>`).join('')
    + '<span>faint lines: harmonics n·f₀</span>';
}

// ---------------------------------------------------------------------------

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}
$('#start').addEventListener('click', (e) => { startAudio(); e.currentTarget.blur(); });
$('#midi-btn').addEventListener('click', (e) => { initMIDI(); e.currentTarget.blur(); });
$('#panic').addEventListener('click', (e) => { panic(); e.currentTarget.blur(); });
$('#replay').addEventListener('click', (e) => { motion.replay(); e.currentTarget.blur(); });
$('#speed').addEventListener('change', (e) => { motion.speed = +e.target.value; motion.replay(); e.target.blur(); });

buildControls();
for (const id of controls.keys()) refreshControl(id);
updateHelp();
keyboardView.labels(keyLabels());
setFocus(60, P.velocity);
precompute();
