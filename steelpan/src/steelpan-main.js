// steelpan-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './steelpan-instrument.js';
import { wasmModel } from './steelpan-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 60, struck = -1e9;
const levels = new Map();   // key → amplitude of its tuned modes (thicknesses), from the engine
const history = [];         // the struck note's [time (ms), fundamental, octave, third]

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; struck = performance.now(); history.length = 0; update(); },
  onParam: () => update(),
  onMessage: (m) => {
    if (m.type !== 'pan') return;
    levels.clear();
    for (const [k, a] of m.notes) levels.set(k, a);
    if (m.focus === focus) {
      history.push([performance.now(), ...m.modes]);
      while (history.length && history[0][0] < performance.now() - 2000) history.shift();
    }
  },
});

const NAMES = ['fundamental', 'octave', 'third partial'];
const PATTERN = (m) => `(${m.i},${m.j})`;

function update() {
  const P = shell.P, modes = model.noteModes(focus, P), gains = model.strike(focus, P, P.velocity);
  const f1 = modes[0].f, peak = Math.max(...gains.map((g, i) => Math.abs(g) / (modes[i].f / f1)));
  spectrum.set(f1, modes.map((m, i) => ({ f: m.f, alpha: 0.25 + 0.65 * Math.min(1, Math.abs(gains[i]) / (m.f / f1) / peak),
    color: i === 1 ? css('--accent-2') : i === 2 ? css('--third') : undefined })));
  $('#focus-name').textContent = noteName(focus);
  $('#pan-key').textContent = noteName(focus);
  const L = model.skirt(focus, P.skirt), r = P.aspect;
  $('#focus-size').textContent = `length/width ${r.toFixed(2)} · skirt ${(100 * L).toFixed(0)} cm`;
  $('#area-read').textContent = `${noteName(focus)} · length/width ${r.toFixed(2)}`;
  $('#modes').innerHTML = '<tr><th>mode</th><th>f (Hz)</th><th>ratio</th><th>T60 (s)</th><th>strike</th><th>radiates</th></tr>'
    + modes.map((m, n) => `<tr class="${n < 3 ? 'tuned' : ''}"><td>${n < 3 ? NAMES[n] : PATTERN(m)}</td><td>${m.f.toFixed(1)}</td><td>${(m.f / f1).toFixed(3)}</td><td>${(6.91 / m.sigma).toFixed(2)}</td><td>${(Math.abs(gains[n]) / (m.f / f1) / peak).toFixed(2)}</td><td>${(20 * Math.log10(Math.max(m.rad, 1e-6))).toFixed(1)} dB</td></tr>`).join('')
    + '<tr><td class="note" colspan="6">Gold: the three modes the tuner hammers into tune, (1,1), (2,1) and (1,2) by their half-waves along and across the note. Strike: the stroke’s displacement in each mode, relative to the largest. Radiates: what the skirt lets out.</td></tr>';
}

