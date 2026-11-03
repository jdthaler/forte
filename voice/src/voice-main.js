// voice-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { tunedFreq } from '../../shared/tuning.js';
import { INSTRUMENT } from './voice-instrument.js';
import { VOWEL_NAMES, vowelLabel } from './voice-params.js';
import { wasmModel } from './voice-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'), { fLo: 40, fHi: 12000 });
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 57, state = null, stateAt = 0, cycle = null;

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'vowel', step: 0.25 },
  holdHint: { ms: 400, text: 'Hold the key down: the singer sings as long as it is held.' },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => {
    if (m.type === 'state') { state = m; stateAt = performance.now(); }
    else if (m.type === 'cycle') cycle = m;
  },
  onNoteOn: (key) => { focus = key; shell.keys.focus(key); update(); },
  onParam: () => update(),
});

const live = () => (state && state.key === focus && performance.now() - stateAt < 300 ? state : null);
const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 100 ? 1 : 0)} Hz`);
const SECTIONS = model.SECTIONS;

// The tract the focused key sings through: its vowel and jaw as the engine has them, or as the
// controls would make them.
function tract(P) {
  const st = live(), length = P.length / 100, f = tunedFreq(P, focus);
  const vowel = st ? st.vowel : P.vowel;
  const jaw = st ? st.jaw : P.tuning ? model.jawFor(vowel, P.larynx * 1e-4, f, length) : 0;
  const areas = model.areas(vowel, P.larynx * 1e-4, SECTIONS, jaw);
  return { st, f, length, vowel, jaw, areas, formants: model.formants(areas, length, 4) };
}

let T = null;
function update() {
  const P = shell.P;
  T = tract(P);
  $('#focus-name').textContent = noteName(focus);
  spectrum.set(T.f, T.formants.map((f, i) => ({ f, alpha: 0.9 - 0.15 * i })));
  $('#tract-read').textContent = `${vowelLabel(T.vowel)}${T.jaw > 0.01 ? ` · jaw ${(T.jaw * 100).toFixed(0)} % open` : ''} · ${P.length.toFixed(1)} cm`;
  info();
}

function info() {
  const P = shell.P, st = live(), t = T ?? tract(P);
  const rows = [
    ['note', `${noteName(focus)} · ${fmtHz(t.f)}${st && st.f > 0 ? ` · sung at ${fmtHz(st.f)}` : ''}`],
    ['folds', st ? `tension Q ${st.Q.toFixed(2)} (Ishizaka and Flanagan's folds × ${st.Q.toFixed(2)} stiffer, ÷ ${st.Q.toFixed(2)} lighter) · the glottis ${Math.max(0, Math.min(st.a1, st.a2)).toFixed(1)} mm² open now` : `${P.gap.toFixed(1)} mm² apart at rest, ${(P.thick * 100).toFixed(0)} % thick`],
    ['lungs', st ? `${st.Ps.toFixed(1)} cm H₂O · flow ${st.U.toFixed(0)} cm³/s` : `${P.pressure.toFixed(1)} cm H₂O, more for higher notes and harder keys`],
    ['tract', `${P.length.toFixed(1)} cm, ${vowelLabel(t.vowel)}${t.jaw > 0.01 ? `, the jaw ${(t.jaw * 100).toFixed(0)} % of the way open` : ''}`],
    ['formants', t.formants.map((f, i) => `F${i + 1} ${fmtHz(f)}`).join(' · ')],
  ];
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

// ---- views -----------------------------------------------------------------------
const visible = (cv) => cv.offsetParent !== null;
let infoT = 0;
animate((t) => { if (t - infoT > 250) { infoT = t; if (live()) update(); else if (visible($('#info'))) info(); } });

// One cycle, periodic, read at phase u in [0, 1) (linear between its ten samples).
const at = (a, u) => { const x = u * a.length, i = Math.floor(x) % a.length, j = (i + 1) % a.length, f = x - Math.floor(x); return a[i] + (a[j] - a[i]) * f; };

