// hydrogen-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './hydrogen-instrument.js';
import { wasmModel } from './hydrogen-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 57;

// What the engine reports: the lines heard now, and the levels' populations.
let heard = new Map(); // line index → power
let levels = null;
const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; update(); },
  onParam: () => update(),
  onMessage: (m) => {
    if (m.type === 'lines') heard = new Map(m.lines.map((l) => [l.line, l.power]));
    else if (m.type === 'levels') levels = m.lit || m.pops.some((p) => p > 0) ? m.pops : null;
  },
  onPanic: () => { heard = new Map(); levels = null; },
});

// Names: Lyman, Balmer (Hα …), Paschen, Brackett, Pfund, Humphreys; α … ε for n − m = 1 … 5.
const SERIES = ['Ly', 'H', 'Pa', 'Br', 'Pf', 'Hu'];
const GREEK = ['α', 'β', 'γ', 'δ', 'ε'];
function lineName(n, m) {
  const s = SERIES[m - 1] ?? `n=${m}`;
  return n - m <= 5 ? `${s}${GREEK[n - m - 1]}` : `${s}${n}`;
}

// The window, by wavelength (nm), as the engine's (hydrogen-engine.cpp windowGain), for the views.
const BANDS = { visible: [375, 760, false], ultraviolet: [88, 400, true], infrared: [700, 8000, true], all: [88, 8000, true] };
function inWindow(nm, w) {
  if (w === 'visible') return nm >= 380 && nm <= 750;
  if (w === 'ultraviolet') return nm < 380;
  if (w === 'infrared') return nm > 750;
  return true;
}

// The colour of light of wavelength nm, as the eye sees it (outside the visible: a dim violet or red).
function colour(nm) {
  let r = 0, g = 0, b = 0;
  if (nm < 380) return [150, 120, 255];
  if (nm > 750) return [170, 40, 40];
  if (nm < 440) { r = (440 - nm) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
  else r = 1;
  const f = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (750 - nm)) / 50 : 1;
  return [r, g, b].map((c) => Math.round(255 * Math.pow(c * f, 0.8)));
}

let steady = null; // the focus key's lines through the window, steady: [{ n, m, nm, f, p }]

function update() {
  const P = shell.P, all = model.steadyLines(P);
  const fKey = 440 * 2 ** ((focus - 69) / 12);
  const lines = [];
  for (let n = 2; n <= model.NMAX; n++) {
    for (let m = 1; m < n; m++) {
      const p = all[model.lineOf(n, m)];
      if (!(p > 0)) continue;
      const nm = model.wavelength(n, m);
      if (!inWindow(nm, P.window)) continue;
      lines.push({ n, m, nm, f: fKey * model.ratio(n, m), p });
    }
  }
  const top = Math.max(1e-300, ...lines.map((l) => l.p));
  lines.forEach((l) => { l.rel = l.p / top; });
  steady = lines.filter((l) => l.rel > 1e-4);
  spectrum.set(fKey, steady.filter((l) => l.f >= 16 && l.f <= 20000).map((l) => ({ f: l.f, alpha: 0.2 + 0.7 * Math.sqrt(l.rel) })));
  $('#focus-name').textContent = noteName(focus);
  const scale = model.lineHz(3, 2) / fKey;
  const tau2p = 1 / model.gamma(2, 1);
  $('#scope-read').textContent = `Hα (656.5 nm, ${(model.lineHz(3, 2) / 1e12).toFixed(1)} THz) on ${noteName(focus)} = ${fKey.toFixed(1)} Hz: frequencies ÷ ${scale.toExponential(2)}, time × ${P.slowmo.toExponential(1)} (2p lives ${(tau2p * P.slowmo * 1e3).toPrecision(2)} ms)`;
}

