// marimba-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { tuningRatio, TUNING_KEEP } from '../../shared/tuning.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT, TARGETS } from './marimba-instrument.js';
import { wasmModel } from './marimba-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const TAU = 2 * Math.PI;
const EB = [1, 2.7565, 5.4039, 8.9330, 13.3443]; // a slender plain bar's ratios (cos βL cosh βL = 1)
const spectrum = new SpectrumView($('#spectrum'), { fLo: 50, fHi: 20000 });
new SpectrogramView($('#spectrogram'), { spectrum });
let focus = 60, live = null, history = [], etPeak = 0;

// The bars' modal data (a few ms each) is sent with each note, packed by the model, so the audio
// thread never solves a bar. Built ahead, a key at a time, when the page is idle. A bar is cut for
// the instrument, the undercut depth and the keyboard's tuning.
const packed = new Map();
const CUT = ['kind', 'depth', ...TUNING_KEEP];
const cutOf = (P) => CUT.map((id) => P[id]).join('|');
function dataFor(key, P) {
  const id = `${key}|${cutOf(P)}`;
  let d = packed.get(id);
  if (!d) { d = model.voiceData(key, P); if (packed.size > 256) packed.clear(); packed.set(id, d); }
  return d;
}
const noteData = (key, vel, P) => dataFor(key, P);
let warm = null;
function warmUp() {
  clearTimeout(warm);
  const P = { ...shell.P }, cut = cutOf(P), keys = [];
  const [lo, hi] = INSTRUMENT.range;
  for (let k = lo; k <= hi; k++) if (!packed.has(`${k}|${cut}`)) keys.push(k);
  keys.sort((a, b) => Math.abs(a - focus) - Math.abs(b - focus));
  const step = () => {
    const k = keys.shift();
    if (k === undefined || cut !== cutOf(shell.P)) return;
    dataFor(k, P);
    warm = setTimeout(step, 15);
  };
  warm = setTimeout(step, 200);
}

const shell = createShell({
  ...INSTRUMENT,
  noteData,
  base: 60,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { if (key !== focus) history = []; focus = key; shell.keys.focus(key); update(); },
  onParam: (id) => { if (CUT.includes(id) || id === '*') warmUp(); update(); },
  onMessage: (m) => {
    if (m.type !== 'bar') return;
    live = { ...m, amp: Float64Array.from(m.amp), t: performance.now() / 1000 };
    etPeak = Math.max(m.Et, etPeak * 0.995);
    if (m.key === focus) {
      history.push({ t: live.t, Eb: m.Eb, Et: m.Et });
      while (history.length && history[0].t < live.t - 4) history.shift();
    }
  },
});

