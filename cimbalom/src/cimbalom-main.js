// cimbalom-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { TUNING_KEEP } from '../../shared/tuning.js';
import { INSTRUMENT } from './cimbalom-instrument.js';
import { wasmModel } from './cimbalom-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const M = await wasmModel();

const $ = (s) => document.querySelector(s);
const HEAD = '#e8e2d0';
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 60, course = null, state = null, decay = [], forceSeq = -1, force = null;

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { if (key !== focus) decay = []; focus = key; update(); },
  onParam: (id) => { if (['build', 'detune', 'bridge', 'loss', 'strike', '*', ...TUNING_KEEP].includes(id)) update(); },
  onPanic: () => { decay = []; },
  onMessage: (m) => {
    if (m.type !== 'state') return;
    state = m;
    if (m.key === focus) {
      const t = performance.now() / 1000;
      decay.push([t, m.level]);
      while (decay.length && decay[0][0] < t - 8) decay.shift();
    }
    if (m.forceSeq !== forceSeq && m.forceN > 0) { forceSeq = m.forceSeq; force = { dt: m.forceDt, f: m.force.slice(0, m.forceN), on: m.onTime, n: m.contacts, peak: m.peakF }; read(); }
  },
});

const len = (L) => (L >= 1 ? `${L.toFixed(2)} m` : `${(L * 100).toFixed(L < 0.1 ? 1 : 0)} cm`);
const SIDE = { whole: '', right: ' · the right of the treble bridge (its left a fifth above)', left: ' · the left of the treble bridge (its right a fifth below)' };

// The focused key's course and the spectrum's markers: the struck side's partials and the far side's.
function update() {
  const P = shell.P;
  course = M.course(focus, P);
  const near = M.partials(focus, P, { fmax: 20000, nmax: 48 }), far = course.Lfar > 0 ? M.partials(focus, P, { far: true, fmax: 20000, nmax: 32 }) : [];
  spectrum.set(course.f0, [
    ...near.map((p, i) => ({ f: p.f, alpha: 0.25 + 0.6 * Math.exp(-i / 10) })),
    ...far.map((p, i) => ({ f: p.f, color: css('--accent-2'), alpha: 0.2 + 0.5 * Math.exp(-i / 8) })),
  ]);
  $('#course-key').textContent = noteName(focus);
  const wire = course.wound ? 'copper-wound' : 'steel';
  $('#course-read').textContent = `${course.strings} ${wire} strings · ${len(course.L)} struck · ${course.T.toFixed(0)} N each${SIDE[course.side]}`;
  read();
}

function read() {
  if (force) $('#contact-read').textContent = `${(force.on * 1000).toFixed(2)} ms on the strings · ${force.n} ${force.n === 1 ? 'contact' : 'contacts'} · up to ${force.peak.toFixed(1)} N`;
}

// ---- view 1: one string of the course, its far side, the hammer and the dampers -----------------
const scv = $('#strings');
let ampScale = 1e-3;
animate(() => {
  const { ctx, w, h } = fit(scv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  if (!course) return;
  const s = state && state.key === focus && state.shaped ? state : null;
  const L = course.L, Lf = course.Lfar, total = L + Lf;
  const x0 = 16, x1 = w - 16, sx = (x1 - x0) / total, yc = h * 0.55;
  // the struck side runs from the bridge it is nearer (X = 0) away from it: on the right of the
  // dulcimer's treble bridge it runs right; on its left, or a whole string, it runs left
  const leftward = course.side !== 'right';
  const bridgeX = leftward ? x0 + L * sx : x0 + Lf * sx;
  const X = (u) => (leftward ? bridgeX - u * sx : bridgeX + u * sx);      // struck side, u from the bridge
  const Xf = (u) => (leftward ? bridgeX + u * sx : bridgeX - u * sx);     // far side
  const ends = [X(L), bridgeX, ...(Lf > 0 ? [Xf(Lf)] : [])];
  // the amplitude scale follows the loudest swing, slowly
  let mx = 0;
  if (s) { for (const a of s.a) mx += Math.abs(a); for (const b of s.b) mx += Math.abs(b); }
  ampScale = Math.max(mx, ampScale * 0.995, 1e-4);
  const sy = (0.32 * h) / ampScale;
  // the damper bar under the course
  ctx.fillStyle = s && s.damped ? 'rgba(220, 80, 70, 0.55)' : 'rgba(255,255,255,0.08)';
  ctx.fillRect(Math.min(X(L * 0.62), X(L * 0.78)), yc + 10, Math.abs(X(L * 0.78) - X(L * 0.62)), 6);
  // the string, at rest and moving
  ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(Math.min(...ends), yc); ctx.lineTo(Math.max(...ends), yc); ctx.stroke();
  const draw = (amps, len, Xof, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const u = (i / 160) * len;
      let y = 0;
      if (amps) for (let n = 0; n < amps.length; n++) y += amps[n] * Math.sin(((n + 1) * Math.PI * u) / len);
      const xx = Xof(u), yy = yc + y * sy;
      if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
    }
    ctx.stroke(); ctx.lineWidth = 1;
  };
  if (Lf > 0) draw(s ? s.b : null, Lf, Xf, css('--accent-2'));
  draw(s ? s.a : null, L, X, css('--accent'));
  // the bridges: the struck side's, and the other ends
  ctx.fillStyle = css('--text');
  for (const e of ends) { ctx.beginPath(); ctx.moveTo(e - 5, yc + 9); ctx.lineTo(e + 5, yc + 9); ctx.lineTo(e, yc + 1); ctx.closePath(); ctx.fill(); }
  // the hammer's head, over the strike point
  const xh = s ? s.xh : shell.P.strike * L;
  let y0 = 0;
  if (s) for (let n = 0; n < s.a.length; n++) y0 += s.a[n] * Math.sin(((n + 1) * Math.PI * xh) / L);
  const gap = s && s.gap >= 0 ? s.gap : 3; // mm above the strings
  const hy = Math.max(10, yc + y0 * sy - 7 - Math.min(gap * 6, 0.35 * h));
  ctx.fillStyle = HEAD; ctx.beginPath(); ctx.ellipse(X(xh), hy, 9, 6, 0, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = HEAD; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(xh), hy - 5); ctx.lineTo(X(xh) + (leftward ? 40 : -40), hy - 30); ctx.stroke(); ctx.lineWidth = 1;
  // labels
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  ctx.fillText(`${course.f0.toFixed(1)} Hz`, (X(0) + X(L)) / 2, h - 6);
  if (Lf > 0) ctx.fillText(`${course.ffar.toFixed(1)} Hz`, (Xf(0) + Xf(Lf)) / 2, h - 6);
  ctx.textAlign = 'left';
  ctx.fillText(`swing × ${Math.round(sy / 1000 / sx) || 1}`, x0, 12);
}, scv);

