// organ-main.js — console UI, audio graph, keyboard / MIDI, visualisations.

import { GROUPS, ALL_PARAMS, DEFAULTS, PRESETS } from './organ-params.js';
import { buildGenerator, keyAnalysis, keyWheel, percWheel, centsOff, wheelSpec, wheelName, gearFreq, etFreq, DRAWBARS, NUM_WHEELS, KEY_LO, KEY_HI, drawbarGain } from './tonewheels.js';
import { roomIR } from '../../shared/impulses.js';
import { GeneratorView, LeslieView, OutputView, drawScanner, BAR_COLORS } from './organ-viz.js';
import { createKeyboard } from '../../shared/keyboard.js';

const $ = (s) => document.querySelector(s);
const STORE = 'tonewheel-organ/params/v1';
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    return s ? { ...DEFAULTS, ...s, drawbars: [...(s.drawbars || DEFAULTS.drawbars)] } : { ...DEFAULTS, drawbars: [...DEFAULTS.drawbars] };
  } catch { return { ...DEFAULTS, drawbars: [...DEFAULTS.drawbars] }; }
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(P)); } catch { /* unavailable */ } }

let P = load();
let fs = 48000;
let base = 48;
let focusKey = 60;
let lastState = null;
const held = new Map();     // keyboard code → key
const sounding = new Map(); // key → count of sources holding it

// ---------------------------------------------------------------------------
// audio

let audio = null, starting = null, live = false; // live: the context has resumed; until then notes queue in order

