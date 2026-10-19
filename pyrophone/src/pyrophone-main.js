// pyrophone-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { tunedFreq } from '../../shared/tuning.js';
import { SpectrumView, SpectrogramView, animate } from '../../shared/views.js';
import { INSTRUMENT } from './pyrophone-instrument.js';
import { betaOn, N_MODES, C_HOT } from './pyrophone-model.js';
import { drawBif, drawTube, drawPhase } from './pyrophone-views.js';
import { wasmModel } from './pyrophone-wasm.js';

// The views and the tuning table draw on what the engine plays: its model, the same C++, built as
// WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'), { fLo: 50 });
new SpectrogramView($('#spectrogram'), { spectrum });
let shell = null;
let focus = 60, bif = null, tune = null, modelKey = '', lastCalc = 0, timer = 0, sentTune = null;
let live = { pts: [] }, foc = null, focAt = 0, trail = [], theta = 0, scale = null, pred = null, rootCache = [NaN, null];
const eta = new Float64Array(N_MODES), vel = new Float64Array(N_MODES);

// The bifurcation analysis (harmonic balance, ~15 ms; tubeTuning) runs when a tube parameter
// changes, at most every 200 ms while a slider is dragged; the engine gets the resulting tuning
// table in a message of its own, and plays the last one until it comes.
function recompute(P) {
  ({ bif, tune } = model.tubeTuning(P)); modelKey = model.tubeKey(P); lastCalc = performance.now();
  offerTune(tune); update();
}
function offerTune(t) {
  if (t === sentTune || !shell?.audio) return;
  sentTune = t;
  shell.post({ type: 'tune', tune: { key: t.key, P: t.P, betaH: t.betaH, betaMax: t.betaMax, mode: t.mode, fold: t.fold, b0: t.b0, db: t.db, Ws: t.Ws } });
}
function currentTune(P) {
  if (model.tubeKey(P) !== modelKey) {
    if (performance.now() - lastCalc > 200) recompute(P);
    else if (!timer) timer = setTimeout(() => { timer = 0; recompute(shell.P); }, 200);
  }
}

shell = createShell({
  ...INSTRUMENT,
  base: 48,
  arrows: { param: 'velocity', step: 0.05 },
  holdHint: { ms: 350, text: 'Hold the key: the flame takes a moment to set the tube singing.' },
  onAudio: (a) => { spectrum.setAnalyser(a.analyser); sentTune = null; offerTune(tune); },
  onMessage: (m) => {
    if (m.type !== 'tubes') return;
    live = m;
    if (m.focus && m.focus.key === focus) {
      foc = m.focus; focAt = performance.now();
      trail.push([foc.beta, foc.amp]); if (trail.length > 240) trail.shift();
    }
  },
  onNoteOn: (key) => { if (key !== focus) trail = []; focus = key; shell.keys.focus(key); update(); },
  onParam: () => { currentTune(shell.P); update(); },
  onPanic: () => { live = { pts: [] }; foc = null; trail = []; },
});

const Wof = (b) => tune.Ws[Math.min(tune.Ws.length - 1, Math.max(0, Math.round(b / tune.db)))];

// Text, markers and the predicted cycle: they change with the focused key or the parameters.
function update() {
  if (!bif) return;
  const P = shell.P, f0 = tunedFreq(P, focus), b = betaOn(P, P.velocity, tune.betaH, tune.betaMax), W = Wof(b), f1 = bif.fam[0];
  // the tube that plays this key: acoustic length from the tuning, less the open-end corrections 0.61 a
  const Leff = (C_HOT * W) / (2 * Math.PI * f0), Lg = Leff / (1 + 1.22 * P.bore);
  $('#focus-name').textContent = noteName(focus);
  $('#tube-info').textContent = `${(Lg * 100).toFixed(1)} cm long · ${(2 * P.bore * Lg * 100).toFixed(1)} cm bore`;
  $('#bif-info').innerHTML = tune.mode === 0
    ? 'no mode is driven: Rayleigh\'s criterion fails for all of them'
    : `silence breaks at <b>β = ${tune.betaH.toFixed(3)}</b> (mode ${tune.mode})${tune.fold ? ` · fold <b>${tune.fold.toFixed(3)}</b>` : ''} · key at ${P.velocity.toFixed(2)} → <b>${(b / tune.betaH).toFixed(2)} ×</b>${tune.betaMax / tune.betaH < P.flame * 1.25 ? ` (held below the scream, ${(tune.betaMax / tune.betaH).toFixed(1)} ×)` : ''}`;
  // spectrum markers: the hot tube's modes, and the predicted harmonics of the steady note
  pred = f1 ? model.orbitAt(bif.sys, f1, b) : null;
  const markers = [];
  for (let j = 1; j <= N_MODES; j++) markers.push({ f: (j * Math.PI * f0) / W, color: '#7cb8ff', alpha: 0.45 });
  if (pred) {
    const lv = model.orbitSpectrum(bif.sys, pred, P.listen), top = Math.max(...lv);
    lv.forEach((a, k) => { const db = 20 * Math.log10(a / top + 1e-9); if (db > -60) markers.push({ f: (k + 1) * f0, alpha: 0.2 + 0.7 * (1 + db / 60) }); });
  }
  spectrum.set(f0, markers);
  scale = null;
}

