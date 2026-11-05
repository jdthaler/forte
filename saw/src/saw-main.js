// saw-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { tunedFreq } from '../../shared/tuning.js';
import { INSTRUMENT } from './saw-instrument.js';
import { wasmModel } from './saw-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'), { fLo: 60, fHi: 12000 });
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 69;
let state = null; // the engine's latest report on the newest saw
let plan = null;  // the model's blade, bent for the focused note

const shell = createShell({
  ...INSTRUMENT,
  base: 60, // Z = C4: a 26-inch saw plays from about C4 up two octaves
  arrows: { param: 'velocity', step: 0.05 },
  holdHint: { ms: 400, text: 'Hold the key down: the bow draws while it is held, and the trapped mode takes a moment to build up.' },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => {
    if (m.type !== 'state') return;
    state = m.key >= 0 ? m : null;
    if (state && state.key !== focus) { focus = state.key; update(); }
  },
  onNoteOn: (key) => { if (shell.P.mode !== 'saw' || !state?.held) { focus = key; update(); } },
  onPanic: () => { state = null; },
  onParam: () => update(),
});

const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 100 ? 1 : 0)} Hz`);
const fmtCm = (m) => `${(m * 100).toFixed(m < 0.1 ? 1 : 0)} cm`;
const t60 = (sigma) => Math.log(1000) / sigma;
const fmtT = (s) => (s >= 100 ? 'minutes' : s >= 1 ? `${s.toFixed(1)} s` : `${(s * 1000).toFixed(0)} ms`);
const isS = () => shell.P.shape === 'S';

function update() {
  const P = shell.P, f = tunedFreq(P, focus);
  plan = model.plan(f, P);
  const n = model.NMODES_Q[0];
  spectrum.set(f, plan.fm.slice(0, n).map((fm, j) => ({ f: fm, alpha: j === 0 ? 0.95 : 0.35 })));
  $('#focus-name').textContent = `${noteName(focus)} · ${fmtHz(f)}`;
  const where = `${fmtCm(plan.s * model.LEN * plan.lambda)} from the handle, where the blade is ${fmtCm(plan.W)} wide`;
  const scaled = Math.abs(plan.lambda - 1) > 1e-6 ? `, on a saw ${plan.lambda > 1 ? `${plan.lambda.toFixed(1)}× as big` : `${(1 / plan.lambda).toFixed(1)}× as small`} (past a 26-inch saw's compass)` : '';
  const rows = [['the S', `turns over ${where}${scaled}`]];
  if (isS()) {
    rows.push(['the trap', `ε = ${plan.eps2.toFixed(3)}: the mode spans ±${fmtCm(plan.ell[0])} along the blade, and the next one up is at ${(plan.fm[1] / f).toFixed(3)}× the note`]);
    rows.push(['ring', `${fmtT(t60(plan.sigma[0]))} (the steel and the air alone: ${fmtT(t60(plan.sigma[0] - plan.leak[0]))}; leaking to the hands: ${plan.leak[0] > 1e-9 ? fmtT(t60(plan.leak[0])) : 'never'})`]);
  } else {
    rows.push(['the trap', 'none: a J never turns over, so the note\'s waves run out to the hands']);
    rows.push(['ring', `${fmtT(t60(plan.sigma[0]))} (Q ≈ ${model.Q_J}, as Shankar, Bryde and Mahadevan measured a J)`]);
  }
  rows.push(P.excite === 'bow'
    ? ['bow', `speaks above ${(1000 * plan.threshold).toFixed(0)} mN on the edge at ${(P.speed * 100).toFixed(0)} cm/s; pressing ${P.force.toFixed(1)}× that`]
    : ['mallet', `${P.contact.toFixed(1)} ms of felt on the steel: it reaches up to about ${fmtHz(1 / (0.001 * P.contact))}`]);
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('#trap-read').textContent = `${noteName(focus)}${isS() ? `: ε ${plan.eps2.toFixed(2)}` : ': a J, no trap'}`;
}

// ---- views -----------------------------------------------------------------------
const visible = (cv) => cv.offsetParent !== null;
const live = () => (state && state.key === focus ? state : null);
// How much the note's mode moves now, 0..1, from the engine's report.
const swing = () => { const s = live(); return s ? Math.min(1, Math.sqrt(s.amps[0] / 2e-5)) : 0; };

// The curvature at x metres from the inflection, on the blade the plan bends (1/m).
const curvature = (x) => {
  if (!plan) return 0;
  return isS() ? plan.b0 * Math.tanh((plan.bend * x) / plan.b0) : plan.b0;
};

