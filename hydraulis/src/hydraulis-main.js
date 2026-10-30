// hydraulis-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { TUNING_KEEP, tuningCents, tuningRatio } from '../../shared/tuning.js';
import { INSTRUMENT, KEY_LO, KEY_HI } from './hydraulis-instrument.js';
import { wasmModel } from './hydraulis-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const M = await wasmModel();

const $ = (s) => document.querySelector(s);
const RANKS = [
  { id: 'open', name: 'Open rank', stopped: false },
  { id: 'stopped', name: 'Stopped rank', stopped: true },
  { id: 'low', name: 'Stopped, octave below', stopped: true },
  { id: 'high', name: 'Stopped, octave above', stopped: true },
];
const WIND_SEC = 8, ROW = '#9fb4c8', DRAW = '#e58a6a';
let focus = 67, msg = null, clock = 0, lastBubbles = 0;
const hist = { t: new Float64Array(1024), p: new Float64Array(1024), rim: new Float64Array(1024), qp: new Float64Array(1024), qd: new Float64Array(1024), n: 0 };
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers

// A key's four pipes (each voiced by a linear analysis, about a millisecond a key) go with its note
// to the engine, built by the page's WebAssembly model, so the audio thread never voices them. Built
// ahead, a key at a time, when the page is idle.
const packed = new Map();
const voicing = (P) => `${P.bore}|${P.cutup}|${P.gain}|${P.offset}|${tuningCents(P).join()}`; // (the pipes are cut for the keyboard's tuning too)
function keyData(key, P) {
  const id = `${key}|${voicing(P)}`;
  let d = packed.get(id);
  if (!d) { d = M.keyModels(key, P); if (packed.size > 256) packed.clear(); packed.set(id, d); }
  return d;
}
const noteData = (key, vel, P) => keyData(key, P);
let warm = null;
function warmUp() {
  clearTimeout(warm);
  const v = voicing(shell.P), keys = [];
  const [lo, hi] = shell.P.fullRange ? INSTRUMENT.range : INSTRUMENT.compass.keys; // the keys that play
  for (let k = lo; k <= hi; k++) if (!packed.has(`${k}|${v}`)) keys.push(k);
  keys.sort((a, b) => Math.abs(a - focus) - Math.abs(b - focus));
  const step = () => {
    const k = keys.shift();
    if (k === undefined || v !== voicing(shell.P)) return;
    keyData(k, shell.P);
    warm = setTimeout(step, 15);
  };
  warm = setTimeout(step, 200);
}

const shell = createShell({
  ...INSTRUMENT,
  noteData,
  base: 55,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; shell.keys.focus?.(key); update(); },
  onParam: (id) => { if (['bore', 'cutup', 'gain', 'offset', 'fullRange', '*', ...TUNING_KEEP].includes(id)) warmUp(); if (['bore', '*'].includes(id)) row = null; update(); },
  onMessage: (m) => {
    if (m.type !== 'wind') return;
    msg = m;
    clock += (6 * 128) / m.fs;
    push({ t: clock, p: m.pc, rim: m.pRim, qp: m.Qpump, qd: m.Qdraw });
    if (m.bubbles > lastBubbles) for (let i = lastBubbles; i < Math.min(m.bubbles, lastBubbles + 6); i++) bubbles.push({ x: Math.random(), y: 0, r: 0.6 + Math.random() * 0.8, side: Math.random() < 0.5 ? -1 : 1 });
    lastBubbles = m.bubbles;
    const sag = m.pRim > 0 ? (100 * (m.pRim - m.pc)) / m.pRim : 0;
    $('#wind-read').textContent = `${m.pc.toFixed(0)} Pa (${sag >= 0 ? '−' : '+'}${Math.abs(sag).toFixed(1)} % of full) · in ${(m.Qpump * 1000).toFixed(1)} L/s, drawn ${(m.Qdraw * 1000).toFixed(1)} L/s · ${m.pipes} pipe${m.pipes === 1 ? '' : 's'} speaking`;
  },
});

function push(o) {
  const N = hist.t.length, i = hist.n % N;
  for (const k in o) hist[k][i] = o[k];
  hist.n++;
}
const mm = (x, d = 0) => `${(x * 1000).toFixed(d)} mm`;
const len = (L) => (L >= 1 ? `${L.toFixed(2)} m` : `${(L * 100).toFixed(L < 0.1 ? 1 : 0)} cm`);
const on = (P) => RANKS.map((r) => !!P[r.id]);
const shownRank = (P) => Math.max(0, on(P).indexOf(true));

