// vibraphone-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './vibraphone-instrument.js';
import { EB_RATIOS } from './bar.js';
import { wasmModel } from './vibraphone-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const TAU = 2 * Math.PI;
const [KEY_LO, KEY_HI] = INSTRUMENT.range;
const DAMPER_X = 0.05; // the felt damper bar presses on each bar this far (× L) from its inner end (vibraphone-model.h)
const spectrum = new SpectrumView($('#spectrum'), { fLo: 80, fHi: 20000 });
let focus = 60, live = null, history = [], etPeak = 0;

// The bars' modal data (a few ms each) is sent with each note, packed by the model, so the audio
// thread never solves a bar. Built ahead, a key at a time, when the page is idle.
const packed = new Map();
function dataFor(key, depth) {
  const id = `${key}|${depth}`;
  let d = packed.get(id);
  if (!d) { d = model.voiceData(key, depth); if (packed.size > 256) packed.clear(); packed.set(id, d); }
  return d;
}
const noteData = (key, vel, P) => dataFor(key, P.depth);
let warm = null;
function warmUp() {
  clearTimeout(warm);
  const depth = shell.P.depth, keys = [];
  for (let k = KEY_LO; k <= KEY_HI; k++) if (!packed.has(`${k}|${depth}`)) keys.push(k);
  keys.sort((a, b) => Math.abs(a - focus) - Math.abs(b - focus));
  const step = () => {
    const k = keys.shift();
    if (k === undefined || depth !== shell.P.depth) return;
    dataFor(k, depth);
    warm = setTimeout(step, 15);
  };
  warm = setTimeout(step, 200);
}

const shell = createShell({
  ...INSTRUMENT,
  noteData,
  base: 60, // Z = C4: the instrument starts at F3, so a C3 base left Z–E silent
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { if (key !== focus) history = []; focus = key; shell.keys.focus(key); update(); },
  onParam: (id) => { if (id === 'depth' || id === '*') warmUp(); update(); },
  onMessage: (m) => {
    if (m.type !== 'vibe') return;
    live = { ...m, amp: Float64Array.from(m.amp), t: performance.now() / 1000 };
    etPeak = Math.max(m.Et, etPeak * 0.995);
    if (m.key === focus) {
      history.push({ t: live.t, Eb: m.Eb, Et: m.Et });
      while (history.length && history[0].t < live.t - 4) history.shift();
    }
  },
});