// The saw: the S from the side, the blade from above with the mode glowing.
animate((t) => {
  const cv = $('#saw');
  if (!visible(cv) || !plan) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, s = live(), A = swing();
  const x0 = 22, x1 = w - 22, Lb = model.LEN, sc = (x1 - x0) / Lb; // px per metre of the 26-inch blade
  const zs = plan.s; // the inflection, as a fraction of the length
  // ---- the side view, top half: integrate the curvature (drawn 4× deeper)
  const yMid = h * 0.27, N = 120, pts = [];
  let th = 0, X = 0, Y = 0;
  const kOf = (z) => curvature((z - zs) * Lb * plan.lambda) * plan.lambda; // on the blade as drawn
  for (let i = 0; i <= N; i++) {
    const z = i / N;
    pts.push([X, Y]);
    th += 4 * kOf(z) * (Lb / N); X += Math.cos(th) * (Lb / N); Y += Math.sin(th) * (Lb / N);
  }
  // level the chord from handle to tip
  const [ex, ey] = pts[N], tilt = Math.atan2(ey, ex), c = Math.cos(-tilt), sn = Math.sin(-tilt);
  const P2 = pts.map(([px, py]) => [x0 + (px * c - py * sn) * sc * (Lb / Math.hypot(ex, ey)), yMid + (px * sn + py * c) * sc]);
  // the handle and the hands
  ctx.fillStyle = css('--accent-2'); ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.roundRect(P2[0][0] - 18, P2[0][1] - 9, 20, 18, 5); ctx.fill();
  ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(P2[N][0] + 6, P2[N][1], 8, 0, 2 * Math.PI); ctx.fill();
  ctx.globalAlpha = 1;
  // the blade
  ctx.strokeStyle = css('--text'); ctx.lineWidth = 2.5; ctx.beginPath();
  P2.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.stroke(); ctx.lineWidth = 1;
  // the trapped mode, shimmering about the inflection
  const iS = Math.round(zs * N), ell = plan.ell[0] / plan.lambda; // the mode's length on the drawn blade
  if (isS()) {
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 6;
    for (let i = 1; i <= N; i++) {
      const z = (i - 0.5) / N, g = Math.exp(-((((z - zs) * Lb) / ell) ** 2));
      if (g < 0.02) continue;
      ctx.globalAlpha = Math.min(1, 0.15 + A) * g;
      ctx.beginPath(); ctx.moveTo(...P2[i - 1]); ctx.lineTo(...P2[i]); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
    ctx.fillStyle = css('--accent'); ctx.beginPath(); ctx.arc(P2[iS][0], P2[iS][1], 3.5, 0, 2 * Math.PI); ctx.fill();
  }
  // the bow or the mallet, at its place from the inflection
  const zb = Math.min(0.99, Math.max(0.01, zs + (0.01 * P.place) / Lb)), [bx, by] = P2[Math.round(zb * N)];
  if (P.excite === 'bow') {
    const on = s && s.N > 0, lift = on ? 0 : 6, d = Math.min(26, h * 0.12);
    ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 3; ctx.globalAlpha = on ? 1 : 0.4;
    ctx.beginPath(); ctx.moveTo(bx - d * 0.35, by + lift + d); ctx.lineTo(bx + d * 0.35, by + lift - d); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  } else {
    const down = s && s.mallet ? 0 : 10;
    ctx.fillStyle = css('--accent-2'); ctx.beginPath(); ctx.arc(bx, by - 7 - down, 5, 0, 2 * Math.PI); ctx.fill();
  }
  // ---- the top view, bottom half: the tapered blade and the mode on it
  const yc = h * 0.72, wPx = Math.min(h * 0.4, (model.W_HEEL / Lb) * (x1 - x0)) / model.W_HEEL; // px per metre across
  const half = (z) => (model.widthAt(z) * wPx) / 2;
  ctx.fillStyle = css('--grid'); ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(x0, yc - half(0)); ctx.lineTo(x1, yc - half(1)); ctx.lineTo(x1, yc + half(1)); ctx.lineTo(x0, yc + half(0)); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = css('--muted'); ctx.stroke();
  // the mode: φ₂ across × h₀ along, its sign flickering at the note (slowed to be seen)
  const cols = 90, rows = 14, ph = Math.cos(t / 120);
  for (let i = 0; i < cols; i++) {
    const z = (i + 0.5) / cols, xpx = x0 + z * (x1 - x0), g = isS() ? Math.exp(-0.5 * (((z - zs) * Lb) / ell) ** 2) : 0.25;
    if (g < 0.03) continue;
    const hh = half(z);
    for (let j = 0; j < rows; j++) {
      const u = (j + 0.5) / rows, v = (model.cross(0, u) / 2) * g * ph;
      ctx.fillStyle = v > 0 ? css('--accent') : css('--accent-2');
      ctx.globalAlpha = Math.min(1, Math.abs(v) * (0.15 + 1.2 * A));
      ctx.fillRect(xpx - (x1 - x0) / cols / 2, yc - hh + (u - 1 / rows / 2) * 2 * hh, (x1 - x0) / cols + 0.5, (2 * hh) / rows + 0.5);
    }
  }
  ctx.globalAlpha = 1;
  if (isS()) { // the inflection line across the blade
    const xi = x0 + zs * (x1 - x0);
    ctx.strokeStyle = css('--accent'); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xi, yc - half(zs) - 4); ctx.lineTo(xi, yc + half(zs) + 4); ctx.stroke(); ctx.setLineDash([]);
  }
  const readout = s ? `${fmtHz(s.f)}${P.excite === 'bow' && s.N > 0 ? ` · bow ${(1000 * s.N).toFixed(0)} mN, sticking ${(100 * s.sticks).toFixed(0)} %` : ''}` : '';
  $('#saw-read').textContent = readout;
}, $('#saw'));

