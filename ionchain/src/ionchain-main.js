// ionchain-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './ionchain-instrument.js';
import { wasmModel } from './ionchain-wasm.js';
import { tunedFreq } from '../../shared/tuning.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();
const { SLOW } = model;

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'), { fLo: 25, fHi: 16000 });
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 60, ions = null, ionsAt = 0, kickAt = -1e9, crystal = null;

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'aniso', step: 0.25 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => { if (m.type === 'ions') { ions = m; ionsAt = performance.now(); } },
  onNoteOn: (key) => { focus = key; kickAt = performance.now(); shell.keys.focus?.(key); update(); },
  onParam: () => update(),
});

const live = () => (ions && ions.key === focus && performance.now() - ionsAt < 300 ? ions : null);
const fmtHz = (f) => (f >= 1e6 ? `${(f / 1e6).toFixed(2)} MHz` : f >= 1000 ? `${(f / 1000).toFixed(f >= 1e5 ? 0 : 1)} kHz` : `${f.toFixed(f < 10 ? 2 : 1)} Hz`);
const dB = (a) => 20 * Math.log10(Math.max(a, 1e-9));

// What each mode sounds like for the focused key: its frequency, and how loud the pulse and the
// electrodes make it (the kick through the pulse's spectrum, times the louder electrode).
function heard(P) {
  const st = live(), f = st ? st.f : tunedFreq(P, focus);
  const tau = P.pulse * 1e-6;
  const modes = crystal.lam.map((l, m) => {
    const fm = f * Math.sqrt(l);
    const a = Math.abs(crystal.kick[m] * model.pulse(SLOW * fm, tau)) * Math.max(Math.abs(crystal.wl[m]), Math.abs(crystal.wr[m]));
    return { m, f: fm, ratio: Math.sqrt(l), a, axial: axialShare(m) > 0.5 };
  });
  const top = Math.max(1e-12, ...modes.map((x) => x.a));
  for (const x of modes) x.rel = x.a / top;
  return { f, modes, st };
}
// how much of mode m's motion is along the axis
function axialShare(m) {
  let s = 0;
  for (let j = 0; j < crystal.N; j++) s += crystal.B[2 * j + 1][m] ** 2;
  return s;
}

function update() {
  const P = shell.P;
  crystal = model.modes(P);
  const { f, modes } = heard(P);
  $('#focus-name').textContent = noteName(focus);
  spectrum.set(f, modes.filter((x) => x.rel > 1e-3 && x.f < 16000).map((x) => ({ f: x.f, alpha: Math.max(0.15, Math.min(0.95, 0.95 + dB(x.rel) / 60)), color: x.axial ? undefined : css('--accent-2') })));
  info();
}

