// ringdown-main.js — UI, audio graph, keyboard / MIDI, views.

import { GROUPS, ALL_PARAMS, DEFAULTS, PRESETS, fmtSpin } from './ringdown-params.js';
import { QNMBank, keyVoice, noteName, KEY_LO, KEY_HI, spinFromU } from './ringdown-model.js';
import { RingdownEngine } from './ringdown-engine.js';
import { roomIR } from '../../shared/impulses.js';
import { drawPlane, drawKerr, WaveView } from './ringdown-viz.js';

const $ = (s) => document.querySelector(s);
const STORE = 'blackhole-keyboard/params/v1';
function load() { try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); return s ? { ...DEFAULTS, ...s } : { ...DEFAULTS }; } catch { return { ...DEFAULTS }; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(P)); } catch { /* unavailable */ } }

let P = load(), bank = null, fs = 48000, base = 48, focusKey = 60, lastVel = 1;
const held = new Map();
let cache = new Map();
const voiceFor = (key) => { if (!cache.has(key)) cache.set(key, keyVoice(key, P, bank, fs)); return cache.get(key); };
const engineParams = () => ({ stereo: P.stereo ? 1 : 0, releaseMute: P.releaseMute ? 1 : 0 });

// ---------------------------------------------------------------------------
// audio

let audio = null, starting = null;
function startAudio() {
  if (audio) { if (audio.ctx.state !== 'running') audio.ctx.resume(); return Promise.resolve(audio); }
  if (starting) return starting;
  starting = (async () => {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule('src/ringdown-engine.js');
    await ctx.audioWorklet.addModule('src/ringdown-worklet.js');
    const node = new AudioWorkletNode(ctx, 'ringdown-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.Q.value = 0.6;
    const room = ctx.createConvolver(), roomGain = ctx.createGain(), master = ctx.createGain(), limiter = ctx.createDynamicsCompressor();
    room.buffer = roomIR(ctx, 2.2);
    limiter.threshold.value = -3; limiter.knee.value = 3; limiter.ratio.value = 12; limiter.attack.value = 0.002; limiter.release.value = 0.15;
    node.connect(tone);
    tone.connect(master);
    tone.connect(room).connect(roomGain).connect(master);
    master.connect(limiter).connect(ctx.destination);
    node.port.onmessage = (e) => { if (e.data.type === 'stats') $('#voices').textContent = `${e.data.voices} ringing`; };
    if (ctx.sampleRate !== fs) { fs = ctx.sampleRate; cache = new Map(); }
    audio = { ctx, node, tone, roomGain, master };
    applyMix();
    node.port.postMessage({ type: 'params', params: engineParams() });
    if (ctx.state !== 'running') await ctx.resume();
    $('#start').textContent = `Audio on · ${(fs / 1000).toFixed(1)} kHz`;
    $('#start').classList.add('running');
    return audio;
  })();
  starting.catch((err) => { toast(`Audio failed to start: ${err.message}`); starting = null; });
  return starting;
}
const post = (m) => { if (audio) audio.node.port.postMessage(m); else if (starting) starting.then((a) => a.node.port.postMessage(m)); };
function applyMix() {
  if (!audio) return;
  const t = audio.ctx.currentTime;
  audio.tone.frequency.setTargetAtTime(P.tone, t, 0.02);
  audio.roomGain.gain.setTargetAtTime(0.6 * P.room, t, 0.02);
  audio.master.gain.setTargetAtTime(P.volume, t, 0.02);
}

// ---------------------------------------------------------------------------
// keys

async function noteOn(key, vel = 1) {
  if (key < KEY_LO || key > KEY_HI || !bank) return;
  keyboardView.set(key, true);
  const a = await startAudio();
  a.node.port.postMessage({ type: 'noteOn', data: voiceFor(key), vel });
  setFocus(key, vel);
}
function noteOff(key) { keyboardView.set(key, false); post({ type: 'noteOff', key }); }

const LOW = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM', 'Comma', 'KeyL', 'Period', 'Semicolon', 'Slash'];
const LOW_LBL = ['z', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', 'm', ',', 'l', '.', ';', '/'];
const HIGH = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU', 'KeyI', 'Digit9', 'KeyO', 'Digit0', 'KeyP', 'BracketLeft', 'Equal', 'BracketRight'];
const HIGH_LBL = ['q', '2', 'w', '3', 'e', 'r', '5', 't', '6', 'y', '7', 'u', 'i', '9', 'o', '0', 'p', '[', '=', ']'];
function codeToKey(code) { let i = LOW.indexOf(code); if (i >= 0) return base + i; i = HIGH.indexOf(code); return i >= 0 ? base + 12 + i : null; }
function keyLabels() { const m = new Map(); LOW_LBL.forEach((l, i) => m.set(base + i, l)); HIGH_LBL.forEach((l, i) => { if (!m.has(base + 12 + i)) m.set(base + 12 + i, l); }); return m; }
const typing = (t) => t && (t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox'].includes(t.type)));

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
  const onSlider = e.target?.tagName === 'INPUT';
  if (!onSlider && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { e.preventDefault(); shiftOctave(e.code === 'ArrowLeft' ? -12 : 12); return; }
  if (!onSlider && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
    e.preventDefault();
    setParam('spinU', Math.round(Math.min(6, Math.max(0, P.spinU + (e.code === 'ArrowUp' ? 0.25 : -0.25))) * 1000) / 1000);
    return;
  }
  const key = codeToKey(e.code);
  if (key === null) return;
  e.preventDefault();
  if (e.repeat || held.has(e.code)) return;
  held.set(e.code, key);
  noteOn(key);
});
window.addEventListener('keyup', (e) => { const key = held.get(e.code); if (key !== undefined) { held.delete(e.code); noteOff(key); } });
window.addEventListener('blur', () => { for (const k of held.values()) noteOff(k); held.clear(); });
function shiftOctave(d) { const nb = base + d; if (nb < KEY_LO - 12 || nb > KEY_HI - 12) return; base = nb; keyboardView.labels(keyLabels()); updateHelp(); }
function updateHelp() {
  $('#oct').textContent = `${noteName(Math.max(KEY_LO, base))}–${noteName(Math.min(KEY_HI, base + 31))}`;
  $('#spin-read').textContent = fmtSpin(P.spinU);
}

function initMIDI() {
  if (!navigator.requestMIDIAccess) { $('#midi').textContent = 'Web MIDI unsupported (use Chrome/Edge)'; return; }
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
  if (cmd === 0x90 && d2 > 0) noteOn(d1, (d2 / 127) ** 1.5);
  else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) noteOff(d1);
  else if (cmd === 0xb0 && d1 === 1) setParam('spinU', Math.round((6 * d2) / 127 * 1000) / 1000);
  else if (cmd === 0xb0 && (d1 === 120 || d1 === 123)) post({ type: 'panic' });
}

const keyboardView = (() => {
  const root = $('#keyboard'), els = new Map();
  const black = (m) => [1, 3, 6, 8, 10].includes(m % 12);
  const whites = [];
  for (let m = KEY_LO; m <= KEY_HI; m++) if (!black(m)) whites.push(m);
  const ww = 100 / whites.length;
  let wi = 0;
  for (let m = KEY_LO; m <= KEY_HI; m++) {
    const el = document.createElement('div');
    el.dataset.key = m;
    if (black(m)) { el.className = 'bk'; el.style.left = `${(wi - 0.32) * ww}%`; el.style.width = `${0.64 * ww}%`; }
    else {
      el.className = 'wk'; el.style.left = `${wi * ww}%`; el.style.width = `${ww}%`;
      if (m % 12 === 0) { const c = document.createElement('span'); c.className = 'c-label'; c.textContent = noteName(m); el.appendChild(c); }
      wi++;
    }
    const lbl = document.createElement('span'); lbl.className = 'k-label'; el.appendChild(lbl);
    root.appendChild(el); els.set(m, el);
  }
  let pk = null;
  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-key]');
    if (!el) return;
    root.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    pk = +el.dataset.key; noteOn(pk, 0.3 + 0.7 * Math.min(1, (e.clientY - r.top) / r.height));
  });
  const up = () => { if (pk !== null) { noteOff(pk); pk = null; } };
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  return {
    set(m, on) { els.get(m)?.classList.toggle('down', on); },
    labels(map) { for (const [m, el] of els) { el.querySelector('.k-label').textContent = map.get(m) ?? ''; el.classList.toggle('mapped', map.has(m)); } },
  };
})();

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
    det.className = 'group'; det.open = true;
    det.innerHTML = `<summary>${g.title}</summary>`;
    for (const p of g.params) {
      const wrap = document.createElement('div');
      wrap.className = 'param';
      let input, val = null;
      if (p.type === 'checkbox') {
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
    setAll({ ...DEFAULTS, volume: P.volume, room: P.room, tone: P.tone, stereo: P.stereo, ...PRESETS[+ps.value].p });
    ps.blur();
  });
  $('#reset').addEventListener('click', () => { setAll({ ...DEFAULTS }); $('#preset').value = ''; });
}
function refreshControl(id, dragging = false) {
  const c = controls.get(id);
  if (!c) return;
  if (c.p.type === 'checkbox') c.input.checked = !!P[id];
  else { if (!dragging) c.input.value = toSlider(c.p, P[id]); c.val.textContent = c.p.fmt ? c.p.fmt(P[id]) : String(P[id]); }
}
function refreshVisibility() { for (const { p, wrap } of controls.values()) wrap.hidden = p.showIf ? !p.showIf(P) : false; }
function setAll(np) {
  P = np; cache = new Map();
  for (const id of controls.keys()) refreshControl(id);
  refreshVisibility(); post({ type: 'params', params: engineParams() }); applyMix(); updateHelp(); save();
  setFocus(focusKey, lastVel);
}
let focusTimer = 0;
function setParam(id, v, dragging = false) {
  const p = ALL_PARAMS.find((q) => q.id === id);
  if (P[id] === v) return;
  P[id] = v;
  refreshControl(id, dragging); refreshVisibility(); save(); updateHelp();
  $('#preset').value = '';
  if (p.kind === 'mix') applyMix();
  else if (p.kind === 'engine') post({ type: 'params', params: engineParams() });
  else { cache = new Map(); clearTimeout(focusTimer); focusTimer = setTimeout(() => setFocus(focusKey, lastVel), 60); }
}