// ---- the focus key: bar, tube, and the mode table ---------------------------------------------
let B = null, T = null;
const fmtHz = (f) => (f < 1000 ? f.toFixed(1) : f.toFixed(0));
function update() {
  const P = shell.P, targets = TARGETS[P.kind];
  B = model.barModel(P.kind, focus, P.depth, tuningRatio(P, focus)); // cut for the key's tuning, as the engine cuts it
  T = model.tube(B, { gap: P.gap / 1000, detune: P.detune, offset: P.offset });
  const g = B.geom, name = noteName(focus);
  $('#focus-name').textContent = name; $('#bar-key').textContent = name;
  $('#focus-size').textContent = `${(100 * g.L).toFixed(1)} × ${(1000 * g.b).toFixed(0)} × ${(1000 * g.h0).toFixed(1)} mm · ${(1000 * B.mass).toFixed(0)} g`;
  // the strike point's share of each mode, relative to the strongest
  const nx = B.xs.length, u = Math.min(nx - 1 - 1e-9, P.strike * (nx - 1)), j = Math.floor(u), fr = u - j, yb = P.across * (g.b / 2);
  const ex = B.modes.map((m) => Math.abs((m.w[j] * (1 - fr) + m.w[j + 1] * fr) * (m.kind === 'tors' ? yb : 1)));
  const exMax = Math.max(...ex, 1e-12);
  const rows = B.modes.map((m, i) => {
    const sig = m.sigSup + m.sigRad + Math.PI * m.f * P.eta, T60 = 6.91 / sig;
    const target = m.kind === 'bend' && m.n <= targets.length ? targets[m.n - 1] : null, db = 20 * Math.log10(ex[i] / exMax);
    const label = m.kind === 'bend' ? `bending ${m.n}` : `torsion ${m.n}`;
    const plain = m.kind === 'bend' ? EB[m.n - 1].toFixed(2) : '';
    return `<tr class="${target ? 'tuned' : m.kind === 'tors' ? 'tors' : ''}"><td>${label}</td><td>${fmtHz(m.f)}</td><td>${m.ratio.toFixed(3)}</td><td>${target ?? '—'}</td><td>${plain}</td><td>${T60 < 10 ? T60.toFixed(2) : T60.toFixed(1)}</td><td>${db > -60 ? db.toFixed(0) : '—'}</td></tr>`;
  });
  const M = model.malletOf(P), [t1, t2] = T.modes;
  $('#modes').innerHTML = '<tr><th>mode</th><th>f (Hz)</th><th>× f₁</th><th>tuned</th><th>plain bar</th><th>T₆₀ alone (s)</th><th>at strike (dB)</th></tr>' + rows.join('')
    + `<tr><td colspan="7" class="note">${g.cut.d > 0 ? `Cut: ${(2 * g.cut.a * 100).toFixed(1)} cm long, ${(1000 * g.cut.d).toFixed(1)} mm deep at the flat centre (${(1000 * B.hmin).toFixed(1)} mm left), ${(2 * g.cut.c * 100).toFixed(1)} cm of it flat.` : 'No undercut: a plain bar, cut long enough to sound the note.'} `
    + `Cords at ${B.nodes.map((x) => `${(100 * x / g.L).toFixed(1)} %`).join(' and ')}. T₆₀ alone: the bar without its tube (the wood’s friction, the cords, radiation).<br>`
    + `Tube: ${(2000 * T.a).toFixed(0)} mm bore, ${(100 * T.length).toFixed(1)} cm long; its first resonance at ${fmtHz(t1.ft)} Hz (κ = ${t1.kappa.toFixed(4)} with mode 1), its second at ${fmtHz(t2.ft)} Hz (κ = ${t2.kappa.toFixed(4)} with mode 2${P.offset === 0 ? ': the mouth is centred, under mode 2’s node' : ''}). Mallet ${(1000 * M.m).toFixed(0)} g.</td></tr>`;
  const marks = B.modes.map((m) => ({ f: m.f, color: m.kind === 'tors' ? css('--accent-2') : '#e6c15a', alpha: 0.85 }));
  spectrum.set(B.modes[0].f, marks.concat(P.tubes ? [{ f: t1.ft, color: css('--accent'), alpha: 0.6 }, { f: t2.ft, color: css('--accent'), alpha: 0.4 }] : []));
}

