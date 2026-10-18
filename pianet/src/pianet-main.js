// pianet-main.js — the page: wires the shell to the engine and draws the views.
// The slow-motion view and the release plot rerun the key's mechanism
// offline (the same Pluck the engine plays), with the engine's model: the
// same C++, built as WebAssembly.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './pianet-instrument.js';
import { wasmModel } from './pianet-wasm.js';

const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
const VELS = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
const SHOW = 4.5, HOLD = 1.0; // seconds of slow motion, then a pause
let focus = 60, focusVel = null, sim = null, curve = null, kr = null, shapes = null, t0 = 0, frame = 0, lastRelease = null, dirty = true;

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key, vel) => { focus = key; focusVel = vel; dirty = true; },
  onMessage: (m) => { if (m.type === 'release' && m.key === focus) lastRelease = m; },
  onParam: (id) => { if (id === 'velocity') focusVel = null; dirty = true; },
});

const vel = () => focusVel ?? shell.P.velocity;
const mm = (x) => (x * 1e3).toFixed(x < 1e-4 ? 3 : 2);

function update() {
  dirty = false;
  const P = shell.P;
  kr = model.keyReed(focus, P);
  sim = model.simulatePluck(focus, P, vel(), { periods: 5, frames: 600 });
  curve = model.releaseCurve(focus, P, VELS);
  shapes = kr.modes.map((_, n) => Array.from({ length: 41 }, (__, j) => kr.shape(n, (j / 40) * kr.L)));
  t0 = performance.now();
  shell.keys.focus(focus);
  $('#focus-name').textContent = noteName(focus);

  // modes: frequency, sustain with the pad up / pad down, and size at the tip after a release
  const r = sim.rel, cp = P.padC, A1 = Math.abs(kr.modes[0].release * kr.modes[0].phiT);
  const lvl = kr.modes.map((md) => 20 * Math.log10(Math.abs(md.release * md.phiT) / A1 + 1e-12));
  spectrum.set(kr.f0, kr.modes.map((md, n) => ({ f: md.f, alpha: Math.max(0.15, Math.min(0.9, 0.9 + lvl[n] / 80)) })));
  $('#modes').innerHTML = '<tr><th>mode</th><th>f (Hz)</th><th>f / f₁</th><th>T60 held</th><th>T60 pad down</th><th>tip, after release</th></tr>'
    + kr.modes.map((md, n) => {
      const sd = md.sigma + 0.5 * cp * md.phiC * md.phiC; // the foam dashpot's modal damping
      const t = (x) => (x >= 1 ? `${x.toFixed(1)} s` : `${(x * 1e3).toFixed(0)} ms`);
      return `<tr><td>${n + 1}</td><td>${md.f.toFixed(1)}</td><td>${md.ratio.toFixed(2)}</td><td>${t(md.T60)}</td><td>${t(6.91 / sd)}</td><td>${n ? `${lvl[n].toFixed(0)} dB` : '0 dB'}</td></tr>`;
    }).join('');
  const es = P.pickup === 'es', v = model.voicing(focus), vT = model.voicingT(focus);
  const rows = [
    ['reed', `${(kr.L * 1e3).toFixed(1)} × ${(kr.b * 1e3).toFixed(1)} × ${(kr.h * 1e3).toFixed(2)} mm steel, ${(kr.Msolder * 1e3).toFixed(2)} g solder`],
    ['stiffness at pad', `${(kr.kc / 1e3).toFixed(2)} N/mm (pad at ${(kr.xc * 1e3).toFixed(1)} mm)`],
    ['key speed', `${(model.keySpeed(vel()) * 100).toFixed(1)} cm/s at the pad (velocity ${vel().toFixed(2)})`],
    ['release', r ? `${r.F.toFixed(2)} N at ${mm(r.y)} mm, ${(r.t * 1e3).toFixed(1)} ms after the key starts` : 'none: the bond holds'],
    ['bond', `F₀ = ${(P.tack * 1e3).toFixed(0)} mN → G₀ = ${model.workOfAdhesion(P.tack).toFixed(2)} J/m² over a ${(model.PAD.a0 * 1e3).toFixed(2)} mm disc`],
    ['pickup here', es ? `plate ${(P.plateGap * v).toFixed(2)} mm from the tip, edge ${(P.offset * v).toFixed(2)} mm up` : `pole ${(P.gap * vT).toFixed(2)} mm under the tip`],
  ];
  $('#info').innerHTML = rows.map(([k, x]) => `<dt>${k}</dt><dd>${x}</dd>`).join('');
}

