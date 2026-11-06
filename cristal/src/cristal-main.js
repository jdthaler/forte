// cristal-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { tunedFreq } from '../../shared/tuning.js';
import { INSTRUMENT } from './cristal-instrument.js';
import { wasmModel, TRACE } from './cristal-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const TAU = 2 * Math.PI;
const spectrum = new SpectrumView($('#spectrum'), { fLo: 40, fHi: 16000 });
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 60, stem = null, state = null, env = 0;

const shell = createShell({
  ...INSTRUMENT,
  base: 48,
  arrows: { param: 'press', step: 1 },
  holdHint: { ms: 400, text: 'Hold the key: the finger strokes the rod while it is down, and the rod takes a moment to start singing.' },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => { if (m.type === 'state') state = m; },
  onNoteOn: (key) => { focus = key; update(); },
  onPanic: () => { state = null; },
  onParam: () => update(),
});

const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 100 ? 1 : 0)} Hz`);
const fmtN = (n) => (n >= 1 ? `${n.toFixed(2)} N` : `${(n * 1000).toFixed(0)} mN`);
const speed = (P) => P.stroke * (0.4 + P.velocity); // the computer keys' stroke (cristal-engine.cpp speedOf)

function update() {
  const P = shell.P;
  stem = model.stem(focus, P);
  const main = stem.modes[stem.main], f = tunedFreq(P, focus);
  const markers = [];
  for (let n = 1; n <= 16 && n * f < 16000; n++) markers.push({ f: n * f, alpha: 0.15 + 0.7 / n });
  stem.modes.forEach((m, i) => { if (i !== stem.main) markers.push({ f: m.f, color: css('--accent-2'), alpha: 0.7 }); });
  spectrum.set(f, markers);
  $('#focus-name').textContent = noteName(focus);
  $('#focus-name-2').textContent = noteName(focus);
  $('#res-read').textContent = `stem ${(stem.len * 100).toFixed(1)} cm · weight ${(stem.weight * 1000).toFixed(0)} g`;
  const fr = model.friction(P.wet);
  $('#modes').innerHTML = '<tr><th>mode</th><th>f</th><th>× note</th><th>mass at the rod</th><th>speaks above</th><th>T60</th></tr>'
    + stem.modes.map((m, i) => `<tr><td>${i === stem.main ? '<b>the note</b>' : i < stem.main ? 'below' : `overtone ${i - stem.main}`}</td>`
      + `<td>${fmtHz(m.f)}</td><td>${(m.f / main.f).toFixed(3)}</td><td>${(1000 / (m.tip * m.tip)).toFixed(m.tip * m.tip > 0.1 ? 0 : 1)} g</td>`
      + `<td>${Number.isFinite(model.threshold(m, speed(P), P.wet)) ? fmtN(model.threshold(m, speed(P), P.wet)) : 'never'}</td>`
      + `<td>${(6.91 / (m.zeta * TAU * m.f)).toFixed(1)} s</td></tr>`).join('');
  info(fr);
}

function info(fr = model.friction(shell.P.wet)) {
  const P = shell.P, main = stem.modes[stem.main], U = speed(P);
  const th = model.threshold(main, U, P.wet), fmax = model.maxForce(main, U, P.wet);
  const live = state && state.key === focus && state.touch ? state : null;
  const N = live ? live.N : model.regulation(focus) * ((1 + U / fr.v0) / (1 + model.U_REF / fr.v0)) ** 2 * P.press;
  const rows = [
    ['note', `${noteName(focus)} · ${fmtHz(tunedFreq(P, focus))}: the stem's bending mode`],
    ['stem', `steel Ø ${(model.STEM_D * 1000).toFixed(2)} mm, ${(stem.len * 100).toFixed(1)} cm between its bolts, the rod ${(stem.height * 100).toFixed(0)} % up`],
    ['rod', `glass ${(model.ROD_L * 100).toFixed(1)} cm × Ø ${(model.ROD_D * 1000).toFixed(1)} mm, ${(model.ROD_M * 1000).toFixed(1)} g, with a ${(stem.weight * 1000).toFixed(1)} g weight`],
    ['friction', `still ${fr.mus.toFixed(2)}, sliding ${fr.mud.toFixed(2)} (falls over ${(fr.v0 * 100).toFixed(0)} cm/s of slip)`],
    ['stroke', `${(U * 100).toFixed(1)} cm/s along the rod for the computer keys`],
    ['speaks above', Number.isFinite(th) ? fmtN(th) : 'never: the friction does not fall'],
    ['finger now', `${fmtN(N)}${Number.isFinite(th) ? ` · ${(N / th).toFixed(1)} × threshold` : ''}${live ? '' : ' for the computer keys'}`],
    ['rough above', Number.isFinite(fmax) ? `${fmtN(fmax)}: the finger can no longer let go once a cycle` : '–'],
  ];
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

// ---- views -----------------------------------------------------------------------
const visible = (cv) => cv.offsetParent !== null;
const loop = (cv, draw) => animate((t) => { if (visible(cv)) draw(t); }, cv);
let infoT = 0, lastT = 0, strobe = 0;
loop($('#resonator'), drawResonator);
loop($('#contact'), drawContact);
animate((t) => {
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t; strobe += dt * TAU * 1.2;
  const live = state && state.key === focus ? state : null;
  env = Math.max(Math.abs(live ? live.amp : 0), env * Math.exp(-dt / 0.3));
  if (t - infoT > 250 && visible($('#info'))) { infoT = t; if (stem) info(); }
});