// ---- view 2: the decay of the focused key ------------------------------------------------------
const dcv = $('#decay');
animate(() => {
  const { ctx, w, h } = fit(dcv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  const padL = 30, padB = 16, top = 30, range = 120, now = performance.now() / 1000;
  const X = (t) => padL + ((w - padL - 6) * (t - (now - 8))) / 8, Y = (d) => 6 + ((h - 6 - padB) * (top - d)) / range;
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  for (let d = top; d >= top - range; d -= 30) { ctx.beginPath(); ctx.moveTo(padL, Y(d)); ctx.lineTo(w - 6, Y(d)); ctx.stroke(); ctx.fillText(`${d}`, padL - 4, Y(d) + 3); }
  ctx.textAlign = 'center';
  for (let s = 2; s <= 8; s += 2) ctx.fillText(`−${s} s`, X(now - s), h - 4);
  ctx.textAlign = 'right'; ctx.fillText('now', w - 6, h - 4);
  if (decay.length < 2) return;
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5; ctx.beginPath();
  decay.forEach(([t, d], i) => { const yy = Y(Math.max(top - range, Math.min(top, d))); if (i) ctx.lineTo(X(t), yy); else ctx.moveTo(X(t), yy); });
  ctx.stroke(); ctx.lineWidth = 1;
  $('#decay-read').textContent = `${noteName(focus)} · ${decay[decay.length - 1][1] > -150 ? `${decay[decay.length - 1][1].toFixed(0)} dB re 1 N` : 'silent'}`;
}, dcv);

// ---- view 3: the last stroke's force --------------------------------------------------------------
const ccv = $('#contact');
animate(() => {
  const { ctx, w, h } = fit(ccv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  const padL = 34, padB = 16;
  ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(padL, h - padB); ctx.lineTo(w - 6, h - padB); ctx.stroke();
  if (!force) { ctx.fillStyle = css('--muted'); ctx.textAlign = 'center'; ctx.fillText('play a key to see its hammer stroke', w / 2, h / 2); return; }
  const n = force.f.length, T = n * force.dt, pk = Math.max(1e-6, ...force.f);
  const X = (t) => padL + ((w - padL - 6) * t) / T, Y = (f) => h - padB - ((h - padB - 8) * f) / pk;
  ctx.fillStyle = 'rgba(224, 149, 90, 0.25)'; ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(X(0), Y(0));
  for (let i = 0; i < n; i++) ctx.lineTo(X((i + 0.5) * force.dt), Y(force.f[i]));
  ctx.lineTo(X(T), Y(0)); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'right'; ctx.fillText(`${pk.toFixed(1)} N`, padL - 4, Y(pk) + 3); ctx.fillText('0', padL - 4, Y(0) + 3);
  ctx.textAlign = 'center';
  // as many labels as fit, about 48 px apart, none past the edge
  const room = Math.max(2, Math.floor((w - padL) / 48)), step = [0.0002, 0.0005, 0.001, 0.002, 0.005].find((s) => T / s <= room) ?? 0.01;
  for (let t = 0; t <= T + 1e-9; t += step) if (X(t) + 20 <= w) ctx.fillText(`${(t * 1000).toFixed(step < 0.001 ? 1 : 0)} ms`, X(t), h - 4);
}, ccv);

update();