// The folds in cross-section, slowed down: one cycle every 1.5 s.
animate((t) => {
  const cv = $('#folds');
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, LG = model.LG * 1e3; // mm
  const st = live(), c = st && cycle && cycle.key === focus ? cycle : null;
  const u = (t / 1500) % 1;
  // each mass's edge: half the glottis's width there, mm (shut: 0)
  const half = (x) => Math.max(0, (P.gap + 2 * LG * x) / (2 * LG));
  const x1 = c ? at(c.x1, u) : 0, x2 = c ? at(c.x2, u) : 0;
  const top = c ? Math.max(0.05, ...c.x1.map((x) => half(x)), ...c.x2.map((x) => half(x))) : Math.max(0.05, half(0));
  const acc = css('--accent'), acc2 = css('--accent-2'), grid = css('--grid'), muted = css('--muted'), text = css('--text');
  const flowH = Math.max(20, h * 0.3), foldH = h - flowH - 8;
  const cx = w / 2, scale = Math.min(w * 0.18, 60) / top; // px per mm of opening
  const body = Math.min(w * 0.3, 120);
  // the two masses of each fold: lower (thick) and upper (thin), drawn up the airway
  const yBot = foldH * 0.85, yMid = foldH * 0.85 - foldH * 0.45, yTop = yMid - foldH * 0.12;
  ctx.fillStyle = acc;
  for (const s of [-1, 1]) {
    const e1 = cx + s * half(x1) * scale, e2 = cx + s * half(x2) * scale, wall = cx + s * (half(x1) * scale + body);
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(wall, yBot + 6); ctx.lineTo(e1 + s * 3, yBot); ctx.lineTo(e1, yMid); ctx.lineTo(wall, yMid); ctx.closePath(); ctx.fill();
    ctx.fillStyle = acc2;
    ctx.beginPath(); ctx.moveTo(wall, yMid); ctx.lineTo(e2, yMid); ctx.lineTo(e2 + s * 2, yTop); ctx.lineTo(wall, yTop - 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = acc;
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = muted; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  if (foldH > 60) { ctx.fillText('from the lungs ↑', cx, Math.min(foldH - 2, yBot + 18)); ctx.fillText('↑ to the tract', cx, Math.max(10, yTop - 10)); }
  // the flow over the cycle
  const y0 = h - 4, y1 = h - flowH;
  ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(8, y0); ctx.lineTo(w - 8, y0); ctx.stroke();
  if (c) {
    const Umax = Math.max(1, ...c.U);
    ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const X = 8 + ((w - 16) * i) / 60, Y = y0 - ((y0 - y1) * Math.max(0, at(c.U, (i / 60) % 1))) / Umax; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
    ctx.stroke(); ctx.lineWidth = 1;
    const xm = 8 + (w - 16) * u;
    ctx.strokeStyle = text; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xm, y0); ctx.lineTo(xm, y1); ctx.stroke(); ctx.setLineDash([]);
    const shut = c.x1.filter((x, i) => Math.min(half(x), half(c.x2[i])) <= 0).length / c.x1.length;
    $('#folds-read').textContent = `${fmtHz(st.f || st.fT)} · shut ${(shut * 100).toFixed(0)} % of each cycle · peak flow ${Umax.toFixed(0)} cm³/s`;
  } else {
    ctx.fillStyle = muted; ctx.textAlign = 'center';
    ctx.fillText(st ? 'the folds are not moving: only breath' : 'play a note', cx, (y0 + y1) / 2 + 3);
    $('#folds-read').textContent = '';
  }
}, $('#folds'));

// The tract's profile, and its transfer with the formants and the note's harmonics.
const F_MAX = 5000;
animate(() => {
  const cv = $('#tract');
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  if (!T) return;
  const P = shell.P, acc = css('--accent'), acc2 = css('--accent-2'), grid = css('--grid'), muted = css('--muted');
  const profH = Math.max(30, h * 0.45), x0 = 10, x1 = w - 10, cy = profH / 2 + 2;
  const rMax = Math.sqrt(9e-4 / Math.PI), sy = (profH / 2 - 4) / rMax;
  ctx.fillStyle = acc2; ctx.globalAlpha = 0.75; ctx.beginPath();
  const n = T.areas.length, X = (i) => x0 + ((x1 - x0) * i) / n;
  ctx.moveTo(X(0), cy);
  for (let i = 0; i < n; i++) { const r = Math.sqrt(T.areas[i] / Math.PI) * sy; ctx.lineTo(X(i), cy - r); ctx.lineTo(X(i + 1), cy - r); }
  for (let i = n - 1; i >= 0; i--) { const r = Math.sqrt(T.areas[i] / Math.PI) * sy; ctx.lineTo(X(i + 1), cy + r); ctx.lineTo(X(i), cy + r); }
  ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = muted; ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left'; ctx.fillText('folds', x0, profH - 1);
  ctx.textAlign = 'right'; ctx.fillText('lips', x1, profH - 1);
  // the transfer, |U_lips / U_glottis|, in dB on a linear frequency axis
  const y0 = h - 14, y1 = profH + 8, Xf = (f) => x0 + ((x1 - x0) * f) / F_MAX;
  const db = [];
  for (let i = 0; i <= 200; i++) { const f = 20 + ((F_MAX - 20) * i) / 200; db.push(20 * Math.log10(model.transfer(T.areas, T.length, f))); }
  const top = Math.max(...db), range = 40;
  ctx.strokeStyle = grid; ctx.textAlign = 'center';
  for (let f = 1000; f < F_MAX; f += 1000) { ctx.beginPath(); ctx.moveTo(Xf(f), y1); ctx.lineTo(Xf(f), y0); ctx.stroke(); ctx.fillText(`${f / 1000}k`, Xf(f), h - 3); }
  ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath();
  db.forEach((d, i) => { const f = 20 + ((F_MAX - 20) * i) / 200, Y = y1 + ((y0 - y1) * Math.min(1, (top - d) / range)); if (i) ctx.lineTo(Xf(f), Y); else ctx.moveTo(Xf(f), Y); });
  ctx.stroke(); ctx.lineWidth = 1;
  for (let k = 1; k * T.f < F_MAX && k < 200; k++) { ctx.strokeStyle = muted; ctx.beginPath(); ctx.moveTo(Xf(k * T.f), y0); ctx.lineTo(Xf(k * T.f), y0 - 4); ctx.stroke(); }
  ctx.fillStyle = css('--text');
  T.formants.forEach((f, i) => { if (f < F_MAX) ctx.fillText(`F${i + 1}`, Xf(f), y1 + 10); });
}, $('#tract'));

// The vowel chart: F2 to the left, F1 down, on log axes.
const F1_LO = 200, F1_HI = 1000, F2_LO = 600, F2_HI = 3200;
let pathCache = { key: '', path: [] };
animate(() => {
  const cv = $('#chart');
  if (!visible(cv) || !T) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, pad = 22;
  const X = (f2) => w - pad - ((w - 2 * pad) * Math.log(f2 / F2_LO)) / Math.log(F2_HI / F2_LO);
  const Y = (f1) => pad + ((h - 2 * pad) * Math.log(f1 / F1_LO)) / Math.log(F1_HI / F1_LO);
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (const f of [1000, 2000, 3000]) { ctx.beginPath(); ctx.moveTo(X(f), pad); ctx.lineTo(X(f), h - pad); ctx.stroke(); ctx.fillText(`${f / 1000}k`, X(f), h - 8); }
  for (const f of [300, 500, 700]) { ctx.beginPath(); ctx.moveTo(pad, Y(f)); ctx.lineTo(w - pad, Y(f)); ctx.stroke(); ctx.fillText(`${f}`, pad / 2 + 4, Y(f) + 3); }
  ctx.fillText('F2 →', w / 2, 10);
  // Peterson and Barney's averages
  ctx.font = '13px system-ui, sans-serif';
  model.VOWELS.forEach((v, i) => { ctx.fillText(VOWEL_NAMES[i][1], X(v.F[1]), Y(v.F[0]) + 4); });
  // the mod wheel's path at this length and larynx tube
  const key = `${P.length}|${P.larynx}`;
  if (pathCache.key !== key) {
    const path = [];
    for (let v = 0; v <= 4.0001; v += 0.1) { const F = model.formants(model.areas(v, P.larynx * 1e-4, SECTIONS), P.length / 100, 2); if (F.length === 2) path.push(F); }
    pathCache = { key, path };
  }
  ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 2; ctx.beginPath();
  pathCache.path.forEach(([f1, f2], i) => { if (i) ctx.lineTo(X(f2), Y(f1)); else ctx.moveTo(X(f2), Y(f1)); });
  ctx.stroke(); ctx.lineWidth = 1;
  if (T.formants.length >= 2) {
    ctx.fillStyle = css('--accent');
    ctx.beginPath(); ctx.arc(X(T.formants[1]), Y(T.formants[0]), 5, 0, 2 * Math.PI); ctx.fill();
  }
}, $('#chart'));

update();
