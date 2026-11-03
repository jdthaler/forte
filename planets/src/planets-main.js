// planets-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './planets-instrument.js';
import { wasmModel } from './planets-wasm.js';
import { PLANETS } from './planets-models.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
const TAU = 2 * Math.PI, DEG = Math.PI / 180;
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n) => String(n).split('').map((d) => SUB[+d]).join('');
const modeName = (m) => `${sub(m.n)}${m.type}${sub(m.l)}`;
let focus = 60, vel = 0.7, struck = -Infinity; // the last note: its key, velocity and time (performance.now())

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key, v) => { focus = key; vel = v ?? shell.P.velocity; struck = performance.now(); update(); },
  onParam: () => update(),
});

const planetIndex = () => Math.max(0, ['earth', 'mars', 'moon'].indexOf(shell.P.planet));
const planetData = () => model.planets[planetIndex()];
const fmtPeriod = (s) => (s >= 3600 ? `${(s / 3600).toFixed(2)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(0)} s`);
const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 100 ? 1 : 0)} Hz`);
const fmtK = (K) => (K >= 1e6 ? `${(K / 1e6).toFixed(2)} million` : `${Math.round(K / 1000)},000`);

let rows = [];
function update() {
  const P = shell.P, pl = planetData(), K = model.speedup(focus, P);
  rows = model.multiplets(focus, vel, P, 80);
  const top = rows[0]?.amp || 1;
  // the loudest two dozen, and the note's own ₀S₂ and the breathing ₀S₀ (gold) wherever they rank
  const grave = (m) => m.type === 'S' && m.n === 0 && (m.l === 2 || m.l === 0);
  const gold = getComputedStyle(document.documentElement).getPropertyValue('--accent-2').trim();
  const marked = rows.filter((m, i) => i < 24 || grave(m));
  spectrum.set(K * pl.f0S2, marked.map((m) => ({ f: m.f, color: grave(m) ? gold : undefined, alpha: grave(m) ? 0.9 : 0.15 + 0.7 * Math.min(1, m.amp / top) })));
  $('#focus-name').textContent = noteName(focus);
  $('#modes').innerHTML = '<tr><th>mode</th><th>period</th><th>heard</th><th>Q</th><th>rings (T60)</th></tr>'
    + rows.slice(0, 14).map((m) => `<tr><td>${modeName(m)}</td><td>${fmtPeriod(K / m.f)}</td><td>${fmtHz(m.f)}</td><td>${(Math.PI * m.f / m.decay).toFixed(0)}</td><td>${(6.91 / m.decay).toFixed(2)} s</td></tr>`).join('');
  const mw = model.magnitude(vel, P), h = model.halfDuration(vel, P);
  $('#inside-read').textContent = `${noteName(focus)}: sped up ${fmtK(K)} times, so ₀S₂'s ${fmtPeriod(1 / pl.f0S2)} is ${(1000 / (K * pl.f0S2)).toFixed(1)} ms · Mw ${mw.toFixed(1)}, rupture ${(2 * h).toFixed(0)} s`;
  fieldScale = 0;
}

