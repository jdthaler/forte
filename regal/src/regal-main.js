// regal-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { INSTRUMENT } from './regal-instrument.js';
import { wasmModel } from './regal-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const M = await wasmModel();

const $ = (s) => document.querySelector(s);
const RANKS = ['Sordun 16′', 'Regal 8′', 'Regal 4′'];
const FLOW = '#9fe39f', WEIGHT = '#9fb4c8';
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 60, reed = null, Zcurve = null, rank = 1, msg = null, windMsg = null, clock = 0;
const hist = { t: new Float64Array(512), Pc: new Float64Array(512), Pb: new Float64Array(512), P0: new Float64Array(512), n: 0 };
const WIND_SEC = 8;

const shell = createShell({
  ...INSTRUMENT,
  base: 48,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; update(); },
  onParam: (id) => { if (['resonator', 'resLength', 'curve', 'thickness', 'facing', 'q', 'regal8', 'regal4', 'regal16', '*', ...TUNING_KEEP].includes(id)) update(); },
  onMessage: (m) => {
    if (m.type === 'reed') { if (m.key) msg = m; return; }
    if (m.type !== 'wind') return;
    windMsg = m;
    clock += (6 * 128) / (m.fs || 48000);
    const N = hist.t.length, i = hist.n % N;
    hist.t[i] = clock; hist.Pc[i] = m.Pchest; hist.Pb[i] = m.Pbellows; hist.P0[i] = m.P0; hist.n++;
    $('#wind-read').textContent = `${m.Pchest.toFixed(0)} Pa in the chest · ${m.hand ? `bellows ${m.active ? 'B' : 'A'} sinking, ${(100 * (m.active ? m.fill1 : m.fill0)).toFixed(0)} % full` : 'a steady blower'} · drawn ${m.draw.toFixed(2)} L/s${m.trem > 0 ? ' · tremulant' : ''}`;
  },
});

const mm = (x, d = 1) => `${(x * 1000).toFixed(d)} mm`;
const len = (L) => (L >= 1 ? `${L.toFixed(2)} m` : `${(L * 100).toFixed(L < 0.1 ? 1 : 0)} cm`);

// The focused key's reed as the engine cuts it, its tube's impedance, and the spectrum's markers.
function update() {
  const P = shell.P, on = [P.regal16, P.regal8, P.regal4];
  rank = on[1] ? 1 : on[0] ? 0 : on[2] ? 2 : 1;
  reed = M.reed(focus, rank, P);
  const f0 = reed.f0, N = 240;
  Zcurve = { f: new Float64Array(N), z: new Float64Array(N) };
  for (let i = 0; i < N; i++) {
    const f = f0 * 0.5 * 32 ** (i / (N - 1));
    Zcurve.f[i] = f; Zcurve.z[i] = M.impedance(focus, rank, P, f).mag;
  }
  const zMax = Math.max(...Zcurve.z), H = [];
  for (let n = 1; n * f0 < 20000 && n <= 32; n++) H.push({ f: n * f0, alpha: 0.25 + 0.65 * Math.min(1, M.impedance(focus, rank, P, n * f0).mag / zMax) ** 0.5 });
  spectrum.set(f0, H);
  const peak = M.firstPeak(focus, rank, P, 0.5 * f0, 40 * f0);
  const res = reed.tube.slice(1);
  $('#res-read').textContent = `${noteName(focus)}, ${RANKS[rank]}: shallot ${len(reed.tube[0].len)} × Ø${mm(reed.ds)}`
    + (res.length ? ` · resonator ${len(res.reduce((s, t) => s + t.len, 0))} · first peak ${peak.toFixed(0)} Hz, ${(peak / f0).toFixed(2)} × the note` : ' · no resonator');
  $('#tongue-key').textContent = noteName(focus);
  $('#tongue-read').textContent = `${RANKS[rank]}: a brass tongue ${mm(reed.L)} × ${mm(reed.b)} × ${mm(reed.h, 2)}${reed.M > 0 ? `, ${(reed.M * 1000).toFixed(1)} g weight` : ''}, curved ${mm(reed.h0, 2)} off the shallot · cut to ${reed.fNat.toFixed(1)} Hz, sounds ${f0.toFixed(1)} Hz`;
}

