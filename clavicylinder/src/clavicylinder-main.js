// clavicylinder-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './clavicylinder-instrument.js';
import { wasmModel, TRACE } from './clavicylinder-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const phys = await wasmModel();

const $ = (s) => document.querySelector(s);
const TAU = 2 * Math.PI;
const spectrum = new SpectrumView($('#spectrum'), { fLo: 50, fHi: 16000 });
new SpectrogramView($('#spectrogram'), { spectrum });
let focus = 60, bar = null, state = null;

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'press', step: 0.2 },
  holdHint: { ms: 400, text: 'Hold the key down: the bar sings only while its key holds it against the turning glass.' },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => { if (m.type === 'state') state = m; },
  onNoteOn: (key) => { focus = key; shell.keys.focus(key); update(); },
  onParam: () => update(),
});

// The glass's speed at the cloth, and the cloth's force on it for the computer keys (velocity
// 0.5–1.5×, as the engine takes it).
const glassSpeed = (P) => TAU * phys.CYL_R * P.speed;
const keyForce = (P) => P.press * bar.reg * (0.5 + P.velocity);
// Where the bar starts to speak, from linear stability: the friction's fall at the glass's speed,
// μ′(V), feeds the lowest mode as a negative damping N|μ′|c₁²/(2m) that must outrun its loss σ₁
// (the cloth's spring in series, stiff next to the bar at its note, is left out).
function threshold(P) {
  const f = phys.friction(P.wet, P.grip, bar.L), V = glassSpeed(P), x = V / f.v0, m1 = bar.modes[0];
  const slope = (2 * f.dmu * x) / (f.v0 * (1 + x * x) ** 2) - f.beta;
  return slope > 0 ? (2 * m1.sigma * bar.m) / (slope * m1.c * m1.c) : Infinity;
}

function update() {
  const P = shell.P;
  bar = phys.bar(focus, P);
  const m1 = bar.modes[0];
  spectrum.set(m1.f, bar.modes.map((m) => ({ f: m.f, alpha: 0.3 + 0.6 * Math.min(1, Math.abs(m.e / m1.e)) })));
  for (const id of ['#focus-name', '#focus-name-2']) $(id).textContent = noteName(focus);
  $('#modes').innerHTML = '<tr><th>mode</th><th>f (Hz)</th><th>ratio</th><th>T60 (s)</th><th>at the cloth</th><th>to the bridge</th></tr>'
    + bar.modes.map((m, n) => `<tr><td>${n + 1}</td><td>${m.f.toFixed(1)}</td><td>${(m.f / m1.f).toFixed(3)}</td><td>${(6.91 / m.sigma).toFixed(2)}</td>`
      + `<td>${(m.c / m1.c).toFixed(2)}</td><td>${(m.e / m1.e).toFixed(2)}</td></tr>`).join('');
  info();
}

