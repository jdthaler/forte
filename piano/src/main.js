// main.js — the page: UI, views, computer keyboard + MIDI input. The instrument
// itself (parameters, engine, voice data, output chain) is in piano-instrument.js.
// The worklet runs the WebAssembly build (piano-wasm.js) when it can, and the views call
// its model once it has loaded; both fall back to the JavaScript (?engine=js forces it).

import { ALL_PARAMS } from './params.js';
import { INSTRUMENT, GROUPS, DEFAULTS, PRESETS, keyModel } from './piano-instrument.js';
import { noteName, MATERIALS, NMAX_MODES } from './physics.js';
import { PianoEngine } from './engine.js'; // the slow-motion view runs its own copy
import { PianoWasmEngine, wasmModel } from './piano-wasm.js';
import { useWasm } from '../../shared/shell.js';
import { createChain } from '../../shared/chain.js';
import { MotionView, SpectrumView, drawSection, FAMILY } from './viz.js';
import { createKeyboard } from '../../shared/keyboard.js';
import { startMIDI, resumeMIDI } from '../../shared/midi.js';
import { controlOwns } from '../../shared/focus.js';
import { trimGain } from '../../shared/registry.js';

const $ = (s) => document.querySelector(s);
const STORE = 'ribbon-piano/params/v1';
const [KEY_LO, KEY_HI] = INSTRUMENT.range;

// ---------------------------------------------------------------------------
// state

function loadParams() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    return s ? { ...DEFAULTS, ...s } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}
function saveParams() {
  try { localStorage.setItem(STORE, JSON.stringify(P)); } catch { /* storage unavailable */ }
}

let P = loadParams();
let fs = 48000;                // the audio context's rate, once it runs
let base = 48;                 // MIDI note of the lower-row "Z" key
let focusKey = 60;
let sustain = false;
const sent = new Map();        // MIDI key → the voice data the engine holds for it
const held = new Map();        // keyboard code → MIDI key
const sounding = new Map();    // MIDI key → number of sources holding it

// The WebAssembly model (piano-wasm.js) once it has loaded: { model, data, packed } per key, as
// the JavaScript's keyModel gives { model, data }; both cache the latest version of each key.
let wasm = null;
if (useWasm()) {
  wasmModel().then((m) => { wasm = m; modelChanged(); },
    (err) => console.warn(`piano: the WebAssembly model did not load (${err.message}); the views use the JavaScript one`));
}
const keyData = (key) => (wasm ? wasm.keyModel(key, P, fs) : keyModel(key, P, fs));
// (P as well: a WebAssembly engine takes all the parameters)
const paramsMessage = () => ({ type: 'params', params: INSTRUMENT.engineParams(P), P: { ...P } });
const engineParams = () => INSTRUMENT.engineParams(P);
let engineKind = null; // what the worklet runs: 'wasm' or 'js' (it says so when it starts)
// What a note sends the engine: the JavaScript engine takes the key's voice data object; the
// WebAssembly one that data packed by the page's WebAssembly model, or, without that model,
// nothing (it then builds the key itself).
const noteData = (key, velocity) => (engineKind === 'wasm' ? wasm?.keyModel(key, P, fs).packed : INSTRUMENT.noteData(key, velocity, P, fs));

// ---------------------------------------------------------------------------
// audio

let audio = null, audioStarting = null, live = false; // live: the context has resumed; until then notes queue in order

