// birdsong-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './birdsong-instrument.js';
import { wasmModel } from './birdsong-wasm.js';
import { tunedFreq } from '../../shared/tuning.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();
const { ALPHA_REST } = model;

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'), { fLo: 25, fHi: 16000 });
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 72, vel = null, state = null, stateAt = 0;
const path = []; // the newest note's recent (tension, α): its gesture

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'rate', step: 0.5 },
  holdHint: { ms: 400, text: 'Hold the key down: the bird sings while its breath lasts.' },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => {
    if (m.type !== 'state') return;
    if (!state || state.key !== m.key) path.length = 0;
    state = m; stateAt = performance.now();
    path.push([m.tension, m.alpha]);
    if (path.length > 40) path.shift();
  },
  onNoteOn: (key, v) => { focus = key; vel = v; shell.keys.focus?.(key); update(); },
  onParam: () => update(),
});

const live = () => (state && state.key === focus && performance.now() - stateAt < 300 ? state : null);
const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 10 ? 2 : 1)} Hz`);

// The note's breath as the engine sets it (birdsong-engine.cpp tune): the drive past the onset for
// its velocity, and the limit cycle there.
let cyc = null, cycKey = '';
function predict(P) {
  const v = Math.min(1, Math.max(0, vel ?? P.velocity));
  const beta = -P.tension, d = P.drive * (0.25 + 0.75 * v), alpha = model.onset(beta) - d;
  const k = `${alpha}|${beta}`;
  if (k !== cycKey) {
    cycKey = k;
    const c = model.cycle(alpha, beta);
    cyc = { ...c, pts: c.ok ? model.cyclePoints(alpha, beta, 240) : [], fixed: model.fixedPoints(alpha, beta) };
  }
  const f = tunedFreq(P, focus), fo = P.track ? f : P.oec;
  return { alpha, beta, d, f, fo, c: cyc };
}

function update() {
  const P = shell.P, { f } = predict(P);
  $('#focus-name').textContent = noteName(focus);
  const markers = [];
  for (let k = 1; k <= 12; k++) markers.push({ f: k * f, alpha: k === 1 ? 0.9 : 0.5 / Math.sqrt(k) });
  if (!P.track) markers.push({ f: P.oec, alpha: 0.4, color: css('--accent-2') });
  spectrum.set(f, markers);
}

const visible = (cv) => cv.offsetParent !== null;

// ---- the pressure–tension plane ------------------------------------------------------
const T_LO = -0.2, T_HI = 1, A_TOP = -0.45, A_BOT = ALPHA_REST + 0.02;
animate(() => {
  const cv = $('#plane');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, { alpha, d } = predict(P), st = live();
  const padL = 34, padR = 10, padT = 10, padB = 30;
  const X = (t) => padL + ((w - padL - padR) * (t - T_LO)) / (T_HI - T_LO);
  const Y = (a) => padT + ((h - padT - padB) * (a - A_TOP)) / (A_BOT - A_TOP);
  const ink = css('--text'), muted = css('--muted'), grid = css('--grid'), acc = css('--accent'), acc2 = css('--accent-2');
  ctx.font = '10px system-ui, sans-serif';
  // the labia swing above the onset line
  ctx.fillStyle = acc; ctx.globalAlpha = 0.08; ctx.beginPath(); ctx.moveTo(X(T_LO), Y(A_TOP));
  for (let i = 0; i <= 120; i++) { const t = T_LO + ((T_HI - T_LO) * i) / 120; ctx.lineTo(X(t), Y(model.onset(-t))); }
  ctx.lineTo(X(T_HI), Y(A_TOP)); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  // axes: α = 0, tension = 0, the rest
  ctx.strokeStyle = grid;
  ctx.beginPath(); ctx.moveTo(X(T_LO), Y(0)); ctx.lineTo(X(T_HI), Y(0)); ctx.moveTo(X(0), Y(A_TOP)); ctx.lineTo(X(0), Y(A_BOT)); ctx.stroke();
  ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(X(T_LO), Y(ALPHA_REST)); ctx.lineTo(X(T_HI), Y(ALPHA_REST)); ctx.stroke(); ctx.setLineDash([]);
  // the onset: saddle-node (dashed) left of tension 1/4, Hopf (solid) right of it
  ctx.lineWidth = 2; ctx.strokeStyle = acc2;
  ctx.setLineDash([6, 4]); ctx.beginPath();
  for (let i = 0; i <= 80; i++) { const t = T_LO + ((0.25 - T_LO) * i) / 80; const y = Y(model.onset(-t)); if (i) ctx.lineTo(X(t), y); else ctx.moveTo(X(t), y); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(X(0.25), Y(0)); ctx.lineTo(X(T_HI), Y(0)); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = acc2; ctx.textAlign = 'right'; ctx.fillText('Hopf', X(T_HI) - 2, Y(0) + 12);
  ctx.textAlign = 'right'; ctx.fillText('saddle-node', X(0.08) - 4, Y(model.onset(-0.08)) + 14);
  ctx.fillStyle = muted; ctx.textAlign = 'left';
  ctx.fillText('at rest', X(T_LO) + 4, Y(ALPHA_REST) - 3);
  ctx.textAlign = 'center'; ctx.fillText('labial tension (−β) →', (X(T_LO) + X(T_HI)) / 2, h - 4);
  ctx.save(); ctx.translate(11, (Y(A_TOP) + Y(A_BOT)) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('pressure (−α) →', 0, 0); ctx.restore();
  for (const t of [0, 0.25, 0.5, 0.75, 1]) ctx.fillText(t.toFixed(2), X(t), h - padB + 12);
  // where the note's breath is headed, and the gesture so far
  ctx.strokeStyle = ink; ctx.beginPath(); ctx.arc(X(P.tension), Y(alpha), 5, 0, 2 * Math.PI); ctx.stroke();
  if (st && path.length) {
    ctx.strokeStyle = acc; ctx.globalAlpha = 0.6; ctx.beginPath();
    path.forEach(([t, a], i) => (i ? ctx.lineTo(X(t), Y(a)) : ctx.moveTo(X(t), Y(a))));
    ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(X(st.tension), Y(st.alpha), 4.5, 0, 2 * Math.PI); ctx.fill();
  }
  const kind = P.tension > 0.25 ? 'Hopf onset: a pure tone grows' : 'saddle-node onset: born at full swing';
  $('#plane-read').textContent = st ? `α ${st.alpha.toFixed(3)} · tension ${st.tension.toFixed(2)} · ${kind}` : `${kind} · drive ${d.toFixed(3)} past it`;
}, $('#plane'));

// ---- the labia's phase portrait --------------------------------------------------------
animate(() => {
  const cv = $('#labia');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, { c, f } = predict(P), st = live();
  const ink = css('--text'), muted = css('--muted'), grid = css('--grid'), acc = css('--accent'), acc2 = css('--accent-2');
  ctx.font = '10px system-ui, sans-serif';
  if (!c.ok) { ctx.fillStyle = muted; ctx.fillText('the labia rest here', 10, 20); return; }
  const xs = [c.xmin, c.xmax, ...c.fixed.filter((x) => Math.abs(x) < 2)];
  const x0 = Math.min(...xs), x1 = Math.max(...xs), mx = 0.12 * (x1 - x0 || 1), vy = 1.15 * Math.max(Math.abs(c.vmin), Math.abs(c.vmax), 1e-3);
  const pad = 14;
  const X = (x) => pad + ((w - 2 * pad) * (x - x0 + mx)) / (x1 - x0 + 2 * mx);
  const Y = (v) => h / 2 - ((h / 2 - pad) * v) / vy;
  ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(w - pad, Y(0)); ctx.stroke();
  ctx.strokeStyle = acc2; ctx.lineWidth = 2; ctx.beginPath();
  c.pts.forEach(([x, v], i) => (i ? ctx.lineTo(X(x), Y(v)) : ctx.moveTo(X(x), Y(v))));
  ctx.closePath(); ctx.stroke(); ctx.lineWidth = 1;
  // the fixed points: crosses
  ctx.strokeStyle = muted;
  for (const x of c.fixed) { const px = X(x), py = Y(0); ctx.beginPath(); ctx.moveTo(px - 4, py - 4); ctx.lineTo(px + 4, py + 4); ctx.moveTo(px + 4, py - 4); ctx.lineTo(px - 4, py + 4); ctx.stroke(); }
  if (st) {
    ctx.fillStyle = acc;
    st.trail.forEach(([x, v], i) => { ctx.globalAlpha = 1 - i / (st.trail.length + 2); ctx.beginPath(); ctx.arc(X(x), Y(v), i ? 3 : 5, 0, 2 * Math.PI); ctx.fill(); });
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.fillText('opening x →', w - pad, h - 4); ctx.textAlign = 'left';
  ctx.fillText('speed ↑', pad + 2, pad + 2);
  ctx.fillStyle = ink;
  $('#labia-read').textContent = `Ω ${c.omega.toFixed(3)} in τ · γ = ${(2 * Math.PI * f / c.omega).toFixed(0)}/s for ${fmtHz(f)}${st ? ` · singing ${fmtHz(st.fSung)}` : ''}`;
}, $('#labia'));

// ---- the vocal tract -------------------------------------------------------------------
const F_LO = 100, F_HI = 20000, DB = 48;
animate(() => {
  const cv = $('#tract');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, { c, f, fo } = predict(P), st = live();
  const L = P.trachea / 100, r = P.reflect, Q = P.q, foNow = P.track && st ? st.fo : fo;
  const H = (x) => model.tracheaGain(x, L, r) * model.oecGain(x, foNow, Q);
  const padL = 30, padR = 8, padT = 8, padB = 18;
  const X = (x) => padL + ((w - padL - padR) * Math.log(x / F_LO)) / Math.log(F_HI / F_LO);
  const Y = (db) => padT + ((h - padT - padB) * -db) / DB;
  const ink = css('--text'), muted = css('--muted'), grid = css('--grid'), acc = css('--accent'), acc2 = css('--accent-2');
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = muted; ctx.textAlign = 'center';
  ctx.strokeStyle = grid;
  for (const g of [200, 500, 1000, 2000, 5000, 10000]) { ctx.beginPath(); ctx.moveTo(X(g), padT); ctx.lineTo(X(g), h - padB); ctx.stroke(); ctx.fillText(g >= 1000 ? `${g / 1000}k` : `${g}`, X(g), h - 5); }
  ctx.textAlign = 'right';
  for (const db of [0, -12, -24, -36]) { ctx.beginPath(); ctx.moveTo(padL, Y(db)); ctx.lineTo(w - padR, Y(db)); ctx.stroke(); ctx.fillText(`${db}`, padL - 3, Y(db) + 3); }
  // the response, normalised to its peak
  const N = 300, resp = [];
  let top = 1e-12;
  for (let i = 0; i <= N; i++) { const x = F_LO * (F_HI / F_LO) ** (i / N), g = H(x); resp.push([x, g]); top = Math.max(top, g); }
  ctx.strokeStyle = acc2; ctx.lineWidth = 2; ctx.beginPath();
  resp.forEach(([x, g], i) => { const y = Y(Math.max(-DB, 20 * Math.log10(g / top))); if (i) ctx.lineTo(X(x), y); else ctx.moveTo(X(x), y); });
  ctx.stroke(); ctx.lineWidth = 1;
  // the trachea's resonances
  ctx.fillStyle = muted; ctx.textAlign = 'center';
  for (let n = 1; n <= 9; n += 2) { const fr = (n * model.C_AIR) / (4 * L); if (fr > F_HI) break; ctx.fillText('▾', X(fr), padT + 8); }
  // the harmonics: the labia's (faint) and out of the beak (bright), each relative to its loudest
  if (c.ok) {
    let c0 = 1e-12, o0 = 1e-12;
    const hs = c.c.map((a, k) => { const fk = (k + 1) * f, o = fk < F_HI ? a * H(fk) : 0; c0 = Math.max(c0, a); o0 = Math.max(o0, o); return [fk, a, o]; });
    for (const [fk, a, o] of hs) {
      if (fk < F_LO || fk > F_HI) continue;
      const px = X(fk);
      ctx.strokeStyle = muted; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(px - 1, h - padB); ctx.lineTo(px - 1, Y(Math.max(-DB, 20 * Math.log10(a / c0)))); ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + 1, h - padB); ctx.lineTo(px + 1, Y(Math.max(-DB, 20 * Math.log10(o / o0)))); ctx.stroke(); ctx.lineWidth = 1;
    }
  }
  ctx.fillStyle = ink; ctx.textAlign = 'left';
  ctx.fillText(`trachea ${P.trachea.toFixed(1)} cm (▾ c/4L = ${fmtHz(model.C_AIR / (4 * L))}) · mouth ${fmtHz(foNow)}${P.track ? ' (on the note)' : ''}`, padL + 4, h - padB - 4);
}, $('#tract'));

update();