// The trap: the band edge along the blade, the note, and the mode in the dip.
animate(() => {
  const cv = $('#trap');
  if (!visible(cv) || !plan) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const f = plan.fm[0], L = model.LEN * plan.lambda, x0 = 40, x1 = w - 8, y0 = 8, y1 = h - 18;
  const top = 2.2 * f, X = (z) => x0 + z * (x1 - x0), Yf = (v) => y1 - (Math.min(v, top) / top) * (y1 - y0);
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right';
  for (const v of [0, f, 2 * f]) { ctx.beginPath(); ctx.moveTo(x0, Yf(v)); ctx.lineTo(x1, Yf(v)); ctx.stroke(); ctx.fillText(fmtHz(v), x0 - 3, Yf(v) + 3); }
  ctx.textAlign = 'center';
  ctx.fillText('handle', X(model.GRIP_HEEL), h - 4); ctx.fillText('tip', X(model.GRIP_TIP), h - 4);
  // the band edge of the note's shape across the blade
  const N = 160, edge = [];
  for (let i = 0; i <= N; i++) {
    const z = i / N, x = (z - plan.s) * L;
    if (isS()) edge.push(model.bandEdge(f, shell.P, 0, x));
    else { const q = model.BETA[0] / (model.widthAt(z) * plan.lambda); edge.push(Math.hypot(plan.a * q * q, model.C * plan.b0) / (2 * Math.PI)); }
  }
  ctx.fillStyle = css('--muted'); ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.moveTo(X(0), y0);
  edge.forEach((v, i) => ctx.lineTo(X(i / N), Yf(v))); ctx.lineTo(X(1), y0); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = css('--text'); ctx.lineWidth = 1.5; ctx.beginPath();
  edge.forEach((v, i) => (i ? ctx.lineTo(X(i / N), Yf(v)) : ctx.moveTo(X(i / N), Yf(v)))); ctx.stroke(); ctx.lineWidth = 1;
  // the hands
  ctx.fillStyle = css('--accent-2'); ctx.globalAlpha = 0.3;
  ctx.fillRect(X(0), y0, X(model.GRIP_HEEL) - X(0), y1 - y0); ctx.fillRect(X(model.GRIP_TIP), y0, X(1) - X(model.GRIP_TIP), y1 - y0); ctx.globalAlpha = 1;
  // the note across, and its mode's shape on it
  ctx.strokeStyle = css('--accent'); ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(x0, Yf(f)); ctx.lineTo(x1, Yf(f)); ctx.stroke(); ctx.setLineDash([]);
  const ell = plan.ell[0], amp = (y1 - y0) * 0.3 * (0.35 + 0.65 * swing());
  ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(X(0), Yf(f));
  for (let i = 0; i <= N; i++) {
    const z = i / N, x = (z - plan.s) * L, g = isS() ? Math.exp(-((x / ell) ** 2)) : 0.25 * (1 - Math.abs(2 * z - 1) ** 6);
    ctx.lineTo(X(z), Yf(f) - amp * g);
  }
  ctx.lineTo(X(1), Yf(f)); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
}, $('#trap'));

update();