function startAudio() {
  if (live) {
    if (audio.ctx.state !== 'running') audio.ctx.resume();
    return Promise.resolve(audio);
  }
  if (audioStarting) return audioStarting;
  audioStarting = (async () => {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    if (!ctx.audioWorklet) throw new Error(window.isSecureContext ? 'this browser has no AudioWorklet support' : 'audio needs a secure page — open it with https://');
    await ctx.audioWorklet.addModule(INSTRUMENT.engine.module);
    // the WebAssembly build: its bytes go to the worklet, which falls back to the JavaScript
    // engine if it can't run them
    let wasmBuild;
    if (INSTRUMENT.wasm && useWasm()) {
      try {
        const bytes = await (await fetch(INSTRUMENT.wasm.binary)).arrayBuffer();
        await ctx.audioWorklet.addModule(INSTRUMENT.wasm.module);
        wasmBuild = { name: INSTRUMENT.wasm.name, bytes };
      } catch (err) { console.warn(`piano: the WebAssembly engine did not load (${err.message}); the JavaScript one plays`); }
    }
    await ctx.audioWorklet.addModule(new URL('../../shared/worklet.js', import.meta.url));
    const node = new AudioWorkletNode(ctx, 'forte-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { engine: INSTRUMENT.engine.name, wasm: wasmBuild },
    });
    const kind = new Promise((resolve) => { engineStarted = resolve; }); // notes wait to know which engine plays
    // dry + soundboard, room, volume, limiter (shared/chain.js); the analyser hears the strings alone
    const chain = createChain(ctx, node, INSTRUMENT.chain);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0.55;
    chain.tap.connect(analyser);
    node.port.onmessage = (e) => onWorklet(e.data);

    fs = ctx.sampleRate; // the voice data's version includes it: keys are rebuilt if it is not 48 kHz
    audio = { ctx, node, analyser, chain };
    applyMix();
    node.port.postMessage(paramsMessage());
    node.port.postMessage({ type: 'sustain', on: sustain });
    spectrum.setAnalyser(analyser);
    await kind;
    if (ctx.state !== 'running') await ctx.resume();
    live = true;
    $('#start').textContent = `Audio on · ${(ctx.sampleRate / 1000).toFixed(1)} kHz`;
    $('#start').classList.add('running');
    return audio;
  })();
  audioStarting.catch((err) => { toast(`Audio failed to start: ${err.message}`); audioStarting = null; });
  return audioStarting;
}

function applyMix() {
  if (audio) audio.chain.apply(P, trimGain(INSTRUMENT.id)); // level-matched across instruments
}

let engineStarted = null;
function onWorklet(m) {
  if (m.type === 'stats') {
    const el = $('#cpu');
    el.textContent = `CPU ${(m.load * 100).toFixed(0)} % · ${m.voices} voices · ${m.modes} modes`;
    el.title = `Engine: ${engineKind === 'wasm' ? 'WebAssembly (C++)' : 'JavaScript'}`;
    el.classList.toggle('hot', m.load > 0.7);
  } else if (m.type === 'engine') {
    engineKind = m.kind;
    document.body.dataset.engine = m.kind;
    if (m.reason) console.warn(`piano: the WebAssembly engine failed (${m.reason}); the JavaScript one plays`);
    engineStarted?.(m.kind);
  } else if (m.type === 'error') {
    toast(m.key !== undefined ? `${noteName(m.key)}: ${m.message} — voice silenced` : m.message);
  }
}

// ---------------------------------------------------------------------------
// notes

async function noteOn(key, velocity) {
  if (key < KEY_LO || key > KEY_HI) return;
  sounding.set(key, (sounding.get(key) || 0) + 1);
  keyboardView.set(key, true);
  const a = await startAudio();
  const data = noteData(key, velocity);
  const msg = { type: 'noteOn', key, velocity };
  if (data && sent.get(key) !== data) { msg.data = data; sent.set(key, data); } // the engine keeps the last one
  a.node.port.postMessage(msg);
  setFocus(key, velocity);
}

function noteOff(key) {
  const n = (sounding.get(key) || 0) - 1;
  if (n > 0) { sounding.set(key, n); return; }
  sounding.delete(key);
  keyboardView.set(key, false);
  if (live) audio.node.port.postMessage({ type: 'noteOff', key });
  else if (audioStarting) audioStarting.then((a) => a.node.port.postMessage({ type: 'noteOff', key }), () => {});
}

function setSustain(on) {
  sustain = on;
  const el = $('#sus');
  el.textContent = on ? 'on' : 'off';
  el.className = on ? 'on' : 'off';
  if (live) audio.node.port.postMessage({ type: 'sustain', on });
  else if (audioStarting) audioStarting.then((a) => a.node.port.postMessage({ type: 'sustain', on }), () => {});
  document.dispatchEvent(new CustomEvent('forte-sustain', { detail: on })); // the on-screen pedal and Latch follow
}

function panic() {
  if (audio) audio.node.port.postMessage({ type: 'panic' });
  sounding.clear();
  held.clear();
  keyboardView.clearAll();
  if (sustain) setSustain(false); // Panic lets go of the pedal too
}

// ---------------------------------------------------------------------------
// computer keyboard

