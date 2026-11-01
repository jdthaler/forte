// cellulophone-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './cellulophone-instrument.js';
import { wasmModel } from './cellulophone-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'), { fLo: 25, fHi: 16000 });
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 60;
const held = new Set();

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  holdHint: { ms: 400, text: 'Hold the key down: the note sounds while its mirror sends the light to the cell.' },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; held.add(key); update(); },
  onNoteOff: (key) => { held.delete(key); },
  onPanic: () => held.clear(),
  onParam: () => update(),
});

const c0Of = (P) => model.DISC_C[Math.max(0, ['54', '216', '864'].indexOf(P.disc))];
const screenOf = (P, octave) => (P.screen === 'octaves' ? model.octaveScreen(octave) : P.screen);
const SCREEN_NAMES = Object.fromEntries(INSTRUMENT.groups.flatMap((g) => g.params).find((p) => p.id === 'screen').options);
const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 100 ? 2 : 1)} Hz`);
const fmtCents = (c) => `${c >= 0 ? '+' : '−'}${Math.abs(c).toFixed(1)} ¢`;

// The screens' Fourier coefficients, plain and with the slit, kept once each.
const spectra = new Map();
function coeffs(screen, slit) {
  const k = `${screen}/${slit}`;
  if (!spectra.has(k)) spectra.set(k, model.screenSpectrum(screen, slit));
  return spectra.get(k);
}
// The amplitude of harmonic n of the light, for push p and slot width a.
function harmonic(screen, p, a, n) {
  const A = coeffs(screen, false), B = coeffs(screen, true);
  const re = (1 - p) * A.re[n] + p * B.re[n], im = (1 - p) * A.im[n] + p * B.im[n];
  return Math.abs(model.slotGain(n, a)) * Math.hypot(re, im);
}
// The screen's clearness at x (no slot): its coefficients summed.
function clearness(screen, p, x) {
  const A = coeffs(screen, false), B = coeffs(screen, true);
  let v = 0;
  for (let n = 0; n <= model.H_MAX; n++) {
    const re = (1 - p) * A.re[n] + p * B.re[n], im = (1 - p) * A.im[n] + p * B.im[n];
    v += re * Math.cos(2 * Math.PI * n * x) - im * Math.sin(2 * Math.PI * n * x);
  }
  return v;
}

function update() {
  const P = shell.P, nt = model.keyNote(focus, c0Of(P), P), scr = screenOf(P, nt.octave);
  const amps = Array.from({ length: model.H_MAX }, (_, i) => harmonic(scr, P.push, P.slot, i + 1));
  const top = Math.max(1e-9, ...amps), markers = [];
  amps.forEach((a, i) => { if (a / top > 0.01 && (i + 1) * nt.f < 16000) markers.push({ f: (i + 1) * nt.f, alpha: 0.2 + 0.7 * Math.sqrt(a / top) }); });
  spectrum.set(nt.f, markers);
  $('#focus-name').textContent = noteName(focus);
  $('#disc-oct').textContent = String(nt.octave);
  $('#disc-read').textContent = `${(nt.turns * 60).toFixed(0)} turns a minute`;
  $('#window-read').textContent = `${SCREEN_NAMES[scr]} · slot ${(P.slot * 100).toFixed(P.slot < 0.1 ? 1 : 0)} %`;
  $('#tuning-read').textContent = `C ring: ${c0Of(P)} slots`;
  const rows = [
    ['note', `${noteName(focus)} · ${fmtHz(nt.f)}, ${fmtCents(nt.cents)} from the tuning's ${fmtHz(nt.ideal)}`],
    ['ring', `${nt.slots} slots on the disc of octave ${nt.octave}, turning ${nt.turns.toFixed(2)} times a second`],
    ['screen', `${SCREEN_NAMES[scr]}${P.push > 0 ? `, the slit ${(P.push * 100).toFixed(0)} % in` : ''}`],
    ['cell', P.cell === 'selenium' ? 'selenium: slow, and as the 0.6 power of the light' : 'potassium in vacuum: at once, in proportion'],
    ['lamps', P.lamp === 'battery' ? 'on batteries: steady' : `on ${P.lamp} Hz mains: ${(100 * model.flicker(+P.lamp)).toFixed(1)} % flicker at ${2 * P.lamp} Hz`],
  ];
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