// ---- the planet, ringing: its surface moving up and down, slowed so that ₀S₂ swings in 1.6 s ----
const NLAT = 19, NLON = 36, LMAX_SHOW = 4;
const grid = new Float64Array(2 * NLAT * NLON);
for (let i = 0; i < NLAT; i++) for (let j = 0; j < NLON; j++) { grid[2 * (i * NLON + j)] = (i / (NLAT - 1)) * Math.PI; grid[2 * (i * NLON + j) + 1] = (j / NLON) * TAU; }
let fieldScale = 0, fieldAt = -1, field = null;
const off = document.createElement('canvas');
const SPIN_SHOWN = 1 / 40; // the globe turns once in 40 s, whatever the planet
function sample(th, ph) { // bilinear in the grid
  const x = (th / Math.PI) * (NLAT - 1), y = (((ph % TAU) + TAU) % TAU) / TAU * NLON;
  const i = Math.min(NLAT - 2, Math.floor(x)), j = Math.floor(y) % NLON, j1 = (j + 1) % NLON, a = x - i, b = y - Math.floor(y);
  const f = (ii, jj) => field[ii * NLON + jj];
  return (1 - a) * ((1 - b) * f(i, j) + b * f(i, j1)) + a * ((1 - b) * f(i + 1, j) + b * f(i + 1, j1));
}
const latOf = () => shell.P.lat * DEG;
animate(() => {
  const cv = $('#globe'), { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, pl = planetData(), now = performance.now();
  const slow = (1 / pl.f0S2) / 1.6; // planet seconds per screen second
  const t = ((now - struck) / 1000) * slow;
  const live = t < 40 * slow;
  if (live && (now - fieldAt > 45 || !field)) {
    if (!fieldScale) { const f0 = model.field(vel, P, LMAX_SHOW, 0.25 / pl.f0S2, grid); fieldScale = 1 / Math.max(1e-30, ...f0.map(Math.abs)); }
    field = model.field(vel, P, LMAX_SHOW, t, grid); fieldAt = now;
  }
  const R = Math.max(4, Math.min(w, h) * 0.38), cx = w / 2, cy = h / 2;
  const tilt = 20 * DEG, lon0 = -TAU * SPIN_SHOWN * (now / 1000);
  // view: rotate a point (θ, φ) into screen coordinates (orthographic, north tilted toward us)
  const proj = (th, ph) => {
    const x0 = Math.sin(th) * Math.cos(ph + lon0), y0 = Math.sin(th) * Math.sin(ph + lon0), z0 = Math.cos(th);
    const y = y0, z = z0 * Math.cos(tilt) - x0 * Math.sin(tilt), x = z0 * Math.sin(tilt) + x0 * Math.cos(tilt);
    return { X: y, Y: -z, front: x > 0 };
  };
  const S = 96;
  off.width = off.height = S;
  const octx = off.getContext('2d'), img = octx.createImageData(S, S);
  const base = pl.id === 'earth' ? [70, 120, 170] : pl.id === 'mars' ? [190, 100, 60] : [150, 150, 150];
  const k = live && field ? fieldScale * Math.exp(-0) : 0;
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const X = (px + 0.5) / S * 2 - 1, Y = (py + 0.5) / S * 2 - 1, r2 = X * X + Y * Y;
    if (r2 > 1) continue;
    const x = Math.sqrt(1 - r2), y = X, z = -Y;
    // back to the planet: undo the tilt and the turn
    const z0 = z * Math.cos(tilt) + x * Math.sin(tilt), x0 = -z * Math.sin(tilt) + x * Math.cos(tilt);
    const th = Math.acos(Math.max(-1, Math.min(1, z0))), ph = Math.atan2(y, x0) - lon0;
    const u = k ? Math.max(-1, Math.min(1, sample(th, ph) * k)) : 0;
    const shade = 0.35 + 0.65 * x;
    const c = u >= 0 ? [255, 200, 90] : [90, 170, 255], a = Math.abs(u);
    const o = 4 * (py * S + px);
    for (let q = 0; q < 3; q++) img.data[o + q] = shade * (base[q] * (1 - a) + c[q] * a);
    img.data[o + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  // the outline, bulging with the motion (exaggerated)
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * TAU, X = Math.cos(a), Y = Math.sin(a);
    const z0 = -Y * Math.cos(tilt), x0 = Y * Math.sin(tilt);
    const th = Math.acos(Math.max(-1, Math.min(1, z0))), ph = Math.atan2(X, x0) - lon0;
    const u = k ? Math.max(-1, Math.min(1, sample(th, ph) * k)) : 0;
    const r = R * (1 + 0.08 * u);
    if (i) ctx.lineTo(cx + r * X, cy + r * Y); else ctx.moveTo(cx + r * X, cy + r * Y);
  }
  ctx.closePath();
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, cx - R * 1.09, cy - R * 1.09, 2.18 * R, 2.18 * R);
  ctx.restore();
  // the quake, the station and the great circle between them
  const ths = Math.PI / 2 - latOf(), st = model.station(P);
  const dot = (th, ph) => { const p = proj(th, ph); return { x: cx + R * p.X, y: cy + R * p.Y, front: p.front }; };
  ctx.strokeStyle = css('--text'); ctx.globalAlpha = 0.7; ctx.setLineDash([3, 3]); ctx.beginPath();
  const a1 = [Math.sin(ths), 0, Math.cos(ths)], a2 = [Math.sin(st.theta) * Math.cos(st.phi), Math.sin(st.theta) * Math.sin(st.phi), Math.cos(st.theta)];
  const om = Math.acos(Math.max(-1, Math.min(1, a1[0] * a2[0] + a1[1] * a2[1] + a1[2] * a2[2])));
  let pen = false;
  for (let i = 0; i <= 64 && om > 1e-3; i++) {
    const f = i / 64, s1 = Math.sin((1 - f) * om) / Math.sin(om), s2 = Math.sin(f * om) / Math.sin(om);
    const v = [0, 1, 2].map((q) => s1 * a1[q] + s2 * a2[q]);
    const d = dot(Math.acos(Math.max(-1, Math.min(1, v[2]))), Math.atan2(v[1], v[0]));
    if (d.front) { if (pen) ctx.lineTo(d.x, d.y); else ctx.moveTo(d.x, d.y); pen = true; } else pen = false;
  }
  ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  const q = dot(ths, 0), s = dot(st.theta, st.phi);
  const star = (x, y, r) => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); } ctx.closePath(); ctx.fill(); };
  ctx.fillStyle = css('--accent-2'); ctx.globalAlpha = q.front ? 1 : 0.3; star(q.x, q.y, 7);
  ctx.fillStyle = css('--accent'); ctx.globalAlpha = s.front ? 1 : 0.3;
  ctx.beginPath(); ctx.moveTo(s.x, s.y - 6); ctx.lineTo(s.x + 5, s.y + 4); ctx.lineTo(s.x - 5, s.y + 4); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = css('--muted'); ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(`${pl.id === 'moon' ? 'The Moon' : pl.id[0].toUpperCase() + pl.id.slice(1)} · ${P.distance.toFixed(0)}° from the quake`, 8, 16);
}, $('#globe'));