// ---- view 1: the tongue on its shallot, one cycle slowed down -----------------------------------
const tcv = $('#tongue');
let t0 = performance.now();
animate(() => {
  const { ctx, w, h } = fit(tcv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  if (!reed) return;
  const m = msg && msg.key === focus && msg.n > 8 ? msg : null;
  const h0 = m ? m.h0 : reed.h0, L = m ? m.L : reed.L;
  // the replay: one period of the trace every 1.6 s
  let q = 0, idx = -1, perN = 0;
  if (m) {
    perN = Math.max(4, Math.min(m.n, Math.round(1 / (m.fSound || m.f0) / m.dt)));
    const ph = ((performance.now() - t0) / 1600) % 1;
    idx = m.n - perN + Math.floor(ph * perN);
    q = m.q[idx];
  }
  // the picture: the shallot's face along the bottom of the upper part, the tongue above it
  const top = 14, pic = 0.55 * h, x0 = 0.08 * w, x1 = 0.92 * w, face = top + 0.78 * (pic - top);
  const vs = (0.5 * (pic - top)) / Math.max(h0, 1e-6); // the tongue's height, exaggerated
  const sx = (u) => x0 + u * (x1 - x0);
  // the boot (wind) and the shallot below the face (its pressure as its tint)
  const pd = m ? m.pd[idx] : 0, Pb = m ? m.Pb[idx] : 0, Pref = Math.max(200, shell.P.pressure);
  const tint = (p) => (p >= 0 ? `rgba(230, 160, 70, ${Math.min(0.3, (0.15 * p) / Pref)})` : `rgba(120, 170, 240, ${Math.min(0.4, (-0.2 * p) / Pref)})`);
  ctx.fillStyle = tint(Pb); ctx.fillRect(x0 - 10, top, x1 - x0 + 20, face - top);
  ctx.fillStyle = tint(pd); ctx.fillRect(sx(0.05), face + 3, sx(0.95) - sx(0.05), pic - face - 3);
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'left';
  ctx.fillText(`boot: ${Pb.toFixed(0)} Pa`, x0 + 14, top + 10);
  ctx.fillText(`shallot: ${pd.toFixed(0)} Pa`, sx(0.06), pic - 4);
  // the shallot's face (brass), its opening, and the wedge clamping the tongue
  ctx.fillStyle = '#b08d4a'; ctx.fillRect(x0 - 10, face, x1 - x0 + 20, 3);
  ctx.fillStyle = css('--bg') || '#111'; ctx.fillRect(sx(0.08), face, sx(0.97) - sx(0.08), 3);
  ctx.fillStyle = '#7a6a50'; ctx.fillRect(x0 - 12, face - 0.5 * (pic - top) - 6, 14, 0.5 * (pic - top) + 6);
  // the tuning wire, pressing the tongue near its root
  ctx.strokeStyle = '#c9c9c9'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sx(0) + 6, top + 2); ctx.lineTo(sx(0) + 6, face - 4); ctx.stroke();
  // the tongue: g(u) = u²(h0 − q(3 − u)/2), lying on the face where it would go through it
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) {
    const u = i / 80, g = Math.max(0, u * u * (h0 - (q * (3 - u)) / 2));
    const X = sx(u), Y = face - 1.5 - g * vs;
    if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
  }
  ctx.stroke(); ctx.lineWidth = 1;
  // the jet: where the tip is open, an arrow down into the shallot, as wide as the flow
  const gTip = h0 - q;
  if (m && gTip > 0) {
    const Umax = Math.max(1e-9, ...m.U.subarray(Math.max(0, m.n - perN), m.n)), U = Math.max(0, m.U[idx]);
    ctx.strokeStyle = FLOW; ctx.lineWidth = 1 + 4 * (U / Umax);
    const xt = sx(1) + 6;
    ctx.beginPath(); ctx.moveTo(xt, face - gTip * vs - 4); ctx.lineTo(xt, face + 12); ctx.moveTo(xt - 4, face + 7); ctx.lineTo(xt, face + 13); ctx.lineTo(xt + 4, face + 7); ctx.stroke();
    ctx.lineWidth = 1;
  }
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  ctx.fillText(m ? (gTip > 0 ? `open ${mm(gTip, 2)}` : 'shut') : 'play a key', x1, top + 10);
  // the traces: the last period, with a cursor at the replay
  const ty0 = pic + 12, ty1 = h - 4, tm = (ty0 + ty1) / 2, th = (ty1 - ty0) / 2;
  ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(x0, tm); ctx.lineTo(x1, tm); ctx.stroke();
  if (!m) return;
  const a = m.n - perN, series = [
    [m.q, css('--accent'), Math.max(h0, ...Array.from(m.q.subarray(a, m.n), Math.abs))],
    [m.pd, css('--accent-2'), Math.max(1, ...Array.from(m.pd.subarray(a, m.n), Math.abs))],
    [m.U, FLOW, Math.max(1e-9, ...Array.from(m.U.subarray(a, m.n), Math.abs))],
  ];
  for (const [y, col, sc] of series) {
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < perN; i++) { const X = x0 + (i / (perN - 1)) * (x1 - x0), Y = tm - (th * y[a + i]) / sc; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  // the tip touching the shallot: the tongue's shut line
  const qs = series[0][2], ys = tm - (th * h0) / qs;
  ctx.setLineDash([3, 4]); ctx.strokeStyle = css('--muted'); ctx.beginPath(); ctx.moveTo(x0, ys); ctx.lineTo(x1, ys); ctx.stroke(); ctx.setLineDash([]);
  const xc = x0 + ((idx - a) / (perN - 1)) * (x1 - x0);
  ctx.strokeStyle = css('--text'); ctx.beginPath(); ctx.moveTo(xc, ty0); ctx.lineTo(xc, ty1); ctx.stroke();
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'left';
  ctx.fillText('tip shut', x0 + 2, ys - 3);
}, tcv);