// ---------------------------------------------------------------------------
// focus key: views

const wave = new WaveView($('#wave'));
let focusVoice = null;
function setFocus(key, vel) {
  if (!bank) return;
  focusKey = key; lastVel = vel;
  const v = voiceFor(key);
  focusVoice = v;
  // render the note offline for the strain view
  const eng = new RingdownEngine(fs);
  eng.setParams(engineParams());
  eng.noteOn(v, 1);
  const tau = v.modes.length ? Math.max(...v.modes.filter((m) => m.n === 0).map((m) => m.tau)) : 0.01;
  const chirpT = v.chirp ? (5 / 256) * v.chirp.Mc ** (-5 / 3) * (Math.PI * v.chirp.fStart) ** (-8 / 3) : 0;
  const n = Math.min(Math.round(fs * 2.5), Math.max(256, Math.round(fs * (chirpT + 6 * tau))));
  const hp = new Float32Array(n), hx = new Float32Array(n);
  const L = new Float32Array(128), R = new Float32Array(128);
  for (let s = 0; s < n; s += 128) {
    eng.process(L, R, 128);
    for (let i = 0; i < 128 && s + i < n; i++) { hp[s + i] = L[i]; hx[s + i] = R[i]; }
  }
  wave.set({ hp, hx, fs, modes: v.modes });
  showInfo(v);
}