function startAudio() {
  if (live) { if (audio.ctx.state !== 'running') audio.ctx.resume(); return Promise.resolve(audio); }
  if (starting) return starting;
  starting = (async () => {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    if (!ctx.audioWorklet) throw new Error(window.isSecureContext ? 'this browser has no AudioWorklet support' : 'audio needs a secure page — open it with https://');
    await ctx.audioWorklet.addModule('src/organ-engine.js');
    await ctx.audioWorklet.addModule('src/organ-worklet.js');
    const node = new AudioWorkletNode(ctx, 'organ-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0.6;
    const room = ctx.createConvolver(), roomGain = ctx.createGain(), master = ctx.createGain(), limiter = ctx.createDynamicsCompressor();
    room.buffer = roomIR(ctx, 1.8);
    limiter.threshold.value = -3; limiter.knee.value = 3; limiter.ratio.value = 12;
    limiter.attack.value = 0.002; limiter.release.value = 0.15;
    node.connect(analyser);
    node.connect(master);
    node.connect(room).connect(roomGain).connect(master);
    master.connect(limiter).connect(ctx.destination);
    node.port.onmessage = (e) => onWorklet(e.data);
    fs = ctx.sampleRate;
    audio = { ctx, node, analyser, roomGain, master };
    sendConfig();
    node.port.postMessage({ type: 'params', params: { ...P, leslieOn: P.leslieOn } });
    applyMix();
    output.setAnalyser(analyser);
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
function sendConfig() { if (audio) audio.node.port.postMessage({ type: 'config', gen: buildGenerator(P, fs) }); }
function sendParams() { post({ type: 'params', params: { ...P, leslieOn: P.leslieOn } }); }
function applyMix() {
  if (!audio) return;
  const t = audio.ctx.currentTime;
  audio.roomGain.gain.setTargetAtTime(0.6 * P.room, t, 0.02);
  audio.master.gain.setTargetAtTime(P.volume, t, 0.02);
}

function onWorklet(m) {
  if (m.type === 'state') {
    lastState = m;
    leslieView.set(m);
    const rpm = 1200 * m.shaft * (P.mains / 60);
    $('#shaft').textContent = m.shaft > 0.001 ? `${rpm.toFixed(0)} rpm · ${(1200 * Math.log2(m.shaft)).toFixed(0)} ¢` : 'stopped';
    $('#leslie-read').textContent = P.leslieOn ? `horn ${(m.hornHz * 60).toFixed(0)} rpm · drum ${(m.drumHz * 60).toFixed(0)} rpm` : '';
  } else if (m.type === 'stats') {
    const el = $('#cpu');
    el.textContent = `CPU ${(m.load * 100).toFixed(0)} % · ${m.keys} keys`;
    el.classList.toggle('hot', m.load > 0.7);
  } else if (m.type === 'error') toast(m.message);
}

// ---------------------------------------------------------------------------
// keys

async function keyDown(key, velocity = 100) {
  while (key < KEY_LO) key += 12;
  while (key > KEY_HI) key -= 12;
  sounding.set(key, (sounding.get(key) || 0) + 1);
  keyboardView.set(key, true);
  if (sounding.get(key) === 1) {
    await startAudio();
    audio.node.port.postMessage({ type: 'keyDown', key, velocity });
  }
  focusKey = key;
  refreshFocus();
  refreshActivity();
}
function keyUp(key) {
  while (key < KEY_LO) key += 12;
  while (key > KEY_HI) key -= 12;
  const n = (sounding.get(key) || 0) - 1;
  if (n > 0) { sounding.set(key, n); return; }
  sounding.delete(key);
  keyboardView.set(key, false);
  post({ type: 'keyUp', key });
  refreshActivity();
}
function panic() {
  post({ type: 'allOff' });
  sounding.clear(); held.clear(); keyboardView.clearAll(); refreshActivity();
}

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
  if (e.target?.tagName === 'SELECT') { if (e.code === 'Space' || codeToKey(e.code) !== null) e.target.blur(); else return; }
  const onSlider = (e.target?.tagName === 'INPUT' && e.target.type === 'range') || e.target?.classList?.contains('drawbar');
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) setP({ leslie: P.leslie === 'fast' ? 'slow' : 'fast', leslieOn: true }); return; }
  if (e.code === 'Backquote') { e.preventDefault(); if (!e.repeat) setP({ motor: !P.motor }); return; }
  if (!onSlider && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { e.preventDefault(); shiftOctave(e.code === 'ArrowLeft' ? -12 : 12); return; }
  if (!onSlider && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
    e.preventDefault();
    setP({ expression: Math.min(1, Math.max(0, P.expression + (e.code === 'ArrowUp' ? 0.05 : -0.05))) });
    return;
  }
  const key = codeToKey(e.code);
  if (key === null) return;
  e.preventDefault();
  if (e.repeat || held.has(e.code)) return;
  held.set(e.code, key);
  keyDown(key);
});
window.addEventListener('keyup', (e) => {
  const key = held.get(e.code);
  if (key !== undefined) { held.delete(e.code); keyUp(key); }
});
window.addEventListener('blur', () => { for (const k of held.values()) keyUp(k); held.clear(); });

function shiftOctave(d) {
  const nb = base + d;
  if (nb < KEY_LO - 12 || nb > KEY_HI - 12) return;
  for (const k of held.values()) keyUp(k);
  held.clear();
  base = nb;
  keyboardView.labels(keyLabels());
  updateHelp();
}
function updateHelp() {
  const db = `${((P.expression - 1) * 40).toFixed(0)} dB`;
  $('#oct').textContent = `${noteName(Math.max(KEY_LO, base))}–${noteName(Math.min(KEY_HI, base + 31))}`;
  $('#expr').textContent = db;
  $('#swell-read').textContent = db;
  const sw = $('#swell');
  sw.style.setProperty('--e', P.expression);
  sw.setAttribute('aria-valuenow', String(P.expression));
  sw.setAttribute('aria-valuetext', db);
}

// MIDI: notes, CC1 / CC64 → Leslie fast/slow, CC11 → expression
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
let lastSustain = false;
function onMIDI(ev) {
  const [st, d1, d2] = ev.data, cmd = st & 0xf0;
  if (cmd === 0x90 && d2 > 0) keyDown(d1, d2);
  else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) keyUp(d1);
  else if (cmd === 0xb0) {
    if (d1 === 1) setP({ leslie: d2 >= 64 ? 'fast' : 'slow' });
    else if (d1 === 64) { const on = d2 >= 64; if (on && !lastSustain) setP({ leslie: P.leslie === 'fast' ? 'slow' : 'fast' }); lastSustain = on; }
    else if (d1 === 11) setP({ expression: d2 / 127 });
    else if (d1 === 120 || d1 === 123) panic();
  }
}

// ---------------------------------------------------------------------------
// on-screen keyboard (61 keys)

const keyboardView = createKeyboard($('#keyboard'), { lo: KEY_LO, hi: KEY_HI, onDown: (k) => keyDown(k), onUp: keyUp });

// ---------------------------------------------------------------------------
// drawbars and console switches