// Amplitude of the unstable (threshold) cycle at gain b, if b is in the bistable band.
function thresholdY(b) {
  const f1 = bif.fam[0];
  if (!f1 || !f1.fold || b < f1.fold.beta || b > f1.hopf.beta) return 0;
  const un = f1.pts.filter((p) => !p.stable);
  for (let i = 1; i < un.length; i++) {
    const p = un[i - 1], q = un[i];
    if ((q.beta - b) * (p.beta - b) <= 0) return p.y + ((b - p.beta) / (q.beta - p.beta || 1)) * (q.y - p.y);
  }
  return 0;
}
// Linear growth rate (1/s) of silence at gain b for the focused key, in the mode that breaks first.
function growth(b) {
  if (!(Math.abs(rootCache[0] - b) <= 1e-4)) rootCache = [b, model.root(bif.sys, Math.max(0, tune.mode - 1), b)];
  return (rootCache[1][0] * 2 * Math.PI * tunedFreq(shell.P, focus)) / Wof(b);
}

// Drawing scale for the tube: the largest steady cycle the keys can reach.
function tubeScale() {
  const f1 = bif.fam[0], pt = f1 && (model.orbitAt(bif.sys, f1, betaOn(shell.P, 1, tune.betaH, tune.betaMax)) || pred);
  const s = { p: 1, u: 1, xi: 0.05, y: 1 };
  if (!pt) return s;
  s.p = s.u = s.xi = 1e-9;
  for (let k = 0; k < 24; k++) {
    model.orbitState(bif.sys, pt, (2 * Math.PI * k) / 24, eta, vel);
    for (let i = 0; i <= 40; i++) {
      const x = i / 40;
      let uu = 0, pp = 0, dd = 0;
      for (let j = 0; j < N_MODES; j++) { const kj = (j + 1) * Math.PI; uu += eta[j] * Math.cos(kj * x); pp -= (vel[j] / kj) * Math.sin(kj * x); dd -= (vel[j] / (kj * kj)) * Math.cos(kj * x); }
      s.p = Math.max(s.p, Math.abs(pp)); s.u = Math.max(s.u, Math.abs(uu)); s.xi = Math.max(s.xi, Math.abs(dd));
    }
  }
  s.y = pt.y / Math.abs(bif.sys.cf[0] || 1);
  return s;
}

// One loop per canvas; each skips its canvas while the card is hidden.
const now = () => {
  const fresh = !!foc && performance.now() - focAt < 250;
  return { P: shell.P, fresh, bNow: fresh ? foc.beta : betaOn(shell.P, shell.P.velocity, tune.betaH, tune.betaMax) };
};
const shown = (cv) => bif && cv.offsetParent !== null;

const cvBif = $('#bif');
animate(() => {
  if (!shown(cvBif)) return;
  const { P, fresh } = now();
  drawBif(cvBif, { bif, tune, P, live: fresh || live.pts.length ? live : { pts: [] }, focus, trail: fresh ? trail : [] });
}, cvBif);

// the tube: the live strobe snapshot while the focused key sounds, else the
// model's predicted cycle for a key at the current velocity, in slow motion
const cvTube = $('#tube');
animate(() => {
  if (!shown(cvTube)) return;
  const { P, fresh, bNow } = now();
  if (!scale) scale = tubeScale();
  let label = '';
  if (fresh && foc.snap) {
    for (let j = 0; j < N_MODES; j++) { eta[j] = foc.snap[j]; vel[j] = foc.snap[N_MODES + j]; }
    label = `${noteName(focus)} · live, strobed · gas ${foc.T.toFixed(0)} K · ${foc.cents >= 0 ? '+' : ''}${foc.cents.toFixed(1)} ¢`;
  } else if (!fresh) {
    theta = (theta + (2 * Math.PI) / 96) % (2 * Math.PI);
    if (pred) model.orbitState(bif.sys, pred, theta, eta, vel); else { eta.fill(0); vel.fill(0); }
    label = pred ? `${noteName(focus)} · predicted steady cycle (play a key)` : `${noteName(focus)} · silent at this power`;
  }
  let uf = 0;
  for (let j = 0; j < N_MODES; j++) uf += bif.sys.cf[j] * eta[j];
  const q = (bNow / betaOn(P, 1, tune.betaH, tune.betaMax)) * (0.4 + model.heat(uf) + 0.58);
  drawTube(cvTube, { eta, vel, xf: P.xf, q, scale, label });
}, cvTube);

// phase portrait with the predicted stable and unstable cycles at this gain
const cvPhase = $('#phase');
animate(() => {
  if (!shown(cvPhase)) return;
  const { fresh, bNow } = now();
  if (!scale) scale = tubeScale();
  const c1 = Math.abs(bif.sys.cf[0]) || 1, rings = [], ys = model.steadyY(bif, bNow), yu = thresholdY(bNow);
  if (ys) rings.push({ r: ys / c1, stable: true });
  if (yu) rings.push({ r: yu / c1, stable: false });
  const rate = growth(bNow), lines = [`${noteName(focus)} · β = ${bNow.toFixed(3)} (${(bNow / tune.betaH).toFixed(2)} × threshold)`];
  lines.push(rate > 0 ? `silence is unstable: grows ×e every ${(1000 / rate).toFixed(0)} ms` : `silence is stable: a small sound dies ×e every ${(-1000 / rate).toFixed(0)} ms`);
  if (yu) lines.push('bistable: needs a kick past the dashed cycle');
  if (fresh) lines.push(`gas ${foc.T.toFixed(0)} K: ${foc.cents >= 0 ? '+' : ''}${foc.cents.toFixed(1)} ¢ from the warm tuning`);
  drawPhase(cvPhase, { trail: fresh ? foc.trail : new Float32Array(2), ti: fresh ? foc.ti : 0, live: fresh, rings, scale: Math.max(scale.y, ys / c1) * 1.15, lines });
}, cvPhase);

recompute(shell.P);
shell.keys.focus(focus);
