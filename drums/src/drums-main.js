// drums-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './drums-instrument.js';
import { DRUMS } from './drums-params.js';
import { wasmModel } from './drums-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const TAU = 2 * Math.PI;
const spectrum = new SpectrumView($('#spectrum'), { fLo: 30, fHi: 8000 });
new SpectrogramView($('#spectrogram'), { spectrum });
let focus = 50, kd = null, bare = null, state = null;

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  // the drum's modes, built here (a few ms) and sent with the note, so the audio thread needn't
  noteData: (key, vel, P) => model.noteData(key, P),
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => { if (m.type === 'state') state = m; },
  onNoteOn: (key) => { if (key !== focus) { focus = key; update(); } },
  onParam: () => update(),
});

// The same head with no air and no syahi: the bare membrane's Bessel ratios, from the same tension.
function bareRatios(k) {
  const d = k.drum, pm = model.drumConstant(d, 6), pn = model.drumConstant(d, 7);
  const j0 = model.besselZero(pm, pn);
  return k.modes.map((m) => model.besselZero(m.m, m.n) / j0 * model.drumConstant(d, 8));
}

function update() {
  const P = shell.P;
  kd = model.keyDrum(focus, P);
  bare = bareRatios(kd);
  const loud = kd.modes.map((m) => Math.abs(m.far) * (TAU * m.f) ** 2 * Math.abs(model.shape(m, P.strike)));
  const top = Math.max(...loud, 1e-30);
  spectrum.set(kd.f0, kd.modes.map((m, n) => ({ f: m.f, alpha: 0.25 + 0.75 * Math.min(1, loud[n] / top) })));
  for (const s of ['#focus-name', '#focus-name-2']) $(s).textContent = noteName(focus);
  $('#modes').innerHTML = '<tr><th>mode (m,n)</th><th>f (Hz)</th><th>× note</th><th>bare head</th><th>T60 (s)</th><th>air’s share of the loss</th><th>heard</th></tr>'
    + kd.modes.map((m, n) => `<tr${n === kd.principal ? ' class="hl"' : ''}><td>(${m.m},${m.n})${n === kd.principal ? ' ★' : ''}</td><td>${m.f.toFixed(1)}</td><td>${(m.f / kd.f0).toFixed(3)}</td><td>${bare[n].toFixed(3)}</td><td>${(6.91 / m.sigma).toFixed(2)}</td><td>${(100 * m.sigmaAir / m.sigma).toFixed(0)} %</td><td>${(20 * Math.log10(Math.max(loud[n] / top, 1e-6))).toFixed(0)} dB</td></tr>`).join('');
  const area = Math.PI * kd.a * kd.a;
  const rows = [
    ['drum', `${DRUMS[kd.drum]}: a ${(200 * kd.a).toFixed(1)} cm head${kd.kettle ? ` over ${(kd.depth * area * 1000).toFixed(1)} litres of air` : ', open beneath'}`],
    ['head', `${(kd.sigma * 1000).toFixed(0)} g/m² at ${(kd.T / 1000).toFixed(2)} kN/m (wave speed ${Math.sqrt(kd.T / kd.sigma).toFixed(0)} m/s)`],
    ['note', `${noteName(focus)}, ${kd.f0.toFixed(1)} Hz: the (${kd.modes[kd.principal].m},${kd.modes[kd.principal].n}) mode${kd.drum === 1 ? ', an octave up (the second harmonic, as tabla players tune)' : ''}`],
  ];
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('#ladder-read').textContent = kd.modes.slice(0, 6).map((m) => (m.f / kd.f0).toFixed(2)).join(' : ');
}

