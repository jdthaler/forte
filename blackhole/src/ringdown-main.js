// ringdown-main.js — the page: wires the shell (shared/shell.js) to the engine and draws the
// views. The instrument itself (parameters, engine, chain) is blackhole-instrument.js. The
// worklet runs the WebAssembly build (blackhole-wasm.js), and the views call its model.

import { createShell, noteName } from '../../shared/shell.js';
import { INSTRUMENT } from './blackhole-instrument.js';
import { fmtSpin, spinFromU } from './ringdown-params.js';
import { wasmModel } from './blackhole-wasm.js';
import { SpectrogramView, animate } from '../../shared/views.js';
import { drawPlane, drawKerr, WaveView, Lazy } from './ringdown-viz.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { unfocus } from '../../shared/focus.js';
import { paramsStore } from '../../shared/layer.js';

const $ = (s) => document.querySelector(s);

// The WebAssembly model (blackhole-wasm.js): the QNM bank, each key's voice and its strain, the
// same C++ the engine plays.
const model = await wasmModel();
const fs = () => shell?.audio?.ctx.sampleRate || 48000; // voices are cached per sample rate (voiceFor)
const voiceOf = (key) => model.voiceFor(key, shell.P, fs());
// a short window: a ringdown is over in a few dozen cycles
const spectro = new SpectrogramView($('#spectrogram'), { fLo: 40, fHi: 12000, secs: 4 });

let focusKey = 60, focusTimer = 0;
const shell = createShell({
  ...INSTRUMENT,
  store: paramsStore('blackhole'), // the page's own name for its settings, from before the shell
  arrows: { param: 'spinU', step: 0.25 },
  onAudio: (a) => {
    const an = a.ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
    a.chain.tap.connect(an); spectro.setAnalyser(an);
  },
  onMessage: (m) => { if (m.type === 'voices') $('#voices').textContent = `${m.voices} ringing`; }, // the engine's, every 48 blocks
  onNoteOn: (key) => setFocus(key),
  // the model's parameters (and the tuning) change every key's voice: voiceFor recomputes
  onParam: (id, v, P, p) => {
    if (id === '*') setFocus(focusKey);
    else if (p.kind === 'model' || TUNING_KEEP.includes(id)) { clearTimeout(focusTimer); focusTimer = setTimeout(() => setFocus(focusKey), 60); }
  },
});
const P = () => shell.P;

// ---------------------------------------------------------------------------
// focus key: views

const wave = new WaveView($('#wave'));
const plane = new Lazy($('#plane')), kerr = new Lazy($('#kerr'));
let focusVoice = null, focusDue = false;
// Views follow the last key played. A chord's keys arrive together, so the
// work is done once, on the next animation frame.
function setFocus(key) {
  focusKey = key; focusDue = true;
}
function renderFocus() {
  focusDue = false;
  const v = voiceOf(focusKey);
  focusVoice = v;
  // the strain in closed form, at about two points per pixel
  const n = Math.max(400, Math.min(4000, 2 * Math.round(wave.cv.clientWidth || 600)));
  wave.set({ ...model.strainCurve(v, n), fs: fs(), modes: v.modes });
  showInfo(v);
  plane.touch(); kerr.touch();
}

function showInfo(v) {
  const i = v.info, m220 = v.modes.find((m) => m.l === 2 && m.m === 2 && m.n === 0);
  $('#bh-title').textContent = `The black hole under ${noteName(v.key)}`;
  $('#plane-read').textContent = `${fmtSpin(P().spinU)} · q = ${P().massRatio.toFixed(2)} · ι = ${P().inclination.toFixed(0)}°`;
  const rows = [
    ['Mass', `${i.Msun.toFixed(1)} M☉`],
    ['Spin', fmtSpin(P().spinU)],
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
  spectro.set(f0, v.modes.map((m) => ({ f: m.f, alpha: 0.2 + 0.7 * Math.sqrt(lvl(m) / mx) })));
  $('#modes').innerHTML = '<tr><th>mode (l,m,n)</th><th>Hz</th><th>× f₂₂₀</th><th>τ (ms)</th><th>Q</th><th>level</th></tr>'
    + v.modes.slice().sort((a, b) => lvl(b) - lvl(a)).map((m) => `<tr><td>(${m.l}, ${m.m}, ${m.n})${m.m < 0 ? ' <span class="muted">counter-rot.</span>' : ''}</td><td>${m.f.toFixed(1)}</td><td>${(m.f / f0).toFixed(3)}</td><td>${(m.tau * 1000).toFixed(2)}</td><td>${m.Q.toFixed(1)}</td><td>${(20 * Math.log10(lvl(m) / mx)).toFixed(1)} dB</td></tr>`).join('');
}

// Views redraw only when something changed, and only while visible.
const lvl = (m) => Math.hypot(m.cpr, m.cpi) + Math.hypot(m.cxr, m.cxi);
plane.draw = () => drawPlane(plane.cv, model.bank, spinFromU(P().spinU), focusVoice.modes.map((m) => ({ l: m.l, m: m.m, n: m.n, level: lvl(m) })));
kerr.draw = () => drawKerr(kerr.cv, spinFromU(P().spinU), P().inclination);
function frame() {
  if (focusDue) renderFocus();
  if (focusVoice) { plane.frame(); kerr.frame(); }
  wave.frame();
}

for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
  wave.mode = b.dataset.mode; wave.touch(); unfocus(b);
});

setFocus(60);
animate(frame);
