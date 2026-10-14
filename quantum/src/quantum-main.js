// quantum-main.js — the page: wires the shell to the engine and draws the views.
// The packet of each note is computed here (makePacket, ~1 ms) and sent with the
// noteOn, so the worklet never does setup work.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, fit, css, animate } from '../../shared/views.js';
import { GROUPS, PRESETS } from './quantum-params.js';
import { makePacket, WELLS } from './quantum-model.js';
import { waveGrid, density } from './quantum-waves.js';

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
const LIVE_ONLY = new Set(['volume', 'room', 'velocity', 'T1', 'release']); // these don't change the views

let focus = 57, pk = null, onsetAt = null, dirty = true, dephDirty = true;
const fMax = () => Math.min(20000, 0.45 * (shell?.audio?.ctx.sampleRate || 48000));
const now = () => (shell.audio ? shell.audio.ctx.currentTime : performance.now() / 1000);
const Tphi = () => (shell.P.dephase > 0 ? 1 / shell.P.dephase : Infinity);
const fmtT = (t) => (!Number.isFinite(t) ? '∞' : t < 1 ? `${(t * 1000).toFixed(0)} ms` : `${t.toFixed(t < 10 ? 2 : 1)} s`);

const shell = createShell({
  id: 'quantum',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'],
  worklet: { modules: ['src/quantum-engine.js'], engine: 'QuantumEngine' },
  chain: { volume: 'volume', room: 'room' },
  space: 'sustain',
  arrows: { param: 'velocity', step: 0.05 },
  modWheel: 'dephase',
  noteData: (key) => makePacket(key, shell.P, { fMax: fMax() }),
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { if (key !== focus) { focus = key; dirty = true; } onsetAt = now(); shell.keys.focus(key); },
  onParam: (id) => { if (id === 'dephase') dephDirty = true; else if (!LIVE_ONLY.has(id)) dirty = true; },
});

// ---- the focused key's packet, its eigenfunctions, and time scales -------------
const carpet = { cv: $('#carpet'), W: 0, H: 0, G: null, img: null, off: null, done: 0, j0: 0, span: 1, ref: 1, lut: null };
let wellG = null, ac = null;

function carpetSpan(p) {
  if (!Number.isFinite(p.Trev)) return 1.5;
  const sr6 = p.Tsr / 6;
  return Math.min(12, Math.max(0.25, Number.isFinite(sr6) && sr6 < 8 * p.Trev ? 1.1 * sr6 : 1.1 * p.Trev));
}
// Strobe: one frame per classical period, slowly advancing in phase (4 apparent
// bounces per carpet), unless the carpet already resolves the motion.
function strobe(tau) {
  const T = pk.Tcl, step = carpet.span / Math.max(1, carpet.W);
  if (step < T / 10) return tau;
  return T * (Math.floor(tau / T) + ((4 * tau) / carpet.span) % 1);
}

function refresh() {
  dirty = false; dephDirty = true;
  pk = makePacket(focus, shell.P, { fMax: fMax() });
  $('#focus-name').textContent = noteName(focus);
  const rev = Number.isFinite(pk.Trev) ? `T_rev ${fmtT(pk.Trev)} = ${(pk.Trev / pk.Tcl).toFixed(0)} periods · collapse ${fmtT(pk.tColl)}` : 'no revivals: equally spaced levels never dephase';
  const sr = Number.isFinite(pk.Tsr) && pk.Tsr < 1e4 ? ` · T_sr ${fmtT(pk.Tsr)}` : '';
  $('#carpet-info').textContent = `n̄ ${pk.nbar.toFixed(pk.nbar < 20 ? 1 : 0)} · σₙ ${pk.sigma.toFixed(2)} · ${rev}${sr}`;
  $('#well-info').textContent = `${WELLS[pk.id].name} · levels ${pk.ns[0]}–${pk.ns[pk.ns.length - 1]}`;
  // spectrum markers: the strongest Bohr lines
  const top = [...pk.pairs].sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, 160), wm = Math.abs(top[0]?.w || 1);
  spectrum.set(pk.pitch, top.map((p) => ({ f: p.f, alpha: 0.12 + 0.6 * Math.sqrt(Math.abs(p.w) / wm) })));
  carpet.span = carpetSpan(pk); carpet.G = null; wellG = null; ac = null;
}