function showInfo(v) {
  const i = v.info, m220 = v.modes.find((m) => m.l === 2 && m.m === 2 && m.n === 0);
  $('#bh-title').textContent = `The black hole under ${noteName(v.key)}`;
  $('#plane-read').textContent = `${fmtSpin(P.spinU)} · q = ${P.massRatio.toFixed(2)} · ι = ${P.inclination.toFixed(0)}°`;
  const rows = [
    ['Mass', `${i.Msun.toFixed(1)} M☉`],
    ['Spin', fmtSpin(P.spinU)],
    ['Horizon radius r₊', `${i.rPlusKm.toFixed(0)} km`],
    ['Horizon spins at', `${i.OmegaH.toFixed(1)} Hz (Ω_H / 2π)`],
    ['Fundamental (2,2,0)', m220 ? `${m220.f.toFixed(2)} Hz · τ = ${(m220.tau * 1000).toFixed(2)} ms · Q = ${m220.Q.toFixed(1)}` : '—'],
    ['Audible cycles', m220 ? `≈ ${(m220.Q * 2.2).toFixed(0)} (to −60 dB)` : '—'],
    ['Hawking temperature', `${(i.hawkingK * 1e9).toFixed(2)} nK`],
  ];
  $('#info').innerHTML = rows.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('');
  const f0 = m220 ? m220.f : v.info.f0;
  const lvl = (m) => Math.hypot(m.cpr, m.cpi) + Math.hypot(m.cxr, m.cxi);
  const mx = Math.max(1e-12, ...v.modes.map(lvl));
  $('#modes').innerHTML = '<tr><th>mode (l,m,n)</th><th>Hz</th><th>× f₂₂₀</th><th>τ (ms)</th><th>Q</th><th>level</th></tr>'
    + v.modes.slice().sort((a, b) => lvl(b) - lvl(a)).map((m) => `<tr><td>(${m.l}, ${m.m}, ${m.n})${m.m < 0 ? ' <span class="muted">counter-rot.</span>' : ''}</td><td>${m.f.toFixed(1)}</td><td>${(m.f / f0).toFixed(3)}</td><td>${(m.tau * 1000).toFixed(2)}</td><td>${m.Q.toFixed(1)}</td><td>${(20 * Math.log10(lvl(m) / mx)).toFixed(1)} dB</td></tr>`).join('');
}

function frame() {
  if (bank && focusVoice) {
    const a = spinFromU(P.spinU);
    const lvl = (m) => Math.hypot(m.cpr, m.cpi) + Math.hypot(m.cxr, m.cxi);
    drawPlane($('#plane'), bank, a, focusVoice.modes.map((m) => ({ l: m.l, m: m.m, n: m.n, level: lvl(m) })));
    drawKerr($('#kerr'), a, P.inclination);
  }
  wave.draw();
  requestAnimationFrame(frame);
}

let toastTimer = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500); }
$('#start').addEventListener('click', (e) => { startAudio(); e.currentTarget.blur(); });
$('#midi-btn').addEventListener('click', (e) => { initMIDI(); e.currentTarget.blur(); });
$('#panic').addEventListener('click', (e) => { post({ type: 'panic' }); e.currentTarget.blur(); });
for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
  wave.mode = b.dataset.mode; b.blur();
});

buildControls();
for (const id of controls.keys()) refreshControl(id);
refreshVisibility();
keyboardView.labels(keyLabels());
updateHelp();
fetch('data/qnm-table.json').then((r) => r.json()).then((t) => { bank = new QNMBank(t); setFocus(60, 1); });
requestAnimationFrame(frame);