// The pan from above: the focus note's ring (an octave from C) round the rim, the octave above
// inside it and the next one inside that, every note glowing with its amplitude.
function ringOrder(layout) { // pitch classes round the ring, from C
  const step = layout === 'chromatic' ? 1 : 7;
  return Array.from({ length: 12 }, (_, i) => (i * step) % 12);
}
animate(() => {
  const { ctx, w, h } = fit($('#pan'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 6, order = ringOrder(P.layout);
  if (R < 20) return;
  ctx.fillStyle = css('--panel'); ctx.strokeStyle = css('--steel');
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  const base = focus - (focus % 12), rings = [[base, 0.8, 0.17], [base + 12, 0.52, 0.12], [base + 24, 0.27, 0.075]];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let sounding = 0;
  for (const [b, rr, size] of rings) {
    for (let i = 0; i < 12; i++) {
      const key = b + order[i];
      if (key < 21 || key > 108) continue;
      const th = (i / 12) * 2 * Math.PI - Math.PI / 2, x = cx + rr * R * Math.cos(th), y = cy + rr * R * Math.sin(th);
      const a = levels.get(key) ?? 0, glow = Math.max(0, Math.min(1, (20 * Math.log10(Math.max(a, 1e-9)) + 60) / 45));
      if (glow > 0) sounding++;
      ctx.save(); ctx.translate(x, y); ctx.rotate(th);
      ctx.beginPath(); ctx.ellipse(0, 0, size * R, (size * R) / P.aspect, 0, 0, 2 * Math.PI);
      ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.08 + 0.85 * glow; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = key === focus ? css('--text') : css('--grid'); ctx.lineWidth = key === focus ? 2 : 1; ctx.stroke(); ctx.lineWidth = 1;
      ctx.restore();
      const px = Math.min(R / 14, 0.7 * size * R);
      ctx.font = `${Math.round(px)}px system-ui, sans-serif`;
      if (px >= 8) { ctx.fillStyle = glow > 0.5 ? css('--accent-ink') : css('--muted'); ctx.fillText(noteName(key), x, y); }
    }
  }
  $('#pan-read').textContent = sounding ? `${sounding} note${sounding > 1 ? 's' : ''} ringing` : '';
}, $('#pan'));

// The struck note's three tuned modes over the last two seconds, in dB.
animate(() => {
  const { ctx, w, h } = fit($('#flow'));
  ctx.clearRect(0, 0, w, h);
  const now = performance.now(), span = 2000, lo = -70, hi = 0;
  const X = (t) => 4 + ((w - 8) * (t - (now - span))) / span, Y = (db) => 6 + ((h - 12) * (hi - Math.max(lo, Math.min(hi, db)))) / (hi - lo);
  ctx.strokeStyle = css('--grid');
  for (let db = lo; db <= hi; db += 20) { ctx.beginPath(); ctx.moveTo(0, Y(db)); ctx.lineTo(w, Y(db)); ctx.stroke(); }
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
  for (let db = lo + 20; db <= hi; db += 20) ctx.fillText(`${db} dB`, 6, Y(db) - 2);
  const cols = [css('--accent'), css('--accent-2'), css('--third')];
  for (let p = 0; p < 3; p++) {
    ctx.strokeStyle = cols[p]; ctx.lineWidth = 2; ctx.beginPath();
    history.forEach(([t, ...a], i) => { const x = X(t), y = Y(20 * Math.log10(Math.max(a[p], 1e-9))); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke(); ctx.lineWidth = 1;
  }
  const age = (now - struck) / 1000;
  $('#flow-read').textContent = age < 30 ? `${noteName(focus)} · ${age.toFixed(1)} s · 0 dB = one thickness` : 'strike a key';
}, $('#flow'));

// The note area from above, its tuned modes' shapes, and the stick.
animate(() => {
  const { ctx, w, h } = fit($('#area'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, modes = model.noteModes(focus, P).slice(0, 4), n = modes.length, gap = 8;
  const pw = (w - gap * (n + 1)) / n, ar = P.aspect, bw = Math.min(pw, (h - 30) * ar), bh = bw / ar;
  if (bw < 16) return;
  const warm = css('--accent'), cool = css('--accent-2'), res = 28;
  ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  modes.forEach((m, k) => {
    const x0 = gap + k * (pw + gap) + (pw - bw) / 2, y0 = (h - bh) / 2 + 6;
    for (let a = 0; a < res; a++) for (let b = 0; b < res; b++) {
      const u = -1 + (2 * a + 1) / res, v = -1 + (2 * b + 1) / res, s = model.shape(m.i, m.j, u, v);
      ctx.fillStyle = s >= 0 ? warm : cool; ctx.globalAlpha = Math.abs(s) * 0.85;
      ctx.fillRect(x0 + (a * bw) / res, y0 + (b * bh) / res, bw / res + 0.5, bh / res + 0.5);
    }
    ctx.globalAlpha = 1; ctx.strokeStyle = css('--text');
    for (let q = 1; q < m.i; q++) { const x = x0 + (q * bw) / m.i; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + bh); ctx.stroke(); }
    for (let q = 1; q < m.j; q++) { const y = y0 + (q * bh) / m.j; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + bw, y); ctx.stroke(); }
    ctx.strokeStyle = css('--steel'); ctx.strokeRect(x0, y0, bw, bh);
    const sx = x0 + ((1 + P.along) * bw) / 2, sy = y0 + ((1 + P.across) * bh) / 2;
    ctx.strokeStyle = css('--text'); ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(sx - 5, sy - 5); ctx.lineTo(sx + 5, sy + 5); ctx.moveTo(sx + 5, sy - 5); ctx.lineTo(sx - 5, sy + 5); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = css('--muted');
    ctx.fillText(`${k < 3 ? NAMES[k] : PATTERN(m)} · ${(m.f / modes[0].f).toFixed(2)}`, x0 + bw / 2, y0 - 6);
  });
  ctx.textAlign = 'left';
}, $('#area'));

update();