// ---- views -----------------------------------------------------------------------
const visible = (cv) => cv.offsetParent !== null;
// a CSS colour (#rrggbb or rgb(…)) as its three channels
function rgbOf(c) {
  const h = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (h) return [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16));
  const m = c.match(/\d+(\.\d+)?/g);
  return m ? m.slice(0, 3).map(Number) : [240, 196, 106];
}

// The disc of the focused key's octave: twelve rings of slots turning, the windows above the axle.
animate((t) => {
  const cv = $('#disc');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, c0 = c0Of(P), oct = model.keyNote(focus, c0, P).octave;
  const notes = Array.from({ length: 12 }, (_, pc) => model.keyNote(12 * (oct + 1) + pc, c0, P));
  const cx = w / 2, cy = h / 2, R = Math.max(8, Math.min(w, h) / 2 - 6), r0 = R * 0.3, dr = (R - r0) / 12;
  ctx.fillStyle = css('--panel') || '#111'; ctx.strokeStyle = css('--grid');
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  const angle = 2 * Math.PI * ((t / 1000) * (notes[0].turns / 40));
  for (let pc = 0; pc < 12; pc++) {
    const n = notes[pc], ri = r0 + dr * (pc + 0.2), ro = r0 + dr * (pc + 0.8), on = held.has(12 * (oct + 1) + pc);
    ctx.strokeStyle = on ? css('--accent') : pc === focus % 12 ? css('--accent-2') : css('--muted');
    ctx.globalAlpha = on ? 1 : 0.55;
    ctx.lineWidth = Math.max(0.5, Math.min(2, (2 * Math.PI * ro) / n.slots / 3));
    const step = Math.max(1, Math.ceil(n.slots / Math.max(12, (2 * Math.PI * ro) / 2.5))); // no more lines than fit
    ctx.beginPath();
    for (let j = 0; j < n.slots; j += step) {
      const a = angle + (2 * Math.PI * j) / n.slots;
      ctx.moveTo(cx + ri * Math.cos(a), cy + ri * Math.sin(a)); ctx.lineTo(cx + ro * Math.cos(a), cy + ro * Math.sin(a));
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
  // the windows, in a line above the axle
  ctx.strokeStyle = css('--text');
  for (let pc = 0; pc < 12; pc++) {
    const ri = r0 + dr * (pc + 0.1), ro = r0 + dr * (pc + 0.9), on = held.has(12 * (oct + 1) + pc);
    ctx.fillStyle = on ? css('--accent') : 'transparent';
    ctx.globalAlpha = on ? 0.35 : 1;
    ctx.fillRect(cx - dr * 0.45, cy - ro, dr * 0.9, ro - ri);
    ctx.globalAlpha = 1;
    ctx.strokeRect(cx - dr * 0.45, cy - ro, dr * 0.9, ro - ri);
  }
  ctx.fillStyle = css('--muted');
  ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, r0 * 0.25), 0, 2 * Math.PI); ctx.fill();
  if (R > 60) {
    ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`C ${notes[0].slots}`, cx + dr * 0.7, cy - r0 - dr * 0.25);
    ctx.fillText(`B ${notes[11].slots}`, cx + dr * 0.7, cy - R + dr * 0.75);
  }
}, $('#disc'));

