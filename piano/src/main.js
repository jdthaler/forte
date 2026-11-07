// main.js — the page: wires the shell (shared/shell.js) to the engine and draws the views. The
// instrument itself (parameters, engine, output chain) is in piano-instrument.js. The worklet
// runs the engine, built as WebAssembly from the C++ (piano-wasm.js); the views, and the voice
// data each note offers the engine, come from its model, built the same way, on this thread.

import { createShell } from '../../shared/shell.js';
import { INSTRUMENT } from './piano-instrument.js';
import { noteName, MATERIALS, NMAX_MODES } from './materials.js';
import { PianoWasmEngine, wasmModel } from './piano-wasm.js'; // (the slow-motion view runs its own engine)
import { MotionView, SpectrumView, drawSection, FAMILY } from './viz.js';
import { SpectrogramView } from '../../shared/views.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { unfocus } from '../../shared/focus.js';

const $ = (s) => document.querySelector(s);
const [KEY_LO, KEY_HI] = INSTRUMENT.range;

// The model (piano-wasm.js): { model, data, packed } per key, the latest version of each cached.
const wasm = await wasmModel();
const fs = () => shell?.audio?.ctx.sampleRate || 48000; // the voice data's version includes it: keys are rebuilt if it is not 48 kHz
const keyData = (key) => wasm.keyModel(key, shell.P, fs());
const sent = new Map(); // MIDI key → the voice data the engine holds for it (it keeps the last one)

let focusKey = 60, mcTimer = 0;
const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity' }, // a log parameter: ↑/↓ step by 1/24 of its range, about ×1.14
  // What a note offers the engine: its key's voice data, packed by the model here, so that the
  // audio thread need not build it (unless it already holds it)
  noteData: (key) => {
    const data = keyData(key).packed;
    if (!data || sent.get(key) === data) return undefined;
    sent.set(key, data);
    return data;
  },
  onAudio: (a) => {
    spectrum.setAnalyser(a.analyser); spectro.setAnalyser(a.analyser);
    shell.post({ type: 'offering' }); // every key's data follows (precompute)
    precompute();
  },
  onNoteOn: (key, vel) => setFocus(key, vel),
  onParam: (id, v, P, p) => {
    if (id === '*') { modelChanged(); return; }
    // the tuning's parameters (shared/tuning.js, no kind) move every key's pitch: model parameters
    const kind = p.kind ?? (TUNING_KEEP.includes(id) ? 'model' : undefined);
    if (kind === 'engine' || kind === 'model') { clearTimeout(mcTimer); mcTimer = setTimeout(modelChanged, 140); }
  },
});
const P = () => shell.P;

function modelChanged() {
  setFocus(focusKey, lastVelocity);
  precompute();
}

// Compute nearby keys in the background so playing stays snappy (tapered
// members need a Rayleigh–Ritz eigen-solve per key), and offer each to the
// engine: its sympathetic string rings along when its damper is up.
let pq = [], pqTimer = 0;
function precompute() {
  const center = shell.base + 15;
  pq = [];
  for (let m = KEY_LO; m <= KEY_HI; m++) pq.push(m);
  pq.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
  clearTimeout(pqTimer);
  pqTimer = setTimeout(pqTick, 60);
}
function offerKey(key) {
  const data = keyData(key).packed;
  if (!shell.audio || !data || sent.get(key) === data) return;
  sent.set(key, data); // the engine keeps the last one
  shell.post({ type: 'offer', data });
}
function pqTick() {
  const t0 = performance.now();
  while (pq.length && performance.now() - t0 < 10) offerKey(pq.shift());
  if (pq.length) pqTimer = setTimeout(pqTick, 4);
}

// ---------------------------------------------------------------------------
// focus key: info panel, cross-section, slow motion, partials

const motion = new MotionView($('#motion'));
const spectrum = new SpectrumView($('#spectrum'));
const spectro = new SpectrogramView($('#spectrogram'), { fLo: 25, fHi: 16000 });
let lastVelocity = 2.5;
let simTimer = 0;

function setFocus(key, velocity) {
  focusKey = key;
  lastVelocity = velocity;
  shell.keys.focus(key);
  const c = keyData(key);
  showInfo(c.model);
  drawSection($('#section'), c.model, P());
  clearTimeout(simTimer);
  simTimer = setTimeout(() => runSim(key, velocity), 30);
}

