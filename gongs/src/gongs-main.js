// gongs-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { fit, css, animate } from '../../shared/views.js';
import { GROUPS, PRESETS } from './gongs-params.js';
import { keyGong, interpR, backbone, contactTime, MICS, shell as couplings, engineTables, tablesId } from './gongs-model.js';

const $ = (s) => document.querySelector(s);
const BANDS = ['below the pitch', '1–2×', '2–4×', '4–8×', '8–16×', '>16×'];
const BAND_COL = ['#8a8aa0', '#e6c15a', '#f0a050', '#ef7a5a', '#d860a0', '#9a7cff'];
let focus = 57, live = null, history = [], analyser = null, sentTables = null;
const rate = () => shell?.audio?.ctx.sampleRate || 48000;
// The coupling tables (a few ms to build) are built here, on the page, and travel with the
// parameters whenever Dome rise, Coupling terms or Rim changes them, so the audio thread
// never builds them.
const engineParams = (P) => {
  const id = tablesId(P);
  if (id === sentTables) return P;
  sentTables = id;
  return { ...P, tables: engineTables(couplings(P.bc, P.rise, P.terms)) };
};

const shell = createShell({
  id: 'gongs',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'],
  range: [36, 84],
  worklet: { modules: ['src/gongs-engine.js'], engine: 'GongEngine' },
  chain: { volume: 'volume', room: 'room' },
  space: 'sustain',
  arrows: { param: 'velocity', step: 0.05 },
  modWheel: 'strike',
  engineParams,
  onAudio: (a) => { analyser = a.analyser; update(); },
  onNoteOn: (key) => { focus = key; shell.keys.focus(key); update(); },
  onParam: () => update(),
  onMessage: (m) => {
    if (m.type !== 'gong') return;
    if (!live || m.key !== live.key || m.t < live.t) history = [];
    live = m;
    history.push({ t: m.t, band: Array.from(m.band), E: m.E, cents: m.cents });
    if (history.length > 400) history.shift();
  },
});

// ---- the focus key's gong: modes, sizes, and the mode table -------------------------------------
let G = null;
function update() {
  const P = shell.P;
  G = keyGong(focus, P, rate());
  const { S, Nv, f0 } = G;
  $('#focus-name').textContent = noteName(focus);
  $('#plate-key').textContent = noteName(focus);
  $('#focus-size').textContent = `⌀ ${(200 * G.a).toFixed(1)} cm · h ${(1000 * G.h).toFixed(2)} mm · ${G.mass < 1 ? `${(1000 * G.mass).toFixed(0)} g` : `${G.mass.toFixed(2)} kg`}`;
  const rows = [];
  const n = Math.min(Nv, 16), phiS = (i) => interpR(S.R[i], P.strike), ex = [];
  for (let i = 0; i < Nv; i++) ex.push(Math.abs(phiS(i)));
  const exMax = Math.max(...ex, 1e-12);
  for (let i = 0; i < n; i++) {
    const f = (S.Om[i] * G.w0) / (2 * Math.PI), T60 = 6.91 / G.sigma[i], b = backbone(S, i, Nv);
    const glide = 1200 * Math.log2(Math.sqrt(Math.max(1e-6, 1 + 2 * b * 0.09)));
    const exDb = 20 * Math.log10(ex[i] / exMax);
    rows.push(`<tr class="${i === S.tuned ? 'tuned' : ''}"><td>${S.label[i]}</td><td>${f.toFixed(f < 1000 ? 1 : 0)}</td><td>${(f / f0).toFixed(3)}</td><td>${T60.toFixed(T60 < 10 ? 2 : 1)}</td>`
      + `<td>${exDb > -60 ? exDb.toFixed(0) : '—'}</td><td class="${glide > 0.5 ? 'hard' : glide < -0.5 ? 'soft' : ''}">${glide > 0 ? '+' : ''}${glide.toFixed(1)}</td></tr>`);
  }
  const tc = contactTime(G, P, P.velocity), top = (S.Om[Nv - 1] * G.w0) / (2 * Math.PI);
  $('#modes').innerHTML = '<tr><th>mode (m,s)</th><th>f (Hz)</th><th>× pitch</th><th>T₆₀ (s)</th><th>at strike point (dB)</th><th>¢ at 0.3 h</th></tr>' + rows.join('')
    + `<tr><td colspan="6" class="note">${Nv} modes up to ${(top / 1000).toFixed(1)} kHz, run at ${(G.fsi / 1000).toFixed(1)} kHz. The strike tone (gold) is the first axisymmetric mode, tuned to the key. Mallet contact ≈ ${(1000 * tc).toFixed(2)} ms at velocity ${P.velocity.toFixed(2)}. The last column is the normal-form pitch shift at an amplitude of 0.3 thickness: + hardens, − softens.</td></tr>`;
  plateCache = null;
}