const LOW = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM', 'Comma', 'KeyL', 'Period', 'Semicolon', 'Slash'];
const LOW_LBL = ['z', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', 'm', ',', 'l', '.', ';', '/'];
const HIGH = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU', 'KeyI', 'Digit9', 'KeyO', 'Digit0', 'KeyP', 'BracketLeft', 'Equal', 'BracketRight'];
const HIGH_LBL = ['q', '2', 'w', '3', 'e', 'r', '5', 't', '6', 'y', '7', 'u', 'i', '9', 'o', '0', 'p', '[', '=', ']'];

function codeToKey(code) {
  let i = LOW.indexOf(code);
  if (i >= 0) return base + i;
  i = HIGH.indexOf(code);
  if (i >= 0) return base + 12 + i;
  return null;
}

function keyLabels() {
  const map = new Map();
  LOW_LBL.forEach((l, i) => map.set(base + i, l));
  HIGH_LBL.forEach((l, i) => { if (!map.has(base + 12 + i)) map.set(base + 12 + i, l); });
  return map;
}

function typingTarget(t) {
  return t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox'].includes(t.type)));
}

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || typingTarget(e.target)) return;
  // a focused <select> would swallow note keys (or type-ahead into a preset): hand them back
  if (controlOwns(e)) return; // a control reached with Tab keeps its own keys (shared/focus.js)
  if (e.target?.tagName === 'SELECT') { if (e.code === 'Space' || e.code.startsWith('Arrow') || codeToKey(e.code) !== null) e.target.blur(); else return; }
  if (e.code === 'Space') {
    e.preventDefault();
    if (e.isTrusted) spaceHeld = true;
    if (!e.repeat) setSustain(true);
    return;
  }
  if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
    e.preventDefault();
    shiftOctave(e.code === 'ArrowLeft' ? -12 : 12);
    return;
  }
  if ((e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
    e.preventDefault();
    setParam('velocity', Math.min(6, Math.max(0.2, P.velocity * (e.code === 'ArrowUp' ? 1.25 : 0.8))));
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

// Losing focus means no keyup will come: release held keys and a held Space bar
// (the on-screen pedal sends synthetic events and keeps its own state).
let spaceHeld = false;
function letGo() {
  for (const key of held.values()) noteOff(key);
  held.clear();
  if (spaceHeld) { spaceHeld = false; setSustain(false); }
}
window.addEventListener('blur', letGo);
document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });

function shiftOctave(d) {
  const nb = base + d;
  if (nb < KEY_LO - 3 || nb + 31 > KEY_HI + 12) return;
  for (const key of held.values()) noteOff(key);
  held.clear();
  base = nb;
  updateHelp();
  keyboardView.labels(keyLabels());
}

function updateHelp() {
  $('#oct').textContent = `${noteName(Math.max(KEY_LO, base))}–${noteName(Math.min(KEY_HI, base + 31))}`;
  $('#vel').textContent = `${P.velocity.toFixed(2)} m/s`;
}

// ---------------------------------------------------------------------------
// MIDI

function initMIDI() {
  startMIDI({ onMIDI, status: (t) => { $('#midi').textContent = t; }, button: $('#midi-btn') });
}

function onMIDI(ev) {
  const [st, d1, d2] = ev.data;
  const cmd = st & 0xf0;
  if (cmd === 0x90 && d2 > 0) noteOn(d1, INSTRUMENT.midiVelocity(d2 / 127)); // 0.25 … 6 m/s hammer speed
  else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) noteOff(d1);
  else if (cmd === 0xb0 && d1 === 64) setSustain(d2 >= 64);
  else if (cmd === 0xb0 && d1 === 67) setParam('unaCorda', d2 >= 64); // soft pedal
  else if (cmd === 0xb0 && (d1 === 120 || d1 === 123)) panic();
}

// ---------------------------------------------------------------------------
// on-screen keyboard

const keyboardView = createKeyboard($('#keyboard'), { lo: KEY_LO, hi: KEY_HI, onDown: (k, f) => noteOn(k, 0.4 + 5.2 * f ** 1.5), onUp: noteOff }); // depth into the key → hammer speed (m/s)

// ---------------------------------------------------------------------------
// parameter controls

const controls = new Map();

function toSlider(p, v) {
  if (p.log) return (1000 * Math.log(v / p.min)) / Math.log(p.max / p.min);
  return (1000 * (v - p.min)) / (p.max - p.min);
}
function fromSlider(p, t) {
  let v = p.log ? p.min * (p.max / p.min) ** (t / 1000) : p.min + ((p.max - p.min) * t) / 1000;
  if (p.step) v = Math.round(v / p.step) * p.step;
  return Math.min(p.max, Math.max(p.min, v));
}

