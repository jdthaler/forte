// pulsars-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { tunedFreq } from '../../shared/tuning.js';
import { INSTRUMENT } from './pulsars-instrument.js';
import { wasmModel } from './pulsars-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();
const K = model.constants;

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum });
let focus = 60;
const flashes = new Map(); // keys switched on, and when (for the lighthouse's glow)

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; update(); },
  onParam: () => update(),
  onMessage: (m) => { if (m.type === 'pulsar') flashes.set(m.key, { ...m, at: performance.now() }); },
});

const fmtT = (t) => (t < 1e-7 ? 'under 0.1 µs' : t < 1e-3 ? `${(t * 1e6).toFixed(t < 1e-5 ? 1 : 0)} µs` : t < 1 ? `${(t * 1000).toFixed(t < 0.01 ? 2 : 1)} ms` : `${t.toFixed(2)} s`);
const fmtF = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 100 ? 1 : 0)} Hz`);
const fmtMHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} GHz` : `${f.toFixed(0)} MHz`);
const DEG = 180 / Math.PI;

let geo = null, prof = null, tabs = null, sweepDirty = true;
function update() {
  const P = shell.P;
  geo = model.geometry(focus, P);
  prof = model.profile(focus, P, 256);
  tabs = model.tables(focus, P, { m: 256 });
  sweepDirty = true;
  // the spectrum's markers: the harmonics of the spin, each as bright as what the way here and the
  // telescope let through of it
  const markers = [];
  for (let n = 1; n <= 32 && n * geo.f < 20000; n++) {
    const w = 2 * Math.PI * n * geo.f, a = model.transfer(focus, P, 0, w), b = model.transfer(focus, P, 1, w);
    const g = 0.5 * (Math.hypot(...a) + Math.hypot(...b));
    markers.push({ f: n * geo.f, alpha: 0.12 + 0.8 * Math.min(1, g) });
  }
  spectrum.set(geo.f, markers);
  for (const id of ['#focus-name', '#focus-name2', '#focus-name3']) $(id).textContent = noteName(focus);
  const fast = geo.f > K.BREAK_UP ? ' · faster than the star can hold together' : geo.f > K.FASTEST ? ' · faster than any pulsar known' : '';
  $('#psr-read').textContent = `${fmtF(geo.f)}, a turn every ${fmtT(1 / geo.f)} · light cylinder ${geo.rlc.toFixed(0)} km · beam ${(geo.rho * DEG).toFixed(0)}° wide${fast}`;
  $('#way-read').textContent = `DM ${P.dm.toFixed(1)} · band ${fmtMHz(P.freq * (1 - P.bandwidth / 2))}–${fmtMHz(P.freq * (1 + P.bandwidth / 2))}, delays across it ${fmtT(geo.sweep)} · smear left ${fmtT(Math.max(geo.smearL, geo.smearR))} · scattering ${fmtT(geo.tauS)}`;
}