// The spectroscope: the window's band, every line at its real wavelength in its colour, as bright
// as it is heard now (and the steady lines of the last key, faintly, behind).
animate(() => {
  const { ctx, w, h } = fit($('#scope'));
  ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, w, h);
  if (!steady) return;
  const [lo, hi, log] = BANDS[shell.P.window] ?? BANDS.all;
  const X = (nm) => (log ? Math.log(nm / lo) / Math.log(hi / lo) : (nm - lo) / (hi - lo)) * (w - 20) + 10;
  const top = 18, bottom = h - 22;
  // the faint steady spectrum
  for (const l of steady) {
    const x = X(l.nm);
    if (x < 0 || x > w) continue;
    const [r, g, b] = colour(l.nm);
    ctx.fillStyle = `rgba(${r},${g},${b},${0.12 + 0.25 * Math.sqrt(l.rel)})`;
    ctx.fillRect(x - 0.5, top, 1, bottom - top);
  }
  // what is heard now
  let max = 0;
  for (const p of heard.values()) max = Math.max(max, p);
  if (max > 0) {
    for (const [line, p] of heard) {
      const { n, m } = model.levels(line), nm = model.wavelength(n, m), x = X(nm);
      if (x < 0 || x > w) continue;
      const a = Math.sqrt(p / max), [r, g, b] = colour(nm);
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, 0.15 + a)})`;
      const width = 1.5 + 4 * a;
      ctx.fillRect(x - width / 2, top, width, bottom - top);
      ctx.shadowColor = `rgb(${r},${g},${b})`; ctx.shadowBlur = 14 * a;
      ctx.fillRect(x - 0.5, top, 1, bottom - top);
      ctx.shadowBlur = 0;
    }
  }
  // the axis and the brightest lines' names
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
  const ticks = log ? [100, 121.6, 200, 300, 400, 500, 656, 1000, 2000, 4000, 7000] : [400, 450, 500, 550, 600, 650, 700, 750];
  for (const t of ticks) { const x = X(t); if (x > 8 && x < w - 38) ctx.fillText(`${t >= 1000 ? `${t / 1000} µm` : `${Math.round(t)}`}`, x - 8, h - 6); }
  ctx.fillText('nm', w - 18, h - 6);
  const named = [...steady].sort((a, b) => b.rel - a.rel).slice(0, 10);
  let lastX = -1e9;
  for (const l of named.sort((a, b) => a.nm - b.nm)) {
    const x = X(l.nm);
    if (x < 0 || x > w || x - lastX < 26) continue;
    ctx.fillText(lineName(l.n, l.m), x - 8, 12);
    lastX = x;
  }
}, $('#scope'));

// The energy levels (a Grotrian diagram): each nl up to n = 7, higher for more energy, lit by its
// population, and the lines heard drawn between the levels they join.
animate(() => {
  const { ctx, w, h } = fit($('#levels'));
  ctx.clearRect(0, 0, w, h);
  const NL = 6, N = 7, x0 = 34, colW = (w - x0 - 10) / NL, y0 = h - 16, y1 = 18;
  const Y = (n) => y0 - ((1 - 1 / n) / (1 - 1 / 8)) * (y0 - y1); // by 1 − 1/n: the upper levels crowd less than in energy
  const X = (l) => x0 + (l + 0.5) * colW;
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = css('--muted');
  ['s', 'p', 'd', 'f', 'g', 'h'].forEach((s, l) => ctx.fillText(s, X(l) - 3, 11));
  ctx.strokeStyle = css('--grid'); ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(x0, y1 - 2); ctx.lineTo(w - 8, y1 - 2); ctx.stroke(); ctx.setLineDash([]);
  let pmax = 0;
  if (levels) for (let s = 1; s < levels.length; s++) pmax = Math.max(pmax, levels[s]);
  // the lines heard, between their levels (each l → l ± 1, lit as the upper level is)
  let hmax = 0;
  for (const p of heard.values()) hmax = Math.max(hmax, p);
  if (hmax > 0 && levels) {
    for (const [line, p] of heard) {
      const { n, m } = model.levels(line);
      if (n > N) continue;
      const nm = model.wavelength(n, m), [r, g, b] = colour(nm), a = Math.sqrt(p / hmax);
      let shell = 0;
      for (let l = 0; l < n; l++) shell += levels[model.stateOf(n, l)] ?? 0;
      for (let l = 0; l < Math.min(n, NL); l++) {
        const share = shell > 0 ? (levels[model.stateOf(n, l)] ?? 0) / shell : 0;
        for (const k of [l - 1, l + 1]) {
          if (k < 0 || k >= m || k >= NL || share <= 0) continue;
          ctx.strokeStyle = `rgba(${r},${g},${b},${Math.min(1, 0.9 * a * Math.sqrt(share))})`;
          ctx.lineWidth = 1 + 2 * a * share;
          ctx.beginPath(); ctx.moveTo(X(l), Y(n)); ctx.lineTo(X(k), Y(m)); ctx.stroke();
        }
      }
    }
    ctx.lineWidth = 1;
  }
  let label = Infinity; // the last label's y: the crowded upper levels are named only where there is room
  for (let n = 1; n <= N; n++) {
    for (let l = 0; l < Math.min(n, NL); l++) {
      const pop = levels && pmax > 0 && n > 1 ? Math.sqrt((levels[model.stateOf(n, l)] ?? 0) / pmax) : 0;
      ctx.strokeStyle = pop > 0.01 ? `rgba(255, 236, 170, ${0.35 + 0.65 * pop})` : css('--grid');
      ctx.lineWidth = 2 + 3 * pop;
      ctx.beginPath(); ctx.moveTo(X(l) - colW * 0.32, Y(n)); ctx.lineTo(X(l) + colW * 0.32, Y(n)); ctx.stroke();
    }
    ctx.lineWidth = 1;
    if ((n <= 5 || n === N) && label - Y(n) >= 11) { ctx.fillStyle = css('--muted'); ctx.fillText(`n=${n}`, 2, Y(n) + 3); label = Y(n); }
  }
}, $('#levels'));

update();