// ---- the drumhead, from above ---------------------------------------------------------------
// w(r, θ) = Σ Aₙ Φₙ(r) cos(mθ) cos(φₙ), each mode's phase advancing at its frequency slowed down to
// a few cycles a second (so the shapes can be seen), with the amplitudes the engine posts. While the
// drum is quiet the head shows, faintly, what a stroke where the beater is set would start: each
// mode's shape under the beater over its frequency (the displacement an impulse gives it).
const RINGS = 28, SPOKES = 72, SLOW = 0.6, FAINT = 0.3; // the principal turns at 0.6 Hz
let phase = [], lastT = 0, scale = 0, shapesOf = null, shapes = null;
animate((t) => {
  const { ctx, w, h } = fit($('#head'));
  ctx.clearRect(0, 0, w, h);
  if (!kd) return;
  const P = shell.P, R = Math.max(8, Math.min(w, h) / 2 - 10), cx = w / 2, cy = h / 2;
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0; lastT = t;
  if (shapesOf !== kd) { shapesOf = kd; shapes = kd.modes.map((m) => Array.from({ length: RINGS }, (_, i) => model.shape(m, (i + 0.5) / RINGS))); }
  const live = state && state.key === focus ? state : null;
  const amps = kd.modes.map((m, n) => (live && n < live.amps.length ? live.amps[n] : 0));
  const idle = kd.modes.map((m) => model.shape(m, P.strike) / m.f);
  for (let n = 0; n < kd.modes.length; n++) phase[n] = ((phase[n] ?? Math.random() * TAU) + TAU * (kd.modes[n].f / kd.f0) * SLOW * dt) % TAU;
  const peakOf = (a) => { let p = 0; shapes.forEach((s, n) => { for (const v of s) p = Math.max(p, Math.abs(v * a[n])); }); return p; };
  const liveTop = peakOf(amps), idleTop = peakOf(idle) || 1;
  scale = Math.max(liveTop, scale * Math.exp(-dt / 1.5)); // the colours fade as the drum dies away, over a few seconds
  const faint = FAINT * (scale > 0 ? Math.max(0, 1 - liveTop / (0.25 * scale)) : 1) / idleTop;
  const A = amps.map((a, n) => (scale > 0 ? a / scale : 0) + faint * idle[n]);
  // the rim
  ctx.fillStyle = css('--panel') || '#222';
  ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, TAU); ctx.fill();
  const warm = [217, 135, 74], cool = [110, 160, 220];
  for (let i = 0; i < RINGS; i++) {
    const r0 = (i / RINGS) * R, r1 = ((i + 1) / RINGS) * R;
    for (let j = 0; j < SPOKES; j++) {
      const th = ((j + 0.5) / SPOKES) * TAU;
      let wv = 0;
      for (let n = 0; n < kd.modes.length; n++) if (A[n]) wv += A[n] * shapes[n][i] * Math.cos(kd.modes[n].m * th) * Math.cos(phase[n]);
      const v = Math.max(-1, Math.min(1, wv)), c = v > 0 ? warm : cool, k = Math.abs(v);
      const base = 38;
      ctx.fillStyle = `rgb(${base + (c[0] - base) * k | 0},${base + (c[1] - base) * k | 0},${base + (c[2] - base) * k | 0})`;
      // θ = 0 (the strike) points down, toward the player at the bottom of the picture
      const a0 = Math.PI / 2 + (j / SPOKES) * TAU, a1 = Math.PI / 2 + ((j + 1) / SPOKES) * TAU;
      ctx.beginPath(); ctx.arc(cx, cy, r1, a0, a1); ctx.arc(cx, cy, r0, a1, a0, true); ctx.closePath(); ctx.fill();
    }
  }
  // the syahi's edge
  if (kd.drum > 0 && P.syahi > 0) {
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, model.drumConstant(kd.drum, 3) * R, 0, TAU); ctx.stroke(); ctx.lineWidth = 1;
  }
  const mark = (rho, sign) => [cx, cy + sign * rho * R];
  const [sx, sy] = mark(P.strike, 1);
  ctx.fillStyle = css('--text') || '#fff';
  ctx.beginPath(); ctx.arc(sx, sy, live && live.force > 0 ? 6 : 4, 0, TAU); ctx.fill();
  if (P.rest) { const rx = cx - P.restAt * R, ry = cy; /* a quarter turn round from the strike */ ctx.strokeStyle = css('--text') || '#fff'; ctx.beginPath(); ctx.arc(rx, ry, 7, 0, TAU); ctx.stroke(); }
  if (live && live.press > 0.01) {
    const [hx, hy] = mark(0.7, -1), s = 4 + 6 * live.press;
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hx - s, hy - s); ctx.lineTo(hx + s, hy + s); ctx.moveTo(hx + s, hy - s); ctx.lineTo(hx - s, hy + s); ctx.stroke(); ctx.lineWidth = 1;
  }
  const tr = live ? live.tension : 1;
  $('#head-read').textContent = [`${(200 * kd.a).toFixed(0)} cm`, tr > 1.0005 || tr < 0.9995 ? `tension ${tr > 1 ? '+' : ''}${(100 * (tr * tr - 1)).toFixed(1)} %` : '', live && live.force > 0 ? `beater ${live.force.toFixed(1)} N` : ''].filter(Boolean).join(' · ');
}, $('#head'));

// ---- the overtones ladder ------------------------------------------------------------------
animate(() => {
  const { ctx, w, h } = fit($('#ladder'));
  ctx.clearRect(0, 0, w, h);
  if (!kd) return;
  const P = shell.P, top = 6.5, x0 = 34, x1 = w - 10, y0 = 14, y1 = h - 22;
  const X = (r) => x0 + ((x1 - x0) * r) / top;
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.strokeStyle = css('--grid');
  for (let k = 1; k <= 6; k++) { ctx.beginPath(); ctx.moveTo(X(k), y0); ctx.lineTo(X(k), y1); ctx.stroke(); ctx.fillText(`${k}`, X(k) - 3, h - 8); }
  const loud = kd.modes.map((m) => Math.abs(m.far) * (TAU * m.f) ** 2 * Math.abs(model.shape(m, P.strike)));
  const mx = Math.max(...loud, 1e-30), shown = kd.modes.map((m, n) => n).filter((n) => kd.modes[n].f / kd.f0 < top).slice(0, Math.max(4, Math.min(16, Math.floor((y1 - y0) / 12)))); // as many rows as fit
  const rowH = (y1 - y0) / Math.max(shown.length, 1);
  shown.forEach((n, i) => {
    const m = kd.modes[n], y = y0 + (i + 0.5) * rowH, r = m.f / kd.f0, g = Math.max(0, 1 + Math.log10(Math.max(loud[n] / mx, 1e-6)) / 3);
    ctx.strokeStyle = css('--muted'); ctx.beginPath(); ctx.arc(X(bare[n]), y, 3, 0, TAU); ctx.stroke();
    ctx.strokeStyle = css('--accent'); ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(X(bare[n]), y); ctx.lineTo(X(r), y); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = n === kd.principal ? css('--accent-2') : css('--accent');
    const bw = Math.max(2, g * 10);
    ctx.fillRect(X(r) - bw / 2, y - Math.min(4, rowH / 3), bw, Math.min(8, (2 * rowH) / 3));
    ctx.fillStyle = css('--muted'); ctx.fillText(`(${m.m},${m.n})`, 2, y + 3);
  });
}, $('#ladder'));

update();