// The star seen from the side: the spin axis upright, the magnetic axis turning about it with its
// two beams, and the line of sight to the Earth. The turn is strobed down to something the eye can
// follow; the sightline lights up as a beam crosses it, as bright as the profile there.
const STROBE = 0.35; // turns a second, as drawn
const t0 = performance.now();
function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
animate(() => {
  const { ctx, w, h } = fit($('#beam'));
  ctx.clearRect(0, 0, w, h);
  if (!geo || !prof) return;
  const cx = w * 0.42, cy = h * 0.52, Lb = Math.max(10, Math.min(w * 0.36, h * 0.44)), rs = Math.max(4, Lb * 0.12);
  const phi = 2 * Math.PI * (((performance.now() - t0) / 1000) * STROBE % 1);
  const al = geo.alpha, ze = geo.zeta, rho = geo.rho;
  // screen: x right, y up = the spin axis; a little of the depth shown, tilting the view
  const tilt = 0.25;
  const proj = (v) => [cx + Lb * (v[0] + tilt * 0.4 * v[1]), cy - Lb * (v[2] - tilt * 0.3 * v[1])];
  // the spin axis
  ctx.strokeStyle = css('--grid'); ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(...proj([0, 0, -1.15])); ctx.lineTo(...proj([0, 0, 1.15])); ctx.stroke(); ctx.setLineDash([]);
  // the two beams: cones of half-angle ρ about ±m
  const m = [Math.sin(al) * Math.cos(phi), Math.sin(al) * Math.sin(phi), Math.cos(al)];
  for (const sg of [1, -1]) {
    const a = m.map((x) => sg * x);
    // two unit vectors across the axis
    const ref = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let u = [a[1] * ref[2] - a[2] * ref[1], a[2] * ref[0] - a[0] * ref[2], a[0] * ref[1] - a[1] * ref[0]];
    const nu = Math.hypot(...u); u = u.map((x) => x / nu);
    const v = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
    const rim = [];
    for (let i = 0; i < 40; i++) {
      const t = (2 * Math.PI * i) / 40, c = Math.cos(rho), s = Math.sin(rho);
      rim.push(proj([0, 1, 2].map((k) => a[k] * c + (u[k] * Math.cos(t) + v[k] * Math.sin(t)) * s)));
    }
    const pts = hull([[cx, cy], ...rim]);
    ctx.fillStyle = css(sg > 0 ? '--accent' : '--accent-2'); ctx.globalAlpha = 0.18 + 0.1 * (a[1] < 0);
    ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q))); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.6; ctx.strokeStyle = ctx.fillStyle;
    ctx.beginPath(); rim.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q))); ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...proj(a.map((x) => x * 1.1))); ctx.stroke();
  }
  // the star
  ctx.fillStyle = css('--text'); ctx.beginPath(); ctx.arc(cx, cy, rs, 0, 2 * Math.PI); ctx.fill();
  // the sightline to the Earth, lit as bright as the beam where it crosses
  const o = [Math.sin(ze), 0, Math.cos(ze)];
  const ph = (phi / (2 * Math.PI) + 0.5) % 1; // the profile's phase (−½ … ½ turn as 0 … 1)
  const lit = prof[Math.min(prof.length - 1, Math.round(ph * (prof.length - 1)))];
  const end = proj(o.map((x) => x * 1.45));
  ctx.strokeStyle = css('--muted'); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...end); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.15 + 0.85 * lit;
  ctx.beginPath(); ctx.arc(...end, 4 + 8 * lit, 0, 2 * Math.PI); ctx.fill(); ctx.globalAlpha = 1;
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted');
  ctx.fillText('to the Earth', end[0] - 26, end[1] - 12);
  ctx.fillText(`α ${(al * DEG).toFixed(0)}°  ζ ${(ze * DEG).toFixed(0)}°  ρ ${(rho * DEG).toFixed(0)}°`, 6, h - 6);
  ctx.fillText(`strobed: ${STROBE} turns a second shown, ${fmtF(geo.f)} really`, 6, 12);
}, $('#beam'));

