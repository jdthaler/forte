// glass-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName, useWasm } from '../../shared/shell.js';
import { SpectrumView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './glass-instrument.js';
import * as jsModel from './glass-model.js';
import { MIC, TRACE } from './glass-engine.js';
import { wasmModel } from './glass-wasm.js';

// The views draw what the engine plays: the WebAssembly model once it has loaded (the same
// physics as the engine, in C++), the JavaScript one until then or if it can't load.
let phys = jsModel;
if (useWasm()) wasmModel().then((m) => { phys = m; update(); }, (err) => console.warn(`glass: the WebAssembly model did not load (${err.message}); the views use the JavaScript one`));

const $ = (s) => document.querySelector(s);
const TAU = 2 * Math.PI;
const spectrum = new SpectrumView($('#spectrum'), { fLo: 80, fHi: 16000 });
let focus = 69, model = null, state = null, zoomA = null, zoomBuf = null;
const famColor = (n) => css(`--n${Math.min(n, 6)}`);

const shell = createShell({
  ...INSTRUMENT,
  base: 60,
  arrows: { param: 'press', step: 0.5 },
  holdHint: { ms: 400, text: 'Hold the key: a glass sings only while the finger stays on its rim, and takes about half a second to speak.' },
  onAudio: (a) => {
    spectrum.setAnalyser(a.analyser);
    // a long FFT of our own for the doublet zoom (1.5 Hz bins at 48 kHz)
    zoomA = a.ctx.createAnalyser(); zoomA.fftSize = 32768; zoomA.smoothingTimeConstant = 0.3;
    a.node.connect(zoomA); zoomBuf = new Float32Array(zoomA.frequencyBinCount);
  },
  onMessage: (m) => { if (m.type === 'state') state = m; },
  onNoteOn: (key) => { focus = key; shell.keys.focus(key); update(); },
  onParam: () => update(),
});

// ---- model-side numbers for the focused bowl ----------------------------------
function update() {
  const P = shell.P;
  model = phys.bowl(focus, P);
  const m2 = model.modes[0];
  spectrum.set(0, model.modes.flatMap((m) => [m.f1, m.f2].map((f) => ({ f, color: famColor(m.n), alpha: 0.35 + 0.6 * Math.min(1, m.rad / m2.rad / 30) }))));
  $('#focus-name').textContent = noteName(focus);
  $('#focus-name-2').textContent = noteName(focus);
  $('#modes').innerHTML = '<tr><th>family</th><th>f (Hz)</th><th>ratio</th><th>ring</th><th>split (Hz)</th><th>Bryan B</th><th>T60 (s)</th><th>radiation</th><th>water</th></tr>'
    + model.modes.map((m) => `<tr><td><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${famColor(m.n)};margin-right:6px"></i>(${m.n},0)</td>`
      + `<td>${m.f.toFixed(1)}</td><td>${(m.f / m2.f).toFixed(3)}</td><td>${phys.ringRatio(m.n).toFixed(3)}</td><td>${(m.f2 - m.f1).toFixed(2)}</td>`
      + `<td>${m.bryan.toFixed(3)}</td><td>${(6.91 / m.sigma).toFixed(1)}</td><td>${(20 * Math.log10(m.rad / m2.rad)).toFixed(0)} dB</td>`
      + `<td>${m.load > 1e-6 ? `${(1200 * Math.log2(m.f / m.fEmpty)).toFixed(0)} ¢` : '–'}</td></tr>`).join('');
  info();
}

function info() {
  const P = shell.P, b = model, m2 = b.modes[0];
  const Nc = phys.speakingThreshold(focus, P, b), V = phys.rimSpeed(focus, P.speed);
  const Nnow = state && state.key === focus && state.touch ? state.N : null;
  const rows = [
    ['bowl', `${(200 * b.a / 2.54).toFixed(2)} in across · wall ${(b.h * 1e3).toFixed(2)} mm · ${(b.mass * 1e3).toFixed(0)} g`],
    ['rim speed', `${(V * 100).toFixed(1)} cm/s at ${P.speed.toFixed(2)} rev/s`],
    ['speaks above', Number.isFinite(Nc) ? `${Nc.toFixed(2)} N of finger force` : 'never (friction does not weaken)'],
    ['finger now', Nnow !== null ? `${Nnow.toFixed(2)} N · ${(Nnow / Nc).toFixed(1)} × threshold` : `${(phys.regulation(focus) * P.press * (0.6 + 0.8 * P.velocity)).toFixed(2)} N for the computer keys`],
    ['pattern drift', `(1 − B)Ω: the free (2,0) pattern turns at ${((1 - m2.bryan) * P.speed).toFixed(2)} rev/s`],
    ['warble', `${(4 * P.speed).toFixed(1)} Hz, ±${((m2.f2 - m2.f1) / 2).toFixed(2)} Hz (the doublet passing under the finger)`],
    ['lab coupling', `γ = n(1 − B)Ω = ${phys.transport(m2, P.speed).toFixed(1)} s⁻¹`],
  ];
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

// ---- views -----------------------------------------------------------------------
// The rim, looking along the spindle: radial displacement of every family, played
// back in slow motion from the engine's modal state (complex amplitude A = q − i q̇/ω).
// Each view has its own loop and skips drawing while its card is hidden.
let strobe = 0, lastT = 0, infoT = 0;
const visible = (cv) => cv.offsetParent !== null;
const loop = (cv, draw) => animate((t) => { if (visible(cv)) draw(t); }, cv);
loop($('#bowl'), drawBowl);
loop($('#contact'), drawContact);
loop($('#zoom'), drawZoom);
animate((t) => {
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t; strobe += dt * TAU * 0.8;
  if (t - infoT > 250 && visible($('#info'))) { infoT = t; if (model) info(); }
});

function drawBowl() {
  const { ctx, w, h } = fit($('#bowl'));
  ctx.clearRect(0, 0, w, h);
  if (!model) return;
  const cx = w / 2, cy = h / 2 + 6, R = Math.max(4, Math.min(w, h) * 0.34);
  const st = state && state.key === focus ? state : null, th = st ? st.theta : 0;
  const amps = [];
  let peak = 0;
  if (st) {
    for (let j = 0; j < st.nm; j++) {
      const m = model.modes[j], wv = TAU * m.f, fs = shell.audio ? shell.audio.ctx.sampleRate : 48000;
      const qc = st.q[4 * j], qs = st.q[4 * j + 1], vc = (qc - st.q[4 * j + 2]) * fs, vs = (qs - st.q[4 * j + 3]) * fs;
      amps.push({ m, cr: qc, ci: -vc / wv, sr: qs, si: -vs / wv });
      peak = Math.max(peak, m.n * Math.hypot(qc, vc / wv, qs, vs / wv));
    }
  }
  const scale = peak > 1e-9 ? (0.16 * R) / peak : 0;
  $('#bowl-scale').textContent = peak > 1e-9 ? `rim moves ±${(peak * 1e6).toFixed(1)} µm (shown ×${(scale).toExponential(0).replace('e+', '·10^')})` : '';
  // glass outline (deformed) — angles measured clockwise from the top (the finger)
  const P = (phi, r) => [cx + r * Math.sin(phi), cy - r * Math.cos(phi)];
  const radial = (phi) => {
    let wsum = 0;
    for (const a of amps) {
      const x = a.m.n * (phi - th - a.m.psi), c = Math.cos(x), s = Math.sin(x), cs = Math.cos(strobe), sn = Math.sin(strobe);
      wsum += -a.m.n * ((a.cr * cs - a.ci * sn) * c + (a.sr * cs - a.si * sn) * s);
    }
    return wsum;
  };
  ctx.lineWidth = 2; ctx.strokeStyle = css('--accent'); ctx.fillStyle = 'rgba(159,231,255,0.06)';
  ctx.beginPath();
  for (let i = 0; i <= 240; i++) { const phi = (i / 240) * TAU, [x, y] = P(phi, R + scale * radial(phi)); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.lineWidth = 1;
  // undeformed rim, ticks that turn with the glass, and the irregularity axes of (2,0)
  ctx.strokeStyle = css('--grid'); ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = css('--muted');
  for (let i = 0; i < 24; i++) { const phi = th + (i * TAU) / 24, [x1, y1] = P(phi, R * 0.86), [x2, y2] = P(phi, R * (i % 6 ? 0.9 : 0.8)); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  const m2 = model.modes[0];
  ctx.fillStyle = css('--accent-2');
  for (let i = 0; i < 4; i++) { const [x, y] = P(th + m2.psi + (i * Math.PI) / 2, R * 0.72); ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill(); }
  // spin arrow
  ctx.strokeStyle = css('--muted'); ctx.beginPath(); ctx.arc(cx, cy, R * 0.45, -Math.PI / 2 + 0.3, -Math.PI / 2 + 1.4); ctx.stroke();
  const [ax, ay] = P(1.4, R * 0.45); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - 7, ay - 2); ctx.lineTo(ax - 2, ay - 7); ctx.closePath(); ctx.fillStyle = css('--muted'); ctx.fill();
  ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`${(st ? st.rot : shell.P.speed).toFixed(2)} rev/s`, cx, cy + 4);
  // finger at the top: green while stuck to the glass
  const stuck = st && st.touch && st.trS[TRACE - 1] === 0;
  const [fx, fy] = P(0, R + 16);
  ctx.fillStyle = st && st.touch ? (stuck ? '#7ddc9a' : css('--accent-2')) : css('--grid');
  ctx.beginPath(); ctx.ellipse(fx, fy - 6, 9, 15, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = css('--muted'); ctx.fillText('finger', fx + 34, fy - 6);
  // the two microphones
  MIC.forEach((a, i) => { const [x, y] = P(a, R + 30); ctx.fillStyle = css('--text'); ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); ctx.fillStyle = css('--muted'); ctx.fillText(i ? 'R' : 'L', x + 10, y + 3); });
}

// Slip speed under the finger (glass minus skin), last TRACE samples.
function drawContact() {
  const { ctx, w, h } = fit($('#contact'));
  ctx.clearRect(0, 0, w, h);
  const st = state && state.key === focus ? state : null;
  const padL = 34, padB = 16, y0 = h - padB - 4, top = 8;
  const V = phys.rimSpeed(focus, shell.P.speed);
  let vmax = 1.6 * V;
  if (st) for (let i = 0; i < TRACE; i++) vmax = Math.max(vmax, Math.abs(st.trS[i]) * 1.05);
  const X = (i) => padL + ((w - padL - 6) * i) / (TRACE - 1), Y = (v) => y0 - ((y0 - top) * v) / vmax;
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right';
  for (const v of [0, V]) { ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(w - 6, Y(v)); ctx.stroke(); ctx.fillText(v ? 'V' : '0', padL - 4, Y(v) + 3); }
  ctx.textAlign = 'center'; ctx.fillText('21 ms', w / 2, h - 3);
  if (!st || !st.touch) { $('#contact-read').textContent = 'finger lifted'; return; }
  let sticks = 0;
  ctx.fillStyle = 'rgba(125,220,154,0.18)';
  for (let i = 0; i < TRACE; i++) if (st.trS[i] === 0) { sticks++; ctx.fillRect(X(i) - 0.5, top, (w - padL) / TRACE + 1, y0 - top); }
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i < TRACE; i++) { const x = X(i), y = Y(st.trS[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.stroke(); ctx.lineWidth = 1;
  $('#contact-read').textContent = `${st.N.toFixed(2)} N · stuck ${((100 * sticks) / TRACE).toFixed(0)} % of the time`;
}

// Narrow-band view around the (2,0) doublet: live long FFT and the model's lines.
function drawZoom() {
  const { ctx, w, h } = fit($('#zoom'));
  ctx.clearRect(0, 0, w, h);
  if (!model) return;
  const m2 = model.modes[0], rot = shell.P.speed, lines = phys.freeLines(m2, rot);
  const span = Math.max(4, 1.6 * Math.max(...lines.map((l) => Math.abs(l.f - m2.f))), 1.2 * (m2.f2 - m2.f1));
  const fLo = m2.f - span, fHi = m2.f + span, padL = 30, padB = 16, top = 6;
  const X = (f) => padL + ((w - padL - 6) * (f - fLo)) / (fHi - fLo), Y = (d) => top + ((h - padB - top) * (-20 - d)) / 80;
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  const step = span > 12 ? 5 : span > 5 ? 2 : 1;
  for (let d = -Math.floor(span / step) * step; d <= span; d += step) { ctx.beginPath(); ctx.moveTo(X(m2.f + d), top); ctx.lineTo(X(m2.f + d), h - padB); ctx.stroke(); ctx.fillText(d ? `${d > 0 ? '+' : ''}${d}` : `${m2.f.toFixed(1)} Hz`, X(m2.f + d), h - 4); }
  ctx.setLineDash([4, 3]); ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 1.5;
  for (const f of [m2.f1, m2.f2]) { ctx.beginPath(); ctx.moveTo(X(f), top); ctx.lineTo(X(f), h - padB); ctx.stroke(); }
  ctx.setLineDash([]); ctx.strokeStyle = css('--accent'); ctx.globalAlpha = 0.7;
  for (const l of lines) { ctx.globalAlpha = 0.1 + 0.8 * l.w; ctx.beginPath(); ctx.moveTo(X(l.f), top + 10); ctx.lineTo(X(l.f), h - padB); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
  if (zoomA) {
    zoomA.getFloatFrequencyData(zoomBuf);
    const fs = zoomA.context.sampleRate, df = fs / zoomA.fftSize;
    ctx.strokeStyle = css('--text'); ctx.globalAlpha = 0.8; ctx.beginPath();
    let first = true;
    for (let px = padL; px < w - 6; px++) {
      const f = fLo + ((px - padL) * (fHi - fLo)) / (w - padL - 6), b = f / df, i = Math.floor(b), u = b - i;
      if (i < 1 || i + 1 >= zoomBuf.length) continue;
      const d = Math.max(-100, Math.min(-20, (1 - u) * zoomBuf[i] + u * zoomBuf[i + 1]));
      if (first) { ctx.moveTo(px, Y(d)); first = false; } else ctx.lineTo(px, Y(d));
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  $('#zoom-read').textContent = `split ${(m2.f2 - m2.f1).toFixed(2)} Hz · a free pattern sweeps past a fixed ear at ${(4 * (1 - m2.bryan) * rot).toFixed(2)} Hz`;
}

shell.keys.focus(focus);
update();
