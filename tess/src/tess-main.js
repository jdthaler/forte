// tess-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './tess-instrument.js';
import { wasmModel } from './tess-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 69;

const SECTOR = 27.4 * 86400; // s: TESS watches each strip of sky for two of its 13.7-day orbits
const CADENCE = 120;         // s: the two-minute cadence of its target stars
const DETECT = 7.3;          // the signal-to-noise a candidate needs (TESS's pipeline uses 7.1 σ)

const planets = new Map();   // key → when it started, for the slow-motion transits
let sustain = false;
const now = () => performance.now() / 1000;

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; if (!planets.has(key)) planets.set(key, { t0: now(), held: true }); else planets.get(key).held = true; update(); },
  onNoteOff: (key) => { const p = planets.get(key); if (p) { p.held = false; if (!sustain) planets.delete(key); } },
  onSustain: (on) => { sustain = on; if (!on) for (const [k, p] of planets) if (!p.held) planets.delete(k); },
  onPanic: () => planets.clear(),
  onParam: () => update(),
});

const sig = (v, d = 3) => Number(v.toPrecision(d)).toLocaleString('en-US', { maximumSignificantDigits: d });
const fmtTime = (s) => (s < 3600 ? `${sig(s / 60)} min` : s < 2 * 86400 ? `${sig(s / 3600)} h` : `${sig(s / 86400)} d`);
const fmtDepth = (d) => (d >= 0.01 ? `${sig(d * 100)} %` : `${sig(d * 1e6)} ppm`);

// A star's colour from its temperature (a blackbody's, roughly, as the eye sees it).
function starColour(t) {
  const stops = [[3000, [255, 170, 110]], [4000, [255, 200, 150]], [5000, [255, 228, 200]], [5800, [255, 244, 232]], [7000, [222, 230, 255]]];
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const [t0, a] = stops[i], [t1, b] = stops[i + 1], f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return a.map((c, j) => Math.round(c + f * (b[j] - c)));
}

// A seeded generator, so the simulated sector stays put until something changes.
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

let curve = null; // the focus key's transit: model and a simulated sector of TESS data

function update() {
  const P = shell.P, o = model.orbit(focus, P);
  // the light curve's harmonics: the note's, as loud as the model says
  const H = Math.max(1, Math.min(400, Math.floor(20000 / o.freq)));
  const c = model.harmonics(focus, P, H), top = Math.max(1e-30, ...c.slice(1).map(Math.abs));
  const markers = [];
  for (let n = 1; n <= H; n++) if (Math.abs(c[n]) > 1e-3 * top) markers.push({ f: n * o.freq, alpha: 0.25 + 0.65 * Math.sqrt(Math.abs(c[n]) / top) });
  spectrum.set(o.freq, markers);

  // a sector of two-minute data folded on the planet's year, around the transit
  const w = o.phiT > 0 ? Math.min(0.5, 2.2 * o.phiT) : 0.05;
  const span = 2 * w * o.period;                       // s on screen
  const transits = Math.max(1, Math.floor(SECTOR / o.period));
  const total = transits * span / CADENCE;              // two-minute points on screen
  const sigma = model.noise(P.tmag, CADENCE);
  const shown = Math.max(1, Math.min(2500, Math.round(total)));
  const binned = sigma / Math.sqrt(Math.max(1, total / shown));
  const r = rng(focus * 7919 + Math.round(P.tmag * 10) + Math.round(P.impact * 1000));
  const pts = [];
  for (let i = 0; i < shown; i++) pts.push((r() * 2 - 1) * w);
  const dips = model.dips(focus, P, pts);
  const data = pts.map((f, i) => [f, -dips[i] + (P.noise ? binned * gauss(r) : 0)]);
  const line = [];
  for (let i = 0; i <= 400; i++) line.push(-w + (2 * w * i) / 400);
  const model1 = model.dips(focus, P, line);
  // the matched filter's signal-to-noise over the sector: √(Σ δ²) / σ over the points in transit
  let snr = 0;
  if (o.phiT > 0) {
    const inT = Array.from({ length: 200 }, (_, i) => -o.phiT + (2 * o.phiT * (i + 0.5)) / 200);
    const d = model.dips(focus, P, inT), mean2 = d.reduce((s, x) => s + x * x, 0) / d.length;
    snr = Math.sqrt(transits * (2 * o.phiT * o.period / CADENCE) * mean2) / sigma;
  }
  curve = { o, w, data, line, model1, snr, transits, spread: P.noise ? binned : 0 };
  $('#focus-name').textContent = noteName(focus);
  $('#lc-read').textContent = o.phiT > 0
    ? `year ${fmtTime(o.period)} · depth ${fmtDepth(o.depth)} · transit ${fmtTime(2 * o.phiT * o.period)} · a = ${sig(o.aR)} R★`
    : `year ${fmtTime(o.period)} · the planet misses the star`;
  $('#lc-snr').textContent = o.phiT > 0
    ? `${transits} transit${transits > 1 ? 's' : ''} in a sector · signal-to-noise ${sig(snr, 2)}: ${snr >= DETECT ? 'TESS finds it' : 'lost in the noise'}`
    : '';
  $('#star-read').textContent = `u₁ = ${o.u1.toFixed(2)}, u₂ = ${o.u2.toFixed(2)} · Rp/R★ = ${sig(o.k)} · speed-up ${sig(o.speedup, 2)}×`;
}

