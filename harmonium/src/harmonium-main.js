// harmonium-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName, useWasm } from '../../shared/shell.js';
import { fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './harmonium-instrument.js';
import * as jsModel from './harmonium-model.js';
import { RANKS, AIR, CD, areaAt, engaged } from './harmonium-model.js';
import { wasmModel } from './harmonium-wasm.js';

// The views draw what the engine plays: the WebAssembly model once it has loaded (the same
// physics as the engine, in C++), the JavaScript one until then or if it can't load. (areaAt
// only reads the reed's area table, which the model built.)
let phys = jsModel;
if (useWasm()) wasmModel().then((m) => { phys = m; updateModel(); }, (err) => console.warn(`harmonium: the WebAssembly model did not load (${err.message}); the views use the JavaScript one`));

const $ = (s) => document.querySelector(s);
const RANK_COL = ['#c98bff', '#ff9fb0', '#ffd27a', '#7cc8ff', '#9fe39f'];
let focus = 60, msg = null, shown = 1, model = null, thr = null, thrTimer = 0;
const BEAT_SEC = 4, WIND_SEC = 8;
const envHist = { t: new Float64Array(4096), v: new Float64Array(4096), n: 0 };
const windHist = { t: new Float64Array(1024), P: new Float64Array(1024), E: new Float64Array(1024), U: new Float64Array(1024), n: 0 };
let clock = 0, envKey = 0; // seconds of audio seen, from the engine's posts; the key the envelope belongs to

const shell = createShell({
  ...INSTRUMENT,
  base: 48,
  arrows: { param: 'velocity', step: 0.05 },
  onNoteOn: (key) => { focus = key; shell.keys.focus?.(key); updateModel(); },
  onParam: () => { updateModel(); },
  onMessage: (m) => {
    if (m.type !== 'reed') return;
    msg = m;
    if (m.key !== envKey) { envKey = m.key; envHist.n = 0; } // the envelope is the focused key's: start afresh
    for (let i = 0; i < m.nEnv; i++) { clock += m.dtEnv; push(envHist, { t: clock, v: m.env[i] }); }
    push(windHist, { t: clock, P: m.P, E: m.Ptarget, U: m.Uair });
    if (m.key && (m.key !== focus || m.rank !== shown)) { focus = m.key; shown = m.rank; updateModel(); }
    $("#wind-read").textContent = `${m.P.toFixed(0)} Pa · ${(m.Uair * 1000).toFixed(2)} L/s · ${m.reeds} reed${m.reeds === 1 ? '' : 's'} speaking`;
  },
});

function push(h, o) {
  const N = h.t.length, i = h.n % N;
  for (const k in o) h[k][i] = o[k];
  h.n++;
}
const span = (s) => `<span>${s}</span>`;

// The focused key's reed, as the engine built it (the model is deterministic), and its
// threshold pressure from the linear analysis (computed a moment after the knobs stop moving).
function updateModel() {
  const P = shell.P, on = engaged(P);
  if (!on[shown]) shown = [1, 2, 3, 0, 4].find((r) => on[r]) ?? 1;
  model = phys.reedModel(phys.rankFreq(focus, shown, P), P);
  const g = model.geo, md = model.modes;
  $('#slot-key').textContent = noteName(focus);
  $('#slot-read').textContent = `${RANKS[shown].name} reed: ${(g.L * 1e3).toFixed(1)} × ${(g.b * 1e3).toFixed(1)} × ${(g.h * 1e3).toFixed(2)} mm brass${g.mu > 0 ? `, tip weight ${(model.M * 1e3).toFixed(2)} g` : ''}`;
  clearTimeout(thrTimer);
  thrTimer = setTimeout(() => {
    thr = phys.threshold(model, 2e4);
    info();
  }, 80);
  info();
  void md;
}
function info() {
  if (!model) return;
  const g = model.geo;
  $('#slot-info').innerHTML = [
    span(`natural ${model.fNat.toFixed(1)} Hz, sounds ${model.fSound.toFixed(1)} Hz`),
    span(`set ${(g.y0 * 1e3).toFixed(2)} mm, clearance ${(g.delta * 1e6).toFixed(0)} µm, plate ${(g.e * 1e3).toFixed(2)} mm`),
    span(`cell ${(model.V * 1e6).toFixed(model.V < 1e-6 ? 2 : 1)} cm³ (resonance ${model.fCell.toFixed(0)} Hz), throat ℓ/A ${model.throatLA.toFixed(0)} m⁻¹`),
    span(thr ? `starts above ${thr.P.toFixed(0)} Pa` : 'threshold: —'),
  ].join(' · ');
}

// ---- view 1: the reed in its slot, a cycle stretched over two seconds ------------------------
// One period out of the engine's trace: between the last two upward crossings of the mean.
function period(m) {
  const n = m.n, y = m.y;
  if (!n) return null;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += y[i];
  mean /= n;
  const ups = [];
  for (let i = 1; i < n; i++) if (y[i - 1] < mean && y[i] >= mean) ups.push(i - 1 + (mean - y[i - 1]) / (y[i] - y[i - 1]));
  if (ups.length < 2) return null;
  return { a: ups[ups.length - 2], b: ups[ups.length - 1], mean };
}
const lerp = (arr, u) => { const i = Math.max(0, Math.min(arr.length - 2, Math.floor(u))), f = u - i; return arr[i] + (arr[i + 1] - arr[i]) * f; };
let frozen = null;
const scv = $('#slot');
animate(() => {
  const { ctx, w, h } = fit(scv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  if (!model) return;
  const g = model.geo, live = msg && msg.key === focus && msg.n ? msg : null;
  const per = live ? period(live) : null;
  if (per) frozen = { y: Float64Array.from(live.y), U: Float64Array.from(live.U), A: Float64Array.from(live.A), dp: Float64Array.from(live.dp), per, dt: live.dtTrace, P: live.P };
  // the cycle, looped over 2 s; at rest when nothing sounds
  let y = -g.y0, U = 0, A = model.Anom, dp = 0, yMin = -g.y0, yMax = g.e + g.h, phase = 0;
  const fr = frozen && msg && msg.key === focus ? frozen : null;
  if (fr) {
    const { a, b } = fr.per;
    phase = ((performance.now() / 1000) % 2) / 2;
    const u = a + phase * (b - a);
    y = lerp(fr.y, u); U = lerp(fr.U, u); A = lerp(fr.A, u); dp = lerp(fr.dp, u);
    for (let i = Math.floor(a); i <= Math.ceil(b); i++) { yMin = Math.min(yMin, fr.y[i]); yMax = Math.max(yMax, fr.y[i]); }
  }
  // layout: the cut on the left, the open-area bar on the right
  const barW = 22, x0 = 8, x1 = w - barW - 16;
  const span = g.L * 1.25, top = yMin - g.h - 0.08 * g.L, bot = Math.max(yMax, g.e + g.h) + 0.08 * g.L;
  const s = Math.min((x1 - x0) / span, (h - 34) / (bot - top));
  const ox = x0 + 0.12 * g.L * s + ((x1 - x0) - span * s) / 2, oy = 22 + ((h - 34) - (bot - top) * s) / 2;
  const X = (x) => ox + x * s, Y = (wv) => oy + (wv - top) * s;
  // the wind above the plate, shaded by the pressure in the cell
  const pRef = Math.max(100, fr ? fr.P : shell.P.pressure);
  ctx.fillStyle = css('--accent'); ctx.globalAlpha = Math.max(0.03, Math.min(0.28, 0.12 * (dp / pRef)));
  ctx.fillRect(X(-0.12 * g.L), Y(top), X(g.L * 1.13) - X(-0.12 * g.L), Y(0) - Y(top)); ctx.globalAlpha = 1;
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'right'; ctx.fillText(`wind ↓  cell ${dp.toFixed(0)} Pa`, X(g.L * 1.13) - 3, Y(top) + 11); ctx.textAlign = 'left';
  // the plate: solid under the rivet and beyond the tip; the slot between (its walls dashed)
  ctx.fillStyle = '#4a4f5c';
  ctx.fillRect(X(-0.12 * g.L), Y(0), X(0) - X(-0.12 * g.L), Y(g.e) - Y(0));
  ctx.fillRect(X(g.L + g.delta), Y(0), X(g.L * 1.13) - X(g.L + g.delta), Y(g.e) - Y(0));
  ctx.strokeStyle = '#4a4f5c'; ctx.setLineDash([3, 3]);
  for (const wv of [0, g.e]) { ctx.beginPath(); ctx.moveTo(X(0), Y(wv)); ctx.lineTo(X(g.L + g.delta), Y(wv)); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.fillStyle = css('--muted'); ctx.fillText(`plate ${(g.e * 1e3).toFixed(1)} mm, slot`, X(g.L * 0.55), Y(g.e) + 12);
  // the set (rest): dashed
  ctx.strokeStyle = css('--muted'); ctx.globalAlpha = 0.5; ctx.setLineDash([2, 3]); ctx.beginPath();
  for (let i = 0; i <= 40; i++) { const u = i / 40, wv = -g.y0 * phys.modeShape(g.lam[0], u); if (i) ctx.lineTo(X(u * g.L), Y(wv)); else ctx.moveTo(X(u * g.L), Y(wv)); }
  ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  // the tongue: thickness h above its downstream face w(x) = y ψ(x)
  ctx.beginPath();
  for (let i = 0; i <= 50; i++) { const u = i / 50, wv = y * phys.modeShape(g.lam[0], u); if (i) ctx.lineTo(X(u * g.L), Y(wv)); else ctx.moveTo(X(u * g.L), Y(wv)); }
  for (let i = 50; i >= 0; i--) { const u = i / 50, wv = y * phys.modeShape(g.lam[0], u) - g.h; ctx.lineTo(X(u * g.L), Y(wv)); }
  ctx.closePath(); ctx.fillStyle = '#d9a441'; ctx.fill();
  if (g.mu > 0) { const r = Math.max(2, 0.04 * g.L * s); ctx.fillStyle = '#b8862e'; ctx.fillRect(X(g.L) - 2 * r, Y(y - g.h) - r, 2 * r, r); }
  // the rivet
  ctx.fillStyle = '#8a8f9c'; ctx.fillRect(X(-0.1 * g.L), Y(-g.h) - 0.05 * g.L * s, X(0.06 * g.L) - X(-0.1 * g.L), 0.05 * g.L * s);
  // the jet through the gap at the tip
  if (fr) {
    const Umax = Math.max(1e-9, ...fr.U.map(Math.abs)), q = Math.max(-1, Math.min(1, U / Umax));
    const xt = X(g.L + g.delta * 0.5), yt = Y(Math.max(y, 0) + 0.5 * g.e + 0.3 * g.h);
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1 + 3 * Math.abs(q); ctx.globalAlpha = 0.25 + 0.75 * Math.abs(q);
    const len = 0.12 * g.L * s * q;
    ctx.beginPath(); ctx.moveTo(xt + 4, yt); ctx.lineTo(xt + 4 + 0.6 * Math.abs(len), yt + len); ctx.stroke();
    ctx.lineWidth = 1; ctx.globalAlpha = 1;
  }
  // the open area, as a bar against the area at the set
  const Aset = areaAt(model.table, -g.y0, {}).A, Amin = areaAt(model.table, 0.5 * g.e, {}).A;
  const bh = h - 34, by = 18, frac = Math.min(1, A / (2 * Aset));
  ctx.strokeStyle = css('--grid'); ctx.strokeRect(w - barW - 6 + 0.5, by + 0.5, barW, bh);
  ctx.fillStyle = css('--accent'); ctx.fillRect(w - barW - 6, by + bh * (1 - frac), barW, bh * frac);
  ctx.strokeStyle = css('--muted'); ctx.setLineDash([2, 2]);
  for (const a of [Aset, Amin]) { const yy = by + bh * (1 - Math.min(1, a / (2 * Aset))); ctx.beginPath(); ctx.moveTo(w - barW - 8, yy); ctx.lineTo(w - 4, yy); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.fillStyle = css('--text'); ctx.textAlign = 'right';
  ctx.fillText(`${(A * 1e6).toFixed(1)} mm²`, w - 2, by + bh + 12);
  ctx.fillStyle = css('--muted'); ctx.fillText('open', w - 2, by - 4);
  ctx.textAlign = 'left';
  if (fr) {
    const f = live ? live.f[shown] : 0, T = (fr.per.b - fr.per.a) * fr.dt;
    ctx.fillText(`${f ? f.toFixed(1) : (1 / T).toFixed(1)} Hz, shown ${(2 / T).toFixed(0)}× slower · tip ${(y * 1e3).toFixed(2)} mm`, x0, 12);
  } else ctx.fillText('at rest: play a key', x0, 12);
}, scv);

// ---- view 2: flow against displacement --------------------------------------------------------
const lcv = $('#loop');
animate(() => {
  const { ctx, w, h } = fit(lcv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  if (!model) return;
  const g = model.geo, fr = frozen && msg && msg.key === focus ? frozen : null;
  const P = fr ? fr.P : shell.P.pressure, xq = Math.sqrt((2 * Math.max(P, 0)) / AIR.rho);
  let yLo = -g.y0 - 0.1 * g.L, yHi = g.e + g.h + 0.1 * g.L;
  if (fr) for (let i = 0; i < fr.y.length; i++) { yLo = Math.min(yLo, fr.y[i]); yHi = Math.max(yHi, fr.y[i]); }
  const pad = 0.05 * (yHi - yLo); yLo -= pad; yHi += pad;
  const q = { A: 0, dA: 0 }, qs = (yv) => CD * areaAt(model.table, yv, q).A * xq;
  let uMax = 1e-9, uMin = 0;
  for (let i = 0; i <= 100; i++) uMax = Math.max(uMax, qs(yLo + ((yHi - yLo) * i) / 100));
  if (fr) for (const u of fr.U) { uMax = Math.max(uMax, u); uMin = Math.min(uMin, u); }
  const uPad = 0.06 * (uMax - uMin); uMax += uPad; uMin -= uMin < 0 ? uPad : 0;
  const padL = 40, padB = 18, padT = 8, padR = 8;
  const X = (yv) => padL + ((yv - yLo) / (yHi - yLo)) * (w - padL - padR), Y = (u) => padT + ((uMax - u) / (uMax - uMin)) * (h - padT - padB);
  // the slot: inside it the gap is only the clearance
  ctx.fillStyle = '#3a3f4a'; ctx.globalAlpha = 0.6; ctx.fillRect(X(0), padT, X(g.e + g.h) - X(0), h - padT - padB); ctx.globalAlpha = 1;
  ctx.fillStyle = css('--muted'); ctx.fillText('in the slot', X(0) + 3, padT + 10);
  // axes
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  const stepMm = [0.1, 0.2, 0.5, 1, 2, 5, 10].find((st) => (yHi - yLo) * 1e3 / st < 8) || 10;
  for (let v = Math.ceil((yLo * 1e3) / stepMm) * stepMm; v <= yHi * 1e3; v += stepMm) { ctx.beginPath(); ctx.moveTo(X(v / 1e3), padT); ctx.lineTo(X(v / 1e3), h - padB); ctx.stroke(); ctx.fillText(`${+v.toFixed(2)}`, X(v / 1e3), h - 5); }
  ctx.textAlign = 'right';
  const ust = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5].find((st) => ((uMax - uMin) * 1000) / st < 5) || 5;
  for (let v = Math.ceil((uMin * 1000) / ust) * ust; v <= uMax * 1000; v += ust) { const u = v / 1000; ctx.strokeStyle = Math.abs(v) < 1e-9 ? css('--muted') : css('--grid'); ctx.beginPath(); ctx.moveTo(padL, Y(u)); ctx.lineTo(w - padR, Y(u)); ctx.stroke(); ctx.fillText(`${+v.toFixed(2)}`, padL - 4, Y(u) + 3); }
  ctx.save(); ctx.translate(10, h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('flow (L/s)', 0, 0); ctx.restore();
  ctx.textAlign = 'right'; ctx.fillText('tip position (mm) →', w - padR, h - padB - 3); ctx.textAlign = 'left';
  // the set
  ctx.strokeStyle = css('--muted'); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(-g.y0), padT); ctx.lineTo(X(-g.y0), h - padB); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillText('set', X(-g.y0) + 3, h - padB - 14);
  // quasi-steady: c_d A(y) √(2P/ρ)
  ctx.strokeStyle = '#9fb4c8'; ctx.setLineDash([4, 3]); ctx.beginPath();
  for (let i = 0; i <= 160; i++) { const yv = yLo + ((yHi - yLo) * i) / 160; if (i) ctx.lineTo(X(yv), Y(qs(yv))); else ctx.moveTo(X(yv), Y(qs(yv))); }
  ctx.stroke(); ctx.setLineDash([]);
  if (!fr) { ctx.fillStyle = css('--muted'); ctx.fillText('play a key', padL + 6, padT + 24); $('#loop-read').textContent = `at ${P.toFixed(0)} Pa`; return; }
  // the live loop (the last cycles, older fainter), and a dot where view 1 is
  const n = fr.y.length;
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5;
  for (let i = 1; i < n; i++) { ctx.globalAlpha = 0.15 + 0.85 * (i / n); ctx.beginPath(); ctx.moveTo(X(fr.y[i - 1]), Y(fr.U[i - 1])); ctx.lineTo(X(fr.y[i]), Y(fr.U[i])); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
  const { a, b } = fr.per, u = a + (((performance.now() / 1000) % 2) / 2) * (b - a);
  ctx.fillStyle = css('--text'); ctx.beginPath(); ctx.arc(X(lerp(fr.y, u)), Y(lerp(fr.U, u)), 3.5, 0, 2 * Math.PI); ctx.fill();
  let lo = Infinity, hi = -Infinity;
  for (let i = Math.floor(a); i <= Math.ceil(b); i++) { lo = Math.min(lo, fr.y[i]); hi = Math.max(hi, fr.y[i]); }
  $('#loop-read').textContent = `at ${P.toFixed(0)} Pa · swing ${((hi - lo) * 500).toFixed(2)} mm (${((hi - lo) / 2 / g.L * 100).toFixed(0)} % of the length)`;
}, lcv);

// ---- view 3: the musette's beats -------------------------------------------------------------------
function smoothed(win, t0) { // oldest first: running rms of the block rms values over `win` blocks
  const N = envHist.t.length, n = Math.min(envHist.n, N), t = [], v = [];
  let first = n;
  for (let k = 0; k < n; k++) { const i = (envHist.n - 1 - k) % N; if (envHist.t[i] < t0) break; first = k; }
  let acc = 0;
  const q = [];
  for (let k = first; k >= 0; k--) {
    const i = (envHist.n - 1 - k) % N, e2 = envHist.v[i] * envHist.v[i];
    q.push(e2); acc += e2;
    if (q.length > win) acc -= q.shift();
    t.push(envHist.t[i]); v.push(Math.sqrt(Math.max(0, acc) / q.length));
  }
  return { t, v };
}
const bcv = $('#beats');
animate(() => {
  const { ctx, w, h } = fit(bcv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  const padL = 8, padR = 8, padT = 8, padB = 16, N = envHist.t.length, n = Math.min(envHist.n, N);
  const tEnd = clock, t0 = tEnd - BEAT_SEC;
  const X = (t) => padL + ((t - t0) / BEAT_SEC) * (w - padL - padR);
  // the block rms, smoothed over about one period of the note (at least 12 ms)
  const m0 = msg && msg.key === focus ? msg : null, fNote = m0 && m0.f[shown] ? m0.f[shown] : model ? model.fSound : 262;
  const dtE = m0 ? m0.dtEnv : 128 / 48000, win = Math.max(1, Math.round(Math.max(1.5 / fNote, 0.012) / dtE));
  const sm = smoothed(win, t0);
  let vmax = 1e-6;
  for (const v of sm.v) vmax = Math.max(vmax, v);
  const Y = (v) => h - padB - (v / vmax) * (h - padT - padB);
  ctx.strokeStyle = css('--grid');
  ctx.beginPath(); ctx.moveTo(padL, h - padB); ctx.lineTo(w - padR, h - padB); ctx.stroke();
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  for (let s = 0; s <= BEAT_SEC; s++) ctx.fillText(`${s - BEAT_SEC} s`, X(t0 + s), h - 3);
  ctx.textAlign = 'left';
  ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.8; ctx.beginPath();
  let tMaxAt = tEnd, vm = -1;
  if (sm.t.length) {
    ctx.moveTo(X(sm.t[0]), h - padB);
    for (let k = 0; k < sm.t.length; k++) {
      ctx.lineTo(X(sm.t[k]), Y(sm.v[k]));
      if (sm.t[k] > tEnd - 1.5 && sm.v[k] > vm) { vm = sm.v[k]; tMaxAt = sm.t[k]; }
    }
    ctx.lineTo(X(sm.t[sm.t.length - 1]), h - padB); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // the musette: reeds of the focused key and their predicted beats
  const m = msg && msg.key === focus ? msg : null;
  const f = m ? [1, 2, 3].map((r) => ({ r, f: m.f[r] })).filter((x) => x.f > 0) : [];
  if (f.length >= 2) {
    const beats = [];
    for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) beats.push(Math.abs(f[i].f - f[j].f));
    beats.sort((a, b) => a - b);
    const fb = beats[0];
    if (fb > 0.05) {
      // the predicted beat period, from the loudest swell of the last 1.5 s
      ctx.strokeStyle = css('--accent-2'); ctx.globalAlpha = 0.95; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      const tick = (t) => { ctx.beginPath(); ctx.moveTo(X(t), padT); ctx.lineTo(X(t), h - padB); ctx.stroke(); };
      const tFirst = sm.t.length ? Math.max(t0, sm.t[0]) : t0;
      for (let t = tMaxAt; t > tFirst; t -= 1 / fb) tick(t);
      for (let t = tMaxAt + 1 / fb; t < tEnd; t += 1 / fb) tick(t);
      ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }
    $('#beat-read').textContent = `beats ${beats.map((b) => b.toFixed(2)).join(', ')} per second`;
    $('#beat-info').innerHTML = f.map((x) => `<span style="color:${RANK_COL[x.r]}">${RANKS[x.r].name} ${x.f.toFixed(2)} Hz</span>`).join(' · ');
  } else {
    $('#beat-read').textContent = shell.P.musette === 'off' ? 'musette off: one reed, no beats' : 'play a key';
    $('#beat-info').innerHTML = m && m.f[1] ? `<span>8′ ${m.f[1].toFixed(2)} Hz</span>` : '';
  }
}, bcv);

// ---- view 4: the wind ------------------------------------------------------------------------------
const wcv = $('#wind');
animate(() => {
  const { ctx, w, h } = fit(wcv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  const padL = 40, padR = 36, padT = 8, padB = 16, N = windHist.t.length, n = Math.min(windHist.n, N);
  const tEnd = clock, t0 = tEnd - WIND_SEC;
  const X = (t) => padL + ((t - t0) / WIND_SEC) * (w - padL - padR);
  let pMax = Math.max(shell.P.pressure * 1.25, thr ? thr.P * 1.2 : 0, 200), uMax = 1e-3;
  for (let k = 0; k < n; k++) { const i = (windHist.n - 1 - k) % N; if (windHist.t[i] < t0) break; pMax = Math.max(pMax, windHist.P[i] * 1.1, windHist.E[i] * 1.1); uMax = Math.max(uMax, windHist.U[i] * 1.2); }
  const Y = (p) => h - padB - (p / pMax) * (h - padT - padB), YU = (u) => h - padB - (u / uMax) * (h - padT - padB);
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  const st = [100, 200, 250, 500, 1000].find((s) => pMax / s < 6) || 1000;
  for (let p = 0; p <= pMax; p += st) { ctx.beginPath(); ctx.moveTo(padL, Y(p)); ctx.lineTo(w - padR, Y(p)); ctx.stroke(); ctx.fillText(`${p}`, padL - 4, Y(p) + 3); }
  ctx.save(); ctx.translate(9, h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('Pa', 0, 0); ctx.restore();
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffd27a'; ctx.fillText(`${(uMax * 1000).toFixed(1)} L/s`, w - padR + 3, padT + 8);
  ctx.textAlign = 'center'; ctx.fillStyle = css('--muted');
  for (let s = 0; s <= WIND_SEC; s += 2) ctx.fillText(`${s - WIND_SEC} s`, X(t0 + s), h - 3);
  ctx.textAlign = 'left';
  const line = (arr, Yf, col, dash = []) => {
    ctx.strokeStyle = col; ctx.setLineDash(dash); ctx.beginPath();
    let started = false;
    for (let k = n - 1; k >= 0; k--) { const i = (windHist.n - 1 - k) % N; const t = windHist.t[i]; if (t < t0) continue; if (started) ctx.lineTo(X(t), Yf(arr[i])); else { ctx.moveTo(X(t), Yf(arr[i])); started = true; } }
    ctx.stroke(); ctx.setLineDash([]);
  };
  line(windHist.U, YU, '#ffd27a');
  line(windHist.E, Y, '#9fb4c8', [4, 3]);
  ctx.lineWidth = 1.8; line(windHist.P, Y, css('--accent')); ctx.lineWidth = 1;
  if (thr) {
    ctx.strokeStyle = '#ff6b6b'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(padL, Y(thr.P)); ctx.lineTo(w - padR, Y(thr.P)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ff6b6b'; ctx.fillText(`${noteName(focus)} ${RANKS[shown].name} starts above ${thr.P.toFixed(0)} Pa`, padL + 4, Y(thr.P) - 3);
  }
}, wcv);

updateModel();
