// cavity-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './cavity-instrument.js';
import { wasmModel, BAND_NAMES } from './cavity-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum });
let focus = 60, struck = -1e9, modes = [];
let cells = null, levels = null; // the engine's latest field in each cell and modes' levels, for the focus key

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { if (key !== focus) { cells = levels = null; } focus = key; struck = performance.now(); update(); },
  onParam: () => update(),
  onMessage: (m) => {
    if (m.key !== focus) return;
    if (m.type === 'cells') cells = m;
    else if (m.type === 'modes') levels = m;
  },
});

const T60 = (sigma) => Math.log(1000) / sigma;
const fmtT = (t) => (t < 1 ? `${(t * 1000).toFixed(0)} ms` : `${t.toFixed(t < 10 ? 2 : 1)} s`);

function update() {
  const P = shell.P;
  modes = model.modes(focus, P);
  const fpi = modes[P.cells - 1]?.f ?? 261.6;
  const big = Math.max(...modes.map((m) => Math.hypot(...m.kick)));
  spectrum.set(fpi, modes.filter((m) => Math.hypot(...m.kick) > 0.02 * big).map((m) => ({
    f: m.f, alpha: 0.2 + 0.7 * Math.sqrt(Math.hypot(...m.kick) / big), color: m.band ? css('--accent-2') : undefined })));
  $('#focus-name').textContent = noteName(focus);
  $('#focus-name2').textContent = noteName(focus);
  const rows = modes.map((m) => ({ ...m, k: Math.hypot(...m.kick) })).filter((m) => m.k > 0.01 * big).sort((a, b) => b.k - a.k).slice(0, 14);
  const ph = (m) => `${Math.round((m.phase / Math.PI) * (m.band ? P.cells + 1 : P.cells))}π/${m.band ? P.cells + 1 : P.cells}`;
  $('#modetab').innerHTML = '<tr><th>mode</th><th>phase / cell</th><th>f (Hz)</th><th>f / f<sub>π</sub></th><th>Q<sub>L</sub></th><th>T60</th><th>rung</th></tr>'
    + rows.map((m) => `<tr><td>${BAND_NAMES[m.band]}</td><td>${ph(m)}</td><td>${m.f.toFixed(1)}</td><td>${(m.f / fpi).toFixed(4)}</td>`
      + `<td>${((Math.PI * m.f) / m.sigma / model.QSCALE).toExponential(1)}</td><td>${fmtT(T60(m.sigma))}</td><td>${(20 * Math.log10(m.k / big)).toFixed(1)} dB</td></tr>`).join('');
}