// ---- the focus key: bar, tube, and the mode table ---------------------------------------------
let B = null, TG = null, TS = null;
const fmtHz = (f) => (f < 1000 ? f.toFixed(1) : f.toFixed(0));
function update() {
  const P = shell.P;
  B = model.barModel(focus, P.depth);
  TG = model.tubeGeometry(focus, B);
  TS = model.tubeState(TG, B.modes[0].f, { gap: P.gap / 1000, detune: P.detune, temp: P.temp, cd: P.cd });
  const g = B.geom, ts = model.barTempScale(P.temp), f1 = B.modes[0].f * ts, name = noteName(focus);
  $('#focus-name').textContent = name; $('#bar-key').textContent = name;
  $('#focus-size').textContent = `${(100 * g.L).toFixed(1)} × ${(1000 * g.b).toFixed(0)} × ${(1000 * g.h0).toFixed(1)} mm · ${(1000 * B.mass).toFixed(0)} g`;
  // the strike point's share of each mode, relative to the strongest
  const nx = B.xs.length, u = Math.min(nx - 1 - 1e-9, P.strike * (nx - 1)), j = Math.floor(u), fr = u - j, yb = P.across * (g.b / 2);
  const ex = B.modes.map((m) => Math.abs((m.w[j] * (1 - fr) + m.w[j + 1] * fr) * (m.kind === 'tors' ? yb : 1)));
  const exMax = Math.max(...ex, 1e-12);
  const rows = B.modes.map((m, i) => {
    const sig = m.sigTE + m.sigSup + m.sigRad + Math.PI * m.f * ts * P.eta, T60 = 6.91 / sig;
    const target = m.kind === 'bend' && m.n <= 3 ? [1, 4, 10][m.n - 1] : null, db = 20 * Math.log10(ex[i] / exMax);
    const label = m.kind === 'bend' ? `bending ${m.n}` : `torsion ${m.n}`;
    const plain = m.kind === 'bend' ? EB_RATIOS[m.n - 1].toFixed(2) : '';
    return `<tr class="${target ? 'tuned' : m.kind === 'tors' ? 'tors' : ''}"><td>${label}</td><td>${fmtHz(m.f * ts)}</td><td>${m.ratio.toFixed(3)}</td><td>${target ?? '—'}</td><td>${plain}</td><td>${T60 < 10 ? T60.toFixed(2) : T60.toFixed(1)}</td><td>${db > -60 ? db.toFixed(0) : '—'}</td></tr>`;
  });
  const open = model.coupling(TS, 0, f1), shut = model.coupling(TS, Math.PI / 2, f1), M = model.malletOf(P);
  const rate = P.motor === 'run' ? `${(2 * P.speed).toFixed(1)} Hz (2 openings × ${P.speed.toFixed(2)} rev/s)` : P.motor === 'open' ? 'off, discs open' : 'off, discs closed';
  $('#modes').innerHTML = '<tr><th>mode</th><th>f (Hz)</th><th>× f₁</th><th>tuned</th><th>plain bar</th><th>T₆₀ alone (s)</th><th>at strike (dB)</th></tr>' + rows.join('')
    + `<tr><td colspan="7" class="note">${g.cut.d > 0 ? `Cut: ${(2 * g.cut.a * 100).toFixed(1)} cm long, ${(1000 * g.cut.d).toFixed(1)} mm deep at the flat centre (${(1000 * B.hmin).toFixed(1)} mm left), ${(2 * g.cut.c * 100).toFixed(1)} cm of it flat.` : 'No undercut: a plain bar, cut long enough to sound the note.'} `
    + `Cords at ${B.nodes.map((x) => `${(100 * x / g.L).toFixed(1)} %`).join(' and ')}. T₆₀ alone: the bar without its tube (internal friction, cords, heat flow, radiation).<br>`
    + `Tube: ${(2000 * TG.a).toFixed(0)} mm bore, ${(100 * TS.length).toFixed(1)} cm long; coupling κ = ${open.kappa.toFixed(4)} with the disc open (pitch ${fmtHz(open.ft)} Hz), ${shut.kappa.toFixed(4)} closed (${fmtHz(shut.ft)} Hz). Tremolo: ${rate}. Mallet ${(1000 * M.m).toFixed(0)} g.</td></tr>`;
  spectrum.set(f1, B.modes.map((m) => ({ f: m.f * ts, color: m.kind === 'tors' ? css('--accent-2') : '#e6c15a', alpha: 0.85 })).concat(P.tubes ? [{ f: open.ft, color: css('--accent'), alpha: 0.6 }] : []));
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
  // the bar, to scale along its length, thickness ×3
  const ex = Math.min(3 * sx, (0.22 * h) / g.h0), top = 18, X = (x) => x0 + x * sx;
  ctx.beginPath(); ctx.moveTo(X(0), top);
  ctx.lineTo(X(g.L), top);
  for (let i = 200; i >= 0; i--) { const x = (i / 200) * g.L; ctx.lineTo(X(x), top + ex * model.thickness(g.cut, x - g.L / 2)); }
  ctx.closePath();
  const grd = ctx.createLinearGradient(0, top, 0, top + ex * g.h0);
  grd.addColorStop(0, '#d7dde4'); grd.addColorStop(1, '#7f8892');
  ctx.fillStyle = grd; ctx.fill();
  // the tube's mouth under the middle
  const yb = top + ex * g.h0;
  ctx.strokeStyle = css('--accent'); ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(X(g.L / 2 - TG.a), yb + 10); ctx.lineTo(X(g.L / 2 - TG.a), yb + 4); ctx.lineTo(X(g.L / 2 + TG.a), yb + 4); ctx.lineTo(X(g.L / 2 + TG.a), yb + 10); ctx.stroke();
  ctx.setLineDash([]);
  // cords, mallet, damper
  ctx.strokeStyle = css('--text'); ctx.lineWidth = 1.5;
  for (const xn of B.nodes) { ctx.beginPath(); ctx.arc(X(xn), top + ex * g.h0 * 0.5, Math.max(2, ex * 0.0015), 0, TAU); ctx.stroke(); }
  ctx.lineWidth = 1;
  const xs = X(P.strike * g.L);
  ctx.fillStyle = css('--accent'); ctx.beginPath(); ctx.moveTo(xs, top - 2); ctx.lineTo(xs - 5, top - 11); ctx.lineTo(xs + 5, top - 11); ctx.closePath(); ctx.fill();
  const damped = !(shell.sustain || P.pedalLock);
  ctx.fillStyle = damped ? '#8a6d5a' : 'rgba(138,109,90,0.35)';
  ctx.fillRect(X((1 - DAMPER_X) * g.L) - 4, top - (damped ? 5 : 10), 8, 4);
  // modes 1–3, moving with their live amplitudes (slowed: mode n at 0.5·(f_n/f₁)^½ Hz)
  const now = performance.now() / 1000, rowTop = yb + 22, rowH = (h - rowTop - 4) / 3;
  let amax = 1e-12;
  const amps = [0, 1, 2].map((i) => {
    const m = B.modes[i], a = fresh && live.amp[i] !== undefined ? live.amp[i] * m.ratio * m.ratio : 0; // weighted by ω²: what you hear
    return a;
  });
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
    const dbs = fresh && amps[i] > 0 ? ` · ${(20 * Math.log10(amps[i] / amax)).toFixed(0)} dB` : '';
    const label = `mode ${i + 1}: ${fmtHz(m.f * model.barTempScale(P.temp))} Hz = ${m.ratio.toFixed(3)} × f₁${dbs}`, ly = yc - rowH / 2 + 10;
    ctx.fillStyle = css('--card') || '#1a1a1e'; ctx.globalAlpha = 0.75; ctx.fillRect(x0 + 18, ly - 9, ctx.measureText(label).width + 6, 12); ctx.globalAlpha = 1;
    ctx.fillStyle = css('--muted'); ctx.fillText(label, x0 + 21, ly);
  }
  $('#bar-read').textContent = fresh && live.contactMs ? `mallet contact ${live.contactMs.toFixed(2)} ms, peak force ${live.Fmax.toFixed(0)} N` : `${(100 * g.L).toFixed(1)} cm, ratios ${B.modes[1].ratio.toFixed(2)} : ${B.modes[2].ratio.toFixed(2)}`;
}, bcv);