// ---- inside: the layers, coloured by shear-wave speed (liquid: no shear), and the quake ----
animate(() => {
  const cv = $('#inside'), { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const Pm = PLANETS[planetIndex()], P = shell.P;
  const R = Math.max(4, Math.min((h - 12) / 2, w * 0.42)), cx = 10, cy = h / 2;
  const col = (l) => {
    const x = (l.r0 + l.r1) / 2 / Pm.R, vs = l.vs(x);
    if (vs === 0) return '#d9822b';
    const t = Math.max(0, Math.min(1, (vs - 3) / 4));
    return `rgb(${Math.round(70 + 60 * t)}, ${Math.round(110 + 70 * t)}, ${Math.round(150 + 80 * t)})`;
  };
  for (let i = Pm.layers.length - 1; i >= 0; i--) {
    const l = Pm.layers[i];
    ctx.fillStyle = col(l); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R * l.r1 / Pm.R, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = css('--bg'); ctx.lineWidth = 0.6;
  for (const l of Pm.layers) { ctx.beginPath(); ctx.arc(cx, cy, R * l.r1 / Pm.R, -Math.PI / 2, Math.PI / 2); ctx.stroke(); }
  ctx.lineWidth = 1;
  // labels: each named layer once, at its middle
  ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = css('--text');
  const named = [];
  for (const l of Pm.layers) { const prev = named[named.length - 1]; if (prev && prev.name === l.name) prev.r1 = l.r1; else named.push({ name: l.name, r0: l.r0, r1: l.r1, fluid: l.vs((l.r0 + l.r1) / 2 / Pm.R) === 0 }); }
  let lastY = Infinity;
  for (const l of named) {
    if ((l.r1 - l.r0) / Pm.R < 0.02) continue;
    const y = cy - R * (l.r0 + l.r1) / 2 / Pm.R;
    if (Math.abs(y - lastY) < 13) continue;
    lastY = y;
    ctx.fillText(`${l.name}${l.fluid ? ' (liquid)' : ''}`, cx + R * 1.04 + 4, y + 4);
  }
  // the quake, at its depth below the top
  const d = Math.min(P.depth, planetData().maxDepth), y = cy - R * (Pm.R - d) / Pm.R;
  ctx.fillStyle = css('--accent-2');
  ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 3 : 7; ctx.lineTo(cx + 2 + rr * Math.cos(a), y + rr * Math.sin(a)); } ctx.closePath(); ctx.fill();
  ctx.fillStyle = css('--muted');
  ctx.fillText(`★ the quake, ${d.toFixed(0)} km down`, cx + R * 1.04 + 4, h - 6);
}, $('#inside'));

update();