// One turn of the pulse: the beam along the sightline (dashed), and what the telescope makes of it
// in each half of its band (the upper, left; the lower, right), on one scale.
animate(() => {
  const { ctx, w, h } = fit($('#profile'));
  ctx.clearRect(0, 0, w, h);
  if (!tabs || !prof) return;
  const m = tabs.L.length, top = Math.max(1e-9, tabs.peak, ...tabs.L, ...tabs.R), x0 = 6, x1 = w - 6, yb = h - 16, yt = 14;
  const X = (i) => x0 + ((x1 - x0) * i) / (m - 1), Y = (v) => yb - ((yb - yt) * v) / top;
  ctx.strokeStyle = css('--grid');
  ctx.beginPath(); ctx.moveTo(x0, yb); ctx.lineTo(x1, yb); ctx.stroke();
  for (const d of [-90, 0, 90]) { const x = x0 + ((x1 - x0) * (d + 180)) / 360; ctx.beginPath(); ctx.moveTo(x, yt); ctx.lineTo(x, yb); ctx.stroke(); }
  // the beam as it is, scaled as the tables are
  ctx.strokeStyle = css('--muted'); ctx.setLineDash([4, 3]); ctx.beginPath();
  prof.forEach((v, i) => { const x = x0 + ((x1 - x0) * i) / (prof.length - 1), y = Y(v * tabs.peak); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.stroke(); ctx.setLineDash([]);
  for (const [arr, col] of [[tabs.R, '--accent-2'], [tabs.L, '--accent']]) {
    ctx.strokeStyle = css(col); ctx.lineWidth = 2; ctx.beginPath();
    arr.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.stroke(); ctx.lineWidth = 1;
  }
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted');
  ctx.fillText('−180°', x0, h - 3); ctx.fillText('0°', (x0 + x1) / 2 - 4, h - 3); ctx.fillText('180°', x1 - 24, h - 3);
  ctx.fillText(`${tabs.harmonics} harmonics`, x1 - 70, 11);
}, $('#profile'));

// Phase against frequency: each channel across the band, its pulses folded on the turn (two turns
// shown). Undedispersed, the pulse slides later down the band, along the dispersion curve; a
// filterbank or coherent dedispersion stands it upright, and scattering drags out its tail at the
// bottom of the band.
const ROWS = 48, COLS = 128;
let sweepImg = null, sweepCv = null;
animate(() => {
  const cv = $('#sweep'), { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  if (!geo) return;
  const P = shell.P, lo = P.freq * (1 - P.bandwidth / 2), hi = P.freq * (1 + P.bandwidth / 2);
  const x0 = 40, x1 = w - 6, yt = 6, yb = h - 16;
  if (x1 - x0 < 8 || yb - yt < 8) return;
  if (sweepDirty || !sweepImg) {
    sweepDirty = false;
    const width = P.dedisp === 'filterbank' ? (hi - lo) / P.channels : (hi - lo) / ROWS;
    const rows = [];
    let big = 1e-9;
    for (let r = 0; r < ROWS; r++) {
      const f = hi - ((r + 0.5) * (hi - lo)) / ROWS, row = model.channel(focus, P, f, width, COLS);
      rows.push(row); for (const v of row) big = Math.max(big, v);
    }
    const img = new ImageData(2 * COLS, ROWS), c = css('--accent').match(/[0-9a-f]{2}/gi)?.map((x) => parseInt(x, 16)) ?? [230, 193, 90];
    for (let r = 0; r < ROWS; r++) for (let j = 0; j < 2 * COLS; j++) {
      const v = Math.max(0, rows[r][j % COLS] / big), k = 4 * (r * 2 * COLS + j);
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = Math.round(255 * Math.min(1, v));
    }
    sweepImg = img;
    sweepCv ??= Object.assign(document.createElement('canvas'), { width: 2 * COLS, height: ROWS });
    sweepCv.getContext('2d').putImageData(sweepImg, 0, 0);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sweepCv, x0, yt, x1 - x0, yb - yt);
  // the dispersion curve, folded on the turn, where nothing takes it out
  if (P.dedisp === 'none') {
    ctx.strokeStyle = css('--accent-2'); ctx.setLineDash([3, 3]); ctx.beginPath();
    let last = null;
    for (let r = 0; r <= 120; r++) {
      const f = hi - (r * (hi - lo)) / 120, d = (model.delay(P.dm, f) - model.delay(P.dm, hi)) * geo.f, ph = (((d + 0.5) % 1) + 1) % 1;
      const x = x0 + ((x1 - x0) * ph) / 2, y = yt + ((yb - yt) * r) / 120;
      if (last === null || Math.abs(ph - last) > 0.5) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      last = ph;
    }
    ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted');
  ctx.fillText(fmtMHz(hi), 2, yt + 9); ctx.fillText(fmtMHz(lo), 2, yb);
  ctx.fillText('two turns →', x1 - 64, h - 3);
}, $('#sweep'));

update();