// ---- the tube, its disc, the coupling over one turn, and the energy exchange ----------------------
const tcv = $('#tube');
animate(() => {
  if (!B || !TS) return;
  const { ctx, w, h } = fit(tcv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, fresh = live && live.key === focus, f1 = B.modes[0].f * model.barTempScale(P.temp);
  const theta = live ? (fresh ? live.theta : live.shaft) : 0;
  // left: tube (closed at the bottom), bar section on top, disc in the mouth
  const tw = Math.min(70, w * 0.22), tx = 14 + tw * 0.15, ty = 34, th = h - ty - 10, cx = tx + tw / 2;
  const amp = fresh && P.tubes && etPeak > 0 ? Math.sqrt(live.Et / etPeak) : 0; // relative to the tube's own recent peak
  const now = performance.now() / 1000, osc = Math.cos(TAU * 0.6 * now); // the air's oscillation, slowed down
  const N = 40;
  for (let i = 0; i < N; i++) { // pressure ∝ cos(k y), y from the closed bottom: largest there, a node at the mouth
    const y0 = ty + (i / N) * th, yFromBottom = 1 - (i + 0.5) / N, a = Math.cos((Math.PI / 2) * yFromBottom) * amp * (0.45 + 0.55 * Math.abs(osc));
    const c = osc > 0 ? [95, 208, 200] : [124, 184, 255];
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.06 + 0.85 * a).toFixed(3)})`;
    ctx.fillRect(tx, y0, tw, th / N + 0.5);
  }
  ctx.strokeStyle = css('--text'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty + th); ctx.lineTo(tx + tw, ty + th); ctx.lineTo(tx + tw, ty); ctx.stroke();
  ctx.lineWidth = 1;
  // the bar above the mouth (seen along the shaft, the bar runs across the picture), the gap to scale
  const gapPx = Math.max(4, Math.min(24, (P.gap / 1000 / (2 * TG.a)) * tw));
  ctx.fillStyle = '#b9c2cc'; ctx.fillRect(tx - tw * 0.25, ty - gapPx - 6, tw * 1.5, 6);
  // the disc, seen along its shaft: edge-on is open
  const r = tw * 0.5 * Math.sqrt(P.cd), dx = Math.sin(theta) * r, dy = Math.cos(theta) * r;
  ctx.strokeStyle = '#e6c15a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - dx, ty + 6 - dy * 0.9); ctx.lineTo(cx + dx, ty + 6 + dy * 0.9); ctx.stroke();
  ctx.lineWidth = 1; ctx.fillStyle = css('--text'); ctx.beginPath(); ctx.arc(cx, ty + 6, 2.5, 0, TAU); ctx.fill();
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`${(100 * TS.length).toFixed(1)} cm`, cx, ty + th + 9 > h ? h - 1 : ty + th + 9);
  ctx.textAlign = 'left';
  // right top: κ and the tube's pitch over one turn of the disc
  const px = tx + tw + 26, pw = w - px - 8, ph = Math.max(20, (h - 44) * 0.5), py = 16;
  if (pw > 40) {
    ctx.strokeStyle = css('--grid'); ctx.strokeRect(px, py, pw, ph);
    const n = 120, ks = [], fs = [];
    for (let i = 0; i <= n; i++) { const c = model.coupling(TS, (i / n) * TAU, f1); ks.push(c.kappa); fs.push(1200 * Math.log2(c.ft / f1)); }
    const kmax = Math.max(...ks) * 1.1, fmin = Math.min(...fs, -50) * 1.1;
    const line = (arr, map, col) => { ctx.strokeStyle = col; ctx.beginPath(); arr.forEach((v, i) => { const X = px + (i / n) * pw, Y = map(v); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.stroke(); };
    const Yk = (v) => py + ph - (v / kmax) * ph, Yf = (v) => py + ((v - 0) / fmin) * ph;
    ctx.lineWidth = 1.5; line(ks, Yk, '#e6c15a'); line(fs, Yf, '#9a9aa8'); ctx.lineWidth = 1;
    let ang = ((theta % TAU) + TAU) % TAU;
    const c = model.coupling(TS, ang, f1), Xa = px + (ang / TAU) * pw;
    ctx.fillStyle = '#e6c15a'; ctx.beginPath(); ctx.arc(Xa, Yk(c.kappa), 3.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#9a9aa8'; ctx.beginPath(); ctx.arc(Xa, Yf(1200 * Math.log2(c.ft / f1)), 3, 0, TAU); ctx.fill();
    ctx.fillStyle = css('--muted');
    const read = `κ ${c.kappa.toFixed(4)} · tube ${(1200 * Math.log2(c.ft / f1)).toFixed(0)} ¢ from its bar`;
    ctx.fillText(read, px, py - 5);
    if (ctx.measureText(read).width + ctx.measureText('one turn →').width + 12 < pw) { ctx.textAlign = 'right'; ctx.fillText('one turn →', px + pw, py - 5); ctx.textAlign = 'left'; }
    // right bottom: energy in bar and tube (dB), last 4 s
    const ey = py + ph + 18, eh = h - ey - 4;
    if (eh > 16) {
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
  }
  $('#tube-read').textContent = !P.tubes ? 'tubes off' : fresh ? `mouth ${(100 * live.open).toFixed(0)} % open · ${live.motor > 0.05 ? `${(2 * live.motor).toFixed(1)} Hz tremolo` : 'motor stopped'}` : 'strike a key';
}, tcv);

update();
warmUp();
