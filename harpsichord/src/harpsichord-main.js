// harpsichord-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName, useWasm } from '../../shared/shell.js';
import { fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './harpsichord-instrument.js';
import * as jsModel from './harpsichord-model.js';
import { KEY_LO, KEY_HI, ROWS, jackSpeed, t60, ACTION } from './harpsichord-model.js';
import { beamC, beamG } from './plectrum.js';
import { wasmModel } from './harpsichord-wasm.js';

// The views draw what the engine plays: the WebAssembly model once it has loaded (the same
// physics as the engine, in C++), the JavaScript one until then or if it can't load.
let model = { ...jsModel, beamC, beamG };
if (useWasm()) wasmModel().then((m) => { model = m; update(); runSim(); }, (err) => console.warn(`harpsichord: the WebAssembly model did not load (${err.message}); the views use the JavaScript one`));

const $ = (s) => document.querySelector(s);
const ROW_COL = { front: '#f4d39b', back: '#c98b5a', four: '#7cc8ff', lute: '#ff8fa3' };
const ROW_NAME = { front: 'front 8′', back: 'back 8′', four: '4′', lute: 'lute' };
let focus = 60, vel = 0.7, analyser = null, fft = null, sim = null, simT0 = 0, engineInfo = null, simTimer = 0, combState = null;

const shell = createShell({
  ...INSTRUMENT,
  base: 48,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => { analyser = a.analyser; fft = new Float32Array(analyser.frequencyBinCount); },
  onNoteOn: (key, v) => { focus = key; vel = v; shell.keys.focus(key); engineInfo = null; update(); runSim(); },
  onParam: () => { update(); clearTimeout(simTimer); simTimer = setTimeout(runSim, 120); },
  onMessage: (m) => {
    // the engine's own release, for the row the slow-motion view shows
    const row = shownRow();
    if (m.type === 'pluck' && row && m.key === focus && m.choir === ROWS[row].string && m.lute === (row === 'lute')) engineInfo = m;
  },
});

// The row whose pluck the slow-motion view shows: the first one that plucks this key.
const shownRow = () => model.registration(shell.P).rows[0] || null;

// ---- the slow-motion pluck: the model's own pluck, offline --------------------------------
function runSim() {
  const row = shownRow();
  if (!row) { sim = null; $('#pluck-info').textContent = 'No row plucks on this manual: engage a register.'; return; }
  const r = model.simulatePluck(focus, row, shell.P, { V: jackSpeed(vel), sec: 0.25, every: 2, until: 0.004 });
  sim = { ...r, row, V: jackSpeed(vel) };
  simT0 = performance.now() / 1000;
  const rel = r.rel, i0 = r.trace.F.findIndex((f) => f > 0);
  const tTouch = i0 >= 0 ? r.trace.t[i0] : 0;
  $('#pluck-key').textContent = noteName(focus);
  $('#pluck-read').textContent = `${ROW_NAME[row]} · jack ${(100 * sim.V).toFixed(0)} cm/s`;
  $('#pluck-info').innerHTML = rel
    ? [`<span>lets go after ${((r.released - tTouch) * 1000).toFixed(1)} ms</span>`, `<span>F = ${rel.F.toFixed(2)} N</span>`, `<span>string up ${(rel.u * 1e3).toFixed(2)} mm</span>`,
      `<span>plectrum bent ${(rel.w * 1e3).toFixed(2)} mm, ${(rel.theta * 180 / Math.PI).toFixed(0)}° at the string</span>`, `<span>slid ${((rel.s - r.pl.s0) * 1e3).toFixed(2)} mm to the tip</span>`,
      `<span>energy ${(r.st.energy() * 1e3).toFixed(2)} mJ</span>`].join(' · ')
    : 'the plectrum did not let go';
}

const pcv = $('#pluck');
animate(() => {
  const { ctx, w, h } = fit(pcv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  if (!sim) { ctx.fillStyle = css('--muted'); ctx.fillText('play a key', 12, 18); return; }
  const tr = sim.trace, n = tr.t.length, T = tr.t[n - 1] - tr.t[0];
  // play the pluck over ~3 s, hold 1 s, loop
  const play = 3, hold = 1, ph = ((performance.now() / 1000 - simT0) % (play + hold)) / play;
  const k = Math.min(n - 1, Math.max(0, Math.floor(Math.min(1, ph) * (n - 1))));
  const pl = sim.pl, len = pl.len, d = sim.S.d;
  // layout: the scene on the left and the time plot on the right (wide), or stacked
  const wide = w > 1.5 * h, sceneW = wide ? Math.min(w * 0.5, h * 1.25) : w, sceneH = wide ? h : Math.max(40, h * 0.6);
  // geometry: z (along the plectrum) → x, height → y; 1 mm = s px
  const zMin = -1.6e-3, zMax = len + 1.4e-3, yMin = -1.8e-3, yMax = 5.2e-3;
  const s = Math.min((sceneW - 20) / (zMax - zMin), (sceneH - 12) / (yMax - yMin));
  const ox = 10 + (sceneW - 20 - s * (zMax - zMin)) / 2;
  const X = (z) => ox + (z - zMin) * s, Y = (y) => 6 + (yMax - y) * s;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, sceneW, sceneH); ctx.clip(); // the scene stays in its own area
  // string rest level
  ctx.strokeStyle = css('--muted'); ctx.globalAlpha = 0.5; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(X(zMin), Y(0)); ctx.lineTo(X(zMax), Y(0)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  // jack and tongue (to the left of the plectrum's root)
  const yj = tr.y[k], F = tr.F[k], sC = tr.s[k];
  ctx.fillStyle = '#3a3226'; ctx.strokeStyle = '#6b5a40';
  ctx.fillRect(X(zMin), Y(yj + 3e-3), X(0) - X(zMin), Y(yj - 6e-3) - Y(yj + 3e-3));
  ctx.strokeRect(X(zMin) + 0.5, Y(yj + 3e-3) + 0.5, X(0) - X(zMin) - 1, Y(yj - 6e-3) - Y(yj + 3e-3) - 1);
  ctx.fillStyle = css('--muted'); ctx.save(); ctx.translate(X(zMin) + 11, Y(yj - 1e-3)); ctx.rotate(-Math.PI / 2); ctx.fillText('jack', 0, 0); ctx.restore();
  // the plectrum, bent by F at s: a cubic up to s (deflection F c(s), slope F g(s)), straight beyond
  const ws = F * model.beamC(pl, sC), th = F * model.beamG(pl, sC), th2 = ACTION.thick;
  const defl = (z) => {
    if (F <= 0) return 0;
    if (z >= sC) return ws + th * (z - sC);
    const u = z / sC, a = 3 * ws - th * sC, b = th * sC - 2 * ws; // Hermite with w(0) = w'(0) = 0
    return a * u * u + b * u * u * u;
  };
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) { const z = (len * i) / 40; const y = yj - defl(z); if (i) ctx.lineTo(X(z), Y(y)); else ctx.moveTo(X(z), Y(y)); }
  for (let i = 40; i >= 0; i--) { const z = (len * i) / 40; const y = yj - defl(z) - th2 * (1 - 0.15 * (pl.tau || 0) * (z / len)); ctx.lineTo(X(z), Y(y)); }
  ctx.closePath(); ctx.fillStyle = sim.row === 'four' ? '#7cc8ff' : css('--accent'); ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = css('--muted'); ctx.fillText(`${pl.material === 'quill' ? 'quill' : 'Delrin'} plectrum, ℓ = ${(len * 1e3).toFixed(1)} mm`, X(0) + 4, sceneH - 4);
  // the string: a circle of its diameter (×1), at its height and sideways position
  const relI = sim.released !== null ? Math.round((sim.released - tr.t[0]) / (tr.t[1] - tr.t[0])) : n;
  const zS = k < relI ? tr.z[k] : pl.s0 + (tr.z[Math.max(0, relI - 1)] - pl.s0) * Math.exp(-(k - relI) / 6);
  const uS = tr.u[k], rS = Math.max(2.5, (d / 2) * s);
  ctx.fillStyle = sim.S.mat.name === 'brass' ? '#d9a441' : '#9fb4c8';
  ctx.beginPath(); ctx.arc(X(zS), Y(uS + d / 2), rS, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = css('--text');
  ctx.fillText(`${sim.S.mat.name} string, ${(d * 1e3).toFixed(2)} mm`, Math.min(X(zS) + rS + 4, w - 110), Y(uS + d / 2) - rS - 2);
  if (F > 0) { // the force on the string, as an arrow
    const a = Math.min(40, 14 * F);
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(zS), Y(uS) + 2); ctx.lineTo(X(zS), Y(uS) + 2 + a); ctx.stroke(); ctx.lineWidth = 1;
  }
  ctx.restore();
  // time plot: force (N) and string height (mm)
  const plotY0 = wide ? 22 : sceneH + 8, ph2 = wide ? h - 40 : h - plotY0 - 14;
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  ctx.fillText(`${((tr.t[k] - tr.t[0]) * 1000).toFixed(1)} of ${(T * 1000).toFixed(1)} ms (${(play / Math.max(T, 1e-4)).toFixed(0)}× slower)`, w - 8, 12);
  ctx.textAlign = 'left';
  if (ph2 > 20) {
    const x0 = wide ? sceneW + 14 : 34, x1 = w - 8, tX = (t) => x0 + ((t - tr.t[0]) / Math.max(T, 1e-6)) * (x1 - x0);
    let Fm = 0.5, Um = 1e-3;
    for (let i = 0; i < n; i++) { Fm = Math.max(Fm, tr.F[i]); Um = Math.max(Um, Math.abs(tr.u[i])); }
    const yF = (f) => plotY0 + ph2 - (f / Fm) * ph2 * 0.9, yU = (u) => plotY0 + ph2 / 2 - (u / Um) * ph2 * 0.45;
    ctx.strokeStyle = css('--grid'); ctx.strokeRect(x0 + 0.5, plotY0 + 0.5, x1 - x0, ph2);
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < n; i++) { const X1 = tX(tr.t[i]), Y1 = yF(tr.F[i]); if (i) ctx.lineTo(X1, Y1); else ctx.moveTo(X1, Y1); }
    ctx.stroke();
    ctx.strokeStyle = '#9fb4c8'; ctx.beginPath();
    for (let i = 0; i < n; i++) { const X1 = tX(tr.t[i]), Y1 = yU(tr.u[i]); if (i) ctx.lineTo(X1, Y1); else ctx.moveTo(X1, Y1); }
    ctx.stroke(); ctx.lineWidth = 1;
    if (sim.released !== null) { ctx.strokeStyle = css('--muted'); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(tX(sim.released), plotY0); ctx.lineTo(tX(sim.released), plotY0 + ph2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.strokeStyle = css('--text'); ctx.beginPath(); ctx.moveTo(tX(tr.t[k]), plotY0); ctx.lineTo(tX(tr.t[k]), plotY0 + ph2); ctx.stroke();
    ctx.fillStyle = css('--accent'); ctx.fillText(`F ≤ ${Fm.toFixed(1)} N`, x0 + 4, plotY0 + 11);
    ctx.fillStyle = '#9fb4c8'; ctx.fillText(`string height (±${(Um * 1e3).toFixed(1)} mm)`, x0 + 74, plotY0 + 11);
    ctx.fillStyle = css('--muted'); ctx.fillText('jack rising →', x0 + 4, plotY0 + ph2 - 4);
    if (engineInfo) { ctx.textAlign = 'right'; ctx.fillText(`engine: ${engineInfo.F.toFixed(2)} N, ${(engineInfo.u * 1e3).toFixed(2)} mm`, x1 - 4, plotY0 + ph2 - 4); ctx.textAlign = 'left'; }
  }
}, pcv);

// ---- the scale -----------------------------------------------------------------------------
const scv = $('#scale');
let scaleRows = [];
function update() {
  const P = shell.P, reg = model.registration(P);
  scaleRows = [];
  for (let m = KEY_LO; m <= KEY_HI; m++) {
    const e = model.stringDesign(m, 'back', P), f = model.stringDesign(m, 'four', P);
    scaleRows.push({ m, L8: e.L, L4: f.L, B8: e.B, B4: f.B, brass8: model.isBrass(m, 'back'), brass4: model.isBrass(m, 'four'), x: { front: model.pluckPoint(m, 'front', P), back: model.pluckPoint(m, 'back', P), four: model.pluckPoint(m, 'four', P), lute: model.pluckPoint(m, 'lute', P) } });
  }
  const S = model.stringDesign(focus, 'back', P), parts = model.stringPartials(S, P).partials;
  $('#scale-read').textContent = `${noteName(focus)} 8′: ${(S.L * 1000).toFixed(0)} mm ${S.mat.name} ⌀${(S.d * 1000).toFixed(2)} · ${S.T.toFixed(0)} N · B ${S.B.toExponential(1)} · T₆₀ ${t60(parts[0].sigma).toFixed(1)} s`;
  $('#scale-read').title = `${noteName(focus)}, back 8′ string: length, wire, tension (stress ${(S.stress / 1e9).toFixed(2)} GPa), inharmonicity, and its fundamental's decay time`;
  combState = { reg, P };
}
animate(() => {
  const { ctx, w, h } = fit(scv);
  ctx.clearRect(0, 0, w, h);
  if (!scaleRows.length) return;
  const x0 = 34, x1 = w - 40, y0 = 8, y1 = h - 18;
  const X = (m) => x0 + ((m - KEY_LO) / (KEY_HI - KEY_LO)) * (x1 - x0);
  const lo = Math.log(0.004), hi = Math.log(2.5), Y = (L) => y1 - ((Math.log(L) - lo) / (hi - lo)) * (y1 - y0);
  const bl = Math.log(1e-6), bh = Math.log(2e-3), YB = (B) => y1 - ((Math.log(B) - bl) / (bh - bl)) * (y1 - y0);
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  for (const L of [0.01, 0.03, 0.1, 0.3, 1]) { ctx.beginPath(); ctx.moveTo(x0, Y(L)); ctx.lineTo(x1, Y(L)); ctx.stroke(); ctx.fillText(L >= 1 ? `${L} m` : `${L * 100} cm`, x0 - 3, Y(L) + 3); }
  ctx.textAlign = 'left';
  for (const B of [1e-5, 1e-4, 1e-3]) ctx.fillText(`${B.toExponential(0)}`, x1 + 3, YB(B) + 3);
  ctx.textAlign = 'center';
  for (let m = 36; m <= KEY_HI; m += 12) ctx.fillText(noteName(m), X(m), h - 5);
  ctx.textAlign = 'left';
  // strings, coloured by metal
  for (const [key, bk, w2] of [['L8', 'brass8', 3], ['L4', 'brass4', 2]]) {
    for (let i = 1; i < scaleRows.length; i++) {
      const a = scaleRows[i - 1], b = scaleRows[i];
      ctx.strokeStyle = b[bk] ? '#d9a441' : '#9fb4c8'; ctx.lineWidth = w2;
      ctx.beginPath(); ctx.moveTo(X(a.m), Y(a[key])); ctx.lineTo(X(b.m), Y(b[key])); ctx.stroke();
    }
  }
  ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted'); ctx.fillText('8′', X(KEY_LO) + 2, Y(scaleRows[0].L8) - 5); ctx.fillText('4′', X(KEY_LO) + 2, Y(scaleRows[0].L4) + 12);
  // plucking points (distance from the nut): engaged rows bold
  const rows = combState ? combState.reg.rows : [];
  for (const row of ['front', 'back', 'four', 'lute']) {
    ctx.strokeStyle = ROW_COL[row]; ctx.globalAlpha = rows.includes(row) ? 1 : 0.35; ctx.setLineDash(rows.includes(row) ? [] : [2, 3]);
    ctx.beginPath();
    scaleRows.forEach((r, i) => { const y = Y(r.x[row]); if (i) ctx.lineTo(X(r.m), y); else ctx.moveTo(X(r.m), y); });
    ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  // name each row's curve where they do not collide
  for (const [row, at, dy] of [['front', 0.18, 11], ['back', 0.3, -3], ['four', 0.62, -3], ['lute', 0.3, -3]]) {
    const r = scaleRows[Math.round((scaleRows.length - 1) * at)];
    ctx.fillStyle = ROW_COL[row]; ctx.globalAlpha = rows.includes(row) ? 1 : 0.5; ctx.fillText(ROW_NAME[row], X(r.m) + 2, Y(r.x[row]) + dy);
  }
  ctx.globalAlpha = 1;
  // inharmonicity
  ctx.strokeStyle = '#d8a0ff';
  for (const k of ['B8', 'B4']) { ctx.setLineDash(k === 'B4' ? [3, 3] : []); ctx.beginPath(); scaleRows.forEach((r, i) => { const y = YB(r[k]); if (i) ctx.lineTo(X(r.m), y); else ctx.moveTo(X(r.m), y); }); ctx.stroke(); }
  ctx.setLineDash([]);
  // focus key
  ctx.strokeStyle = css('--text'); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(X(focus), y0); ctx.lineTo(X(focus), y1); ctx.stroke(); ctx.globalAlpha = 1;
}, scv);

// ---- the comb and the live spectrum -----------------------------------------------------
const ccv = $('#comb');
animate(() => {
  const { ctx, w, h } = fit(ccv);
  ctx.clearRect(0, 0, w, h);
  const fLo = 30, fHi = 14000, dbTop = 0, dbRange = 90, padL = 34, padR = 8, padT = 6, padB = 18;
  const X = (f) => padL + ((w - padL - padR) * Math.log(f / fLo)) / Math.log(fHi / fLo);
  const Y = (d) => padT + ((h - padT - padB) * (dbTop - d)) / dbRange;
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { ctx.beginPath(); ctx.moveTo(X(f), padT); ctx.lineTo(X(f), h - padB); ctx.stroke(); ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, X(f), h - 5); }
  ctx.textAlign = 'right';
  for (let d = dbTop; d >= dbTop - dbRange; d -= 30) { ctx.beginPath(); ctx.moveTo(padL, Y(d)); ctx.lineTo(w - padR, Y(d)); ctx.stroke(); ctx.fillText(`${d}`, padL - 4, Y(d) + 3); }
  ctx.textAlign = 'left';
  // live output
  let livePk = -200;
  if (analyser) {
    analyser.getFloatFrequencyData(fft);
    const fs = analyser.context.sampleRate, N = fft.length;
    ctx.beginPath();
    let started = false;
    for (let i = 1; i < N; i++) {
      const f = (i * fs) / (2 * N);
      if (f < fLo || f > fHi) continue;
      const d = Math.max(dbTop - dbRange, Math.min(dbTop, fft[i] + 20));
      if (fft[i] + 20 > livePk) livePk = fft[i] + 20;
      if (started) ctx.lineTo(X(f), Y(d)); else { ctx.moveTo(X(f), Y(d)); started = true; }
    }
    ctx.strokeStyle = css('--text'); ctx.globalAlpha = 0.45; ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (!combState) return;
  const { reg, P } = combState, top = livePk > -80 ? Math.min(-3, livePk) : -12;
  let yLab = padT + 12;
  for (const row of reg.rows) {
    const ch = ROWS[row].string, S = model.stringDesign(focus, ch, P), x = model.pluckPoint(focus, row, P), beta = x / S.L;
    // stems: partial n's bridge force ∝ sin(nπβ)/n (the stiffness cancels: bₙ φₙ(x)/ωₙ² ∝ sin(kₙx)/kₙ)
    const k1 = Math.PI / S.L, col = ROW_COL[row];
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    for (let n = 1; n <= 120; n++) {
      const kn = n * k1, f = Math.sqrt((S.T * kn * kn + S.EI * kn ** 4) / S.mu) / (2 * Math.PI);
      if (f > fHi) break;
      const a = Math.abs(Math.sin(kn * x)) / n, db = top + 20 * Math.log10(a / Math.max(1e-9, Math.abs(Math.sin(k1 * x))) + 1e-9);
      if (db < dbTop - dbRange) continue;
      ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.moveTo(X(f), Y(dbTop - dbRange)); ctx.lineTo(X(f), Y(db)); ctx.stroke();
    }
    // the comb's envelope |sin(πβf/f₁)| f₁/f
    ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.globalAlpha = 0.9; ctx.beginPath();
    const f1 = S.f0 / Math.sqrt(1 + S.B);
    for (let i = 0; i <= 400; i++) {
      const f = fLo * (fHi / fLo) ** (i / 400), u = f / f1;
      const a = Math.abs(Math.sin(Math.PI * beta * u)) / Math.max(u, 1e-3), db = Math.max(dbTop - dbRange, top + 20 * Math.log10(a / Math.abs(Math.sin(Math.PI * beta)) + 1e-9));
      if (i) ctx.lineTo(X(f), Y(db)); else ctx.moveTo(X(f), Y(db));
    }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = col; ctx.textAlign = 'right';
    ctx.fillText(`${ROW_NAME[row]}: β = x/L = ${beta.toFixed(3)} (1/${(1 / beta).toFixed(1)}), notches at ${(f1 / beta).toFixed(0)} Hz × k`, w - padR - 4, yLab);
    ctx.textAlign = 'left'; yLab += 12;
  }
  ctx.fillStyle = css('--muted');
  ctx.fillText(`${noteName(focus)}`, padL + 4, padT + 12);
}, ccv);

update();
runSim();
