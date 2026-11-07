// rhodes-main.js — the page: wires the shell (shared/shell.js) to the engine and draws the
// views. The instrument (engine, parameters, key models, output chain) is tines-instrument.js.
// The worklet runs the engine, the C++ built as WebAssembly (tines-wasm.js); the page builds each
// key's modes with the same build's model, sends them with the note, and draws them.

import { createShell } from '../../shared/shell.js';
import { INSTRUMENT } from './tines-instrument.js';
import { noteName } from './tine.js';
import { TinesWasmEngine, wasmModel } from './tines-wasm.js'; // the slow-motion view runs its own engine
import { MotionView, PickupView, SpectrumView, MODE_COLORS, modeKind } from './rhodes-viz.js';
import { SpectrogramView } from '../../shared/views.js';
import { unfocus } from '../../shared/focus.js';
import { paramsStore } from '../../shared/registry.js';

const $ = (s) => document.querySelector(s);
const [KEY_LO, KEY_HI] = INSTRUMENT.range;

// The model (tines-wasm.js): a key's model, plus its voice data packed for the engine (its
// version first); it caches the latest version of each key.
const wasm = await wasmModel();
const fs = () => shell?.audio?.ctx.sampleRate || 48000; // the key models' version includes it: a new rate means new voice data
const keyData = (key) => wasm.keyModel(key, shell.P, fs());
// sent: key → the version of the voice data the engine holds (it keeps the last sent; resent when it changes)
const sent = new Map();

let focusKey = 60, lastVel = 1.8, mcTimer = 0;
const shell = createShell({
  ...INSTRUMENT,
  store: paramsStore('tines'), // the page's own name for its settings, from before the shell
  arrows: { param: 'velocity' }, // a log parameter: ↑/↓ step by 1/24 of its range, about ×1.13
  noteData: (key) => {
    const data = keyData(key).packed;
    if (sent.get(key) === data[0]) return undefined;
    sent.set(key, data[0]);
    return data;
  },
  onAudio: (a) => { spectrum.setAnalyser(a.analyser); spectro.setAnalyser(a.analyser); },
  onNoteOn: (key, vel) => setFocus(key, vel),
  onParam: (id, v, P, p) => {
    if (id === '*') { modelChanged(); return; }
    if (p.kind === 'play' || p.kind === 'mix') return;
    clearTimeout(mcTimer);
    mcTimer = setTimeout(modelChanged, 120);
  },
});
const P = () => shell.P;
function modelChanged() { setFocus(focusKey, lastVel); precompute(); }

let pq = [], pqTimer = 0;
function precompute() {
  pq = [];
  for (let m = KEY_LO; m <= KEY_HI; m++) pq.push(m);
  pq.sort((a, b) => Math.abs(a - shell.base - 15) - Math.abs(b - shell.base - 15));
  clearTimeout(pqTimer);
  pqTimer = setTimeout(function tick() {
    const t0 = performance.now();
    while (pq.length && performance.now() - t0 < 8) keyData(pq.shift());
    if (pq.length) pqTimer = setTimeout(tick, 4);
  }, 60);
}

const motion = new MotionView($('#motion'));
const pickupView = new PickupView($('#pickup'));
const spectrum = new SpectrumView($('#spectrum'));
const spectro = new SpectrogramView($('#spectrogram'), { fLo: 25, fHi: 16000 });
let simTimer = 0;

function setFocus(key, vel) {
  focusKey = key; lastVel = vel;
  shell.keys.focus(key);
  const model = keyData(key);
  showInfo(model);
  spectrum.set(model.info.f0, model.modes);
  spectro.set(model.info.f0, model.modes.map((md) => ({ f: md.f, color: MODE_COLORS[modeKind(md)] })));
  clearTimeout(simTimer);
  simTimer = setTimeout(() => runSim(key, vel), 30);
}