function buildControls() {
  const root = $('#groups');
  for (const g of GROUPS) {
    const det = document.createElement('details');
    det.className = 'group';
    det.open = g.id !== 'output';
    det.innerHTML = `<summary>${g.title}</summary>`;
    for (const p of g.params) {
      const wrap = document.createElement('div');
      wrap.className = 'param';
      if (p.perform) wrap.dataset.perform = ''; // above the keys in Perform (shared/layout.js)
      let input, val = null;
      if (p.type === 'select') {
        wrap.innerHTML = `<label for="p-${p.id}">${p.label}</label>`;
        input = document.createElement('select');
        input.id = `p-${p.id}`;
        for (const [k, name] of p.options) input.add(new Option(name, k));
        input.addEventListener('change', () => { setParam(p.id, input.value); input.blur(); });
        wrap.appendChild(input);
      } else if (p.type === 'checkbox') {
        wrap.classList.add('check');
        input = document.createElement('input');
        input.type = 'checkbox';
        input.id = `p-${p.id}`;
        input.addEventListener('change', () => setParam(p.id, input.checked));
        const lab = document.createElement('label');
        lab.htmlFor = input.id;
        lab.textContent = p.label;
        wrap.append(input, lab);
      } else {
        wrap.innerHTML = `<div class="row"><label for="p-${p.id}">${p.label}</label><span class="val"></span></div>`;
        val = wrap.querySelector('.val');
        input = document.createElement('input');
        input.type = 'range';
        input.min = 0; input.max = 1000; input.step = 1;
        input.id = `p-${p.id}`;
        input.addEventListener('input', () => setParam(p.id, fromSlider(p, +input.value), { fromSlider: true }));
        input.addEventListener('dblclick', () => setParam(p.id, p.def));
        wrap.appendChild(input);
      }
      if (p.hint) {
        const h = document.createElement('div');
        h.className = 'hint';
        h.textContent = p.hint;
        wrap.appendChild(h);
      }
      det.appendChild(wrap);
      controls.set(p.id, { p, input, val, wrap });
    }
    root.appendChild(det);
  }
  const ps = $('#preset');
  ps.add(new Option('Presets…', ''));
  PRESETS.forEach((pr, i) => ps.add(new Option(pr.name, i)));
  ps.addEventListener('change', () => {
    if (ps.value === '') return;
    const keep = Object.fromEntries(INSTRUMENT.keep.map((k) => [k, P[k]]));
    setAll({ ...DEFAULTS, ...keep, ...PRESETS[+ps.value].p });
    ps.blur();
  });
  $('#reset').addEventListener('click', () => { setAll({ ...DEFAULTS }); $('#preset').value = ''; });
}

function refreshControl(id) {
  const c = controls.get(id);
  if (!c) return;
  const v = P[id];
  if (c.p.type === 'select') c.input.value = v;
  else if (c.p.type === 'checkbox') c.input.checked = !!v;
  else {
    c.input.value = toSlider(c.p, v);
    c.val.textContent = c.p.fmt ? c.p.fmt(v) : String(v);
  }
}

function refreshVisibility() {
  for (const { p, wrap } of controls.values()) wrap.hidden = p.showIf ? !p.showIf(P) : false;
}

function setAll(newP) {
  P = newP;
  for (const id of controls.keys()) refreshControl(id);
  refreshVisibility();
  if (audio) audio.node.port.postMessage(paramsMessage());
  applyMix();
  updateHelp();
  saveParams();
  modelChanged();
}

function setParam(id, v, opts = {}) {
  const p = ALL_PARAMS.find((q) => q.id === id);
  if (P[id] === v) return;
  P[id] = v;
  if (!opts.fromSlider || p.type) refreshControl(id);
  else {
    const c = controls.get(id);
    c.val.textContent = p.fmt ? p.fmt(v) : String(v);
  }
  saveParams();
  if (id === 'velocity') { updateHelp(); refreshControl(id); return; }
  if (p.kind === 'engine') {
    if (audio) audio.node.port.postMessage(paramsMessage());
    modelChangedSoon(true);
  } else if (p.kind === 'mix') applyMix();
  else if (p.kind === 'model') { // a new version of the voice data (piano-instrument.js)
    refreshVisibility();
    modelChangedSoon();
  }
  $('#preset').value = '';
}

let mcTimer = 0;
function modelChangedSoon() {
  clearTimeout(mcTimer);
  mcTimer = setTimeout(modelChanged, 140);
}

function modelChanged() {
  setFocus(focusKey, lastVelocity);
  precompute();
}