const drawbarEls = DRAWBARS.map((db, d) => {
  const el = document.createElement('div');
  el.className = `drawbar ${db.color}`;
  el.tabIndex = 0;
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-label', `${db.label} drawbar`);
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '8');
  el.innerHTML = `<div class="slot"><div class="rod"><span></span></div></div><div class="ft">${db.name}</div>`;
  const slot = el.querySelector('.slot');
  const setFromY = (y) => {
    const r = slot.getBoundingClientRect();
    const v = Math.max(0, Math.min(8, Math.round((y - r.top - 14) / 15)));
    setDrawbar(d, v);
  };
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); el.focus(); setFromY(e.clientY); });
  el.addEventListener('pointermove', (e) => { if (el.hasPointerCapture(e.pointerId)) setFromY(e.clientY); });
  el.addEventListener('wheel', (e) => { e.preventDefault(); setDrawbar(d, P.drawbars[d] + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });
  el.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setDrawbar(d, P.drawbars[d] + (e.code === 'ArrowDown' ? 1 : -1)); }
  });
  $('#drawbars').appendChild(el);
  return el;
});

function setDrawbar(d, v) {
  v = Math.max(0, Math.min(8, v));
  if (P.drawbars[d] === v) return;
  const db = [...P.drawbars]; db[d] = v;
  setP({ drawbars: db });
}

// expression (swell) pedal on screen: tablets have no ↑ ↓ keys and no CC 11.
// The engine glides to each new setting, so dragging it is click-free.
const swell = $('#swell');
const setExpression = (v) => setP({ expression: Math.round(Math.max(0, Math.min(1, v)) * 100) / 100 });
const swellFromY = (y) => {
  const r = swell.querySelector('.track').getBoundingClientRect();
  setExpression(1 - (y - r.top - 8) / Math.max(1, r.height - 16));
};
swell.addEventListener('pointerdown', (e) => { swell.setPointerCapture(e.pointerId); swell.focus(); swellFromY(e.clientY); });
swell.addEventListener('pointermove', (e) => { if (swell.hasPointerCapture(e.pointerId)) swellFromY(e.clientY); });
swell.addEventListener('wheel', (e) => { e.preventDefault(); setExpression(P.expression + (e.deltaY > 0 ? -0.02 : 0.02)); }, { passive: false });
swell.addEventListener('keydown', (e) => {
  const step = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.2, PageDown: -0.2 }[e.code];
  if (step !== undefined) setExpression(P.expression + step);
  else if (e.code === 'Home' || e.code === 'End') setExpression(e.code === 'End' ? 1 : 0);
  else return;
  e.preventDefault(); e.stopPropagation();
});

const regString = (a) => `${a[0]}${a[1]} ${a[2]}${a[3]}${a[4]}${a[5]} ${a[6]}${a[7]}${a[8]}`;
$('#registration').addEventListener('change', (e) => {
  const digits = e.target.value.replace(/[^0-8]/g, '');
  if (digits.length === 9) setP({ drawbars: digits.split('').map(Number) });
  else e.target.value = regString(P.drawbars);
  e.target.blur();
});

for (const b of document.querySelectorAll('#perc button')) {
  b.addEventListener('click', () => { setP({ [b.dataset.k]: !P[b.dataset.k] }); b.blur(); });
}
for (const b of document.querySelectorAll('#vib button')) b.addEventListener('click', () => { setP({ vib: b.dataset.v }); b.blur(); });
for (const b of document.querySelectorAll('#leslie button')) {
  b.addEventListener('click', () => {
    setP(b.dataset.v === 'bypass' ? { leslieOn: false } : { leslieOn: true, leslie: b.dataset.v });
    b.blur();
  });
}
$('#motor').addEventListener('click', (e) => { setP({ motor: !P.motor }); e.currentTarget.blur(); });

function refreshConsole() {
  P.drawbars.forEach((v, d) => {
    const el = drawbarEls[d];
    el.style.setProperty('--v', v);
    el.querySelector('.rod span').textContent = v;
    el.setAttribute('aria-valuenow', String(v));
    el.querySelector('.slot').style.opacity = d === 8 && P.percOn ? 0.45 : 1;
  });
  $('#registration').value = regString(P.drawbars);
  for (const b of document.querySelectorAll('#perc button')) b.classList.toggle('on', !!P[b.dataset.k]);
  for (const b of document.querySelectorAll('#vib button')) b.classList.toggle('on', P.vib === b.dataset.v);
  for (const b of document.querySelectorAll('#leslie button')) {
    b.classList.toggle('on', b.dataset.v === 'bypass' ? !P.leslieOn : P.leslieOn && P.leslie === b.dataset.v);
  }
  const m = $('#motor');
  m.textContent = P.motor ? 'Run' : 'Off';
  m.className = `motor ${P.motor ? 'on' : 'off'}`;
}