// ---- carpet ---------------------------------------------------------------------
function lut() {
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const a = hex(css('--card') || '#1a1a1e'), b = hex(css('--accent') || '#73e2b8'), out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const u = i / 255, m = Math.min(1, u * 1.6), w = Math.max(0, (u - 0.62) / 0.38);
    for (let k = 0; k < 3; k++) out[3 * i + k] = (a[k] + (b[k] - a[k]) * m) * (1 - w) + 255 * w;
  }
  return out;
}
// Density reference: the packet in flight (a quarter and a half period after launch),
// so the launch spike at a turning point does not set the colour scale.
function densityRef(G) {
  let m = 0;
  for (const f of [0.25, 0.5]) { const d = density(pk, G, f * pk.Tcl); let x = 0; for (const v of d) x = Math.max(x, v); m += x / 2; }
  return m || 1;
}
// Image column c shows absolute column j0 + c, at time (j0 + c + ½)·span/W.
function carpetColumn(c, buf) {
  const t = strobe(((carpet.j0 + c + 0.5) * carpet.span) / carpet.W);
  density(pk, carpet.G, t, Tphi(), buf);
  const d = carpet.img.data, L = carpet.lut, H = carpet.H, W = carpet.W;
  for (let r = 0; r < H; r++) {
    const v = (0.5 * (buf[2 * r] + buf[2 * r + 1])) / carpet.ref, i = Math.min(255, Math.round(255 * Math.sqrt(Math.max(0, v))));
    const o = 4 * ((H - 1 - r) * W + c);
    d[o] = L[3 * i]; d[o + 1] = L[3 * i + 1]; d[o + 2] = L[3 * i + 2]; d[o + 3] = 255;
  }
}
function scrollCarpet(j0) { // keep what is still in view, recompute the rest
  const shift = j0 - carpet.j0, W = carpet.W, H = carpet.H, d = carpet.img.data;
  if (shift > 0 && shift < W) {
    for (let r = 0; r < H; r++) d.copyWithin(4 * r * W, 4 * (r * W + shift), 4 * (r * W + W));
    carpet.done = Math.max(0, carpet.done - shift);
  } else carpet.done = 0;
  carpet.j0 = j0;
}
function drawCarpet() {
  ensure();
  const cv = carpet.cv;
  if (cv.offsetParent === null || !pk) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const padL = 30, padB = 16, pw = Math.max(10, w - padL - 6), ph = Math.max(10, h - padB - 4);
  const W = Math.max(8, Math.min(560, Math.floor(pw))), H = Math.max(8, Math.min(220, Math.floor(ph)));
  if (!carpet.G || W !== carpet.W || H !== carpet.H || dephDirty) {
    if (!carpet.G || H !== carpet.H) carpet.G = waveGrid(pk, shell.P, 2 * H);
    carpet.W = W; carpet.H = H; carpet.done = 0; carpet.j0 = 0; dephDirty = false;
    carpet.img = new ImageData(W, H); carpet.lut = lut();
    carpet.off = carpet.off || document.createElement('canvas');
    carpet.off.width = W; carpet.off.height = H;
    carpet.ref = densityRef(carpet.G);
  }
  // scroll in steps of W/4 once "now" passes 85 % of the window
  const tau = onsetAt === null ? -1 : now() - onsetAt, colT = carpet.span / W;
  if (tau > 0 && tau < 600) {
    if (tau / colT > carpet.j0 + 0.85 * W) scrollCarpet(Math.floor((tau / colT - 0.6 * W) / (W / 4)) * Math.floor(W / 4));
  } else if (carpet.j0) scrollCarpet(0);
  const buf = new Float64Array(2 * H), t0 = performance.now();
  while (carpet.done < W && performance.now() - t0 < 6) carpetColumn(carpet.done++, buf);
  carpet.off.getContext('2d').putImageData(carpet.img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(carpet.off, padL, 4, pw, ph);
  // time axis: revival fractions when there is room, else multiples of T_rev, else seconds
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.textAlign = 'center';
  const X = (t) => padL + ((t / colT - carpet.j0) / W) * pw, pxRev = Number.isFinite(pk.Trev) ? (pk.Trev / colT) * (pw / W) : 0;
  const ticks = [];
  if (pxRev > 260) for (let m = 0; m < 400; m++) { for (const [f, lab] of [[0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']]) ticks.push([(m + f) * pk.Trev, f === 1 ? `${m ? m + 1 : ''}T_rev` : lab]); }
  else if (pxRev > 24) { const every = Math.ceil(40 / pxRev); for (let m = every; m < 2000; m += every) ticks.push([m * pk.Trev, `${m}T`]); }
  else { const st = carpet.span > 4 ? 1 : carpet.span > 1.5 ? 0.5 : 0.1; for (let t = st; t < 2000 * st; t += st) ticks.push([t, `${+t.toFixed(1)} s`]); }
  for (const [t, lab] of ticks) {
    const x = X(t);
    if (x > padL + pw) break;
    if (x < padL) continue;
    ctx.beginPath(); ctx.moveTo(x, 4 + ph); ctx.lineTo(x, 8 + ph); ctx.stroke();
    ctx.fillText(lab, x, h - 3);
  }
  ctx.save(); ctx.translate(11, 4 + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(carpet.G?.label || 'x', 0, 0); ctx.restore();
  if (tau >= 0 && tau < 600) {
    const x = X(tau);
    if (x >= padL && x <= padL + pw) { ctx.strokeStyle = css('--text'); ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, 4 + ph); ctx.stroke(); ctx.globalAlpha = 1; }
  }
}

// ---- the well: V(x), |ψ|² now, the levels and |cₙ|² --------------------------------
const wellBuf = { d: null };
function drawWell() {
  ensure();
  const cv = $('#well');
  if (cv.offsetParent === null || !pk) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const ladder = Math.max(40, Math.min(110, 0.24 * w)), padL = 8, padB = 16, pw = Math.max(10, w - ladder - padL - 10), ph = Math.max(10, h - padB - 6);
  const rows = Math.max(16, Math.min(400, Math.floor(pw)));
  if (!wellG || wellG.ys.length !== rows) { wellG = waveGrid(pk, shell.P, rows); wellBuf.d = new Float64Array(rows); wellBuf.ref = densityRef(wellG); }
  const G = wellG, [E0, E1] = G.Erange, ys = G.ys;
  const X = (i) => padL + ((i + 0.5) / rows) * pw, Y = (E) => 6 + ph * (1 - (E - E0) / (E1 - E0));
  // the potential
  ctx.strokeStyle = css('--muted'); ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i < rows; i++) { const y = Math.max(6, Math.min(6 + ph, Y(G.V(ys[i])))); if (i) ctx.lineTo(X(i), y); else ctx.moveTo(X(i), y); }
  ctx.stroke();
  for (const wall of G.walls || []) { const i = (wall - ys[0]) / (ys[1] - ys[0]) - 0.5, x = X(i); ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, 6 + ph); ctx.stroke(); }
  ctx.lineWidth = 1;
  // levels between their turning points, faint by weight
  const cmax = Math.max(...pk.c.map((c) => c * c));
  for (let i = 0; i < pk.ns.length; i++) {
    const p = (pk.c[i] * pk.c[i]) / cmax;
    if (p < 0.01) continue;
    const [a, b] = G.turning(pk.E[i]), ia = (a - ys[0]) / (ys[1] - ys[0]), ib = (b - ys[0]) / (ys[1] - ys[0]);
    ctx.strokeStyle = css('--accent-2'); ctx.globalAlpha = 0.15 + 0.5 * p;
    ctx.beginPath(); ctx.moveTo(X(Math.max(0, ia)), Y(pk.E[i])); ctx.lineTo(X(Math.min(rows - 1, ib)), Y(pk.E[i])); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // |ψ|² now, strobed like the carpet
  const tau = onsetAt === null ? 0 : Math.max(0, now() - onsetAt);
  const d = density(pk, G, strobe(Math.min(tau, 1e4)), Tphi(), wellBuf.d);
  const Ebar = pk.E[Math.min(pk.E.length - 1, Math.max(0, Math.round(pk.nbar) - pk.ns[0]))], base = Y(Ebar), amp = 0.42 * ph;
  ctx.beginPath(); ctx.moveTo(X(0), base);
  for (let i = 0; i < rows; i++) ctx.lineTo(X(i), Math.max(2, base - (amp * d[i]) / wellBuf.ref));
  ctx.lineTo(X(rows - 1), base); ctx.closePath();
  ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = css('--accent'); ctx.stroke();
  // ladder: the packet's levels, |cₙ|² as bars (its own, zoomed energy axis)
  const lx = padL + pw + 10, lw = Math.max(10, ladder - 4), nN = pk.ns.length, Ea = pk.E[0], Eb = pk.E[nN - 1];
  const LY = (E) => 6 + ph * (1 - (Eb === Ea ? 0.5 : 0.04 + 0.92 * (E - Ea) / (Eb - Ea)));
  ctx.fillStyle = css('--accent');
  for (let i = 0; i < nN; i++) {
    const p = (pk.c[i] * pk.c[i]) / cmax, y = LY(pk.E[i]);
    ctx.globalAlpha = 0.25; ctx.fillRect(lx, y - 0.5, lw, 1);
    ctx.globalAlpha = 0.85; ctx.fillRect(lx, y - 1.5, Math.max(1, lw * p), 3);
  }
  ctx.globalAlpha = 1; ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.textAlign = 'left';
  ctx.fillText(`n = ${pk.ns[nN - 1]}`, lx, Math.max(10, LY(Eb) - 6)); ctx.fillText(`${pk.ns[0]}`, lx, Math.min(h - 3, LY(Ea) + 12));
  ctx.textAlign = 'center'; ctx.fillText(G.label, padL + pw / 2, h - 3);
}

// ---- autocorrelation, with the revival fractions marked ------------------------------
function computeAC(width) {
  const Trev = pk.Trev, span = !Number.isFinite(Trev) ? 1.5 : Math.max(2.25 * Trev, Number.isFinite(pk.Tsr) && pk.Tsr / 2 < 24 * Trev ? 0.55 * pk.Tsr : 0);
  const N = pk.ns.length, p = pk.c.map((c) => c * c), dt = Math.min(pk.Tcl / 8, span / 2000), steps = Math.ceil(span / dt);
  const w = 2 * Math.PI * pk.scale, Tp = Tphi(), deph = Number.isFinite(Tp);
  const re = new Float64Array(N).fill(1), im = new Float64Array(N), cr = new Float64Array(N), ci = new Float64Array(N);
  for (let i = 0; i < N; i++) { const th = w * (pk.E[i] - pk.E[0]) * dt; cr[i] = Math.cos(th); ci[i] = -Math.sin(th); }
  const pure = new Float64Array(width), mixed = deph ? new Float64Array(width) : null;
  for (let s = 0; s <= steps; s++) {
    const t = s * dt, px = Math.min(width - 1, Math.floor((t / span) * width));
    let a = 0, b = 0;
    for (let i = 0; i < N; i++) { a += p[i] * re[i]; b += p[i] * im[i]; }
    pure[px] = Math.max(pure[px], a * a + b * b);
    if (deph) { // Tr ρ(0)ρ(t) = Σ p_m pₙ cos(ω_mn t) e^(−(m−n)²t/T_φ)
      let sum = 0;
      for (let i = 0; i < N; i++) sum += p[i] * p[i];
      for (let k = 1; k < N; k++) {
        const D = Math.exp((-k * k * t) / Tp);
        if (D < 1e-6) break;
        let g = 0;
        for (let i = 0; i + k < N; i++) g += p[i] * p[i + k] * (re[i] * re[i + k] + im[i] * im[i + k]);
        sum += 2 * D * g;
      }
      mixed[px] = Math.max(mixed[px], sum);
    }
    for (let i = 0; i < N; i++) { const x = re[i], y = im[i]; re[i] = x * cr[i] - y * ci[i]; im[i] = x * ci[i] + y * cr[i]; }
  }
  return { span, pure, mixed, width };
}
function drawAC() {
  ensure();
  const cv = $('#autocorr');
  if (cv.offsetParent === null || !pk) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const padL = 26, padB = 16, pw = Math.max(10, w - padL - 6), ph = Math.max(10, h - padB - 6), width = Math.max(8, Math.floor(pw));
  if (!ac || ac.width !== width || ac.Tphi !== Tphi()) { ac = computeAC(width); ac.Tphi = Tphi(); }
  const X = (t) => padL + (t / ac.span) * pw, Y = (v) => 6 + ph * (1 - v);
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  for (const v of [0, 0.25, 1 / 3, 0.5, 1]) { ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(padL + pw, Y(v)); ctx.stroke(); ctx.fillText(v === 1 / 3 ? '⅓' : v === 0.25 ? '¼' : v === 0.5 ? '½' : `${v}`, padL - 4, Y(v) + 3); }
  ctx.textAlign = 'center';
  const marks = [], pxRev = Number.isFinite(pk.Trev) ? (pk.Trev / ac.span) * pw : 0;
  if (pxRev > 90) for (let m = 0; m * pk.Trev < ac.span; m++) for (const [f, lab] of [[0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [1, 'T_rev']]) marks.push([(m + f) * pk.Trev, f === 1 ? `${m ? m + 1 : ''}T_rev` : m ? '' : lab]);
  else if (pxRev > 3) { const every = Math.ceil(36 / pxRev); for (let m = 1; m * pk.Trev < ac.span; m++) marks.push([m * pk.Trev, m % every ? '' : `${m}T`]); }
  if (Number.isFinite(pk.Tsr)) for (const [f, lab] of [[1 / 6, 'T_sr/6'], [1 / 3, 'T_sr/3'], [0.5, 'T_sr/2']]) if (f * pk.Tsr < ac.span) marks.push([f * pk.Tsr, lab, true]);
  for (const [t, lab, sr] of marks) {
    const x = X(t);
    ctx.strokeStyle = sr ? css('--accent-2') : 'rgba(255,255,255,0.22)'; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, 6 + ph); ctx.stroke(); ctx.setLineDash([]);
    if (lab) { ctx.fillStyle = sr ? css('--accent-2') : css('--muted'); ctx.fillText(lab, x, sr ? 14 : h - 3); }
  }
  const curve = (arr, color, alpha) => {
    ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.beginPath();
    for (let i = 0; i < arr.length; i++) { const x = padL + ((i + 0.5) / arr.length) * pw; if (i) ctx.lineTo(x, Y(arr[i])); else ctx.moveTo(x, Y(arr[i])); }
    ctx.stroke(); ctx.globalAlpha = 1;
  };
  curve(ac.pure, css('--accent'), 0.95);
  if (ac.mixed) curve(ac.mixed, css('--accent-2'), 0.7);
  const tau = onsetAt === null ? -1 : now() - onsetAt;
  if (tau >= 0 && tau <= ac.span) { ctx.strokeStyle = css('--text'); ctx.beginPath(); ctx.moveTo(X(tau), 6); ctx.lineTo(X(tau), 6 + ph); ctx.stroke(); }
  $('#ac-info').textContent = `0 – ${fmtT(ac.span)}`;
}

function ensure() { if (dirty) { refresh(); shell.keys.focus(focus); } }
animate(drawCarpet, $('#carpet'));
animate(drawWell, $('#well'));
animate(drawAC, $('#autocorr'));
