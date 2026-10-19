// kalimba-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './kalimba-instrument.js';
import { wasmModel } from './kalimba-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 60, plucked = -1e9, vel = 0.7, modes = [], tine = null, beam = null, box = null;

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key, v) => { focus = key; plucked = performance.now(); vel = v ?? shell.P.velocity; update(); },
  onParam: () => update(),
});

function update() {
  const P = shell.P;
  modes = model.keyModes(focus, P);
  tine = model.tine(focus, P);
  beam = model.beam(P.back);
  box = model.box(P);
  const a0 = Math.max(...modes.map((m) => Math.abs(m.amp)));
  spectrum.set(modes[0].f, modes.map((m) => ({ f: m.f, alpha: 0.25 + 0.65 * Math.min(1, Math.abs(m.amp) / a0) })));
  for (const el of document.querySelectorAll('.focus-name')) el.textContent = noteName(focus);
  $('#modes').innerHTML = '<tr><th>mode</th><th>f (Hz)</th><th>ratio</th><th>T60 (s)</th><th>force (N)</th></tr>'
    + modes.map((m, n) => `<tr><td>${n + 1}</td><td>${m.f.toFixed(1)}</td><td>${(m.f / modes[0].f).toFixed(3)}</td><td>${(6.91 / m.sigma).toFixed(2)}</td><td>${m.amp.toFixed(3)}</td></tr>`).join('');
  const mm = (v) => `${(v * 1000).toFixed(1)} mm`;
  $('#tine-read').textContent = `front ${mm(tine.L)} · back ${mm(tine.a)} · ${(tine.t * 1000).toFixed(2)} mm thick · thumb ${tine.force.toFixed(1)} N, ${mm(tine.depth)} down`;
  $('#box-read').textContent = box.open
    ? `air ${box.fLo.toFixed(0)} Hz · top ${box.fHi.toFixed(0)} Hz (hole alone ${box.fH.toFixed(0)} Hz, top alone ${box.fp.toFixed(0)} Hz)`
    : `hole shut: the top alone, ${box.fHi.toFixed(0)} Hz`;
}

// The tine of the last key, side on: the clamp, the bridge and the free tip, moving in slow
// motion (its fundamental at 1.5 Hz, each mode at its own ratio above it) and dying away in
// real time. The thumb's mark is where it was pushed down.
animate(() => {
  const { ctx, w, h } = fit($('#tine'));
  ctx.clearRect(0, 0, w, h);
  if (!tine) return;
  const P = shell.P, r = P.back, x0 = 0.06 * w, x1 = 0.96 * w, yc = 0.45 * h;
  const X = (xi) => x0 + ((xi + r) / (1 + r)) * (x1 - x0);
  const t = (performance.now() - plucked) / 1000, slow = 1.5 * t;
  // the shape now: Σ q φ(ξ) e^(−σt) cos(2π (f/f1) slow)
  const q0 = Math.max(1e-12, Math.abs(model.staticDeflection(focus, P, P.pluck)));
  const A = (0.32 * h) / q0 * Math.min(1, vel / 0.7);
  const shape = (xi) => modes.reduce((s, m, n) => s + m.q * beam.shape(n, xi) * Math.exp(-m.sigma * t) * Math.cos(2 * Math.PI * (m.f / modes[0].f) * slow), 0);
  // the box's top under it, the clamp and the bridge
  ctx.fillStyle = css('--line'); ctx.fillRect(0, yc + 0.18 * h, w, 0.06 * h);
  ctx.fillStyle = css('--muted');
  ctx.fillRect(X(-r) - 10, yc - 10, 14, 0.18 * h + 10);
  ctx.beginPath(); ctx.moveTo(X(0) - 7, yc + 0.18 * h); ctx.lineTo(X(0), yc + 3); ctx.lineTo(X(0) + 7, yc + 0.18 * h); ctx.fill();
  ctx.strokeStyle = css('--grid'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(-r), yc); ctx.lineTo(X(1), yc); ctx.stroke();
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
  for (let i = 0; i <= 160; i++) {
    const xi = -r + ((1 + r) * i) / 160, y = yc + A * shape(xi);
    if (i) ctx.lineTo(X(xi), y); else ctx.moveTo(X(xi), y);
  }
  ctx.stroke(); ctx.lineWidth = 1; ctx.lineCap = 'butt';
  ctx.fillStyle = css('--accent-2'); ctx.beginPath(); ctx.arc(X(P.pluck), yc - 12, 5, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = css('--muted'); ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('clamp', X(-r), yc + 0.3 * h); ctx.fillText('bridge', X(0), yc + 0.3 * h); ctx.fillText('tip', X(1), yc + 0.3 * h);
  ctx.fillText('thumb', X(P.pluck), yc - 22); ctx.textAlign = 'left';
}, $('#tine'));

// The box: its sound per newton at this tine's place on the bridge (dB), the hole as it is now,
// with the tine's modes on it. The air's resonance and the top's, and above them the top's
// higher modes.
animate(() => {
  const { ctx, w, h } = fit($('#box'));
  ctx.clearRect(0, 0, w, h);
  if (!box) return;
  const P = shell.P, fLo = 50, fHi = 16000, padL = 30, padB = 16, padT = 8;
  const X = (f) => padL + ((w - padL - 8) * Math.log(f / fLo)) / Math.log(fHi / fLo);
  const Y = (d) => padT + ((h - padT - padB) * (20 - d)) / 70;
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  for (const f of [100, 200, 500, 1000, 2000, 5000, 10000]) { ctx.beginPath(); ctx.moveTo(X(f), padT); ctx.lineTo(X(f), h - padB); ctx.stroke(); ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, X(f), h - 4); }
  ctx.textAlign = 'right';
  for (let d = 20; d >= -50; d -= 20) { ctx.beginPath(); ctx.moveTo(padL, Y(d)); ctx.lineTo(w - 8, Y(d)); ctx.stroke(); ctx.fillText(`${d}`, padL - 4, Y(d) + 3); }
  // the tine's modes, as tall as each one's force
  const a0 = Math.max(...modes.map((m) => Math.abs(m.amp)));
  ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 2;
  for (const m of modes) {
    if (m.f > fHi) continue;
    ctx.globalAlpha = 0.25 + 0.6 * Math.abs(m.amp) / a0;
    ctx.beginPath(); ctx.moveTo(X(m.f), h - padB); ctx.lineTo(X(m.f), Y(-50 + 70 * Math.abs(m.amp) / a0)); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // the response, re-read every frame: the finger over the hole glides
  const cover = P.cover;
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2.5; ctx.beginPath();
  for (let i = 0; i <= 240; i++) {
    const f = fLo * (fHi / fLo) ** (i / 240), d = Math.max(-50, Math.min(20, 20 * Math.log10(model.boxResponse(P, cover, focus, f) + 1e-12)));
    if (i) ctx.lineTo(X(f), Y(d)); else ctx.moveTo(X(f), Y(d));
  }
  ctx.stroke(); ctx.lineWidth = 1;
}, $('#box'));

update();