// The first moments after the strike, on this thread: the engine, on the model's data.
function runSim(key, velocity) {
  const { model, data, packed } = keyData(key);
  const eng = new PianoWasmEngine(fs());
  eng.setParams({ ...P() });
  const v = eng.noteOn(key, velocity, packed);
  const period = 1 / model.info.f0;
  const total = Math.round(Math.min(0.05, Math.max(0.008, 4 * period)) * fs());
  const stride = Math.max(1, Math.ceil(total / 700));
  const frames = [], eta = [];
  const L = new Float32Array(stride), R = new Float32Array(stride);
  let amps = null, hEta = 0, hVel = 0;
  for (let s = 0; s < total; s += stride) {
    frames.push(v.snapshot(new Float64Array(data.n)));
    if (v.hammerOn) { hEta = v.eta; hVel = (v.eta - v.etaPrev) * fs(); } else hEta += hVel * (stride / fs());
    eta.push(hEta);
    eng.process(L, R, stride);
    if (!amps && !v.hammerOn) amps = v.modeAmplitudes(eng);
  }
  for (let guard = 0; !amps && guard < 10000; guard++) {
    eng.process(L, R, stride);
    if (!v.hammerOn) amps = v.modeAmplitudes(eng);
  }
  const contactMs = (v.contactSamples / fs()) * 1000, Fmax = v.Fmax;
  eng.destroy(); // (the engine's WebAssembly memory)
  motion.set({
    frames, eta: Float64Array.from(eta), dt: stride / fs(), model, data, P: { ...P() },
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
  spectro.set(model.info.f0, list.filter((p) => p.db > -50).map((p) => ({ f: p.f, color: FAMILY[p.fam].color, alpha: 0.25 + 0.6 * (1 + p.db / 50) })));
  $('#legend').innerHTML = present.map((f) => `<span><i style="background:${FAMILY[f].color}"></i>${legendName(f)}</span>`).join('')
    + `<span>hammer contact ${contactMs.toFixed(2)} ms · peak force ${Fmax.toFixed(1)} N</span>`;
}

function legendName(f) {
  if (P().shape === 'ribbon') return ['bending, easy axis', 'bending, hard axis', 'torsion'][f];
  return ['bending (hammer plane)', 'bending (perpendicular)', 'torsion'][f];
}

function showInfo(model) {
  const i = model.info, s = model.sec;
  $('#info-title').textContent = `${i.name} · ${i.f0.toFixed(2)} Hz`;
  $('#info-sub').textContent = `${MATERIALS[P().material].name}, ${P().shape}`;
  const cents = (a, b) => 1200 * Math.log2(a / b);
  const dims = P().shape === 'round' ? `Ø ${(s.w * 1000).toFixed(3)} mm`
    : P().shape === 'square' ? `${(s.w * 1000).toFixed(3)} mm square`
      : P().shape === 'triangle' ? `side ${(s.w * 1000).toFixed(3)} mm`
        : `${(s.w * 1000).toFixed(2)} × ${(s.t * 1000).toFixed(3)} mm`;
  const rows = [
    ['Speaking length', `${(i.L * 100).toFixed(1)} cm`],
    ['Core section', dims + (i.uniform ? '' : ' (mean)')],
    ['Mass / length', `${(i.mu * 1000).toFixed(2)} g/m${i.dMu ? ` (incl. ${(i.dMu * 1000).toFixed(1)} winding)` : ''}`],
    ['Tension', `${i.T.toFixed(0)} N`],
    ['Stress / breaking', `${(i.strengthRatio * 100).toFixed(0)} %${i.strengthRatio > 1 ? ' — would snap!' : ''}`, i.strengthRatio > 1],
    ['Inharmonicity B', P().shape === 'ribbon' ? `${i.B1.toExponential(2)} easy · ${i.B2.toExponential(2)} hard` : i.B1.toExponential(2)],
  ];
  if (P().shape === 'ribbon') {
    const other = i.tuneAxis === 'I1' ? i.f1hard : i.f1;
    rows.push([i.tuneAxis === 'I1' ? 'Hard-axis f₁' : 'Easy-axis f₁', `${cents(other, i.f0) >= 0 ? '+' : ''}${cents(other, i.f0).toFixed(1)} ¢`]);
  }
  rows.push(['Torsion f₁', `${i.f1torsion.toFixed(0)} Hz = ${i.torsionRatio.toFixed(3)} × f₁${model.sec.lever && P().offset ? '' : ' (not excited)'}`]);
  rows.push(['Wave speeds', `transverse ${i.cT.toFixed(0)} m/s · torsional ${i.cTheta.toFixed(0)} m/s`]);
  const fam = model.families[0], fTop = fam.omega[fam.n - 1] / (2 * Math.PI);
  rows.push(['Partials', `${fam.n}, up to ${(fTop / 1000).toFixed(2)} kHz${fam.n >= NMAX_MODES ? ` (capped at ${NMAX_MODES})` : ''}`]);
  if (!i.tuned) rows.push(['Tuning', 'too stiff to reach pitch — plays sharp', true]);
  $('#info').innerHTML = rows.map(([k, v, warn]) => `<dt>${k}</dt><dd${warn ? ' class="warn"' : ''}>${v}</dd>`).join('');
}

$('#replay').addEventListener('click', (e) => { motion.replay(); unfocus(e.currentTarget); });
$('#speed').addEventListener('change', (e) => { motion.speed = +e.target.value; motion.replay(); unfocus(e.target); });
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
  b.addEventListener('click', () => { setSpecMode(b.dataset.mode); unfocus(b); });
}
setSpecMode('spectrum');
window.addEventListener('resize', () => drawSection($('#section'), keyData(focusKey).model, P()));

setFocus(60, P().velocity);
precompute();