function info() {
  const P = shell.P, b = bar, Nc = threshold(P), V = glassSpeed(P);
  const st = state && state.key === focus && state.touch ? state : null;
  const N = st ? st.N : keyForce(P);
  const rows = [
    ['bar', `${(b.L * 100).toFixed(1)} cm × ${(phys.WIDTH * 1000).toFixed(1)} × ${(b.h * 1000).toFixed(2)} mm of iron · ${(b.m * 1000).toFixed(0)} g`],
    ['rubbed', b.post ? `on a ${(phys.POST * 100).toFixed(1)} cm iron post, ⅜ of the length from the back` : `on its bent-up back end (${(b.arm * 100).toFixed(1)} cm)`],
    ['cords', Math.abs(b.xs - phys.NODE) < 1e-4 ? `on the nodes, ${(100 * b.xs).toFixed(1)} % from each end` : `${(100 * b.xs).toFixed(1)} % from each end (the nodes are at ${(100 * phys.NODE).toFixed(1)} %)`],
    ['glass', `${(V * 100).toFixed(0)} cm/s under the cloth at ${(st ? st.rev : P.speed).toFixed(2)} rev/s`],
    ['speaks above', Number.isFinite(Nc) ? `${Nc.toFixed(2)} N on the glass (${((Nc * 1000) / 9.81).toFixed(0)} g)` : 'never: the cloth no longer grabs'],
    [st ? 'key now' : 'computer keys', `${N.toFixed(2)} N · ${(N / Nc).toFixed(1)} × threshold${st ? ` · stuck ${(100 * st.stick).toFixed(0)} % of the time` : ''}`],
  ];
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

// ---- views -----------------------------------------------------------------------
// Each view has its own loop and skips drawing while its card is hidden.
let strobe = 0, lastT = 0, infoT = 0;
const visible = (cv) => cv.offsetParent !== null;
const loop = (cv, draw) => animate((t) => { if (visible(cv)) draw(t); }, cv);
loop($('#bar'), drawBar);
loop($('#contact'), drawContact);
animate((t) => {
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t; strobe += dt * TAU * 0.7;
  if (t - infoT > 250 && visible($('#info'))) { infoT = t; if (bar) info(); }
});

// The bar from the side, with the glass cylinder over its rubbed point: its bending in slow
// motion from the engine's modal state (each mode's q cos s + (q̇/ω) sin s), hugely exaggerated.
function drawBar() {
  const { ctx, w, h } = fit($('#bar'));
  ctx.clearRect(0, 0, w, h);
  if (!bar) return;
  const b = bar, st = state && state.key === focus ? state : null;
  // to scale: the bar across most of the width, the cylinder (6.8 cm) as large as that allows
  const x0 = 26, x1 = w - 26, s = Math.min((x1 - x0) / b.L, (0.42 * h) / (2 * phys.CYL_R + 0.04));
  const len = b.L * s, bx0 = (x0 + x1 - len) / 2, R = phys.CYL_R * s;
  const X = (u) => bx0 + u * len;
  const lift = b.post ? phys.POST * s : b.arm * s; // the rubbed point stands this far above the bar
  const xr = b.post ? X(b.xc) : X(1);
  // from the top down (a phone shows only the top of a tall card): the glass, the bar, the key
  const cy = Math.max(14, Math.min(0.5 * (h - (2 * R + lift + 48)), 0.1 * h)) + R, yBar = cy + R + 4 + lift;
  // deflection, from the engine's modes
  let wave = () => 0, slope = () => 0, peak = 0;
  if (st && st.nm) {
    const cs = Math.cos(strobe), sn = Math.sin(strobe), amp = [];
    for (let j = 0; j < Math.min(st.nm, b.modes.length); j++) {
      const wv = TAU * b.modes[j].f, a = st.q[j] * cs + (st.q[8 + j] / wv) * sn;
      amp.push(a); peak = Math.max(peak, Math.hypot(st.q[j], st.q[8 + j] / wv) * 2);
    }
    wave = (u) => amp.reduce((sum, a, j) => sum + a * phys.modeShape(j, u), 0);
    slope = (u) => amp.reduce((sum, a, j) => sum + a * phys.modeSlope(j, u), 0); // per unit of the length
  }
  const scale = peak > 1e-12 ? (0.045 * h) / peak : 0;
  $('#bar-scale').textContent = peak > 1e-12 ? `the ends swing ±${(peak * 1e6).toFixed(1)} µm (shown ×${Math.round(scale / s).toLocaleString()})` : `${(b.L * 100).toFixed(1)} cm long`;
  // the key under the bar, and the soundboard's bridge it is pinned to
  const touch = st && st.touch;
  ctx.fillStyle = css('--grid');
  ctx.fillRect(x0, yBar + 18, x1 - x0, 5);
  ctx.fillStyle = touch ? css('--accent-2') : css('--muted');
  ctx.globalAlpha = 0.5; ctx.fillRect(bx0 + 0.1 * len, yBar + 8, 0.8 * len, 8); ctx.globalAlpha = 1;
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('key, on the soundboard’s bridge', x0, yBar + 34);
  // cords on cork at the nodes
  for (const u of [b.xs, 1 - b.xs]) {
    const x = X(u);
    ctx.fillStyle = '#c9a27a'; ctx.beginPath(); ctx.moveTo(x - 5, yBar + 8); ctx.lineTo(x + 5, yBar + 8); ctx.lineTo(x, yBar + 2); ctx.closePath(); ctx.fill();
  }
  // the bar
  const Y = (u) => yBar - scale * wave(u);
  ctx.strokeStyle = css('--text'); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
  for (let i = 0; i <= 120; i++) { const u = i / 120; if (i) ctx.lineTo(X(u), Y(u)); else ctx.moveTo(X(u), Y(u)); }
  // the bent end rises from the last part of the bar
  if (!b.post) ctx.lineTo(X(1) + lift * 0.15, Y(1) - lift);
  ctx.stroke();
  // the post, riveted upright, swings with the bar's slope (the same exaggeration)
  const sway = b.post ? (-lift * scale * slope(b.xc)) / len : 0;
  if (b.post) { ctx.beginPath(); ctx.moveTo(xr, Y(b.xc)); ctx.lineTo(xr + sway, Y(b.xc) - lift); ctx.stroke(); }
  ctx.lineWidth = 1; ctx.lineCap = 'butt';
  // the cloth on the rubbed point: green while it sticks to the glass
  const stuck = touch && Math.abs(st.trS[TRACE - 1]) < 1e-6 * Math.max(st.V, 1e-3);
  const tipY = (b.post ? Y(b.xc) : Y(1)) - lift, tipX = b.post ? xr + sway : X(1) + lift * 0.15;
  ctx.fillStyle = touch ? (stuck ? '#7ddc9a' : css('--accent-2')) : css('--muted');
  ctx.fillRect(tipX - 6, tipY - 5, 12, 6);
  // the glass cylinder, turning toward the player (the bottom moves the cloth forward)
  const th = st ? st.theta : 0, ccx = b.post ? xr : X(1) + lift * 0.15;
  ctx.fillStyle = 'rgba(159,231,255,0.08)'; ctx.strokeStyle = css('--accent');
  ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ccx, cy, R, 0, TAU); ctx.fill(); ctx.stroke(); ctx.lineWidth = 1;
  ctx.strokeStyle = css('--muted');
  for (let i = 0; i < 12; i++) { const a = -th + (i * TAU) / 12; ctx.beginPath(); ctx.moveTo(ccx + 0.78 * R * Math.cos(a), cy + 0.78 * R * Math.sin(a)); ctx.lineTo(ccx + 0.9 * R * Math.cos(a), cy + 0.9 * R * Math.sin(a)); ctx.stroke(); }
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  ctx.fillText(`${(st ? st.rev : shell.P.speed).toFixed(2)} rev/s`, ccx, cy + 3);
  ctx.textAlign = ccx > w / 2 ? 'right' : 'left';
  ctx.fillText('wet glass', ccx + (ccx > w / 2 ? -R - 6 : R + 6), cy - R * 0.5);
  ctx.textAlign = 'left'; ctx.fillText('front', x0, yBar - 8); ctx.textAlign = 'right'; ctx.fillText('back', x1, yBar - 8);
}

