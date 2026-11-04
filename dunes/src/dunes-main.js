// dunes-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { tunedFreq } from '../../shared/tuning.js';
import { INSTRUMENT } from './dunes-instrument.js';
import { sortingWord } from './dunes-params.js';
import { wasmModel } from './dunes-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'), { fLo: 25, fHi: 16000 });
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 45;
let state = null;           // the engine's latest report on the focused avalanche
const history = [];         // [t, R, drive] for the last six seconds

const shell = createShell({
  ...INSTRUMENT,
  base: 36, // Z = C2: real dunes sing between about C2 and A♭2
  arrows: { param: 'velocity', step: 0.05 },
  holdHint: { ms: 400, text: 'Hold the key down: the avalanche runs while it is held, and the grains need a moment to fall into step.' },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => {
    if (m.type !== 'state') return;
    state = m;
    history.push([performance.now() / 1000, m.R, m.drive]);
    while (history.length && history[0][0] < performance.now() / 1000 - 6) history.shift();
  },
  onNoteOn: (key) => { focus = key; update(); },
  onPanic: () => { state = null; },
  onParam: () => update(),
});

// Douady et al. 2006, Table I: each dune's grains and the note it sang.
const DOUADY = [
  { name: 'Tarfaya, Morocco', d: 160e-6, f: 105, df: 10 },
  { name: 'Mar de Dunas, Chile', d: 210e-6, f: 90, df: 10 },
  { name: 'Cerro Bramador, Chile', d: 270e-6, f: 75, df: 10 },
  { name: 'Sand Mountain, Nevada', d: 340e-6, f: 63, df: 5 },
];
// Vriend et al. 2007, Table 1 (Dumont Dunes, August and September 2006, shot A): the dry layer and the song.
const VRIEND = { name: 'Dumont Dunes, California', H: 1.2, dH: 0.3, f: 83.5, df: 2.5 };
const CLASSES = ['silt and clay', 'very fine sand', 'fine sand', 'medium sand', 'coarse sand', 'very coarse sand', 'granules'];

const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 100 ? 1 : 0)} Hz`);
const fmtD = (d) => (d >= 1e-3 ? `${(d * 1000).toFixed(2)} mm` : d >= 1e-6 ? `${(d * 1e6).toFixed(d < 10e-6 ? 1 : 0)} µm` : `${(d * 1e9).toFixed(0)} nm`);
const fmtM = (h) => (h >= 1 ? `${h.toFixed(2)} m` : `${(h * 100).toFixed(h < 0.1 ? 1 : 0)} cm`);
const layer = () => shell.P.theory === 'layer';

function update() {
  const P = shell.P, f = tunedFreq(P, focus);
  const markers = [];
  for (let n = 1; n <= 12 && n * f < 16000; n++) {
    const a = layer() ? 1 / n : model.pulseHarmonic(n, P.contact) / model.pulseHarmonic(1, P.contact);
    if (a > 0.01) markers.push({ f: n * f, alpha: 0.2 + 0.7 * Math.sqrt(a) });
  }
  spectrum.set(f, markers);
  const d = model.grainDiameter(f), H = model.layerDepth(f), onset = model.onsetSpeed(P.sorting, P.damp);
  $('#focus-name').textContent = noteName(focus);
  $('#face-read').textContent = layer() ? `dry layer ${fmtM(H)} deep` : `grains ${fmtD(d)}`;
  $('#law-read').textContent = layer() ? `f = c₁ / 2H√(1 − c₁²/c₂²)` : 'f = 0.4·√(g/d)';
  const rows = [['note', `${noteName(focus)} · ${fmtHz(f)}`]];
  if (layer()) {
    rows.push(['layer', `${fmtM(H)} of dry sand (c₁ = ${model.C1} m/s) over firmer sand (c₂ = ${model.C2} m/s)`]);
    rows.push(['modes', `${fmtHz(f)}, ${fmtHz(2 * f)}, ${fmtHz(3 * f)} …, each a bounce of the trapped waves; Q ${P.layerQ.toFixed(0)}`]);
    rows.push(['grains', `rattle at random: no threshold to cross`]);
  } else {
    rows.push(['grains', `${fmtD(d)} across, ${CLASSES[model.wentworth(d)]}, sheared ${fmtHz(f)} (0.4·√(g/d))`]);
    rows.push(['sorting', `${P.sorting.toFixed(2)} φ, ${sortingWord(P.sorting)}: the grains' own notes spread ±${(100 * model.freqSpread(P.sorting)).toFixed(1)} %`]);
    rows.push(['threshold', onset > 50 ? 'none it can reach: this sand will not sing' : `sings above ${onset.toFixed(2)} m/s${onset > P.speed ? `, faster than this avalanche can run (${P.speed.toFixed(2)} m/s)` : ''}`]);
  }
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

