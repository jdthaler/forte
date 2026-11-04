// brass-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { INSTRUMENT } from './brass-instrument.js';
import { wasmModel } from './brass-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const M = await wasmModel();

const $ = (s) => document.querySelector(s);
const LIPS = '#9fe39f';
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 58, plan = null, segs = null, Z = null, state = null, bore = null, trace = null;

const shell = createShell({
  ...INSTRUMENT,
  base: 48,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; update(); },
  onParam: (id) => { if (['horn', 'bellSize', 'plunger', '*', ...TUNING_KEEP].includes(id)) update(); },
  onMessage: (m) => {
    if (m.type === 'state') { state = m; read(); } else if (m.type === 'bore') bore = m; else if (m.type === 'trace') trace = m;
  },
});

const len = (L) => (L >= 1 ? `${L.toFixed(2)} m` : `${(L * 100).toFixed(L < 0.1 ? 1 : 0)} cm`);
const ord = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const short = (h) => ['trombone', 'trumpet', 'flugelhorn'][h] ?? 'horn';
const VALVE_NAMES = (v) => (v ? [1, 2, 3].filter((k) => v & (1 << (k - 1))).join('+') : 'open');
// what the player does for the key: the horn's size, the partial, the slide or the valves
function fingering(p) {
  const size = p.octave ? `, built ${p.octave > 0 ? `${2 ** p.octave}× as big` : `${2 ** -p.octave}× smaller`}` : '';
  const hand = p.horn === 0 ? `slide in ${ord(Math.max(1, Math.round(p.position)))} position` : `valves ${VALVE_NAMES(p.valves)}`;
  return `${short(p.horn)}${size} · ${ord(p.partial)} partial · ${hand}`;
}

// The focused key's plan, its bore and its input impedance; the spectrum's markers.
function update() {
  const P = shell.P;
  plan = M.plan(focus, P);
  segs = M.bore(focus, P);
  const f = plan.f, N = 240, lo = 0.5 * f, hi = 16 * f;
  const z = M.impedance(focus, P, 48000, lo, hi, N, P.plunger);
  Z = { lo, hi, mag: z.mag };
  const H = [];
  for (let n = 1; n * f < 20000 && n <= 32; n++) H.push({ f: n * f, alpha: n === 1 ? 0.9 : 0.3 + 0.5 * Math.exp(-n / 12) });
  spectrum.set(f, H);
  $('#horn-key').textContent = noteName(focus);
  $('#imp-read').textContent = `${noteName(focus)}: ${fingering(plan)} · the lips buzz on peak ${plan.partial}, ${plan.fPeak.toFixed(1)} Hz`;
  read();
}

// The readouts: what the player is doing now (the engine's), or the plan before a note sounds.
function read() {
  const s = state && state.key === focus ? state : null;
  const L = segs ? segs.reduce((a, t) => a + t.len, 0) : 0;
  if (!s) {
    if (plan) $('#horn-read').textContent = `${fingering(plan)} · ${len(L)} of tubing`;
    $('#wave-read').textContent = '';
    return;
  }
  const cents = s.fm > 0 ? 1200 * Math.log2(s.fm / s.f) : NaN;
  $('#horn-read').textContent = `${fingering(s)} · ${len(s.length + s.slide)} of tubing`;
  $('#wave-read').textContent = `breath ${(s.pm / 1000).toFixed(1)} kPa · lips swing ${(s.swing * 1000).toFixed(2)} mm`
    + (Number.isFinite(cents) ? ` · ${s.fm.toFixed(1)} Hz, ${cents >= 0 ? '+' : ''}${cents.toFixed(0)} ¢` : '');
}

// ---- view 1: the horn unrolled, with its waves -------------------------------------------------
const hcv = $('#horn');
animate(() => {
  const { ctx, w, h } = fit(hcv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  if (!segs) return;
  const snap = bore && bore.key === focus ? bore : null, s = state && state.key === focus ? state : null;
  const total = snap ? snap.length : segs.reduce((a, t) => a + t.len, 0);
  const x0 = 12, x1 = w - 12, sx = (x1 - x0) / total, X = (x) => x0 + x * sx;
  // the bore: its radius, magnified to fill the top third
  const rMax = Math.max(...segs.map((t) => t.r)), top = 6, bh = 0.34 * h, yc = top + bh / 2, sr = (0.48 * bh) / rMax;
  // the long, narrow tubes where the wave steepens, shaded
  const xNl = s ? s.xNl : null;
  if (xNl) { ctx.fillStyle = 'rgba(232, 178, 58, 0.08)'; ctx.fillRect(X(0), top, X(xNl) - X(0), h - top); }
  ctx.fillStyle = 'rgba(232, 178, 58, 0.28)'; ctx.strokeStyle = css('--accent');
  // (stretched to the snapshot's length: the slide where the ear has put it)
  const k = total / Math.max(1e-9, segs.reduce((a, t) => a + t.len, 0)), edge = [];
  let x = 0;
  for (const t of segs) { edge.push([x, t.r]); x += k * t.len; edge.push([x, t.r]); }
  ctx.beginPath();
  edge.forEach(([u, r], i) => (i ? ctx.lineTo(X(u), yc - r * sr) : ctx.moveTo(X(u), yc - r * sr)));
  for (let i = edge.length - 1; i >= 0; i--) ctx.lineTo(X(edge[i][0]), yc + edge[i][1] * sr);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'left';
  ctx.fillText('mouthpiece', x0, top + bh + 10);
  ctx.textAlign = 'right';
  ctx.fillText(`bell · radius × ${Math.round(sr / sx)}`, x1, top + bh + 10);
  // the waves along it
  const g0 = top + bh + 18, g1 = h - 6, gm = (g0 + g1) / 2, gh = (g1 - g0) / 2;
  ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(x0, gm); ctx.lineTo(x1, gm); ctx.stroke();
  if (!snap) { ctx.fillStyle = css('--muted'); ctx.textAlign = 'center'; ctx.fillText('play a key to see its waves', (x0 + x1) / 2, gm - 4); return; }
  const n = snap.pf.length;
  let pk = 1;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(snap.pf[i]), Math.abs(snap.pb[i]));
  for (const [arr, col] of [[snap.pb, css('--accent-2')], [snap.pf, css('--accent')]]) {
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < n; i++) { const xx = X(((i + 0.5) / n) * total), yy = gm - (gh * arr[i]) / pk; if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
    ctx.stroke();
  }
  ctx.lineWidth = 1; ctx.fillStyle = css('--muted'); ctx.textAlign = 'left';
  ctx.fillText(`±${pk >= 1000 ? `${(pk / 1000).toFixed(1)} kPa` : `${pk.toFixed(0)} Pa`}`, x0, g0 + 8);
}, hcv);