// ---------------------------------------------------------------------------
// sidebar parameters

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
    det.open = ['gen', 'keys'].includes(g.id);
    det.innerHTML = `<summary>${g.title}</summary>`;
    for (const p of g.params) {
      const wrap = document.createElement('div');
      wrap.className = 'param';
      let input, val = null;
      if (p.type === 'select') {
        wrap.innerHTML = `<label for="p-${p.id}">${p.label}</label>`;
        input = document.createElement('select');
        input.id = `p-${p.id}`;
        for (const [k, name] of p.options) input.add(new Option(name, k));
        input.addEventListener('change', () => { setP({ [p.id]: input.value }); input.blur(); });
        wrap.appendChild(input);
      } else {
        wrap.innerHTML = `<div class="row"><label for="p-${p.id}">${p.label}</label><span class="val"></span></div>`;
        val = wrap.querySelector('.val');
        input = document.createElement('input');
        input.type = 'range'; input.min = 0; input.max = 1000; input.step = 1; input.id = `p-${p.id}`;
        input.addEventListener('input', () => setP({ [p.id]: fromSlider(p, +input.value) }, true));
        input.addEventListener('dblclick', () => setP({ [p.id]: p.def }));
        wrap.appendChild(input);
      }
      if (p.hint) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = p.hint; wrap.appendChild(h); }
      det.appendChild(wrap);
      controls.set(p.id, { p, input, val });
    }
    $('#groups').appendChild(det);
  }
  const ps = $('#preset');
  ps.add(new Option('Registrations & setups…', ''));
  PRESETS.forEach((pr, i) => ps.add(new Option(pr.name, i)));
  ps.addEventListener('change', () => {
    if (ps.value === '') return;
    const keep = { volume: P.volume, room: P.room, expression: P.expression, motor: true };
    replaceP({ ...DEFAULTS, ...keep, ...PRESETS[+ps.value].p });
    ps.blur();
  });
  $('#reset').addEventListener('click', () => { replaceP({ ...DEFAULTS }); $('#preset').value = ''; });
}

function refreshControl(id, fromSliderDrag = false) {
  const c = controls.get(id);
  if (!c) return;
  const v = P[id];
  if (c.p.type === 'select') c.input.value = v;
  else {
    if (!fromSliderDrag) c.input.value = toSlider(c.p, v);
    c.val.textContent = c.p.fmt ? c.p.fmt(v) : String(v);
  }
}

const GEN_KEYS = new Set(ALL_PARAMS.filter((p) => p.kind === 'gen').map((p) => p.id));
const MIX_KEYS = new Set(ALL_PARAMS.filter((p) => p.kind === 'mix').map((p) => p.id));

function setP(changes, fromSliderDrag = false) {
  let gen = false, mix = false, eng = false;
  for (const [k, v] of Object.entries(changes)) {
    if (JSON.stringify(P[k]) === JSON.stringify(v)) continue;
    P[k] = Array.isArray(v) ? [...v] : v;
    if (GEN_KEYS.has(k)) gen = true; else if (MIX_KEYS.has(k)) mix = true; else eng = true;
    refreshControl(k, fromSliderDrag);
  }
  if (gen) { sendConfig(); refreshGenerator(); }
  if (eng) sendParams();
  if (mix) applyMix();
  refreshConsole();
  refreshFocus();
  refreshActivity();
  updateHelp();
  save();
  $('#preset').value = '';
}

function replaceP(newP) {
  P = { ...newP, drawbars: [...newP.drawbars] };
  for (const id of controls.keys()) refreshControl(id);
  sendConfig(); sendParams(); applyMix();
  refreshConsole(); refreshGenerator(); refreshFocus(); refreshActivity(); updateHelp(); save();
}

// ---------------------------------------------------------------------------
// analysis + visualisation

