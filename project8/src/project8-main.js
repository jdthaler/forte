// project8-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { tunedFreq } from '../../shared/tuning.js';
import { INSTRUMENT } from './project8-instrument.js';
import { wasmModel } from './project8-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();
const K = model.constants;

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum });
let focus = 60;

const WINDOW = 6;      // s of the receiver's record on screen
const tracks = [];     // { key, t, df, amp } points from the engine's frames
const events = [];     // collisions and ends: { t, key, df, kind }
const lastDf = new Map();
let frame = { at: 0, voices: [] }; // the latest state of every trapped electron
const births = [];     // energies of the electrons played (keV)

const now = () => performance.now() / 1000;
const hue = (key) => `hsl(${(((key - 21) * 47) % 360 + 360) % 360} 80% 70%)`;

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; update(); },
  onParam: () => update(),
  onMessage: (m) => {
    const t = now();
    if (m.type === 'frame') {
      frame = { at: t, voices: m.voices };
      for (const v of m.voices) { tracks.push({ key: v.key, t, df: v.dfMHz, amp: v.amp }); lastDf.set(v.key, v.dfMHz); }
      while (tracks.length && tracks[0].t < t - WINDOW) tracks.shift();
    } else if (m.type === 'birth') {
      births.push(m.K / 1000);
      if (births.length > 2000) births.shift();
      lastDf.set(m.key, (model.cyclotron(shell.P.field, m.K) - model.cyclotron(shell.P.field, m.Kref)) / 1e6);
    } else if (m.type === 'collision' || m.type === 'end') {
      const df = lastDf.get(m.key);
      if (df !== undefined && !(m.type === 'end' && m.reason === 'replaced')) events.push({ t, key: m.key, df, kind: m.type === 'end' ? (m.reason === 'released' ? 'released' : 'out') : m.out ? 'out' : 'jump' });
      while (events.length && events[0].t < t - WINDOW) events.shift();
    }
  },
});