// ---- views -----------------------------------------------------------------------
const visible = (cv) => cv.offsetParent !== null;
const live = () => (state && state.key === focus && state.U > 0.002 ? state : null);
const SLOPE = Math.tan((32 * Math.PI) / 180); // sand's angle of repose, about 32°

// The slip face: the dune in section, the avalanche's grains sliding down it, the face shaking with
// the song; in the layer's theory, the firmer sand below and the waves trapped between.
const grains = Array.from({ length: 90 }, (_, i) => ({ u: (i * 0.618034) % 1, h: ((i * 0.381966) % 1) }));
let lastT = 0;
animate((t) => {
  const cv = $('#face');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const s = live(), dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
  // the dune: a gentle windward slope up to the crest, then the slip face down to the floor
  // the face as tall as fits, and no wider than 60 % of the view
  const run = Math.max(20, Math.min((h - 18 - Math.max(10, h * 0.18)) / SLOPE, w * 0.6));
  const floor = Math.min(h - 8, h / 2 + (run * SLOPE) / 2 + 10); // a short dune in a tall view sits in its middle
  const crestY = floor - run * SLOPE, toeX = w - 12, crestX = toeX - run;
  const face = (u) => [crestX + u * (toeX - crestX), crestY + u * (floor - crestY)]; // along the face, 0 at the crest
  const nx = -Math.sin(Math.atan(SLOPE)), ny = -Math.cos(Math.atan(SLOPE)); // the face's outward normal (up and left)
  ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.18;
  ctx.beginPath(); ctx.moveTo(4, floor); ctx.quadraticCurveTo(crestX * 0.55, floor - (floor - crestY) * 0.25, crestX, crestY); ctx.lineTo(toeX, floor); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
  const U = s ? s.U : 0, shake = s ? Math.min(1, s.R * U) : 0;
  const depth = Math.min(26, Math.max(6, h * 0.08));
  if (layer()) {
    // the firmer sand under the dry layer, and rays bouncing between (drawn deeper than to scale)
    const Hpx = Math.min(h * 0.25, Math.max(10, h * 0.1));
    ctx.strokeStyle = css('--muted'); ctx.setLineDash([5, 4]);
    ctx.beginPath(); const [ax, ay] = face(0.05), [bx, by] = face(0.98);
    ctx.moveTo(ax - nx * Hpx, ay - ny * Hpx); ctx.lineTo(bx - nx * Hpx, by - ny * Hpx); ctx.stroke(); ctx.setLineDash([]);
    if (s) {
      ctx.strokeStyle = css('--accent-2'); ctx.globalAlpha = Math.min(1, 0.3 + U); ctx.beginPath();
      const hops = 9, ph = (t / 1500) % 1;
      for (let i = 0; i <= hops; i++) {
        const u = 0.05 + (0.93 * (i + ph)) / (hops + 1), [x, y] = face(u), down = i % 2 ? 0 : Hpx;
        if (i) ctx.lineTo(x - nx * down, y - ny * down); else ctx.moveTo(x - nx * down, y - ny * down);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  // the avalanche: the flowing layer, a band on the face as deep as it runs fast, its grains sliding
  // down it, shaken across it by the song
  if (s) {
    const band = depth * Math.min(1.4, 0.4 + U);
    ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.25;
    ctx.beginPath(); const [ax, ay] = face(0.02), [bx, by] = face(1);
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx + nx * band, by + ny * band); ctx.lineTo(ax + nx * band * 0.5, ay + ny * band * 0.5); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    const wob = shake * depth * 0.5 * Math.sin((2 * Math.PI * t) / 90);
    for (const g of grains) {
      g.u += (U * dt) / 6; // a hundredfold slower than the sand (the face drawn about 60 m long)
      if (g.u > 1) g.u -= 1;
      const [x, y] = face(g.u), off = depth * g.h + wob * (0.5 + g.h);
      ctx.globalAlpha = Math.min(1, 0.25 + 1.5 * U) * (1 - g.u * 0.4);
      ctx.beginPath(); ctx.arc(x + nx * off, y + ny * off, Math.max(1.6, Math.min(3, h / 110)), 0, 2 * Math.PI); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}, $('#face'));

// The grains in step: each patch on the circle by its phase, turned so that their mean points up.
animate(() => {
  const cv = $('#circle');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const s = live(), cx = w / 2, cy = h / 2, r = Math.max(6, Math.min(w, h) / 2 - 10);
  ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
  const ph = s ? s.phases : [];
  let mr = 0, mi = 0;
  for (const p of ph) { mr += Math.cos(2 * Math.PI * p); mi += Math.sin(2 * Math.PI * p); }
  const psi = Math.atan2(mi, mr);
  ctx.fillStyle = css('--accent');
  for (const p of ph) {
    const a = 2 * Math.PI * p - psi - Math.PI / 2;
    ctx.beginPath(); ctx.arc(cx + r * Math.cos(a), cy + r * Math.sin(a), Math.max(2.5, r / 22), 0, 2 * Math.PI); ctx.fill();
  }
  const R = s && ph.length ? s.R : 0;
  ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - R * r); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--accent-2'); ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 2 * Math.PI); ctx.fill();
  $('#sync-read').textContent = layer() ? 'the layer\'s theory: no step to fall into' : s ? `R ${R.toFixed(2)} · coupling ${s.drive.toFixed(2)} × the threshold` : '';
}, $('#circle'));

// Falling into step: R and the coupling over its threshold, the last six seconds.
animate(() => {
  const cv = $('#order');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const now = performance.now() / 1000, x0 = 30, x1 = w - 6, y0 = 6, y1 = h - 16;
  const top = Math.max(2, ...history.map(([, , k]) => Math.min(6, k)));
  const X = (tt) => x1 - ((now - tt) / 6) * (x1 - x0), Yr = (v) => y1 - v * (y1 - y0), Yk = (k) => y1 - (Math.min(k, top) / top) * (y1 - y0);
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right';
  for (const v of [0, 0.5, 1]) { ctx.beginPath(); ctx.moveTo(x0, Yr(v)); ctx.lineTo(x1, Yr(v)); ctx.stroke(); ctx.fillText(v.toFixed(1), x0 - 4, Yr(v) + 3); }
  ctx.textAlign = 'left';
  if (layer()) { $('#order-read').textContent = 'the layer\'s theory has no threshold'; return; }
  ctx.setLineDash([4, 4]); ctx.strokeStyle = css('--accent-2'); ctx.beginPath(); ctx.moveTo(x0, Yk(1)); ctx.lineTo(x1, Yk(1)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = css('--accent-2'); ctx.fillText('threshold', x0 + 3, Yk(1) - 3);
  if (history.length > 1) {
    ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.moveTo(X(history[0][0]), y1);
    for (const [tt, R] of history) ctx.lineTo(X(tt), Yr(R));
    ctx.lineTo(X(history.at(-1)[0]), y1); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 2; ctx.beginPath();
    history.forEach(([tt, , k], i) => { if (i) ctx.lineTo(X(tt), Yk(k)); else ctx.moveTo(X(tt), Yk(k)); });
    ctx.stroke(); ctx.lineWidth = 1;
  }
  ctx.fillStyle = css('--muted'); ctx.fillText('R', x0 + 3, y0 + 9);
  const s = live();
  $('#order-read').textContent = s ? `${s.U.toFixed(2)} m/s; sings above ${s.onset.toFixed(2)} m/s` : `sings above ${model.onsetSpeed(shell.P.sorting, shell.P.damp).toFixed(2)} m/s`;
}, $('#order'));

// What sets the pitch: the shear law and Douady's dunes, or the waveguide and Vriend's.
animate(() => {
  const cv = $('#law');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, L = layer(), padL = 46, padB = 18, x0 = padL, x1 = w - 8, y0 = 6, y1 = h - padB;
  const fLo = 25, fHi = 4500, X = (f) => x0 + (Math.log(f / fLo) / Math.log(fHi / fLo)) * (x1 - x0);
  const [vLo, vHi] = L ? [0.02, 8] : [5e-8, 4e-3]; // m: layer depth, or grain diameter
  const Y = (v) => y1 - (Math.log(v / vLo) / Math.log(vHi / vLo)) * (y1 - y0);
  ctx.font = '10px system-ui, sans-serif';
  if (!L) {
    // the sand classes, by size
    const edges = [vLo, ...model.WENTWORTH];
    for (let i = 0; i < edges.length - 1; i++) {
      const a = Math.max(vLo, edges[i]), b = Math.min(vHi, edges[i + 1]);
      if (b <= a) continue;
      ctx.fillStyle = css('--accent'); ctx.globalAlpha = i === 0 ? 0.03 : 0.04 + 0.025 * (i % 2);
      ctx.fillRect(x0, Y(b), x1 - x0, Y(a) - Y(b)); ctx.globalAlpha = 1;
      if (Y(a) - Y(b) > 11) { ctx.fillStyle = css('--muted'); ctx.textAlign = 'right'; ctx.fillText(CLASSES[i], x1 - 4, (Y(a) + Y(b)) / 2 + 3); }
    }
  }
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  for (const f of [30, 100, 300, 1000, 3000]) { ctx.beginPath(); ctx.moveTo(X(f), y0); ctx.lineTo(X(f), y1); ctx.stroke(); ctx.fillText(f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`, X(f), y1 + 12); }
  ctx.textAlign = 'right';
  const ticks = L ? [0.03, 0.1, 0.3, 1, 3] : [1e-7, 1e-6, 1e-5, 1e-4, 1e-3];
  for (const v of ticks) { ctx.beginPath(); ctx.moveTo(x0, Y(v)); ctx.lineTo(x1, Y(v)); ctx.stroke(); ctx.fillText(L ? fmtM(v) : fmtD(v), x0 - 4, Y(v) + 3); }
  // the law
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 80; i++) { const f = fLo * (fHi / fLo) ** (i / 80), v = L ? model.layerDepth(f) : model.grainDiameter(f); if (i) ctx.lineTo(X(f), Y(v)); else ctx.moveTo(X(f), Y(v)); }
  ctx.stroke(); ctx.lineWidth = 1;
  // the measured dunes
  ctx.strokeStyle = css('--accent-2'); ctx.fillStyle = css('--accent-2');
  const pts = L ? [{ ...VRIEND, v: VRIEND.H, dv: VRIEND.dH }] : DOUADY.map((p) => ({ ...p, v: p.d, dv: 0 }));
  for (const p of pts) {
    ctx.beginPath(); ctx.moveTo(X(p.f - p.df), Y(p.v)); ctx.lineTo(X(p.f + p.df), Y(p.v));
    if (p.dv) { ctx.moveTo(X(p.f), Y(p.v - p.dv)); ctx.lineTo(X(p.f), Y(p.v + p.dv)); }
    ctx.stroke(); ctx.beginPath(); ctx.arc(X(p.f), Y(p.v), 3, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.textAlign = 'left';
  if (w > 260) ctx.fillText(L ? VRIEND.name : 'four singing dunes (Douady 2006)', X(140), Y(L ? VRIEND.H : 250e-6) + (L ? -6 : 4));
  // the key just played
  const f = tunedFreq(P, focus), v = L ? model.layerDepth(f) : model.grainDiameter(f);
  ctx.strokeStyle = css('--text'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(f), Y(Math.min(vHi, Math.max(vLo, v))), 6, 0, 2 * Math.PI); ctx.stroke(); ctx.lineWidth = 1;
}, $('#law'));

update();