// The star and its planets: the limb-darkened disc, and each sounding key's planet crossing it
// on its chord, slowed down (the A4 planet goes round in four seconds).
animate(() => {
  const { ctx, w, h } = fit($('#transit'));
  ctx.clearRect(0, 0, w, h);
  if (!curve) return;
  const P = shell.P, o = curve.o, R = Math.min(w / 4.6, h / 2.6), cx = w / 2, cy = h / 2;
  const [cr, cg, cb] = starColour(P.teff);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  for (let i = 0; i <= 12; i++) {
    const r = Math.min(0.999, i / 12), m = 1 - Math.sqrt(1 - r * r), I = Math.max(0, 1 - o.u1 * m - o.u2 * m * m);
    g.addColorStop(r, `rgb(${Math.round(cr * I)}, ${Math.round(cg * I)}, ${Math.round(cb * I)})`);
  }
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill();
  // the chord every planet crosses on (one impact parameter for the keyboard)
  const yb = cy + o.b * R, rp = Math.max(1.5, o.k * R);
  ctx.strokeStyle = css('--grid'); ctx.setLineDash([4, 5]);
  ctx.beginPath(); ctx.moveTo(0, yb); ctx.lineTo(w, yb); ctx.stroke(); ctx.setLineDash([]);
  const t = now();
  for (const [key, p] of planets) {
    const q = model.orbit(key, P);
    const rate = Math.min(q.freq / 440, 4) / 4;               // years a second, slowed
    const th = 2 * Math.PI * ((t - p.t0) * rate - 0.12);
    if (Math.cos(th) <= 0) continue;                         // behind the star
    const x = cx + q.aR * Math.sin(th) * R, y = cy + q.aR * q.cosi * Math.cos(th) * R;
    if (x < -rp || x > w + rp) continue;
    ctx.fillStyle = '#05070c'; ctx.strokeStyle = css('--accent');
    ctx.beginPath(); ctx.arc(x, y, Math.max(2, q.k * R), 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(noteName(key), x - 8, y - Math.max(2, q.k * R) - 4);
  }
}, $('#transit'));

// The light curve: the focus key's transit as the model has it (the line), and a sector of TESS's
// two-minute points folded on the planet's year, with the star's photon noise.
animate(() => {
  const { ctx, w, h } = fit($('#lightcurve'));
  ctx.clearRect(0, 0, w, h);
  if (!curve) return;
  const { o, w: half, data, line, model1, spread } = curve;
  const x0 = 46, x1 = w - 10, y0 = 12, y1 = h - 22;
  const depth = Math.max(o.depth, 1e-6);
  const lo = -depth * 1.25 - Math.min(spread * 2, depth * 2), hi = depth * 0.35 + Math.min(spread * 2, depth * 2);
  const X = (f) => x0 + ((f + half) / (2 * half)) * (x1 - x0), Y = (v) => y0 + ((hi - v) / (hi - lo)) * (y1 - y0);
  ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x1, Y(0)); ctx.moveTo(X(0), y0); ctx.lineTo(X(0), y1); ctx.stroke();
  ctx.fillStyle = css('--accent-2'); ctx.globalAlpha = 0.5;
  for (const [f, v] of data) { const yy = Y(v); if (yy >= y0 && yy <= y1) ctx.fillRect(X(f) - 1, yy - 1, 2, 2); }
  ctx.globalAlpha = 1; ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.beginPath();
  line.forEach((f, i) => { const yy = Y(-model1[i]); if (i) ctx.lineTo(X(f), yy); else ctx.moveTo(X(f), yy); });
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('1', x0 - 12, Y(0) + 3);
  ctx.fillText(`−${fmtDepth(o.depth)}`, 2, Y(-o.depth) + 3);
  ctx.fillText(`hours from mid-transit: ±${sig(half * o.period / 3600, 2)}`, x0, h - 6);
}, $('#lightcurve'));

update();