// Compute nearby keys in the background so playing stays snappy (tapered
// members need a Rayleigh–Ritz eigen-solve per key).
let pq = [], pqTimer = 0;
function precompute() {
  const center = base + 15;
  pq = [];
  for (let m = KEY_LO; m <= KEY_HI; m++) pq.push(m);
  pq.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
  clearTimeout(pqTimer);
  pqTimer = setTimeout(pqTick, 60);
}
function pqTick() {
  const t0 = performance.now();
  while (pq.length && performance.now() - t0 < 10) keyData(pq.shift());
  if (pq.length) pqTimer = setTimeout(pqTick, 4);
}

// ---------------------------------------------------------------------------
// focus key: info panel, cross-section, slow motion, partials

const motion = new MotionView($('#motion'));
const spectrum = new SpectrumView($('#spectrum'));
let lastVelocity = 2.5;
let simTimer = 0;

function setFocus(key, velocity) {
  focusKey = key;
  lastVelocity = velocity;
  keyboardView.focus(key);
  const c = keyData(key);
  showInfo(c.model);
  drawSection($('#section'), c.model, P);
  clearTimeout(simTimer);
  simTimer = setTimeout(() => runSim(key, velocity), 30);
}

// The first moments after the strike, on this thread: the WebAssembly engine on the WebAssembly
// model's data once it has loaded, the JavaScript engine otherwise.
function runSim(key, velocity) {
  const { model, data, packed } = keyData(key);
  const eng = wasm ? new PianoWasmEngine(fs) : new PianoEngine(fs);
  eng.setParams(wasm ? { ...P } : engineParams());
  const v = eng.noteOn(key, velocity, wasm ? packed : data);
  const period = 1 / model.info.f0;
  const total = Math.round(Math.min(0.05, Math.max(0.008, 4 * period)) * fs);
  const stride = Math.max(1, Math.ceil(total / 700));
  const frames = [], eta = [];
  const L = new Float32Array(stride), R = new Float32Array(stride);
  let amps = null, hEta = 0, hVel = 0;
  for (let s = 0; s < total; s += stride) {
    frames.push(v.snapshot(new Float64Array(data.n)));
    if (v.hammerOn) { hEta = v.eta; hVel = (v.eta - v.etaPrev) * fs; } else hEta += hVel * (stride / fs);
    eta.push(hEta);
    eng.process(L, R, stride);
    if (!amps && !v.hammerOn) amps = v.modeAmplitudes(eng);
  }
  for (let guard = 0; !amps && guard < 10000; guard++) {
    eng.process(L, R, stride);
    if (!v.hammerOn) amps = v.modeAmplitudes(eng);
  }
  const contactMs = (v.contactSamples / fs) * 1000, Fmax = v.Fmax;
  eng.destroy?.();
  motion.set({
    frames, eta: Float64Array.from(eta), dt: stride / fs, model, data, P: { ...P },
    title: `${noteName(key)} · ${velocity.toFixed(2)} m/s`,
  });
  // partials: sum unison copies in power
  const groups = new Map();
  let maxA = 0;
  for (let j = 0; j < data.n; j++) {
    const id = data.famId[j] * 10000 + data.idx[j];
    const g = groups.get(id) || { fam: data.famId[j], n: data.idx[j], f: 0, pow: 0 };
    if (data.uni[j] === 0) g.f = data.freq[j];
    g.pow += amps[j] ** 2;
    groups.set(id, g);
  }
  for (const g of groups.values()) maxA = Math.max(maxA, g.pow);
  const list = [...groups.values()].map((g) => ({ f: g.f, fam: g.fam, n: g.n, db: 10 * Math.log10(g.pow / maxA + 1e-30) }));
  const present = [...new Set(data.famId)].sort();
  const families = present.map((fam) => ({ fam, f: Array.from(model.families[fam].omega, (w) => w / (2 * Math.PI)) }));
  spectrum.set({ f0: model.info.f0, list, families });
  $('#legend').innerHTML = present.map((f) => `<span><i style="background:${FAMILY[f].color}"></i>${legendName(f)}</span>`).join('')
    + `<span>hammer contact ${contactMs.toFixed(2)} ms · peak force ${Fmax.toFixed(1)} N</span>`;
}

function legendName(f) {
  if (P.shape === 'ribbon') return ['bending, easy axis', 'bending, hard axis', 'torsion'][f];
  return ['bending (hammer plane)', 'bending (perpendicular)', 'torsion'][f];
}