// ---- view 2: the resonator to scale, and its impedance ------------------------------------------
const rcv = $('#resonator');
animate(() => {
  const { ctx, w, h } = fit(rcv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  if (!reed) return;
  const tube = reed.tube, total = tube.reduce((s, t) => s + t.len, 0);
  const rMax = Math.max(...tube.map((t) => Math.sqrt(t.area / Math.PI)));
  const pTop = 8, pH = 0.36 * h, x0 = 16, x1 = w - 16;
  const sc = Math.min((x1 - x0) / total, (0.45 * pH) / rMax), yc = pTop + pH / 2;
  let x = x0;
  ctx.fillStyle = 'rgba(217, 164, 65, 0.25)'; ctx.strokeStyle = css('--accent');
  tube.forEach((t, i) => {
    const r = Math.sqrt(t.area / Math.PI) * sc, wd = t.len * sc;
    ctx.fillStyle = i === 0 ? 'rgba(176, 141, 74, 0.45)' : 'rgba(217, 164, 65, 0.22)';
    ctx.fillRect(x, yc - r, wd, 2 * r);
    ctx.beginPath(); ctx.moveTo(x, yc - r); ctx.lineTo(x + wd, yc - r); ctx.moveTo(x, yc + r); ctx.lineTo(x + wd, yc + r); ctx.stroke();
    x += wd;
  });
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'left';
  ctx.fillText('reed ▸ shallot', x0, pTop + pH + 2);
  ctx.textAlign = 'right';
  ctx.fillText(`${len(total)} to the mouth`, Math.max(x, x0 + 120), pTop + pH + 2);
  // |Z(f)|, log, with the harmonics
  if (!Zcurve) return;
  const g0 = pTop + pH + 14, g1 = h - 14, f0 = reed.f0, fl = Zcurve.f[0], fh = Zcurve.f[Zcurve.f.length - 1];
  const lz = Array.from(Zcurve.z, (z) => Math.log10(z)), zl = Math.min(...lz), zh = Math.max(...lz);
  const X = (f) => x0 + (Math.log(f / fl) / Math.log(fh / fl)) * (x1 - x0), Y = (l) => g1 - ((l - zl) / Math.max(1e-6, zh - zl)) * (g1 - g0);
  ctx.strokeStyle = css('--grid');
  for (let n = 1; n * f0 <= fh; n++) { const xx = X(n * f0); ctx.beginPath(); ctx.moveTo(xx, g0); ctx.lineTo(xx, g1); ctx.stroke(); }
  ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 1.5; ctx.beginPath();
  lz.forEach((l, i) => { const xx = X(Zcurve.f[i]), yy = Y(l); if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); });
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  for (const n of [1, 2, 4, 8, 16]) if (n * f0 <= fh) ctx.fillText(n === 1 ? 'note' : `${n}`, X(n * f0), h - 3);
}, rcv);