// The window: the screen's clearness with the slot crossing it, and the light over one period.
animate((t) => {
  const cv = $('#window');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, nt = model.keyNote(focus, c0Of(P), P), scr = screenOf(P, nt.octave);
  const x0 = 8, x1 = w - 8, W = Math.max(1, x1 - x0), stripH = Math.max(8, h * 0.28), y0 = 6;
  // the screen, column by column (its clearness over its clearest)
  const cols = Math.max(8, Math.min(240, Math.floor(W / 2)));
  const vals = Array.from({ length: cols }, (_, i) => clearness(scr, P.push, (i + 0.5) / cols));
  const top = Math.max(1e-9, ...vals);
  ctx.fillStyle = '#000'; ctx.fillRect(x0, y0, W, stripH);
  const g = ctx.createLinearGradient(x0, 0, x1, 0), [r, gr, bl] = rgbOf(css('--accent'));
  vals.forEach((v, i) => g.addColorStop((i + 0.5) / cols, `rgba(${r}, ${gr}, ${bl}, ${Math.max(0, Math.min(1, v / top)).toFixed(3)})`));
  ctx.fillStyle = g; ctx.fillRect(x0, y0, W, stripH);
  // the slot crossing it (a slow, steady sweep)
  const u = ((t / 2500) % 1), sw = Math.max(1.5, W * P.slot);
  ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 2;
  ctx.strokeRect(x0 + u * W - sw / 2, y0 - 2, sw, stripH + 4);
  ctx.lineWidth = 1;
  // the light through the slot, one period, and its mean
  const gy0 = y0 + stripH + 10, gy1 = h - 6;
  if (gy1 - gy0 > 10) {
    const L = model.lightPeriod(scr, P.push, P.slot, 200), lo = Math.min(0, ...L), hi = Math.max(1e-9, ...L);
    const Y = (v) => gy1 - ((v - lo) / (hi - lo)) * (gy1 - gy0);
    const mean = L.reduce((a, b) => a + b, 0) / L.length;
    ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x1, Y(0)); ctx.stroke();
    ctx.strokeStyle = css('--muted'); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x0, Y(mean)); ctx.lineTo(x1, Y(mean)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.beginPath();
    L.forEach((v, i) => { const X = x0 + (W * i) / (L.length - 1); if (i) ctx.lineTo(X, Y(v)); else ctx.moveTo(X, Y(v)); });
    ctx.stroke(); ctx.lineWidth = 1;
    const xm = x0 + u * W;
    ctx.strokeStyle = css('--accent-2'); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(xm, gy0); ctx.lineTo(xm, gy1); ctx.stroke(); ctx.setLineDash([]);
  }
}, $('#window'));

// The disc's tuning: each ring's cents from the tuning, and its slots.
animate(() => {
  const cv = $('#tuning');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, c0 = c0Of(P), notes = Array.from({ length: 12 }, (_, pc) => model.keyNote(60 + pc, c0, P));
  const span = Math.max(5, ...notes.map((n) => Math.ceil(Math.abs(n.cents) / 5) * 5));
  const padL = 30, padB = 26, x0 = padL, x1 = w - 6, y0 = 6, y1 = h - padB, mid = (y0 + y1) / 2;
  const Y = (c) => mid - (c / span) * ((y1 - y0) / 2), bw = (x1 - x0) / 12;
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.strokeStyle = css('--grid');
  ctx.textAlign = 'right';
  for (const c of [-span, 0, span]) { ctx.beginPath(); ctx.moveTo(x0, Y(c)); ctx.lineTo(x1, Y(c)); ctx.stroke(); ctx.fillText(`${c > 0 ? '+' : ''}${c}¢`, x0 - 3, Y(c) + 3); }
  ctx.textAlign = 'center';
  const names = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  notes.forEach((n, pc) => {
    const X = x0 + bw * (pc + 0.5);
    ctx.fillStyle = pc === focus % 12 ? css('--accent') : css('--accent-2');
    const ya = Y(Math.max(0, n.cents)), yb = Y(Math.min(0, n.cents));
    ctx.fillRect(X - bw * 0.3, ya, bw * 0.6, Math.max(1, yb - ya));
    ctx.fillStyle = css('--muted');
    ctx.fillText(names[pc], X, y1 + 11);
    if (bw > 18) ctx.fillText(String(n.slots), X, y1 + 22);
  });
}, $('#tuning'));

update();