// ---- slow motion: the reed, the pad, the bond, the pickup ---------------------------
function drawReed() {
  const { ctx, w, h } = fit($('#reed'));
  ctx.clearRect(0, 0, w, h);
  if (!sim) return;
  const N = sim.t.length, el = ((performance.now() - t0) / 1000) % (SHOW + HOLD);
  const i = (frame = Math.min(N - 1, Math.floor((Math.min(1, el / SHOW)) * (N - 1))));
  const P = shell.P, es = P.pickup === 'es', v = model.voicing(focus), g = es ? P.plateGap * 1e-3 * v : P.gap * 1e-3 * model.voicingT(focus), ye = P.offset * 1e-3 * v;
  const hm = 0.68 * h, yr = 0.5 * hm, xa = 0.1 * w, xb = 0.78 * w, X = (x) => xa + (x / kr.L) * (xb - xa);
  let ymax = 0.3 * g;
  for (let j = 0; j < N; j++) ymax = Math.max(ymax, Math.abs(sim.y[j]), Math.abs(sim.yc[j]));
  const s = (0.32 * hm) / ymax, Y = (y) => yr - s * y;
  const rel = sim.rel, iRel = rel ? sim.t.findIndex((t) => t >= rel.t) : N;
  ctx.font = '10px system-ui, sans-serif';

  // rest line and clamp
  ctx.strokeStyle = css('--grid'); ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(xa, yr); ctx.lineTo(w - 8, yr); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#3a3a44'; ctx.fillRect(xa - 26, yr - 22, 26, 44);
  // pickup
  ctx.fillStyle = css('--muted');
  if (es) {
    const px = xb + 14, ey = Y(ye);
    ctx.fillStyle = css('--accent-2'); ctx.globalAlpha = 0.8; ctx.fillRect(px, Math.min(ey, hm) - 0.32 * hm, 5, 0.32 * hm); ctx.globalAlpha = 1;
    ctx.fillStyle = css('--muted'); ctx.fillText('plate, +300 V', px + 9, Math.max(12, ey - 0.25 * hm));
    ctx.strokeStyle = css('--accent-2'); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(px - 8, ey); ctx.lineTo(px + 30, ey); ctx.stroke(); ctx.setLineDash([]);
  } else {
    const top = Y(-g), pw = 0.09 * (xb - xa);
    ctx.fillStyle = '#6b6f7a'; ctx.fillRect(xb - pw / 2, top, pw, Math.max(4, hm - top));
    ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) { const yy = top + 8 + k * 4; if (yy > hm) break; ctx.beginPath(); ctx.moveTo(xb - pw / 2 - 4, yy); ctx.lineTo(xb + pw / 2 + 4, yy); ctx.stroke(); }
    ctx.fillStyle = css('--muted'); ctx.fillText('magnet pole + coil', xb + pw / 2 + 8, Math.min(hm - 4, top + 12));
  }
  // the reed: Σ φ_n(x) q_n, and the solder lump
  const q = sim.q[i], shapeY = (j) => { let y = 0; for (let n = 0; n < shapes.length; n++) y += shapes[n][j] * q[n]; return y; };
  ctx.strokeStyle = css('--steel'); ctx.lineWidth = 3; ctx.beginPath();
  for (let j = 0; j <= 40; j++) { const xx = X((j / 40) * kr.L), yy = Y(shapeY(j)); if (j) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
  ctx.stroke(); ctx.lineWidth = 1;
  const yt = Y(shapeY(40)), bw = 0.12 * (xb - xa);
  ctx.fillStyle = css('--solder'); ctx.fillRect(xb - bw, yt - 5, bw, 8);
  // the pad: holder, foam, face, and the bond (its width is the bonded radius)
  const xc = X(kr.xc), pw = 0.11 * (xb - xa), face = Y(sim.face[i]) - 2, hold = Math.max(10, Y(sim.h[i]) - 2 - 0.12 * hm);
  ctx.strokeStyle = '#55555f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(xc, 0); ctx.lineTo(xc, hold); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = '#55555f'; ctx.fillRect(xc - pw / 2 - 3, hold - 4, pw + 6, 5);
  ctx.fillStyle = css('--foam'); ctx.globalAlpha = 0.75; ctx.fillRect(xc - pw / 2, hold + 1, pw, Math.max(2, face - hold - 1)); ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  for (let k = 1; k < 4; k++) { const yy = hold + ((face - hold) * k) / 4; ctx.beginPath(); ctx.moveTo(xc - pw / 2, yy); ctx.lineTo(xc + pw / 2, yy); ctx.stroke(); }
  ctx.fillStyle = '#2a2018'; ctx.fillRect(xc - pw / 2, face - 1, pw, 3);
  const a = sim.a[i];
  if (a > model.PAD.aMin) { ctx.fillStyle = css('--bond'); ctx.fillRect(xc - (a * pw) / 2, face + 1, a * pw, 3); }
  ctx.fillStyle = css('--muted'); ctx.fillText('pad (foam + tacky face)', xc + pw / 2 + 6, Math.max(12, hold + 10));

  // phase readout
  const t = sim.t[i], slow = sim.tEnd / SHOW; // real seconds per shown second
  let ph;
  if (!rel || i < iRel) ph = a > 0.98 ? 'stuck: the pad drags the reed' : `peeling: bond ${(a * 100).toFixed(0)} % of its radius`;
  else ph = 'free: the reed rings';
  $('#phase').textContent = `${ph} · t = ${(t * 1e3).toFixed(1)} ms · slowed ×${(1 / slow).toFixed(0)}`;

  // traces: pad force and tip height, with the release marked
  const ty = 0.74 * h, th = h - ty - 4, rowH = th / 2;
  const trace = (arr, y0, col, label) => {
    let m = 1e-12; for (const x of arr) m = Math.max(m, Math.abs(x));
    ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(xa, y0 + rowH / 2); ctx.lineTo(w - 8, y0 + rowH / 2); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let j = 0; j < N; j++) { const xx = xa + (j / (N - 1)) * (w - 8 - xa), yy = y0 + rowH / 2 - (0.45 * rowH * arr[j]) / m; if (j) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
    ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = css('--muted'); ctx.fillText(label, 4, y0 + rowH / 2 + 3);
  };
  trace(sim.F, ty, css('--bond'), 'pad force');
  trace(sim.y, ty + rowH, css('--accent'), 'tip');
  const cx = xa + (i / (N - 1)) * (w - 8 - xa);
  ctx.strokeStyle = css('--text'); ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(cx, ty); ctx.lineTo(cx, h - 4); ctx.stroke(); ctx.globalAlpha = 1;
  if (rel && iRel < N) { const rx = xa + (iRel / (N - 1)) * (w - 8 - xa); ctx.strokeStyle = css('--bond'); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(rx, ty); ctx.lineTo(rx, h - 4); ctx.stroke(); ctx.setLineDash([]); }
}