const genView = new GeneratorView($('#generator'), (w) => {
  if (w === null) { $('#gen-caption').textContent = defaultCaption; return; }
  const s = wheelSpec(w);
  const f = (P.tuning === 'et' ? etFreq(w) : gearFreq(w)) * (P.mains / 60);
  const users = [];
  for (const k of sounding.keys()) for (let d = 0; d < 9; d++) if (keyWheel(k, d) === w && P.drawbars[d] > 0) users.push(`${noteName(k)} ${DRAWBARS[d].name}`);
  $('#gen-caption').textContent = `Wheel ${w} · ${wheelName(w)} · ${s.teeth} teeth on the ${s.gear[0]}/${s.gear[1]} gear · ${f.toFixed(3)} Hz · ${centsOff(w) >= 0 ? '+' : ''}${centsOff(w).toFixed(2)} ¢ vs ET`
    + (users.length ? ` · now feeding ${users.join(', ')}` : '');
});
const defaultCaption = $('#gen-caption').textContent;
const leslieView = new LeslieView($('#leslie-view'));
const output = new OutputView($('#output'));

function refreshGenerator() {
  for (let w = 1; w <= NUM_WHEELS; w++) genView.cents[w] = P.tuning === 'et' ? 0 : centsOff(w);
  genView.harmonic = P.tuning === 'harmonic';
  $('#gen-mode').textContent = { gears: '12 gear pairs · shared wheels', et: 'idealised: exact ET wheels', harmonic: 'bypassed: each key has its own exact harmonics' }[P.tuning];
}

function refreshActivity() {
  const a = genView.activity;
  a.fill(0);
  if (P.tuning === 'harmonic') return;
  for (const k of sounding.keys()) {
    for (let d = 0; d < 9; d++) {
      if (d === 8 && P.percOn) continue;
      a[keyWheel(k, d)] += drawbarGain(P.drawbars[d]);
    }
    if (P.percOn) a[percWheel(k, P.percThird)] += 0.7;
  }
}

function refreshFocus() {
  const rows = keyAnalysis(focusKey, P);
  $('#focus-name').textContent = noteName(focusKey);
  $('#focus-name2').textContent = noteName(focusKey);
  const fmtC = (c) => (Math.abs(c) < 0.005 ? '0.00' : `${c > 0 ? '+' : ''}${c.toFixed(2)}`);
  $('#analysis').innerHTML = '<tr><th>drawbar</th><th>wheel</th><th>plays (Hz)</th><th>harmonic (Hz)</th><th>Δ cents</th></tr>'
    + rows.map((r) => {
      const off = P.drawbars[r.d] === 0 || (r.d === 8 && P.percOn);
      const cls = r.folded ? 'fold' : r.cents > 0.005 ? 'pos' : r.cents < -0.005 ? 'neg' : '';
      const cents = r.folded ? `${fmtC(r.cents)} (folded)` : fmtC(r.cents);
      return `<tr class="${off ? 'off' : ''}"><td>${r.name}</td><td>${P.tuning === 'harmonic' ? '—' : `#${r.w}`}</td><td>${r.actual.toFixed(2)}</td><td>${r.ideal.toFixed(2)}</td><td class="${cls}">${cents}</td></tr>`;
    }).join('');
  output.focus = rows.map((r) => ({
    actual: r.actual, ideal: r.ideal, color: BAR_COLORS[DRAWBARS[r.d].color],
    level: r.d === 8 && P.percOn ? 0 : P.drawbars[r.d] / 8,
  }));
}

function frame() {
  requestAnimationFrame(frame);
  const shown = (cv) => cv.offsetParent !== null; // views can be hidden from the Views menu
  if (shown(genView.cv)) genView.draw();
  if (shown(leslieView.cv)) leslieView.draw(P);
  if (shown(output.cv)) output.draw(keyAnalysis(focusKey, P)[2].actual * (lastState ? lastState.shaft : 1));
  if (shown($('#scanner'))) drawScanner($('#scanner'), lastState, P);
}

// ---------------------------------------------------------------------------

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

$('#start').addEventListener('click', (e) => { startAudio(); e.currentTarget.blur(); });
$('#midi-btn').addEventListener('click', (e) => { initMIDI(); e.currentTarget.blur(); });
$('#panic').addEventListener('click', (e) => { panic(); e.currentTarget.blur(); });

buildControls();
for (const id of controls.keys()) refreshControl(id);
keyboardView.labels(keyLabels());
refreshConsole();
refreshGenerator();
refreshFocus();
updateHelp();
requestAnimationFrame(frame);