function info() {
  const P = shell.P, { f, modes, st } = heard(P);
  const fz = SLOW * f, ell = model.lengthScale(fz) * 1e6, ac = model.zigzagAlpha(crystal.N);
  const shown = modes.filter((x) => x.rel > 0.01).sort((a, b) => a.f - b.f);
  const rows = [
    ['trap', `${noteName(focus)} · ${fmtHz(f)} heard, a ⁴⁰Ca⁺ trap at ${fmtHz(fz)} along the axis and ${fmtHz(fz * P.aniso)} across it`],
    ['crystal', `${crystal.N === 1 ? 'one ion' : `${crystal.N} ions, ${crystal.zigzag ? 'a zigzag' : 'a line'} ${(2 * crystal.reach * ell).toFixed(1)} µm long`}; ℓ = ${ell.toFixed(2)} µm${crystal.N > 1 ? `, spacing ${(crystal.spacing * ell).toFixed(1)} µm` : ''}`],
    ['zigzag', crystal.N < 2 ? 'one ion has nothing to buckle' : `below ω_x = ${ac.toFixed(2)} ω_z (now ${P.aniso.toFixed(2)})`],
    ['heard', shown.length ? shown.map((x) => `×${x.ratio.toFixed(3)}${x.axial ? '' : ' (radial)'} ${dB(x.rel).toFixed(0)} dB`).join(' · ') : 'nothing: the electrodes hear none of the modes the pulse rings'],
  ];
  if (st) rows.push(['cooling', st.cooled ? 'on: the cooling laser slows the ions' : 'off while the key is held']);
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

// ---- views -----------------------------------------------------------------------
const visible = (cv) => cv.offsetParent !== null;
let infoT = 0;
animate((t) => { if (t - infoT > 250 && visible($('#info'))) { infoT = t; info(); } });

// The crystal, as a camera on the trap sees it: each ion's fluorescence, smeared along the
// motion the engine reports (its RMS displacement, exaggerated to fit), the electrodes beside it,
// and the laser's line flashing when a key is struck.
let scale = 0;
animate((t) => {
  const cv = $('#crystal');
  if (!visible(cv) || !crystal) return;
  const { ctx, w, h } = fit(cv);
  ctx.fillStyle = '#05040c'; ctx.fillRect(0, 0, w, h);
  const P = shell.P, st = live(), c = crystal;
  const R = P.distance * c.reach, phi = (P.side * Math.PI) / 180;
  const ex = R * Math.sin(phi), ez = R * Math.cos(phi);
  // fit the ions and, when they are near, the electrodes
  const spanZ = Math.max(c.reach, Math.min(Math.abs(ez), 2.2 * c.reach)) * 1.15, spanX = Math.max(c.reach * 0.35, Math.min(Math.abs(ex), 2.2 * c.reach) * 1.15, 0.6);
  const k = Math.min((w * 0.5) / spanZ, (h * 0.5) / spanX);
  const X = (z) => w / 2 + z * k, Y = (x) => h / 2 - x * k;
  const acc = css('--accent');
  // the trap's axis
  ctx.strokeStyle = 'rgba(160,140,255,0.18)'; ctx.setLineDash([4, 6]);
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke(); ctx.setLineDash([]);
  // the electrodes (where they fit)
  ctx.fillStyle = '#c9b46a';
  for (const s of [1, -1]) {
    const px = X(s * ez), py = Y(s * ex);
    if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;
    const ang = Math.atan2(-(s * ex), s * ez);
    ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
    ctx.fillRect(0, -Math.min(h * 0.18, 40), 6, 2 * Math.min(h * 0.18, 40));
    ctx.restore();
  }
  // the laser pulse: a line through the beam's place at its angle, flashing as a key strikes
  const since = (performance.now() - kickAt) / 1000;
  if (since < 0.35) {
    const th = (P.angle * Math.PI) / 180, zEnd = c.N > 1 ? Math.max(...c.z) : 0, zb = P.beam * zEnd, L = 4 * Math.max(spanZ, spanX);
    ctx.strokeStyle = `rgba(150,110,255,${0.55 * (1 - since / 0.35)})`;
    ctx.lineWidth = Math.max(2, P.waist * c.spacing * k * 2);
    ctx.beginPath(); ctx.moveTo(X(zb - L * Math.cos(th)), Y(-L * Math.sin(th))); ctx.lineTo(X(zb + L * Math.cos(th)), Y(L * Math.sin(th))); ctx.stroke();
    ctx.lineWidth = 1;
  }
  // the ions: a glow each, smeared over its motion
  const zs = st?.z ?? [], xs = st?.x ?? [];
  const most = Math.max(1e-12, ...zs, ...xs);
  scale = most > 1e-12 ? Math.max(scale * 0.98, most) : scale * 0.98; // the exaggeration: the loudest ion's motion, slowly let go
  const room = 0.2 * Math.min(c.N > 1 ? c.spacing : 1, 1);
  const r0 = Math.max(2.5, Math.min(9, 0.12 * c.spacing * k));
  const cooled = st?.cooled;
  for (let j = 0; j < c.N; j++) {
    const az = scale > 0 && zs[j] ? (room * zs[j]) / scale : 0, ax = scale > 0 && xs[j] ? (room * xs[j]) / scale : 0;
    const cx = X(c.z[j]), cy = Y(c.x[j]);
    const rz = r0 + az * k, rx = r0 + ax * k;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rz, rx) * 1.3);
    const bright = cooled ? 1 : 0.85;
    g.addColorStop(0, `rgba(235,225,255,${bright})`); g.addColorStop(0.35, acc); g.addColorStop(1, 'rgba(120,80,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, rz * 1.3, rx * 1.3, 0, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.fillStyle = 'rgba(220,210,255,0.7)'; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`${c.N} ion${c.N > 1 ? 's' : ''} · ${c.zigzag ? 'zigzag' : 'line'}${st ? (st.cooled ? ' · cooling' : ' · ringing') : ''}`, 8, 16);
}, $('#crystal'));

// The normal modes: each one's shape (the ions' displacements, swinging slowly), its frequency
// over the trap's, and how loud the pulse and the electrodes make it now.
animate((t) => {
  const cv = $('#modes');
  if (!visible(cv) || !crystal) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, c = crystal, { modes } = heard(P);
  const list = modes.slice().sort((a, b) => a.f - b.f);
  const M = list.length, cols = Math.max(1, Math.round(Math.sqrt((M * w) / Math.max(h, 1) / 3))), rows = Math.ceil(M / cols);
  const cw = w / cols, ch = h / rows;
  const span = Math.max(c.reach, 0.6) * 1.25;
  const ink = css('--text'), muted = css('--muted'), acc = css('--accent'), acc2 = css('--accent-2'), grid = css('--grid');
  ctx.font = '10px system-ui, sans-serif';
  list.forEach((x, i) => {
    const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch;
    const k = Math.min((cw * 0.42) / span, (ch * 0.3) / Math.max(span * 0.4, 0.5));
    const X = (z) => ox + cw / 2 + z * k, Y = (r) => oy + ch * 0.58 - r * k;
    ctx.strokeStyle = grid; ctx.strokeRect(ox + 1, oy + 1, cw - 2, ch - 2);
    // its loudness: a bar along the bottom, 60 dB long
    const lv = Math.max(0, 1 + dB(x.rel) / 60);
    ctx.fillStyle = x.axial ? acc : acc2; ctx.globalAlpha = 0.5;
    ctx.fillRect(ox + 3, oy + ch - 5, (cw - 6) * lv, 3); ctx.globalAlpha = 1;
    // the ions, displaced along the mode, swinging at a slowed rate that keeps the ratios
    const ph = Math.sin((t / 1000) * 2 * Math.PI * 0.35 * x.ratio), amp = 0.35 * Math.max(c.spacing, 0.6);
    for (let j = 0; j < c.N; j++) {
      const dz = c.B[2 * j + 1][x.m] * amp * ph, dxr = c.B[2 * j][x.m] * amp * ph;
      ctx.fillStyle = lv > 0 ? acc : muted;
      ctx.beginPath(); ctx.arc(X(c.z[j] + dz), Y(c.x[j] + dxr), Math.max(1.5, Math.min(4, cw / 40)), 0, 2 * Math.PI); ctx.fill();
    }
    ctx.fillStyle = lv > 0 ? ink : muted; ctx.textAlign = 'left';
    ctx.fillText(`×${x.ratio.toFixed(3)}`, ox + 4, oy + 12);
    if (ch > 40 && cw > 90) { ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.fillText(x.axial ? 'along' : 'across', ox + cw - 4, oy + 12); }
  });
}, $('#modes'));

update();