const fmtHz = (f) => (f >= 1e9 ? `${(f / 1e9).toFixed(3)} GHz` : f >= 1e6 ? `${(f / 1e6).toFixed(0)} MHz` : f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 10 ? 2 : 1)} Hz`);
const refEnergy = (P) => (P.source === 'tritium' ? K.T2_ENDPOINT : P.source === 'energy' ? P.energy * 1000 : K.KR_K);
const refName = (P) => (P.source === 'tritium' ? 'the endpoint' : P.source === 'energy' ? 'the start' : 'the krypton line');

function update() {
  const P = shell.P, Kr = refEnergy(P), f = tunedFreq(P, focus), g = 1 + Kr / K.ME_EV;
  const tr = model.trap(P, Kr);
  // the note, and its ceiling: the frequency it would reach if the electron cooled to rest
  const markers = [{ f, alpha: 0.9 }, { f: f * g, alpha: 0.6, color: css('--accent-2') }];
  if (P.receiver === 'antennas') for (let n = 2; n <= 6; n++) markers.push({ f: n * f, alpha: 0.35 });
  spectrum.set(f, markers);
  $('#focus-name').textContent = noteName(focus);
  const theta = (Math.acos(tr.cosMax) * 180) / Math.PI;
  $('#trap-read').textContent = `τ = ${model.coolingTime(P.field).toFixed(2)} s · bounce ${fmtHz(tr.fa)} (${fmtHz((tr.fa * f) / tr.f)} here) · holds θ > ${theta.toFixed(2)}°${P.receiver === 'guide' ? ` · h ≤ ${tr.hWall.toFixed(2)}` : ''}`;
  $('#rx-read').textContent = `MHz above ${refName(P)}, ${fmtHz(model.cyclotron(P.field, Kr))} in ${P.field.toFixed(3)} T`;
}

// The receiver: every electron's frequency in the real trap against time, the last few seconds.
animate(() => {
  const { ctx, w, h } = fit($('#waterfall'));
  ctx.clearRect(0, 0, w, h);
  const t1 = now(), t0 = t1 - WINDOW, padL = 44, padB = 18;
  let lo = 0, hi = 0;
  for (const p of tracks) { lo = Math.min(lo, p.df); hi = Math.max(hi, p.df); }
  if (hi - lo < 20) hi = lo + 20;
  const span = hi - lo; lo -= 0.05 * span; hi += 0.08 * span;
  const X = (t) => padL + ((t - t0) / WINDOW) * (w - padL - 6), Y = (df) => h - padB - ((df - lo) / (hi - lo)) * (h - padB - 6);
  // the grid: MHz and seconds
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.strokeStyle = css('--grid');
  const step = 10 ** Math.floor(Math.log10((hi - lo) / 3)) * ([1, 2, 5].find((m) => (hi - lo) / (10 ** Math.floor(Math.log10((hi - lo) / 3)) * m) <= 6) ?? 10);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(w - 6, Y(v)); ctx.stroke();
    if (Y(v) > 24) ctx.fillText(`${v.toFixed(0)}`, 4, Y(v) + 3); // not under the unit
  }
  for (let s = Math.ceil(t0); s <= t1; s++) { ctx.beginPath(); ctx.moveTo(X(s), 6); ctx.lineTo(X(s), h - padB); ctx.stroke(); }
  ctx.fillText('MHz', 4, 12); ctx.fillText(`last ${WINDOW} s`, w - 52, h - 4);
  // the reference
  ctx.strokeStyle = css('--accent-2'); ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - 6, Y(0)); ctx.stroke(); ctx.setLineDash([]);
  // the tracks, as dots that fade with the electron's signal
  for (const p of tracks) {
    ctx.fillStyle = hue(p.key); ctx.globalAlpha = Math.min(1, 0.25 + p.amp);
    ctx.fillRect(X(p.t) - 1, Y(p.df) - 1, 2.5, 2.5);
  }
  ctx.globalAlpha = 1;
  for (const e of events) {
    const x = X(e.t), y = Y(e.df);
    ctx.strokeStyle = hue(e.key);
    if (e.kind === 'jump') { ctx.beginPath(); ctx.arc(x, y, 3, 0, 2 * Math.PI); ctx.stroke(); }
    else if (e.kind === 'out') { ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke(); }
  }
}, $('#waterfall'));

// The trap: the field along the axis, and every trapped electron bouncing in it.
animate(() => {
  const { ctx, w, h } = fit($('#trap'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, pad = 16, x0 = pad, x1 = w - pad, yTop = 20, yBot = h - 22, xm = (x0 + x1) / 2, half = (x1 - x0) / 2 / 1.2;
  const X = (u) => xm + u * half, Y = (b) => yBot - b * (yBot - yTop) / 1.45; // u = z / z_wall; b = (B − B₀) / depth
  // the field: rising as z² to the walls, then held there (the trap's end coils)
  ctx.strokeStyle = css('--text'); ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i <= 120; i++) { const u = -1.2 + (2.4 * i) / 120, b = Math.min(1, u * u) + (Math.abs(u) > 1 ? 0.3 * Math.min(1, (Math.abs(u) - 1) * 6) : 0); if (i) ctx.lineTo(X(u), Y(b)); else ctx.moveTo(X(u), Y(b)); }
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.strokeStyle = css('--grid'); ctx.setLineDash([3, 4]);
  for (const u of [-1, 1]) { ctx.beginPath(); ctx.moveTo(X(u), yTop); ctx.lineTo(X(u), yBot); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x1, Y(0)); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted');
  const zw = model.trap(P, refEnergy(P)).zWall;
  ctx.fillText(`B₀ = ${P.field.toFixed(3)} T`, x0, yBot + 14);
  ctx.textAlign = 'right'; ctx.fillText(`+${P.depth < 1 ? P.depth.toFixed(2) : P.depth.toFixed(1)} mT`, X(1) - 4, Y(1) - 2); ctx.textAlign = 'left';
  ctx.fillText(`z = ±${(zw * 1000).toFixed(zw < 0.01 ? 2 : 1)} mm`, X(1) - 64, yBot + 14);
  // the electrons: z = depth · sin ψ of the wall, ψ carried on from the last frame at the bounce frequency
  const dt = now() - frame.at;
  for (const v of frame.voices) {
    const psi = v.psi + 2 * Math.PI * v.fa * dt, u = v.depth * Math.sin(psi), b = u * u;
    ctx.strokeStyle = hue(v.key); ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.moveTo(X(-v.depth), Y(v.depth ** 2)); ctx.lineTo(X(v.depth), Y(v.depth ** 2)); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = hue(v.key);
    ctx.beginPath(); ctx.arc(X(u), Y(b) - 4, 2.5 + 4 * Math.min(1, v.amp), 0, 2 * Math.PI); ctx.fill();
  }
}, $('#trap'));

// The energies of the electrons played, over tritium's β spectrum.
animate(() => {
  const { ctx, w, h } = fit($('#energies'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, padL = 8, padB = 16, top = Math.max(19, P.source === 'energy' ? P.energy * 1.1 : 19);
  const X = (k) => padL + (k / top) * (w - 2 * padL), base = h - padB;
  const bins = 76, width = top / bins, counts = new Array(bins).fill(0);
  for (const k of births) { const i = Math.floor(k / width); if (i >= 0 && i < bins) counts[i]++; }
  const most = Math.max(1, ...counts);
  // the β spectrum, scaled to the histogram's tallest bin when there is one
  const curve = []; let peak = 0;
  for (let i = 0; i <= 200; i++) { const k = (K.T2_ENDPOINT / 1000) * (i / 200), v = model.betaSpectrum(k * 1000); curve.push([k, v]); peak = Math.max(peak, v); }
  ctx.strokeStyle = css('--muted'); ctx.beginPath();
  curve.forEach(([k, v], i) => { const y = base - (v / peak) * (base - 10) * 0.9; if (i) ctx.lineTo(X(k), y); else ctx.moveTo(X(k), y); });
  ctx.stroke();
  ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.8;
  counts.forEach((c, i) => { if (c) { const y = (c / most) * (base - 10) * 0.9; ctx.fillRect(X(i * width) + 0.5, base - y, Math.max(1, X(width) - X(0) - 1), y); } });
  ctx.globalAlpha = 1;
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.strokeStyle = css('--grid');
  ctx.beginPath(); ctx.moveTo(padL, base); ctx.lineTo(w - padL, base); ctx.stroke();
  for (let k = 0; k <= top; k += top > 40 ? 50 : 5) ctx.fillText(`${k}`, X(k) - 3, h - 3);
  ctx.fillText('keV', w - 30, h - 3);
  for (const [k, c, name] of [[K.KR_K / 1000, css('--accent-2'), 'Kr'], [K.T2_ENDPOINT / 1000, css('--text'), 'E₀']]) {
    ctx.strokeStyle = c; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(k), 8); ctx.lineTo(X(k), base); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = c; ctx.fillText(name, X(k) + (name === 'Kr' ? -16 : 3), 16);
  }
  ctx.fillStyle = css('--muted'); ctx.fillText(`${births.length} electron${births.length === 1 ? '' : 's'}`, padL + 2, 12);
}, $('#energies'));

update();