// ---- view 2: the mouthpiece, the lips and the wave reaching the bell --------------------------
const wcv = $('#wave');
animate(() => {
  const { ctx, w, h } = fit(wcv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  const x0 = 8, x1 = w - 8;
  const t = trace && trace.key === focus ? trace : null;
  // three rows: lips, mouthpiece, bell
  const rows = [[t?.h, LIPS, 'lip opening'], [t?.pc, css('--accent-2'), 'mouthpiece'], [t?.pin, css('--accent'), 'into the bell']];
  const rh = h / 3;
  rows.forEach(([arr, col, label], r) => {
    const yc = rh * (r + 0.5), A = 0.42 * rh;
    ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(x1, yc); ctx.stroke();
    ctx.fillStyle = css('--muted'); ctx.textAlign = 'left'; ctx.fillText(label, x0, rh * r + 10);
    if (!arr) return;
    const n = arr.length;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { lo = Math.min(lo, arr[i]); hi = Math.max(hi, arr[i]); }
    // the lips' opening from shut (0) up; the pressures about zero
    const mid = r === 0 ? (Math.max(0, lo) + hi) / 2 : 0, half = r === 0 ? Math.max(1e-9, (hi - Math.max(0, lo)) / 2) : Math.max(1, Math.abs(lo), Math.abs(hi));
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < n; i++) { const xx = x0 + (i / (n - 1)) * (x1 - x0), yy = yc - (A * (arr[i] - mid)) / half; if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
    ctx.stroke(); ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.fillText(r === 0 ? `${(hi * 1000).toFixed(2)} mm` : `${lo.toFixed(0)} to ${hi.toFixed(0)} Pa`, x1, rh * r + 10);
  });
  if (!t) { ctx.fillStyle = css('--muted'); ctx.textAlign = 'center'; ctx.fillText('play a key', w / 2, h / 2 - 12); }
}, wcv);

// ---- view 3: the input impedance, with the note's harmonics ------------------------------------
const icv = $('#imp');
animate(() => {
  const { ctx, w, h } = fit(icv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  if (!Z || !plan) return;
  const x0 = 10, x1 = w - 10, g0 = 8, g1 = h - 16, f = plan.f;
  const lz = Z.mag.map((z) => Math.log10(Math.max(1e-30, z))), zl = Math.min(...lz), zh = Math.max(...lz);
  const X = (fr) => x0 + (Math.log(fr / Z.lo) / Math.log(Z.hi / Z.lo)) * (x1 - x0);
  const Y = (l) => g1 - ((l - zl) / Math.max(1e-6, zh - zl)) * (g1 - g0);
  ctx.strokeStyle = css('--grid');
  for (let n = 1; n * f <= Z.hi; n++) { const xx = X(n * f); ctx.beginPath(); ctx.moveTo(xx, g0); ctx.lineTo(xx, g1); ctx.stroke(); }
  // the peak the lips buzz on
  const xp = X(plan.fPeak);
  ctx.strokeStyle = LIPS; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xp, g0); ctx.lineTo(xp, g1); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5; ctx.beginPath();
  lz.forEach((l, i) => { const xx = x0 + (i / (lz.length - 1)) * (x1 - x0), yy = Y(l); if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); });
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  for (const n of [1, 2, 4, 8, 16]) if (n * f <= Z.hi * 1.001) ctx.fillText(n === 1 ? 'note' : `${n}`, Math.min(x1 - 8, X(n * f)), h - 3);
  ctx.textAlign = 'left'; ctx.fillStyle = LIPS; ctx.fillText('lips', Math.min(xp + 3, x1 - 20), g0 + 8);
}, icv);

update();