// ---- force vs deflection: the spring line, the tack, the release points ---------------
function drawForce() {
  const { ctx, w, h } = fit($('#force'));
  ctx.clearRect(0, 0, w, h);
  if (!sim || !curve) return;
  const P = shell.P, padL = 40, padR = 10, padT = 10, padB = 30;
  const iRel = sim.rel ? sim.t.findIndex((t) => t >= sim.rel.t) : sim.t.length;
  let xm = 1e-9, fm = P.tack;
  for (const c of curve) { xm = Math.max(xm, c.y); fm = Math.max(fm, c.F); }
  for (let j = 0; j < iRel; j++) { xm = Math.max(xm, sim.yc[j]); fm = Math.max(fm, sim.F[j]); }
  xm *= 1.15; fm *= 1.15;
  const X = (y) => padL + ((w - padL - padR) * y) / xm, Y = (F) => h - padB - ((h - padB - padT) * F) / fm;
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted');
  ctx.textAlign = 'center';
  for (let k = 0; k <= 4; k++) { const y = (k * xm) / 4; ctx.beginPath(); ctx.moveTo(X(y), padT); ctx.lineTo(X(y), h - padB); ctx.stroke(); ctx.fillText(mm(y), X(y), h - padB + 12); }
  ctx.fillText('deflection at the pad (mm)', (padL + w - padR) / 2, h - 4);
  ctx.textAlign = 'right';
  for (let k = 0; k <= 4; k++) { const F = (k * fm) / 4; ctx.beginPath(); ctx.moveTo(padL, Y(F)); ctx.lineTo(w - padR, Y(F)); ctx.stroke(); ctx.fillText(F.toFixed(2), padL - 4, Y(F) + 3); }
  ctx.save(); ctx.translate(10, (padT + h - padB) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('force (N)', 0, 0); ctx.restore();
  ctx.textAlign = 'left';
  // the reed's spring, F = k_c y, and the static tack
  ctx.strokeStyle = css('--steel'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(xm), Y(kr.kc * xm)); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--steel'); ctx.fillText(`reed: ${(kr.kc / 1e3).toFixed(2)} N/mm`, X(Math.min(xm * 0.55, fm / kr.kc * 0.9)) + 6, Y(kr.kc * Math.min(xm * 0.55, fm / kr.kc * 0.9)) + 12);
  ctx.strokeStyle = css('--bond'); ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(padL, Y(P.tack)); ctx.lineTo(w - padR, Y(P.tack)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = css('--bond'); ctx.fillText('static tack F₀', w - padR - 74, Y(P.tack) - 4);
  // this note's drag, as it happens
  ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 1.5; ctx.beginPath();
  for (let j = 0; j < iRel; j++) { if (j) ctx.lineTo(X(sim.yc[j]), Y(sim.F[j])); else ctx.moveTo(X(sim.yc[j]), Y(sim.F[j])); }
  ctx.stroke(); ctx.lineWidth = 1;
  if (frame < iRel) { ctx.fillStyle = css('--accent-2'); ctx.beginPath(); ctx.arc(X(sim.yc[frame]), Y(sim.F[frame]), 4, 0, 2 * Math.PI); ctx.fill(); }
  // release points, slow keys (dim) to fast (bright)
  curve.forEach((c, k) => {
    if (c.stuck) return;
    ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.3 + (0.7 * k) / (curve.length - 1);
    ctx.beginPath(); ctx.arc(X(c.y), Y(c.F), 3.5, 0, 2 * Math.PI); ctx.fill();
  });
  ctx.globalAlpha = 1; ctx.fillStyle = css('--muted');
  const c0 = curve[0], c1 = curve[curve.length - 1];
  if (!c0.stuck) ctx.fillText(`${(c0.V * 100).toFixed(0)} cm/s`, X(c0.y) + 6, Y(c0.F) + 12);
  if (!c1.stuck) ctx.fillText(`${(c1.V * 100).toFixed(0)} cm/s`, X(c1.y) + 6, Y(c1.F) - 6);
  if (sim.rel) { ctx.strokeStyle = css('--text'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(sim.rel.y), Y(sim.rel.F), 7, 0, 2 * Math.PI); ctx.stroke(); ctx.lineWidth = 1; }
  if (lastRelease && lastRelease.key === focus) { // the last release the engine actually played
    ctx.strokeStyle = css('--accent'); const x = X(lastRelease.y), y = Y(lastRelease.F);
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.stroke();
  }
}

const shown = (cv) => cv.offsetParent !== null; // views can be hidden from the Views menu
animate(() => { if (dirty) update(); if (shown($('#reed'))) drawReed(); if (shown($('#force'))) drawForce(); });