// Slip speed under the cloth (glass minus cloth), last TRACE samples.
function drawContact() {
  const { ctx, w, h } = fit($('#contact'));
  ctx.clearRect(0, 0, w, h);
  const st = state && state.key === focus ? state : null;
  const padL = 34, padB = 16, y0 = h - padB - 4, top = 8, fs = shell.audio ? shell.audio.ctx.sampleRate : 48000;
  const V = st && st.V > 0 ? st.V : glassSpeed(shell.P);
  let vmax = 1.6 * V, vmin = -0.2 * V;
  if (st) for (let i = 0; i < TRACE; i++) { vmax = Math.max(vmax, st.trS[i] * 1.05); vmin = Math.min(vmin, st.trS[i] * 1.05); }
  const X = (i) => padL + ((w - padL - 6) * i) / (TRACE - 1), Y = (v) => y0 - ((y0 - top) * (v - vmin)) / (vmax - vmin);
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right';
  for (const v of [0, V]) { ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(w - 6, Y(v)); ctx.stroke(); ctx.fillText(v ? 'V' : '0', padL - 4, Y(v) + 3); }
  ctx.textAlign = 'center'; ctx.fillText(`${((1000 * TRACE) / fs).toFixed(0)} ms`, w / 2, h - 3);
  if (!st || !st.touch) { $('#contact-read').textContent = 'key up: the bar is off the glass'; return; }
  let sticks = 0;
  ctx.fillStyle = 'rgba(125,220,154,0.18)';
  for (let i = 0; i < TRACE; i++) if (Math.abs(st.trS[i]) < 1e-6 * V) { sticks++; ctx.fillRect(X(i) - 0.5, top, (w - padL) / TRACE + 1, y0 - top); }
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i < TRACE; i++) { const x = X(i), y = Y(st.trS[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.stroke(); ctx.lineWidth = 1;
  $('#contact-read').textContent = `${st.N.toFixed(2)} N on the glass · stuck ${((100 * sticks) / TRACE).toFixed(0)} % of the time`;
}

shell.keys.focus(focus);
update();