// ---- the gong's surface ---------------------------------------------------------------------
const GRID = 112;
let plateCache = null;
function platePixels(S, Nv) { // per pixel: radius bin and cos(mθ); per mode: radial samples on the bins
  const RB = 64, rad = new Int32Array(GRID * GRID).fill(-1), mMax = Math.max(...S.m.slice(0, Nv)), cosm = new Float32Array(GRID * GRID * (mMax + 1));
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const u = ((x + 0.5) / GRID) * 2 - 1, v = 1 - ((y + 0.5) / GRID) * 2, r = Math.hypot(u, v), p = y * GRID + x;
    if (r > 1) continue;
    rad[p] = Math.min(RB - 1, Math.round(r * (RB - 1)));
    const th = Math.atan2(v, u);
    for (let m = 0; m <= mMax; m++) cosm[p * (mMax + 1) + m] = Math.cos(m * th);
  }
  const Rk = [];
  for (let i = 0; i < Nv; i++) { const a = new Float32Array(RB); for (let b = 0; b < RB; b++) a[b] = interpR(S.R[i], b / (RB - 1)); Rk.push(a); }
  const phase0 = Float32Array.from({ length: Nv }, (_, i) => (i * 2.399963) % (2 * Math.PI));
  const img = new ImageData(GRID, GRID), off = document.createElement('canvas');
  off.width = off.height = GRID;
  return { RB, rad, cosm, mMax, Rk, phase0, img, off, w: new Float32Array(GRID * GRID), Wm: new Float32Array((mMax + 1) * RB), scale: 0 };
}
const pcv = $('#plate');
animate(() => {
  if (pcv.offsetParent === null || !G) return;
  const { ctx, w, h } = fit(pcv);
  ctx.clearRect(0, 0, w, h);
  const { S, Nv } = G, P = shell.P;
  if (!plateCache) plateCache = platePixels(S, Nv);
  const pc = plateCache, now = performance.now() / 1000;
  // amplitudes: live from the engine for this key, else the pattern a soft strike would excite
  const amp = new Float32Array(Nv);
  const fresh = live && live.key === focus && live.n === Nv;
  for (let i = 0; i < Nv; i++) amp[i] = fresh ? live.amp[i] : Math.abs(interpR(S.R[i], P.strike)) / S.Om[i];
  pc.Wm.fill(0);
  for (let i = 0; i < Nv; i++) {
    const c = amp[i] * Math.cos(pc.phase0[i] + 2 * Math.PI * 0.4 * Math.sqrt(S.Om[i] / S.Om[S.tuned]) * now), base = S.m[i] * pc.RB, R = pc.Rk[i];
    for (let b = 0; b < pc.RB; b++) pc.Wm[base + b] += c * R[b];
  }
  let mx = 1e-12;
  const M1 = pc.mMax + 1;
  for (let p = 0; p < GRID * GRID; p++) {
    const rb = pc.rad[p];
    if (rb < 0) { pc.w[p] = 0; continue; }
    let s = 0;
    for (let m = 0; m < M1; m++) s += pc.Wm[m * pc.RB + rb] * pc.cosm[p * M1 + m];
    pc.w[p] = s; if (Math.abs(s) > mx) mx = Math.abs(s);
  }
  pc.scale = pc.scale ? Math.max(mx, 0.92 * pc.scale) : mx; // smoothed exaggeration
  const d = pc.img.data, neg = [124, 184, 255], pos = [230, 193, 90], bg = [22, 22, 26];
  for (let p = 0; p < GRID * GRID; p++) {
    const q = p * 4;
    if (pc.rad[p] < 0) { d[q + 3] = 0; continue; }
    const v = Math.max(-1, Math.min(1, pc.w[p] / pc.scale)), a = Math.sqrt(Math.abs(v)), col = v < 0 ? neg : pos;
    d[q] = bg[0] + a * (col[0] - bg[0]); d[q + 1] = bg[1] + a * (col[1] - bg[1]); d[q + 2] = bg[2] + a * (col[2] - bg[2]); d[q + 3] = 255;
  }
  pc.off.getContext('2d').putImageData(pc.img, 0, 0);
  const R = Math.max(2, Math.min(w, h) / 2 - 10), cx = w / 2, cy = h / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(pc.off, cx - R, cy - R, 2 * R, 2 * R);
  ctx.strokeStyle = css('--line'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke(); ctx.lineWidth = 1;
  // mallet and microphones
  ctx.fillStyle = css('--text');
  ctx.beginPath(); ctx.arc(cx + P.strike * R, cy, Math.max(1, R * 0.035), 0, 2 * Math.PI); ctx.fill();
  for (const [r, th] of MICS) { const s = Math.max(2, R * 0.05); ctx.fillRect(cx + r * R * Math.cos(th) - s / 2, cy - r * R * Math.sin(th) - s / 2, s, s); }
  if (fresh) {
    let peak = 0; for (let i = 0; i < Nv; i++) peak = Math.max(peak, amp[i] * Math.abs(interpR(S.R[i], 0)));
    $('#plate-read').textContent = `${live.nl ? 'nonlinear' : 'linear'} · modal amplitude up to ${Math.max(...amp).toFixed(2)} h${live.sub > 1 ? ` · ${live.sub} substeps` : ''}`;
  } else $('#plate-read').textContent = 'the modes a soft strike here excites';
}, pcv);

// ---- spectrogram ------------------------------------------------------------------------------
const scv = $('#spectro');
let spec = null, fbuf = null;
const SF = [40, 16000];
function heat(t) { // 0..1 → dark → accent → white
  const a = [14, 14, 18], b = [120, 60, 20], c = [230, 193, 90], d = [255, 250, 235];
  const seg = t < 0.4 ? [a, b, t / 0.4] : t < 0.8 ? [b, c, (t - 0.4) / 0.4] : [c, d, (t - 0.8) / 0.2];
  return seg[0].map((v, i) => Math.round(v + (seg[1][i] - v) * seg[2]));
}
animate(() => {
  if (scv.offsetParent === null) return;
  const { ctx, w, h } = fit(scv);
  const padL = 34, padB = 16, W = Math.max(2, Math.round(w - padL)), H = Math.max(2, Math.round(h - padB));
  if (!spec || spec.width !== W || spec.height !== H) { spec = document.createElement('canvas'); spec.width = W; spec.height = H; spec.getContext('2d').fillStyle = '#0e0e12'; spec.getContext('2d').fillRect(0, 0, W, H); }
  const sc = spec.getContext('2d');
  sc.drawImage(spec, -2, 0);
  if (analyser) {
    if (!fbuf || fbuf.length !== analyser.frequencyBinCount) fbuf = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(fbuf);
    const fs = analyser.context.sampleRate, N = fbuf.length, col = sc.createImageData(2, H);
    for (let y = 0; y < H; y++) {
      const f = SF[0] * (SF[1] / SF[0]) ** (1 - y / (H - 1)), bin = Math.min(N - 1, Math.round((f * 2 * N) / fs));
      const t = Math.max(0, Math.min(1, (fbuf[bin] + 115) / 90)), [r, g, b] = heat(t);
      for (let x = 0; x < 2; x++) { const q = (y * 2 + x) * 4; col.data[q] = r; col.data[q + 1] = g; col.data[q + 2] = b; col.data[q + 3] = 255; }
    }
    sc.putImageData(col, W - 2, 0);
  }
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(spec, padL, 0);
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    const y = (1 - Math.log(f / SF[0]) / Math.log(SF[1] / SF[0])) * (H - 1);
    ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, padL - 4, y + 3);
  }
  ctx.textAlign = 'center'; ctx.fillText('time →', padL + W / 2, h - 3);
}, scv);