// The first moments after the strike, on this thread: an engine of its own on the model's data.
function runSim(key, vel) {
  const model = keyData(key), data = model.voice;
  const eng = new TinesWasmEngine(fs());
  eng.setParams({ ...P(), cable: 100, tone: 20000, drive: 0, tremDepth: 0 });
  const v = eng.noteOn(key, vel, model.packed);
  const f0 = model.info.f0;
  const total = Math.round(Math.min(0.06, Math.max(0.006, 5 / f0)) * fs());
  const stride = Math.max(1, Math.ceil(total / 600));
  const L = new Float32Array(Math.max(stride, 4096)), R = new Float32Array(L.length);
  const frames = [], eta = [];
  let hEta = 0, hVel = 0;
  for (let s = 0; s < total; s += stride) {
    frames.push(v.snapshot(new Float64Array(v.N)));
    if (v.hammerOn) { hEta = v.eta; hVel = (v.eta - v.etaPrev) * eng.fs2; } else hEta += hVel * (stride / fs());
    eta.push(hEta);
    eng.process(L, R, stride);
  }
  for (let g = 0; v.hammerOn && g < 200; g++) eng.process(L, R, 64);
  // a few cycles of pickup output after the attack
  const nw = Math.min(4096, Math.round((3 / f0) * fs()));
  eng.process(L, R, Math.min(4096, Math.round(0.02 * fs()))); // skip past the attack
  eng.process(L, R, nw);
  const { yMin, yMax, contactSamples } = v, contactMs = (contactSamples / eng.fs2) * 1000;
  eng.destroy(); // (its memory in the WebAssembly)
  motion.set({ frames, eta: Float64Array.from(eta), dt: stride / fs(), model, P: { ...P() }, title: `${noteName(key)} · ${vel.toFixed(2)} m/s` });
  pickupView.set({ flux: wasm.flux, wid: data.pickup.wid, yoff: data.pickup.yoff, yMin, yMax, wave: Float32Array.from(L.subarray(0, nw)) });
  $('#pickup-read').textContent = `swing ${(yMin * 1000).toFixed(2)}…+${(yMax * 1000).toFixed(2)} mm across a ${(data.pickup.wid * 1000).toFixed(2)} mm bump · contact ${contactMs.toFixed(2)} ms`;
}

function showInfo(model) {
  const i = model.info;
  $('#info-title').textContent = `${i.name} · ${i.f0.toFixed(2)} Hz`;
  $('#info-sub').textContent = `${P().tineDiameter.toFixed(2)} mm tine`;
  $('#focus-name').textContent = i.name;
  const rows = [
    ['Tine length', `${(i.L * 1000).toFixed(1)} mm (solved to tune)`],
    ['Tine + spring', `${(i.mt * 1000).toFixed(2)} g, spring ${(i.ms * 1000).toFixed(2)} g at ${(i.s * 1000).toFixed(1)} mm`],
    ['Bell partial', i.tineRatios.length > 1 ? `${i.tineRatios[1].toFixed(2)} × f₁ (bare cantilever: 6.27)` : 'above the audio band'],
    ['Strike', `${(i.xh * 1000).toFixed(1)} mm from the clamp (${((100 * i.xh) / i.L).toFixed(0)} % of length)`],
    ['Tone bar', `${(i.Mb * 1000).toFixed(1)} g, tuned ${P().barTune > 0 ? '+' : ''}${P().barTune.toFixed(0)} ¢`],
    ['Pickup', `gap ${(i.gap * 1000).toFixed(2)} mm, bump width ${(i.wid * 1000).toFixed(2)} mm, voiced ${P().offset.toFixed(2)} w`],
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

$('#replay').addEventListener('click', (e) => { motion.replay(); unfocus(e.currentTarget); });
$('#speed').addEventListener('change', (e) => { motion.speed = +e.target.value; motion.replay(); unfocus(e.target); });

setFocus(60, P().velocity);
precompute();