function showInfo(model) {
  const i = model.info, s = model.sec;
  $('#info-title').textContent = `${i.name} · ${i.f0.toFixed(2)} Hz`;
  $('#info-sub').textContent = `${MATERIALS[P.material].name}, ${P.shape}`;
  const cents = (a, b) => 1200 * Math.log2(a / b);
  const dims = P.shape === 'round' ? `Ø ${(s.w * 1000).toFixed(3)} mm`
    : P.shape === 'square' ? `${(s.w * 1000).toFixed(3)} mm square`
      : P.shape === 'triangle' ? `side ${(s.w * 1000).toFixed(3)} mm`
        : `${(s.w * 1000).toFixed(2)} × ${(s.t * 1000).toFixed(3)} mm`;
  const rows = [
    ['Speaking length', `${(i.L * 100).toFixed(1)} cm`],
    ['Core section', dims + (i.uniform ? '' : ' (mean)')],
    ['Mass / length', `${(i.mu * 1000).toFixed(2)} g/m${i.dMu ? ` (incl. ${(i.dMu * 1000).toFixed(1)} winding)` : ''}`],
    ['Tension', `${i.T.toFixed(0)} N`],
    ['Stress / breaking', `${(i.strengthRatio * 100).toFixed(0)} %${i.strengthRatio > 1 ? ' — would snap!' : ''}`, i.strengthRatio > 1],
    ['Inharmonicity B', P.shape === 'ribbon' ? `${i.B1.toExponential(2)} easy · ${i.B2.toExponential(2)} hard` : i.B1.toExponential(2)],
  ];
  if (P.shape === 'ribbon') {
    const other = i.tuneAxis === 'I1' ? i.f1hard : i.f1;
    rows.push([i.tuneAxis === 'I1' ? 'Hard-axis f₁' : 'Easy-axis f₁', `${cents(other, i.f0) >= 0 ? '+' : ''}${cents(other, i.f0).toFixed(1)} ¢`]);
  }
  rows.push(['Torsion f₁', `${i.f1torsion.toFixed(0)} Hz = ${i.torsionRatio.toFixed(3)} × f₁${model.sec.lever && P.offset ? '' : ' (not excited)'}`]);
  rows.push(['Wave speeds', `transverse ${i.cT.toFixed(0)} m/s · torsional ${i.cTheta.toFixed(0)} m/s`]);
  const fam = model.families[0], fTop = fam.omega[fam.n - 1] / (2 * Math.PI);
  rows.push(['Partials', `${fam.n}, up to ${(fTop / 1000).toFixed(2)} kHz${fam.n >= NMAX_MODES ? ` (capped at ${NMAX_MODES})` : ''}`]);
  if (!i.tuned) rows.push(['Tuning', 'too stiff to reach pitch — plays sharp', true]);
  $('#info').innerHTML = rows.map(([k, v, warn]) => `<dt>${k}</dt><dd${warn ? ' class="warn"' : ''}>${v}</dd>`).join('');
}

// ---------------------------------------------------------------------------
// misc UI

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

$('#start').addEventListener('click', (e) => { startAudio(); e.currentTarget.blur(); });
$('#midi-btn').addEventListener('click', (e) => { initMIDI(); e.currentTarget.blur(); });
resumeMIDI(initMIDI); // MIDI was on before and the browser still grants it: on again, no click
$('#panic').addEventListener('click', (e) => { panic(); e.currentTarget.blur(); });
$('#replay').addEventListener('click', (e) => { motion.replay(); e.currentTarget.blur(); });
$('#speed').addEventListener('change', (e) => { motion.speed = +e.target.value; motion.replay(); e.target.blur(); });
const CAPTIONS = {
  spectrum: 'Stems: partials just after the strike (dB re. loudest). Grey: live output. Faint lines: exact harmonics n·f₀.',
  inharm: 'Deviation of partial n from n × that family’s own fundamental, in cents (stiffness stretches; taper bends).',
};
function setSpecMode(mode) {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.mode === mode));
  spectrum.mode = mode;
  $('#spec-caption').textContent = CAPTIONS[mode];
}
for (const b of document.querySelectorAll('.tab')) {
  b.addEventListener('click', () => { setSpecMode(b.dataset.mode); b.blur(); });
}
setSpecMode('spectrum');
window.addEventListener('resize', () => drawSection($('#section'), keyData(focusKey).model, P));

buildControls();
for (const id of controls.keys()) refreshControl(id);
refreshVisibility();
updateHelp();
keyboardView.labels(keyLabels());
setFocus(60, P.velocity);
precompute();