// ---- energy cascade and strike-tone pitch ---------------------------------------------------------
const bcv = $('#bands');
$('#bands-legend').innerHTML = BANDS.map((b, i) => `<span><i style="background:${BAND_COL[i]}"></i>${b}</span>`).join('');
animate(() => {
  if (bcv.offsetParent === null) return;
  const { ctx, w, h } = fit(bcv);
  ctx.clearRect(0, 0, w, h);
  const padL = 34, padR = 8, top = 6, mid = Math.max(top + 10, Math.round(h * 0.68)), bot = Math.max(mid + 10, h - 16), T = 4;
  const X = (t) => padL + ((w - padL - padR) * Math.min(t, T)) / T;
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted');
  const Yb = (db) => top + ((mid - 8 - top) * -db) / 60, cmax = Math.max(50, ...history.map((q) => Math.abs(q.cents))), Yc = (c) => (mid + bot) / 2 - ((bot - mid) / 2) * (c / cmax);
  ctx.textAlign = 'right';
  for (const db of [0, -20, -40, -60]) { ctx.beginPath(); ctx.moveTo(padL, Yb(db)); ctx.lineTo(w - padR, Yb(db)); ctx.stroke(); ctx.fillText(`${db}`, padL - 4, Yb(db) + 3); }
  ctx.beginPath(); ctx.moveTo(padL, Yc(0)); ctx.lineTo(w - padR, Yc(0)); ctx.stroke();
  ctx.fillText(`+${cmax.toFixed(0)}¢`, padL - 2, Yc(cmax) + 8); ctx.fillText(`−${cmax.toFixed(0)}¢`, padL - 2, Yc(-cmax));
  ctx.textAlign = 'center';
  for (let t = 0; t <= T; t++) ctx.fillText(`${t} s`, X(t), h - 3);
  if (!history.length) return;
  const Eref = Math.max(...history.map((q) => q.E), 1e-30);
  for (let b = 0; b < BANDS.length; b++) {
    ctx.strokeStyle = BAND_COL[b]; ctx.lineWidth = 1.6; ctx.beginPath();
    history.forEach((q, i) => { const y = Yb(Math.max(-60, 10 * Math.log10(q.band[b] / Eref + 1e-12))); if (i) ctx.lineTo(X(q.t), y); else ctx.moveTo(X(q.t), y); });
    ctx.stroke();
  }
  ctx.strokeStyle = css('--accent-2'); ctx.beginPath();
  history.forEach((q, i) => { const y = Yc(q.cents); if (i) ctx.lineTo(X(q.t), y); else ctx.moveTo(X(q.t), y); });
  ctx.stroke(); ctx.lineWidth = 1;
  const last = history[history.length - 1], hi = (last.band[3] + last.band[4] + last.band[5]) / Math.max(last.E, 1e-30);
  $('#bands-read').textContent = `strike tone ${last.cents >= 0 ? '+' : ''}${last.cents.toFixed(0)} ¢ · ${(100 * hi).toFixed(1)} % of the energy above 4× the pitch`;
}, bcv);

update();