// ---- the bar and its modes ----------------------------------------------------------------------
const MODE_COL = ['#e6c15a', '#ef8a5a', '#d860a0'];
const bcv = $('#bar');
animate(() => {
  if (!B) return;
  const { ctx, w, h } = fit(bcv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, g = B.geom, x0 = 18, x1 = w - 18, sx = (x1 - x0) / g.L;
  const fresh = live && live.key === focus;
  // the bar, to scale along its length, thickness ×2
  const ex = Math.min(2 * sx, (0.22 * h) / g.h0), top = 18, X = (x) => x0 + x * sx;
  ctx.beginPath(); ctx.moveTo(X(0), top);
  ctx.lineTo(X(g.L), top);
  for (let i = 200; i >= 0; i--) { const x = (i / 200) * g.L; ctx.lineTo(X(x), top + ex * model.thickness(g.cut, x - g.L / 2)); }
  ctx.closePath();
  const grd = ctx.createLinearGradient(0, top, 0, top + ex * g.h0);
  grd.addColorStop(0, '#a5523a'); grd.addColorStop(1, '#5e2a1e');
  ctx.fillStyle = grd; ctx.fill();
  // the tube's mouth (centred, or moved along the bar)
  const yb = top + ex * g.h0, xc = g.L / 2 + P.offset * g.L;
  ctx.strokeStyle = css('--accent'); ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(X(xc - T.a), yb + 10); ctx.lineTo(X(xc - T.a), yb + 4); ctx.lineTo(X(xc + T.a), yb + 4); ctx.lineTo(X(xc + T.a), yb + 10); ctx.stroke();
  ctx.setLineDash([]);
  // cords, mallet
  ctx.strokeStyle = css('--text'); ctx.lineWidth = 1.5;
  for (const xn of B.nodes) { ctx.beginPath(); ctx.arc(X(xn), top + ex * g.h0 * 0.5, Math.max(2, ex * 0.0015), 0, TAU); ctx.stroke(); }
  ctx.lineWidth = 1;
  const xs = X(P.strike * g.L);
  ctx.fillStyle = css('--accent'); ctx.beginPath(); ctx.moveTo(xs, top - 2); ctx.lineTo(xs - 5, top - 11); ctx.lineTo(xs + 5, top - 11); ctx.closePath(); ctx.fill();
  // modes 1–3, moving with their live amplitudes (slowed: mode n at 0.5·(f_n/f₁)^½ Hz)
  const now = performance.now() / 1000, rowTop = yb + 22, rowH = (h - rowTop - 4) / 3;
  let amax = 1e-12;
  const amps = [0, 1, 2].map((i) => (fresh && live.amp[i] !== undefined ? live.amp[i] * B.modes[i].ratio ** 2 : 0)); // weighted by ω²: what you hear
  for (const a of amps) amax = Math.max(amax, a);
  ctx.font = '10px system-ui, sans-serif';
  for (let i = 0; i < 3; i++) {
    const m = B.modes[i], yc = rowTop + (i + 0.5) * rowH, A = rowH * 0.38, rel = fresh ? amps[i] / amax : 0;
    ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(x1, yc); ctx.stroke();
    let wm = 1e-12; for (const v of m.w) wm = Math.max(wm, Math.abs(v));
    const ph = Math.cos(TAU * 0.5 * Math.sqrt(m.ratio) * now + i), sc = (fresh ? 0.15 + 0.85 * Math.sqrt(rel) : 1) * ph;
    ctx.strokeStyle = MODE_COL[i]; ctx.lineWidth = 2; ctx.globalAlpha = fresh ? 0.35 + 0.65 * Math.sqrt(rel) : 0.8;
    ctx.beginPath();
    for (let k = 0; k < B.xs.length; k++) { const Xp = X(B.xs[k]), Yp = yc - (A * sc * m.w[k]) / wm; if (k) ctx.lineTo(Xp, Yp); else ctx.moveTo(Xp, Yp); }
    ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
    const dB = amps[i] > 0 ? 20 * Math.log10(amps[i] / amax) : -Infinity, dbs = fresh ? (dB > -90 ? ` · ${dB.toFixed(0)} dB` : ' · gone') : '';
    const label = `mode ${i + 1}: ${fmtHz(m.f)} Hz = ${m.ratio.toFixed(3)} × f₁${dbs}`, ly = yc - rowH / 2 + 10;
    ctx.fillStyle = css('--card') || '#1a1a1e'; ctx.globalAlpha = 0.75; ctx.fillRect(x0 + 18, ly - 9, ctx.measureText(label).width + 6, 12); ctx.globalAlpha = 1;
    ctx.fillStyle = css('--muted'); ctx.fillText(label, x0 + 21, ly);
  }
  $('#bar-read').textContent = fresh && live.contactMs ? `mallet contact ${live.contactMs.toFixed(2)} ms, peak force ${live.Fmax.toFixed(0)} N` : `${(100 * g.L).toFixed(1)} cm, ratios ${B.modes[1].ratio.toFixed(2)} : ${B.modes[2].ratio.toFixed(2)}`;
}, bcv);

// ---- the tube, its two resonances, and the energy exchange --------------------------------------
const tcv = $('#tube');
animate(() => {
  if (!B || !T) return;
  const { ctx, w, h } = fit(tcv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, fresh = live && live.key === focus;
  // left: the tube (closed at the bottom), the bar above its mouth; the air's pressure in the
  // first resonance (a quarter wave) and the second (three quarters), slowed down
  const tw = Math.min(70, w * 0.22), tx = 14 + tw * 0.15, ty = 34, th = h - ty - 10;
  const x1 = fresh && P.tubes ? live.X1 : 0, x2 = fresh && P.tubes ? live.X2 : 0, xm = Math.max(x1, x2 * 3, 1e-30);
  const a1 = etPeak > 0 && fresh ? Math.sqrt(live.Et / etPeak) : 0;
  const now = performance.now() / 1000, o1 = Math.cos(TAU * 0.6 * now), o2 = Math.cos(TAU * 1.8 * now);
  const N = 40;
  for (let i = 0; i < N; i++) { // pressure ∝ cos((2m−1)πy/2), y from the closed bottom: a node at the mouth
    const y0 = ty + (i / N) * th, yb = 1 - (i + 0.5) / N;
    const p = a1 * ((x1 / xm) * Math.cos((Math.PI / 2) * yb) * o1 + ((3 * x2) / xm) * Math.cos((3 * Math.PI / 2) * yb) * o2);
    const c = p > 0 ? [95, 208, 200] : [124, 184, 255];
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.06 + 0.85 * Math.min(1, Math.abs(p))).toFixed(3)})`;
    ctx.fillRect(tx, y0, tw, th / N + 0.5);
  }
  ctx.strokeStyle = css('--text'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty + th); ctx.lineTo(tx + tw, ty + th); ctx.lineTo(tx + tw, ty); ctx.stroke();
  ctx.lineWidth = 1;
  const gapPx = Math.max(4, Math.min(24, (P.gap / 1000 / (2 * T.a)) * tw));
  ctx.fillStyle = '#8a4430'; ctx.fillRect(tx - tw * 0.25, ty - gapPx - 6, tw * 1.5, 6);
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`${(100 * T.length).toFixed(1)} cm`, tx + tw / 2, ty + th + 9 > h ? h - 1 : ty + th + 9);
  ctx.textAlign = 'left';
  // right: energy in bar and tube (dB), last 4 s
  const px = tx + tw + 26, pw = w - px - 8, ey = 16, eh = h - ey - 6;
  if (pw > 40 && eh > 16) {
    ctx.strokeStyle = css('--grid'); ctx.strokeRect(px, ey, pw, eh);
    if (history.length > 1) {
      const t1 = history[history.length - 1].t, Emax = Math.max(...history.map((p) => Math.max(p.Eb, p.Et)), 1e-30);
      const Y = (E) => ey + Math.min(eh, (-10 * Math.log10(Math.max(E, 1e-40) / Emax) / 60) * eh);
      for (const [key, col] of [['Eb', css('--accent')], ['Et', css('--accent-2')]]) {
        ctx.strokeStyle = col; ctx.beginPath();
        history.forEach((p, i) => { const X = px + pw * (1 - (t1 - p.t) / 4); if (i) ctx.lineTo(X, Y(p[key])); else ctx.moveTo(X, Y(p[key])); });
        ctx.stroke();
      }
    }
    ctx.fillStyle = css('--muted'); ctx.fillText('energy in bar and tube, last 4 s (60 dB)', px, ey - 5);
  }
  const [m1, m2] = T.modes;
  $('#tube-read').textContent = !P.tubes ? 'tubes off' : `κ ${m1.kappa.toFixed(4)} at ${fmtHz(m1.ft)} Hz · ${m2.kappa.toFixed(4)} at ${fmtHz(m2.ft)} Hz`;
}, tcv);

update();
warmUp();