// The cells, in section along the beam: each cell's accelerating field (its arrow and glow, in
// slow motion: the field turns once a second instead of f times), the bunch crossing, a quench.
animate(() => {
  const { ctx, w, h } = fit($('#cells'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, N = Math.round(P.cells), cy = h / 2;
  const pipe = Math.max(10, w * 0.05), L = w - 2 * pipe - 12, d = L / N, x0 = 6 + pipe;
  const Re = Math.min(h / 2 - 8, d * 1.05), Ri = Re * 0.39; // TESLA's equator and iris radii, 103.3 and 35 mm
  const t = performance.now() / 1000, rot = 2 * Math.PI * 0.6 * t;
  const det = cells?.detune ?? 0, squeeze = 1 + Math.max(-0.12, det / 400); // the walls pulled in, exaggerated
  const E = Array.from({ length: N }, (_, n) => (cells && cells.re.length === N ? { re: cells.re[n], im: cells.im[n] } : { re: 0, im: 0 }));
  const top = Math.max(0.05, ...E.map((e) => Math.hypot(e.re, e.im)));
  const quenched = !!cells?.quenched;
  // the field's glow in each cell
  for (let n = 0; n < N; n++) {
    const e = E[n], v = (e.re * Math.cos(rot) - e.im * Math.sin(rot)) / top;
    ctx.globalAlpha = Math.min(0.85, Math.abs(v) * 0.7);
    ctx.fillStyle = v > 0 ? css('--accent') : css('--accent-2');
    ctx.beginPath();
    ctx.ellipse(x0 + (n + 0.5) * d, cy, d / 2, Re * squeeze * 0.92, 0, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // the niobium: the cells' outline, with beam pipes at both ends
  const r = (z) => { const u = ((z - x0) / d) % 1; return Ri + (Re * squeeze - Ri) * Math.sin(Math.PI * u) ** 1.2; };
  ctx.strokeStyle = quenched ? '#ff5a3c' : css('--text');
  ctx.lineWidth = quenched ? 3 : 2;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(6, cy + s * Ri);
    ctx.lineTo(x0, cy + s * Ri);
    for (let i = 0; i <= 8 * N * 6; i++) { const z = x0 + (L * i) / (8 * N * 6); ctx.lineTo(z, cy + s * r(Math.min(z, x0 + L - 1e-6))); }
    ctx.lineTo(w - 6, cy + s * Ri);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  // the accelerating field on the axis, as arrows along the beam
  ctx.strokeStyle = css('--text');
  for (let n = 0; n < N; n++) {
    const e = E[n], v = (e.re * Math.cos(rot) - e.im * Math.sin(rot)) / top, xc = x0 + (n + 0.5) * d, len = 0.42 * d * v;
    if (Math.abs(len) < 1.5) continue;
    ctx.beginPath(); ctx.moveTo(xc - len, cy); ctx.lineTo(xc + len, cy);
    ctx.lineTo(xc + len - Math.sign(len) * 5, cy - 4); ctx.moveTo(xc + len, cy); ctx.lineTo(xc + len - Math.sign(len) * 5, cy + 4);
    ctx.stroke();
  }
  // the bunch: it crosses in a few tenths of a second, in slow motion
  const age = (performance.now() - struck) / 1000;
  if (age < 0.7) {
    ctx.fillStyle = css('--accent');
    const xb = 6 + (w - 12) * (age / 0.7), yb = cy - P.offset * Ri;
    ctx.beginPath(); ctx.ellipse(xb, yb, Math.max(3, P.bunch * d * 2), 4, 0, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
  ctx.fillText(quenched ? 'quenched: the niobium is normal-conducting' : `peak field ${(cells?.peak ?? 0).toFixed(2)} × a bunch's · detuned ${det.toFixed(1)} ¢`, 8, 14);
}, $('#cells'));

// The passband: frequency against the phase advance per cell, ω = ω_c/√(1 + k cos φ), with the
// modes the cavity has (dot size: how loud each rings now) and the beam's line, where the bunch
// keeps step with a mode (θ = ωd/v = φ).
animate(() => {
  const { ctx, w, h } = fit($('#passband'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, N = Math.round(P.cells), k = P.coupling;
  const padL = 34, padR = 64, padT = 16, padB = 22, W = w - padL - padR, H = h - padT - padB;
  const lo = Math.sqrt((1 - k) / (1 + k)), y0 = lo - 0.15 * (1 - lo), y1 = 1 + 0.12 * (1 - lo);
  const X = (phi) => padL + (W * phi) / Math.PI, Y = (r) => padT + H * (1 - (r - y0) / (y1 - y0));
  ctx.strokeStyle = css('--grid');
  ctx.strokeRect(padL, padT, W, H);
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 100; i++) { const phi = (Math.PI * i) / 100, r = Math.sqrt((1 - k) / (1 + k * Math.cos(phi))); if (i) ctx.lineTo(X(phi), Y(r)); else ctx.moveTo(X(phi), Y(r)); }
  ctx.stroke(); ctx.lineWidth = 1;
  // the beam: θ = π (f/f_π)(β_g/β), folded into 0..π
  ctx.strokeStyle = css('--accent-2'); ctx.setLineDash([4, 4]); ctx.beginPath();
  let started = false;
  for (let i = 0; i <= 60; i++) {
    const r = y0 + ((y1 - y0) * i) / 60, th = Math.PI * r * (P.betag / P.beta), f = Math.abs((((th + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
    if (started) ctx.lineTo(X(f), Y(r)); else { ctx.moveTo(X(f), Y(r)); started = true; }
  }
  ctx.stroke(); ctx.setLineDash([]);
  const amps = levels && levels.modes.length === N ? levels.modes : null, top = amps ? Math.max(1e-3, ...amps) : 1;
  for (let m = 1; m <= N; m++) {
    const phi = (Math.PI * m) / N, r = Math.sqrt((1 - k) / (1 + k * Math.cos(phi)));
    const a = amps ? amps[m - 1] / top : 0, rad = 3 + 9 * Math.sqrt(Math.max(0, a));
    ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, Math.sqrt(a) * 2);
    ctx.beginPath(); ctx.arc(X(phi), Y(r), rad, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // the higher passbands' levels, against the accelerating mode's
  const bands = levels?.bands ?? [];
  const pi = amps ? amps[N - 1] : 1, bw = (padR - 16) / 6;
  for (let b = 1; b < 7; b++) {
    const v = bands[b] ? Math.max(0, 1 + Math.log10(bands[b] / Math.max(pi, 1e-6)) / 3) : 0, x = w - padR + 10 + (b - 1) * bw;
    ctx.fillStyle = css('--accent-2'); ctx.globalAlpha = 0.8;
    ctx.fillRect(x, padT + H * (1 - Math.min(1, v)), bw - 2, H * Math.min(1, v));
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('f / f_π', 2, padT + 8);
  ctx.fillText('0', padL - 3, h - 6); ctx.fillText('π', padL + W - 4, h - 6);
  ctx.fillText('phase advance per cell', padL + W / 2 - 50, h - 6);
  ctx.fillText('HOMs', w - padR + 14, h - 6);
}, $('#passband'));

update();