// ---- view 3: the bellows and the wind -----------------------------------------------------------
const wcv = $('#wind');
animate(() => {
  const { ctx, w, h } = fit(wcv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  const m = windMsg, hand = m ? m.hand > 0 : shell.P.bellows === 'hand';
  // the two wedge bellows, hinged at the left, each opened by its fill
  const bw = Math.min(0.32 * w, 1.4 * h), bx = 10, base = h - 12;
  for (let k = 0; k < 2; k++) {
    const fill = hand ? (m ? (k ? m.fill1 : m.fill0) : 1) : 0.5, y = base - k * 0.46 * h;
    const th = Math.asin(Math.min(1, fill) * Math.sin(0.25)), lift = Math.min(0.3 * h, bw * Math.tan(th));
    ctx.fillStyle = 'rgba(160, 120, 70, 0.3)';
    ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx + bw, y); ctx.lineTo(bx + bw, y - lift); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = (m && m.active === k && hand) ? css('--accent') : css('--muted'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx + bw, y - lift); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = '#7a6a50'; ctx.fillRect(bx + 0.7 * bw - 6, y - 0.7 * lift - 10, 12, 8); // the weight
    ctx.fillStyle = css('--muted'); ctx.textAlign = 'left';
    ctx.fillText(hand ? `${k ? 'B' : 'A'}${m && m.active === k ? ' (sinking)' : ''}` : 'blower', bx + 2, y - 3);
  }
  // the last eight seconds of the wind
  const gx0 = bx + bw + 24, gx1 = w - 8, g0 = 10, g1 = h - 14;
  const N = hist.t.length, cnt = Math.min(hist.n, N);
  if (!cnt) { ctx.fillStyle = css('--muted'); ctx.fillText('start the audio', gx0, (g0 + g1) / 2); return; }
  const tEnd = hist.t[(hist.n - 1) % N], idx = [];
  for (let j = 0; j < cnt; j++) { const i = (hist.n - cnt + j) % N; if (hist.t[i] >= tEnd - WIND_SEC) idx.push(i); }
  let lo = Infinity, hi = -Infinity;
  for (const i of idx) for (const v of [hist.Pc[i], hist.Pb[i], hist.P0[i]]) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const mid = (lo + hi) / 2, span = Math.max(hi - lo, 0.06 * mid);
  lo = mid - 0.6 * span; hi = mid + 0.6 * span;
  const X = (t) => gx1 - ((tEnd - t) / WIND_SEC) * (gx1 - gx0), Y = (p) => g1 - ((p - lo) / (hi - lo)) * (g1 - g0);
  for (const [k, col] of [['P0', WEIGHT], ['Pb', css('--accent-2')], ['Pc', css('--accent')]]) {
    ctx.strokeStyle = col; ctx.lineWidth = k === 'Pc' ? 1.5 : 1; ctx.beginPath();
    idx.forEach((i, j) => { const xx = X(hist.t[i]), yy = Y(hist[k][i]); if (j) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); });
    ctx.stroke();
  }
  ctx.lineWidth = 1; ctx.fillStyle = css('--muted'); ctx.textAlign = 'left';
  ctx.fillText(`${hi.toFixed(0)} Pa`, gx0, g0 + 8); ctx.fillText(`${lo.toFixed(0)} Pa`, gx0, g1 - 2);
  ctx.textAlign = 'right'; ctx.fillText(`${WIND_SEC} s`, gx1, h - 2);
}, wcv);

update();