// The focused key's pipes as the engine voices them (the model is deterministic).
let pipes = [];
function update() {
  const P = shell.P, ratio = tuningRatio(P, focus);
  pipes = RANKS.map((r, i) => { const f = M.pipeFreq(focus, i, ratio); return M.pipeModel(f, r.stopped, P, M.tuning(f, r.stopped)); });
  const s = shownRank(P), R = pipes[s];
  spectrum.set(R.stopped ? 0 : R.f, R.modes.map((m) => ({ f: m.f, alpha: 0.35 + 0.5 * Math.min(1, 40 / m.Q) })));
  $('#spec-read').textContent = `${noteName(focus)}, ${RANKS[s].name.toLowerCase()}: ${R.stopped ? 'stopped, odd modes 1 : 3 : 5' : 'open, modes 1 : 2 : 3'} · Q₁ ${R.Q1.toFixed(0)}`;
  $('#pipe-key').textContent = noteName(focus);
  const o = on(P);
  $('#pipe-info').innerHTML = RANKS.map((r, i) => (o[i] ? `<span>${r.name}: ${pipes[i].f.toFixed(1)} Hz, ${len(Math.max(0, pipes[i].L))} × Ø${mm(pipes[i].D)}</span>` : '')).join('') || '<span class="off">no rank drawn: every stopcock shut</span>';
  const c = M.cistern(P.cistern, P.rim);
  $('#cistern-read').textContent = `full at ${P.rim.toFixed(0)} Pa · ${(c.Vrim * 1000).toFixed(1)} L of air · bounces at ${c.fb.toFixed(1)} Hz`;
}