// A clamped–clamped beam's deflection under a point load at a (x, a in 0..1): the shape the stem
// bends to, near enough, in its note's mode (the rod's mass is most of what moves).
function bend(x, a) {
  if (x > a) return bend(1 - x, 1 - a);
  const b = 1 - a;
  return b * b * x * x * (3 * a - 3 * a * x - b * x);
}

function drawResonator() {
  const { ctx, w, h } = fit($('#resonator'));
  ctx.clearRect(0, 0, w, h);
  if (!stem) return;
  const live = state && state.key === focus ? state : null;
  const top = 18, bot = h - 22, H = Math.max(10, bot - top), cx = w * 0.32;
  const a = stem.height, peak = bend(a, a) || 1;
  const swing = env > 1e-7 ? Math.min(w * 0.08, 6 + 4 * Math.log10(env / 1e-7)) * Math.sin(strobe * 6) : 0;
  const X = (u) => cx + (swing * bend(u, a)) / peak; // u from the foot (0) to the frame (1)
  const Y = (u) => bot - u * H;
  // the collector below and the frame above
  ctx.fillStyle = css('--muted');
  ctx.fillRect(cx - w * 0.22, bot, w * 0.44, 8);
  ctx.fillRect(cx - 24, top - 8, 48, 6);
  ctx.font = '11px system-ui'; ctx.textBaseline = 'top';
  ctx.fillText('collector', cx + w * 0.22 + 6, bot - 2);
  ctx.textBaseline = 'bottom'; ctx.fillText('frame', cx + 30, top);
  // the stem
  ctx.strokeStyle = css('--text'); ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) { const u = i / 60; if (i) ctx.lineTo(X(u), Y(u)); else ctx.moveTo(X(u), Y(u)); }
  ctx.stroke();
  // the rod, clamped at its middle, and the weight
  const ry = Y(a), rx = X(a), rl = Math.min(w * 0.55, H * 1.2);
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = Math.max(4, Math.min(9, h * 0.035)); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(rx - rl * 0.12, ry); ctx.lineTo(rx + rl * 0.88, ry); ctx.stroke();
  ctx.lineCap = 'butt';
  const wb = 6 + Math.min(14, 40 * Math.sqrt(stem.weight));
  ctx.fillStyle = css('--accent-2'); ctx.fillRect(rx - wb / 2, ry + 5, wb, wb * 0.6);
  // the finger along the rod
  if (live && (live.touch || live.N > 0)) {
    const along = Math.min(1, live.pos / model.STROKE), dir = live.uf >= 0 ? 1 : -1;
    const fx = rx + rl * (0.84 - 0.78 * (dir > 0 ? along : 1 - along)), fy = ry - 10;
    ctx.fillStyle = live.stick ? css('--accent') : css('--muted');
    ctx.beginPath(); ctx.ellipse(fx, fy, 9, 6, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = css('--muted'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(fx + 12 * dir, fy - 4); ctx.lineTo(fx + 28 * dir, fy - 4); ctx.lineTo(fx + 23 * dir, fy - 8); ctx.stroke();
    $('#contact-read').textContent = `${(Math.abs(live.uf) * 100).toFixed(1)} cm/s · ${fmtN(live.N)}`;
  }
}

function drawContact() {
  const { ctx, w, h } = fit($('#contact'));
  ctx.clearRect(0, 0, w, h);
  const live = state && state.key === focus ? state : null;
  if (!live) return;
  const V = live.trV, U = live.trU;
  let m = 0.02;
  for (let i = 0; i < TRACE; i++) { m = Math.max(m, Math.abs(V[i])); if (Number.isFinite(U[i])) m = Math.max(m, Math.abs(U[i])); }
  const y = (v) => h / 2 - (v / m) * (h * 0.42), x = (i) => (i / (TRACE - 1)) * w;
  ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  // stuck: where the rod moves with the finger
  ctx.fillStyle = 'rgba(168,230,207,0.16)';
  for (let i = 0; i < TRACE; i++) if (Number.isFinite(U[i]) && Math.abs(V[i] - U[i]) < 1e-5) ctx.fillRect(x(i), 0, Math.max(1, w / TRACE), h);
  ctx.setLineDash([4, 4]); ctx.strokeStyle = css('--accent-2'); ctx.beginPath();
  let pen = false;
  for (let i = 0; i < TRACE; i++) { if (!Number.isFinite(U[i])) { pen = false; continue; } if (pen) ctx.lineTo(x(i), y(U[i])); else { ctx.moveTo(x(i), y(U[i])); pen = true; } }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i < TRACE; i++) { if (i) ctx.lineTo(x(i), y(V[i])); else ctx.moveTo(x(i), y(V[i])); }
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted'); ctx.font = '11px system-ui'; ctx.textBaseline = 'top';
  ctx.fillText(`±${(m * 100).toFixed(0)} cm/s`, 4, 4);
}

update();