// ---- view 1: the cistern and the pumps ----------------------------------------------------------------
// A cut through the organ's base: a pump at each side (one with Hero's), their rocking lever above,
// the cistern between them with the bowl standing in it on its feet, and the pipe up to the chest.
// The water's heights are drawn to their own scale: the rim's depth fills a third of the tank.
const bubbles = [];
const ccv = $('#cistern');
animate(() => {
  const { ctx, w, h } = fit(ccv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  const P = shell.P, c = M.cistern(P.cistern, P.rim), m = msg;
  const two = (m ? m.pumps : P.pumps === 'two' ? 2 : 1) === 2;
  const dV = m ? Math.max(0, m.dV) : c.Vrim, p = m ? m.pc : c.pRim;
  const metal = '#8c7a5a', metalD = '#5e5240', water = 'rgba(90, 150, 210, 0.55)', waterTop = '#7cb8ff', ink = css('--muted');
  // the tank
  const tw = Math.min(0.5 * w, 1.6 * h), tx = (w - tw) / 2, ty = 0.36 * h, tb = h - 14, th = tb - ty;
  const k = (0.34 * th) / c.xRim; // metres of water height to pixels
  const yRest = ty + 0.3 * th, yRim = yRest + k * c.xRim;
  const yIn = yRest + k * (dV / c.Ain), yOut = yRest - k * (dV / c.Aout);
  const bw = tw * Math.sqrt(c.Ain / (c.Ain + c.Aout)) * 0.95, bx = tx + (tw - bw) / 2, bTop = ty - 0.12 * h;
  ctx.fillStyle = water;
  ctx.fillRect(tx, yOut, tw, tb - yOut); // outside the bowl, up to its level
  ctx.clearRect(bx, bTop, bw, yIn - bTop); // inside, down to its own
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'; ctx.fillRect(bx, bTop, bw, yIn - bTop);
  ctx.fillStyle = water; ctx.fillRect(bx, yIn, bw, yRim - yIn);
  ctx.strokeStyle = waterTop; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(tx, yOut); ctx.lineTo(bx, yOut); ctx.moveTo(bx + bw, yOut); ctx.lineTo(tx + tw, yOut); ctx.moveTo(bx, yIn); ctx.lineTo(bx + bw, yIn); ctx.stroke();
  ctx.lineWidth = 1;
  // the tank's walls and the bowl, on its feet
  ctx.strokeStyle = metalD; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(tx, ty - 0.06 * h); ctx.lineTo(tx, tb); ctx.lineTo(tx + tw, tb); ctx.lineTo(tx + tw, ty - 0.06 * h); ctx.stroke();
  ctx.strokeStyle = metal; ctx.lineWidth = 3;
  const cy = bTop + 0.06 * h;
  ctx.beginPath(); ctx.moveTo(bx, yRim); ctx.lineTo(bx, cy); ctx.quadraticCurveTo(bx + bw / 2, bTop - 0.06 * h, bx + bw, cy); ctx.lineTo(bx + bw, yRim); ctx.stroke();
  ctx.lineWidth = 2;
  for (const fx of [bx + 6, bx + bw - 6]) { ctx.beginPath(); ctx.moveTo(fx, yRim); ctx.lineTo(fx, tb); ctx.stroke(); }
  ctx.lineWidth = 1;
  // the head: the water outside over the water inside
  const hx = bx + bw + 0.3 * (tx + tw - bx - bw);
  ctx.strokeStyle = css('--accent'); ctx.fillStyle = css('--accent');
  ctx.beginPath(); ctx.moveTo(hx, yOut); ctx.lineTo(hx, yIn); ctx.moveTo(hx - 4, yOut); ctx.lineTo(hx + 4, yOut); ctx.moveTo(hx - 4, yIn); ctx.lineTo(hx + 4, yIn); ctx.stroke();
  ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(bx + bw, yIn); ctx.lineTo(hx, yIn); ctx.stroke(); ctx.setLineDash([]);
  ctx.textAlign = 'left';
  ctx.fillText(`${((p / 9.81)).toFixed(0)} mm`, hx + 6, (yOut + yIn) / 2 + 3);
  ctx.fillStyle = ink;
  ctx.fillText('rim', bx + bw + 3, yRim + 3);
  ctx.textAlign = 'center';
  ctx.fillText('pnigeus', bx + bw / 2, Math.max(cy + 12, (cy + yIn) / 2));
  // the bubbles escaping under the rim, rising outside
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.y += 0.012;
    const x = b.side < 0 ? bx - 4 - b.x * 0.4 * (bx - tx) : bx + bw + 4 + b.x * 0.4 * (tx + tw - bx - bw), y = yRim - b.y * (yRim - yOut);
    if (y <= yOut || bubbles.length > 40) { bubbles.splice(i, 1); continue; }
    ctx.strokeStyle = waterTop; ctx.beginPath(); ctx.arc(x, y, 2 + 2 * b.r, 0, 2 * Math.PI); ctx.stroke();
  }
  // the pipe up to the chest, and the chest
  const chW = Math.min(0.42 * w, 1.4 * tw), chX = (w - chW) / 2, chY = 0.08 * h, chH = 0.07 * h;
  ctx.fillStyle = metalD; ctx.fillRect(w / 2 - 3, chY + chH, 6, bTop - 0.05 * h - chY - chH);
  ctx.fillStyle = '#4a3f30'; ctx.fillRect(chX, chY, chW, chH);
  const sounding = m ? m.keys.length : 0;
  ctx.fillStyle = css('--text'); ctx.textAlign = 'center';
  ctx.fillText(`wind chest · ${sounding} key${sounding === 1 ? '' : 's'} open`, w / 2, chY + chH / 2 + 3.5);
  // the pumps: a cylinder at each side, its piston and rod, and the lever the pumper works
  const lever = ty - 0.12 * h;
  const pumpAt = (side, pos, label) => {
    const cw = Math.max(18, 0.07 * w), cx = side < 0 ? tx - 0.1 * w - cw : tx + tw + 0.1 * w, cTop = ty - 0.02 * h, cBot = tb - 0.08 * h, ch = cBot - cTop;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.fillRect(cx, cTop, cw, ch);
    ctx.strokeStyle = metal; ctx.lineWidth = 2; ctx.strokeRect(cx, cTop, cw, ch); ctx.lineWidth = 1;
    const py = cTop + 6 + (1 - pos) * (ch - 14), top = lever - 6 * (pos - 0.5);
    ctx.fillStyle = metal; ctx.fillRect(cx + 2, py, cw - 4, 6);
    ctx.fillStyle = metalD; ctx.fillRect(cx + cw / 2 - 2, top, 4, py - top);
    // the lever, pivoted beyond the cylinder: the pumper bears down on its far end
    const px = cx + cw / 2 + side * 0.05 * w, hx = px + side * 0.03 * w;
    ctx.strokeStyle = '#6a5440'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + cw / 2, top); ctx.lineTo(px, lever); ctx.lineTo(hx, lever + 0.6 * (lever - top)); ctx.stroke();
    ctx.lineWidth = 1; ctx.lineCap = 'butt';
    ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(px, lever, 3, 0, 2 * Math.PI); ctx.fill();
    // its pipe to under the bowl
    const sx = side < 0 ? cx + cw : cx, ex = side < 0 ? bx + bw * 0.3 : bx + bw * 0.7;
    ctx.strokeStyle = metalD; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(sx, cBot - 4); ctx.lineTo(ex, cBot - 4); ctx.lineTo(ex, Math.min(yIn + 10, cBot - 4)); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.fillText(label, cx + cw / 2, cBot + 12);
  };
  pumpAt(-1, m ? m.piston1 : 1, 'pump');
  if (two) pumpAt(1, m ? m.piston2 : 1, 'pump');
  ctx.fillStyle = ink; ctx.textAlign = 'left';
  if (m) ctx.fillText(`effort ${(100 * m.effort).toFixed(0)} % · ${m.strokes} stroke${m.strokes === 1 ? '' : 's'}${m.bubbles ? ` · ${m.bubbles} bubbles` : ''}`, 4, h - 3);
  else ctx.fillText('the bowl is full: play a key', 4, h - 3);
}, ccv);

// ---- view 2: the wind ---------------------------------------------------------------------------------
const wcv = $('#wind');
animate(() => {
  const { ctx, w, h } = fit(wcv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  const padL = 40, padR = 40, padT = 8, padB = 16, N = hist.t.length, n = Math.min(hist.n, N);
  const t0 = clock - WIND_SEC, X = (t) => padL + ((t - t0) / WIND_SEC) * (w - padL - padR);
  const rim = shell.P.rim;
  let pLo = rim * 0.85, pHi = rim * 1.06, qMax = 1e-3;
  for (let j = 0; j < n; j++) { const i = (hist.n - 1 - j) % N; if (hist.t[i] < t0) break; pLo = Math.min(pLo, hist.p[i]); pHi = Math.max(pHi, hist.p[i], hist.rim[i]); qMax = Math.max(qMax, 1.15 * hist.qp[i], 1.15 * hist.qd[i]); }
  const sp = pHi - pLo, lo = Math.max(0, pLo - 0.08 * sp), hi = pHi + 0.08 * sp;
  const Y = (p) => h - padB - ((p - lo) / (hi - lo)) * (h - padT - padB), YQ = (q) => h - padB - (q / qMax) * (h - padT - padB);
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  const st = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => (hi - lo) / s < 6) || 1000;
  for (let p = Math.ceil(lo / st) * st; p <= hi; p += st) { ctx.beginPath(); ctx.moveTo(padL, Y(p)); ctx.lineTo(w - padR, Y(p)); ctx.stroke(); ctx.fillText(`${p}`, padL - 4, Y(p) + 3); }
  ctx.save(); ctx.translate(9, h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('Pa', 0, 0); ctx.restore();
  ctx.textAlign = 'left'; ctx.fillStyle = css('--accent-2'); ctx.fillText(`${(qMax * 1000).toFixed(1)} L/s`, w - padR + 3, padT + 8);
  ctx.textAlign = 'center'; ctx.fillStyle = css('--muted');
  for (let s = 0; s <= WIND_SEC; s += 2) ctx.fillText(`${s - WIND_SEC} s`, X(t0 + s), h - 3);
  const line = (arr, Yf, col, dash = []) => {
    ctx.strokeStyle = col; ctx.setLineDash(dash); ctx.beginPath();
    let started = false;
    for (let j = n - 1; j >= 0; j--) { const i = (hist.n - 1 - j) % N, t = hist.t[i]; if (t < t0) continue; if (started) ctx.lineTo(X(t), Yf(arr[i])); else { ctx.moveTo(X(t), Yf(arr[i])); started = true; } }
    ctx.stroke(); ctx.setLineDash([]);
  };
  line(hist.qd, YQ, DRAW);
  line(hist.qp, YQ, css('--accent-2'));
  line(hist.rim, Y, ROW, [4, 3]);
  ctx.lineWidth = 1.8; line(hist.p, Y, css('--accent')); ctx.lineWidth = 1;
  if (!n) { ctx.fillStyle = css('--muted'); ctx.textAlign = 'left'; ctx.fillText('start audio and play', padL + 6, padT + 14); }
}, wcv);

// ---- view 3: the pipes on their slides --------------------------------------------------------------------
// Each rank's pipes (as many keys as play), heights to one scale (a log scale with the full range,
// whose bass is metres long). A pipe lights as its key's slide opens, if its rank's stopcock is on.
let row = null; // every key's pipes' lengths and widths, for the bore they are at
function rows(P) {
  if (row && row.full === !!P.fullRange) return row;
  const [lo, hi] = P.fullRange ? INSTRUMENT.range : [KEY_LO, KEY_HI];
  const keys = [];
  for (let key = lo; key <= hi; key++) keys.push(RANKS.map((r, i) => { const R = M.pipeModel(M.pipeFreq(key, i), r.stopped, { bore: P.bore }); return { L: Math.max(R.L, 1e-3), D: R.D }; }));
  return (row = { full: !!P.fullRange, lo, hi, keys });
}
const pcv = $('#pipes');
pcv.addEventListener('pointerdown', (ev) => { // a tap shows that key's pipes
  const r = pcv.getBoundingClientRect(), R = rows(shell.P), n = R.hi - R.lo + 1;
  const key = R.lo + Math.floor(((ev.clientX - r.left - 30) / (r.width - 34)) * n);
  if (key >= R.lo && key <= R.hi) { focus = key; update(); }
});
animate(() => {
  const { ctx, w, h } = fit(pcv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  const P = shell.P, R = rows(P), n = R.hi - R.lo + 1, o = on(P);
  const open = new Map((msg ? msg.keys : []).map((k) => [k.key, k.open]));
  const x0 = 30, cw = (w - x0 - 4) / n, band = (h - 14) / 4;
  let Lmax = 0, Lmin = Infinity;
  for (const k of R.keys) for (const p of k) { Lmax = Math.max(Lmax, p.L); Lmin = Math.min(Lmin, p.L); }
  const H = (L) => (R.full ? Math.log(L / Lmin) / Math.log(Lmax / Lmin) : L / Lmax) * (band - 6) + 2;
  const Dmax = Math.max(...R.keys.flat().map((p) => p.D));
  for (let r = 0; r < 4; r++) {
    const yb = (r + 1) * band;
    ctx.fillStyle = o[r] ? css('--text') : css('--muted'); ctx.textAlign = 'left'; ctx.font = '9px system-ui, sans-serif';
    ctx.fillText(['open', 'stop', '8vb', '8va'][r], 2, yb - 2); ctx.font = '10px system-ui, sans-serif';
    ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(x0, yb); ctx.lineTo(w - 4, yb); ctx.stroke();
    for (let i = 0; i < n; i++) {
      const key = R.lo + i, p = R.keys[i][r], ph = H(p.L), pw = Math.max(1, Math.min(cw - 1, cw * (0.35 + 0.6 * (p.D / Dmax))));
      const x = x0 + i * cw + (cw - pw) / 2, lit = o[r] ? open.get(key) ?? 0 : 0;
      ctx.globalAlpha = o[r] ? 1 : 0.35;
      ctx.fillStyle = lit > 0.01 ? css('--accent') : '#8c7a5a';
      if (lit > 0.01) ctx.globalAlpha = 0.45 + 0.55 * lit;
      ctx.fillRect(x, yb - ph, pw, ph);
      if (RANKS[r].stopped) { ctx.fillStyle = '#4a3f30'; ctx.fillRect(x - 0.5, yb - ph - 2, pw + 1, 2); }
      if (key === focus) { ctx.globalAlpha = 1; ctx.strokeStyle = css('--accent-2'); ctx.strokeRect(x - 1.5, yb - ph - 3.5, pw + 3, ph + 3.5); }
      ctx.globalAlpha = 1;
    }
  }
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'left';
  ctx.fillText(noteName(R.lo), x0, h - 2); ctx.textAlign = 'right'; ctx.fillText(noteName(R.hi), w - 4, h - 2);
  ctx.textAlign = 'center'; ctx.fillText(R.full ? 'lengths on a log scale' : 'lengths to scale', (x0 + w) / 2, h - 2);
  $('#pipe-read').textContent = `${o.filter(Boolean).length} of 4 ranks on · tap a pipe`;
}, pcv);

update();
warmUp();
